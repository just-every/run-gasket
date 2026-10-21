import { UNMERGED, canonicalSql, canonicalPart } from './part-identity'
// PART-007: inventory valuation and the period reconciliation. The policy is
// moving-average cost in whole US cents, and every movement keeps its own
// signed value beside its quantity, so stock value is the sum of movement
// values and nothing later rewrites one:
// - A receipt is valued at its unit price times its quantity (rounded half up
//   to a cent) plus the freight and sales tax entered on it, landed wholly on
//   that receipt's part. With no unit price it takes the part's vendor price;
//   with neither it is unpriced (only its freight and tax count).
// - An issue takes the stock's average: stock value times issued quantity over
//   on-hand, rounded half up; the last unit out takes exactly what is left.
// - A return credits the work order's own issued value for that part: what it
//   still holds in value times returned quantity over what it holds, rounded
//   half up; so a return never changes the cost the work already carries.
// - A count's variance is valued at the stock's average, or with nothing on
//   hand at the latest priced receipt's landed unit cost, else $0.00.
// - Changing a part's vendor price values nothing by itself.
// Movements from before valuation and moved-in opening stock carry no value
// and are counted as unpriced, never as a cost.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { cell } from './audit'
import { all, commit, insist, now, one, stmt } from './core'
import { addDays, isDate, zonedInstant } from './dates'
import type { Input } from './input'
import { fromMilli } from './quantity'

export const POLICY = 'Moving-average cost in whole US cents, rounded half up. A receipt lands its unit price times quantity plus its own freight and sales tax; an issue takes the stock\'s average value; a return credits the work order\'s own issued value; a count variance takes the average. A vendor price change revalues nothing.'

const DOLLARS = /^\d{1,9}(\.\d{1,2})?$/

/** Optional US dollars ("$1,250.50", "12") as whole cents; anything else is refused. */
export function cents(input: Input, name: string): number | null {
  const text = input.text(name, { optional: true, max: 16 }).replace(/[$,]/g, '')
  if (!text) return null
  insist(DOLLARS.test(text), `invalid_${name}`)
  const [whole, part = ''] = text.split('.')
  return Number(whole) * 100 + Number(part.padEnd(2, '0'))
}

/** value times quantity over base, rounded half up (all non-negative). */
const share = (value: number, quantity: number, base: number) => Math.floor((2 * value * quantity + base) / (2 * base))

/** A receipt's landed value and the price parts it keeps. */
export function receiptValue(input: Input, vendorPrice: number | null, quantityMilli: number) {
  const unitPrice = cents(input, 'unitPrice') ?? vendorPrice
  const freight = cents(input, 'freight') ?? 0, tax = cents(input, 'tax') ?? 0
  const extended = unitPrice === null ? 0 : share(unitPrice, quantityMilli, 1000)
  return { unitPrice, freight, tax, value: extended + freight + tax }
}

const STOCK = '(SELECT COALESCE(SUM(value_cents), 0) AS value, COALESCE(SUM(quantity_milli), 0) AS qty FROM gk_stock_moves WHERE part_id = ?)'
const HELD = "(SELECT -COALESCE(SUM(value_cents), 0) AS value, -COALESCE(SUM(quantity_milli), 0) AS qty FROM gk_stock_moves WHERE part_id = ? AND work_order_id = ? AND kind IN ('issue', 'return'))"

/** The issue's insert, valued inside the batch at the stock's average (its guard has already refused a short issue). */
export const issueInsert = (env: Bindings, id: string, part: string, quantity: number, workOrder: string, actor: string) =>
  stmt(env, `INSERT INTO gk_part_moves (id, part_id, kind, quantity_milli, value_cents, work_order_id, actor, at) SELECT ?, ?, 'issue', ?, -((2 * s.value * CAST(? AS INTEGER) + s.qty) / (2 * s.qty)), ?, ?, ? FROM ${STOCK} s`,
    id, part, -quantity, quantity, workOrder, actor, now(), part)

/** The return's insert, valued inside the batch at the work order's own issued value. */
export const returnInsert = (env: Bindings, id: string, part: string, quantity: number, workOrder: string, actor: string) =>
  stmt(env, `INSERT INTO gk_part_moves (id, part_id, kind, quantity_milli, value_cents, work_order_id, actor, at) SELECT ?, ?, 'return', ?, (2 * h.value * CAST(? AS INTEGER) + h.qty) / (2 * h.qty), ?, ?, ? FROM ${HELD} h`,
    id, part, quantity, quantity, workOrder, actor, now(), part, workOrder)

/** A count variance's value (the count's stale guard keeps it current). */
export async function varianceValue(env: Bindings, part: string, varianceMilli: number) {
  if (varianceMilli === 0) return 0
  const stock = (await one<{ value: number; qty: number }>(env, `SELECT s.value, s.qty FROM ${STOCK} s`, part))!
  if (varianceMilli < 0) return -share(stock.value, -varianceMilli, stock.qty)
  if (stock.qty > 0) return share(stock.value, varianceMilli, stock.qty)
  const last = await one<{ value_cents: number; quantity_milli: number }>(env, "SELECT value_cents, quantity_milli FROM gk_stock_moves WHERE part_id = ? AND kind = 'receive' AND (unit_price_cents IS NOT NULL OR catalog_item_id IS NOT NULL) ORDER BY seq DESC LIMIT 1", part)
  return last ? share(last.value_cents, varianceMilli, last.quantity_milli) : 0
}

