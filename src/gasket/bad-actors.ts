// REPORT-005: downtime Pareto and the cost of bad actors, for leads,
// supervisors and the owner, over the same period and scope as REPORT-002.
// - Ranked downtime is the production minutes (REPORT-002) of failure stops;
//   planned stops and degraded operation are left out and counted. Where
//   failures of an entry and of an entry above or below it overlap, the shared
//   minutes count once, for the failure that started first (then the higher
//   entry); the other shows them as duplicate time. Failures of unrelated
//   entries are separate losses even at the same time.
// - Leads rank by asset, line (the entry's nearest line; "No line" without
//   one), failure mode (latest classification; "Unclassified") and reason (the
//   recorded reason, ignoring case and outer spaces), most minutes first, with
//   each row's share and the cumulative share of the ranked total.
// - Repair cost reconciles retained work entries, valued stock issues and
//   returns, approved labor and contractor invoices, each work once per row.
//   A work order with no known cost remains unknown.
// - Lost production is counted minutes times the documented USD rate per
//   production hour of the failed entry or, when it has none, its nearest entry
//   above with one; the latest documented rate counts. With no rate, or a rate
//   documented as unknown, the loss is unknown and never estimated.
// Money is USD in whole cents, rounded half up; percentages have one decimal.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { cell } from './audit'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { COSTING_CATEGORIES, reconciledWorkCosts, reconciledWorkCostTotals } from './costing'
import { woDigits } from './quantity'
import { outagePeriod, percent, type Outage } from './outages'
import { intersect, minutes, subtract } from './spans'

