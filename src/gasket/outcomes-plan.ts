import { outcomeIntervention } from './outcome-intervention'
// AGENT-004: a human agrees the comparison window; agents measure and propose.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { daysBetween, isDate, localNow } from './dates'
import { Input } from './input'
import { assessOutcome, readOutcome } from './outcomes'
import { prepare } from './proposals'

export async function planOutcome(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const intervention = await outcomeIntervention(env,input.text('proposal',{optional:true})||null,input.text('workOrder',{optional:true})||null)
  insist(intervention.unchanged && (intervention.kind !== 'interval' || intervention.currentRevision === intervention.revision), 'intervention_changed', 409)
  const asset=await one<Row>(env,'SELECT category FROM gk_assets WHERE id=?',intervention.asset)
  const fields = ['baselineFrom','baselineTo','postFrom','postTo'] as const
  const dates = Object.fromEntries(fields.map(field => [field,input.text(field,{max:10})]))
  insist(fields.every(field => isDate(dates[field])), 'invalid_period')
  const day = localNow(actor.zone,intervention.approvedAt).slice(0,10)
  insist(dates.baselineFrom <= dates.baselineTo && dates.baselineTo < day && day <= dates.postFrom && dates.postFrom <= dates.postTo && daysBetween(dates.baselineFrom,dates.baselineTo) <= 366 && daysBetween(dates.postFrom,dates.postTo) <= 366, 'invalid_period')
  const peers = input.text('peers',{max:2100}).split(',').map(id=>id.trim()).filter(Boolean).sort()
  insist(peers.length > 0 && peers.length <= 20 && new Set(peers).size === peers.length && !peers.includes(intervention.asset), 'invalid_peers')
  for(const id of peers) insist(await one(env,'SELECT 1 FROM gk_assets WHERE id=? AND retired_at IS NULL AND category=?',id,asset!.category),'peer_not_comparable',409)
  const id = newId()
  await commit(env,[guard(env,'intervention_changed',intervention.kind==='interval'?'EXISTS(SELECT 1 FROM gk_schedules WHERE id=? AND revision=?)':"EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=? AND status='closed')",intervention.state.id,intervention.currentRevision),
    stmt(env,'INSERT INTO gk_outcome_windows (id,proposal_id,work_order_id,baseline_from,baseline_to,post_from,post_to,peers_json,source_revision,source_approved_at,recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',id,intervention.proposal,intervention.workOrder,dates.baselineFrom,dates.baselineTo,dates.postFrom,dates.postTo,JSON.stringify(peers),intervention.revision,intervention.approvedAt,actor.id,now())],
  {actor:actor.id,action:'outcome.window',subject:intervention.state.id,detail:{id,proposal:intervention.proposal,workOrder:intervention.workOrder,...dates,peers}})
  return {id}
}

/** Recompute before staging another human decision; retained reports never silently update. */
export async function outcomeFollowUp(env: Bindings, actor: Actor, input: Input, reversal: boolean) {
  requireCapability(actor,'proposal.prepare')
  const report = await readOutcome(env,actor,input.text('outcome'))
  const current = await assessOutcome(env,actor,Input.of({window:report.source.window}), false)
  insist(current.id === report.id,'outcome_stale',409,{current:current.id})
  if(reversal) {
    insist(report.status === 'worsening','outcome_not_worsening',409)
    const change = await one<Row>(env,'SELECT * FROM gk_all_interval_changes WHERE proposal_id=?',report.proposal)
    insist(change,'approved_intervention_not_found',404)
    return prepare(env,actor,Input.of({kind:'interval',reasoning:`Observed maintenance outcome: exposure-normalized performance worsened. Review the retained comparison and confounders before restoring the prior cadence.`,payload:{
      schedule:change.schedule_id,...(change.before_days?{everyDays:String(change.before_days)}:{}),...(change.before_units?{everyUnits:change.before_units}:{}),
      from:report.source.windows.baseline.from,to:report.source.windows.baseline.to,peers:report.source.peers.join(','),
      rollbackOf:change.proposal_id,rollbackPlan:input.text('rollbackPlan',{max:2000}),outcome:report.id,
    }}))
  }
  insist(['unproven','worsening','no_improvement'].includes(report.status),'investigation_not_required',409)
  return prepare(env,actor,Input.of({kind:'corrective',reasoning:`Investigate measured outcome: ${report.status}. ${report.recommendedAction}`,payload:{
    asset:report.subject.asset,title:'Investigate measured maintenance outcome',description:report.uncertainty.join(' '),due:actor.today,outcome:report.id,
  }}))
}
