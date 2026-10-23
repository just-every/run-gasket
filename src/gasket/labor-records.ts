import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { all, guard, insist, newId, now, one, stmt, type Row } from './core'
import type { Input } from './input'
import { isLocalTime, localNow, zonedInstant } from './dates'

export const LABOR_CATEGORIES = ['wrench', 'travel', 'wait', 'admin'] as const
export const managesLabor = (actor: Actor) => actor.role === 'owner'
export const duration = (row: Row) => (row.ended_at - row.started_at) / 60_000
export function laborCategory(input: Input) {
  const category = input.text('category', { max: 20 })
  insist((LABOR_CATEGORIES as readonly string[]).includes(category), 'invalid_category')
  return category
}
export function laborMoney(input: Input) {
  const amount = input.text('amount', { max: 14 })
  insist(/^\d{1,9}(\.\d{1,2})?$/.test(amount), 'invalid_amount')
  const [whole, fraction = ''] = amount.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
export function laborInstant(actor: Actor, input: Input, name: string) {
  const local = input.text(name, { max: 16 })
  insist(isLocalTime(local), `invalid_${name}`)
  const instant = zonedInstant(actor.zone, local)
  insist(localNow(actor.zone, instant) === local && instant <= now(), `invalid_${name}`)
  return instant
}
export async function laborWork(env: Bindings, actor: Actor, id: string) {
  insist(managesLabor(actor) || can(actor, 'work.do'), 'forbidden', 403)
  const order = await one(env, 'SELECT id, status FROM gk_work_orders WHERE id=?', id)
  insist(order, 'work_order_not_found', 404)
  return order
}
export async function entryFlags(env: Bindings, row: Row) {
  const flags: string[] = []
  if (row.supersedes_id) flags.push('Corrected time')
  if (duration(row) > 16 * 60) flags.push('More than 16 hours')
  const overlaps = await all(env, `SELECT id FROM gk_labor_entries WHERE person_id=? AND id<>? AND id<>? AND state IN ('pending','approved') AND started_at<? AND ended_at>?`, row.person_id, row.id, row.supersedes_id ?? '', row.ended_at, row.started_at)
  if (overlaps.length) flags.push('Overlapping time')
  if (!await one(env, 'SELECT 1 FROM gk_labor_rates WHERE person_id=?', row.person_id)) flags.push('Rate required before approval')
  return flags
}
export function entryInsert(env: Bindings, actor: Actor, row: Row) {
  const id = newId()
  return { id, statement: stmt(env, `INSERT INTO gk_labor_entries(id,work_order_id,person_id,category,started_at,ended_at,reason,supersedes_id,timer_id,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id,row.work_order_id,row.person_id,row.category,row.started_at,row.ended_at,row.reason,row.supersedes_id ?? null,row.timer_id ?? null,actor.id,now()) }
}
export function pendingGuard(env: Bindings, row: Row) {
  return guard(env, 'stale', "EXISTS(SELECT 1 FROM gk_labor_entries WHERE id=? AND state='pending')", row.id)
}
