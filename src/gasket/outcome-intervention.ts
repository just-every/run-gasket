// Accepted interval applications and independently reviewed physical work retain their distinct authority.
import type {Bindings} from '../auth.server'
import {all,insist,one,type Row} from './core'
export async function outcomeIntervention(env:Bindings, proposal:string|null, workOrder:string|null) {
  insist(Boolean(proposal)!==Boolean(workOrder),'proposal_or_workOrder')
  if(proposal) {
    const change=await one<Row>(env,'SELECT * FROM gk_all_interval_changes WHERE proposal_id=?',proposal)
    insist(change,'approved_intervention_not_found',404)
    const state=await one<Row>(env,'SELECT * FROM gk_schedules WHERE id=?',change.schedule_id)
    insist(state?.asset_id,'schedule_not_found',404)
    const later=await all<Row>(env,'SELECT * FROM gk_all_interval_changes WHERE schedule_id=? AND revision>? ORDER BY revision',state.id,change.revision)
    return {kind:'interval',proposal,workOrder:null,asset:state.asset_id as string,approvedAt:change.approved_at as number,revision:change.revision as number,
      state,change,later,unchanged:Boolean(state.active&&state.every_days===change.after_days&&state.every_units===change.after_units&&!later.length),currentRevision:state.revision as number}
  }
  const state=await one<Row>(env,'SELECT * FROM gk_work_orders WHERE id=?',workOrder)
  insist(state?.asset_id,'asset_work_not_found',404)
  const review=await one<Row>(env,"SELECT * FROM gk_reviews WHERE work_order_id=? AND decision='approved' ORDER BY at DESC,rowid DESC LIMIT 1",workOrder)
  insist(review,'independent_review_required',409)
  return {kind:'work',proposal:null,workOrder,asset:state.asset_id as string,approvedAt:review.at as number,revision:state.version as number,
    state,change:null,later:[],unchanged:Boolean(state.status==='closed'&&state.version===review.version+1&&state.closed_by===review.reviewer),currentRevision:state.version as number}
}
