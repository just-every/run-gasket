// REPORT-003: MTBF, MTTR and MTTA with their definitions, sample sizes,
// exclusions and unknown inputs, a failure-mode Pareto and repeat failures,
// each linked to its work. For leads, supervisors and the owner, over a period
// of site-local days (both ends included; the last 30 days by default), for the
// site or one asset.
// - A stop is downtime recorded on a work order. Each is a planned stop or a
//   failure, with an optional failure mode, as recorded when the asset went
//   down; a lead corrects that by appending a classification with a reason, and
//   the latest one counts. Planned stops are left out of every measure.
// - Operating time is what an asset's hour meter (a counter in h, hr, hrs, hour
//   or hours; the first by name when there are several) counted between its
//   first and last good reading in the period. The rest of the period is
//   unknown coverage, shown in hours and never estimated.
// - MTBF: operating hours / failures that started inside that covered time.
//   MTTR: mean minutes from a failure's stop to back in service, over failures
//   that have ended. MTTA: mean minutes from a failure's stop to the first
//   acknowledgement of its work order (PLAN-002) at or after it. Whatever a
//   measure cannot use is counted and listed as excluded.
// Hours and minutes have one decimal and percentages one decimal, rounded half up.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { activeCode } from './codes'
import { all, commit, insist, newId, now, one, stmt, type Row } from './core'
import { addDays, daysBetween, isDate, localNow, minutesBetween, zonedInstant } from './dates'
import type { Input } from './input'
import { meterState } from './meters'
import { site } from './site'

export const HOUR_UNITS = ['h', 'hr', 'hrs', 'hour', 'hours']
const round1 = (value: number) => Math.round(value * 10) / 10
const percent = (part: number, whole: number) => whole ? Math.round(part / whole * 1000) / 10 : null
const mean = (values: number[]) => values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null

export const DEFINITIONS = [
  ['Failure', 'A stop (downtime recorded on a work order) that started in the period and is not classified as a planned stop. Its latest classification counts; planned stops are left out of every measure.'],
  ['Operating time', 'Run hours an asset\'s hour meter (a counter in hours) counted between its first and last good reading in the period. Time outside those readings is unknown coverage: shown, never estimated.'],
  ['MTBF', 'Operating hours divided by the failures that started inside the hour meter\'s covered time. Failures outside it, or on an asset with no hour meter, are excluded and counted.'],
  ['MTTR', 'Mean minutes from a failure\'s stop to back in service, over failures that have ended. Failures still down are excluded and counted.'],
  ['MTTA', 'Mean minutes from a failure\'s stop to the first acknowledgement of its work order at or after it. Failures not acknowledged since are excluded and counted.'],
  ['Failure Pareto', 'Failures by failure mode, most first, with each mode\'s share and the cumulative share; unclassified failures are their own row.'],
  ['Repeat failure', 'Two or more failures of one asset with the same failure mode in the period.'],
  ['Rounding', 'Hours, minutes and percentages have one decimal, rounded half up. Times are the site\'s own clock.'],
].map(([term, text]) => ({ term, text }))

/** The classification a stop is given: a planned stop, or a failure with an optional active failure mode code. */
export async function stopClass(env: Bindings, input: Input) {
  const planned = input.flag('planned')
  const key = input.text('failureMode', { optional: true, max: 40 })
  insist(!(planned && key), 'planned_stop_has_no_failure_mode')
  const code = key ? await activeCode(env, 'failure_mode', key) : null
  return { planned, failureMode: (code?.id as string | undefined) ?? null, key: key || null }
}

/** Stops matching `where` (on gk_downtime d) with their asset and work, every classification in order and the one that counts. */
export async function classifiedStops(env: Bindings, where: string, ...params: unknown[]) {
  const stops = await all(env, `SELECT d.*, a.tag AS asset_tag, a.name AS asset_name, w.number, w.title, m.name AS recorded_by_name FROM gk_downtime d JOIN gk_assets a ON a.id = d.asset_id
    LEFT JOIN gk_work_orders w ON w.id = d.work_order_id LEFT JOIN gk_members m ON m.id = d.recorded_by WHERE ${where} ORDER BY d.started_on, d.id`, ...params)
  const corrections = await all(env, `SELECT c.*, m.name AS by FROM gk_downtime_classes c JOIN gk_downtime d ON d.id = c.downtime_id LEFT JOIN gk_members m ON m.id = c.recorded_by WHERE ${where} ORDER BY c.recorded_at, c.rowid`, ...params)
  const codes = new Map((await all(env, "SELECT id, key, label FROM gk_codes WHERE kind = 'failure_mode'")).map(code => [code.id, { key: code.key as string, label: code.label as string }]))
  const mode = (id: string | null) => id ? codes.get(id) ?? null : null
  return stops.map(stop => {
    const classifications = [{ planned: Boolean(stop.planned), failureMode: mode(stop.failure_mode), reason: stop.reason, by: stop.recorded_by_name ?? null, at: stop.recorded_at, original: true },
      ...corrections.filter(row => row.downtime_id === stop.id).map(row => ({ planned: Boolean(row.planned), failureMode: mode(row.failure_mode), reason: row.reason, by: row.by ?? null, at: row.recorded_at, original: false }))]
    const current = classifications.at(-1)!
    return { ...stop, planned: current.planned, failureMode: current.failureMode, reclassified: classifications.length > 1, classifications }
  })
}

