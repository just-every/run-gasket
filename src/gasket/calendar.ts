// PM-003: where a calendar schedule may fall. Due dates are site-local
// calendar dates (YYYY-MM-DD), so a daylight-saving change never moves one.
// A schedule may allow only some months (1-12) and ISO weekdays (Monday 1 to
// Sunday 7), and by default the site's closures (holidays and shutdown
// windows, both ends inclusive) move it too. A due date on a day that is not
// allowed moves forward to the next allowed day, never earlier.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, insist, newId, now, one, stmt, type Row } from './core'
import { addDays, isDate } from './dates'
import type { Input } from './input'

export interface Policy { months: number[] | null; weekdays: number[] | null; observeClosures: boolean }
export interface Closure { starts_on: string; ends_on: string }
const SEARCH_DAYS = 3660

const numbers = (text: string | null) => text ? text.split(',').map(Number) : null
export const policyOf = (row: Row): Policy => ({ months: numbers(row.months), weekdays: numbers(row.weekdays), observeClosures: Boolean(row.observe_closures) })
export const isoWeekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7

/** Allowed months and weekdays from a form or JSON list; none (or all) means every one. */
export function policyFields(input: Input) {
  const read = (name: string, max: number) => {
    const values = [...new Set(input.list(name).flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean))]
    insist(values.every(value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max), `invalid_${name}`)
    const sorted = values.map(Number).toSorted((a, b) => a - b)
    return sorted.length && sorted.length < max ? sorted.join(',') : null
  }
  return { months: read('months', 12), weekdays: read('weekdays', 7), observeClosures: input.has('observeClosures') ? input.flag('observeClosures') : true }
}

export const closures = (env: Bindings) => all<Closure & Row>(env, 'SELECT * FROM gk_closures ORDER BY starts_on, id')

export function allowedOn(date: string, policy: Policy, closed: Closure[]) {
  if (policy.months && !policy.months.includes(Number(date.slice(5, 7)))) return false
  if (policy.weekdays && !policy.weekdays.includes(isoWeekday(date))) return false
  return !policy.observeClosures || !closed.some(row => row.starts_on <= date && date <= row.ends_on)
}

/** The first allowed day on or after `date`. */
export function nextAllowed(date: string, policy: Policy, closed: Closure[]) {
  for (let day = 0, at = date; day < SEARCH_DAYS; day++, at = addDays(at, 1)) if (allowedOn(at, policy, closed)) return at
  insist(false, 'no_allowed_day', 409)
  return date
}

/** The next `count` due dates from a nominal date, each moved to an allowed day: a fixed cadence steps from the
 * nominal dates, a completion cadence from each due date (as if the work were done on the day it is due). */
export function upcoming(nominal: string, everyDays: number, policy: Policy, closed: Closure[], { count = 5, completion = false } = {}) {
  const dates: string[] = []
  for (let at = nominal; dates.length < count;) {
    const due = nextAllowed(at, policy, closed)
    if (!dates.includes(due)) dates.push(due)
    at = addDays(completion ? due : at, everyDays)
  }
  return dates
}

/** Calendar schedules with no open work that the calendar alone placed: re-placed when the closures change. */
async function replace(env: Bindings, before: Closure[], after: Closure[]) {
  const rows = await all(env, "SELECT * FROM gk_schedules s WHERE s.active = 1 AND s.every_days IS NOT NULL AND s.nominal_date IS NOT NULL AND NOT EXISTS(SELECT 1 FROM gk_work_orders w WHERE w.schedule_id = s.id AND w.status NOT IN ('closed', 'cancelled'))")
  return rows.filter(row => row.next_due_date === nextAllowed(row.nominal_date, policyOf(row), before))
    .map(row => stmt(env, 'UPDATE gk_schedules SET next_due_date = ?, revision = revision + 1 WHERE id = ?', nextAllowed(row.nominal_date, policyOf(row), after), row.id))
}

/** A holiday or shutdown window, both days inclusive. Due dates the calendar placed on it move to the next allowed day. */
export async function addClosure(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const kind = input.text('kind', { max: 20 }), label = input.text('label', { max: 120 })
  insist(kind === 'holiday' || kind === 'shutdown', 'invalid_kind')
  const startsOn = input.text('startsOn', { max: 10 }), endsOn = input.text('endsOn', { optional: true, max: 10 }) || startsOn
  insist(isDate(startsOn) && isDate(endsOn) && startsOn <= endsOn, 'invalid_dates')
  const before = await closures(env), id = newId()
  const after = [...before, { starts_on: startsOn, ends_on: endsOn }]
  await commit(env, [stmt(env, 'INSERT INTO gk_closures (id, kind, label, starts_on, ends_on, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, kind, label, startsOn, endsOn, actor.id, now()), ...await replace(env, before, after)],
    { actor: actor.id, action: 'closure.add', subject: id, detail: { kind, label, startsOn, endsOn } })
  return { id }
}

export async function removeClosure(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const closure = await one(env, 'SELECT * FROM gk_closures WHERE id = ?', input.text('closure', { max: 100 }))
  insist(closure, 'closure_not_found', 404)
  const before = await closures(env)
  await commit(env, [stmt(env, 'DELETE FROM gk_closures WHERE id = ?', closure.id), ...await replace(env, before, before.filter(row => row.id !== closure.id))],
    { actor: actor.id, action: 'closure.remove', subject: closure.id, detail: { kind: closure.kind, label: closure.label, startsOn: closure.starts_on, endsOn: closure.ends_on } })
  return { id: closure.id }
}
