// Lead decisions retain every report and original file. Duplicate groups have
// one root, never chains; all linking/conversion decisions use version guards.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, AUDIT_INSERT, commit, guard, insist, now, one, stmt } from './core'
import { Input } from './input'
import { requestDetail, triager } from './requests'
import { createCorrective, doorOf } from './work'

export async function triageRequest(env:Bindings,actor:Actor,input:Input) {
  triager(actor)
  const r=await requestDetail(env,actor,input.text('request')),version=input.integer('version',{min:1})
  insist(r.version===version,'stale',409)
  const decision=input.text('decision'),reason=input.text('reason',{max:2000}),impact=input.text('impact',{optional:true}) || r.impact
  insist(['assess','ask_details','approve','decline','abandon','duplicate'].includes(decision),'invalid_triage_decision')
  insist(['unknown','running','reduced','stopped'].includes(impact),'invalid_impact')
  insist(!['converted','duplicate','declined','abandoned'].includes(r.status),'request_not_open',409)
  const statements=[guard(env,'stale','EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND version=?)',r.id,version)]
  let canonical:any=null
  if(decision==='duplicate') {
    canonical=await requestDetail(env,actor,input.text('canonical'))
    insist(canonical.id!==r.id && !canonical.duplicate_of && !['declined','abandoned'].includes(canonical.status),'invalid_duplicate',409)
    insist((r.asset_id && r.asset_id===canonical.asset_id) || (!r.asset_id && !canonical.asset_id && r.location===canonical.location),'different_fault_target',409)
    insist(!await one(env,'SELECT 1 FROM gk_requests WHERE duplicate_of=?',r.id),'duplicate_group_has_children',409)
    statements.push(guard(env,'stale','EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND version=?)',canonical.id,canonical.version),
      stmt(env,'UPDATE gk_requests SET version=version+1 WHERE id=?',canonical.id),
      stmt(env,'UPDATE gk_requests SET status=\'duplicate\',duplicate_of=?,work_order_id=?,impact=?,version=version+1 WHERE id=?',canonical.id,canonical.work_order_id,impact,r.id),
      stmt(env,"INSERT INTO gk_request_events(request_id,kind,text,actor,at) VALUES(?,'duplicate_linked',?,?,?)",canonical.id,`R-${r.number} linked as a duplicate: ${reason}`,actor.id,now()))
  } else {
    const status=decision==='assess'?r.status:decision==='ask_details'?'needs_details':decision==='approve'?'approved':decision==='abandon'?'abandoned':'declined'
    statements.push(stmt(env,'UPDATE gk_requests SET status=?,impact=?,version=version+1 WHERE id=?',status,impact,r.id))
  }
  statements.push(stmt(env,'INSERT INTO gk_request_events(request_id,kind,text,actor,at) VALUES(?,?,?,?,?)',r.id,decision,`${canonical?`Duplicate of R-${canonical.number}. `:''}${reason}`,actor.id,now()))
  await commit(env,statements,{actor:actor.id,action:'request.triage',subject:r.id,detail:{decision,reason,impact,canonical:canonical?.id??null}})
  return {id:r.id}
}
export async function replyToRequest(env:Bindings,actor:Actor,input:Input) {
  const r=await requestDetail(env,actor,input.text('request'))
  insist(r.requester_id===actor.id,'not_your_request',403)
  insist(r.status==='needs_details','request_not_awaiting_details',409)
  const version=input.integer('version',{min:1}),text=input.text('text',{max:2000})
  insist(r.version===version,'stale',409)
  await commit(env,[guard(env,'stale','EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND version=? AND status=\'needs_details\')',r.id,version),
    stmt(env,"UPDATE gk_requests SET status='new',version=version+1 WHERE id=?",r.id),
    stmt(env,"INSERT INTO gk_request_events(request_id,kind,text,actor,at) VALUES(?,'details_supplied',?,?,?)",r.id,text,actor.id,now())],{actor:actor.id,action:'request.reply',subject:r.id,detail:{text}})
  return {id:r.id}
}
export async function convertRequest(env:Bindings,actor:Actor,input:Input,request:Request) {
  triager(actor)
  const r=await requestDetail(env,actor,input.text('request'))
  insist(!r.duplicate_of,'convert_canonical_request',409)
  if(r.work_order_id)return {id:r.work_order_id}
  insist(r.status==='approved','request_not_approved',409)
  const version=input.integer('version',{min:1});insist(version===r.version,'stale',409)
  const duplicates=await all(env,'SELECT id,version FROM gk_requests WHERE duplicate_of=? ORDER BY id',r.id)
  // Keep the full original description. Questions/replies stay linked in the
  // source timeline rather than silently rewriting the operator's report.
  const chosen=Input.of({...(r.asset_id?{asset:r.asset_id}:{location:r.location}),title:r.description.slice(0,160),description:r.description,priority:r.urgency,due:input.text('due',{optional:true})||actor.today,unassigned:true})
  return createCorrective(env,actor,chosen,{door:doorOf(request),also:id=>[
    guard(env,'stale','EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND version=? AND status=\'approved\' AND work_order_id IS NULL)',r.id,version),
    stmt(env,"UPDATE gk_requests SET status='converted',work_order_id=?,version=version+1 WHERE id=?",id,r.id),
    ...duplicates.flatMap(d=>[guard(env,'stale','EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND version=?)',d.id,d.version),stmt(env,'UPDATE gk_requests SET work_order_id=?,version=version+1 WHERE id=?',id,d.id)]),
    stmt(env,AUDIT_INSERT,now(),actor.id,actor.id,'request.convert',r.id,JSON.stringify({work:id,duplicates:duplicates.map(d=>d.id)})),
    ...[r,...duplicates].map(d=>stmt(env,"INSERT INTO gk_request_events(request_id,kind,text,actor,at) SELECT ?,'work_created','Linked to WO-' || number,?,? FROM gk_work_orders WHERE id=?",d.id,actor.id,now(),id)),
  ]})
}
