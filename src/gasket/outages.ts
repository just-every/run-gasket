// The outages the downtime reports read (REPORT-002, REPORT-005): every
// downtime record that overlaps a period of site-local days (both ends
// included; the last 30 days by default), clipped to the period, with its
// latest classification (REPORT-003), the part of it inside the site's
// production windows, and the register entries above and below it (ASSET-001).
// An outage still open counts to now. The period ends at now when it reaches it.
import type { Bindings } from '../auth.server'
import { type Actor } from './actor'
import { all, insist, type Row } from './core'
import { addDays, daysBetween, isDate, localNow, minutesBetween } from './dates'
import { meterState } from './meters'
import { HOUR_UNITS, classifiedStops } from './reliability'
import { site } from './site'
import { intersect, minutes, productionSpans, union, type Span } from './spans'

export const round1 = (value: number) => Math.round(value * 10) / 10
export const percent = (part: number, whole: number) => whole ? Math.round(part / whole * 1000) / 10 : null

export type Kind = 'failure' | 'planned' | 'degraded'
export type Outage = Awaited<ReturnType<typeof outagePeriod>>['outages'][number]

export async function outagePeriod(env: Bindings, actor: Actor, url: URL) {
  const params = url.searchParams
  const to = params.get('to') || actor.today, from = params.get('from') || addDays(to, -29)
  insist(isDate(from) && isDate(to) && from <= to && daysBetween(from, to) <= 366, 'invalid_period')
  // One site per installation today: naming any other site finds nothing (as REPORT-003).
  const named = params.get('site'), place = await site(env)
  if (named) insist(place && named === place.name, 'site_not_found', 404)
  const entries = new Map((await all(env, 'SELECT id, tag, name, level, parent_id, retired_at FROM gk_assets ORDER BY tag')).map(row => [row.id as string, row]))
  const assetId = params.get('asset') || null
  const asset = assetId ? entries.get(assetId) ?? null : null
  if (assetId) insist(asset, 'asset_not_found', 404)
  const clock = localNow(actor.zone), upTo = `${addDays(to, 1)}T00:00`
  const start = `${from}T00:00`, end = upTo < clock ? upTo : clock
  insist(start < end, 'invalid_period')

  const children = new Map<string, string[]>()
  for (const row of entries.values()) if (row.parent_id) children.set(row.parent_id, [...(children.get(row.parent_id) ?? []), row.id])
  const subtree = (id: string) => { const ids = new Set([id]); for (const each of ids) for (const child of children.get(each) ?? []) ids.add(child); return ids }
  const ancestry = (id: string) => { const ids: string[] = []; for (let at: string | null = id; at; at = entries.get(at)?.parent_id ?? null) ids.push(at); return ids }
  const brief = (row: Row | undefined) => row ? { id: row.id as string, tag: row.tag as string, name: row.name as string, level: row.level as string } : null
  const lineOf = (id: string) => brief(ancestry(id).map(each => entries.get(each)).find(row => row?.level === 'line'))
  const scope = asset ? subtree(asset.id) : null

  const production = await productionSpans(env, start, end)
  const stops = (await classifiedStops(env, 'd.started_on < ? AND COALESCE(d.ended_on, ?) > ?', end, clock, start)).filter(stop => !scope || scope.has(stop.asset_id))
  const outages = stops.map(stop => {
    const span: Span = { from: stop.started_on > start ? stop.started_on : start, to: (stop.ended_on ?? clock) < end ? stop.ended_on ?? clock : end }
    const inProduction = intersect([span], production.spans)
    const kind: Kind = stop.planned ? 'planned' : stop.degraded ? 'degraded' : 'failure'
    return {
      id: stop.id as string, asset: brief(entries.get(stop.asset_id))!, line: lineOf(stop.asset_id), depth: ancestry(stop.asset_id).length,
      work: stop.work_order_id ? { id: stop.work_order_id as string, number: stop.number as number, title: stop.title as string } : null,
      kind, failureMode: stop.failureMode, reason: stop.reason as string, started_on: stop.started_on as string, ended_on: (stop.ended_on ?? null) as string | null, open: !stop.ended_on,
      span, startsBefore: stop.started_on < start, endsAfter: !stop.ended_on || stop.ended_on > end,
      production: inProduction, productionMinutes: minutes(inProduction), outsideProductionMinutes: minutesBetween(span.from, span.to) - minutes(inProduction),
      reclassified: stop.reclassified as boolean, classifications: stop.classifications,
    }
  })
  return { site: place?.name ?? null, asset: brief(asset ?? undefined), from, to, window: { start, end }, today: actor.today, production, entries, subtree, ancestry, scope, outages }
}

/** Every hour meter (REPORT-003's hour units) with the time it was reporting in the window: from its first to its last good reading. */
export async function hourMeterSpans(env: Bindings, start: string, end: string) {
  const meters = await all(env, `SELECT id, asset_id, name FROM gk_meters WHERE kind = 'counter' AND lower(unit) IN (${HOUR_UNITS.map(() => '?').join(', ')}) ORDER BY name, id`, ...HOUR_UNITS)
  const out: { asset: string; name: string; span: Span | null }[] = []
  for (const meter of meters) {
    const points = (await meterState(env, meter.id)).points.filter(point => point.at >= start && point.at <= end).map(point => point.at).toSorted()
    out.push({ asset: meter.asset_id, name: meter.name, span: points.length > 1 ? { from: points[0], to: points.at(-1)! } : null })
  }
  return out
}