export const COST_CATEGORIES = COSTING_CATEGORIES
const DOLLARS = /^-?\d{1,9}(\.\d{1,2})?$/
const toCents = (text: string) => { const [whole, part = ''] = text.replace('-', '').split('.'); const cents = Number(whole) * 100 + Number(part.padEnd(2, '0')); return text.startsWith('-') ? -cents : cents }
export const usd = (cents: number | null) => cents === null ? 'unknown' : `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const DEFINITIONS = [
  ['Downtime', 'Production minutes (REPORT-002) of failure stops in the period. Planned stops and degraded operation are left out and counted.'],
  ['Duplicate time', 'Where failures of an entry and of an entry above or below it overlap, the shared minutes count once, for the failure that started first (then the higher entry). Failures of unrelated entries are separate losses.'],
  ['Pareto', 'Rows by asset, line, failure mode and reason, most minutes first, with each row\'s share and the cumulative share of the ranked total. A reason groups recorded reasons ignoring case and outer spaces.'],
  ['Repair cost', 'Reconciled work actuals: retained repair entries, valued issues less returns, approved labor and contractor invoices. Each work order counts once per row. No known amount remains unknown; unpriced movements remain gaps.'],
  ['Lost production', 'Counted minutes times the documented USD rate per production hour of the failed entry, or its nearest entry above with one; the latest documented rate counts. Without a rate the loss is unknown and never estimated.'],
  ['Repeat failure', 'Two or more failures of one asset with the same failure mode in the period.'],
  ['Rounding', 'Money in whole cents and percentages to one decimal, rounded half up. Times are the site\'s own clock.'],
].map(([term, text]) => ({ term, text }))

const TOTAL_COST = 'SELECT COALESCE(SUM(cents), 0) FROM gk_work_costs WHERE work_order_id = ?'

/** A lead records a repair cost entry on a work order: USD, with a note; a negative entry corrects earlier ones. */
export async function recordWorkCost(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const order = await one(env, 'SELECT id FROM gk_work_orders WHERE id = ?', input.text('workOrder', { max: 100 }))
  insist(order, 'work_order_not_found', 404)
  const category = input.text('category', { max: 20 }) as typeof COST_CATEGORIES[number]
  insist(COST_CATEGORIES.includes(category), 'invalid_category')
  const amount = input.text('amount', { max: 14 }).replace(/[$,]/g, '')
  insist(DOLLARS.test(amount) && toCents(amount) !== 0, 'invalid_amount')
  const cents = toCents(amount), note = input.text('note', { max: 300 }), id = newId()
  insist((await one(env, `SELECT (${TOTAL_COST}) AS total`, order.id))!.total + cents >= 0, 'cost_below_zero', 409)
  await commit(env, [guard(env, 'cost_below_zero', `(${TOTAL_COST}) + ? >= 0`, order.id, cents),
    stmt(env, 'INSERT INTO gk_work_costs (id, work_order_id, category, cents, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, order.id, category, cents, note, actor.id, now())],
  { actor: actor.id, action: 'work.cost', subject: order.id, detail: { category, cents, note } })
  return { id }
}

/** Reconciled actuals preserve the existing work-cost response shape. */
export const workCosts = reconciledWorkCosts

/** A lead documents the lost-production rate of a register entry (USD per production hour), or that it is unknown (no rate), with its basis. */
export async function documentLossRate(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const asset = await one(env, 'SELECT id, tag FROM gk_assets WHERE id = ?', input.text('asset', { max: 100 }))
  insist(asset, 'asset_not_found', 404)
  const rate = input.text('rate', { optional: true, max: 14 }).replace(/[$,]/g, '')
  insist(!rate || (DOLLARS.test(rate) && !rate.startsWith('-')), 'invalid_rate')
  const cents = rate ? toCents(rate) : null, basis = input.text('basis', { max: 500 }), id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_loss_rates (id, asset_id, cents_per_hour, basis, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)', id, asset.id, cents, basis, actor.id, now())],
    { actor: actor.id, action: 'loss.rate', subject: asset.id, detail: { tag: asset.tag, centsPerHour: cents, basis } })
  return { id }
}

/** Every documented rate, oldest first, and the one that counts for each entry. */
export async function lossRates(env: Bindings) {
  const history = await all(env, 'SELECT r.id, r.asset_id, a.tag, a.name, r.cents_per_hour, r.basis, r.recorded_at, m.name AS by FROM gk_loss_rates r JOIN gk_assets a ON a.id = r.asset_id LEFT JOIN gk_members m ON m.id = r.recorded_by ORDER BY r.recorded_at, r.id')
  const current = new Map(history.map(row => [row.asset_id as string, row]))
  return { history, current }
}

/** Each failure stop with its counted minutes (duplicate time on its branch counted once), repair cost, rate and loss. */
function countedFailures(p: Awaited<ReturnType<typeof outagePeriod>>, current: Awaited<ReturnType<typeof lossRates>>['current'], costs: Map<string, number>) {
  const related = (a: string, b: string) => p.ancestry(a).includes(b) || p.ancestry(b).includes(a)
  const counted: Outage[] = []
  return p.outages.filter(outage => outage.kind === 'failure')
    .toSorted((a, b) => a.started_on.localeCompare(b.started_on) || a.depth - b.depth || a.id.localeCompare(b.id))
    .map(outage => {
      const earlier = counted.filter(other => related(other.asset.id, outage.asset.id) && intersect(other.production, outage.production).length)
      const kept = minutes(subtract(outage.production, earlier.flatMap(other => other.production)))
      counted.push(outage)
      const documented = p.ancestry(outage.asset.id).map(id => current.get(id)).find(Boolean)
      const rate = documented ? { entry: { id: documented.asset_id as string, tag: documented.tag as string }, centsPerHour: documented.cents_per_hour as number | null, basis: documented.basis as string, by: documented.by as string | null, at: documented.recorded_at as number } : null
      return {
        id: outage.id, asset: outage.asset, line: outage.line, work: outage.work, failureMode: outage.failureMode, reason: outage.reason, started_on: outage.started_on, ended_on: outage.ended_on, open: outage.open, span: outage.span,
        productionMinutes: outage.productionMinutes, minutes: kept, duplicateMinutes: outage.productionMinutes - kept, duplicateOf: earlier.map(other => ({ id: other.id, asset: other.asset.tag })),
        repairCents: outage.work && costs.has(outage.work.id) ? costs.get(outage.work.id)! : null, rate,
        lossCents: rate && rate.centsPerHour !== null ? Math.round(kept * rate.centsPerHour / 60) : null,
      }
    })
}

type Input5 = ReturnType<typeof countedFailures>[number]

function rank(rows: Input5[], total: number, keyOf: (row: Input5) => string | null, labelOf: (row: Input5) => string) {
  const groups = new Map<string, { key: string | null; label: string; rows: Input5[] }>()
  for (const row of rows) {
    const key = keyOf(row), entry = groups.get(key ?? '') ?? { key, label: labelOf(row), rows: [] }
    entry.rows.push(row)
    groups.set(key ?? '', entry)
  }
  let running = 0
  return [...groups.values()].map(group => ({ ...group, minutes: group.rows.reduce((sum, row) => sum + row.minutes, 0) }))
    .toSorted((a, b) => b.minutes - a.minutes || b.rows.length - a.rows.length || Number(a.key === null) - Number(b.key === null) || a.label.localeCompare(b.label))
    .map(group => {
      running += group.minutes
      const orders = new Map(group.rows.map(row => [row.work?.id ?? row.id, row.repairCents]))
      const known = [...orders.values()].filter(value => value !== null) as number[], losses = group.rows.filter(row => row.lossCents !== null)
      return {
        key: group.key, label: group.label, minutes: group.minutes, failures: group.rows.length, percent: percent(group.minutes, total), cumulativePercent: percent(running, total),
        repeats: repeatsOf(group.rows).length, repairCents: known.length ? known.reduce((sum, value) => sum + value, 0) : null, repairUnknown: orders.size - known.length,
        lossCents: losses.length ? losses.reduce((sum, row) => sum + row.lossCents!, 0) : null, lossUnknownMinutes: group.rows.filter(row => row.lossCents === null).reduce((sum, row) => sum + row.minutes, 0),
        contributors: group.rows.map(row => ({ id: row.id, asset: row.asset, work: row.work, started_on: row.started_on, minutes: row.minutes, duplicateMinutes: row.duplicateMinutes, repairCents: row.repairCents, lossCents: row.lossCents })),
      }
    })
}

function repeatsOf(rows: Input5[]) {
  const byAssetMode = new Map<string, Input5[]>()
  for (const row of rows.filter(row => row.failureMode)) { const key = `${row.asset.id}|${row.failureMode!.key}`; byAssetMode.set(key, [...(byAssetMode.get(key) ?? []), row]) }
  return [...byAssetMode.values()].filter(group => group.length > 1)
    .map(group => ({ asset: group[0].asset, failureMode: group[0].failureMode, count: group.length, failures: group.map(row => ({ id: row.id, started_on: row.started_on, work: row.work })) }))
}

export async function badActors(env: Bindings, actor: Actor, url: URL) {
  requireCapability(actor, 'board.read')
  const p = await outagePeriod(env, actor, url)
  const { current } = await lossRates(env)
  const costs = new Map((await reconciledWorkCostTotals(env)).filter(row => row.priced > 0).map(row => [row.work_order_id as string, row.cents as number]))
  const failures = countedFailures(p, current, costs)
  const total = failures.reduce((sum, row) => sum + row.minutes, 0)
  const all5 = rank(failures, total, () => 'all', () => 'All failures')[0]
  return {
    site: p.site, asset: p.asset, from: p.from, to: p.to, window: p.window, today: p.today, definitions: DEFINITIONS, productionDeclared: p.production.declared,
    totals: { minutes: total, failures: failures.length, duplicateMinutes: failures.reduce((sum, row) => sum + row.duplicateMinutes, 0), repairCents: all5?.repairCents ?? null, repairUnknown: all5?.repairUnknown ?? 0, lossCents: all5?.lossCents ?? null, lossUnknownMinutes: all5?.lossUnknownMinutes ?? 0 },
    excluded: { planned: p.outages.filter(row => row.kind === 'planned').length, degraded: p.outages.filter(row => row.kind === 'degraded').length },
    byAsset: rank(failures, total, row => row.asset.id, row => `${row.asset.tag} ${row.asset.name}`),
    byLine: rank(failures, total, row => row.line?.id ?? null, row => row.line ? `${row.line.tag} ${row.line.name}` : 'No line'),
    byFailureMode: rank(failures, total, row => row.failureMode?.key ?? null, row => row.failureMode?.label ?? 'Unclassified'),
    byReason: rank(failures, total, row => row.reason.trim().toLowerCase(), row => row.reason.trim()),
    repeats: repeatsOf(failures), failures,
  }
}

/** The inputs behind every ranked failure, one row each; unknown money stays "unknown". */
export async function badActorsCsv(env: Bindings, actor: Actor, url: URL) {
  const r = await badActors(env, actor, url)
  const money = (cents: number | null) => cents === null ? 'unknown' : (cents / 100).toFixed(2)
  const lines = [['Stop', 'Asset', 'Asset name', 'Line', 'Failure mode', 'Reason', 'Work order', 'Started', 'Ended', 'Counted from', 'Counted to', 'Production minutes', 'Counted minutes', 'Duplicate minutes', 'Duplicate of', 'Repair cost USD', 'Loss rate USD per hour', 'Loss rate entry', 'Loss rate basis', 'Lost production USD'],
    ...r.failures.map(row => [row.id, row.asset.tag, row.asset.name, row.line?.tag ?? '', row.failureMode?.key ?? 'unclassified', row.reason, row.work ? `WO-${woDigits(row.work.number)}` : '', row.started_on, row.ended_on ?? 'open', row.span.from, row.span.to,
      row.productionMinutes, row.minutes, row.duplicateMinutes, row.duplicateOf.map(other => other.asset).join(' '), money(row.repairCents), row.rate ? money(row.rate.centsPerHour) : 'unknown', row.rate?.entry.tag ?? '', row.rate?.basis ?? '', money(row.lossCents)])]
  return lines.map(line => line.map(cell).join(',')).join('\r\n') + '\r\n'
}
