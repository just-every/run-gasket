// PART-005: deterministic drafts, retained follow-up and separately bounded ordering.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { automationAuthority } from './automation-context'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { addDays } from './dates'
import { Input } from './input'
import { approvalRoute } from './purchase-authority'
import { purchaseOrderDetail, savePurchaseOrder, sendPurchaseOrder } from './purchase-orders'
import { activeOwnerSql, replenishmentEnvelopes } from './replenishment-policy'
import { withReplenishmentPurchase } from './replenishment-purchasing'
import { evaluateReplenishment, openReplenishments, previewReplenishment } from './replenishment-state'
import { RESERVED } from './reservations'
import { fromMilli } from './quantity'
export { saveReplenishmentPolicy, saveReplenishmentEnvelope, approveReplenishmentEnvelope, revokeReplenishmentEnvelope, replenishmentSettings } from './replenishment-policy'
export { previewReplenishment, openReplenishments } from './replenishment-state'

function policyGuards(env: Bindings, row: Row) {
  return [guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM gk_part_canonical WHERE part_id=?)', row.part.id),guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_replenishment_policies h JOIN gk_replenishment_policy_revisions v ON v.part_id=h.part_id AND v.revision=h.current_revision WHERE v.id=?)`, row.id),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_parts WHERE id=? AND location IS ?)', row.part.id, row.policy.location),
    guard(env, 'stale', '(SELECT COALESCE(MAX(seq),0) FROM gk_stock_moves WHERE part_id=?)=?', row.part.id, row.part.seen),
    guard(env, 'stale', `(SELECT ${RESERVED} FROM gk_parts p WHERE p.id=?)=?`, row.part.id, row.part.reserved)]
}
function noticeStatements(env: Bindings, recipients: Row[], row: Row, id: string, order: string, occasion: string, text: string) {
  const job = automationAuthority()!
  return recipients.map(member=>stmt(env, `INSERT OR IGNORE INTO gk_notices(id,recipient_id,part_id,purchase_order_id,kind,occasion,text,created_at,automation_job_id,automation_revision) VALUES (?,?,?,?,'replenishment',?,?,?,?,?)`,
    newId(),member.id,row.part.id,order,`replenishment:${id}:${occasion}`,text,now(),job.job,job.revision))
}
function event(env: Bindings, id: string, occasion: string, facts: unknown) {
  const job = automationAuthority()!
  return stmt(env, 'INSERT OR IGNORE INTO gk_replenishment_events(id,replenishment_id,occasion,facts,at,automation_job_id,automation_revision) VALUES (?,?,?,?,?,?,?)', newId(),id,occasion,JSON.stringify(facts),now(),job.job,job.revision)
}

const submissionStatus: Record<string,string> = {
  accepted:'email_provider_accepted_mailbox_delivery_and_vendor_acknowledgment_unconfirmed',
  development:'local_email_suppressed_no_vendor_email_sent',
  uncertain:'email_submission_uncertain_do_not_resend', unconfirmed:'email_submission_unconfirmed_do_not_resend',
  rejected:'email_provider_rejected', rate_limited:'email_provider_rate_limited', failed:'email_submission_failed',
}
function retainedSubmission(state: string) {
  insist(Object.hasOwn(submissionStatus,state),'unknown_purchase_submission_state',409)
  return submissionStatus[state]
}

