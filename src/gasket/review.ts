// Clause 9: submit for review, then a supervisor approves the exact version
// they read, or returns it with a reason. Approval closes the work order and
// moves its schedule on. Nobody approves work they did.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { commit, guard, insist, newId, now, one, stmt } from './core'
import { RECORDERS } from './crew'
import type { Input } from './input'
import { advanceStatements } from './schedules'
import { OPEN, workOrder, workOrderDetail } from './work'

export async function submit(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.do')
  const order = await workOrder(env, input.text('workOrder', { max: 100 }))
  insist(order.assignee_id === actor.id, 'not_your_work', 403)
  insist(['open', 'in_progress', 'returned'].includes(order.status), 'work_order_not_open', 409)
  const version = input.integer('version', { min: 1, max: 1_000_000 })
  insist(version === order.version, 'stale', 409)
  const detail = await workOrderDetail(env, actor, order.id)
  insist(!detail.missing.length, 'not_ready_for_review', 409, { missing: detail.missing })
  await commit(env, [
    guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status IN ${OPEN})`, order.id, version),
    guard(env, 'downtime_open', 'NOT EXISTS(SELECT 1 FROM gk_downtime WHERE work_order_id = ? AND ended_on IS NULL)', order.id),
    stmt(env, "UPDATE gk_work_orders SET status = 'submitted', version = version + 1, submitted_at = ? WHERE id = ?", now(), order.id),
  ], { actor: actor.id, action: 'workorder.submit', subject: order.id, detail: { version } })
  return { id: order.id, version: version! + 1 }
}

export async function review(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.review')
  const order = await workOrder(env, input.text('workOrder', { max: 100 }))
  insist(order.status === 'submitted', 'not_submitted', 409)
  insist(order.assignee_id !== actor.id && !await didWork(env, order.id, actor.id), 'own_work', 403)
  const version = input.integer('version', { min: 1, max: 1_000_000 })
  insist(version === order.version, 'stale', 409)
  const decision = input.text('decision', { max: 10 })
  insist(['approve', 'return'].includes(decision), 'invalid_decision')
  const reason = input.text('reason', { optional: decision === 'approve', max: 1000 }) || null
  const id = newId()
  const statements = [
    guard(env, 'stale', "EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status = 'submitted')", order.id, version),
    stmt(env, 'INSERT INTO gk_reviews (id, work_order_id, version, decision, reason, reviewer, at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, order.id, version, decision === 'approve' ? 'approved' : 'returned', reason, actor.id, now()),
    decision === 'approve'
      ? stmt(env, "UPDATE gk_work_orders SET status = 'closed', version = version + 1, closed_at = ?, closed_by = ? WHERE id = ?", now(), actor.id, order.id)
      : stmt(env, "UPDATE gk_work_orders SET status = 'returned', version = version + 1 WHERE id = ?", order.id),
  ]
  if (decision === 'approve' && order.schedule_id) statements.push(...await advanceStatements(env, order.schedule_id, actor.today))
  await commit(env, statements, { actor: actor.id, action: decision === 'approve' ? 'workorder.approve' : 'workorder.return', subject: order.id, detail: { review: id, version, reason } })
  return { id: order.id, status: decision === 'approve' ? 'closed' : 'returned' }
}

/** Whether this person recorded anything on the work order, whoever it is assigned to now.
 * Every record bumps the work order's version, so the review's version guard covers a record made after this read. */
async function didWork(env: Bindings, workOrderId: string, member: string) {
  const found = await one<{ did: number }>(env, `SELECT ${RECORDERS.map(([table, column]) => `EXISTS(SELECT 1 FROM ${table} WHERE work_order_id = ? AND ${column} = ?)`).join(' OR ')} AS did`, ...RECORDERS.flatMap(() => [workOrderId, member]))
  return found!.did === 1
}
