// Each action is prepared read-only; the engine commits its checks and effects with its revision and evidence.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, guard, insist, newId, now, one, stmt, NEXT_NUMBER, type Row } from './core'
import { addDays, today } from './dates'
import { assigneeFits, handoffStatements } from './crew'
import { workOrderDetail } from './work'
import type { RuleAction, RuleEvent } from './rules-definition'
export async function prepareAction(env:Bindings,actor:Actor,event:RuleEvent,facts:Row,a:RuleAction,provenance:Row) {
 const work=facts.work,request=event.entityType==='request'?facts.record:null,target=work??request
 const statements:D1PreparedStatement[]=[],output:Row={type:a.type},events:RuleEvent[]=[]
 const editable=()=>{
  insist(target,'rule_action_needs_work_or_request',409)
  insist(work ? ['open','in_progress','returned'].includes(work.status) : ['new','needs_details','approved'].includes(request.status),'rule_target_not_open',409)
  statements.push(guard(env,'stale',`EXISTS(SELECT 1 FROM ${work?'gk_work_orders':'gk_requests'} WHERE id=? AND version=?)`,target.id,target.version))
 }
 const update=(column:string,value:unknown)=>statements.push(stmt(env,`UPDATE ${work?'gk_work_orders':'gk_requests'} SET ${column}=?,version=version+1 WHERE id=?`,value,target.id))
 if(a.type==='assign') {
  editable()
  const team=a.team||target.team_id||null,person=a.person||null
  if(team) {
   insist(await one(env,'SELECT id FROM gk_teams WHERE id=?',team),'team_not_found',404)
   statements.push(guard(env,'rule_team_changed','EXISTS(SELECT 1 FROM gk_teams WHERE id=?)',team))
  }
  if(person) {
   await assigneeFits(env,person,team)
   statements.push(guard(env,'rule_assignee_changed',"EXISTS(SELECT 1 FROM gk_members WHERE id=? AND status='active' AND role IN ('owner','lead','maintainer'))",person))
   if(team)statements.push(guard(env,'rule_team_changed','EXISTS(SELECT 1 FROM gk_team_members WHERE team_id=? AND member_id=?)',team,person))
  }
  if(work)statements.push(...handoffStatements(env,actor,work,person,{team,trade:work.trade,shift:work.shift},`Automation rule ${provenance.rule} revision ${provenance.revision}`))
  else statements.push(stmt(env,'UPDATE gk_requests SET team_id=?,assignee_id=?,version=version+1 WHERE id=?',team,person,request.id))
  Object.assign(output,{team,person})
 }
 if(a.type==='priority') { editable();update(work?'priority':'urgency',a.value);output.value=a.value }
 if(a.type==='status') {
  editable();insist(work ? ['open','in_progress'].includes(a.value!) : ['new','needs_details'].includes(a.value!),'rule_action_prohibited')
  if(target.status!==a.value) { update('status',a.value);if(work)events.push({trigger:'work.status_changed',entityType:'work',entityId:work.id}) }
  output.value=a.value
 }
 if(a.type==='due') { editable();const due=addDays(today(actor.zone,event.at??now()),a.days!);update('due_date',due);output.due=due }
 if(a.type==='procedure') {
  editable();insist(work,'rule_action_needs_work',409)
  insist(!work.checklist_revision_id,'procedure_already_attached',409)
  const revision=await one(env,'SELECT r.id FROM gk_checklist_revisions r JOIN gk_checklists c ON c.id=r.checklist_id WHERE c.id=? ORDER BY r.number DESC LIMIT 1',a.value)
  insist(revision,'checklist_not_found',404)
  insist(!await one(env,'SELECT 1 FROM gk_results WHERE work_order_id=?',work.id),'work_has_results',409)
  statements.push(guard(env,'procedure_changed','NOT EXISTS(SELECT 1 FROM gk_results WHERE work_order_id=?)',work.id))
  update('checklist_revision_id',revision.id);output.procedureRevision=revision.id
 }
 if(a.type==='follow_up') {
  const asset=facts.assetRecord,location=asset?null:facts.location
  insist(asset || location,'rule_action_needs_location',409)
  if(asset) { insist(!asset.retired_at,'asset_retired',409);statements.push(guard(env,'asset_retired','EXISTS(SELECT 1 FROM gk_assets WHERE id=? AND retired_at IS NULL)',asset.id)) }
  const id=newId(),due=addDays(today(actor.zone,event.at??now()),a.days!)
  statements.push(stmt(env,`INSERT INTO gk_work_orders(id,number,asset_id,location,kind,follow_up_of,title,description,due_date,priority,status,created_by,created_at) VALUES(?,${NEXT_NUMBER},?,?,'corrective',?,?,?, ?,?,'open',?,?)`,id,asset?.id??null,location,work?.id??null,a.title,`Rule ${provenance.rule}, revision ${provenance.revision}; event ${provenance.event}`,due,work?.priority??'normal',actor.id,now()))
  output.work=id;events.push({trigger:'work.created',entityType:'work',entityId:id})
 }
 if(a.type==='request_approval') {
  editable();insist(work && work.assignee_id===actor.id,'rule_owner_must_hold_work',403)
  const detail=await workOrderDetail(env,actor,work.id)
  insist(!detail.missing.length,'not_ready_for_review',409,{missing:detail.missing})
  statements.push(guard(env,'downtime_open','NOT EXISTS(SELECT 1 FROM gk_downtime WHERE work_order_id=? AND ended_on IS NULL)',work.id),stmt(env,"UPDATE gk_work_orders SET status='submitted',version=version+1,submitted_at=?,submitted_version=? WHERE id=?",now(),work.version,work.id))
  events.push({trigger:'work.status_changed',entityType:'work',entityId:work.id});output.status='submitted'
 }
 if(a.type==='notify') {
  const ids=new Set(a.people??[])
  if(a.team) {
   insist(await one(env,'SELECT 1 FROM gk_teams WHERE id=?',a.team),'team_not_found',404)
   for(const row of await all(env,"SELECT m.id FROM gk_team_members t JOIN gk_members m ON m.id=t.member_id WHERE t.team_id=? AND m.status='active' AND m.role<>'agent'",a.team))ids.add(row.id)
  }
  insist(ids.size>0 && ids.size<=50,'invalid_rule_recipients')
  const text=`${a.text} · Rule ${provenance.rule}, revision ${provenance.revision}`
  for(const id of ids) {
   insist(await one(env,"SELECT 1 FROM gk_members WHERE id=? AND status='active' AND role<>'agent'",id),'rule_recipient_unavailable',409)
   statements.push(guard(env,'rule_recipient_changed',"EXISTS(SELECT 1 FROM gk_members WHERE id=? AND status='active' AND role<>'agent')",id))
   if(a.team && !(a.people??[]).includes(id))statements.push(guard(env,'rule_team_changed','EXISTS(SELECT 1 FROM gk_team_members WHERE team_id=? AND member_id=?)',a.team,id))
   if(work || facts.asset)statements.push(stmt(env,"INSERT INTO gk_notices(id,recipient_id,work_order_id,asset_id,kind,occasion,text,created_at) VALUES(?,?,?,?,'reminder',?,?,?)",newId(),id,work?.id??null,work?null:facts.asset,`${provenance.action}:${id}`,text,now()))
   else statements.push(stmt(env,'INSERT INTO gk_rule_notices(id,recipient_id,request_id,part_id,text,created_at,rule_id,revision,action_id) VALUES(?,?,?,?,?,?,?,?,?)',newId(),id,request?.id??null,facts.partRecord?.id??null,text,now(),provenance.rule,provenance.revision,provenance.action))
  }
  Object.assign(output,{recipients:[...ids],delivery:'stored_in_app',externalDelivery:'unavailable'})
 }
 return {statements,output,events}
}
