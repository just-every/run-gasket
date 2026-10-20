// BUY-006: what each submitted order still owes, the owner's vendor follow-up
// rule and the reminders and escalations that rule makes due on a site day.
// One evaluator serves the page, the JSON door, the worker's retained inputs
// and its read-only preview.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, now, one, stmt, type Row } from './core'
import { daysBetween, today as siteDay } from './dates'
import type { Input } from './input'
import { fromMilli } from './quantity'

/** Submissions the vendor may hold; rejected, rate-limited and failed sends never reached them. */
export const SUBMITTED = "('accepted','development','uncertain','unconfirmed')"
export const OCCASIONS = { acknowledgment: 'Acknowledgment requested', late: 'Late delivery' } as const

export const followRule = async (env: Bindings) => await one(env, 'SELECT * FROM gk_vendor_follow_rules ORDER BY number DESC LIMIT 1')

/** The owner, acting as buyer until ADMIN-003, approves a new numbered rule revision. */
export async function setFollowRule(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const seen = input.integer('rule', { min: 0, max: 1_000_000 })!, number = seen + 1
  const value = { acknowledgment_days: input.integer('acknowledgmentDays', { min: 0, max: 30 })!, late_days: input.integer('lateDays', { min: 1, max: 30 })!, escalation_days: input.integer('escalationDays', { min: 1, max: 60 })! }
  await commit(env, [guard(env, 'stale', '(SELECT COALESCE(MAX(number),0) FROM gk_vendor_follow_rules)=?', seen),
    stmt(env, 'INSERT INTO gk_vendor_follow_rules(number,acknowledgment_days,late_days,escalation_days,approved_by,approved_at) VALUES (?,?,?,?,?,?)', number, value.acknowledgment_days, value.late_days, value.escalation_days, actor.id, now())],
  { actor: actor.id, action: 'vendor.rule', subject: `vendor-rule-${number}`, detail: value })
  return { id: String(number), number }
}

/** Planners until ADMIN-003 adds the role: every active lead, or the owners when there is none. */
export async function planners(env: Bindings) {
  const members = await all(env, "SELECT id,role FROM gk_members WHERE status='active' AND role IN ('lead','owner') ORDER BY id")
  const leads = members.filter(row => row.role === 'lead')
  return (leads.length ? leads : members).map(row => row.id as string)
}

const escalationOccasion = (revisionId: string) => `vendor:${revisionId}:escalation`

