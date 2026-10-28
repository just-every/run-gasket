// Online human authority is checked independently of every opaque printed identifier.
import type { Bindings } from '../auth.server'
import { HUMAN_ROLES, humanSessionSql, capabilitySql, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from './core'
import { isLocalTime, localNow } from './dates'
import { isCollaborator } from './crew'
import { Input } from './input'
import { languagePreferences, type Locale } from './languages'
import { printPdf } from './print-pdf'
import { type ChecklistItem } from './steps'
import { EVIDENCE_BYTES, OPEN, resultStatements, touch, workable, workOrder, type Door } from './work'

export interface PackContent {
  id: string; work: string; workNumber: string; workVersion: number; title: string; instructions: string;
  checklist: string; checklistNumber: number; steps: ChecklistItem[];
  issuer: string; issuerName: string; issuedAt: number; locale: Locale
}
async function admit(env: Bindings, actor: Actor, work: string) {
  insist(!actor.service && HUMAN_ROLES.includes(actor.role), 'forbidden', 403)
  requireCapability(actor,'work.do')
  const authority=humanSessionSql(actor)
  insist(await one(env,`SELECT 1 WHERE ${authority.sql}`,...authority.params),'access_ended',403)
  const order=await workOrder(env,work)
  insist(order.assignee_id===actor.id || await isCollaborator(env,work,actor.id),'not_your_work',403)
  return {order,authority}
}
function fence(env: Bindings, actor: Actor, order: Row) {
  const authority=humanSessionSql(actor), capability=capabilitySql(actor.sessionId,'work.do')
  return [guard(env,'forbidden',capability.sql,...capability.params),guard(env,'access_ended',authority.sql,...authority.params),
    guard(env,'not_your_work',`EXISTS(SELECT 1 FROM gk_work_orders w WHERE w.id=? AND
      (w.assignee_id=? OR EXISTS(SELECT 1 FROM gk_collaborators c WHERE c.work_order_id=w.id AND c.member_id=? AND c.removed_at IS NULL)))`,order.id,actor.id,actor.id)]
}
async function pinnedSteps(env: Bindings, order: Row) {
  insist(order.checklist_revision_id,'no_checklist',409)
  const revision=await one(env,'SELECT * FROM gk_checklist_revisions WHERE id=?',order.checklist_revision_id)
  insist(revision,'no_checklist',409)
  const steps=JSON.parse(revision.items_json) as ChecklistItem[]
  insist(!steps.some(step=>step.meter),'print_meter_unsupported',409)
  return {revision,steps}
}
export async function issuePrintPack(env: Bindings, actor: Actor, input: Input) {
  input.only(['workOrder','version','returnTo'])
  const work=input.text('workOrder',{max:100})
  const {order}=await admit(env,actor,work)
  input.integer('version',{min:1,max:1_000_000})
  await workable(env,actor,input)
  const {revision,steps}=await pinnedSteps(env,order), id=newId(), issuedAt=now()
  const content: PackContent={id,work,workNumber:`WO-${String(order.number).padStart(4,'0')}`,workVersion:order.version,
    title:order.title,instructions:order.description??'',checklist:revision.id,checklistNumber:revision.number,steps,
    issuer:actor.id,issuerName:actor.name,issuedAt,locale:(await languagePreferences(env,actor)).effective}
  const source=JSON.stringify(content), digest=await sha256Hex(source), bytes=await printPdf(content,digest), pdfDigest=await sha256Hex(bytes)
  await commit(env,[...fence(env,actor,order),
    guard(env,'stale',`EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=? AND checklist_revision_id=? AND status IN ${OPEN})`,work,order.version,revision.id),
    stmt(env,'INSERT INTO gk_print_packs(id,work_order_id,work_version,checklist_revision_id,issued_by,issued_at,content_json,content_sha256,pdf_bytes,pdf_sha256) VALUES(?,?,?,?,?,?,?,?,?,?)',
      id,work,order.version,revision.id,actor.id,issuedAt,source,digest,bytes,pdfDigest)],
    {actor:actor.id,action:'printpack.issue',subject:work,detail:{pack:id,workVersion:order.version,checklistRevision:revision.id,contentDigest:digest,pdfDigest}})
  return {id,contentDigest:digest,pdfDigest}
}
async function packRow(env: Bindings, actor: Actor, id: string) {
  const row=await one(env,'SELECT * FROM gk_print_packs WHERE id=?',id)
  insist(row,'print_pack_not_found',404)
  const {order}=await admit(env,actor,row.work_order_id)
  insist(await sha256Hex(row.content_json)===row.content_sha256,'print_pack_digest_mismatch',409)
  return {row,order,content:JSON.parse(row.content_json) as PackContent}
}
export async function readPrintPack(env: Bindings, actor: Actor, id: string) {
  const {row,order,content}=await packRow(env,actor,id)
  const entries=await all(env,'SELECT receipt_json FROM gk_print_entries WHERE pack_id=? ORDER BY accepted_at,id',id)
  return {id,content,contentDigest:row.content_sha256,pdfDigest:row.pdf_sha256,
    currentVersion:order.version,canEnter:order.version===row.work_version && ['open','in_progress','returned'].includes(order.status),entries:entries.map(e=>JSON.parse(e.receipt_json))}
}
export async function workPrintPacks(env: Bindings, actor: Actor, work: string) {
  await admit(env,actor,work)
  return all(env,'SELECT id,work_version,issued_at,content_sha256 FROM gk_print_packs WHERE work_order_id=? ORDER BY issued_at,id',work)
}
export async function printPackPdf(env: Bindings, actor: Actor, id: string) {
  const {row,content}=await packRow(env,actor,id), bytes=new Uint8Array(row.pdf_bytes)
  insist(await sha256Hex(bytes)===row.pdf_sha256,'print_pack_digest_mismatch',409)
  return fileResponse(bytes,['application','pdf'].join('/'),`${content.workNumber}-${id}.pdf`)
}
const fileResponse=(bytes:Uint8Array,type:string,name:string)=>new Response(bytes as BodyInit,{headers:{
  'content-type':type,'content-disposition':`attachment; filename="${name.replace(/["\\\r\n]/g,'_')}"`,'cache-control':'private, no-store',
  'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}})
const PAPER_TYPES:Record<string,string>={pdf:['application','pdf'].join('/'),png:['image','png'].join('/'),jpg:['image','jpeg'].join('/'),jpeg:['image','jpeg'].join('/')}

export async function previewPrintEntry(env: Bindings, actor: Actor, input: Input) {
  const pack=input.text('pack',{max:100}), work=input.text('workOrder',{max:100})
  const {row,order,content}=await packRow(env,actor,pack)
  insist(work===order.id,'print_pack_mismatch',409)
  const key=input.text('submissionKey',{max:100})
  insist(/^[a-zA-Z0-9-]{16,100}$/.test(key),'invalid_submission_key')
  const version=input.integer('version',{min:1,max:1_000_000})!
  const allowed=['pack','workOrder','version','submissionKey','performedOn','original','outcome','value','note','returnTo']
  input.only([...allowed,...content.steps.flatMap((_,i)=>[`outcome-${i}`,`value-${i}`,`note-${i}`])])
  const column=(name:string)=>input.has(name)?input.list(name,{keepEmpty:true}):content.steps.map((_,i)=>input.text(`${name}-${i}`,{optional:true,max:1000}))
  const outcome=column('outcome'), value=column('value'), note=column('note')
  const performedOn=input.text('performedOn',{max:16})
  insist(isLocalTime(performedOn)&&performedOn<=localNow(actor.zone),'invalid_performed_time')
  const original=(await input.file('original',{maxBytes:EVIDENCE_BYTES}))!
  const type=PAPER_TYPES[original.filename.split('.').pop()?.toLowerCase()??'']
  insist(type,'unsupported_file_type')
  const originalDigest=await sha256Hex(original.bytes)
  const payload={pack,workOrder:work,version,outcome,value,note,performedOn,originalDigest,originalName:original.filename,originalType:type}
  const source=JSON.stringify(payload), digest=await sha256Hex(source)
  const existing=await one(env,'SELECT id,payload_sha256 FROM gk_print_previews WHERE entrant_id=? AND submission_key=?',actor.id,key)
  if(existing) {insist(existing.payload_sha256===digest,'submission_key_reused',409);return {id:existing.id,replayed:true}}
  insist(version===row.work_version&&version===order.version,'stale',409)
  await workable(env,actor,Input.of({workOrder:work,version}))
  await pinnedSteps(env,order)
  // This validates applicability and ordinary failure rules without persisting their effects.
  await resultStatements(env,actor,Input.of(payload),order)
  const id=newId()
  await commit(env,[...fence(env,actor,order),
    guard(env,'stale',`EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=? AND checklist_revision_id=? AND status IN ${OPEN})`,work,version,row.checklist_revision_id),
    guard(env,'submission_key_reused','NOT EXISTS(SELECT 1 FROM gk_print_previews WHERE entrant_id=? AND submission_key=? AND payload_sha256<>?)',actor.id,key,digest),
    stmt(env,`INSERT INTO gk_print_previews(id,pack_id,work_order_id,entrant_id,submission_key,payload_json,payload_sha256,original_name,original_type,original_bytes,original_sha256,performed_on,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(entrant_id,submission_key) DO NOTHING`,id,pack,work,actor.id,key,source,digest,original.filename,type,original.bytes,originalDigest,performedOn,now())],[])
  return {id:(await one(env,'SELECT id FROM gk_print_previews WHERE entrant_id=? AND submission_key=?',actor.id,key)).id,replayed:false}
}
async function previewRow(env: Bindings, actor: Actor, id: string) {
  const row=await one(env,'SELECT * FROM gk_print_previews WHERE id=? AND entrant_id=?',id,actor.id)
  insist(row,'print_preview_not_found',404)
  const pack=await packRow(env,actor,row.pack_id)
  insist(await sha256Hex(row.payload_json)===row.payload_sha256,'print_pack_digest_mismatch',409)
  return {...pack,preview:row}
}
export async function readPrintPreview(env: Bindings, actor: Actor, id: string) {
  const {preview,content,order}=await previewRow(env,actor,id)
  const entry=await one(env,'SELECT receipt_json FROM gk_print_entries WHERE id=?',id)
  return {id,pack:preview.pack_id,content,payload:JSON.parse(preview.payload_json),digest:preview.payload_sha256,
    originalDigest:preview.original_sha256,originalName:preview.original_name,createdAt:preview.created_at,
    canAccept:!entry && order.version===content.workVersion && ['open','in_progress','returned'].includes(order.status),
    receipt:entry?JSON.parse(entry.receipt_json):null}
}
export async function paperOriginal(env: Bindings, actor: Actor, id: string) {
  const {preview}=await previewRow(env,actor,id), bytes=new Uint8Array(preview.original_bytes)
  insist(await sha256Hex(bytes)===preview.original_sha256,'print_pack_digest_mismatch',409)
  return fileResponse(bytes,preview.original_type,preview.original_name)
}
export async function acceptPrintEntry(env: Bindings, actor: Actor, input: Input, door: Door) {
  input.only(['preview','digest','confirm','returnTo'])
  insist(input.flag('confirm'),'paper_confirmation_required')
  const id=input.text('preview',{max:100}), {preview,order,content}=await previewRow(env,actor,id)
  insist(input.text('digest',{max:64})===preview.payload_sha256,'print_pack_mismatch',409)
  const existing=await one(env,'SELECT receipt_json FROM gk_print_entries WHERE id=?',id)
  if(existing)return {id,receipt:JSON.parse(existing.receipt_json),replayed:true}
  const payload=JSON.parse(preview.payload_json)
  insist(order.version===content.workVersion&&order.checklist_revision_id===content.checklist,'stale',409)
  await workable(env,actor,Input.of(payload))
  await pinnedSteps(env,order)
  const plan=await resultStatements(env,actor,Input.of(payload),order)
  const original=new Uint8Array(preview.original_bytes)
  insist(await sha256Hex(original)===preview.original_sha256,'print_pack_digest_mismatch',409)
  const evidence=newId(), at=now()
  const receipt={id,pack:preview.pack_id,work:order.id,workVersion:content.workVersion,acceptedVersion:order.version+1,
    checklistRevision:content.checklist,contentDigest:(await one(env,'SELECT content_sha256 FROM gk_print_packs WHERE id=?',preview.pack_id)).content_sha256,
    payloadDigest:preview.payload_sha256,originalDigest:preview.original_sha256,evidence,entrant:actor.id,entrantName:actor.name,
    performedOn:preview.performed_on,enteredAt:at,door,results:plan.recorded}
  await commit(env,[...fence(env,actor,order),...touch(env,order),
    stmt(env,'INSERT INTO gk_evidence(id,work_order_id,filename,media_type,size,sha256,bytes,uploaded_by,uploaded_at,door) VALUES(?,?,?,?,?,?,?,?,?,?)',
      evidence,order.id,preview.original_name,preview.original_type,original.length,preview.original_sha256,original,actor.id,at,door),
    ...plan.statements,
    stmt(env,'INSERT INTO gk_print_entries(id,pack_id,work_order_id,entrant_id,evidence_id,accepted_version,accepted_at,receipt_json) VALUES(?,?,?,?,?,?,?,?)',
      id,preview.pack_id,order.id,actor.id,evidence,order.version+1,at,JSON.stringify(receipt))],
    [...plan.audits,{actor:actor.id,action:'printpack.accept',subject:order.id,detail:{preview:id,pack:preview.pack_id,evidence,contentDigest:receipt.contentDigest,originalDigest:receipt.originalDigest,performedOn:receipt.performedOn,acceptedVersion:receipt.acceptedVersion}}])
  return {id,receipt,replayed:false}
}