/** A lead sets a part's current vendor price (or clears it); stock and work values are untouched. */
export async function setVendorPrice(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const part = await canonicalPart(env,input.text('part',{max:100}))
  insist(part, 'part_not_found', 404)
  const price = cents(input, 'price')
  await commit(env, [stmt(env, 'UPDATE gk_parts SET price_cents = ? WHERE id = ?', price, part.id)],
    { actor: actor.id, action: 'part.price', subject: part.id, detail: { from: part.price_cents, to: price } })
  return { id: part.id, priceCents: price }
}

/** A part's stock value and average unit cost (null with nothing on hand). */
export function stockValue(onHandMilli: number, valueCents: number) {
  return { valueCents, averageCents: onHandMilli > 0 ? share(valueCents, 1000, onHandMilli) : null }
}

const SUM = (when: string, column: string) => `COALESCE(SUM(CASE WHEN ${when} THEN ${column} ELSE 0 END), 0)`

/**
 * Opening, movement and closing quantity and value per part for site-local
 * dates from..to, both included: opening is every movement before the start
 * of `from`, closing every movement before the end of `to`.
 */
export async function reconciliation(env: Bindings, actor: Actor, url: URL) {
  requireCapability(actor, 'history.export')
  const to = url.searchParams.get('to') || actor.today, from = url.searchParams.get('from') || `${to.slice(0, 8)}01`
  insist(isDate(from) && isDate(to) && from <= to, 'invalid_period')
  const start = zonedInstant(actor.zone, `${from}T00:00`), end = zonedInstant(actor.zone, `${addDays(to, 1)}T00:00`)
  const during = (kinds: string) => `m.at >= ${start} AND m.at < ${end} AND m.kind IN (${kinds})`
  const rows = await all(env, `SELECT p.id, p.number, p.name, p.unit,
    ${SUM(`m.at < ${start}`, 'm.quantity_milli')} AS opening_q, ${SUM(`m.at < ${start}`, 'm.value_cents')} AS opening_v,
    ${SUM(during("'receive', 'opening'"), 'm.quantity_milli')} AS received_q, ${SUM(during("'receive', 'opening'"), 'm.value_cents')} AS received_v,
    ${SUM(during("'issue'"), 'm.quantity_milli')} AS issued_q, ${SUM(during("'issue'"), 'm.value_cents')} AS issued_v,
    ${SUM(during("'return'"), 'm.quantity_milli')} AS returned_q, ${SUM(during("'return'"), 'm.value_cents')} AS returned_v,
    ${SUM(during("'quarantine'"), 'm.quantity_milli')} AS quarantined_q, ${SUM(during("'quarantine'"), 'm.value_cents')} AS quarantined_v,
    ${SUM(during("'count'"), 'm.quantity_milli')} AS counted_q, ${SUM(during("'count'"), 'm.value_cents')} AS counted_v,
    ${SUM(`m.at < ${end}`, 'm.quantity_milli')} AS closing_q, ${SUM(`m.at < ${end}`, 'm.value_cents')} AS closing_v,
    ${SUM(`m.at < ${end} AND (m.value_cents IS NULL OR (m.kind = 'receive' AND m.unit_price_cents IS NULL AND m.catalog_item_id IS NULL))`, '1')} AS unpriced
    FROM gk_parts p LEFT JOIN gk_stock_moves m ON m.part_id = p.id WHERE ${UNMERGED} GROUP BY p.id ORDER BY p.number`)
  const keys = ['opening', 'received', 'issued', 'returned', 'counted', 'quarantined', 'closing'] as const
  const parts = rows.map(row => ({ id: row.id, number: row.number, name: row.name, unit: row.unit, unpriced: row.unpriced as number,
    ...Object.fromEntries(keys.map(key => [key, { quantity: fromMilli(row[`${key}_q`]), valueCents: row[`${key}_v`] as number }])) as Record<typeof keys[number], { quantity: string; valueCents: number }>,
    averageCents: stockValue(row.closing_q, row.closing_v).averageCents }))
  const totals = Object.fromEntries(keys.map(key => [key, rows.reduce((sum, row) => sum + (row[`${key}_v`] as number), 0)])) as Record<typeof keys[number], number>
  return { from, to, zone: actor.zone, policy: POLICY, parts, totals }
}

const money = (value: number | null) => value === null ? '' : `${value < 0 ? '-' : ''}${(Math.abs(value) / 100).toFixed(2)}`

export async function reconciliationCsv(env: Bindings, actor: Actor, url: URL) {
  const report = await reconciliation(env, actor, url)
  const stages = [['opening', 'Opening'], ['received', 'Received'], ['issued', 'Issued'], ['returned', 'Returned'], ['counted', 'Count adjustment'], ['quarantined', 'Quarantine adjustment'], ['closing', 'Closing']] as const
  const header = ['From', 'To', 'Part number', 'Part', 'Unit', ...stages.flatMap(([, label]) => [`${label} quantity`, `${label} value (USD)`]), 'Average unit cost (USD)', 'Unpriced movements']
  const lines = report.parts.map(row => [report.from, report.to, row.number, row.name, row.unit, ...stages.flatMap(([key]) => [row[key].quantity, money(row[key].valueCents)]), money(row.averageCents), row.unpriced])
  lines.push([report.from, report.to, '', 'Total', '', ...stages.flatMap(([key]) => ['', money(report.totals[key])]), '', report.parts.reduce((sum, row) => sum + row.unpriced, 0)])
  // Plain numbers (negative ones too) are written as numbers; every other value goes through the formula-safe cell.
  const field = (value: unknown) => typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value)) ? String(value) : cell(value)
  return [header, ...lines].map(line => line.map(field).join(',')).join('\r\n') + '\r\n'
}