async function automaticOrder(env: Bindings, actor: Actor, row: Row) {
  const doc = row.open, policy = row.policy
  if (!policy.automatic || !policy.envelope || doc.changed) return 'manual_order'
  const order = await purchaseOrderDetail(env,actor,doc.order_id)
  if (order.current.send) return retainedSubmission(order.current.send.state)
  if (order.current.snapshot.supplier.id !== policy.supplier || order.current.snapshot.costCenter.id !== policy.costCenter) return 'purchase_policy_changed_review_required'
  const route = await approvalRoute(env,actor,order)
  // Automatic orders never make or use emergency decisions or impersonate an approver.
  if (route.legacy || route.required.length || route.emergency || route.blocked || !route.complete) return 'purchase_authority_pending'
  const envelope = await one(env, `SELECT e.*,a.approved_by,m.status AS approver_status,m.role AS approver_role FROM gk_replenishment_envelopes e LEFT JOIN gk_replenishment_envelope_approvals a ON a.envelope_id=e.id LEFT JOIN gk_members m ON m.id=a.approved_by WHERE e.id=? AND NOT EXISTS(SELECT 1 FROM gk_replenishment_envelope_revocations r WHERE r.envelope_id=e.id)`,policy.envelope)
  const amount = order.current.snapshot.commitmentCents
  if (!envelope || !envelope.approved_by || envelope.approver_status!=='active' || !['owner','supervisor'].includes(envelope.approver_role)
    || [envelope.created_by,actor.id,row.created_by,order.created_by,order.current.created_by].includes(envelope.approved_by)
    || envelope.supplier_id!==policy.supplier || envelope.cost_center_id!==policy.costCenter || actor.today<envelope.from_on || actor.today>envelope.to_on
    || amount>envelope.per_order_cents) return 'envelope_authority_pending'
  const spent = await one(env, 'SELECT COALESCE(SUM(amount_cents),0) AS n FROM gk_replenishment_envelope_uses WHERE envelope_id=? AND booked_on BETWEEN ? AND ?',envelope.id,envelope.from_on,envelope.to_on)
  if (spent.n+amount>envelope.period_limit_cents) return 'envelope_limit_reached'
  const job = automationAuthority()!
  const sent = await withReplenishmentPurchase({ operation:'send',actor:actor.id,
    before:[...policyGuards(env,row),
      guard(env,'stale','EXISTS(SELECT 1 FROM gk_stock_replenishments WHERE id=? AND revision_id=? AND closed_at IS NULL)',doc.id,order.current.id),
      guard(env,'stale',`EXISTS(SELECT 1 FROM gk_replenishment_envelopes e JOIN gk_replenishment_envelope_approvals a ON a.envelope_id=e.id JOIN gk_members m ON m.id=a.approved_by WHERE e.id=? AND e.supplier_id=? AND e.cost_center_id=? AND e.from_on<=? AND e.to_on>=? AND e.per_order_cents>=? AND a.approved_by NOT IN (?,?,?,?) AND m.status='active' AND m.role IN ('owner','supervisor') AND NOT EXISTS(SELECT 1 FROM gk_replenishment_envelope_revocations r WHERE r.envelope_id=e.id))`,envelope.id,policy.supplier,policy.costCenter,actor.today,actor.today,amount,envelope.created_by,actor.id,row.created_by,order.current.created_by),
      guard(env,'stale',`COALESCE((SELECT SUM(amount_cents) FROM gk_replenishment_envelope_uses WHERE envelope_id=? AND booked_on BETWEEN ? AND ?),0)+?<=?`,envelope.id,envelope.from_on,envelope.to_on,amount,envelope.period_limit_cents)],
    after:(_order,revision)=>[stmt(env,'INSERT INTO gk_replenishment_envelope_uses(revision_id,envelope_id,amount_cents,booked_on,at,automation_job_id,automation_revision) VALUES (?,?,?,?,?,?,?)',revision,envelope.id,amount,actor.today,now(),job.job,job.revision)] },()=>sendPurchaseOrder(env,actor,Input.of({order:order.id,revision:order.current_revision})))
  return retainedSubmission(sent.state)
}

