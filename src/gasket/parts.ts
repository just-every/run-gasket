import { canonicalPart, UNMERGED } from './part-identity'
import { catalogView } from './catalogs'
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
import { issueInsert, receiptValue, returnInsert, stockValue, varianceValue } from './valuation'

export const ON_HAND = '(SELECT COALESCE(SUM(m.quantity_milli), 0) FROM gk_stock_moves m WHERE m.part_id = p.id)'
// PART-007: stock value is the sum of movement values (valuation.ts).
const STOCK_VALUE = '(SELECT COALESCE(SUM(m.value_cents), 0) FROM gk_stock_moves m WHERE m.part_id = p.id)'
const onHandOf = '(SELECT COALESCE(SUM(quantity_milli), 0) FROM gk_stock_moves WHERE part_id = ?)'

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
  id = (await canonicalPart(env, id)).id
  const row = await one(env, `SELECT p.*, ${ON_HAND} AS on_hand, ${STOCK_VALUE} AS stock_value FROM gk_parts p WHERE p.id = ?`, id)
  insist(row, 'part_not_found', 404)
  return row
}

export async function receivePart(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const found = await part(env, input.text('part', { max: 100 }))
  const quantity = toMilli(input.text('quantity', { max: 20 }))
  const note = input.text('note', { optional: true, max: 300 }) || null
  const landed = receiptValue(input, found.price_cents, quantity)
  const id = newId()
  await commit(env, [stmt(env, "INSERT INTO gk_part_moves (id, part_id, kind, quantity_milli, value_cents, unit_price_cents, freight_cents, tax_cents, note, actor, at) VALUES (?, ?, 'receive', ?, ?, ?, ?, ?, ?, ?, ?)", id, found.id, quantity, landed.value, landed.unitPrice, landed.freight, landed.tax, note, actor.id, now())],
    { actor: actor.id, action: 'part.receive', subject: found.id, detail: { quantity: fromMilli(quantity), note, unitPriceCents: landed.unitPrice, freightCents: landed.freight, taxCents: landed.tax, valueCents: landed.value } })
  return { id, onHand: fromMilli(found.on_hand + quantity), valueCents: landed.value }
}

/**
 * Records a physical count. The movement posts exactly counted minus on-hand,
 * and the batch refuses if any movement landed after the count was read
 * (the `seen` sequence the person counted against).
 */
export async function countPart(env: Bindings, actor: Actor, input: Input, { proposal, also }: FromProposal = {}) {
  requireCapability(actor, proposal ? 'proposal.decide' : 'register.manage')
  const found = await part(env, input.text('part', { max: 100 }))
  const revision=input.integer('revision',{min:1,max:Number.MAX_SAFE_INTEGER,optional:true})
  insist(revision===null || revision===found.revision,'stale',409)
  // A merge can change the counted shelf without changing MAX(movement seq).
  const merged=await one(env,'SELECT 1 FROM gk_part_canonical WHERE canonical_id=?',found.id)
  insist(proposal || !input.has('seen') || revision!==null || !merged,'stale',409)
  const counted = toMilli(input.text('counted', { max: 20 }), 'counted', { allowZero: true })
  const latest = (await one<{ seq: number | null }>(env, 'SELECT MAX(seq) AS seq FROM gk_stock_moves WHERE part_id = ?', found.id))!.seq ?? 0
  const seen = input.has('seen') ? input.integer('seen', { min: 0, max: Number.MAX_SAFE_INTEGER })! : latest
  insist(seen === latest, 'stale', 409)
  const variance = counted - found.on_hand
  const note = input.text('note', { optional: true, max: 300 }) || null
  const value = await varianceValue(env, found.id, variance)
  const id = newId()
  await commit(env, [
    guard(env,'stale','EXISTS(SELECT 1 FROM gk_parts WHERE id=? AND revision=?)',found.id,found.revision),
    guard(env, 'stale', '(SELECT COALESCE(MAX(seq), 0) FROM gk_stock_moves WHERE part_id = ?) = ?', found.id, seen),
    stmt(env, "INSERT INTO gk_part_moves (id, part_id, kind, quantity_milli, value_cents, counted_milli, note, actor, at) VALUES (?, ?, 'count', ?, ?, ?, ?, ?, ?)", id, found.id, variance, value, counted, note, actor.id, now()),
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
    issueInsert(env, id, found.id, quantity, workOrder.id, actor.id),
  ] }
}

