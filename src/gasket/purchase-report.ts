// BUY-003: obligations and explicit exceptions; no inferred bill or actual spend.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, now, one } from './core'
import { currentPolicySql } from './purchase-policy'

export async function spendReport(env:Bindings,actor:Actor) {
  requireCapability(actor,'work.review')
  const [policies,commitments,emergencies,releases,excluded,drafts,audit]=await Promise.all([
    all(env,`SELECT v.*,c.code AS cost_center_code,c.name AS cost_center_name ${currentPolicySql} LEFT JOIN gk_cost_centers c ON c.id=v.cost_center_id ORDER BY v.from_on,v.id`),
    all(env,`SELECT c.*,r.order_id,r.revision,p.number FROM gk_live_purchase_commitments c JOIN gk_purchase_revisions r ON r.id=c.revision_id JOIN gk_purchase_orders p ON p.id=r.order_id ORDER BY c.booked_on,c.revision_id`),
    all(env,`SELECT e.*,r.order_id,r.revision,p.number,m.name AS approver FROM gk_purchase_emergency_overrides e JOIN gk_purchase_revisions r ON r.id=e.revision_id JOIN gk_purchase_orders p ON p.id=r.order_id JOIN gk_members m ON m.id=e.approved_by ORDER BY e.confirmed_at,e.id`),
    all(env,`SELECT x.*,c.amount_cents,r.order_id,r.revision,p.number,m.name AS releaser FROM gk_purchase_commitment_releases x JOIN gk_purchase_commitments c ON c.revision_id=x.revision_id JOIN gk_purchase_revisions r ON r.id=x.revision_id JOIN gk_purchase_orders p ON p.id=r.order_id JOIN gk_members m ON m.id=x.released_by ORDER BY x.released_at,x.id`),
    all(env,`SELECT c.revision_id,c.amount_cents,c.booked_on,r.order_id,r.revision,p.number,CASE WHEN x.id IS NOT NULL THEN 'released' ELSE 'superseded_unsent' END AS exclusion FROM gk_purchase_commitments c JOIN gk_purchase_revisions r ON r.id=c.revision_id JOIN gk_purchase_orders p ON p.id=r.order_id LEFT JOIN gk_purchase_commitment_releases x ON x.revision_id=c.revision_id WHERE NOT EXISTS(SELECT 1 FROM gk_live_purchase_commitments live WHERE live.revision_id=c.revision_id) ORDER BY c.booked_on,c.revision_id`),
    all(env,`SELECT p.id,p.number,r.id AS revision_id,r.revision,json_extract(r.snapshot,'$.commitmentCents') AS commitment_cents FROM gk_purchase_orders p JOIN gk_purchase_revisions r ON r.order_id=p.id AND r.revision=p.current_revision LEFT JOIN gk_purchase_approvals a ON a.revision_id=r.id WHERE a.id IS NULL ORDER BY p.number`),
    one(env,'SELECT COALESCE(MAX(seq),0) AS sequence FROM gk_audit'),
  ])
  return {computedAt:now(),sourceRevision:audit.sequence,currency:'USD',budgets:policies.map(policy=>{
    const sources=commitments.filter(row=>row.booked_on>=policy.from_on&&row.booked_on<=policy.to_on&&(!policy.cost_center_id||row.cost_center_id===policy.cost_center_id))
    const committedCents=sources.reduce((sum,row)=>sum+row.amount_cents,0)
    return {...policy,budgetCents:policy.budget_cents,committedCents,remainingCents:policy.budget_cents-committedCents,overrunCents:Math.max(0,committedCents-policy.budget_cents),sources:sources.map(row=>({revisionId:row.revision_id,order:row.order_id,number:row.number,revision:row.revision,amountCents:row.amount_cents,bookedOn:row.booked_on,sourceDoor:`/api/gasket/purchase-orders/${row.order_id}`}))}
  }),commitments,excludedCommitments:excluded,draftsWithoutCompletedAuthority:drafts,emergencies:emergencies.map(row=>({...row,budgetImpact:JSON.parse(row.budget_impact)})),releases,
    policy:'Commitments are approved current revisions and retained sent revisions, each once, less explicit independent releases. Unsent superseded revisions cease to be obligations. Booking uses the original authorization day in the site time zone. No receipts, bills or posted actuals are inferred.'}
}
