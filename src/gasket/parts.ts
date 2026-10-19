// Clause 3 (and the parts half of clause 8): parts, stock movements and
// physical counts. On-hand is the sum of append-only movements; every write
// checks inside its batch that on-hand stays at or above zero.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { fromMilli, toMilli } from './quantity'
import type { FromProposal } from './schedules'
import { RESERVED, RESERVED_FOR_OTHERS, reservations, substituteList } from './reservations'

export const ON_HAND = '(SELECT COALESCE(SUM(m.quantity_milli), 0) FROM gk_part_moves m WHERE m.part_id = p.id)'
const onHandOf = '(SELECT COALESCE(SUM(quantity_milli), 0) FROM gk_part_moves WHERE part_id = ?)'

export async function createPart(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const number = input.text('number', { max: 60 }), name = input.text('name', { max: 160 }), unit = input.text('unit', { max: 20 })
  const minimum = toMilli(input.text('minimum', { optional: true, max: 20 }) || '0', 'minimum', { allowZero: true })
  const location = input.text('location', { optional: true, max: 120 }) || null
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_parts (id, number, name, unit, minimum_milli, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, number, name, unit, minimum, location, now())],
    { actor: actor.id, action: 'part.create', subject: id, detail: { number, name, unit, minimum: fromMilli(minimum) } })
  return { id }
}

async function part(env: Bindings, id: string) {
  const row = await one(env, `SELECT p.*, ${ON_HAND} AS on_hand FROM gk_parts p WHERE p.id = ?`, id)
  insist(row, 'part_not_found', 404)
  return row
}

export async function receivePart(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const found = await part(env, input.text('part', { max: 100 }))
  const quantity = toMilli(input.text('quantity', { max: 20 }))
  const note = input.text('note', { optional: true, max: 300 }) || null
  const id = newId()
  await commit(env, [stmt(env, "INSERT INTO gk_part_moves (id, part_id, kind, quantity_milli, note, actor, at) VALUES (?, ?, 'receive', ?, ?, ?, ?)", id, found.id, quantity, note, actor.id, now())],
    { actor: actor.id, action: 'part.receive', subject: found.id, detail: { quantity: fromMilli(quantity), note } })
  return { id, onHand: fromMilli(found.on_hand + quantity) }
}

/**
 * Records a physical count. The movement posts exactly counted minus on-hand,
 * and the batch refuses if any movement landed after the count was read
 * (the `seen` sequence the person counted against).
 */
export async function countPart(env: Bindings, actor: Actor, input: Input, { proposal, also }: FromProposal = {}) {
  requireCapability(actor, proposal ? 'proposal.decide' : 'register.manage')
  const found = await part(env, input.text('part', { max: 100 }))
  const counted = toMilli(input.text('counted', { max: 20 }), 'counted', { allowZero: true })
  const latest = (await one<{ seq: number | null }>(env, 'SELECT MAX(seq) AS seq FROM gk_part_moves WHERE part_id = ?', found.id))!.seq ?? 0
  const seen = input.has('seen') ? input.integer('seen', { min: 0, max: Number.MAX_SAFE_INTEGER })! : latest
  insist(seen === latest, 'stale', 409)
  const variance = counted - found.on_hand
  const note = input.text('note', { optional: true, max: 300 }) || null
  const id = newId()
  await commit(env, [
    guard(env, 'stale', '(SELECT COALESCE(MAX(seq), 0) FROM gk_part_moves WHERE part_id = ?) = ?', found.id, seen),
    stmt(env, "INSERT INTO gk_part_moves (id, part_id, kind, quantity_milli, counted_milli, note, actor, at) VALUES (?, ?, 'count', ?, ?, ?, ?, ?)", id, found.id, variance, counted, note, actor.id, now()),
    ...(also?.(id) ?? []),
  ], { actor: actor.id, action: 'part.count', subject: found.id, detail: { counted: fromMilli(counted), recorded: fromMilli(found.on_hand), variance: fromMilli(variance), ...(proposal ? { proposal } : {}) } })
  return { id, variance: fromMilli(variance), onHand: fromMilli(counted) }
}

