// Clause 5: preventive schedules and "Create due work orders". A schedule is
// due by calendar (every N days from its due date) and/or by a counter meter
// (every N units, on its normalized value, ASSET-005). At most one open work
// order exists per schedule. Stale or suspect readings never make one due.
// PM-003: a calendar schedule's cadence is fixed (from its nominal date, so
// calendar moves never drift it) or from completion (the day its work is
// approved), and its due dates keep to the months, weekdays and closures it
// observes (calendar.ts); skips and deferrals are approved exceptions.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { CURRENT_REVISION } from './checklists'
import { NEXT_NUMBER, all, commit, insist, newId, now, one, stmt } from './core'
import { closures, nextAllowed, policyFields, policyOf } from './calendar'
import { addDays, isDate } from './dates'
import type { Input } from './input'
import { meterState } from './meters'
import { addMeter, compareMeter, meterNumber } from './quantity'

export const HORIZON_DAYS = 7
/** A counter's normalized value now and its readings held back as stale or suspect. */
const meterNow = async (env: Bindings, meterId: string | null) => {
  if (!meterId) return { now: null, held: 0 }
  const state = await meterState(env, meterId)
  return { now: state.now, held: state.held.length }
}

export async function scheduleFields(env: Bindings, input: Input) {
  const asset = await one(env, 'SELECT id, retired_at FROM gk_assets WHERE id = ?', input.text('asset', { max: 100 }))
  insist(asset, 'asset_not_found', 404)
  insist(!asset.retired_at, 'asset_retired', 409)
  const checklist = await one(env, 'SELECT id FROM gk_checklists WHERE id = ?', input.text('checklist', { max: 100 }))
  insist(checklist, 'checklist_not_found', 404)
  const title = input.text('title', { max: 160 })
  const everyDays = input.integer('everyDays', { min: 1, max: 3660, optional: true })
  const meterId = input.text('meter', { optional: true, max: 100 }) || null
  let everyUnits: string | null = null, nextDueMeter: string | null = null
  if (meterId) {
    const meter = await one(env, 'SELECT id, kind, asset_id FROM gk_meters WHERE id = ?', meterId)
    insist(meter && meter.asset_id === asset.id, 'meter_not_found', 404)
    insist(meter.kind === 'counter', 'meter_not_counter')
    everyUnits = meterNumber(input.text('everyUnits', { max: 20 }), 'everyUnits')
    insist(compareMeter(everyUnits, '0') > 0, 'invalid_everyUnits')
    const latest = (await meterNow(env, meter.id)).now
    nextDueMeter = input.has('firstDueMeter') ? meterNumber(input.text('firstDueMeter', { max: 20 }), 'firstDueMeter') : addMeter(latest ?? '0', everyUnits)
  }
  insist(everyDays || meterId, 'cadence_required')
  const firstDue = input.text('firstDue', { optional: !everyDays, max: 10 }) || null
  if (everyDays) insist(firstDue && isDate(firstDue), 'invalid_firstDue')
  const cadence = input.text('cadence', { optional: true, max: 12 }) || 'fixed'
  insist(cadence === 'fixed' || cadence === 'completion', 'invalid_cadence')
  const policy = policyFields(input), maxDeferDays = input.integer('maxDeferDays', { min: 0, max: 365, optional: true }) ?? 14
  const nextDueDate = everyDays ? nextAllowed(firstDue!, policyOf({ months: policy.months, weekdays: policy.weekdays, observe_closures: policy.observeClosures }), await closures(env)) : null
  const assigneeId = input.text('assignee', { optional: true, max: 100 }) || null
  if (assigneeId) insist(await one(env, "SELECT 1 FROM gk_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'lead', 'maintainer')", assigneeId), 'assignee_not_assignable', 409)
  return { asset: asset.id, checklist: checklist.id, title, everyDays, meterId, everyUnits, nominalDate: everyDays ? firstDue : null, nextDueDate, nextDueMeter, assigneeId, cadence, months: policy.months, weekdays: policy.weekdays, observeClosures: policy.observeClosures, maxDeferDays }
}

export interface FromProposal { proposal?: string; also?: (id: string) => D1PreparedStatement[] }

export async function createSchedule(env: Bindings, actor: Actor, input: Input, { proposal, also }: FromProposal = {}) {
  requireCapability(actor, proposal ? 'proposal.decide' : 'register.manage')
  const value = await scheduleFields(env, input), id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_schedules (id, asset_id, checklist_id, title, every_days, meter_id, every_units, next_due_date, next_due_meter, assignee_id, cadence, months, weekdays, observe_closures, max_defer_days, nominal_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, value.asset, value.checklist, value.title, value.everyDays, value.meterId, value.everyUnits, value.nextDueDate, value.nextDueMeter, value.assigneeId, value.cadence, value.months, value.weekdays, value.observeClosures ? 1 : 0, value.maxDeferDays, value.nominalDate, actor.id, now()), ...(also?.(id) ?? [])],
  { actor: actor.id, action: 'schedule.create', subject: id, detail: { ...value, ...(proposal ? { proposal } : {}) } })
  return { id }
}

