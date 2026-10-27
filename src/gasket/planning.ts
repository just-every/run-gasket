import type { Bindings } from '../auth.server'
import { capabilitySql, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { QUALIFICATION_PROVENANCE } from './safety'
import { addDays, isDate, isLocalTime, minutesBetween, zonedInstant } from './dates'
import { assigneeFits } from './crew'
import { fits } from './bom'
import { RESERVED } from './reservations'
import { canonicalSql } from './part-identity'
import type { Input } from './input'

const OPEN = "('open','in_progress','returned')"
const revision = async (env: Bindings) => (await one(env, 'SELECT revision FROM gk_planning_state WHERE singleton=1')).revision as number
const lock = (env: Bindings, seen: number) => guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_planning_state WHERE singleton=1 AND revision=?)', seen)
const bump = (env: Bindings) => stmt(env, 'UPDATE gk_planning_state SET revision=revision+1 WHERE singleton=1')
const custody = (env: Bindings, actor: Actor) => {
  const authority=capabilitySql(actor.sessionId,'site.manage')
  return guard(env,'forbidden',authority.sql,...authority.params)
}
const active = (env: Bindings, member: string) => one(env, "SELECT id FROM gk_members WHERE id=? AND status='active' AND role IN ('owner','lead','maintainer')", member)
const overlap = (a: Row, b: Row) => a.starts < b.ends && a.ends > b.starts
const span = (input: Input) => {
  const starts = input.text('starts'), ends = input.text('ends')
  insist(isLocalTime(starts) && isLocalTime(ends) && starts < ends && starts.slice(0,10) === ends.slice(0,10), 'invalid_planning_window')
  return { starts, ends }
}

/** Owner-only credential records: these are entered references, never certification by Gasket. */
export async function saveQualification(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const member = input.text('member'), name = input.text('name', {max:80}), expires = input.text('expires'), reference = input.text('reference', {max:200})
  insist(await active(env, member), 'member_not_assignable', 409)
  insist(isDate(expires), 'invalid_expiry')
  const remindDays=input.flag('remind')?input.integer('remindDays',{max:365}):null
  const seen = await revision(env)
  const previous=await one(env,'SELECT * FROM gk_qualifications WHERE member_id=? AND name=?',member,name)
  await commit(env, [custody(env,actor),lock(env,seen), stmt(env, 'INSERT INTO gk_qualifications(member_id,name,expires_on,reference,record_id,recorded_at,recorded_by,remind_days) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(member_id,name) DO UPDATE SET expires_on=excluded.expires_on,reference=excluded.reference,record_id=excluded.record_id,recorded_at=excluded.recorded_at,recorded_by=excluded.recorded_by,remind_days=excluded.remind_days', member,name,expires,reference,newId(),now(),actor.id,remindDays), bump(env)],
    {actor:actor.id, action:'planning.qualification',subject:member,detail:{name,expires,reference,remindDays,previous}})
  return {id:member}
}

export async function savePlanningTool(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const id = input.text('id',{optional:true}) || newId(), name = input.text('name',{max:120}), identifier = input.text('identifier',{max:120}), due = input.text('calibrationDue')
  insist(isDate(due), 'invalid_calibration_due')
  const seen = input.integer('revision',{min:1})!
  const existing = await one(env,'SELECT * FROM gk_planning_tools WHERE id=?',id)
  insist(!input.has('id') || existing, 'tool_not_found',404)
  insist(!existing || existing.name===name, 'tool_name_immutable',409)
  insist(!await one(env,'SELECT 1 FROM gk_planning_tools WHERE name=? COLLATE NOCASE AND id<>?',name,id), 'tool_name_taken',409)
  await commit(env,[custody(env,actor),lock(env,seen),stmt(env,'INSERT INTO gk_planning_tools(id,name,identifier,calibration_due) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET identifier=excluded.identifier,calibration_due=excluded.calibration_due',id,name,identifier,due),bump(env)],
    {actor:actor.id,action:'planning.tool',subject:id,detail:{name,identifier,due,previous:existing}})
  return {id}
}

