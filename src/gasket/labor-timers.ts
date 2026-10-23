import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { entryInsert, laborCategory, laborWork } from './labor-records'

export async function laborTimer(env: Bindings, actor: Actor, input: Input) {
  insist(can(actor,'work.do'),'forbidden',403)
  const order=await laborWork(env,actor,input.text('workOrder',{max:100})), operation=input.text('operation',{max:20})
  insist(['start','pause','resume','stop'].includes(operation),'invalid_operation')
  const current=await one(env,'SELECT * FROM gk_labor_timers WHERE person_id=?',actor.id)
  const statements:D1PreparedStatement[]=[],at=now()
  let entryId:string|null=null, id=current?.id??newId()
  if(operation==='start') {
    insist(['open','in_progress','returned'].includes(order.status),'work_order_not_open',409)
    insist(!current,'timer_already_active',409)
    const category=laborCategory(input)
    statements.push(guard(env,'timer_already_active','NOT EXISTS(SELECT 1 FROM gk_labor_timers WHERE person_id=?)',actor.id),stmt(env,"INSERT INTO gk_labor_timers(id,person_id,work_order_id,category,state,started_at) VALUES(?,?,?,?,'running',?)",id,actor.id,order.id,category,at))
  } else {
    insist(current && current.work_order_id===order.id,'timer_not_found',409)
    statements.push(guard(env,'stale','EXISTS(SELECT 1 FROM gk_labor_timers WHERE id=? AND revision=?)',current.id,current.revision))
    if(operation==='resume') {
      insist(current.state==='paused','timer_not_paused',409)
      insist(['open','in_progress','returned'].includes(order.status),'work_order_not_open',409)
      statements.push(stmt(env,"UPDATE gk_labor_timers SET state='running',started_at=?,revision=revision+1 WHERE id=?",at,current.id))
    } else {
      insist(operation==='stop' || current.state==='running','timer_not_running',409)
      if(current.state==='running') {
        insist(at>current.started_at,'timer_too_short',409)
        const entry=entryInsert(env,actor,{work_order_id:order.id,person_id:actor.id,category:current.category,started_at:current.started_at,ended_at:at,reason:`Timer ${operation}`,timer_id:current.id})
        statements.push(entry.statement);entryId=entry.id
      }
      statements.push(operation==='stop'?stmt(env,'DELETE FROM gk_labor_timers WHERE id=?',current.id):stmt(env,"UPDATE gk_labor_timers SET state='paused',started_at=NULL,revision=revision+1 WHERE id=?",current.id))
    }
  }
  await commit(env,statements,{actor:actor.id,action:'labor.timer',subject:order.id,detail:{timer:id,operation,entry:entryId}})
  return {id,entry:entryId}
}
