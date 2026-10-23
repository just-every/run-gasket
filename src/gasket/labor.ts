// FIELD-006: retained time sources, private rate policy and approved hours.
import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { all, commit, guard, insist, now, one, type Row } from './core'
import type { Input } from './input'
import { duration, entryFlags, entryInsert, LABOR_CATEGORIES, laborCategory, laborInstant, laborMoney, laborWork, managesLabor } from './labor-records'

export async function recordLabor(env: Bindings, actor: Actor, input: Input) {
  const work = await laborWork(env, actor, input.text('workOrder', { max: 100 }))
  const person = input.text('person', { max: 100, optional: true }) || actor.id
  insist(managesLabor(actor) || person === actor.id, 'forbidden', 403)
  insist(await one(env, "SELECT 1 FROM gk_members WHERE id=? AND status='active' AND role IN ('owner','lead','maintainer')", person), 'person_not_found', 404)
  const started = laborInstant(actor,input,'started'), ended = laborInstant(actor,input,'ended')
  insist(ended > started, 'invalid_duration')
  const supersedes = input.text('supersedes', { max: 100, optional: true }) || null
  const original = supersedes ? await one(env, 'SELECT * FROM gk_labor_entries WHERE id=?', supersedes) : null
  const guards: D1PreparedStatement[] = []
  if (supersedes) {
    insist(original && original.work_order_id === work.id && original.person_id === person && ['pending','approved'].includes(original.state), 'invalid_correction', 409)
    insist(!await one(env,"SELECT 1 FROM gk_labor_entries WHERE supersedes_id=? AND state IN ('pending','approved')",supersedes), 'correction_pending',409)
    guards.push(guard(env,'stale',"EXISTS(SELECT 1 FROM gk_labor_entries WHERE id=? AND state IN ('pending','approved')) AND NOT EXISTS(SELECT 1 FROM gk_labor_entries WHERE supersedes_id=? AND state IN ('pending','approved'))",supersedes,supersedes))
  }
  const row = {work_order_id:work.id,person_id:person,category:laborCategory(input),started_at:started,ended_at:ended,reason:input.text('reason',{max:500}),supersedes_id:supersedes}
  const entry = entryInsert(env,actor,row)
  await commit(env,[...guards,entry.statement],{actor:actor.id,action:'labor.entry',subject:work.id,detail:{entry:entry.id,person,category:row.category,supersedes}})
  return {id:entry.id,pendingFlags:await entryFlags(env,{...row,id:entry.id})}
}

export async function recordContractorInvoice(env: Bindings, actor: Actor, input: Input) {
  insist(managesLabor(actor),'forbidden',403)
  const work = await laborWork(env,actor,input.text('workOrder',{max:100}))
  const contractor=input.text('contractor',{max:160}), reference=input.text('reference',{max:100}), cents=laborMoney(input)
  insist(cents>0,'invalid_amount')
  insist(!await one(env,'SELECT 1 FROM gk_contractor_invoices WHERE contractor=? AND reference=?',contractor,reference),'invoice_already_recorded',409)
  const minutes=input.integer('minutes',{min:0,max:1_000_000})!,note=input.text('note',{max:500})
  const id=crypto.randomUUID()
  await commit(env,[guard(env,'invoice_already_recorded','NOT EXISTS(SELECT 1 FROM gk_contractor_invoices WHERE contractor=? AND reference=?)',contractor,reference),env.DB.prepare('INSERT INTO gk_contractor_invoices(id,work_order_id,contractor,reference,minutes,cents,note,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,work.id,contractor,reference,minutes,cents,note,actor.id,now())],{actor:actor.id,action:'labor.invoice',subject:work.id,detail:{invoice:id,contractor,reference}})
  return {id}
}

export async function laborView(env: Bindings, actor: Actor, workOrder: string) {
  const mayManage=managesLabor(actor)
  const rows=await all(env,'SELECT e.*,m.name AS person,r.name AS reviewer FROM gk_labor_entries e JOIN gk_members m ON m.id=e.person_id LEFT JOIN gk_members r ON r.id=e.reviewed_by WHERE e.work_order_id=? ORDER BY e.started_at,e.recorded_at,e.id',workOrder)
  const entries=await Promise.all(rows.filter(row=>mayManage || row.person_id===actor.id).map(async row=>{
    const pendingFlags=row.state==='pending' ? await entryFlags(env,row) : []
    if(mayManage) return {...row,pendingFlags}
    const {cents:_c,rate_id:_r,regular_minutes:_regular,overtime_minutes:_overtime,...safe}=row
    return {...safe,pendingFlags}
  }))
  const approved=rows.filter(row=>row.state==='approved' && (mayManage || can(actor,'board.read') || row.person_id===actor.id))
  const people=mayManage ? await all(env,"SELECT id,name FROM gk_members WHERE status='active' AND role IN ('owner','lead','maintainer') ORDER BY name") : []
  const invoices=mayManage ? (await all(env,'SELECT * FROM gk_contractor_invoices WHERE work_order_id=? ORDER BY recorded_at,id',workOrder)).map(row=>({...row,state:'approved'})) : []
  return {entries,timer:await one(env,'SELECT * FROM gk_labor_timers WHERE person_id=?',actor.id),approvedMinutes:approved.reduce((sum,row)=>sum+duration(row),0),byCategory:Object.fromEntries(LABOR_CATEGORIES.map(category=>[category,approved.filter(row=>row.category===category).reduce((sum,row)=>sum+duration(row),0)])),people,invoices,mayManage,
    ...(mayManage ? {rates:await all(env,'SELECT * FROM gk_labor_rates ORDER BY recorded_at,id')} : {})}
}