/** Retirement removes eligibility, retaining the complete record and released bookings. */
export async function retirePlanningResource(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor,'site.manage')
  const kind=input.text('kind'), reason=input.text('reason',{max:500}), seen=input.integer('revision',{min:1})!
  insist(['qualification','tool'].includes(kind),'invalid_resource_kind')
  const member=kind==='qualification'?input.text('member'):'', name=kind==='qualification'?input.text('name'):''
  const record=kind==='qualification'
    ?await one(env,'SELECT * FROM gk_qualifications WHERE member_id=? AND name=?',member,name)
    :await one(env,'SELECT * FROM gk_planning_tools WHERE id=?',input.text('id'))
  insist(record,'resource_not_found',404)
  const bookings=kind==='tool'?await all(env,'SELECT * FROM gk_planning_bookings WHERE tool_id=?',record.id):[]
  const id=newId(), snapshot={...record,...(kind==='tool'?{bookings}:{})}
  await commit(env,[custody(env,actor),lock(env,seen),
    stmt(env,'INSERT INTO gk_retired_resources VALUES(?,?,?,?,?,?,?)',id,kind,kind==='tool'?record.id:record.record_id,JSON.stringify(snapshot),now(),actor.id,reason),
    ...(kind==='tool'?[stmt(env,'DELETE FROM gk_planning_bookings WHERE tool_id=?',record.id),stmt(env,'DELETE FROM gk_planning_tools WHERE id=?',record.id)]
      :[stmt(env,'DELETE FROM gk_qualifications WHERE member_id=? AND name=?',member,name)]),bump(env)],
    {actor:actor.id,action:'planning.retire',subject:id,detail:{kind,reason,snapshot}})
  return {id}
}

export async function savePlanningWindow(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor,'work.assign')
  const member=input.text('member'), kind=input.text('kind'), reason=input.text('reason',{max:200}), period=span(input), id=newId(), seen=input.integer('revision',{min:1})!
  insist(['available','absent'].includes(kind),'invalid_window_kind')
  insist(await active(env,member),'member_not_assignable',409)
  const windows=await all(env,'SELECT * FROM gk_planning_windows WHERE member_id=? AND kind=?',member,kind)
  insist(!windows.some(row=>overlap(row,period)), 'window_overlaps',409)
  await commit(env,[lock(env,seen),stmt(env,'INSERT INTO gk_planning_windows(id,member_id,starts,ends,kind,reason) VALUES(?,?,?,?,?,?)',id,member,period.starts,period.ends,kind,reason),bump(env)],
    {actor:actor.id,action:'planning.window',subject:id,detail:{member,kind,...period,reason}})
  return {id}
}

export async function removePlanningWindow(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor,'work.assign')
  const id=input.text('id'), reason=input.text('reason',{max:200}), seen=input.integer('revision',{min:1})!
  insist(await one(env,'SELECT 1 FROM gk_planning_windows WHERE id=?',id),'window_not_found',404)
  await commit(env,[lock(env,seen),stmt(env,'DELETE FROM gk_planning_windows WHERE id=?',id),bump(env)],{actor:actor.id,action:'planning.window.remove',subject:id,detail:{reason}})
  return {id}
}

export async function saveRequirements(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor,'work.assign')
  const work=input.text('workOrder'), names=input.text('qualifications',{optional:true,max:1000}).split(',').map(s=>s.trim()).filter(Boolean), seen=input.integer('revision',{min:1})!
  insist(names.length<=20 && names.every(n=>n.length<=80),'invalid_qualifications')
  insist(await one(env,`SELECT 1 FROM gk_work_orders WHERE id=? AND status IN ${OPEN}`,work),'work_order_not_open',409)
  await commit(env,[lock(env,seen),stmt(env,'INSERT INTO gk_work_requirements(work_order_id,qualifications) VALUES(?,?) ON CONFLICT(work_order_id) DO UPDATE SET qualifications=excluded.qualifications',work,JSON.stringify([...new Set(names)])),bump(env)],
    {actor:actor.id,action:'planning.requirements',subject:work,detail:{qualifications:names}})
  return {id:work}
}

