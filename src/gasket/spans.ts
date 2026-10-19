// Time spans on the site's wall clock (YYYY-MM-DDTHH:MM, start included, end
// excluded), for the downtime reports (REPORT-002, REPORT-005): merging,
// intersecting and subtracting them so overlapping outages count once, and the
// site's production windows over a period.
import type { Bindings } from '../auth.server'
import { all } from './core'
import { addDays, minutesBetween } from './dates'
import { isoWeekday } from './calendar'

export interface Span { from: string; to: string }

/** The spans merged: sorted, every overlapping or touching pair joined. */
export function union(spans: Span[]): Span[] {
  const merged: Span[] = []
  for (const span of spans.filter(row => row.from < row.to).toSorted((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))) {
    const last = merged.at(-1)
    if (last && span.from <= last.to) { if (span.to > last.to) last.to = span.to } else merged.push({ ...span })
  }
  return merged
}

/** The time both sets of spans cover. */
export function intersect(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [], right = union(b)
  for (const span of union(a)) for (const other of right) {
    const from = span.from > other.from ? span.from : other.from, to = span.to < other.to ? span.to : other.to
    if (from < to) out.push({ from, to })
  }
  return union(out)
}

/** The time `a` covers and `b` does not. */
export function subtract(a: Span[], b: Span[]): Span[] {
  let rest = union(a)
  for (const cut of union(b)) rest = rest.flatMap(span => {
    if (cut.to <= span.from || cut.from >= span.to) return [span]
    return [...(cut.from > span.from ? [{ from: span.from, to: cut.from }] : []), ...(cut.to < span.to ? [{ from: cut.to, to: span.to }] : [])]
  })
  return rest
}

/** Minutes the spans cover, each minute once. */
export const minutes = (spans: Span[]) => union(spans).reduce((sum, span) => sum + minutesBetween(span.from, span.to), 0)

export const productionHours = (env: Bindings) => all(env, 'SELECT * FROM gk_production_hours ORDER BY weekday, starts, id')

/** The production windows between `start` and `end`: each day's declared hours for its ISO weekday, or every hour when none are declared. */
export async function productionSpans(env: Bindings, start: string, end: string): Promise<{ declared: boolean; spans: Span[] }> {
  const hours = await productionHours(env)
  const spans: Span[] = []
  for (let day = start.slice(0, 10); day <= end.slice(0, 10); day = addDays(day, 1)) {
    if (!hours.length) spans.push({ from: `${day}T00:00`, to: `${addDays(day, 1)}T00:00` })
    for (const row of hours.filter(row => row.weekday === isoWeekday(day)))
      spans.push({ from: `${day}T${row.starts}`, to: row.ends === '24:00' ? `${addDays(day, 1)}T00:00` : `${day}T${row.ends}` })
  }
  return { declared: hours.length > 0, spans: intersect(spans, [{ from: start, to: end }]) }
}
