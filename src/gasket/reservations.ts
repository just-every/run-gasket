import { canonicalPart, canonicalSql } from './part-identity'
// PART-002: parts reservations, repair kits and approved substitutes.
// - A lead approves a part as a substitute for another (that direction only)
//   and can withdraw the approval; a repair kit is a named, fixed set of parts
//   and quantities.
// - A planner (lead or owner) reserves a part, or every line of a kit at once,
//   to open work. A line is filled by the part it names or by an approved
//   substitute for it (site-wide here, or an alternate on the asset's bill of
//   materials that fits its serial, ASSET-006), never by an unapproved one. A work order holds at most
//   one open reservation per part.
// - Reserved stock of a part is, over its open reservations, what each still
//   needs: its quantity less what its work order has been issued of that part
//   (net of returns), never below zero. Available = on hand - reserved. A
//   reservation is refused unless every part it touches stays at or above zero
//   available, checked inside the same batch, so competing work cannot reserve
//   the same last unit; issuing to work never takes stock reserved for other
//   work. A physical count can still leave a part short (available below zero).
// - A reservation ends when a planner releases it with a reason, or when its
//   work order is cancelled, merged into another or approved and closed; it is
//   kept with who ended it, when and why. Reservations do not expire by time.
// - Reserving never moves stock: on hand changes only by receipt, issue,
//   return and count.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import type { Input } from './input'
import { fromMilli, toMilli } from './quantity'
import { substitutionRefusal } from './bom'

const OPEN = "('open', 'in_progress', 'returned')"
const ON_HAND_OF = '(SELECT COALESCE(SUM(quantity_milli), 0) FROM gk_stock_moves WHERE part_id = ?)'
/** What reservation r's work order has been issued of its part, net of returns. */
const ISSUED = "(SELECT -COALESCE(SUM(m.quantity_milli), 0) FROM gk_stock_moves m WHERE m.part_id = r.part_id AND m.work_order_id = r.work_order_id AND m.kind IN ('issue', 'return'))"
const outstanding = (where: string) => `(SELECT COALESCE(SUM(MAX(0,r.quantity_milli - ${ISSUED})),0) FROM (SELECT work_order_id,part_id,SUM(quantity_milli) AS quantity_milli FROM gk_stock_reservations WHERE released_at IS NULL AND ${where} GROUP BY work_order_id,part_id) r)`
export const RESERVED = outstanding('part_id=p.id')
export const RESERVED_FOR_OTHERS = outstanding('part_id=? AND work_order_id<>?')
const RESERVED_OF = outstanding('part_id=?')

async function part(env: Bindings, id: string) {
  const row = {...await canonicalPart(env, id), originalId:id}
  insist(row, 'part_not_found', 404)
  return row
}

/** A lead approves `substitute` in place of `part`, or withdraws that approval (`withdraw`). */
export async function approveSubstitute(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const original = await part(env, input.text('part', { max: 100 })), substitute = await part(env, input.text('substitute', { max: 100 }))
  const withdraw = input.flag('withdraw')
  insist(withdraw || original.id !== substitute.id, 'substitute_is_part')
  const reason = input.text('reason', { optional: true, max: 300 }) || null
  const matching = `${canonicalSql('s.part_id')}=? AND ${canonicalSql('s.substitute_id')}=? AND s.withdrawn_at IS NULL`
  const active = await one(env, `SELECT 1 FROM gk_part_substitutes s WHERE ${matching}`, original.id, substitute.id)
  insist(withdraw ? active : !active, withdraw ? 'substitute_not_approved' : 'substitute_already_approved', 409)
  await commit(env, [
    guard(env,'stale','NOT EXISTS(SELECT 1 FROM gk_part_canonical WHERE part_id IN (?,?))',original.id,substitute.id),
    guard(env,'stale',`${withdraw ? '' : 'NOT '}EXISTS(SELECT 1 FROM gk_part_substitutes s WHERE ${matching})`,original.id,substitute.id),
    withdraw
    ? stmt(env, `UPDATE gk_part_substitutes AS s SET withdrawn_by = ?, withdrawn_at = ? WHERE ${matching}`, actor.id, now(), original.id, substitute.id)
    : stmt(env, 'INSERT INTO gk_part_substitutes (part_id, substitute_id, reason, approved_by, approved_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(part_id, substitute_id) DO UPDATE SET reason = excluded.reason, approved_by = excluded.approved_by, approved_at = excluded.approved_at, withdrawn_by = NULL, withdrawn_at = NULL', original.id, substitute.id, reason, actor.id, now())],
  { actor: actor.id, action: withdraw ? 'part.substitute.withdraw' : 'part.substitute', subject: original.id, detail: { substitute: substitute.id, reason } })
  return { part: original.id, substitute: substitute.id, approved: !withdraw }
}

