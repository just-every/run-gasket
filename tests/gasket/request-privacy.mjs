// Rider assertions use the same built Worker HTTP doors as the intake journey.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { crc32 } from 'node:zlib'
import { file } from './harness.mjs'
import { png } from './fixtures.mjs'

function pngMetadata() {
  const data=Buffer.from('Exif\0\0GPS synthetic-gasket-1'),type=Buffer.from('eXIf'),head=Buffer.alloc(4),crc=Buffer.alloc(4)
  head.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])))
  return Buffer.concat([png.subarray(0,33),head,type,data,crc,png.subarray(33)])
}
export async function photoPrivacy(f,jpeg) {
  const {h,cookie,fields,asset,payload}=f
  const portal=(await h.api('request.portal',cookie.owner,{name:'Photo privacy intake',fields})).id
  const target=(await h.api('request.target',cookie.owner,{portal,kind:'asset',asset,name:'Published pump',publishConsent:true})).id
  const response=await h.raw(`/request/${portal}`,{cookie:cookie.tech,body:{...payload,target,submissionKey:randomUUID(),description:'Photo privacy synthetic-gasket-1',photo:file('camera.bin',pngMetadata(),'application/octet-stream')}})
  assert.equal(response.status,303,await response.text())
  const row=(await h.api('requests',cookie.lead)).find(r=>r.description==='Photo privacy synthetic-gasket-1')
  const r=await h.api(`requests/${row.id}`,cookie.lead),photo=r.files.find(f=>f.filename==='camera.bin')
  const download=await h.raw(`/app/request-files/${photo.id}`,{cookie:cookie.tech})
  assert.equal(download.headers.get('content-type'),'image/png','content, rather than extension, selects type')
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),png,'EXIF and GPS chunk removed without changing pixels')
  for(const bytes of [png.subarray(0,24),Buffer.concat([png,Buffer.from('hidden trailing data')])]) {
    const bad=await h.raw(`/request/${portal}`,{cookie:cookie.tech,body:{...payload,target,submissionKey:randomUUID(),photo:file('forged.png',bytes,'image/png')}})
    assert.equal(bad.status,400)
  }
  const metadata=Buffer.from('Exif\0\0GPS synthetic-gasket-2'),length=Buffer.alloc(2)
  length.writeUInt16BE(metadata.length+2)
  const withExif=Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,225]),length,metadata,jpeg.subarray(2)])
  const accepted=await h.raw(`/request/${portal}`,{cookie:cookie.tech,body:{...payload,target,submissionKey:randomUUID(),description:'JPEG privacy synthetic-gasket-2',photo:file('camera.png',withExif,'image/png')}})
  assert.equal(accepted.status,303,await accepted.text())
  const jpegRow=(await h.api('requests',cookie.lead)).find(r=>r.description==='JPEG privacy synthetic-gasket-2')
  const jpegFile=(await h.api(`requests/${jpegRow.id}`,cookie.lead)).files.find(f=>f.filename==='camera.png')
  const jpegDownload=await h.raw(`/app/request-files/${jpegFile.id}`,{cookie:cookie.tech})
  assert.equal(jpegDownload.headers.get('content-type'),'image/jpeg')
  const cleanJpeg=Buffer.from(await jpegDownload.arrayBuffer())
  assert.ok(!cleanJpeg.includes(metadata),'JPEG EXIF and GPS removed')
  assert.ok(cleanJpeg.length>0)
  // More than five real configured photos are refused through the submit door.
  const photos=Array.from({length:5},(_,i)=>({key:`image${i}`,label:`Evidence ${i}`,type:'photo',required:false}))
  await h.api('request.portal',cookie.owner,{portal,revision:1,name:'Photo privacy intake',fields:photos})
  const extra=Object.fromEntries(photos.map(p=>[`field_${p.key}`,file('evidence.png',png,'image/png')]))
  const tooMany=await h.raw(`/request/${portal}`,{cookie:cookie.tech,body:{...payload,target,submissionKey:randomUUID(),...extra}})
  assert.equal(tooMany.status,400);assert.match(await tooMany.text(),/too many photos/)
}
export async function installationLimit(f) {
  const {h,cookie,asset,payload}=f
  // Distinct portals exercise the installation ceiling independently of the
  // per-network ceiling. No direct storage writes or privileged test bypass.
  let lastPortal,lastTarget
  for(let i=0;i<20;i++) {
    const portal=(await h.api('request.portal',cookie.owner,{name:`Intake ${i}`,mode:'public',publicConsent:true})).id
    const target=(await h.api('request.target',cookie.owner,{portal,kind:'asset',asset,name:'Published pump',publishConsent:true})).id
    lastPortal=portal;lastTarget=target
    for(let j=0;j<5;j++) {
      const r=await h.raw(`/request/${portal}`,{body:{...payload,target,submissionKey:randomUUID(),photo:undefined,field_nameplate:undefined}})
      if(r.status===429) {
        assert.match(await r.text(),/intake rate limited/)
        const rows=await h.api('requests',cookie.lead);assert.equal(rows.length,100)
        const log=(await h.api('audit?action=request.limit',cookie.owner)).rows
        assert.ok(log.length>0)
        for(const entry of log) {
          assert.equal(entry.actor,'anonymous')
          assert.deepEqual(typeof entry.detail==='string'?JSON.parse(entry.detail):entry.detail,{code:'intake_rate_limited'})
          assert.ok(!JSON.stringify(entry).includes(payload.contact))
        }
        return
      }
      assert.equal(r.status,303,await r.text())
    }
  }
  const over=await h.raw(`/request/${lastPortal}`,{body:{...payload,target:lastTarget,submissionKey:randomUUID()}})
  assert.equal(over.status,429)
  assert.equal((await h.api('requests',cookie.lead)).length,100)
}
export async function erasePrivateRequest(f,id,workId) {
  const {h,cookie,payload}=f
  const record=await h.api(`requests/${id}`,cookie.lead),files=record.files.map(f=>f.id)
  const body={request:id,version:record.version,confirm:true}
  await h.api('request.erase',cookie.lead,body,403)
  await h.api('request.erase',cookie.owner,{...body,confirm:false},400)
  await h.api('request.erase',cookie.owner,{...body,version:record.version+1},409)
  await h.api('request.erase',cookie.owner,body)
  const erased=await h.api(`requests/${id}`,cookie.owner)
  assert.equal(erased.contact,'');assert.equal(erased.description,'');assert.equal(erased.requester_id,null)
  assert.deepEqual(erased.answers,{});assert.deepEqual(erased.files,[]);assert.deepEqual(erased.timeline,[])
  for(const fid of files)assert.equal((await h.raw(`/app/request-files/${fid}`,{cookie:cookie.owner})).status,404)
  const audit=(await h.api(`audit?action=request&limit=500`,cookie.owner)).rows.filter(r=>r.subject===id)
  assert.ok(audit.some(r=>r.action==='request.erase'))
  assert.ok(!JSON.stringify(audit).includes(payload.description));assert.ok(!JSON.stringify(audit).includes(payload.contact))
  if(workId) {
    const work=await h.api(`work/${workId}`,cookie.lead)
    assert.equal(work.description,null);assert.equal(work.title,'Erased operator fault')
    const source=work.requestSources.find(r=>r.id===id)
    assert.equal(source.description,'');assert.deepEqual(source.files,[])
  }
}
