// PART-009: the stores report, for leads, supervisors and the owner, over a
// period of site-local days (both ends included; the last 90 days by
// default), and its source-movement download.
// - Stocked: parts with stock on hand at some point in the period (on hand at
//   its start, or after any of its movements in it). A stockout is a movement
//   in the period that leaves a stocked part with nothing on hand; the
//   stockout share is parts with one over stocked parts. Out now: stocked
//   parts with nothing on hand at the period's end.
// - Demand: issues less returns in the period, by quantity and their kept
//   PART-007 value, per work order and per asset; open reservations are
//   committed demand now.
// - Slow: stock on hand at the period's end with no issue in the period.
//   Dead: stock on hand at the period's end with no issue in the 365 days
//   ending then.
// - Turns: issued value less returned value over the average of the opening
//   and closing stock value (the PART-007 reconciliation of the same period),
//   two decimals, not annualized; none when the average is $0.00.
// - Count accuracy: direct counts (GAS-03) and planned count lines (PART-004)
//   in the period; a hit counts exactly the expected quantity. Percentages
//   one decimal, rounded half up.
// - Moved in: opening stock moved in from MaintainX is shown apart from native
//   receipts (it is part of balances, never of demand); moved-in work history
//   costs stay in asset history and never enter demand.
// Every number comes with the parts, work orders or movements it counts, and
// the movements download lists every source movement of the period.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { cell } from './audit'
import { all, insist, type Row } from './core'
import { addDays, daysBetween, isDate, localNow, zonedInstant } from './dates'
import { fromMilli } from './quantity'
import { RESERVED } from './reservations'
import { site } from './site'
import { openReplenishments } from './replenishment-state'
import { reconciliation } from './valuation'

const percent = (part: number, whole: number) => whole ? Math.round(part / whole * 1000) / 10 : null

async function period(env: Bindings, actor: Actor, url: URL) {
  requireCapability(actor, 'board.read')
  const params = url.searchParams, to = params.get('to') || actor.today, from = params.get('from') || addDays(to, -89)
  insist(isDate(from) && isDate(to) && from <= to && daysBetween(from, to) <= 366, 'invalid_period')
  // One site per installation today: naming any other site finds nothing (as ADMIN-006).
  const named = params.get('site'), place = await site(env)
  if (named) insist(place && named === place.name, 'site_not_found', 404)
  return { from, to, site: place?.name ?? null, start: zonedInstant(actor.zone, `${from}T00:00`), end: zonedInstant(actor.zone, `${addDays(to, 1)}T00:00`), yearStart: zonedInstant(actor.zone, `${addDays(to, -364)}T00:00`) }
}

const MOVES = `SELECT m.seq, m.part_id, m.kind, m.quantity_milli, m.value_cents, m.at, m.origin, m.reason, m.work_order_id, m.count_line_id, p.number, p.name AS part_name, p.unit,
  w.number AS work_number, w.asset_id, a.tag, a.name AS asset_name, mb.name AS by_name
  FROM gk_part_moves m JOIN gk_parts p ON p.id = m.part_id LEFT JOIN gk_work_orders w ON w.id = m.work_order_id LEFT JOIN gk_assets a ON a.id = w.asset_id LEFT JOIN gk_members mb ON mb.id = m.actor`

