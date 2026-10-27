// Clause 11: one asset's whole history, in time order, with who did what.
// The CSV download is the same rows; installation export/restore is Base's.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, insist, one } from './core'
import { showInstant, showLocal, zonedInstant } from './dates'
import { assetDetail } from './assets'
import { fromMilli, showNumber } from './quantity'
import { usd } from './bad-actors'

export interface Event { when: string; at: number; kind: string; workOrder: string | null; what: string; who: string | null }

const name = (row: { who?: string | null }) => row.who ?? null

export async function assetHistory(env: Bindings, actor: Actor, id: string) {
  const asset = await assetDetail(env, actor, id)
  const orders = await all(env, `SELECT w.id, w.number, w.title, w.kind, w.status, w.due_date, w.created_at, w.closed_at, c.name AS checklist, r.number AS revision
    FROM gk_work_orders w LEFT JOIN gk_checklist_revisions r ON r.id = w.checklist_revision_id LEFT JOIN gk_checklists c ON c.id = r.checklist_id WHERE w.asset_id = ? ORDER BY w.number`, id)
  const number = new Map(orders.map(order => [order.id, `WO-${String(order.number).padStart(4, '0')}`]))
  const events: Event[] = []
  const push = (at: number, kind: string, workOrder: string | null, what: string, who: string | null) => events.push({ when: showInstant(at, actor.zone), at, kind, workOrder: workOrder ? number.get(workOrder) ?? null : null, what, who })
  for (const row of await all(env, `SELECT a.at, a.action, a.subject, a.detail, m.name AS who FROM gk_audit a LEFT JOIN gk_members m ON m.id = a.actor
    WHERE a.subject = ? OR a.subject IN (SELECT id FROM gk_work_orders WHERE asset_id = ?) OR (a.action = 'asset.move' AND ? IN (json_extract(a.detail, '$.from'), json_extract(a.detail, '$.to'))) ORDER BY a.seq`, id, id, id)) {
    const detail = JSON.parse(row.detail)
    const labels: Record<string, string> = {
      'asset.create': 'Asset registered',
      // ASSET-001: a move shows on the entry and on the parents it left and joined.
      'asset.move': row.subject === id ? `Moved from ${detail.fromTag ?? 'the site'} to ${detail.toTag ?? 'the site'}` : detail.to === id ? `${detail.tag} moved here from ${detail.fromTag ?? 'the site'}` : `${detail.tag} moved to ${detail.toTag ?? 'the site'}`, 'asset.update': 'Asset details changed', 'asset.retire': `Asset retired: ${detail.reason ?? ''}${detail.disposal ? ` (${detail.disposal.method} on ${detail.disposal.disposedOn})` : ''}`,
      'asset.lifecycle': `Lifecycle record revision ${detail.revision} saved`, 'asset.agreement': `Service agreement recorded: ${detail.provider ?? ''} ${detail.startsOn ?? ''} to ${detail.endsOn ?? ''}`,
      'asset.sighting': `Sighting: ${detail.outcome}${detail.seen ? ` at ${detail.seen}` : ''}`,
      'asset.state': `${detail.corrects ? `Reclassified ${String(detail.was).replace(/_/g, ' ')} as` : 'Declared'} ${String(detail.state).replace(/_/g, ' ')} from ${showLocal(detail.effectiveOn)}: ${detail.reason}`, 'workorder.generate': 'Work order created from its schedule',
      'workorder.create': 'Work order created', 'workorder.assign': 'Work order assigned', 'workorder.plan': `Overdue decision: ${detail.plan === 'keep' ? 'kept with the assignee' : detail.plan === 'as_is' ? 'kept as is' : 'reassigned'}`, 'workorder.cancel': `Work order cancelled: ${detail.reason ?? ''}`,
      'workorder.submit': 'Submitted for review', 'workorder.approve': 'Reviewed and closed', 'workorder.return': `Returned for more work: ${detail.reason ?? ''}`,
      'workorder.evidence': `Evidence attached: ${detail.filename ?? ''}${detail.item !== undefined ? ` for step ${detail.item + 1}` : ''}`,
      'step.except': `Exception on step ${Number(detail.item) + 1}: ${detail.reason ?? ''}`,
      'bom.revise': `Bill of materials revision ${detail.revision} saved${detail.note ? `: ${detail.note}` : ''}`,
      'downtime.classify': `Stop reclassified from ${detail.from?.planned ? 'planned' : `failure${detail.from?.failureMode ? ` (${detail.from.failureMode})` : ''}`} to ${detail.to?.planned ? 'planned' : `failure${detail.to?.failureMode ? ` (${detail.to.failureMode})` : ''}`}: ${detail.reason ?? ''}`,
    }
    if (labels[row.action]) push(row.at, row.action.split('.')[0], row.subject === id ? null : row.subject, labels[row.action].trim(), name(row))
  }
  for (const row of await all(env, 'SELECT r.work_order_id, r.item, r.outcome, r.value, r.note, r.recorded_at, m.name AS who, w.checklist_revision_id FROM gk_result_log r JOIN gk_work_orders w ON w.id = r.work_order_id LEFT JOIN gk_members m ON m.id = r.recorded_by WHERE w.asset_id = ? ORDER BY r.seq', id)) {
    push(row.recorded_at, 'result', row.work_order_id, `Checklist item ${row.item + 1}: ${row.outcome === 'attention' ? 'needs attention' : row.outcome}${row.value !== null ? ` at ${row.value}` : ''}${row.note ? ` (${row.note})` : ''}`, name(row))
  }
  for (const row of await all(env, 'SELECT r.work_order_id, r.value, r.taken_on, r.entered_at, r.origin, r.provenance, r.source, r.quality, g.name AS meter, g.unit, m.name AS who FROM gk_readings r JOIN gk_meters g ON g.id = r.meter_id LEFT JOIN gk_members m ON m.id = r.entered_by WHERE r.asset_id = ? ORDER BY r.taken_on, r.entered_at, g.name, r.id', id)) {
    push(row.entered_at, 'reading', row.work_order_id, `${row.meter}: ${row.unit === 'condition' ? row.value : showNumber(row.value)}${row.unit && row.unit !== 'condition' ? `\u00a0${row.unit}` : ''}, taken ${showLocal(row.taken_on)}${row.origin === 'import' ? ' (moved in)' : ''}${row.provenance === 'feed' ? ` (feed: ${row.source}${row.quality === 'good' ? '' : `, ${row.quality}`})` : ''}`, name(row))
  }
  for (const row of await all(env, 'SELECT j.kind, j.effective_on, j.last_value, j.start_value, j.value, j.reason, j.recorded_at, g.name AS meter, g.unit, r.value AS was, m.name AS who FROM gk_meter_adjustments j JOIN gk_meters g ON g.id = j.meter_id LEFT JOIN gk_readings r ON r.id = j.reading_id LEFT JOIN gk_members m ON m.id = j.recorded_by WHERE g.asset_id = ? ORDER BY j.recorded_at, j.id', id)) {
    const what = row.kind === 'correction' ? `reading of ${row.was} taken ${showLocal(row.effective_on)} corrected to ${row.value}` : `counter ${row.kind} at ${showLocal(row.effective_on)}: last ${showNumber(row.last_value)}, new counter starts at ${showNumber(row.start_value)}`
    push(row.recorded_at, 'meter', null, `${row.meter}: ${what} (${row.reason})`, name(row))
  }
  for (const row of await all(env, "SELECT mv.work_order_id, mv.kind, mv.quantity_milli, mv.value_cents, mv.at, (SELECT reason FROM gk_work_return_quarantine WHERE return_id=mv.id) AS quarantine_reason, p.number, p.name, p.unit, m.name AS who FROM gk_stock_moves mv JOIN gk_parts p ON p.id = mv.part_id LEFT JOIN gk_members m ON m.id = mv.actor WHERE mv.work_order_id IN (SELECT id FROM gk_work_orders WHERE asset_id = ?) ORDER BY mv.seq", id)) {
    push(row.at, 'part', row.work_order_id, `${row.kind === 'issue' ? 'Issued' : 'Returned'} ${showNumber(fromMilli(Math.abs(row.quantity_milli)))}\u00a0${row.unit} of ${row.number} ${row.name}${row.value_cents === null ? '' : ` at ${usd(Math.abs(row.value_cents))}`}${row.quarantine_reason ? ` (damaged, quarantined: ${row.quarantine_reason})` : ''}`, name(row))
  }
  for (const row of await all(env, 'SELECT d.work_order_id, d.started_on, d.ended_on, d.minutes, d.reason, d.recorded_at, m.name AS who FROM gk_downtime d LEFT JOIN gk_members m ON m.id = d.recorded_by WHERE d.asset_id = ? ORDER BY d.started_on, d.id', id)) {
    push(row.recorded_at, 'downtime', row.work_order_id, `Down from ${showLocal(row.started_on)}${row.ended_on ? ` to ${showLocal(row.ended_on)} (${row.minutes} min)` : ' (still down)'}: ${row.reason}`, name(row))
  }
  for (const row of await all(env, 'SELECT f.work_order_id, f.item, f.severity, f.text, f.follow_up_id, f.recorded_at, m.name AS who FROM gk_findings f LEFT JOIN gk_members m ON m.id = f.recorded_by WHERE f.asset_id = ? ORDER BY f.recorded_at, f.id', id)) {
    push(row.recorded_at, 'finding', row.work_order_id, `Finding (${row.severity})${row.item !== null ? ` on checklist item ${row.item + 1}` : ''}: ${row.text}${row.follow_up_id ? ' — follow-up raised' : ''}`, name(row))
  }
  // MIG-002: completed work moved in from MaintainX, at its completion time.
  const money = (cents: number | null) => cents === null ? null : `$${(cents / 100).toFixed(2)}`
  for (const row of await all(env, 'SELECT * FROM gk_work_history WHERE asset_id = ? ORDER BY completed_on, id', id)) {
    const costs = [['parts', money(row.parts_cents)], ['labor', money(row.labor_cents)], ['other', money(row.other_cents)]].filter(([, amount]) => amount).map(([label, amount]) => `${label} ${amount}`)
    push(zonedInstant(actor.zone, row.completed_on), 'history', null, `Completed in ${row.source_system} (#${row.source_ref}, ${row.kind}): ${row.title}${row.categories ? ` · ${row.categories}` : ''}${row.recurrence ? ` · repeats ${row.recurrence}` : ''}${costs.length ? ` · ${costs.join(', ')}` : ''} (moved in)`, row.completed_by)
  }
  events.sort((a, b) => a.at - b.at)
  const downtimeMinutes = (await one<{ n: number | null }>(env, 'SELECT SUM(minutes) AS n FROM gk_downtime WHERE asset_id = ?', id))!.n ?? 0
  return { asset, orders, events, downtimeMinutes }
}

const cell = (value: unknown) => { const text = String(value ?? ''); return /[",\n\r]/.test(text) || /^[=+\-@\t]/.test(text) ? `"${(/^[=+\-@\t]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"` : text }

export async function assetHistoryCsv(env: Bindings, actor: Actor, id: string) {
  requireCapability(actor, 'history.export')
  const history = await assetHistory(env, actor, id)
  insist(history.asset, 'asset_not_found', 404)
  const rows = [['When', 'Asset tag', 'Asset', 'Work order', 'Kind', 'What', 'Who'], ...history.events.map(event => [event.when, history.asset.tag, history.asset.name, event.workOrder ?? '', event.kind, event.what, event.who ?? ''])]
  return rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
