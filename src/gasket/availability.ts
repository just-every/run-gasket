// REPORT-002: downtime and production availability, for leads, supervisors and
// the owner, over a period of site-local days for the site or one register
// entry and everything below it (ASSET-001).
// - Production time is the site's declared weekly production hours (none
//   declared: every hour of every day), as they stand now, inside the period.
// - Each outage is a failure stop, a planned stop or degraded operation (the
//   asset kept running at reduced output), with its reason and failure mode.
//   Outages are clipped to the period; one still open counts to now.
// - An entry's planned time is the production time inside its own or any lower
//   entry's planned stops; it is left out of the denominator (production time
//   less planned time). Its down time is the denominator time inside any failure
//   stop of it or below it, overlapping outages counted once. Availability is
//   (denominator - down) / denominator. Degraded operation is listed in its own
//   column and does not lower availability.
// - Unknown coverage is denominator time that no hour meter on the entry or
//   below it was reporting (from its first to its last good reading); shown,
//   never estimated and never counted as up or down.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { commit, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { hourMeterSpans, outagePeriod, percent } from './outages'
import { intersect, minutes, productionHours, subtract, union } from './spans'

export const DEFINITIONS = [
  ['Production time', 'The site\'s declared weekly production hours inside the period (with none declared, every hour of every day). The hours as they stand now apply to the whole period.'],
  ['Outage', 'Downtime recorded on a work order, clipped to the period; one still open counts to now. Each is a failure stop, a planned stop or degraded operation, with its reason and failure mode; its latest classification counts.'],
  ['Planned time', 'Production time inside a planned stop of the entry or any entry below it. It is left out of the denominator, never counted as down.'],
  ['Denominator', 'Production time less planned time.'],
  ['Down time', 'Denominator time inside a failure stop of the entry or any entry below it. Outages that overlap count once; the overlap is shown.'],
  ['Availability', '(Denominator - down time) / denominator, as a percentage.'],
  ['Degraded operation', 'Time the asset kept running at reduced output. Listed on its own; it does not lower availability.'],
  ['Unknown coverage', 'Denominator time no hour meter on the entry or below it was reporting (between its first and last good reading). Shown in hours, never estimated, never counted as up or down.'],
  ['Rounding', 'Minutes are whole; hours and percentages have one decimal, rounded half up. Times are the site\'s own clock.'],
].map(([term, text]) => ({ term, text }))

export async function availability(env: Bindings, actor: Actor, url: URL) {
  requireCapability(actor, 'board.read')
  const p = await outagePeriod(env, actor, url)
  const meters = await hourMeterSpans(env, p.window.start, p.window.end)
  const productionMinutes = minutes(p.production.spans)
  // The entry asked for with everything below it that had an outage; for the site, every line and every entry with an outage.
  const shown = p.asset ? [p.asset.id, ...[...p.scope!].filter(id => id !== p.asset!.id && p.outages.some(row => row.asset.id === id))]
    : [...p.entries.values()].filter(row => row.level === 'line' || p.outages.some(outage => outage.asset.id === row.id)).map(row => row.id as string)
  const entries = shown.map(id => {
    const row = p.entries.get(id)!, tree = p.subtree(id), mine = p.outages.filter(outage => tree.has(outage.asset.id))
    const of = (kind: string) => mine.filter(outage => outage.kind === kind)
    const planned = union(of('planned').flatMap(outage => outage.production))
    const denominator = subtract(p.production.spans, planned)
    const down = intersect(of('failure').flatMap(outage => outage.production), denominator)
    const counted = of('failure').reduce((sum, outage) => sum + minutes(intersect(outage.production, denominator)), 0)
    const degraded = subtract(intersect(of('degraded').flatMap(outage => outage.production), denominator), down)
    const reporting = meters.filter(meter => tree.has(meter.asset))
    const unknown = subtract(denominator, reporting.flatMap(meter => meter.span ? [meter.span] : []))
    const d = minutes(denominator), u = minutes(down)
    return {
      id, tag: row.tag, name: row.name, level: row.level, productionMinutes, plannedMinutes: minutes(planned), denominatorMinutes: d, downMinutes: u, upMinutes: d - u,
      overlapMinutes: counted - u, degradedMinutes: minutes(degraded), availabilityPercent: percent(d - u, d), unknownCoverageMinutes: minutes(unknown),
      hourMeters: reporting.map(meter => meter.name), outages: mine.length, downNow: [...new Set(mine.filter(outage => outage.open && outage.kind === 'failure').map(outage => outage.asset.tag))],
    }
  })
  const timeline = p.outages.map(({ depth: _depth, production: _production, ...outage }) => outage)
  return { site: p.site, asset: p.asset, from: p.from, to: p.to, window: p.window, today: p.today, definitions: DEFINITIONS,
    production: { declared: p.production.declared, hours: await productionHours(env), minutes: productionMinutes }, entries, outages: timeline }
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

/** A lead declares production hours: one window on each chosen ISO weekday (Monday 1 to Sunday 7), ending by 24:00. */
export async function addProductionHours(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const weekdays = [...new Set(input.list('weekdays').flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean))]
  insist(weekdays.length && weekdays.every(value => /^[1-7]$/.test(value)), 'invalid_weekdays')
  const starts = input.text('starts', { max: 5 }), ends = input.text('ends', { max: 5 })
  insist(CLOCK.test(starts) && (CLOCK.test(ends) || ends === '24:00') && starts < ends, 'invalid_hours')
  const days = weekdays.map(Number).toSorted((a, b) => a - b)
  for (const day of days) insist(!await one(env, 'SELECT 1 FROM gk_production_hours WHERE weekday = ? AND starts < ? AND ends > ?', day, ends, starts), 'hours_overlap', 409, { weekday: day })
  const ids = days.map(() => newId())
  await commit(env, days.map((day, index) => stmt(env, 'INSERT INTO gk_production_hours (id, weekday, starts, ends, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', ids[index], day, starts, ends, actor.id, now())),
    { actor: actor.id, action: 'production.hours.add', subject: 'site', detail: { weekdays: days, starts, ends } })
  return { ids }
}

export async function removeProductionHours(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const row = await one(env, 'SELECT * FROM gk_production_hours WHERE id = ?', input.text('hours', { max: 100 }))
  insist(row, 'hours_not_found', 404)
  await commit(env, [stmt(env, 'DELETE FROM gk_production_hours WHERE id = ?', row.id)], { actor: actor.id, action: 'production.hours.remove', subject: 'site', detail: { weekday: row.weekday, starts: row.starts, ends: row.ends } })
  return { id: row.id }
}
