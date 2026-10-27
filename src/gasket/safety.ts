import type { Bindings } from '../auth.server'
import { can, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from './core'
import { isDate } from './dates'
import type { Input } from './input'
import { workOrder, OPEN } from './work'

// Pre-identity snapshots bind only to the original migrated record, never a replacement.
const legacyQualificationId = (member: string, name: string) => {
  const hex = (value: string) => [...new TextEncoder().encode(value)].map(byte=>byte.toString(16).padStart(2,'0').toUpperCase()).join('')
  return `legacy-${hex(member)}-${hex(name)}`
}
const qualificationIdentity = (member: string, qualification: Row) => !qualification.record_id || qualification.record_id==='legacy' ? legacyQualificationId(member,qualification.name) : qualification.record_id

export const QUALIFICATION_PROVENANCE = 'Owner-entered reference — not verified by Gasket with the issuing body.'

export async function publishSafety(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const checklist=input.text('checklist'), hazard=input.text('hazard',{max:1000}), isolation=input.text('isolation',{max:2000}), qualification=input.text('qualification',{max:80})
  insist(input.flag('siteApproved'),'site_approval_required')
  insist(await one(env,'SELECT id FROM gk_checklists WHERE id=?',checklist),'checklist_not_found',404)
  const latest=await one(env,'SELECT MAX(revision) AS revision FROM gk_safety_requirements WHERE checklist_id=?',checklist)
  const revision=(latest?.revision??0)+1, id=newId()
  await commit(env,[guard(env,'stale','(SELECT COALESCE(MAX(revision),0) FROM gk_safety_requirements WHERE checklist_id=?)=?',checklist,revision-1),stmt(env,'INSERT INTO gk_safety_requirements VALUES(?,?,?,?,?,?,?,?)',id,checklist,revision,hazard,isolation,qualification,actor.id,now())],{actor:actor.id,action:'safety.publish',subject:checklist,detail:{id,revision,hazard,isolation,qualification,siteApproved:true}})
  return {id:checklist,requirement:id}
}

export async function safetyState(env: Bindings, actor: Actor, order: Row) {
  const procedure=order.checklist_revision_id?await one(env,'SELECT r.checklist_id, (SELECT id FROM gk_checklist_revisions WHERE checklist_id=r.checklist_id ORDER BY number DESC LIMIT 1) AS latest FROM gk_checklist_revisions r WHERE r.id=?',order.checklist_revision_id):null
  const requirement=procedure?await one(env,'SELECT s.*,m.name AS publisher FROM gk_safety_requirements s JOIN gk_members m ON m.id=s.published_by WHERE s.checklist_id=? ORDER BY s.revision DESC LIMIT 1',procedure.checklist_id):null
  if(!requirement)return {requirement:null,procedure,attestations:[],missing:[] as string[]}
  const version=['submitted','closed'].includes(order.status)?order.submitted_version:order.version
  const rows=await all(env,`SELECT a.id,a.requirement_id,a.procedure_revision,a.work_version,a.signer,m.name AS signer_name,a.qualification_json,a.permit,a.expires_on,a.filename,a.sha256,a.recorded_at,m.status AS member_status FROM gk_safety_attestations a JOIN gk_members m ON m.id=a.signer WHERE a.work_order_id=? ORDER BY a.recorded_at,a.rowid`,order.id)
  const attestations=[]
  for(const row of rows) {
    const qualification=JSON.parse(row.qualification_json)
    const current=await one(env,'SELECT name,expires_on,reference,record_id FROM gk_qualifications WHERE member_id=? AND name=?',row.signer,requirement.qualification)
    const reasons=[]
    if(row.requirement_id!==requirement.id||row.procedure_revision!==procedure.latest||row.work_version!==version)reasons.push('Changed evidence requires reapproval')
    if(row.expires_on<=actor.today)reasons.push('Permit expired')
    if(row.member_status!=='active'||!current||current.expires_on<=actor.today||current.name!==qualification.name||current.expires_on!==qualification.expires_on||current.reference!==qualification.reference||qualificationIdentity(row.signer,current)!==qualificationIdentity(row.signer,qualification))reasons.push('Qualification missing, expired or changed')
    attestations.push({...row,qualification:can(actor,'work.assign')||actor.id===row.signer?{...qualification,provenance:QUALIFICATION_PROVENANCE}:undefined,qualification_json:undefined,member_status:undefined,reasons})
  }
  const latest=attestations.at(-1)
  return {requirement,procedure,attestations,missing:latest?latest.reasons:['Required qualified isolation sign-off and permit evidence missing']}
}

export async function readSafety(env: Bindings,actor: Actor,id:string) {
  insist(can(actor,'work.do')||can(actor,'work.review'),'forbidden',403)
  const order=await workOrder(env,id)
  return {id,...await safetyState(env,actor,order)}
}

export async function attestSafety(env: Bindings,actor: Actor,input:Input) {
  requireCapability(actor,'work.do')
  const order=await workOrder(env,input.text('workOrder'))
  insist(order.assignee_id===actor.id,'not_your_work',403)
  insist(['open','in_progress','returned'].includes(order.status),'work_order_not_open',409)
  const version=input.integer('version',{min:1})!
  insist(version===order.version,'stale',409)
  const state=await safetyState(env,actor,order), r=state.requirement
  insist(r,'no_safety_prerequisite',409)
  insist(input.flag('isolated'),'isolation_attestation_required')
  const qualification=await one(env,'SELECT name,expires_on,reference,record_id FROM gk_qualifications WHERE member_id=? AND name=?',actor.id,r.qualification)
  insist(qualification&&qualification.expires_on>actor.today,'qualification_missing_or_expired',409)
  const permit=input.text('permit',{max:200}),expires=input.text('expires')
  insist(isDate(expires)&&expires>actor.today,'permit_expired',409)
  const file=(await input.file('file',{maxBytes:1_500_000}))!, id=newId(), sha=await sha256Hex(file.bytes)
  const statements=[guard(env,'stale',`EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=? AND status IN ${OPEN})`,order.id,version),
    guard(env,'qualification_changed','EXISTS(SELECT 1 FROM gk_qualifications WHERE member_id=? AND name=? AND expires_on=? AND reference=? AND record_id=?)',actor.id,qualification.name,qualification.expires_on,qualification.reference,qualification.record_id),
    guard(env,'safety_changed','(SELECT id FROM gk_safety_requirements WHERE checklist_id=? ORDER BY revision DESC LIMIT 1)=?',r.checklist_id,r.id),
    guard(env,'procedure_changed','(SELECT id FROM gk_checklist_revisions WHERE checklist_id=? ORDER BY number DESC LIMIT 1)=?',r.checklist_id,state.procedure.latest),
    stmt(env,'INSERT INTO gk_safety_attestations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',id,order.id,r.id,state.procedure.latest,version+1,actor.id,JSON.stringify(qualification),permit,expires,file.filename,file.bytes,sha,now()),
    stmt(env,'UPDATE gk_work_orders SET version=version+1 WHERE id=?',order.id)]
  await commit(env,statements,{actor:actor.id,action:'safety.attest',subject:order.id,detail:{id,requirement:r.id,procedure:state.procedure.latest,version:version+1,permit,expires,sha256:sha,isolated:true}})
  return {id:order.id,attestation:id}
}

/** Called before submission and independent approval; rechecked inside their atomic batches. */
export async function safetyGuards(env: Bindings,actor: Actor,order: Row) {
  const state=await safetyState(env,actor,order)
  insist(!state.missing.length,'safety_evidence_required',409,{missing:state.missing})
  if(!state.requirement)return [guard(env,'safety_changed','NOT EXISTS(SELECT 1 FROM gk_safety_requirements WHERE checklist_id=(SELECT checklist_id FROM gk_checklist_revisions WHERE id=?))',order.checklist_revision_id)]
  const r=state.requirement,a=state.attestations.at(-1)!,q=JSON.parse((await one(env,'SELECT qualification_json FROM gk_safety_attestations WHERE id=?',a.id)).qualification_json)
  return [guard(env,'safety_changed','(SELECT id FROM gk_safety_requirements WHERE checklist_id=? ORDER BY revision DESC LIMIT 1)=?',r.checklist_id,r.id),guard(env,'procedure_changed','(SELECT id FROM gk_checklist_revisions WHERE checklist_id=? ORDER BY number DESC LIMIT 1)=?',r.checklist_id,state.procedure.latest),guard(env,'qualification_changed',"EXISTS(SELECT 1 FROM gk_qualifications q JOIN gk_members m ON m.id=q.member_id WHERE m.id=? AND m.status='active' AND q.name=? AND q.expires_on=? AND q.reference=? AND q.record_id=?)",a.signer,q.name,q.expires_on,q.reference,qualificationIdentity(a.signer,q))]
}

/** Required inspection library: existing procedure revisions and their published intervals. */
export async function complianceTemplates(env: Bindings) {
  return all(env,`SELECT c.id,c.name,r.id AS procedure_revision,r.number,s.id AS prerequisite,s.qualification,s.revision AS prerequisite_revision,
    (SELECT json_group_array(json_object('id',p.id,'everyDays',p.every_days,'calibration',p.calibration,'active',p.active)) FROM gk_schedules p WHERE p.checklist_id=c.id) AS intervals
    FROM gk_checklists c JOIN gk_checklist_revisions r ON r.checklist_id=c.id AND r.number=(SELECT MAX(number) FROM gk_checklist_revisions WHERE checklist_id=c.id)
    JOIN gk_safety_requirements s ON s.checklist_id=c.id AND s.revision=(SELECT MAX(revision) FROM gk_safety_requirements WHERE checklist_id=c.id) ORDER BY c.name`)
}
