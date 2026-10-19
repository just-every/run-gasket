// REPORT-004: backlog, PM compliance and schedule performance, for leads,
// supervisors and the owner, over a period of site-local days (both ends
// included; the last 30 days by default) and optionally one team.
// - Backlog: open, in-progress and returned work now, by age since it was
//   raised (0-7, 8-30, 31-90, over 90 days) with estimated hours; work without
//   an estimate is counted and named, never guessed. Overdue (due before today)
//   and at risk (due within the next 7 days and not started) likewise; work
//   awaiting review is counted on its own.
// - PM compliance: every preventive occurrence due in the period is judged once
//   its due date has passed or its work is done: on time (submitted on or
//   before its due date), late, overdue (still open), cancelled, skipped
//   (approved skip) or ungenerated (due, with no work ever issued). All but
//   on time stay in the disclosed denominator, and each drills to its work
//   order, assignee and open blockers. An occurrence is its schedule and due
//   date; when one was issued more than once, its latest work order counts.
// - Planned/reactive: work approved and closed in the period, preventive
//   against corrective, by count and estimated hours.
// - Schedule attainment: work of either kind due in the period and judged as
//   above, done on or before its due date.
// Percentages have one decimal, rounded half up; hours one decimal.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, insist, one, type Row } from './core'
import { addDays, daysBetween, isDate, today as localDate } from './dates'
import type { Input } from './input'
import { site } from './site'

const OPEN = ['open', 'in_progress', 'returned']
const DONE = ['submitted', 'closed']
const BANDS = [['0-7', 7], ['8-30', 30], ['31-90', 90], ['over-90', Infinity]] as const

/** An optional `estimateHours` (up to 1000, at most two decimals), kept as whole minutes. */
export function estimate(input: Input) {
  const raw = input.text('estimateHours', { optional: true, max: 10 })
  if (!raw) return null
  insist(/^\d{1,4}(\.\d{1,2})?$/.test(raw) && Number(raw) > 0 && Number(raw) <= 1000, 'invalid_estimateHours')
  return Math.max(1, Math.round(Number(raw) * 60))
}

const hours = (minutes: number) => Math.round(minutes / 6) / 10
const percent = (part: number, whole: number) => whole ? Math.round(part / whole * 1000) / 10 : null
const tally = (rows: Row[]) => ({ count: rows.length, hours: hours(rows.reduce((sum, row) => sum + (row.estimate_minutes ?? 0), 0)), unestimated: rows.filter(row => !row.estimate_minutes).length })
const brief = (row: Row) => ({ id: row.id, number: row.number, title: row.title, kind: row.kind, status: row.status, due_date: row.due_date, assignee: row.assignee ?? null, team: row.team ?? null, estimate_hours: row.estimate_minutes ? hours(row.estimate_minutes) : null })