export async function runReplenishment(env: Bindings, day: string) {
  insist(automationAuthority()?.rule==='replenishment','automation_required',403)
  const site = await one(env,'SELECT timezone FROM gk_site WHERE singleton=1')
  const recipients = await all(env,"SELECT id FROM gk_members WHERE status='active' AND role IN ('owner','lead') ORDER BY id")
  const created: string[] = [], followed: string[] = []
  for (const row of await evaluateReplenishment(env,day)) {
    if (!row.eligible) continue
    const member = await one(env,"SELECT id,email,name,role FROM gk_members WHERE id=? AND status='active' AND role='owner'",row.policy.purchaser)
    if (!member) continue
    // A named, active owner is accountable; no authentication session is fabricated.
    const actor: Actor = {...member, sessionId:'',zone:site.timezone,today:day}
    if (!row.open && row.below && row.quantityMilli>0) {
      const id=newId(), job=automationAuthority()!, due=addDays(day,row.policy.leadDays)
      const supplier = await one(env,'SELECT tax_treatment,tax_note FROM gk_suppliers WHERE id=?',row.policy.supplier)
      insist(supplier,'supplier_not_found',404)
      const result = await withReplenishmentPurchase({operation:'draft',actor:actor.id,
        before:[...policyGuards(env,row),guard(env,'stale','NOT EXISTS(SELECT 1 FROM gk_stock_replenishments WHERE part_id=? AND closed_at IS NULL)',row.part.id)],
        after:(order,revision)=>[
          stmt(env,'INSERT INTO gk_replenishments(id,part_id,policy_revision_id,order_id,revision_id,quantity_milli,opened_at,due_on,automation_job_id,automation_revision) VALUES (?,?,?,?,?,?,?,?,?,?)',id,row.part.id,row.id,order,revision,row.quantityMilli,now(),due,job.job,job.revision),
          event(env,id,'threshold',{available:row.available,incoming:row.incoming,quantity:row.proposed,policyRevision:row.revision}),
          ...noticeStatements(env,recipients,row,id,order,'threshold',`${row.part.number}: available ${row.available} ${row.part.unit}, trigger ${fromMilli(row.policy.minimum+row.policy.safety)}. Replenishment draft ${row.proposed} ${row.part.unit}; due ${due}. Stored in-app; no external alert sent.`)]},
        ()=>savePurchaseOrder(env,actor,Input.of({supplier:row.policy.supplier,costCenter:row.policy.costCenter,kind:['part'],description:[`${row.part.number}: ${row.part.name}`],quantity:[row.proposed],unit:[row.part.unit],unitPrice:[(row.policy.unitPrice/100).toFixed(2)],freight:((row.policy.freight ?? 0)/100).toFixed(2),salesTax:((row.policy.salesTax ?? 0)/100).toFixed(2),useTax:((row.policy.useTax ?? 0)/100).toFixed(2),deliveryOn:due,taxTreatment:supplier.tax_treatment,taxNote:row.policy.taxNote || supplier.tax_note,reason:`Replenishment for part ${row.part.number}; policy revision ${row.revision}. Freight and tax amounts are the human-entered policy values; no tax determination is made.`})))
      created.push(id)
      // Refresh facts after the atomic document claim, then evaluate order authority.
      const refreshed = (await evaluateReplenishment(env,day)).find(item=>item.part.id===row.part.id)!
      await automaticOrder(env,actor,refreshed)
      continue
    }
    if (!row.open) continue
    const doc=row.open
    if (doc.closed_at!==null) await commit(env,[...policyGuards(env,row),guard(env,'stale',activeOwnerSql,actor.id),
      guard(env,'stale','NOT EXISTS(SELECT 1 FROM gk_stock_replenishments WHERE part_id=? AND closed_at IS NULL)',row.part.id),
      stmt(env,'UPDATE gk_replenishments SET closed_at=NULL WHERE id=?',doc.id)],{actor:actor.id,action:'replenishment.reopen',subject:doc.id,detail:{reason:'Supplier return reopened the outstanding quantity'}})
    const status=await automaticOrder(env,actor,row)
    const complete=doc.outstandingMilli===0 && doc.quarantineMilli===0 && !doc.changed
    const occasion=complete?'received':`follow:${day}:${doc.receivedMilli}:${doc.returnedMilli}:${doc.quarantineMilli}:${status}`
    await commit(env,[...policyGuards(env,row),guard(env,'stale',activeOwnerSql,actor.id),
      event(env,doc.id,occasion,{available:row.available,remainingShortage:row.shortage,outstanding:doc.outstanding,quarantine:doc.quarantine,returned:doc.returned,due:doc.due_on,overdue:doc.overdue,changed:doc.changed,status}),
      ...(complete?[stmt(env,'UPDATE gk_replenishments SET closed_at=? WHERE id=? AND closed_at IS NULL',now(),doc.id)]:[]),
      ...noticeStatements(env,recipients,row,doc.id,doc.order_id,occasion,`${row.part.number}: ${complete?'delivery received':doc.changed?'purchase revision changed; buyer review required':doc.overdue?'delivery due; stores follow-up required':'replenishment open'}. Outstanding ${doc.outstanding}; quarantine ${doc.quarantine}; remaining stock shortage ${row.shortage} ${row.part.unit}. Due ${doc.due_on}. ${status.replace(/_/g,' ')}. Stored in-app; no external alert sent.`)],
      {actor:actor.id,action:'replenishment.follow',subject:doc.id,detail:{occasion,status,remainingShortage:row.shortage}})
    followed.push(doc.id)
  }
  return {created,runs:[],notices:await all(env,'SELECT id,recipient_id,kind FROM gk_notices WHERE automation_job_id=?',automationAuthority()!.job),followed}
}

export async function replenishmentView(env: Bindings, actor: Actor) {
  return {...await previewReplenishment(env,actor),open:await openReplenishments(env,actor),envelopes:await replenishmentEnvelopes(env,actor)}
}
