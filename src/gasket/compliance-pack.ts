import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, now, one, sha256Hex } from './core'
import { safetyState, QUALIFICATION_PROVENANCE } from './safety'
import { workOrderDetail } from './work'
import { zip } from './zip'

/** Owner custody: pack existing work evidence without exposing personnel or private source documents to planning. */
export async function compliancePack(env: Bindings,actor: Actor,id:string) {
  requireCapability(actor,'site.manage')
  const planningRevision=(await one(env,'SELECT revision FROM gk_planning_state WHERE singleton=1')).revision
  const work=await workOrderDetail(env,actor,id),safety=await safetyState(env,actor,work)
  const instructions=work.checklist_revision_id?await one(env,'SELECT id,checklist_id,number,items_json,note,published_by,published_at FROM gk_checklist_revisions WHERE id=?',work.checklist_revision_id):null
  const files:{path:string;bytes:Uint8Array}[]=[],manifest:{path:string;sha256:string;size:number}[]=[]
  const add=async(path:string,bytes:Uint8Array)=>{files.push({path,bytes});manifest.push({path,sha256:await sha256Hex(bytes),size:bytes.length})}
  const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value,null,2)+'\n')
  await add('instructions.json',encode(instructions))
  await add('results.json',encode({items:work.items,readings:work.readings,tools:work.tools,calibration:work.calibration,missing:work.missing}))
  await add('review.json',encode({signatures:work.signatures,reviews:work.reviews}))
  await add('qualifications.json',encode({provenance:QUALIFICATION_PROVENANCE,safety}))
  const originals=await all(env,'SELECT id,filename,bytes FROM gk_evidence WHERE work_order_id=?',id)
  for(const f of originals)await add(`evidence/${f.id}-${f.filename.replace(/[^a-zA-Z0-9._-]/g,'_')}`,new Uint8Array(f.bytes))
  const permits=await all(env,'SELECT id,filename,bytes FROM gk_safety_attestations WHERE work_order_id=?',id)
  for(const f of permits)await add(`permits/${f.id}-${f.filename.replace(/[^a-zA-Z0-9._-]/g,'_')}`,new Uint8Array(f.bytes))
  const documents=await all(env,'SELECT r.id,r.filename,r.bytes FROM gk_work_documents w JOIN gk_document_revisions r ON r.id=w.revision_id WHERE w.work_order_id=?',id)
  for(const f of documents)await add(`documents/${f.id}-${f.filename.replace(/[^a-zA-Z0-9._-]/g,'_')}`,new Uint8Array(f.bytes))
  const marks=await all(env,'SELECT id,mark FROM gk_signatures WHERE work_order_id=? AND mark IS NOT NULL',id)
  for(const f of marks)await add(`signatures/${f.id}.original`,new Uint8Array(f.mark))
  const missing=[...work.missing,...safety.missing,...(!work.reviews.some((r:any)=>r.decision==='approved')?['Independent approval missing']:[]),...(!work.evidence.some((e:any)=>e.certificate)?['Certificate missing']:[])]
  const summary={work:{id:work.id,number:work.number,title:work.title,status:work.status,procedureRevision:work.checklist_revision_id},generatedAt:now(),provenance:QUALIFICATION_PROVENANCE,missing,files:manifest}
  files.push({path:'MANIFEST.json',bytes:encode(summary)},{path:'MANIFEST.csv',bytes:new TextEncoder().encode('File,SHA-256,Bytes\r\n'+manifest.map(f=>`${f.path},${f.sha256},${f.size}`).join('\r\n')+'\r\n')})
  await commit(env,[guard(env,'export_changed','EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=?)',id,work.version),guard(env,'export_changed','(SELECT revision FROM gk_planning_state WHERE singleton=1)=?',planningRevision),...(safety.requirement?[guard(env,'export_changed','(SELECT id FROM gk_safety_requirements WHERE checklist_id=? ORDER BY revision DESC LIMIT 1)=?',safety.requirement.checklist_id,safety.requirement.id),guard(env,'export_changed','(SELECT id FROM gk_checklist_revisions WHERE checklist_id=? ORDER BY number DESC LIMIT 1)=?',safety.requirement.checklist_id,safety.procedure.latest)]:[])],{actor:actor.id,action:'compliance.export',subject:id,detail:{files:manifest,missing}})
  return new Response(zip(files),{headers:{'content-type':'application/zip','content-disposition':`attachment; filename="work-${work.number}-compliance.zip"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}})
}
