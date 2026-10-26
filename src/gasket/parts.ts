import { SOURCE_BALANCE, stockSources } from './stock-sources'
import { customStatements, customValues } from './custom-fields'
import { canonicalPart, UNMERGED } from './part-identity'
import { catalogView } from './catalogs'
// Clause 3 (and the parts half of clause 8): parts, stock movements and
// physical counts. On-hand is the sum of append-only movements; every write
// checks inside its batch that on-hand stays at or above zero.
import type { Bindings } from '../auth.server'
import { capabilitySql, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt } from './core'
import type { Input } from './input'
import { fromMilli, toMilli } from './quantity'
import type { FromProposal } from './schedules'
import { RESERVED, RESERVED_FOR_OTHERS, reservations, substituteList } from './reservations'
import { portion } from './receipt-stock'
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
  const id = newId(), category = input.text('category', { optional: true, max: 80 }) || null
  const custom = await customStatements(env, actor, input, 'part', id, category, true)
  await commit(env, [stmt(env, 'INSERT INTO gk_parts (id, number, name, unit, minimum_milli, location, created_at, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, number, name, unit, minimum, location, now(), category), ...custom],
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
  const source = input.text('receiptLine', { optional: true, max: 100 })
  const identity = input.text('identity', { optional: !source, max: 100 })
  const seen = (await one(env, 'SELECT COALESCE(MAX(seq),0) AS n FROM gk_stock_moves WHERE part_id=?', found.id))!.n
  const sources = await stockSources(env, actor, found.id)
  insist(!sources.some(row=>row.reconciliationRequired), 'source_reconciliation_required', 409)
  const selected = sources.find(row => row.id === source)
  if (source) {
    insist(selected, 'receipt_line_not_found', 404)
    insist(!selected.expired, 'stock_expired', 409)
    insist(!selected.reconciliationRequired, 'source_reconciliation_required', 409)
    insist(!selected.serial || quantity === 1000, 'serial_requires_one_unit')
    insist(selected.on_hand_milli >= quantity, 'source_stock_unavailable', 409)
    insist(!await one(env, 'SELECT 1 FROM gk_controlled_moves WHERE identity=?', identity), 'issue_replayed', 409)
  } else {
    insist(found.on_hand - sources.reduce((sum,row) => sum + Math.max(0,row.on_hand_milli),0) >= quantity, 'stock_source_required', 409)
  }
  const free = (await one<{ n: number }>(env, `SELECT ${onHandOf} - ${RESERVED_FOR_OTHERS} AS n`, found.id, found.id, workOrder.id))!.n
  insist(free >= quantity, 'insufficient_stock', 409, { onHand: fromMilli(found.on_hand), free: fromMilli(free) })
  const id = newId()
  return { id, part: found, quantity, statements: [
    guard(env, 'insufficient_stock', `${onHandOf} - ${RESERVED_FOR_OTHERS} >= ?`, found.id, found.id, workOrder.id, quantity),
    ...(source ? [guard(env, 'issue_replayed', 'NOT EXISTS(SELECT 1 FROM gk_controlled_moves WHERE identity=?)', identity),
      guard(env, 'source_stock_unavailable', `${SOURCE_BALANCE} >= ? AND NOT EXISTS(SELECT 1 FROM gk_receipt_trace_holds WHERE receipt_line_id=?)`, source, source, quantity, source)] :
      [guard(env, 'stale', `${onHandOf} = ? AND (SELECT COALESCE(MAX(seq),0) FROM gk_stock_moves WHERE part_id=?)=?`, found.id, found.on_hand, found.id, seen)]),
    issueInsert(env, id, found.id, quantity, workOrder.id, actor.id, selected ? `Bin ${selected.bin || 'unspecified'}; lot ${selected.lot || 'none'}; serial ${selected.serial || 'none'}; receipt source ${source}` : null),
    ...(source ? [stmt(env, 'INSERT INTO gk_controlled_moves(move_id,receipt_line_id,identity) VALUES (?,?,?)', id, source, identity)] : []),
  ] }
}

/** Return parts from a work order; damaged items never enter usable stock. */
export async function returnPart(env: Bindings, actor: Actor, input: Input, workOrder: { id: string }) {
  const found = await part(env, input.text('part', { max: 100 }))
  const quantity = toMilli(input.text('quantity', { max: 20 }))
  const condition = input.text('condition', { optional: true, max: 20 }) || 'usable'
  insist(condition === 'usable' || condition === 'damaged', 'invalid_return_condition')
  const reason = input.text('reason', { optional: condition !== 'damaged', max: 300 }) || null
  const seen = (await one(env, 'SELECT COALESCE(MAX(seq),0) AS n FROM gk_stock_moves WHERE part_id=?', found.id))!.n
  const sourceIssue = input.text('sourceIssue', { optional: true, max: 100 })
  const traced = await one(env, `SELECT c.*,m.quantity_milli,l.serial FROM gk_controlled_moves c JOIN gk_part_moves m ON m.id=c.move_id JOIN gk_receipt_lines l ON l.id=c.receipt_line_id WHERE c.move_id=? AND m.part_id IN (SELECT id FROM gk_parts WHERE id=? UNION SELECT part_id FROM gk_part_canonical WHERE canonical_id=?) AND m.work_order_id=? AND m.kind='issue'`, sourceIssue, found.id, found.id, workOrder.id)
  const sourceHeld = `(SELECT -quantity_milli FROM gk_part_moves WHERE id=?) - (SELECT COALESCE(SUM(m.quantity_milli),0) FROM gk_controlled_moves c JOIN gk_part_moves m ON m.id=c.move_id WHERE c.source_issue=?)`
  if (sourceIssue) {
    insist(traced, 'source_issue_not_found', 404)
    insist(!traced.serial || quantity === 1000, 'serial_requires_one_unit')
  } else {
    const controlled = await one(env, `SELECT COALESCE(SUM(m.quantity_milli),0) AS n FROM gk_controlled_moves c JOIN gk_stock_moves m ON m.id=c.move_id WHERE m.part_id=? AND m.work_order_id=? AND m.kind IN ('issue','return')`, found.id, workOrder.id)
    const total = await one(env, `SELECT -COALESCE(SUM(quantity_milli),0) AS n FROM gk_stock_moves WHERE part_id=? AND work_order_id=? AND kind IN ('issue','return')`,found.id,workOrder.id)
    insist(total!.n + controlled!.n >= quantity, 'source_issue_required', 409)
  }
  const held = "(SELECT -COALESCE(SUM(quantity_milli), 0) FROM gk_stock_moves WHERE part_id = ? AND work_order_id = ? AND kind IN ('issue', 'return'))"
  const holding = (await one<{ n: number }>(env, `SELECT ${held} AS n`, found.id, workOrder.id))!.n
  insist(holding >= quantity, 'return_exceeds_issue', 409, { held: fromMilli(holding) })
  const id = newId()
  return { id, part: found, quantity, condition, reason, statements: [
    guard(env, 'return_exceeds_issue', `${held} >= ?`, found.id, workOrder.id, quantity),
    ...(!sourceIssue ? [guard(env, 'stale', '(SELECT COALESCE(MAX(seq),0) FROM gk_stock_moves WHERE part_id=?)=?',found.id,seen)] : []),
    ...(sourceIssue ? [guard(env, 'return_exceeds_issue', `${sourceHeld} >= ?`, sourceIssue, sourceIssue, quantity)] : []),
    returnInsert(env, id, found.id, quantity, workOrder.id, actor.id, traced ? `Return from controlled issue ${sourceIssue}; receipt source ${traced.receipt_line_id}` : null),
    ...(traced ? [stmt(env, 'INSERT INTO gk_controlled_moves(move_id,receipt_line_id,source_issue) VALUES (?,?,?)', id, traced.receipt_line_id, sourceIssue)] : []),
    ...(condition === 'damaged' ? [stmt(env, 'INSERT INTO gk_work_return_quarantine(return_id,reason) VALUES (?,?)', id, reason)] : []),
  ] }
}

/** Owner-confirmed inspection releases or writes off held work returns. */
export async function disposeWorkQuarantine(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const returnId = input.text('returnId', { max: 100 }), id = input.text('identity', { max: 100 })
  const kind = input.text('kind'), quantity = toMilli(input.text('quantity', { max: 20 }))
  const reason = input.text('reason', { max: 300 })
  insist(kind === 'release' || kind === 'write_off', 'invalid_disposition')
  insist(input.flag('confirmed'), 'disposition_confirmation_required')
  const fingerprint = await sha256Hex(JSON.stringify({ returnId, kind, quantity, reason }))
  const original = await one(env, `SELECT m.* FROM gk_stock_moves m JOIN gk_work_return_quarantine q ON q.return_id=m.id WHERE m.id=?`, returnId)
  insist(original, 'quarantine_not_found', 404)
  const replay = (row: { fingerprint: string }) => {
    insist(row.fingerprint === fingerprint, 'disposition_identity_conflict', 409)
    return { id: original.part_id, disposition: id, replayed: true }
  }
  const existing = await one(env, 'SELECT fingerprint FROM gk_work_quarantine_dispositions WHERE id=?', id)
  if (existing) return replay(existing)
  const disposed = await one(env, 'SELECT COALESCE(SUM(quantity_milli),0) AS quantity,COALESCE(SUM(value_cents),0) AS value FROM gk_work_quarantine_dispositions WHERE return_id=?', returnId)
  const remaining = original.quantity_milli - disposed.quantity
  insist(quantity <= remaining, 'quarantine_quantity_unavailable', 409)
  const value = portion((original.value_cents ?? 0) - disposed.value, quantity, remaining)
  const controlled = await one(env, 'SELECT c.receipt_line_id,l.serial FROM gk_controlled_moves c JOIN gk_receipt_lines l ON l.id=c.receipt_line_id WHERE c.move_id=?', returnId)
  insist(!controlled?.serial || quantity === 1000, 'serial_requires_one_unit')
  const move = kind === 'release' ? newId() : null, authority = capabilitySql(actor.sessionId, 'site.manage')
  const statements = [
    guard(env, 'stale', authority.sql, ...authority.params),
    guard(env, 'stale', '(SELECT COALESCE(SUM(quantity_milli),0) FROM gk_work_quarantine_dispositions WHERE return_id=?)=?', returnId, disposed.quantity),
    ...(move ? [stmt(env, `INSERT INTO gk_part_moves(id,part_id,kind,quantity_milli,value_cents,note,actor,at) VALUES (?,?,'receive',?,?,?,?,?)`, move, original.source_part_id, quantity, value, `Work return quarantine released: ${reason}`, actor.id, now())] : []),
    ...(move && controlled ? [stmt(env, 'INSERT INTO gk_controlled_moves(move_id,receipt_line_id) VALUES (?,?)', move, controlled.receipt_line_id)] : []),
    stmt(env, 'INSERT INTO gk_work_quarantine_dispositions(id,return_id,kind,quantity_milli,value_cents,reason,fingerprint,actor,at,move_id) VALUES (?,?,?,?,?,?,?,?,?,?)', id, returnId, kind, quantity, value, reason, fingerprint, actor.id, now(), move),
  ]
  try {
    await commit(env, statements, { actor: actor.id, action: 'part.disposition', subject: original.part_id,
      detail: { disposition: id, returnId, workOrder: original.work_order_id, kind, quantity: fromMilli(quantity), valueCents: value, reason, confirmed: true } })
  } catch (error) {
    const concurrent = await one(env, 'SELECT fingerprint FROM gk_work_quarantine_dispositions WHERE id=?', id)
    if (concurrent) return replay(concurrent)
    throw error
  }
  return { id: original.part_id, disposition: id, replayed: false }
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
  const moves = await all(env, `SELECT c.receipt_line_id AS controlled_source,c.source_issue,l.bin,l.lot,l.serial,m.id, m.source_part_id, m.seq, m.kind, m.quantity_milli, m.value_cents, m.reason, m.count_line_id, m.unit_price_cents, m.freight_cents, m.tax_cents, m.counted_milli, m.note, m.at, m.work_order_id, w.number AS work_order_number, mb.name AS actor
    FROM gk_stock_moves m LEFT JOIN gk_controlled_moves c ON c.move_id=m.id LEFT JOIN gk_receipt_lines l ON l.id=c.receipt_line_id LEFT JOIN gk_work_orders w ON w.id = m.work_order_id LEFT JOIN gk_members mb ON mb.id = m.actor WHERE m.part_id = ? ORDER BY m.seq DESC, m.kind`, id)
  const quarantines = await all(env, `SELECT m.id, m.work_order_id, w.number AS work_order_number, m.quantity_milli, m.value_cents, m.at, q.reason, mb.name AS actor
    FROM gk_stock_moves m JOIN gk_work_return_quarantine q ON q.return_id=m.id
    JOIN gk_work_orders w ON w.id=m.work_order_id LEFT JOIN gk_members mb ON mb.id=m.actor WHERE m.part_id=? ORDER BY m.seq DESC`, id)
  const dispositions = await all(env, `SELECT d.*,mb.name AS actor_name FROM gk_work_quarantine_dispositions d JOIN gk_stock_moves m ON m.id=d.return_id LEFT JOIN gk_members mb ON mb.id=d.actor WHERE m.part_id=? ORDER BY d.at,d.id`, id)
  for (const row of quarantines) {
    row.dispositions = dispositions.filter(event => event.return_id === row.id).map(event => ({ ...event, quantity: fromMilli(event.quantity_milli) }))
    row.remaining_milli = row.quantity_milli - row.dispositions.reduce((sum: number, event: any) => sum + event.quantity_milli, 0)
    row.remaining_value_cents = (row.value_cents ?? 0) - row.dispositions.reduce((sum: number, event: any) => sum + event.value_cents, 0)
    row.remaining = fromMilli(row.remaining_milli)
  }
  return { ...found, stockSources: await stockSources(env, _actor, id), customFields: await customValues(env, 'part', found.id, found.category), catalog, photos, merges, quarantines: quarantines.map(row => ({ ...row, quantity: fromMilli(row.quantity_milli) })), quarantinedQuantity: fromMilli(quarantines.reduce((sum,row) => sum+row.remaining_milli,0)), quarantinedValueCents: quarantines.reduce((sum,row) => sum+row.remaining_value_cents,0), ...stockValue(found.on_hand, found.stock_value), onHand: fromMilli(found.on_hand), reserved: fromMilli(reserved), available: fromMilli(found.on_hand - reserved), reservations: held, substitutes, minimum: fromMilli(found.minimum_milli), seen: moves[0]?.seq ?? 0, moves: moves.map(move => ({ ...move, quantity: fromMilli(move.quantity_milli), counted: move.counted_milli === null ? null : fromMilli(move.counted_milli) })) }
}