/** A lead names a repair kit with its lines: parallel `part` and `quantity` lists (blank rows ignored). */
export async function createKit(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const name = input.text('name', { max: 80 })
  const parts = input.list('part', { keepEmpty: true }), quantities = input.list('quantity', { keepEmpty: true })
  const lines: { part: string; quantity: number }[] = []
  parts.forEach((id, index) => { if (id) lines.push({ part: id, quantity: toMilli(quantities[index] ?? '') }) })
  insist(lines.length, 'kit_has_no_lines')
  insist(new Set(lines.map(line => line.part)).size === lines.length, 'kit_part_repeated')
  for (const line of lines) await part(env, line.part)
  insist(!await one(env, 'SELECT 1 FROM gk_kits WHERE name = ? COLLATE NOCASE', name), 'kit_exists', 409)
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_kits (id, name, created_by, created_at) VALUES (?, ?, ?, ?)', id, name, actor.id, now()),
    ...lines.map((line, position) => stmt(env, 'INSERT INTO gk_kit_lines (kit_id, part_id, quantity_milli, position) VALUES (?, ?, ?, ?)', id, line.part, line.quantity, position))],
  { actor: actor.id, action: 'kit.create', subject: id, detail: { name, lines: lines.map(line => ({ part: line.part, quantity: fromMilli(line.quantity) })) } })
  return { id }
}

export async function kitList(env: Bindings): Promise<{ id: string; name: string; lines: { id: string; number: string; name: string; unit: string; quantity: string }[] }[]> {
  const kits = await all(env, 'SELECT id, name FROM gk_kits ORDER BY name')
  const lines = await all(env, 'SELECT l.kit_id, p.id, p.number, p.name, p.unit, l.quantity_milli FROM gk_kit_lines l JOIN gk_parts p ON p.id = l.part_id ORDER BY p.number')
  return kits.map(kit => ({ ...kit, lines: lines.filter(line => line.kit_id === kit.id).map(({ kit_id: _kit, quantity_milli, ...line }) => ({ ...line, quantity: fromMilli(quantity_milli) })) }))
}

/** Every approval in force: which parts may fill a line that names another. */
export async function substituteList(env: Bindings) {
  return await all(env, `SELECT ${canonicalSql('s.part_id')} AS part_id, s.part_id AS source_part_id, p.number AS part_number, p.name AS part_name, ${canonicalSql('s.substitute_id')} AS substitute_id, s.substitute_id AS source_substitute_id, q.number AS substitute_number, q.name AS substitute_name, s.reason, m.name AS approved_by, s.approved_at
    FROM gk_part_substitutes s JOIN gk_parts p ON p.id = s.part_id JOIN gk_parts q ON q.id = s.substitute_id LEFT JOIN gk_members m ON m.id = s.approved_by WHERE s.withdrawn_at IS NULL ORDER BY p.number, q.number`)
}

/**
 * A planner reserves to open work either one part (`part`, `quantity`, and `insteadOf` when it fills a line that
 * names another part) or a kit (`kit`, with `swap` entries "part:substitute" for lines filled by a substitute).
 */