/** Return unused parts from a work order: never more than it still holds. */
export async function returnPart(env: Bindings, actor: Actor, input: Input, workOrder: { id: string }) {
  const found = await part(env, input.text('part', { max: 100 }))
  const quantity = toMilli(input.text('quantity', { max: 20 }))
  const held = "(SELECT -COALESCE(SUM(quantity_milli), 0) FROM gk_stock_moves WHERE part_id = ? AND work_order_id = ? AND kind IN ('issue', 'return'))"
  const holding = (await one<{ n: number }>(env, `SELECT ${held} AS n`, found.id, workOrder.id))!.n
  insist(holding >= quantity, 'return_exceeds_issue', 409, { held: fromMilli(holding) })
  const id = newId()
  return { id, part: found, quantity, statements: [
    guard(env, 'return_exceeds_issue', `${held} >= ?`, found.id, workOrder.id, quantity),
    returnInsert(env, id, found.id, quantity, workOrder.id, actor.id),
  ] }
}

export async function partList(env: Bindings, _actor: Actor) {
  const rows = await all(env, `SELECT p.id, p.number, p.name, p.unit, p.minimum_milli, p.location, p.origin, p.price_cents, ${ON_HAND} AS on_hand, ${STOCK_VALUE} AS stock_value, ${RESERVED} AS reserved,
    (SELECT MAX(seq) FROM gk_stock_moves m WHERE m.part_id = p.id) AS seen,
    (SELECT m.at FROM gk_stock_moves m WHERE m.part_id = p.id AND m.kind = 'count' ORDER BY m.seq DESC LIMIT 1) AS last_count
    FROM gk_parts p WHERE ${UNMERGED} ORDER BY p.number`)
  return rows.map(row => ({ ...row, ...stockValue(row.on_hand, row.stock_value), onHand: fromMilli(row.on_hand), reserved: fromMilli(row.reserved), available: fromMilli(row.on_hand - row.reserved), minimum: fromMilli(row.minimum_milli), seen: row.seen ?? 0, below: row.on_hand < row.minimum_milli }))
}

export async function partDetail(env: Bindings, _actor: Actor, id: string) {
  const found = await part(env, id)
  id = found.id
  const catalog = await catalogView(env, _actor, id)
  const photos = await all(env, `SELECT id,filename,media_type,sha256,part_id FROM gk_part_photos WHERE part_id=? OR part_id IN (SELECT part_id FROM gk_part_canonical WHERE canonical_id=?) ORDER BY added_at,id`, id,id)
  const merges = await all(env, `SELECT m.*,p.number AS source_number FROM gk_part_merges m JOIN gk_parts p ON p.id=m.source_id WHERE m.canonical_id=? OR m.canonical_id IN (SELECT part_id FROM gk_part_canonical WHERE canonical_id=?) ORDER BY approved_at,id`, id,id)
  const reserved = (await one<{ n: number }>(env, `SELECT ${RESERVED} AS n FROM gk_parts p WHERE p.id = ?`, id))!.n
  const held = await reservations(env, 'r.part_id = ?', id)
  const substitutes = (await substituteList(env)).filter(row => row.part_id === id || row.substitute_id === id)
  const moves = await all(env, `SELECT m.id, m.source_part_id, m.seq, m.kind, m.quantity_milli, m.value_cents, m.reason, m.count_line_id, m.unit_price_cents, m.freight_cents, m.tax_cents, m.counted_milli, m.note, m.at, m.work_order_id, w.number AS work_order_number, mb.name AS actor
    FROM gk_stock_moves m LEFT JOIN gk_work_orders w ON w.id = m.work_order_id LEFT JOIN gk_members mb ON mb.id = m.actor WHERE m.part_id = ? ORDER BY m.seq DESC`, id)
  return { ...found, catalog, photos, merges, ...stockValue(found.on_hand, found.stock_value), onHand: fromMilli(found.on_hand), reserved: fromMilli(reserved), available: fromMilli(found.on_hand - reserved), reservations: held, substitutes, minimum: fromMilli(found.minimum_milli), seen: moves[0]?.seq ?? 0, moves: moves.map(move => ({ ...move, quantity: fromMilli(move.quantity_milli), counted: move.counted_milli === null ? null : fromMilli(move.counted_milli) })) }
}
