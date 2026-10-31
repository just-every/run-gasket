// PLAN-007: controlled changes to planned work. Leads bulk assign, reschedule or
// cancel selected work orders after a no-write preview of each one's consequences;
// each row succeeds or fails on its own. Cancelled work can be reopened and a
// duplicate merged into the work order that carries on, always with a reason and
// with every record kept. A cancelled preventive occurrence stays due until its
// skip is approved (PM-003, exceptions.ts). Nothing here records, completes or approves maintenance.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { GasketError, all, commit, guard, insist, newId, now, one, stmt } from './core'
import { assigneeFits, handoffStatements } from './crew'
import { isDate } from './dates'
import type { Input } from './input'
import { releaseWithWork } from './reservations'
import { woDigits } from './quantity'
import { advanceStatements } from './schedules'
import { OPEN, workOrder } from './work'

const OPEN_STATES = ['open', 'in_progress', 'returned']
const BULK = ['assign', 'reschedule', 'cancel'] as const
const label = (number: number) => `WO-${woDigits(number)}`
const unchanged = (env: Bindings, id: string, version: number) => guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status IN ${OPEN})`, id, version)

/** Why this work order cannot take the change, or what else the change touches. */
async function consequences(env: Bindings, order: Record<string, any>, action: typeof BULK[number], today: string, due: string | null) {
  const notes: string[] = []
  if (action === 'cancel') {
    const held = await one<{ held: number }>(env, 'SELECT COALESCE(SUM(quantity_milli), 0) AS held FROM gk_stock_moves WHERE work_order_id = ?', order.id)
    if (held!.held !== 0) return { refused: 'parts_still_issued', notes }
    if (await one(env, 'SELECT 1 FROM gk_downtime WHERE work_order_id = ? AND ended_on IS NULL', order.id)) return { refused: 'downtime_open', notes }
  }
  if (order.schedule_id) {
    const schedule = await one(env, 'SELECT title, next_due_date FROM gk_schedules WHERE id = ?', order.schedule_id)
    notes.push(action === 'cancel'
      ? `Preventive schedule "${schedule!.title}" stays due ${schedule!.next_due_date ?? 'at its meter value'} until a lead skips that occurrence or the work is issued again`
      : `Preventive schedule "${schedule!.title}" keeps its cadence; its next due date stays ${schedule!.next_due_date ?? 'at its meter value'}`)
  }
  for (const row of await all(env, `SELECT number FROM gk_work_orders WHERE follow_up_of = ? AND status IN ${OPEN}`, order.id)) notes.push(`Follow-up ${label(row.number)} stays open`)
  for (const row of await all(env, 'SELECT w.number FROM gk_work_dependencies d JOIN gk_work_orders w ON w.id=d.work_order_id WHERE d.predecessor_id=? AND d.active=1 ORDER BY w.number', order.id)) notes.push(`Dependent ${label(row.number)} requires this work to remain independently approved`)
  if (action === 'reschedule' && due! < today) notes.push('The new due date has already passed, so the work order is overdue')
  return { refused: null, notes }
}

/**
 * workorders.bulk: `workOrder` and `version` lists (the versions the lead saw), `action` and its value (`assignee`,
 * `due` or `reason`). With `preview` nothing is written; otherwise each row commits alone and reports its outcome.
 */
export async function bulk(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const ids = input.list('workOrder'), versions = input.list('version')
  insist(ids.length > 0 && ids.length <= 200 && new Set(ids).size === ids.length, 'invalid_workOrder')
  insist(versions.length === ids.length && versions.every(value => /^\d{1,7}$/.test(value)), 'invalid_version')
  const action = input.text('action', { max: 20 }) as typeof BULK[number]
  insist(BULK.includes(action), 'invalid_action')
  const preview = input.flag('preview')
  let assignee: string | null = null, due: string | null = null, reason: string | null = null
  if (action === 'assign') {
    assignee = input.text('assignee', { max: 100 })
    await assigneeFits(env, assignee, null)
  }
  if (action === 'reschedule') { due = input.text('due', { max: 10 }); insist(isDate(due), 'invalid_due') }
  if (action === 'cancel') reason = input.text('reason', { max: 500 })
  const batch = newId(), rows: { id: string; number: number | null; outcome: string; notes: string[] }[] = []
  for (const [index, id] of ids.entries()) {
    const order = await one(env, 'SELECT * FROM gk_work_orders WHERE id = ?', id)
    if (!order) { rows.push({ id, number: null, outcome: 'work_order_not_found', notes: [] }); continue }
    const row = { id, number: order.number as number, outcome: preview ? 'would_change' : 'changed', notes: [] as string[] }
    rows.push(row)
    if (!OPEN_STATES.includes(order.status)) { row.outcome = 'work_order_not_open'; continue }
    if (Number(versions[index]) !== order.version) { row.outcome = 'stale'; continue }
    const effect = await consequences(env, order, action, actor.today, due)
    row.notes = effect.notes
    if (effect.refused) { row.outcome = effect.refused; continue }
    if (action === 'assign' && order.assignee_id === assignee) { row.outcome = 'unchanged'; continue }
    // PLAN-002: work that names a team goes only to a member of that team.
    if (action === 'assign' && order.team_id && !await one(env, 'SELECT 1 FROM gk_team_members WHERE team_id = ? AND member_id = ?', order.team_id, assignee)) { row.outcome = 'assignee_not_in_team'; continue }
    if (preview) continue
    const change = action === 'assign' ? handoffStatements(env, actor, order, assignee, { team: order.team_id, trade: order.trade, shift: order.shift }, null)
      : action === 'reschedule' ? [stmt(env, 'UPDATE gk_work_orders SET due_date = ?, version = version + 1 WHERE id = ?', due, id)]
      : [stmt(env, "UPDATE gk_work_orders SET status = 'cancelled', version = version + 1, closed_at = ?, closed_by = ? WHERE id = ?", now(), actor.id, id), releaseWithWork(env, actor, id, `Work order cancelled: ${reason}`)]
    const checks = action === 'cancel' ? [
      guard(env, 'parts_still_issued', '(SELECT COALESCE(SUM(quantity_milli), 0) FROM gk_stock_moves WHERE work_order_id = ?) = 0', id),
      guard(env, 'downtime_open', 'NOT EXISTS(SELECT 1 FROM gk_downtime WHERE work_order_id = ? AND ended_on IS NULL)', id)] : []
    const detail = action === 'assign' ? { from: order.assignee_id, to: assignee } : action === 'reschedule' ? { from: order.due_date, to: due } : { reason }
    try {
      await commit(env, [unchanged(env, id, order.version), ...checks, ...change], { actor: actor.id, action: `workorder.${action}`, subject: id, detail: { ...detail, bulk: batch } })
    } catch (error) {
      if (!(error instanceof GasketError)) throw error
      row.outcome = error.code
    }
  }
  return { preview, action, batch: preview ? null : batch, rows }
}

/** Cancelled work back to open, or reviewed corrective work back for rework; the reason and every record stay. */
export async function reopen(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const order = await workOrder(env, input.text('workOrder', { max: 100 }))
  const reason = input.text('reason', { max: 500 })
  insist(order.status === 'cancelled' || (order.status === 'closed' && order.kind === 'corrective'), 'not_reopenable', 409)
  insist(!order.merged_into, 'merged', 409)
  insist(!await one(env, 'SELECT 1 FROM gk_nested_satisfaction WHERE lower_work=?', order.id), 'satisfied_by_equivalent', 409)
  const to = order.status === 'cancelled' ? 'open' : 'returned'
  // A preventive occurrence reopens only while its schedule has no other open work (gk_work_orders_one_open).
  await commit(env, [
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status = ?)', order.id, order.version, order.status),
    stmt(env, 'UPDATE gk_work_orders SET status = ?, version = version + 1, closed_at = NULL, closed_by = NULL WHERE id = ?', to, order.id),
  ], { actor: actor.id, action: 'workorder.reopen', subject: order.id, detail: { from: order.status, to, reason } })
  return { id: order.id, status: to }
}

/** A duplicate is cancelled into the work order that carries on, linked both ways; its own records stay on it. */
export async function merge(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const duplicate = await workOrder(env, input.text('workOrder', { max: 100 }))
  const into = await workOrder(env, input.text('into', { max: 100 }))
  const reason = input.text('reason', { max: 500 })
  insist(duplicate.id !== into.id, 'merge_into_itself', 409)
  insist(duplicate.kind === 'corrective', 'merge_preventive', 409)
  insist(OPEN_STATES.includes(duplicate.status) && OPEN_STATES.includes(into.status), 'work_order_not_open', 409)
  insist(duplicate.asset_id === into.asset_id, 'different_asset', 409)
  insist(duplicate.location === into.location, 'different_location', 409)
  await commit(env, [
    unchanged(env, duplicate.id, duplicate.version),
    guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status IN ${OPEN})`, into.id, into.version),
    guard(env, 'parts_still_issued', '(SELECT COALESCE(SUM(quantity_milli), 0) FROM gk_stock_moves WHERE work_order_id = ?) = 0', duplicate.id),
    guard(env, 'downtime_open', 'NOT EXISTS(SELECT 1 FROM gk_downtime WHERE work_order_id = ? AND ended_on IS NULL)', duplicate.id),
    stmt(env, "UPDATE gk_work_orders SET status = 'cancelled', merged_into = ?, version = version + 1, closed_at = ?, closed_by = ? WHERE id = ?", into.id, now(), actor.id, duplicate.id),
    stmt(env, 'UPDATE gk_work_orders SET version = version + 1 WHERE id = ?', into.id),
    releaseWithWork(env, actor, duplicate.id, `Merged into another work order: ${reason}`),
  ], [{ actor: actor.id, action: 'workorder.merge', subject: duplicate.id, detail: { into: into.id, reason } }, { actor: actor.id, action: 'workorder.merged', subject: into.id, detail: { duplicate: duplicate.id, reason } }])
  return { id: duplicate.id, into: into.id }
}
