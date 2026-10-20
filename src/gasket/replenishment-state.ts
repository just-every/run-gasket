import { UNMERGED, canonicalSql } from './part-identity'
// Read-only threshold evaluator shared by preview, worker and stores report.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, now, one, type Row } from './core'
import { CURRENT_REPLENISHMENT } from './replenishment-policy'
import { ON_HAND } from './parts'
import { RESERVED } from './reservations'
import { fromMilli } from './quantity'

export async function replenishmentInputs(env: Bindings, day: string) {
  const [policies,parts,documents,receipts,receiptLines,receiptEvents,envelopes,approvals,revocations,uses] = await Promise.all([
    all(env, `SELECT v.* ${CURRENT_REPLENISHMENT} ORDER BY v.part_id`), all(env, `SELECT p.*,${ON_HAND} AS on_hand,${RESERVED} AS reserved,(SELECT COALESCE(MAX(seq),0) FROM gk_stock_moves m WHERE m.part_id=p.id) AS seen FROM gk_parts p WHERE ${UNMERGED}`),
    all(env, 'SELECT * FROM gk_stock_replenishments ORDER BY opened_at,id'), all(env, 'SELECT id,revision_id FROM gk_receipts'), all(env, 'SELECT id,receipt_id,line_index,quantity_milli,quarantine_milli FROM gk_receipt_lines'),
    all(env, 'SELECT id,receipt_line_id,quarantine_delta,kind,quantity_milli FROM gk_receipt_events'), all(env, 'SELECT * FROM gk_replenishment_envelopes'),
    all(env, 'SELECT * FROM gk_replenishment_envelope_approvals'), all(env, 'SELECT * FROM gk_replenishment_envelope_revocations'), all(env, 'SELECT * FROM gk_replenishment_envelope_uses')])
  const [orders,orderRevisions,spendPolicies,spendSteps,commitments,members,suppliers,costCenters] = await Promise.all([
    all(env,'SELECT * FROM gk_purchase_orders'),all(env,'SELECT id,order_id,revision,snapshot,created_by FROM gk_purchase_revisions'),
    all(env,'SELECT v.* FROM gk_spend_policies h JOIN gk_spend_policy_revisions v ON v.policy_id=h.id AND v.revision=h.current_revision'),
    all(env,'SELECT * FROM gk_spend_policy_steps'),all(env,'SELECT * FROM gk_live_purchase_commitments'),all(env,'SELECT id,status,role FROM gk_members'),
    all(env,'SELECT id,active,revision,tax_treatment,tax_note FROM gk_suppliers'),all(env,'SELECT id,active FROM gk_cost_centers')])
  return { day, policies, parts, documents, receipts, receiptLines, receiptEvents, envelopes, approvals, revocations, uses, orders, orderRevisions, spendPolicies, spendSteps, commitments, members, suppliers, costCenters }
}

/** Includes receipts on the original revision and on a buyer's revised order. */
export async function replenishmentDocument(env: Bindings, document: Row, day: string): Promise<Row> {
  const order = await one(env, `SELECT p.current_revision,p.number,r.id AS current_revision_id,r.snapshot,s.state AS send_state FROM gk_purchase_orders p JOIN gk_purchase_revisions r ON r.order_id=p.id AND r.revision=p.current_revision LEFT JOIN gk_purchase_sends s ON s.revision_id=r.id WHERE p.id=?`, document.order_id)
  const snapshot = JSON.parse(order.snapshot)
  // A buyer's edit must be reviewed: do not infer that changed lines still buy this part.
  const changed = order.current_revision_id !== document.revision_id
  const receipts = await all(env, `SELECT l.*,COALESCE((SELECT SUM(e.quarantine_delta) FROM gk_receipt_events e WHERE e.receipt_line_id=l.id),0) AS quarantine_delta,
    COALESCE((SELECT SUM(e.quantity_milli) FROM gk_receipt_events e WHERE e.receipt_line_id=l.id AND e.kind='return'),0) AS returned FROM gk_stock_receipt_lines l JOIN gk_receipts r ON r.id=l.receipt_id WHERE r.revision_id=? AND l.line_index=0 AND l.part_id=?`, document.revision_id, document.part_id)
  const received = receipts.reduce((sum,row) => sum + row.quantity_milli,0), returned = receipts.reduce((sum,row) => sum + row.returned,0)
  const quarantine = receipts.reduce((sum,row) => sum + row.quarantine_milli + row.quarantine_delta,0)
  const outstanding = Math.max(0,document.quantity_milli-received+returned)
  return { ...document, number: order.number, currentRevision: order.current_revision, currentRevisionId: order.current_revision_id, changed,
    deliveryOn: snapshot.deliveryOn, sendState: order.send_state, receivedMilli: received, quarantineMilli: quarantine, returnedMilli: returned,
    outstandingMilli: outstanding, openDeliveryMilli: changed ? 0 : outstanding, ageDays: Math.max(0,Math.floor((now()-document.opened_at)/86_400_000)),
    overdue: outstanding > 0 && document.due_on <= day, outstanding: fromMilli(outstanding), received: fromMilli(received), quarantine: fromMilli(quarantine), returned: fromMilli(returned) }
}

export async function evaluateReplenishment(env: Bindings, day: string) {
  const input = await replenishmentInputs(env, day)
  const documents = await Promise.all(input.documents.map(row=>replenishmentDocument(env,row,day)))
  return input.policies.map(row => {
    const policy = JSON.parse(row.snapshot), part = input.parts.find(part=>part.id===row.part_id)!
    const own = documents.filter(doc=>doc.part_id===part.id), open = own.find(doc=>doc.closed_at===null) ?? own.find(doc=>doc.outstandingMilli>0 || doc.quarantineMilli>0) ?? null
    const available = part.on_hand-part.reserved, incoming = own.reduce((sum,doc)=>sum+doc.openDeliveryMilli,0)
    const below = available <= policy.minimum+policy.safety, shortage = Math.max(0,policy.maximum-available)
    const quantity = below ? Math.max(0,Math.max(policy.maximum-available,policy.reorder)-incoming) : 0
    return { id: row.id, created_by: row.created_by, revision: row.revision, policy, part, open, documents: own, availableMilli: available, incomingMilli: incoming,
      shortageMilli: shortage, quantityMilli: quantity, below, eligible: policy.active && policy.location===part.location,
      available: fromMilli(available), incoming: fromMilli(incoming), shortage: fromMilli(shortage), proposed: fromMilli(quantity) }
  })
}

export async function previewReplenishment(env: Bindings, actor: Actor) {
  requireCapability(actor, 'board.read')
  return { preview: true, day: actor.today, policies: await evaluateReplenishment(env, actor.today), noticeDelivery: 'In-app notices stored synchronously; external email/push alerts unavailable.' }
}
export async function openReplenishments(env: Bindings, actor: Actor) {
  requireCapability(actor, 'board.read')
  const rows = await all(env, `SELECT r.*,p.number AS part_number,p.name AS part_name,p.unit,p.location FROM gk_stock_replenishments r JOIN gk_parts p ON p.id=r.part_id WHERE r.closed_at IS NULL ORDER BY r.opened_at,r.id`)
  return await Promise.all(rows.map(row=>replenishmentDocument(env,row,actor.today)))
}
