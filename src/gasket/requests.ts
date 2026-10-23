// Opt-in operator intake. Anonymous traffic has no register/list/detail door.
import type { Bindings } from '../auth.server'
import { can, requireCapability, type Actor } from './actor'
import { all, commit, GasketError, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from './core'
import { isDate } from './dates'
import { imageSize } from './annotations'
import { Input } from './input'

export type RequestField = { key: string; label: string; type: 'text'|'choice'|'number'|'date'|'photo'; required: boolean; options?: string[] }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function triager(actor: Actor) { insist(can(actor,'work.assign'), 'forbidden',403) }
function fieldsOf(value: unknown): RequestField[] {
  insist(Array.isArray(value) && value.length <= 20,'invalid_request_fields')
  const keys = new Set<string>()
  return value.map(f => {
    insist(f && typeof f==='object' && /^[a-z][a-z0-9_]{0,39}$/.test(f.key) && !keys.has(f.key),'invalid_field_key')
    keys.add(f.key)
    insist(typeof f.label==='string' && f.label.trim().length>0 && f.label.length<=120,'invalid_field_label')
    insist(['text','choice','number','date','photo'].includes(f.type) && typeof f.required==='boolean','invalid_field_type')
    if(f.type==='choice') insist(Array.isArray(f.options) && f.options.length>=2 && f.options.length<=20 && f.options.every((s:unknown)=>typeof s==='string' && s.trim().length>0 && s.length<=100) && new Set(f.options).size===f.options.length,'invalid_field_options')
    return {key:f.key,label:f.label.trim(),type:f.type,required:f.required,...(f.type==='choice'?{options:f.options}: {})}
  })
}
export async function savePortal(env:Bindings,actor:Actor,input:Input) {
  requireCapability(actor,'site.manage')
  const id=input.text('portal',{optional:true,max:100}) || newId(), existing=await one(env,'SELECT * FROM gk_request_portals WHERE id=?',id)
  const name=input.text('name',{max:100}), mode=input.text('mode',{optional:true}) || 'authenticated', fields=fieldsOf(input.has('fields') ? input.json('fields') : existing ? JSON.parse(existing.fields_json) : [])
  insist(['authenticated','public'].includes(mode),'invalid_intake_mode')
  insist(mode!=='public' || input.flag('publicConsent'),'public_consent_required')
  const enabled=!input.flag('disabled')
  if(existing) insist(input.integer('revision',{min:1})===existing.revision,'stale',409)
  await commit(env,[...(existing?[guard(env,'stale','EXISTS(SELECT 1 FROM gk_request_portals WHERE id=? AND revision=?)',id,existing.revision)]:[]),
    stmt(env,`INSERT INTO gk_request_portals(id,name,mode,enabled,fields_json,created_by,created_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,mode=excluded.mode,enabled=excluded.enabled,fields_json=excluded.fields_json,revision=gk_request_portals.revision+1`,id,name,mode,enabled?1:0,JSON.stringify(fields),actor.id,now())],
    {actor:actor.id,action:'request.portal',subject:id,detail:{mode,enabled,fields,publicConsent:mode==='public'}})
  return {id}
}
export async function saveTarget(env:Bindings,actor:Actor,input:Input) {
  requireCapability(actor,'site.manage')
  const portal=await getPortal(env,input.text('portal')),kind=input.text('kind'),name=input.text('name',{max:160})
  insist(['asset','location','bin'].includes(kind),'invalid_target_kind')
  const asset=kind==='asset'?input.text('asset',{max:100}):null
  if(asset) insist(await one(env,'SELECT 1 FROM gk_assets WHERE id=? AND retired_at IS NULL',asset),'asset_not_found',404)
  insist(input.flag('publishConsent'),'label_consent_required')
  const id=newId()
  await commit(env,[stmt(env,'INSERT INTO gk_request_targets(id,portal_id,kind,asset_id,name,created_by,created_at) VALUES(?,?,?,?,?,?,?)',id,portal.id,kind,asset,name,actor.id,now())],
    {actor:actor.id,action:'request.target',subject:id,detail:{portal:portal.id,kind,asset,name,publishConsent:true}})
  return {id}
}
export async function getPortal(env:Bindings,id:string) {
  const row=await one(env,'SELECT * FROM gk_request_portals WHERE id=?',id)
  insist(row,'portal_not_found',404)
  return {...row,fields:JSON.parse(row.fields_json) as RequestField[]}
}
export async function portalSettings(env:Bindings,actor:Actor) {
  requireCapability(actor,'site.manage')
  return {portals:(await all(env,'SELECT * FROM gk_request_portals ORDER BY created_at,id')).map(p=>({...p,fields:JSON.parse(p.fields_json)})),targets:await all(env,`SELECT t.*,a.retired_at AS asset_retired FROM gk_request_targets t LEFT JOIN gk_assets a ON a.id=t.asset_id ORDER BY t.name`)}
}
export async function intake(env:Bindings,actor:Actor|null,id:string,targetId:string) {
  const portal=await getPortal(env,id)
  insist(portal.enabled,'portal_closed',404)
  insist(actor?.role!=='agent','forbidden',403)
  insist(actor || portal.mode==='public','authentication_required',401)
  const target=await one(env,`SELECT t.id,t.kind,t.name,t.asset_id,t.retired_at,a.retired_at AS asset_retired FROM gk_request_targets t LEFT JOIN gk_assets a ON a.id=t.asset_id WHERE t.id=? AND t.portal_id=?`,targetId,id)
  insist(target,'label_unknown',404)
  insist(!target.retired_at && !target.asset_retired,'label_retired',410)
  return {portal,target}
}
export async function requestQueue(env:Bindings,actor:Actor,url:URL) {
  triager(actor)
  const status=url.searchParams.get('status') || '', urgency=url.searchParams.get('urgency') || '', criticality=url.searchParams.get('criticality') || '', target=url.searchParams.get('target') || ''
  return await all(env,`SELECT r.id,r.number,r.status,r.urgency,r.description,r.created_at,r.version,r.asset_id,r.location,a.criticality,t.name AS target,p.name AS portal,
    r.duplicate_of,r.work_order_id FROM gk_requests r JOIN gk_request_targets t ON t.id=r.target_id JOIN gk_request_portals p ON p.id=r.portal_id LEFT JOIN gk_assets a ON a.id=r.asset_id
    WHERE (?='' OR r.status=?) AND (?='' OR r.urgency=?) AND (?='' OR a.criticality=?) AND (?='' OR r.target_id=?)
    ORDER BY CASE r.urgency WHEN 'emergency' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,r.created_at,r.number`,status,status,urgency,urgency,criticality,criticality,target,target)
}
export async function requestDetail(env:Bindings,actor:Actor,id:string) {
  const row=await one(env,`SELECT r.*,t.name AS target,a.criticality FROM gk_requests r JOIN gk_request_targets t ON t.id=r.target_id LEFT JOIN gk_assets a ON a.id=r.asset_id WHERE r.id=?`,id)
  insist(row,'request_not_found',404)
  insist(can(actor,'work.assign') || row.requester_id===actor.id,'forbidden',403)
  const {submission_key:_,fingerprint:__,...safe}=row
  return {...safe,answers:JSON.parse(row.answers_json),form:JSON.parse(row.form_json),
    files:await all(env,'SELECT id,field_key,filename,media_type,size,sha256 FROM gk_request_files WHERE request_id=? ORDER BY id',id),
    timeline:await all(env,'SELECT e.kind,e.text,e.at,m.name AS actor FROM gk_request_events e LEFT JOIN gk_members m ON m.id=e.actor WHERE request_id=? ORDER BY seq',id),
    linked:can(actor,'work.assign')?await all(env,'SELECT id,number,status,work_order_id FROM gk_requests WHERE duplicate_of=? OR id=?',row.duplicate_of || row.id,row.duplicate_of || row.id):[]}
}
async function photo(input:Input,name:string,optional:boolean) {
  const file=await input.file(name,{optional,maxBytes:1_500_000})
  if(!file) return null
  const ext=file.filename.split('.').pop()?.toLowerCase(),type=ext==='png'?'image/png':ext==='jpg'||ext==='jpeg'?'image/jpeg':null
  insist(type && imageSize(file.bytes,type),'invalid_photo')
  return {id:newId(),field:name==='photo'?null:name.slice(6),filename:file.filename,mediaType:type,sha256:await sha256Hex(file.bytes),bytes:file.bytes}
}
export async function submitRequest(env:Bindings,actor:Actor|null,portalId:string,input:Input,request:Request) {
  const {portal,target}=await intake(env,actor,portalId,input.text('target',{max:100}))
  const key=input.text('submissionKey',{max:100});insist(UUID.test(key),'invalid_submission_key')
  const keyHash=await sha256Hex(key), description=input.text('description',{max:2000}),contact=input.text('contact',{max:200})
  const urgency=input.text('urgency');insist(['normal','high','emergency'].includes(urgency),'invalid_urgency')
  insist(!input.text('website',{optional:true,max:500}),'intake_refused',429)
  const fields=portal.fields, answers:Record<string,string>={}, files=[]
  const main=await photo(input,'photo',true);if(main) files.push(main)
  for(const f of fields) {
    if(f.type==='photo') {const file=await photo(input,`field_${f.key}`,!f.required);if(file) files.push(file);continue}
    const value=input.text(`field_${f.key}`,{optional:!f.required,max:f.type==='text'?1000:100})
    if(value) {
      if(f.type==='choice') insist(f.options!.includes(value),'invalid_field_choice')
      if(f.type==='date') insist(isDate(value),'invalid_field_date')
      if(f.type==='number') insist(/^-?\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value)),'invalid_field_number')
      answers[f.key]=value
    }
  }
  insist(files.length<=5,'too_many_photos')
  const fingerprint=await sha256Hex(JSON.stringify({target:target.id,description,contact,urgency,answers,files:files.map(f=>[f.field,f.filename,f.sha256]),requester:actor?.id??null}))
  const prior=await one(env,'SELECT id,number,fingerprint FROM gk_requests WHERE portal_id=? AND submission_key=?',portalId,keyHash)
  const receipt=(row:Row)=>({id:row.id,number:row.number,receipt:`/request/${portalId}/received/${key}`})
  if(prior) {insist(prior.fingerprint===fingerprint,'submission_key_reused',409);return receipt(prior)}
  const id=newId(),bucket=Math.floor(now()/3_600_000),network=await sha256Hex(`${env.SESSION_SECRET}:${request.headers.get('cf-connecting-ip') || 'unknown'}:${bucket}`)
  const networkBucket=`${portalId}:${bucket}:${network}`,siteBucket=`site:${bucket}`
  const statements=[
    stmt(env,'INSERT INTO gk_request_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1',networkBucket),
    stmt(env,'INSERT INTO gk_request_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1',siteBucket),
    guard(env,'intake_rate_limited','(SELECT count FROM gk_request_limits WHERE bucket=?)<=5 AND (SELECT count FROM gk_request_limits WHERE bucket=?)<=100',networkBucket,siteBucket),
    stmt(env,'DELETE FROM gk_request_limits WHERE bucket NOT LIKE ? AND bucket NOT LIKE ?',`%:${bucket}:%`,`site:${bucket}`),
    guard(env,'portal_changed','EXISTS(SELECT 1 FROM gk_request_portals WHERE id=? AND revision=? AND enabled=1)',portalId,portal.revision),
    guard(env,'label_retired',`EXISTS(SELECT 1 FROM gk_request_targets t LEFT JOIN gk_assets a ON a.id=t.asset_id WHERE t.id=? AND t.retired_at IS NULL AND a.retired_at IS NULL)`,target.id),
    stmt(env,`INSERT INTO gk_requests(id,number,portal_id,target_id,asset_id,location,description,urgency,contact,requester_id,answers_json,form_json,submission_key,fingerprint,created_at)
      VALUES(?,(SELECT COALESCE(MAX(number),0)+1 FROM gk_requests),?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,portalId,target.id,target.asset_id,target.kind==='asset'?null:target.name,description,urgency,contact,actor?.id??null,JSON.stringify(answers),JSON.stringify(fields),keyHash,fingerprint,now()),
    ...files.map(f=>stmt(env,'INSERT INTO gk_request_files(id,request_id,field_key,filename,media_type,size,sha256,bytes) VALUES(?,?,?,?,?,?,?,?)',f.id,id,f.field,f.filename,f.mediaType,f.bytes.length,f.sha256,f.bytes)),
    stmt(env,"INSERT INTO gk_request_events(request_id,kind,text,actor,at) VALUES(?,'submitted',?,?,?)",id,description,actor?.id??null,now()),
  ]
  try {
    await commit(env,statements,{actor:actor?.id??'anonymous',action:'request.submit',subject:id,detail:{portal:portalId,target:target.id,contactVerified:false,files:files.map(f=>({id:f.id,sha256:f.sha256}))}})
  } catch(error) {
    const raced=await one(env,'SELECT id,number,fingerprint FROM gk_requests WHERE portal_id=? AND submission_key=?',portalId,keyHash)
    if(raced) {insist(raced.fingerprint===fingerprint,'submission_key_reused',409);return receipt(raced)}
    if(error instanceof GasketError && error.code==='precondition_failed') throw new GasketError('intake_rate_limited',429)
    throw error
  }
  return receipt((await one(env,'SELECT id,number FROM gk_requests WHERE id=?',id))!)
}
export async function confirmation(env:Bindings,portal:string,key:string) {
  insist(UUID.test(key),'receipt_not_found',404)
  const row=await one(env,'SELECT number FROM gk_requests WHERE portal_id=? AND submission_key=?',portal,await sha256Hex(key))
  insist(row,'receipt_not_found',404)
  return row.number as number
}
export async function requestFile(env:Bindings,actor:Actor,id:string) {
  const file=await one(env,'SELECT * FROM gk_request_files WHERE id=?',id);insist(file,'file_not_found',404)
  await requestDetail(env,actor,file.request_id)
  return new Response(new Uint8Array(file.bytes),{headers:{'content-type':file.media_type,'content-disposition':`inline; filename="${file.filename.replace(/["\\]/g,'_')}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}})
}

export async function addRequestField(env:Bindings,actor:Actor,input:Input) {
  requireCapability(actor,'site.manage')
  const p=await getPortal(env,input.text('portal'))
  insist(input.integer('revision',{min:1})===p.revision,'stale',409)
  const type=input.text('type'),label=input.text('label',{max:120}),key='field_'+newId().replaceAll('-','').slice(0,12)
  const options=input.text('options',{optional:true,max:2000}).split('\n').map(s=>s.trim()).filter(Boolean)
  return savePortal(env,actor,Input.of({portal:p.id,name:p.name,revision:p.revision,mode:p.mode,disabled:!p.enabled,publicConsent:p.mode==='public',fields:[...p.fields,{key,label,type,required:input.flag('required'),...(type==='choice'?{options}:{})}]}))
}