export async function reserve(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const order = await one(env, `SELECT id, number, asset_id FROM gk_work_orders WHERE id = ? AND status IN ${OPEN}`, input.text('workOrder', { max: 100 }))
  insist(order, 'work_order_not_open', 409)
  // Fence compatibility reads against a concurrent identity or BOM revision change.
  const basis = await one(env, 'SELECT revision, (SELECT COALESCE(MAX(number), 0) FROM gk_bom_revisions WHERE asset_id = a.id) AS bom_revision FROM gk_assets a WHERE id = ?', order.asset_id)
  const kitId = input.text('kit', { optional: true, max: 100 }) || null
  let lines: { requested: string; quantity: number }[]
  const swaps = new Map<string, string>()
  if (kitId) {
    insist(await one(env, 'SELECT 1 FROM gk_kits WHERE id = ?', kitId), 'kit_not_found', 404)
    lines = (await all(env, `SELECT ${canonicalSql('gk_kit_lines.part_id')} AS part_id,SUM(quantity_milli) AS quantity_milli FROM gk_kit_lines WHERE kit_id=? GROUP BY ${canonicalSql('gk_kit_lines.part_id')} ORDER BY MIN(position),part_id`, kitId)).map(row => ({ requested: row.part_id, quantity: row.quantity_milli }))
    for (const swap of input.has('swap') ? input.list('swap') : []) {
      const [from, to] = swap.split(':')
      insist(from && to && lines.some(line => line.requested === from), 'invalid_swap')
      swaps.set(from, to)
    }
  } else {
    const chosen = input.text('part', { max: 100 }), instead = input.text('insteadOf', { optional: true, max: 100 }) || chosen
    lines = [{ requested: instead, quantity: toMilli(input.text('quantity', { max: 20 })) }]
    if (instead !== chosen) swaps.set(instead, chosen)
  }
  const rows: { id: string; part: Row; requested: Row; quantity: number }[] = []
  for (const line of lines) {
    const requested = await part(env, line.requested), chosen = await part(env, swaps.get(line.requested) ?? line.requested)
    const refusal = await substitutionRefusal(env, order.asset_id, requested.originalId, chosen.originalId)
    insist(!refusal, refusal!, 409, { part: requested.number, substitute: chosen.number })
    insist(!rows.some(row => row.part.id === chosen.id) && !await one(env, 'SELECT 1 FROM gk_stock_reservations WHERE work_order_id = ? AND part_id = ? AND released_at IS NULL', order.id, chosen.id), 'already_reserved', 409, { part: chosen.number })
    const available = (await one<{ n: number }>(env, `SELECT ${ON_HAND_OF} - ${RESERVED_OF} AS n`, chosen.id, chosen.id))!.n
    insist(available >= line.quantity, 'insufficient_available', 409, { part: chosen.number, available: fromMilli(available) })
    rows.push({ id: newId(), part: chosen, requested, quantity: line.quantity })
  }
  await commit(env, [
    ...(basis ? [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_assets WHERE id = ? AND revision = ?) AND (SELECT COALESCE(MAX(number), 0) FROM gk_bom_revisions WHERE asset_id = ?) = ?', order.asset_id, basis.revision, order.asset_id, basis.bom_revision)] : []),
    ...rows.map((row, line) => stmt(env, 'INSERT INTO gk_reservations (id, work_order_id, part_id, requested_part_id, kit_id, quantity_milli, line, reserved_by, reserved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', row.id, order.id, row.part.id, row.requested.originalId, kitId, row.quantity, line, actor.id, now())),
    ...rows.map(row => guard(env, 'insufficient_available', `${ON_HAND_OF} - ${RESERVED_OF} >= 0`, row.part.id, row.part.id)),
  ], { actor: actor.id, action: 'workorder.reserve', subject: order.id, detail: { kit: kitId, compatibility: basis, lines: rows.map(row => ({ reservation: row.id, part: row.part.id, ...(row.requested.id !== row.part.id ? { insteadOf: row.requested.id } : {}), quantity: fromMilli(row.quantity) })) } })
  return { id: order.id, reservations: rows.map(row => row.id) }
}

/** A planner releases an open reservation with a reason. */
export async function release(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const row = await one(env, 'SELECT * FROM gk_stock_reservations WHERE id = ?', input.text('reservation', { max: 100 }))
  insist(row, 'reservation_not_found', 404)
  insist(!row.released_at, 'reservation_released', 409)
  const reason = input.text('reason', { max: 300 })
  await commit(env, [stmt(env, 'UPDATE gk_reservations SET released_by = ?, released_at = ?, release_reason = ? WHERE id = ? AND released_at IS NULL', actor.id, now(), reason, row.id)],
    { actor: actor.id, action: 'reservation.release', subject: row.work_order_id, detail: { reservation: row.id, part: row.part_id, reason } })
  return { id: row.id }
}

/** Ends a work order's open reservations as it is cancelled, merged away or closed; goes in the same batch. */
export const releaseWithWork = (env: Bindings, actor: Actor, workOrderId: string, reason: string) =>
  stmt(env, 'UPDATE gk_reservations SET released_by = ?, released_at = ?, release_reason = ? WHERE work_order_id = ? AND released_at IS NULL', actor.id, now(), reason, workOrderId)

/** Reservations matching `where` (on gk_reservations r), with what each still needs and how it ended. */
export async function reservations(env: Bindings, where: string, ...params: unknown[]) {
  const rows = await all(env, `SELECT r.*, ${ISSUED} AS issued_milli, p.number AS part_number, p.name AS part_name, p.unit, q.number AS requested_number, q.name AS requested_name, k.name AS kit,
    w.number AS work_number, w.title AS work_title, w.status AS work_status, rb.name AS reserved_by_name, lb.name AS released_by_name
    FROM gk_stock_reservations r JOIN gk_parts p ON p.id = r.part_id JOIN gk_parts q ON q.id = r.requested_part_id LEFT JOIN gk_kits k ON k.id = r.kit_id JOIN gk_work_orders w ON w.id = r.work_order_id
    LEFT JOIN gk_members rb ON rb.id = r.reserved_by LEFT JOIN gk_members lb ON lb.id = r.released_by WHERE ${where} ORDER BY r.reserved_at, r.line, r.id`, ...params)
  return rows.map(row => {
    const previous = rows.filter(other => other.part_id===row.part_id && other.work_order_id===row.work_order_id && !other.released_at && (other.reserved_at<row.reserved_at || other.reserved_at===row.reserved_at && other.id<row.id)).reduce((sum,other)=>sum+other.quantity_milli,0)
    row.issued_milli=Math.max(0,Math.min(row.quantity_milli,row.issued_milli-previous))
    const needed = row.released_at ? 0 : Math.max(0, row.quantity_milli - row.issued_milli)
    return { id: row.id, workOrder: { id: row.work_order_id, number: row.work_number, title: row.work_title, status: row.work_status }, part: { id: row.part_id, number: row.part_number, name: row.part_name, unit: row.unit },
      insteadOf: row.requested_part_id !== row.part_id ? { id: row.requested_part_id, number: row.requested_number, name: row.requested_name } : null, kit: row.kit ?? null,
      quantity: fromMilli(row.quantity_milli), issued: fromMilli(Math.max(0, row.issued_milli)), stillNeeded: fromMilli(needed),
      state: row.released_at ? 'released' : needed === 0 ? 'issued' : 'open', reservedBy: row.reserved_by_name, reservedAt: row.reserved_at,
      releasedBy: row.released_by_name ?? null, releasedAt: row.released_at ?? null, releaseReason: row.release_reason ?? null }
  })
}