export async function storesReport(env: Bindings, actor: Actor, url: URL) {
  const p = await period(env, actor, url)
  const value = await reconciliation(env, actor, new URL(`http://gasket.invalid/?from=${p.from}&to=${p.to}`))
  const parts = await all(env, `SELECT p.id, p.number, p.name, p.unit, p.origin, ${RESERVED} AS reserved FROM gk_parts p ORDER BY p.number`)
  const moves = await all(env, `${MOVES} WHERE m.at < ? ORDER BY m.seq`, p.end)
  const lines = await all(env, "SELECT l.part_id, l.counted_milli, l.expected_milli FROM gk_count_lines l JOIN gk_counts c ON c.id = l.count_id WHERE c.submitted_at >= ? AND c.submitted_at < ?", p.start, p.end)
  const inPeriod = (move: Row) => move.at >= p.start
  const byPart = new Map<string, Row[]>(parts.map(part => [part.id as string, []]))
  for (const move of moves) byPart.get(move.part_id)!.push(move)

  const rows = parts.map(part => {
    let onHand = 0, stocked = false
    const stockouts: { seq: number; at: number; kind: string; workOrder: number | null }[] = []
    for (const move of byPart.get(part.id)!) {
      if (inPeriod(move) && onHand > 0) stocked = true
      const before = onHand
      onHand += move.quantity_milli
      if (inPeriod(move) && onHand > 0) stocked = true
      if (inPeriod(move) && before > 0 && onHand <= 0) stockouts.push({ seq: move.seq, at: move.at, kind: move.kind, workOrder: move.work_number ?? null })
    }
    const own = byPart.get(part.id)!, issues = own.filter(move => move.kind === 'issue')
    const direct = own.filter(move => inPeriod(move) && move.kind === 'count' && !move.count_line_id), planned = lines.filter(line => line.part_id === part.id)
    const counted = direct.length + planned.length, hits = direct.filter(move => move.quantity_milli === 0).length + planned.filter(line => line.counted_milli === line.expected_milli).length
    const movedIn = own.filter(move => move.kind === 'opening' && move.origin === 'import').reduce((sum, move) => sum + move.quantity_milli, 0)
    return { id: part.id, number: part.number, name: part.name, unit: part.unit, onHand: fromMilli(onHand), onHandMilli: onHand, reserved: fromMilli(part.reserved), stocked, stockouts,
      issuedInPeriod: issues.some(inPeriod), lastIssueAt: issues.at(-1)?.at ?? null, issuedInYear: issues.some(move => move.at >= p.yearStart),
      counts: { counted, hits }, movedIn: movedIn ? fromMilli(movedIn) : null }
  })
  const stocked = rows.filter(row => row.stocked), withStockout = stocked.filter(row => row.stockouts.length)

  // Demand: issues and returns in the period, by work order and by asset, at their kept values.
  const used = moves.filter(move => inPeriod(move) && (move.kind === 'issue' || move.kind === 'return'))
  const group = (key: (move: Row) => string | null) => {
    const groups = new Map<string, Row[]>()
    for (const move of used) { const k = key(move); if (k) groups.set(k, [...(groups.get(k) ?? []), move]) }
    return [...groups.values()].map(list => {
      const lines = new Map<string, { number: string; name: string; unit: string; milli: number }>()
      for (const move of list) { const line = lines.get(move.part_id) ?? { number: move.number, name: move.part_name, unit: move.unit, milli: 0 }; line.milli -= move.quantity_milli; lines.set(move.part_id, line) }
      return { first: list[0], valueCents: -list.reduce((sum, move) => sum + (move.value_cents ?? 0), 0), unpriced: list.filter(move => move.value_cents === null).length, parts: [...lines.values()].map(line => ({ number: line.number, name: line.name, unit: line.unit, quantity: fromMilli(line.milli) })) }
    }).sort((a, b) => b.valueCents - a.valueCents)
  }
  const byWorkOrder = group(move => move.work_order_id).map(({ first, ...rest }) => ({ id: first.work_order_id, number: first.work_number, asset: first.tag ?? null, ...rest }))
  const byAsset = group(move => move.asset_id).map(({ first, ...rest }) => ({ id: first.asset_id, tag: first.tag, name: first.asset_name, ...rest }))
  const netIssuedCents = -(value.totals.issued + value.totals.returned)
  const averageCents = Math.floor((value.totals.opening + value.totals.closing + 1) / 2)
  const brief = (row: typeof rows[number]) => ({ id: row.id, number: row.number, name: row.name, unit: row.unit, onHand: row.onHand, lastIssueAt: row.lastIssueAt })
  const counted = rows.reduce((sum, row) => sum + row.counts.counted, 0), hits = rows.reduce((sum, row) => sum + row.counts.hits, 0)
  return {
    from: p.from, to: p.to, site: p.site, zone: actor.zone,
    replenishment: { basis: 'Current open documents, independent of movement date filter', open: await openReplenishments(env, actor) },
    value: { openingCents: value.totals.opening, closingCents: value.totals.closing, averageCents, netIssuedCents, turns: averageCents > 0 ? Math.round(netIssuedCents / averageCents * 100) / 100 : null },
    stockouts: { stocked: stocked.length, withStockout: withStockout.length, percent: percent(withStockout.length, stocked.length), events: withStockout.flatMap(row => row.stockouts.map(event => ({ part: { id: row.id, number: row.number, name: row.name }, ...event }))), outNow: stocked.filter(row => row.onHandMilli <= 0).map(brief) },
    demand: { byWorkOrder, byAsset, committed: rows.filter(row => row.reserved !== '0').map(row => ({ id: row.id, number: row.number, name: row.name, unit: row.unit, reserved: row.reserved })) },
    slow: rows.filter(row => row.onHandMilli > 0 && !row.issuedInPeriod).map(brief),
    dead: rows.filter(row => row.onHandMilli > 0 && !row.issuedInYear).map(brief),
    counts: { counted, hits, percent: percent(hits, counted), parts: rows.filter(row => row.counts.counted).map(row => ({ id: row.id, number: row.number, ...row.counts })) },
    movedIn: rows.filter(row => row.movedIn).map(row => ({ id: row.id, number: row.number, name: row.name, unit: row.unit, openingQuantity: row.movedIn })),
  }
}

const KIND: Record<string, string> = { opening: 'Opening stock', receive: 'Received', issue: 'Issued', return: 'Returned', count: 'Count adjustment' }
const money = (cents: number | null) => cents === null ? '' : `${cents < 0 ? '-' : ''}${(Math.abs(cents) / 100).toFixed(2)}`

/** Every source movement of the period, oldest first. */
export async function storesMovementsCsv(env: Bindings, actor: Actor, url: URL) {
  const p = await period(env, actor, url)
  const moves = await all(env, `${MOVES} WHERE m.at >= ? AND m.at < ? ORDER BY m.seq`, p.start, p.end)
  const header = ['When (site time)', 'Part number', 'Part', 'Unit', 'Movement', 'Quantity', 'Value (USD)', 'Reason', 'Work order', 'Asset tag', 'Origin', 'By']
  const rows = moves.map(move => [localNow(actor.zone, move.at).replace('T', ' '), move.number, move.part_name, move.unit, KIND[move.kind], fromMilli(move.quantity_milli), move.value_cents === null ? 'unpriced' : money(move.value_cents), move.reason ?? '',
    move.work_number ? `WO-${String(move.work_number).padStart(4, '0')}` : '', move.tag ?? '', move.origin === 'import' ? 'moved in' : 'native', move.by_name ?? (move.origin === 'import' ? 'Move-in' : '')])
  const field = (value: unknown) => typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value)) ? String(value) : cell(value)
  return [header, ...rows].map(line => line.map(field).join(',')).join('\r\n') + '\r\n'
}
