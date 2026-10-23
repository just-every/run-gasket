// Approval snapshots the current authorized rate; later rate changes reprice no approved time.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { addDays, localNow, zonedInstant } from './dates'
import type { Input } from './input'
import { entryFlags, laborMoney, managesLabor, pendingGuard } from './labor-records'

export async function setLaborRate(env: Bindings, actor: Actor, input: Input) {
  insist(managesLabor(actor),'forbidden',403)
  const person=input.text('person',{max:100})
  insist(await one(env,"SELECT 1 FROM gk_members WHERE id=? AND status='active' AND role IN ('owner','lead','maintainer')",person),'person_not_found',404)
  const cents=laborMoney(input), threshold=input.integer('overtimeAfterMinutes',{min:1,max:1440})!, multiplier=input.integer('overtimeMultiplier',{min:100,max:1000})!,id=newId()
  await commit(env,[stmt(env,'INSERT INTO gk_labor_rates(id,person_id,cents_per_hour,overtime_after_minutes,overtime_multiplier,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?)',id,person,cents,threshold,multiplier,actor.id,now())],{actor:actor.id,action:'labor.rate',subject:person,detail:{revision:id}})
  return {id}
}

function daySegments(row: Row, zone: string) {
  const segments:{start:number;end:number;day:string}[]=[]
  let cursor=row.started_at
  while(cursor<row.ended_at) {
    const day=localNow(zone,cursor).slice(0,10), end=Math.min(row.ended_at,zonedInstant(zone,`${addDays(day,1)}T00:00`))
    segments.push({start:cursor,end,day});cursor=end
  }
  return segments
}

export async function reviewLabor(env: Bindings, actor: Actor, input: Input) {
  insist(managesLabor(actor),'forbidden',403)
  const revision=await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM gk_audit')
  const entry=await one(env,'SELECT * FROM gk_labor_entries WHERE id=?',input.text('entry',{max:100}))
  insist(entry,'entry_not_found',404);insist(entry.state==='pending','already_reviewed',409)
  insist(!await one(env,"SELECT 1 FROM gk_labor_entries WHERE supersedes_id=? AND state='pending'",entry.id),'correction_pending',409)
  const decision=input.text('decision',{max:20}),reason=input.text('reason',{max:500})
  insist(['approve','reject'].includes(decision),'invalid_decision')
  const flags=await entryFlags(env,entry)
  const guards=[pendingGuard(env,entry),guard(env,'stale','(SELECT COALESCE(MAX(seq),0) FROM gk_audit)=?',revision.seq)]
  let cents:number|null=null,regular:number|null=null,overtime:number|null=null,rate:Row|null=null
  if(decision==='approve') {
    rate=await one(env,'SELECT * FROM gk_labor_rates WHERE person_id=? ORDER BY recorded_at DESC,rowid DESC LIMIT 1',entry.person_id)
    insist(rate,'labor_rate_required',409)
    // Snapshot isolation across every approval, correction and rate policy update.
    const approved=await all(env,"SELECT * FROM gk_labor_entries WHERE person_id=? AND state='approved' AND id<>?",entry.person_id,entry.supersedes_id??'')
    regular=0;overtime=0
    for(const segment of daySegments(entry,actor.zone)) {
      const start=zonedInstant(actor.zone,`${segment.day}T00:00`),end=zonedInstant(actor.zone,`${addDays(segment.day,1)}T00:00`)
      const already=approved.reduce((sum,row)=>sum+Math.max(0,Math.min(row.ended_at,end)-Math.max(row.started_at,start))/60000,0)
      const minutes=(segment.end-segment.start)/60000,straight=Math.min(minutes,Math.max(0,rate.overtime_after_minutes-already))
      regular+=straight;overtime+=minutes-straight
    }
    cents=Math.round(rate.cents_per_hour*(regular+overtime*rate.overtime_multiplier/100)/60)
    if(entry.supersedes_id) {
      guards.push(guard(env,'stale',"EXISTS(SELECT 1 FROM gk_labor_entries WHERE id=? AND state IN ('pending','approved'))",entry.supersedes_id))
      guards.push(stmt(env,"UPDATE gk_labor_entries SET state='superseded' WHERE id=?",entry.supersedes_id))
    }
  }
  await commit(env,[...guards,stmt(env,'UPDATE gk_labor_entries SET state=?,cents=?,regular_minutes=?,overtime_minutes=?,rate_id=?,reviewed_by=?,reviewed_at=?,review_reason=? WHERE id=?',decision==='approve'?'approved':'rejected',cents,regular,overtime,rate?.id??null,actor.id,now(),reason,entry.id)],{actor:actor.id,action:'labor.review',subject:entry.work_order_id,detail:{entry:entry.id,decision,reason,flags,supersedes:entry.supersedes_id}})
  return {id:entry.id,state:decision==='approve'?'approved':'rejected'}
}
