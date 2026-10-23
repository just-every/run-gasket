// A label is the existing opaque published target, so a reprint cannot mint a
// second identity. QR URLs and Code128 scanner codes both resolve at /scan.
import QRCode from 'qrcode'
import { toSVG } from '@bwip-js/generic'
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, insist, newId, now, one, sha256Hex, stmt } from './core'
import { createsWork } from './site'
import { createCorrective, doorOf } from './work'
import { imageSize } from './annotations'
import { Input } from './input'

export async function labelTarget(env:Bindings,id:string) {
  const target=await one(env,`SELECT t.*,a.retired_at AS asset_retired FROM gk_request_targets t LEFT JOIN gk_assets a ON a.id=t.asset_id WHERE t.id=?`,id)
  insist(target,'label_unknown',404)
  return {...target,retired:Boolean(target.retired_at || target.asset_retired)}
}
export async function printableLabels(env:Bindings,actor:Actor,url:URL) {
  requireCapability(actor,'register.manage')
  const selected=url.searchParams.get('target')
  const targets=await all(env,`SELECT t.*,a.retired_at AS asset_retired,p.name AS portal_name FROM gk_request_targets t JOIN gk_request_portals p ON p.id=t.portal_id LEFT JOIN gk_assets a ON a.id=t.asset_id WHERE (? IS NULL OR t.id=?) ORDER BY t.name`,selected,selected)
  insist(!selected || targets.length,'label_unknown',404)
  return await Promise.all(targets.map(async target=>({...target,retired:Boolean(target.retired_at || target.asset_retired),
    url:`${env.AUTH_ORIGIN}/scan/${target.id}`,
    qr:await QRCode.toString(`${env.AUTH_ORIGIN}/scan/${target.id}`,{type:'svg',errorCorrectionLevel:'M',margin:4}),
    barcode:toSVG({bcid:'code128',text:target.id,scale:2,height:12,paddingwidth:10,paddingheight:5,includetext:false}),
  })))
}
export async function createLabelWork(env:Bindings,actor:Actor,input:Input,request:Request) {
  insist(await createsWork(env,actor),'create_work_right_revoked',403)
  const target=await labelTarget(env,input.text('target'))
  insist(!target.retired,'label_retired',410)
  const file=await input.file('photo',{optional:true,maxBytes:1_500_000}),fileId=newId()
  let type:string|null=null,digest:string|null=null
  if(file) {type=file.filename.toLowerCase().endsWith('.png')?'image/png':/\.jpe?g$/i.test(file.filename)?'image/jpeg':null;insist(type && imageSize(file.bytes,type),'invalid_photo');digest=await sha256Hex(file.bytes)}
  // The scanned target always wins over a caller-supplied asset/location.
  const chosen:Record<string,unknown>={...Object.fromEntries(['title','description','priority','due','assignee','template'].map(k=>[k,input.text(k,{optional:true,max:k==='description'?2000:160})])),unassigned:input.flag('unassigned')}
  if(target.kind==='asset')chosen.asset=target.asset_id;else chosen.location=target.name
  return createCorrective(env,actor,Input.of(chosen),{door:doorOf(request),also:id=>file?[stmt(env,'INSERT INTO gk_evidence(id,work_order_id,filename,media_type,size,sha256,bytes,uploaded_by,uploaded_at,door) VALUES(?,?,?,?,?,?,?,?,?,?)',fileId,id,file.filename,type,file.bytes.length,digest,file.bytes,actor.id,now(),doorOf(request))]:[]})
}