/** A lead corrects a stop's classification with a reason; the stop and its earlier classifications stay. */
export async function classifyStop(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const [stop] = await classifiedStops(env, 'd.id = ?', input.text('downtime', { max: 100 }))
  insist(stop, 'downtime_not_found', 404)
  const next = await stopClass(env, input)
  const reason = input.text('reason', { max: 500 })
  const to = { planned: next.planned, failureMode: next.key }
  const from = { planned: stop.planned, failureMode: stop.failureMode?.key ?? null }
  insist(to.planned !== from.planned || to.failureMode !== from.failureMode, 'classification_unchanged', 409)
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_downtime_classes (id, downtime_id, planned, failure_mode, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, stop.id, next.planned ? 1 : 0, next.failureMode, reason, actor.id, now())],
    { actor: actor.id, action: 'downtime.classify', subject: stop.asset_id, detail: { downtime: stop.id, workOrder: stop.work_order_id, from, to, reason } })
  return { id: stop.id, classification: id }
}

/** An asset's hour meter's good readings inside the window: operating hours between the first and last, and the unknown rest. */
async function coverage(env: Bindings, meter: Row | undefined, start: string, end: string) {
  const whole = minutesBetween(start, end) / 60
  if (!meter) return { meter: null, from: null, to: null, operatingHours: null, unknownHours: round1(whole) }
  const points = (await meterState(env, meter.id)).points.filter(point => point.at >= start && point.at <= end).toSorted((a, b) => a.at.localeCompare(b.at) || Number(a.normalized) - Number(b.normalized))
  if (points.length < 2) return { meter: meter.name as string, from: null, to: null, operatingHours: null, unknownHours: round1(whole) }
  const first = points[0], last = points.at(-1)!
  return { meter: meter.name as string, from: first.at, to: last.at, operatingHours: Number(last.normalized) - Number(first.normalized), unknownHours: round1((minutesBetween(start, first.at) + minutesBetween(last.at, end)) / 60) }
}