async function followed(env: Bindings, row: Row, day: string, zone: string, rule: Row | null) {
  const snapshot = JSON.parse(row.snapshot)
  const [delivered, returned, receipts, acknowledgment, reminders, escalations, work] = await Promise.all([
    all(env, 'SELECT l.line_index,SUM(l.quantity_milli) AS n FROM gk_receipt_lines l JOIN gk_receipts r ON r.id=l.receipt_id WHERE r.revision_id=? GROUP BY l.line_index', row.revision_id),
    all(env, "SELECT l.line_index,SUM(e.quantity_milli) AS n FROM gk_receipt_events e JOIN gk_receipt_lines l ON l.id=e.receipt_line_id JOIN gk_receipts r ON r.id=l.receipt_id WHERE r.revision_id=? AND e.kind='return' GROUP BY l.line_index", row.revision_id),
    all(env, 'SELECT id,external_id,backorder_note,created_at FROM gk_receipts WHERE revision_id=? ORDER BY created_at,id', row.revision_id),
    one(env, 'SELECT contact,reference,note,recorded_at FROM gk_purchase_acknowledgments WHERE send_id=? ORDER BY recorded_at DESC,id DESC LIMIT 1', row.send_id),
    all(env, 'SELECT id,occasion,day,recipient,state,error,provider,provider_message_id,claimed_at,finished_at,rule_number,automation_job_id,automation_revision FROM gk_vendor_reminders WHERE revision_id=? ORDER BY claimed_at,id', row.revision_id),
    all(env, 'SELECT n.created_at,n.automation_job_id,m.name AS recipient FROM gk_notices n JOIN gk_members m ON m.id=n.recipient_id WHERE n.occasion=? ORDER BY n.created_at,m.name', escalationOccasion(row.revision_id)),
    snapshot.work ? one(env, 'SELECT id,number,title,status FROM gk_work_orders WHERE id=?', snapshot.work.id) : null])
  const sum = (rows: Row[], index: number) => rows.find(item => item.line_index === index)?.n ?? 0
  const lines = snapshot.lines.map((line: Row, index: number) => {
    const received = sum(delivered, index), back = sum(returned, index), outstanding = Math.max(0, line.quantityMilli - received + back)
    return { line: index, kind: line.kind, description: line.description, unit: line.unit, ordered: line.quantity, delivered: fromMilli(received), returned: fromMilli(back), outstanding: fromMilli(outstanding), outstandingMilli: outstanding, deliveredMilli: received }
  })
  const open = lines.some((line: Row) => line.outstandingMilli > 0), deliveries = receipts.map(item => ({ ...item, day: siteDay(zone, item.created_at) }))
  const promisedOn: string = snapshot.deliveryOn, sentOn = siteDay(zone, row.claimed_at)
  const lateDays = open && day > promisedOn ? daysBetween(promisedOn, day) : 0
  const lastDelivery = deliveries.at(-1)?.day ?? null
  const status = !open ? 'complete' : lines.some((line: Row) => line.deliveredMilli > 0) ? 'partial' : 'awaiting'
  const workOpen = Boolean(work && ['open', 'in_progress', 'returned'].includes(work.status))
  const partsBlocker = workOpen && lines.some((line: Row) => line.kind === 'part' && line.outstandingMilli > 0)
  const due: Row[] = []
  if (rule && open && row.supplier_active) {
    const reminded = (occasion: string) => reminders.some(item => item.occasion === occasion)
    if (!acknowledgment && daysBetween(sentOn, day) >= rule.acknowledgment_days && !reminded('acknowledgment')) due.push({ kind: 'reminder', occasion: 'acknowledgment' })
    if (lateDays >= rule.late_days && !reminded('late')) due.push({ kind: 'reminder', occasion: 'late' })
    if (partsBlocker && lateDays >= rule.escalation_days && !escalations.length) due.push({ kind: 'escalation', occasion: escalationOccasion(row.revision_id) })
  }
  return {
    orderId: row.order_id, number: row.number, revision: row.revision, revisionId: row.revision_id, currentRevision: row.revision === row.current_revision,
    supplier: { id: snapshot.supplier.id, name: snapshot.supplier.name, active: Boolean(row.supplier_active) }, recipient: row.recipient,
    sendState: row.send_state, sentOn, promisedOn, deliveries: deliveries.map(item => ({ day: item.day, externalId: item.external_id, backorderNote: item.backorder_note })),
    lastDeliveryOn: lastDelivery, deliveredLateDays: !open && lastDelivery && lastDelivery > promisedOn ? daysBetween(promisedOn, lastDelivery) : 0,
    acknowledgment, status, late: lateDays > 0, lateDays, lines: lines.map(({ outstandingMilli: _o, deliveredMilli: _d, ...line }: Row) => line),
    work: work ? { id: work.id, number: work.number, title: work.title, status: work.status } : null, partsBlocker, reminders, escalations, due,
  }
}

/** Every order's latest submitted revision on the site day `day`; open orders first. */
export async function followUps(env: Bindings, day: string) {
  const zone = (await one(env, 'SELECT timezone FROM gk_site WHERE singleton=1'))?.timezone ?? 'UTC', rule = await followRule(env)
  const rows = await all(env, `SELECT p.id AS order_id,p.number,p.current_revision,r.id AS revision_id,r.revision,r.snapshot,s.id AS send_id,s.state AS send_state,s.recipient,s.claimed_at,
    (SELECT active FROM gk_suppliers WHERE id=json_extract(r.snapshot,'$.supplier.id')) AS supplier_active
    FROM gk_purchase_orders p JOIN gk_purchase_revisions r ON r.order_id=p.id JOIN gk_purchase_sends s ON s.revision_id=r.id
    WHERE s.state IN ${SUBMITTED} AND r.revision=(SELECT MAX(x.revision) FROM gk_purchase_revisions x JOIN gk_purchase_sends y ON y.revision_id=x.id WHERE x.order_id=p.id AND y.state IN ${SUBMITTED})
    ORDER BY p.number DESC`)
  const orders = await Promise.all(rows.map(row => followed(env, row, day, zone, rule)))
  return { day, rule, orders: [...orders.filter(row => row.status !== 'complete'), ...orders.filter(row => row.status === 'complete')] }
}

/** The page's and JSON door's read: no writes; `pending` is exactly what the next run would do. */
export async function vendorFollowUp(env: Bindings, actor: Actor) {
  const data = await followUps(env, actor.today)
  return { ...data, preview: true, pending: data.orders.flatMap(row => row.due.map((action: Row) => ({ ...action, orderId: row.orderId, number: row.number, revision: row.revision }))),
    autoBuyLimits: 'Automatic orders use PART-005 envelopes: each approved envelope caps every order and its inclusive site-local period in USD, in addition to BUY-003 budgets.' }
}
