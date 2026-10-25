import { auditFence, auditRevision } from './agent-follow-up'
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt } from './core'
import { Input } from './input'
import { parseSteps, type ChecklistItem } from './steps'
import { PM_LIBRARY } from './pm-library'

const latest = async (env:Bindings,id:string) => {
  const row=await one(env,`SELECT s.*,r.id AS revision_id,r.number,r.items_json,r.every_days,r.reference,r.note,r.created_by AS revision_author,a.approved_by,a.approved_at FROM gk_pm_strategies s JOIN gk_pm_strategy_revisions r ON r.strategy_id=s.id LEFT JOIN gk_pm_strategy_approvals a ON a.revision_id=r.id WHERE s.id=? ORDER BY r.number DESC LIMIT 1`,id)
  insist(row,'strategy_not_found',404);return row
}
export async function copyStrategy(env:Bindings,actor:Actor,input:Input) {
  requireCapability(actor,'register.manage')
  const template=PM_LIBRARY.find(t=>t.id===input.text('template'));insist(template,'template_not_found',404)
  const id=newId(),revision=newId(),name=input.text('name',{max:160}),category=input.text('category',{max:80})
  await commit(env,[stmt(env,'INSERT INTO gk_pm_strategies VALUES(?,?,?,?,?,?,?)',id,name,category,template.id,template.version,actor.id,now()),stmt(env,'INSERT INTO gk_pm_strategy_revisions VALUES(?,?,1,?,?,?,?,?,?)',revision,id,JSON.stringify(parseSteps(template.items,[])),template.everyDays,'Not yet reviewed','Library copy; adapt before approval',actor.id,now())],{actor:actor.id,action:'pm.copy',subject:id,detail:{library:template.id,version:template.version}})
  return {id,revision}
}
export async function adaptStrategy(env:Bindings,actor:Actor,input:Input) {
  requireCapability(actor,'register.manage')
  const strategy=await latest(env,input.text('strategy')),number=input.integer('number',{min:1})!
  insist(strategy.number===number,'stale',409)
  const items=parseSteps(input.list('items').flatMap(line=>line.split(/\r?\n/)).filter(Boolean),JSON.parse(strategy.items_json) as ChecklistItem[])
  insist(items.length>0&&items.length<=100,'invalid_items')
  const revision=newId(),days=input.integer('everyDays',{min:1,max:3660})!,reference=input.text('reference',{max:1000}),note=input.text('note',{max:1000})
  await commit(env,[guard(env,'stale','NOT EXISTS(SELECT 1 FROM gk_pm_strategy_revisions WHERE strategy_id=? AND number>?)',strategy.id,number),stmt(env,'INSERT INTO gk_pm_strategy_revisions VALUES(?,?,?,?,?,?,?,?,?)',revision,strategy.id,number+1,JSON.stringify(items),days,reference,note,actor.id,now())],{actor:actor.id,action:'pm.adapt',subject:strategy.id,detail:{revision,number:number+1,reference,note}})
  return {id:strategy.id,revision}
}
export async function approveStrategy(env:Bindings,actor:Actor,input:Input) {
  requireCapability(actor,'work.review')
  const strategy=await latest(env,input.text('strategy'))
  insist(strategy.revision_id===input.text('revision'),'stale',409)
  insist(strategy.number>1&&strategy.revision_author!==actor.id,'independent_adapted_strategy_required',409)
  const reason=input.text('reason',{max:1000})
  await commit(env,[guard(env,'stale','NOT EXISTS(SELECT 1 FROM gk_pm_strategy_revisions WHERE strategy_id=? AND number>?)',strategy.id,strategy.number),stmt(env,'INSERT INTO gk_pm_strategy_approvals VALUES(?,?,?,?)',strategy.revision_id,actor.id,now(),reason)],{actor:actor.id,action:'pm.approve',subject:strategy.id,detail:{revision:strategy.revision_id,reason}})
  return {id:strategy.id}
}
export async function strategyView(env:Bindings,actor:Actor) {
  requireCapability(actor,'board.read')
  return {library:PM_LIBRARY,strategies:await Promise.all((await all(env,'SELECT id FROM gk_pm_strategies ORDER BY created_at,id')).map(r=>latest(env,r.id))),rollouts:await all(env,'SELECT * FROM gk_pm_rollouts ORDER BY seq')}
}
export async function previewStrategy(env:Bindings,actor:Actor,input:Input) {
  insist(['owner','lead','supervisor'].includes(actor.role),'forbidden',403)
  const sourceAudit=await auditRevision(env),strategy=await latest(env,input.text('strategy'))
  insist(strategy.approved_by,'strategy_approval_required',409)
  const ids=input.list('schedules');insist(ids.length>0&&ids.length<=200&&new Set(ids).size===ids.length,'invalid_schedules')
  const rows=[]
  for(const id of ids) {
    const row=await one(env,`SELECT s.*,a.category,a.revision AS asset_revision,r.id AS procedure,r.items_json FROM gk_schedules s JOIN gk_assets a ON a.id=s.asset_id JOIN gk_checklist_revisions r ON r.checklist_id=s.checklist_id WHERE s.id=? AND a.retired_at IS NULL ORDER BY r.number DESC LIMIT 1`,id)
    insist(row&&row.category===strategy.category,'strategy_asset_class_mismatch',409)
    insist(!row.calibration,'calibration_strategy_not_supported',409)
    const binding=await one(env,'SELECT * FROM gk_pm_bindings WHERE schedule_id=?',id)
    insist(!binding||binding.strategy_id===strategy.id,'different_strategy_binding',409)
    const current={items:JSON.parse(row.items_json),everyDays:row.every_days},base=binding?JSON.parse(binding.base_json):current,proposed={items:JSON.parse(strategy.items_json),everyDays:row.every_days?strategy.every_days:null}
    const conflicts:string[]=[],merged={...proposed}
    for(const key of ['items','everyDays'] as const) {
      const local=JSON.stringify(current[key])!==JSON.stringify(base[key]),changed=JSON.stringify(proposed[key])!==JSON.stringify(base[key])
      if(local&&changed&&JSON.stringify(current[key])!==JSON.stringify(proposed[key]))conflicts.push(key)
      if(local)(merged as any)[key]=current[key]
    }
    const limits=await all(env,'SELECT source,min_days,max_days,reference FROM gk_interval_limits WHERE schedule_id=? AND revision=(SELECT MAX(revision) FROM gk_interval_limits l WHERE l.schedule_id=gk_interval_limits.schedule_id AND l.source=gk_interval_limits.source)',id)
    rows.push({id,trigger:{meter:row.meter_id,everyUnits:row.every_units,nextDueMeter:row.next_due_meter,when:row.trigger_when,value:row.trigger_value,reset:row.reset_value,sustainMinutes:row.sustain_minutes,combine:row.combine},revision:row.revision,asset:row.asset_id,assetRevision:row.asset_revision,procedure:row.procedure,title:row.title,base,current,proposed,merged,conflicts,limits,issued:await all(env,"SELECT id,number,checklist_revision_id,status FROM gk_work_orders WHERE schedule_id=? AND status NOT IN ('closed','cancelled')",id),due:row.next_due_date})
  }
  const data={occurrencePlans:{cancellation:'No issued work is cancelled or rewritten',catchUp:'Retain due dates and meter occurrences for ordinary work generation'},sourceAudit,strategy:strategy.id,revision:strategy.revision_id,category:strategy.category,rows}
  return {...data,hash:await sha256Hex(JSON.stringify(data))}
}
export async function rolloutStrategy(env:Bindings,actor:Actor,input:Input) {
  requireCapability(actor,'work.review')
  const strategy=await latest(env,input.text('strategy'))
  insist(strategy.revision_author!==actor.id,'independent_rollout_required',409)
  const preview=await previewStrategy(env,actor,input)
  insist(preview.hash===input.text('hash'),'stale_rollout',409)
  const occurrencePlan=input.text('occurrencePlan')
  insist(occurrencePlan==='preserve_issued_and_due','explicit_occurrence_plan_required')
  const decisions=input.has('decisions')?input.json('decisions') as Record<string,{choice:string;reason:string}>:Object.fromEntries(preview.rows.filter(r=>r.conflicts.length).map(r=>[r.id,{choice:input.text('choice_'+r.id),reason:input.text('reason_'+r.id,{max:1000})}]))
  insist(decisions&&typeof decisions==='object'&&!Array.isArray(decisions),'invalid_decisions')
  const statements=[auditFence(env,preview.sourceAudit),guard(env,'stale','NOT EXISTS(SELECT 1 FROM gk_pm_strategy_revisions WHERE strategy_id=? AND number>(SELECT number FROM gk_pm_strategy_revisions WHERE id=?))',preview.strategy,preview.revision)]
  for(const row of preview.rows) {
    const decision=decisions[row.id]
    if(row.conflicts.length)insist(decision&&['keep_local','use_program'].includes(decision.choice)&&typeof decision.reason==='string'&&decision.reason.trim().length>0&&decision.reason.length<=1000,'local_decision_required',409)
    const merged={...row.merged}
    if(row.conflicts.length&&decision.choice==='use_program')for(const key of row.conflicts)(merged as any)[key]=(row.proposed as any)[key]
    for(const limit of row.limits)insist(merged.everyDays===null||(limit.min_days===null||merged.everyDays>=limit.min_days)&&(limit.max_days===null||merged.everyDays<=limit.max_days),'strategy_interval_limit',409)
    const checklist=newId(),revision=newId()
    statements.push(guard(env,'stale','EXISTS(SELECT 1 FROM gk_schedules WHERE id=? AND revision=?) AND EXISTS(SELECT 1 FROM gk_assets WHERE id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM gk_checklist_revisions WHERE checklist_id=(SELECT checklist_id FROM gk_schedules WHERE id=?) AND number>(SELECT number FROM gk_checklist_revisions WHERE id=?))',row.id,row.revision,row.asset,row.assetRevision,row.id,row.procedure),stmt(env,'INSERT INTO gk_checklists(id,name,created_by,created_at) VALUES(?,?,?,?)',checklist,`Strategy ${preview.strategy} schedule ${row.id} revision ${preview.revision}`,actor.id,now()),stmt(env,'INSERT INTO gk_checklist_revisions(id,checklist_id,number,items_json,note,published_by,published_at) VALUES(?,?,1,?,?,?,?)',revision,checklist,JSON.stringify(merged.items),'Approved PM strategy rollout',actor.id,now()),stmt(env,'UPDATE gk_schedules SET checklist_id=?,every_days=?,revision=revision+1 WHERE id=?',checklist,merged.everyDays,row.id),stmt(env,`INSERT INTO gk_pm_bindings VALUES(?,?,?,?) ON CONFLICT(schedule_id) DO UPDATE SET revision_id=excluded.revision_id,base_json=excluded.base_json`,row.id,preview.strategy,preview.revision,JSON.stringify(row.proposed)))
  }
  const id=newId(),approvalDigest=await sha256Hex(JSON.stringify({preview,decisions,occurrencePlan}))
  statements.push(stmt(env,'INSERT INTO gk_pm_rollouts(id,strategy_id,revision_id,preview_json,decisions_json,occurrence_plan,applied_by,applied_at) VALUES(?,?,?,?,?,?,?,?)',id,preview.strategy,preview.revision,JSON.stringify({...preview,approvalDigest}),JSON.stringify(decisions),occurrencePlan,actor.id,now()))
  await commit(env,statements,{actor:actor.id,action:'pm.rollout',subject:preview.strategy,detail:{id,revision:preview.revision,hash:preview.hash,digest:approvalDigest,occurrencePlan,decisions}})
  return {id}
}