async function constraints(env: Bindings, work: Row, period: Row, member: string, toolIds: string[]) {
  const conflicts: string[]=[]
  if(!await active(env,member)) conflicts.push('member_not_assignable')
  if(work.team_id&&!await one(env,'SELECT 1 FROM gk_team_members WHERE team_id=? AND member_id=?',work.team_id,member)) conflicts.push('assignee_not_in_team')
  if(work.trade&&!await one(env,'SELECT 1 FROM gk_team_members m JOIN gk_teams t ON t.id=m.team_id WHERE m.member_id=? AND t.trade=? COLLATE NOCASE',member,work.trade)) conflicts.push(`trade_required: ${work.trade}`)
  const windows=await all(env,'SELECT * FROM gk_planning_windows WHERE member_id=?',member)
  if(!windows.some(w=>w.kind==='available'&&w.starts<=period.starts&&w.ends>=period.ends)) conflicts.push('outside_availability')
  if(windows.some(w=>w.kind==='absent'&&overlap(w,period))) conflicts.push('person_absent')
  const requirements=await one(env,'SELECT qualifications FROM gk_work_requirements WHERE work_order_id=?',work.id)
  const names: string[]=JSON.parse(requirements?.qualifications??'[]')
  const quals=await all(env,'SELECT * FROM gk_qualifications WHERE member_id=?',member)
  for(const name of names) if(!quals.some(q=>q.name.toLowerCase()===name.toLowerCase()&&q.expires_on>=period.ends.slice(0,10))) conflicts.push(`qualification_required: ${name}`)
  const slots=await all(env,`SELECT s.* FROM gk_planning_slots s JOIN gk_work_orders w ON w.id=s.work_order_id WHERE s.work_order_id<>? AND w.status IN ${OPEN} AND s.starts<? AND s.ends>?`,work.id,period.ends,period.starts)
  if(slots.some(s=>s.member_id===member)) conflicts.push('person_double_booked')
  const tools=await all(env,'SELECT * FROM gk_planning_tools')
  const required=await all(env,'SELECT name FROM gk_work_tools WHERE work_order_id=?',work.id)
  const bom=work.asset_id ? await one(env,'SELECT id,tools FROM gk_bom_revisions WHERE asset_id=? ORDER BY number DESC LIMIT 1',work.asset_id) : null
  const reserved=await all(env,'SELECT * FROM gk_stock_reservations WHERE work_order_id=? AND released_at IS NULL',work.id)
  if(bom) {
    const asset=await one(env,'SELECT serial FROM gk_assets WHERE id=?',work.asset_id)
    const lines=await all(env,'SELECT * FROM gk_bom_lines WHERE revision_id=?',bom.id)
    for(const line of lines.filter(l=>fits(asset?.serial,l.serial_from,l.serial_to))) {
      const held=await one(env,`SELECT COALESCE(SUM(r.quantity_milli),0) AS n FROM gk_stock_reservations r WHERE r.work_order_id=? AND r.released_at IS NULL AND ${canonicalSql('r.requested_part_id')}=${canonicalSql('?')}`,work.id,line.part_id,line.part_id)
      if(held.n<line.quantity_milli) conflicts.push('parts_reservation_required')
    }
  }
  for(const part of new Set(reserved.map(r=>r.part_id))) {
    const stock=await one(env,`SELECT (SELECT COALESCE(SUM(quantity_milli),0) FROM gk_stock_moves WHERE part_id=p.id)-${RESERVED} AS available FROM gk_parts p WHERE p.id=?`,part)
    if(stock?.available<0) conflicts.push('reserved_part_shortage')
  }
  const requiredNames=[...required.map(r=>r.name),...String(bom?.tools??'').split('|').filter(Boolean)]
  for(const name of requiredNames) if(!tools.some(t=>t.name.toLowerCase()===name.toLowerCase()&&toolIds.includes(t.id))) conflicts.push(`tool_required: ${name}`)
  for(const id of toolIds) {
    const tool=tools.find(t=>t.id===id)
    if(!tool) {conflicts.push('tool_not_found');continue}
    if(tool.calibration_due<period.ends.slice(0,10)) conflicts.push(`tool_calibration_expired: ${tool.name}`)
    if(await one(env,`SELECT 1 FROM gk_planning_bookings b JOIN gk_planning_slots s ON s.work_order_id=b.work_order_id JOIN gk_work_orders w ON w.id=s.work_order_id WHERE b.tool_id=? AND b.work_order_id<>? AND w.status IN ${OPEN} AND s.starts<? AND s.ends>?`,id,work.id,period.ends,period.starts)) conflicts.push(`tool_double_booked: ${tool.name}`)
  }
  return conflicts
}

