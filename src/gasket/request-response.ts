import { automationAuthority } from './automation-context'
// Request clocks retain the policy in effect at submission. Existing lifecycle
// events are the acknowledgment and resolution sources; no second status model.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, commit, guard, insist, now, one, stmt, type Row } from './core'
import { addDays, today, zonedInstant } from './dates'
import { closures, isoWeekday } from './calendar'
import type { Input } from './input'
import { triager } from './requests'

type Policy = { revision:number; urgency:string; acknowledgmentMinutes:number; resolutionMinutes:number; owner:string; escalation:string; afterHours:string; weekdays:number[]; opens:number; closes:number; zone:string; holidays:{starts_on:string;ends_on:string}[] }
const decisions = ['assess','ask_details','approve','decline','abandon','duplicate']
export async function responsePolicy(env:Bindings,actor:Actor,input:Input) {
  triager(actor)
  const urgency=input.text('urgency'),afterHours=input.text('afterHours')
  insist(['normal','high','emergency'].includes(urgency),'invalid_urgency')
  insist(['business','elapsed'].includes(afterHours),'invalid_after_hours')
  const owner=input.text('owner'),escalation=input.text('escalation')
  for(const id of [owner,escalation])insist(await one(env,"SELECT 1 FROM gk_members WHERE id=? AND status='active' AND role IN ('owner','lead')",id),'request_lead_required')
  const weekdays=[...new Set(input.list('weekdays').map(Number))]
  insist(weekdays.length>0 && weekdays.every(n=>Number.isInteger(n)&&n>=1&&n<=7),'invalid_weekdays')
  const opens=input.integer('opens',{min:0,max:1439})!,closes=input.integer('closes',{min:1,max:1440})!
  insist(opens<closes,'invalid_business_hours')
  const revision=((await one(env,'SELECT MAX(revision) AS n FROM gk_request_response_policies'))?.n??0)+1
  const policy:Policy={revision,urgency,afterHours,owner,escalation,weekdays,opens,closes,zone:actor.zone,holidays:await closures(env),acknowledgmentMinutes:input.integer('acknowledgmentMinutes',{min:1,max:525600})!,resolutionMinutes:input.integer('resolutionMinutes',{min:1,max:525600})!}
  await commit(env,[stmt(env,'INSERT INTO gk_request_response_policies(revision,urgency,policy_json,created_by,created_at) VALUES(?,?,?,?,?)',revision,urgency,JSON.stringify(policy),actor.id,now())],{actor:actor.id,action:'request.responsePolicy',subject:String(revision),detail:policy})
  return {revision}
}
// Segments use real instants at site-local opening and closing boundaries, so
// weekends, closures and daylight-saving transitions cannot consume closed time.
function counted(start:number,end:number,p:Policy) {
  if(end<=start)return 0
  if(p.afterHours==='elapsed')return end-start
  let total=0
  for(let day=today(p.zone,start),last=today(p.zone,end);day<=last;day=addDays(day,1)) {
    if(!p.weekdays.includes(isoWeekday(day))||p.holidays.some(h=>h.starts_on<=day&&day<=h.ends_on))continue
    const boundary=(minutes:number)=>minutes===1440?zonedInstant(p.zone,addDays(day,1)+'T00:00'):zonedInstant(p.zone,day+'T'+String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0'))
    total+=Math.max(0,Math.min(end,boundary(p.closes))-Math.max(start,boundary(p.opens)))
  }
  return total
}
export async function requestClock(env:Bindings,r:Row,instant=now()) {
  const clock=await one(env,'SELECT * FROM gk_request_clocks WHERE request_id=?',r.id)
  if(!clock)return null
  const policy=JSON.parse(clock.policy_json) as Policy
  const events=await all(env,'SELECT * FROM gk_request_clock_events WHERE request_id=? ORDER BY revision',r.id)
  const acknowledgment=await one(env,`SELECT MIN(at) AS at FROM gk_request_events WHERE request_id=? AND kind IN (${decisions.map(()=>'?').join(',')})`,r.id,...decisions)
  const work=r.work_order_id?await one(env,'SELECT closed_at FROM gk_work_orders WHERE id=?',r.work_order_id):null
  const terminal=['declined','abandoned','duplicate'].includes(r.status)
  const ended=terminal?await one(env,"SELECT MAX(at) AS at FROM gk_request_events WHERE request_id=? AND kind IN ('decline','abandon','duplicate')",r.id):null
  const resolvedAt=work?.closed_at??ended?.at??null
  const measure=(until:number)=>{
    let elapsed=counted(r.created_at,until,policy)
    for(let i=0;i<events.length;i++)if(events[i].kind==='pause')elapsed-=counted(Math.max(r.created_at,events[i].at),Math.min(until,events[i+1]?.at??until),policy)
    return Math.max(0,elapsed)/60000
  }
  const paused=events.at(-1)?.kind==='pause'
  const ackMinutes=measure(acknowledgment.at??instant),resolutionMinutes=measure(resolvedAt??instant)
  return {revision:clock.revision,policy,paused,pauseReason:paused?events.at(-1).reason:null,events,acknowledgedAt:acknowledgment.at,resolvedAt,
    acknowledgment:{elapsedMinutes:ackMinutes,targetMinutes:policy.acknowledgmentMinutes,overdue:!acknowledgment.at&&!paused&&ackMinutes>=policy.acknowledgmentMinutes},
    resolution:{elapsedMinutes:resolutionMinutes,targetMinutes:policy.resolutionMinutes,overdue:!resolvedAt&&!paused&&resolutionMinutes>=policy.resolutionMinutes},
    notices:await all(env,'SELECT e.*,m.name AS recipient,o.name AS owner FROM gk_request_escalations e JOIN gk_members m ON m.id=e.recipient_id JOIN gk_members o ON o.id=e.owner_id WHERE request_id=? ORDER BY created_at,kind',r.id),
    ownerName:(await one(env,'SELECT name FROM gk_members WHERE id=?',policy.owner))?.name,
    escalationName:(await one(env,'SELECT name FROM gk_members WHERE id=?',policy.escalation))?.name}
}
export async function changeRequestClock(env:Bindings,actor:Actor,input:Input) {
  triager(actor)
  const id=input.text('request'),r=await one(env,'SELECT * FROM gk_requests WHERE id=?',id)
  insist(r,'request_not_found',404)
  insist(!r.erased_at,'request_erased',410)
  const clock=await requestClock(env,r),kind=input.text('kind'),revision=input.integer('revision',{min:1})!
  insist(clock&&!clock.resolvedAt,'request_clock_not_open',409)
  insist(clock.revision===revision,'stale',409)
  insist(kind===(clock.paused?'resume':'pause'),'invalid_clock_transition',409)
  const reason=input.text('reason',{max:1000})
  await commit(env,[guard(env,'stale','EXISTS(SELECT 1 FROM gk_request_clocks WHERE request_id=? AND revision=?) AND EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND version=? AND erased_at IS NULL)',id,revision,id,r.version),stmt(env,'UPDATE gk_request_clocks SET revision=revision+1 WHERE request_id=?',id),stmt(env,'INSERT INTO gk_request_clock_events(request_id,revision,kind,reason,actor,at) VALUES(?,?,?,?,?,?)',id,revision+1,kind,reason,actor.id,now())],{actor:actor.id,action:'request.clock',subject:id,detail:{kind,reason}})
  return {id}
}
export async function runRequestEscalations(env:Bindings) {
  for(const r of await all(env,"SELECT r.* FROM gk_requests r JOIN gk_request_clocks c ON c.request_id=r.id WHERE r.erased_at IS NULL")) {
    const clock=await requestClock(env,r)
    if(!clock)continue
    for(const kind of ['acknowledgment','resolution'] as const)if(clock[kind].overdue&&!clock.notices.some(n=>n.kind===kind)) {
      const authority=automationAuthority()!
      await commit(env,[stmt(env,`INSERT INTO gk_request_escalations(request_id,kind,recipient_id,owner_id,created_at,automation_job_id,automation_rule_revision) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND version=? AND erased_at IS NULL) AND EXISTS(SELECT 1 FROM gk_request_clocks WHERE request_id=? AND revision=?) AND (?='acknowledgment' OR NOT EXISTS(SELECT 1 FROM gk_work_orders WHERE id=(SELECT work_order_id FROM gk_requests WHERE id=?) AND closed_at IS NOT NULL)) ON CONFLICT DO NOTHING`,r.id,kind,clock.policy.escalation,clock.policy.owner,now(),authority.job,authority.revision,r.id,r.version,r.id,clock.revision,kind,r.id)],{actor:'scheduler',action:'request.escalation',subject:r.id,detail:{kind,owner:clock.policy.owner,recipient:clock.policy.escalation}})
    }
  }
}
export async function responseSettings(env:Bindings,actor:Actor) {
  triager(actor)
  return {policies:(await all(env,'SELECT policy_json FROM gk_request_response_policies ORDER BY revision DESC')).map(r=>JSON.parse(r.policy_json)),people:await all(env,"SELECT id,name FROM gk_members WHERE status='active' AND role IN ('owner','lead') ORDER BY name")}
}

export async function responseNotices(env:Bindings,actor:Actor) {
  triager(actor)
  return await all(env,'SELECT e.*,r.number FROM gk_request_escalations e JOIN gk_requests r ON r.id=e.request_id WHERE e.recipient_id=? AND r.erased_at IS NULL ORDER BY e.created_at DESC,r.number',actor.id)
}
export async function responseInputs(env:Bindings) {
  return {requests:await all(env,`SELECT r.id,r.status,r.created_at,r.work_order_id,w.closed_at,c.revision,c.policy_json FROM gk_requests r JOIN gk_request_clocks c ON c.request_id=r.id LEFT JOIN gk_work_orders w ON w.id=r.work_order_id WHERE r.erased_at IS NULL`),events:await all(env,'SELECT request_id,kind,at FROM gk_request_events'),pauses:await all(env,'SELECT request_id,revision,kind,at FROM gk_request_clock_events')}
}