/** Creates one work order for every schedule due within the horizon or at its meter value. Repeating it creates nothing new. */
export async function generateDue(env: Bindings, actor: Actor) {
  requireCapability(actor, 'work.assign')
  const horizon = addDays(actor.today, HORIZON_DAYS)
  const schedules = await all(env, `SELECT s.* FROM gk_schedules s JOIN gk_assets a ON a.id = s.asset_id
    WHERE s.active = 1 AND a.retired_at IS NULL AND NOT EXISTS(SELECT 1 FROM gk_work_orders w WHERE w.schedule_id = s.id AND w.status NOT IN ('closed', 'cancelled'))`)
  const created: { id: string; schedule: string; due: string; reason: string }[] = []
  const held: { schedule: string; readings: number }[] = []
  const statements: D1PreparedStatement[] = []
  for (const schedule of schedules) {
    const meter = await meterNow(env, schedule.meter_id)
    const byDate = schedule.next_due_date && schedule.next_due_date <= horizon
    const byMeter = schedule.meter_id && meter.now !== null && compareMeter(meter.now, schedule.next_due_meter) >= 0
    // Not due on good readings, but flagged ones wait on the meter: say so rather than skip it silently.
    if (!byDate && !byMeter && meter.held) held.push({ schedule: schedule.id, readings: meter.held })
    if (!byDate && !byMeter) continue
    const due = byDate ? schedule.next_due_date : actor.today
    const id = newId()
    statements.push(stmt(env, `INSERT INTO gk_work_orders (id, number, asset_id, kind, schedule_id, title, checklist_revision_id, due_date, due_meter, assignee_id, status, created_by, created_at)
      SELECT ?, ${NEXT_NUMBER}, ?, 'preventive', ?, ?, ${CURRENT_REVISION}, ?, ?, ?, 'open', ?, ?
      WHERE NOT EXISTS(SELECT 1 FROM gk_work_orders WHERE schedule_id = ? AND status NOT IN ('closed', 'cancelled'))`,
    id, schedule.asset_id, schedule.id, schedule.title, schedule.checklist_id, due, byMeter ? schedule.next_due_meter : null, schedule.assignee_id, actor.id, now(), schedule.id))
    created.push({ id, schedule: schedule.id, due, reason: byDate ? 'date' : 'meter' })
  }
  if (statements.length) await commit(env, statements, created.map(item => ({ actor: actor.id, action: 'workorder.generate', subject: item.id, detail: item })))
  return { created, held }
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
  const nextMeter = schedule.meter_id ? addMeter(meterNowValue ?? schedule.next_due_meter ?? '0', schedule.every_units) : null
  return [stmt(env, 'UPDATE gk_schedules SET nominal_date = ?, next_due_date = ?, next_due_meter = ?, revision = revision + 1 WHERE id = ?', nominal, nextDate, nextMeter, schedule.id)]
}

export async function scheduleList(env: Bindings, actor: Actor) {
  const rows = await all(env, `SELECT s.id, s.title, s.every_days, s.every_units, s.next_due_date, s.next_due_meter, s.active, s.revision, s.cadence, s.months, s.weekdays, s.observe_closures, s.max_defer_days, s.nominal_date,
    a.id AS asset_id, a.tag AS asset_tag, a.name AS asset_name, c.name AS checklist, s.meter_id, m.name AS meter, m.unit AS meter_unit, mb.name AS assignee,
    (SELECT w.id FROM gk_work_orders w WHERE w.schedule_id = s.id AND w.status NOT IN ('closed', 'cancelled')) AS open_work
    FROM gk_schedules s JOIN gk_assets a ON a.id = s.asset_id JOIN gk_checklists c ON c.id = s.checklist_id
    LEFT JOIN gk_meters m ON m.id = s.meter_id LEFT JOIN gk_members mb ON mb.id = s.assignee_id ORDER BY s.active DESC, COALESCE(s.next_due_date, '9999'), a.tag`)
  // A missed occurrence with no open work stays overdue until a lead issues it again or skips it (PLAN-007).
  const meters = new Map<string, { now: string | null; held: number }>()
  for (const id of new Set(rows.map(row => row.meter_id).filter(Boolean))) meters.set(id, await meterNow(env, id))
  const exceptions = await all(env, 'SELECT e.*, r.name AS requested_by_name, d.name AS decided_by_name FROM gk_schedule_exceptions e LEFT JOIN gk_members r ON r.id = e.requested_by LEFT JOIN gk_members d ON d.id = e.decided_by ORDER BY e.requested_at DESC, e.id')
  return rows.map(({ meter_id, ...row }) => ({ ...row, exceptions: exceptions.filter(item => item.schedule_id === row.id).map(({ schedule_id, ...item }) => item), meter_now: meters.get(meter_id)?.now ?? null, meter_held: meters.get(meter_id)?.held ?? 0, overdue: Boolean(row.active && row.next_due_date && row.next_due_date < actor.today && !row.open_work) }))
}