/** Preview and commit run the same checks; the global planning revision serializes resource writes. */
export async function planSlot(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor,'work.assign')
  const id=input.text('workOrder'), seen=input.integer('revision',{min:1})!, preview=input.flag('preview')
  const work=await one(env,`SELECT * FROM gk_work_orders WHERE id=? AND status IN ${OPEN}`,id)
  insist(work,'work_order_not_open',409)
  if(input.flag('remove')) {
    insist(!preview,'invalid_preview')
    await commit(env,[lock(env,seen),stmt(env,'DELETE FROM gk_planning_bookings WHERE work_order_id=?',id),stmt(env,'DELETE FROM gk_planning_slots WHERE work_order_id=?',id),bump(env)],{actor:actor.id,action:'planning.unschedule',subject:id})
    return {id}
  }
  insist(seen === await revision(env),'stale',409)
  const period=span(input), tools=[...new Set(input.list('tool'))]
  insist(tools.length<=20,'too_many_tools')
  insist(work.assignee_id,'work_unassigned',409)
  await assigneeFits(env,work.assignee_id,work.team_id)
  const auditSeq=(await one(env,'SELECT COALESCE(MAX(seq),0) AS n FROM gk_audit')).n
  const conflicts=await constraints(env,work,period,work.assignee_id,tools)
  if(preview) return {id,...period,conflicts,schedulable:!conflicts.length,revision:seen,pmDue:work.due_date,estimatedMinutes:minutesBetween(period.starts,period.ends)}
  insist(!conflicts.length,'planning_conflicts',409,{conflicts})
  await commit(env,[lock(env,seen),guard(env,'stale','(SELECT COALESCE(MAX(seq),0) FROM gk_audit)=?',auditSeq),guard(env,'stale',`EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=? AND status IN ${OPEN})`,id,work.version),
    guard(env,'stale',"EXISTS(SELECT 1 FROM gk_members WHERE id=? AND status='active' AND role IN ('owner','lead','maintainer')) AND (? IS NULL OR EXISTS(SELECT 1 FROM gk_team_members WHERE team_id=? AND member_id=?))",work.assignee_id,work.team_id,work.team_id,work.assignee_id),
    stmt(env,'DELETE FROM gk_planning_bookings WHERE work_order_id=?',id),
    stmt(env,'INSERT INTO gk_planning_slots(work_order_id,member_id,starts,ends) VALUES(?,?,?,?) ON CONFLICT(work_order_id) DO UPDATE SET member_id=excluded.member_id,starts=excluded.starts,ends=excluded.ends',id,work.assignee_id,period.starts,period.ends),
    ...tools.map(tool=>stmt(env,'INSERT INTO gk_planning_bookings(work_order_id,tool_id) VALUES(?,?)',id,tool)),bump(env)],
    {actor:actor.id,action:'planning.schedule',subject:id,detail:{...period,member:work.assignee_id,tools,pmDueUnchanged:work.due_date}})
  return {id}
}

/** Minutes of explicit availability, less its intersections with recorded absence. */
function capacity(windows: Row[], from: string, to: string) {
  const clip=(a: string,b: string)=>a<b?minutesBetween(a,b):0
  let available=0, unavailable=0
  for(const w of windows.filter(w=>w.kind==='available')) {
    const start=w.starts>from?w.starts:from,end=w.ends<to?w.ends:to
    available+=clip(start,end)
    for(const leave of windows.filter(w=>w.kind==='absent')) unavailable+=clip(leave.starts>start?leave.starts:start,leave.ends<end?leave.ends:end)
  }
  return {availableMinutes:available,unavailableMinutes:unavailable,capacityMinutes:available-unavailable}
}