/** Issue to the actor's own work order: never more than on hand less what is reserved for other work (PART-002). */
export async function issuePart(env: Bindings, actor: Actor, input: Input, workOrder: { id: string }) {
  const found = await part(env, input.text('part', { max: 100 }))
  const quantity = toMilli(input.text('quantity', { max: 20 }))
  const free = (await one<{ n: number }>(env, `SELECT ${onHandOf} - ${RESERVED_FOR_OTHERS} AS n`, found.id, found.id, workOrder.id))!.n
  insist(free >= quantity, 'insufficient_stock', 409, { onHand: fromMilli(found.on_hand), free: fromMilli(free) })
  const id = newId()
  return { id, part: found, quantity, statements: [
    guard(env, 'insufficient_stock', `${onHandOf} - ${RESERVED_FOR_OTHERS} >= ?`, found.id, found.id, workOrder.id, quantity),
    stmt(env, "INSERT INTO gk_part_moves (id, part_id, kind, quantity_milli, work_order_id, actor, at) VALUES (?, ?, 'issue', ?, ?, ?, ?)", id, found.id, -quantity, workOrder.id, actor.id, now()),
  ] }
}

/** Return unused parts from a work order: never more than it still holds. */
export async function returnPart(env: Bindings, actor: Actor, input: Input, workOrder: { id: string }) {
  const found = await part(env, input.text('part', { max: 100 }))
  const quantity = toMilli(input.text('quantity', { max: 20 }))
  const held = "(SELECT -COALESCE(SUM(quantity_milli), 0) FROM gk_part_moves WHERE part_id = ? AND work_order_id = ? AND kind IN ('issue', 'return'))"
  const holding = (await one<{ n: number }>(env, `SELECT ${held} AS n`, found.id, workOrder.id))!.n
  insist(holding >= quantity, 'return_exceeds_issue', 409, { held: fromMilli(holding) })
  const id = newId()
  return { id, part: found, quantity, statements: [
    guard(env, 'return_exceeds_issue', `${held} >= ?`, found.id, workOrder.id, quantity),
    stmt(env, "INSERT INTO gk_part_moves (id, part_id, kind, quantity_milli, work_order_id, actor, at) VALUES (?, ?, 'return', ?, ?, ?, ?)", id, found.id, quantity, workOrder.id, actor.id, now()),
  ] }
}

export async function partList(env: Bindings, _actor: Actor) {
  const rows = await all(env, `SELECT p.id, p.number, p.name, p.unit, p.minimum_milli, p.location, p.origin, ${ON_HAND} AS on_hand, ${RESERVED} AS reserved,
    (SELECT MAX(seq) FROM gk_part_moves m WHERE m.part_id = p.id) AS seen,
    (SELECT m.at FROM gk_part_moves m WHERE m.part_id = p.id AND m.kind = 'count' ORDER BY m.seq DESC LIMIT 1) AS last_count
    FROM gk_parts p ORDER BY p.number`)
  return rows.map(row => ({ ...row, onHand: fromMilli(row.on_hand), reserved: fromMilli(row.reserved), available: fromMilli(row.on_hand - row.reserved), minimum: fromMilli(row.minimum_milli), seen: row.seen ?? 0, below: row.on_hand < row.minimum_milli }))
}

export async function partDetail(env: Bindings, _actor: Actor, id: string) {
  const found = await part(env, id)
  const reserved = (await one<{ n: number }>(env, `SELECT ${RESERVED} AS n FROM gk_parts p WHERE p.id = ?`, id))!.n
  const held = await reservations(env, 'r.part_id = ?', id)
  const substitutes = (await substituteList(env)).filter(row => row.part_id === id || row.substitute_id === id)
  const moves = await all(env, `SELECT m.seq, m.kind, m.quantity_milli, m.counted_milli, m.note, m.at, m.work_order_id, w.number AS work_order_number, mb.name AS actor
    FROM gk_part_moves m LEFT JOIN gk_work_orders w ON w.id = m.work_order_id LEFT JOIN gk_members mb ON mb.id = m.actor WHERE m.part_id = ? ORDER BY m.seq DESC`, id)
  return { ...found, onHand: fromMilli(found.on_hand), reserved: fromMilli(reserved), available: fromMilli(found.on_hand - reserved), reservations: held, substitutes, minimum: fromMilli(found.minimum_milli), seen: moves[0]?.seq ?? 0, moves: moves.map(move => ({ ...move, quantity: fromMilli(move.quantity_milli), counted: move.counted_milli === null ? null : fromMilli(move.counted_milli) })) }
}
