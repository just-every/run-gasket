// Connect committed maintenance facts to the finite rule vocabulary.
import type { Bindings } from '../auth.server'
import { all, one, type Audit } from './core'
import { runRules, type RuleEvent } from './rules'
import { today } from './dates'
export async function dispatchRuleEvents(env: Bindings, events: Audit[], sequences: number[]) {
  if (!events.some(e=>!e.action.startsWith('rules.')) || !await one(env,'SELECT 1 FROM gk_rules LIMIT 1')) return
  for (const [index,event] of events.entries()) {
    const detail = event.detail && typeof event.detail === 'object' ? event.detail as Record<string,any> : {}
    const found: RuleEvent[] = []
    const add=(trigger:RuleEvent['trigger'],entityType:RuleEvent['entityType'],entityId:string)=>found.push({trigger,entityType,entityId})
    if(detail.statusChanged)add('work.status_changed','work',detail.workOrder??event.subject)
    if(event.action==='request.submit')add('request.submitted','request',event.subject)
    if(['workorder.create','workorder.generate','workorder.schedule','workorder.trigger'].includes(event.action))add('work.created','work',event.subject)
    if(['workorder.submit','workorder.approve','workorder.return','workorder.cancel','workorder.reopen','workorder.merged','workorder.merge'].includes(event.action))add('work.status_changed','work',event.subject)
    if(['asset.state','downtime.start','downtime.end','asset.retire'].includes(event.action))add('asset.status_changed','asset',event.subject)
    if(event.action==='meter.feed' && detail.reading)add('meter.recorded','reading',detail.reading)
    if(event.action==='workorder.readings')for(const reading of detail.recorded??[])if(reading.reading)add('meter.recorded','reading',reading.reading)
    if(event.action==='workorder.results' && (detail.recorded??[]).some((r:any)=>r.outcome==='fail'))add('checklist.failed','work',event.subject)
    if(['part.create','part.receive','part.count','part.issue','part.return','part.disposition'].includes(event.action)) {
      const part=detail.part??event.subject
      if(await one(env,'SELECT 1 FROM gk_parts p WHERE p.id=? AND (SELECT COALESCE(SUM(quantity_milli),0) FROM gk_stock_moves WHERE part_id=p.id)<p.minimum_milli',part))add('part.below_minimum','part',part)
    }
    for(const [n,source] of found.entries())await runRules(env,{...source,sourceId:`audit:${sequences[index]}:${n}`})
  }
}
export async function overdueRuleEvents(env:Bindings,instant:number) {
  if(!await one(env,'SELECT 1 FROM gk_rules LIMIT 1'))return
  const zone=(await one(env,'SELECT timezone FROM gk_site WHERE singleton=1'))?.timezone??'UTC',day=today(zone,instant)
  const rows=await all(env,"SELECT id,due_date FROM gk_work_orders WHERE status IN ('open','in_progress','returned') AND due_date<?",day)
  for(const row of rows)await runRules(env,{trigger:'work.overdue',entityType:'work',entityId:row.id,sourceId:`overdue:${row.id}:${row.due_date}:${day}`,at:instant,source:'cron'})
}