export async function performance(env: Bindings, actor: Actor, url: URL) {
  requireCapability(actor, 'board.read')
  const params = url.searchParams, now = actor.today
  const to = params.get('to') || now, from = params.get('from') || addDays(to, -29)
  insist(isDate(from) && isDate(to) && from <= to && daysBetween(from, to) <= 366, 'invalid_period')
  // One site per installation today: naming any other site finds nothing (as ADMIN-006).
  const named = params.get('site'), place = await site(env)
  if (named) insist(place && named === place.name, 'site_not_found', 404)
  const teamId = params.get('team') || null
  const team = teamId ? await one(env, 'SELECT id, name, trade FROM gk_teams WHERE id = ?', teamId) : null
  if (teamId) insist(team, 'team_not_found', 404)
  const byTeam = (column: string) => teamId ? `AND ${column} = ?` : ''
  const teamArgs = teamId ? [teamId] : []

  const orders = (await all(env, `SELECT w.*, m.name AS assignee, t.name AS team FROM gk_work_orders w LEFT JOIN gk_members m ON m.id = w.assignee_id LEFT JOIN gk_teams t ON t.id = w.team_id WHERE w.merged_into IS NULL ${byTeam('w.team_id')}`, ...teamArgs))
    .map(row => ({ ...row, done_on: row.submitted_at && DONE.includes(row.status) ? localDate(actor.zone, row.submitted_at) : null, closed_on: row.closed_at ? localDate(actor.zone, row.closed_at) : null, raised_on: localDate(actor.zone, row.created_at) }))

  // Backlog now.
  const open = orders.filter(row => OPEN.includes(row.status))
  const bands = BANDS.map(([band, upTo], index) => { const rows = open.filter(row => { const age = daysBetween(row.raised_on, now); return age <= upTo && (index === 0 || age > BANDS[index - 1][1]) }); return { band, ...tally(rows) } })
  const overdue = open.filter(row => row.due_date < now), atRisk = open.filter(row => row.status === 'open' && row.due_date >= now && row.due_date <= addDays(now, 7))
  const awaiting = orders.filter(row => row.status === 'submitted')
  const backlog = { ...tally(open), bands, overdue: { ...tally(overdue), orders: overdue.map(brief) }, atRisk: { ...tally(atRisk), orders: atRisk.map(brief) },
    awaitingReview: { ...tally(awaiting), oldestDays: awaiting.length ? Math.max(...awaiting.map(row => daysBetween(localDate(actor.zone, row.submitted_at), now))) : null, orders: awaiting.map(brief) }, unestimated: open.filter(row => !row.estimate_minutes).map(brief) }

  // PM occurrences due in the period.
  const judged = (row: { due_date: string; done_on?: string | null }) => row.due_date < now || Boolean(row.done_on)
  const latest = new Map<string, Row>()
  for (const row of orders.filter(row => row.kind === 'preventive' && row.schedule_id && row.due_date >= from && row.due_date <= to)) {
    const key = `${row.schedule_id}@${row.due_date}`, seen = latest.get(key)
    if (!seen || row.number > seen.number) latest.set(key, row)
  }
  const schedules = new Map((await all(env, 'SELECT s.id, s.title, s.team_id, s.next_due_date, s.active, s.assignee_id, m.name AS assignee FROM gk_schedules s LEFT JOIN gk_members m ON m.id = s.assignee_id')).map(row => [row.id, row]))
  const blockers = await all(env, 'SELECT b.work_order_id, b.kind, b.next_action, b.promised_on, o.name AS owner FROM gk_blockers b LEFT JOIN gk_members o ON o.id = b.owner_id WHERE b.resolved_at IS NULL')
  const occurrences: Row[] = []
  for (const [key, row] of latest) {
    const outcome = row.done_on ? (row.done_on <= row.due_date ? 'on_time' : 'late') : row.status === 'cancelled' ? 'cancelled' : row.due_date < now ? 'overdue' : 'pending'
    occurrences.push({ key, schedule: row.schedule_id, title: schedules.get(row.schedule_id)?.title ?? row.title, due_date: row.due_date, outcome, work: brief(row), blockers: blockers.filter(item => item.work_order_id === row.id).map(({ work_order_id: _id, ...item }) => item) })
  }
  const skips = await all(env, `SELECT e.schedule_id, e.occurrence, e.reason, s.title FROM gk_schedule_exceptions e JOIN gk_schedules s ON s.id = e.schedule_id
    WHERE e.kind = 'skip' AND e.decision = 'approved' AND e.occurrence BETWEEN ? AND ? ${byTeam('s.team_id')}`, from, to, ...teamArgs)
  for (const skip of skips) {
    const key = `${skip.schedule_id}@${skip.occurrence}`, index = occurrences.findIndex(row => row.key === key)
    const row = { key, schedule: skip.schedule_id, title: skip.title, due_date: skip.occurrence, outcome: 'skipped', reason: skip.reason, work: index >= 0 ? occurrences[index].work : null, blockers: [] }
    if (index >= 0) occurrences[index] = row
    else occurrences.push(row)
  }
  for (const schedule of schedules.values()) {
    const due = schedule.next_due_date
    if (!schedule.active || !due || due < from || due > to || due >= now || (teamId && schedule.team_id !== teamId)) continue
    if (occurrences.some(row => row.key === `${schedule.id}@${due}`) || orders.some(row => row.schedule_id === schedule.id && row.due_date === due)) continue
    occurrences.push({ key: `${schedule.id}@${due}`, schedule: schedule.id, title: schedule.title, due_date: due, outcome: 'ungenerated', work: null, assignee: schedule.assignee, blockers: [] })
  }
  occurrences.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title))
  const counted = occurrences.filter(row => row.outcome !== 'pending')
  const outcomes = Object.fromEntries(['on_time', 'late', 'overdue', 'cancelled', 'skipped', 'ungenerated', 'pending'].map(name => [name, occurrences.filter(row => row.outcome === name).length]))
  const compliance = { denominator: counted.length, onTime: outcomes.on_time, onTimePercent: percent(outcomes.on_time, counted.length), outcomes, occurrences }

  // Planned against reactive work closed in the period.
  const closed = orders.filter(row => row.status === 'closed' && row.closed_on! >= from && row.closed_on! <= to)
  const planned = tally(closed.filter(row => row.kind === 'preventive')), reactive = tally(closed.filter(row => row.kind === 'corrective'))
  const mix = { planned, reactive, plannedPercent: percent(planned.count, planned.count + reactive.count) }

  // Schedule attainment over work due in the period.
  const due = orders.filter(row => row.due_date >= from && row.due_date <= to && judged(row))
  const attained = due.filter(row => row.done_on && row.done_on <= row.due_date)
  const attainment = { due: due.length, attained: attained.length, percent: percent(attained.length, due.length), missed: due.filter(row => !attained.includes(row)).map(brief) }

  return { site: place?.name ?? null, team, from, to, today: now, backlog, compliance, mix, attainment }
}