export async function reliability(env: Bindings, actor: Actor, url: URL) {
  requireCapability(actor, 'board.read')
  const params = url.searchParams
  const to = params.get('to') || actor.today, from = params.get('from') || addDays(to, -29)
  insist(isDate(from) && isDate(to) && from <= to && daysBetween(from, to) <= 366, 'invalid_period')
  // One site per installation today: naming any other site finds nothing (as ADMIN-006 and REPORT-004).
  const named = params.get('site'), place = await site(env)
  if (named) insist(place && named === place.name, 'site_not_found', 404)
  const assetId = params.get('asset') || null
  const asset = assetId ? await one(env, 'SELECT id, tag, name FROM gk_assets WHERE id = ?', assetId) : null
  if (assetId) insist(asset, 'asset_not_found', 404)
  const start = `${from}T00:00`, upTo = `${addDays(to, 1)}T00:00`, clock = localNow(actor.zone)
  const end = upTo < clock ? upTo : clock
  const scope = `d.started_on >= ? AND d.started_on < ? ${assetId ? 'AND d.asset_id = ?' : ''}`, scopeArgs = [start, end, ...(assetId ? [assetId] : [])]
  const stops = await classifiedStops(env, scope, ...scopeArgs)
  const acknowledgements = await all(env, `SELECT subject, at FROM gk_audit WHERE action = 'workorder.acknowledge' AND subject IN (SELECT d.work_order_id FROM gk_downtime d WHERE ${scope}) ORDER BY at, seq`, ...scopeArgs)

  // Operating time per asset, from its hour meter.
  const hourMeters = new Map<string, Row>()
  for (const meter of await all(env, `SELECT id, asset_id, name FROM gk_meters WHERE kind = 'counter' AND lower(unit) IN (${HOUR_UNITS.map(() => '?').join(', ')}) ${assetId ? 'AND asset_id = ?' : ''} ORDER BY name, id`, ...HOUR_UNITS, ...(assetId ? [assetId] : [])))
    if (!hourMeters.has(meter.asset_id)) hourMeters.set(meter.asset_id, meter)
  const assetIds = [...new Set([...(assetId ? [assetId] : []), ...stops.map(stop => stop.asset_id), ...hourMeters.keys()])]
  const covered = new Map<string, Awaited<ReturnType<typeof coverage>>>()
  for (const id of assetIds) covered.set(id, await coverage(env, hourMeters.get(id), start, end))

  const failures = stops.filter(stop => !stop.planned).map(stop => {
    const span = covered.get(stop.asset_id)!
    const stoppedAt = zonedInstant(actor.zone, stop.started_on)
    const ack = acknowledgements.find(row => row.subject === stop.work_order_id && row.at >= stoppedAt)
    return {
      id: stop.id, asset: { id: stop.asset_id, tag: stop.asset_tag, name: stop.asset_name }, work: stop.work_order_id ? { id: stop.work_order_id, number: stop.number, title: stop.title } : null,
      started_on: stop.started_on, ended_on: stop.ended_on, minutes: stop.minutes, reason: stop.reason, failureMode: stop.failureMode, reclassified: stop.reclassified, classifications: stop.classifications,
      covered: Boolean(span.from && stop.started_on >= span.from && stop.started_on <= span.to!), acknowledgedAt: ack?.at ?? null, ackMinutes: ack ? (ack.at - stoppedAt) / 60_000 : null,
    }
  })
  const plannedStops = stops.filter(stop => stop.planned).map(stop => ({ id: stop.id, asset: { id: stop.asset_id, tag: stop.asset_tag, name: stop.asset_name }, work: stop.work_order_id ? { id: stop.work_order_id, number: stop.number, title: stop.title } : null, started_on: stop.started_on, ended_on: stop.ended_on, minutes: stop.minutes, reason: stop.reason, reclassified: stop.reclassified, classifications: stop.classifications }))

  const assets = assetIds.map(id => {
    const span = covered.get(id)!, mine = failures.filter(row => row.asset.id === id), inside = mine.filter(row => row.covered).length
    const seen = stops.find(stop => stop.asset_id === id)
    return { id, tag: seen?.asset_tag ?? null, name: seen?.asset_name ?? null, ...span, operatingHours: span.operatingHours === null ? null : round1(span.operatingHours), failures: mine.length, coveredFailures: inside, mtbfHours: span.operatingHours !== null && inside ? round1(span.operatingHours / inside) : null, _hours: span.operatingHours }
  }).filter(row => row.failures || row.operatingHours !== null || row.id === assetId)
  for (const row of assets) if (!row.tag) Object.assign(row, await one(env, 'SELECT tag, name FROM gk_assets WHERE id = ?', row.id))

  const operating = assets.reduce((sum, row) => sum + (row._hours ?? 0), 0)
  const inCoverage = failures.filter(row => row.covered).length
  const mtbf = { hours: inCoverage ? round1(operating / inCoverage) : null, operatingHours: round1(operating), failures: inCoverage, excluded: failures.length - inCoverage, unknownHours: round1(assets.reduce((sum, row) => sum + row.unknownHours, 0)) }
  const ended = failures.filter(row => row.ended_on)
  const mttr = { minutes: mean(ended.map(row => row.minutes!)), sample: ended.length, excluded: failures.length - ended.length }
  const acked = failures.filter(row => row.ackMinutes !== null)
  const mtta = { minutes: mean(acked.map(row => row.ackMinutes!)), sample: acked.length, excluded: failures.length - acked.length }

  // Failure Pareto and repeats, by the latest classification.
  const groups = new Map<string, { key: string | null; label: string; failures: typeof failures }>()
  for (const row of failures) {
    const key = row.failureMode?.key ?? null, entry = groups.get(key ?? '') ?? { key, label: row.failureMode?.label ?? 'Unclassified', failures: [] as typeof failures }
    entry.failures.push(row)
    groups.set(key ?? '', entry)
  }
  let running = 0
  const pareto = [...groups.values()].toSorted((a, b) => b.failures.length - a.failures.length || Number(a.key === null) - Number(b.key === null) || a.label.localeCompare(b.label))
    .map(group => { running += group.failures.length; return { key: group.key, label: group.label, count: group.failures.length, percent: percent(group.failures.length, failures.length), cumulativePercent: percent(running, failures.length), work: group.failures.map(row => row.work) } })
  const byAssetMode = new Map<string, typeof failures>()
  for (const row of failures.filter(row => row.failureMode)) { const key = `${row.asset.id}|${row.failureMode!.key}`; byAssetMode.set(key, [...(byAssetMode.get(key) ?? []), row]) }
  const repeats = [...byAssetMode.values()].filter(rows => rows.length > 1)
    .map(rows => ({ asset: rows[0].asset, failureMode: rows[0].failureMode, count: rows.length, failures: rows.map(row => ({ id: row.id, started_on: row.started_on, work: row.work })) }))

  return { site: place?.name ?? null, asset, from, to, window: { start, end }, today: actor.today, definitions: DEFINITIONS, mtbf, mttr, mtta,
    assets: assets.map(({ _hours, ...row }) => row), failures, plannedStops, pareto, repeats }
}