export async function planningView(env: Bindings, actor: Actor, url: URL) {
  requireCapability(actor,'work.assign')
  const from=url.searchParams.get('from')||actor.today, days=url.searchParams.get('view')==='day'?1:7
  insist(isDate(from),'invalid_from')
  const end=addDays(from,days), start=`${from}T00:00`, finish=`${end}T00:00`
  const people=await all(env,"SELECT id,name FROM gk_members WHERE status='active' AND role IN ('owner','lead','maintainer') ORDER BY name")
  const windows=await all(env,'SELECT * FROM gk_planning_windows WHERE starts<? AND ends>? ORDER BY starts',finish,start)
  const tools=await all(env,'SELECT * FROM gk_planning_tools ORDER BY name')
  const qualifications=(await all(env,'SELECT * FROM gk_qualifications ORDER BY name,member_id')).map(q=>({
    member_id:q.member_id,name:q.name,expires_on:q.expires_on,recorded_at:q.recorded_at,
    provenance:QUALIFICATION_PROVENANCE,expired:q.expires_on<actor.today,
    ...(actor.role==='owner'?{reference:q.reference,record_id:q.record_id,recorded_by:q.recorded_by,remind_days:q.remind_days}:{})
  }))
  const retired=actor.role==='owner'?(await all(env,'SELECT r.*,m.name AS retired_by_name FROM gk_retired_resources r JOIN gk_members m ON m.id=r.retired_by ORDER BY r.retired_at,r.rowid')).map(r=>({...r,snapshot:JSON.parse(r.snapshot)})):[]
  const work=await all(env,`SELECT w.id,w.asset_id,w.number,w.title,w.assignee_id,w.team_id,w.trade,w.due_date,w.status,w.estimate_minutes,s.starts,s.ends,r.qualifications FROM gk_work_orders w LEFT JOIN gk_planning_slots s ON s.work_order_id=w.id LEFT JOIN gk_work_requirements r ON r.work_order_id=w.id WHERE w.status IN ${OPEN} ORDER BY w.due_date,w.number`)
  const bookings=await all(env,'SELECT * FROM gk_planning_bookings')
  const rows: Row[]=[]
  for(const w of work) {
    const toolIds=bookings.filter(b=>b.work_order_id===w.id).map(b=>b.tool_id)
    rows.push({...w,qualifications:JSON.parse(w.qualifications??'[]'),toolIds,plannedMinutes:w.starts?minutesBetween(w.starts,w.ends):0,
      conflicts:w.starts?await constraints(env,w,w,w.assignee_id,toolIds):[],overdue:w.due_date<actor.today})
  }
  const totals=people.map(person=>{
    const own=windows.filter(w=>w.member_id===person.id),limits=capacity(own,start,finish)
    const assigned=rows.filter(w=>w.assignee_id===person.id&&w.starts&&w.starts<finish&&w.ends>start).reduce((n,w)=>n+minutesBetween(w.starts<start?start:w.starts,w.ends>finish?finish:w.ends),0)
    return {...person,...limits,assignedMinutes:assigned}
  })
  const lower=zonedInstant(actor.zone,start), upper=zonedInstant(actor.zone,finish)
  const productive=await all(env,"SELECT e.person_id AS member,w.team_id,SUM((MIN(e.ended_at,?)-MAX(e.started_at,?))/60000.0) AS minutes FROM gk_labor_entries e JOIN gk_work_orders w ON w.id=e.work_order_id WHERE e.state='approved' AND e.category='wrench' AND e.started_at<? AND e.ended_at>? GROUP BY e.person_id,w.team_id",upper,lower,upper,lower)
  const legacy=await all(env,'SELECT recorded_by AS member,SUM(minutes) AS minutes FROM gk_time_entries WHERE worked_on>=? AND worked_on<? GROUP BY recorded_by',from,end)
  const teams=await all(env,'SELECT id,name FROM gk_teams ORDER BY name'), members=await all(env,'SELECT team_id,member_id FROM gk_team_members')
  const utilization=totals.map(p=>({...p,legacyRecordedMinutes:legacy.find(t=>t.member===p.id)?.minutes??0,productiveMinutes:productive.filter(t=>t.member===p.id).reduce((n,t)=>n+t.minutes,0),assignedRatio:p.capacityMinutes?p.assignedMinutes/p.capacityMinutes:null}))
  const aggregate=(group: typeof utilization)=>({availableMinutes:group.reduce((n,p)=>n+p.availableMinutes,0),unavailableMinutes:group.reduce((n,p)=>n+p.unavailableMinutes,0),capacityMinutes:group.reduce((n,p)=>n+p.capacityMinutes,0),assignedMinutes:group.reduce((n,p)=>n+p.assignedMinutes,0),productiveMinutes:group.reduce((n,p)=>n+p.productiveMinutes,0)})
  return {revision:await revision(env),from,end,days,people,windows,tools,qualifications,retired,work:rows,utilization,site:aggregate(utilization),teams:teams.map(t=>({...t,...aggregate(utilization.filter(p=>members.some(m=>m.team_id===t.id&&m.member_id===p.id))),assignedMinutes:rows.filter(w=>w.team_id===t.id&&w.starts&&w.starts<finish&&w.ends>start).reduce((n,w)=>n+minutesBetween(w.starts<start?start:w.starts,w.ends>finish?finish:w.ends),0),productiveMinutes:productive.filter(p=>p.team_id===t.id).reduce((n,p)=>n+p.minutes,0)}))}
}
