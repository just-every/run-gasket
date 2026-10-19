// Clause 5: preventive schedules and "Create due work orders". A schedule is
// due by calendar (every N days from its due date) and/or by a counter meter
// (every N units, on its normalized value, ASSET-005). At most one open work
// order exists per schedule. Stale or suspect readings never make one due.
// PM-003: a calendar schedule's cadence is fixed (from its nominal date, so
// calendar moves never drift it) or from completion (the day its work is
// approved), and its due dates keep to the months, weekdays and closures it
// observes (calendar.ts); skips and deferrals are approved exceptions.
import { runJob } from './automation-jobs'
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { closures, nextAllowed, policyFields, policyOf } from './calendar'
import { CURRENT_REVISION } from './checklists'
import { NEXT_NUMBER, all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { assigneeFits } from './crew'
import { leadDays } from './site'
import { addDays, isDate } from './dates'
import { estimate } from './performance'
import type { Input } from './input'
import { meterState } from './meters'
import { addMeter, compareMeter, meterNumber } from './quantity'
import { firingReading, triggerFields } from './triggers'
import { issueDueRoutes } from './routes'
import { toolNames, toolStatements } from './tools'

/** A counter's normalized value now and its readings held back as stale or suspect. */
const meterNow = async (env: Bindings, meterId: string | null) => {
  if (!meterId) return { now: null, held: 0 }
  const state = await meterState(env, meterId)
  return { now: state.now, held: state.held.length }
}

export async function scheduleFields(env: Bindings, input: Input) {
  // PLAN-001: a schedule names an asset or, with no asset, a location (by calendar only: meters belong to assets).
  const assetId = input.text('asset', { optional: true, max: 100 }) || null, location = input.text('location', { optional: true, max: 160 }) || null
  insist(Boolean(assetId) !== Boolean(location), 'asset_or_location')
  const asset = assetId ? await one(env, 'SELECT id, retired_at FROM gk_assets WHERE id = ?', assetId) : null
  if (assetId) {
    insist(asset, 'asset_not_found', 404)
    insist(!asset.retired_at, 'asset_retired', 409)
  }
  const checklist = await one(env, 'SELECT id FROM gk_checklists WHERE id = ?', input.text('checklist', { max: 100 }))
  insist(checklist, 'checklist_not_found', 404)
  const title = input.text('title', { max: 160 })
  const everyDays = input.integer('everyDays', { min: 1, max: 3660, optional: true })
  const meterId = input.text('meter', { optional: true, max: 100 }) || null
  let everyUnits: string | null = null, nextDueMeter: string | null = null, trigger: ReturnType<typeof triggerFields> | null = null
  if (meterId) {
    const meter = await one(env, 'SELECT id, kind, asset_id FROM gk_meters WHERE id = ?', meterId)
    insist(meter && asset && meter.asset_id === asset.id, 'meter_not_found', 404)
    if (meter.kind === 'counter') {
      everyUnits = meterNumber(input.text('everyUnits', { max: 20 }), 'everyUnits')
      insist(compareMeter(everyUnits, '0') > 0, 'invalid_everyUnits')
      const latest = (await meterNow(env, meter.id)).now
      nextDueMeter = input.has('firstDueMeter') ? meterNumber(input.text('firstDueMeter', { max: 20 }), 'firstDueMeter') : addMeter(latest ?? '0', everyUnits)
    } else trigger = triggerFields(input, meter)
  }
  insist(everyDays || meterId, 'cadence_required')
  const combine = input.text('combine', { optional: true, max: 10 }) || 'first'
  insist(combine === 'first' || combine === 'both', 'invalid_combine')
  const firstDue = input.text('firstDue', { optional: !everyDays, max: 10 }) || null
  if (everyDays) insist(firstDue && isDate(firstDue), 'invalid_firstDue')
  const cadence = input.text('cadence', { optional: true, max: 12 }) || 'fixed'
  insist(cadence === 'fixed' || cadence === 'completion', 'invalid_cadence')
  const policy = policyFields(input), maxDeferDays = input.integer('maxDeferDays', { min: 0, max: 365, optional: true }) ?? 14
  const nextDueDate = everyDays ? nextAllowed(firstDue!, policyOf({ months: policy.months, weekdays: policy.weekdays, observe_closures: policy.observeClosures }), await closures(env)) : null
  const assigneeId = input.text('assignee', { optional: true, max: 100 }) || null
  // REPORT-004: an optional team (the assignee must belong to it) and estimate, carried onto the work it issues.
  const teamId = input.text('team', { optional: true, max: 100 }) || null
  if (teamId) insist(await one(env, 'SELECT 1 FROM gk_teams WHERE id = ?', teamId), 'team_not_found', 404)
  if (assigneeId) await assigneeFits(env, assigneeId, teamId)
  const estimateMinutes = estimate(input)
  return { teamId, estimateMinutes, asset: asset?.id ?? null, location, checklist: checklist.id, title, everyDays, meterId, everyUnits, nominalDate: everyDays ? firstDue : null, nextDueDate, nextDueMeter, assigneeId, combine, trigger, cadence, months: policy.months, weekdays: policy.weekdays, observeClosures: policy.observeClosures, maxDeferDays }
}

export interface FromProposal { proposal?: string; also?: (id: string) => D1PreparedStatement[] }
/** ASSET-008: a calibration task is a schedule with a grace window (days); its cadence runs from completion unless it says otherwise. */
export interface ScheduleKind extends FromProposal { calibration?: number }

export async function createSchedule(env: Bindings, actor: Actor, input: Input, { proposal, also, calibration }: ScheduleKind = {}) {
  requireCapability(actor, proposal ? 'proposal.decide' : 'register.manage')
  const value = await scheduleFields(env, input), id = newId(), tools = toolNames(input)
  if (calibration !== undefined && !input.has('cadence')) value.cadence = 'completion'
  await commit(env, [stmt(env, 'INSERT INTO gk_schedules (id, asset_id, location, checklist_id, title, every_days, meter_id, every_units, next_due_date, next_due_meter, assignee_id, team_id, estimate_minutes, cadence, months, weekdays, observe_closures, max_defer_days, nominal_date, combine, trigger_when, trigger_value, reset_value, sustain_minutes, tools, calibration, grace_days, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, value.asset, value.location, value.checklist, value.title, value.everyDays, value.meterId, value.everyUnits, value.nextDueDate, value.nextDueMeter, value.assigneeId, value.teamId, value.estimateMinutes, value.cadence, value.months, value.weekdays, value.observeClosures ? 1 : 0, value.maxDeferDays, value.nominalDate,
    value.combine, value.trigger?.when ?? null, value.trigger?.value ?? null, value.trigger?.reset ?? null, value.trigger?.sustainMinutes ?? 0, tools, calibration !== undefined ? 1 : 0, calibration ?? null, actor.id, now()), ...(also?.(id) ?? [])],
  { actor: actor.id, action: calibration !== undefined ? 'calibration.create' : 'schedule.create', subject: id, detail: { ...value, tools, ...(calibration !== undefined ? { graceDays: calibration } : {}), ...(proposal ? { proposal } : {}) } })
  return { id }
}

export const DUE_SCHEDULES = `SELECT s.* FROM gk_schedules s LEFT JOIN gk_assets a ON a.id = s.asset_id
    WHERE s.active = 1 AND a.retired_at IS NULL AND NOT EXISTS(SELECT 1 FROM gk_work_orders w WHERE w.schedule_id = s.id AND w.status NOT IN ('closed', 'cancelled'))`

/** One work order for each given schedule that is due: by date within the site's lead time (PM-001), by its counter value or its
 * trigger (PM-002), on whichever comes first or, when it says both, only once both are due. */
export async function issueDue(env: Bindings, actor: Pick<Actor, 'id' | 'today'>, schedules: Row[], action: string, { automatic = false, preview = false } = {}) {
  const horizon = addDays(actor.today, await leadDays(env))
  const created: { id: string; schedule: string; revision: number; due: string; reason: string; occurrence: string; reading?: string }[] = []
  const held: { schedule: string; readings: number }[] = []
  const statements: D1PreparedStatement[] = []
  for (const schedule of schedules) {
    const state = schedule.meter_id ? await meterState(env, schedule.meter_id) : null
    const byDate = Boolean(schedule.next_due_date && schedule.next_due_date <= horizon)
    const fired = state && schedule.trigger_when ? firingReading(schedule, state) : null
    const byMeter = Boolean(state && (schedule.trigger_when ? fired : state.now !== null && compareMeter(state.now, schedule.next_due_meter) >= 0))
    const due = schedule.next_due_date && schedule.meter_id ? (schedule.combine === 'both' ? byDate && byMeter : byDate || byMeter) : byDate || byMeter
    // Not due on good readings, but flagged ones wait on the meter: say so rather than skip it silently.
    if (!due && state?.held.length) held.push({ schedule: schedule.id, readings: state.held.length })
    if (!due) continue
    const id = newId(), dueDate = byDate ? schedule.next_due_date : actor.today, reading = fired?.id ?? (byMeter ? state!.latest?.id : null) ?? null
    // PM-001: the occurrence's stable identity; the scheduler never issues one that already had work (a cancelled one stays owed).
    const occurrence = `${schedule.id}@${byDate ? schedule.next_due_date : fired ? `reading:${fired.id}` : `meter:${schedule.next_due_meter}`}`
    if (automatic && await one(env, 'SELECT 1 FROM gk_work_orders WHERE occurrence = ?', occurrence)) continue
    statements.push(guard(env, 'automation_changed', 'EXISTS(SELECT 1 FROM gk_schedules WHERE id=? AND active=1 AND revision=?)', schedule.id, schedule.revision))
    statements.push(stmt(env, `INSERT INTO gk_work_orders (id, number, asset_id, location, kind, schedule_id, title, checklist_revision_id, due_date, due_meter, trigger_reading_id, occurrence, assignee_id, team_id, trade, estimate_minutes, status, created_by, created_at)
      SELECT ?, ${NEXT_NUMBER}, ?, ?, 'preventive', ?, ?, ${CURRENT_REVISION}, ?, ?, ?, ?, ?, ?, (SELECT trade FROM gk_teams WHERE id = ?), ?, 'open', ?, ?
      WHERE NOT EXISTS(SELECT 1 FROM gk_work_orders WHERE schedule_id = ? AND status NOT IN ('closed', 'cancelled'))`,
    id, schedule.asset_id, schedule.location, schedule.id, schedule.title, schedule.checklist_id, dueDate, byMeter && !schedule.trigger_when ? schedule.next_due_meter : null, byMeter ? reading : null, occurrence, schedule.assignee_id, schedule.team_id, schedule.team_id, schedule.estimate_minutes, actor.id, now(), schedule.id))
    statements.push(...toolStatements(env, id, schedule.tools))
    if (fired) statements.push(stmt(env, 'UPDATE gk_schedules SET trigger_fired_on = ?, revision = revision + 1 WHERE id = ?', fired.taken_on, schedule.id))
    created.push({ id, schedule: schedule.id, revision: schedule.revision, due: dueDate, reason: byDate && byMeter ? 'both' : byDate ? 'date' : 'meter', occurrence, ...(byMeter && reading ? { reading } : {}) })
  }
  if (statements.length && !preview) await commit(env, statements, created.map(item => ({ actor: actor.id, action, subject: item.id, detail: item })))
  return { created, held }
}

/** Creates one work order for every schedule that is due, and one run for every scheduled route occurrence (ASSET-008). Repeating it creates nothing new. */
export async function generateDue(env: Bindings, actor: Actor) {
  requireCapability(actor, 'work.assign')
  return { ...await issueDue(env, actor, await all(env, DUE_SCHEDULES), 'workorder.generate'), runs: await issueDueRoutes(env, actor) }
}

/** PM-002: every reading a door keeps evaluates the schedules on its meter at once, whoever sent it. */
export async function evaluateMeter(env: Bindings, actor: Actor, meterId: string) {
  const schedules = await all(env, `${DUE_SCHEDULES} AND s.meter_id = ?`, meterId)
  const result = await runJob(env, 'pm', 'reading', { day: actor.today, meter: meterId, state: await meterState(env, meterId), schedules }, () => issueDue(env, actor, schedules, 'workorder.trigger'))
  return result.output?.created ?? []
}

/** Moves a schedule on after its work order is approved (or its skip is): the calendar cadence from its nominal date (fixed) or from today (completion), each next date moved to an allowed day; meter cadence from the latest reading. */
export async function advanceStatements(env: Bindings, scheduleId: string, today: string) {
  const schedule = await one(env, 'SELECT s.* FROM gk_schedules s WHERE s.id = ?', scheduleId)
  if (!schedule) return []
  const meterNowValue = (await meterNow(env, schedule.meter_id)).now
  let nominal: string | null = schedule.nominal_date, nextDate: string | null = schedule.next_due_date
  if (schedule.every_days && nominal) {
    const policy = policyOf(schedule), closed = await closures(env)
    if (schedule.cadence === 'completion') nominal = addDays(today, schedule.every_days)
    else {
      nominal = addDays(nominal, schedule.every_days)
      while (nextAllowed(nominal, policy, closed) <= today) nominal = addDays(nominal, schedule.every_days)
    }
    nextDate = nextAllowed(nominal, policy, closed)
  }
  const nextMeter = schedule.meter_id && schedule.every_units ? addMeter(meterNowValue ?? schedule.next_due_meter ?? '0', schedule.every_units) : null
  return [stmt(env, 'UPDATE gk_schedules SET nominal_date = ?, next_due_date = ?, next_due_meter = ?, revision = revision + 1 WHERE id = ?', nominal, nextDate, nextMeter, schedule.id)]
}

export async function scheduleList(env: Bindings, actor: Actor) {
  const rows = await all(env, `SELECT s.id, s.title, s.every_days, s.every_units, s.next_due_date, s.next_due_meter, s.active, s.revision, s.cadence, s.months, s.weekdays, s.observe_closures, s.max_defer_days, s.nominal_date, s.combine, s.trigger_when, s.trigger_value, s.reset_value, s.sustain_minutes, s.trigger_fired_on, m.kind AS meter_kind,
    s.asset_id, a.tag AS asset_tag, COALESCE(a.name, s.location) AS asset_name, s.location, c.name AS checklist, s.meter_id, m.name AS meter, m.unit AS meter_unit, mb.name AS assignee,
    (SELECT w.id FROM gk_work_orders w WHERE w.schedule_id = s.id AND w.status NOT IN ('closed', 'cancelled')) AS open_work
    FROM gk_schedules s LEFT JOIN gk_assets a ON a.id = s.asset_id JOIN gk_checklists c ON c.id = s.checklist_id
    LEFT JOIN gk_meters m ON m.id = s.meter_id LEFT JOIN gk_members mb ON mb.id = s.assignee_id ORDER BY s.active DESC, COALESCE(s.next_due_date, '9999'), COALESCE(a.tag, s.location), s.title, s.id`)
  // A missed occurrence with no open work stays overdue until a lead issues it again or skips it (PLAN-007).
  const meters = new Map<string, { now: string | null; held: number }>()
  for (const id of new Set(rows.map(row => row.meter_id).filter(Boolean))) meters.set(id, await meterNow(env, id))
  const exceptions = await all(env, 'SELECT e.*, r.name AS requested_by_name, d.name AS decided_by_name FROM gk_schedule_exceptions e LEFT JOIN gk_members r ON r.id = e.requested_by LEFT JOIN gk_members d ON d.id = e.decided_by ORDER BY e.requested_at DESC, e.id')
  return rows.map(({ meter_id, ...row }) => ({ ...row, exceptions: exceptions.filter(item => item.schedule_id === row.id).map(({ schedule_id, ...item }) => item), meter_now: meters.get(meter_id)?.now ?? null, meter_held: meters.get(meter_id)?.held ?? 0, overdue: Boolean(row.active && row.next_due_date && row.next_due_date < actor.today && !row.open_work) }))
}
