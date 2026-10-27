import { auditFence, auditRevision } from './agent-follow-up'
import { assertIntervalBounds } from './intervals'
// PM-003: exceptions to a schedule and changes to its cadence. A lead asks to
// skip a missed occurrence or defer the current one (at most the schedule's
// max_defer_days after it), always with a reason; nothing moves until a
// different person who reviews work (an owner or supervisor) approves it; on a
// site with one owner and no supervisor, that owner may approve their own after
// an explicit second confirmation, and the decision is labelled single-approver.
// Every request and decision is kept, so a skipped occurrence stays on record
// as missed. Editing a schedule previews its issued work (which keeps its due
// date and checklist revision) and its next dates before and after the change.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { closures, nextAllowed, policyFields, policyOf, upcoming } from './calendar'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { addDays, isDate } from './dates'
import type { Input } from './input'
import { advanceStatements } from './schedules'

const OPEN_WORK = "SELECT id, number, due_date, checklist_revision_id, version FROM gk_work_orders WHERE schedule_id = ? AND status NOT IN ('closed', 'cancelled')"

async function scheduleFor(env: Bindings, input: Input) {
  const schedule = await one(env, 'SELECT * FROM gk_schedules WHERE id = ?', input.text('schedule', { max: 100 }))
  insist(schedule, 'schedule_not_found', 404)
  insist(schedule.active, 'schedule_inactive', 409)
  return schedule
}

async function request(env: Bindings, actor: Actor, schedule: Row, kind: 'skip' | 'defer', until: string | null, reason: string) {
  insist(!await one(env, 'SELECT 1 FROM gk_schedule_exceptions WHERE schedule_id = ? AND decision IS NULL', schedule.id), 'exception_pending', 409)
  const id = newId()
  return { id, statements: [guard(env, 'exception_pending', 'NOT EXISTS(SELECT 1 FROM gk_schedule_exceptions WHERE schedule_id = ? AND decision IS NULL)', schedule.id),
    stmt(env, 'INSERT INTO gk_schedule_exceptions (id, schedule_id, kind, occurrence, until, reason, requested_by, requested_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, schedule.id, kind, schedule.next_due_date, until, reason, actor.id, now())] }
}

/** Asks to skip an overdue occurrence that has no open work; it stays overdue until approved. */
export async function requestSkip(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const schedule = await scheduleFor(env, input), reason = input.text('reason', { max: 500 })
  insist(schedule.next_due_date && schedule.next_due_date < actor.today, 'not_overdue', 409)
  insist(!await one(env, OPEN_WORK, schedule.id), 'open_work_exists', 409)
  const asked = await request(env, actor, schedule, 'skip', null, reason)
  await commit(env, asked.statements, { actor: actor.id, action: 'schedule.skip', subject: schedule.id, detail: { exception: asked.id, occurrence: schedule.next_due_date, reason } })
  return { id: asked.id, decision: null }
}

/** Asks to defer the current calendar occurrence to `until`: after it, and at most max_defer_days later. */
export async function requestDeferral(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const schedule = await scheduleFor(env, input), reason = input.text('reason', { max: 500 }), until = input.text('until', { max: 10 })
  insist(schedule.next_due_date, 'no_calendar_due', 409)
  insist(isDate(until) && until > schedule.next_due_date, 'invalid_until')
  insist(until <= addDays(schedule.next_due_date, schedule.max_defer_days), 'deferral_too_long', 409, { latest: addDays(schedule.next_due_date, schedule.max_defer_days) })
  const asked = await request(env, actor, schedule, 'defer', until, reason)
  await commit(env, asked.statements, { actor: actor.id, action: 'schedule.defer', subject: schedule.id, detail: { exception: asked.id, occurrence: schedule.next_due_date, until, reason } })
  return { id: asked.id, decision: null }
}

/** Current decision authority also protects completed API retry receipts. */
export async function exceptionAuthority(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.review')
  const exception = await one(env, 'SELECT * FROM gk_schedule_exceptions WHERE id = ?', input.text('exception', { max: 100 }))
  insist(exception, 'exception_not_found', 404)
  if (exception.requested_by === actor.id) {
    const people = await one<{ owners: number; supervisors: number }>(env, "SELECT SUM(role = 'owner') AS owners, SUM(role = 'supervisor') AS supervisors FROM gk_members WHERE status = 'active'")
    insist(actor.role === 'owner' && people!.owners === 1 && !people!.supervisors, 'not_independent', 403)
    insist(input.flag('singleApprover'), 'confirm_single_approver', 409)
  }
  return exception
}

/** An independent decision on a pending skip or deferral: an owner or supervisor other than the person who asked. */
export async function decideException(env: Bindings, actor: Actor, input: Input) {
  const exception = await exceptionAuthority(env, actor, input)
  insist(!exception.decision, 'already_decided', 409)
  const decision = input.text('decision', { max: 10 }), note = input.text('note', { optional: true, max: 500 }) || null
  insist(decision === 'approve' || decision === 'reject', 'invalid_decision')
  const own = exception.requested_by === actor.id
  const schedule = await one(env, 'SELECT * FROM gk_schedules WHERE id = ?', exception.schedule_id)
  const statements = [stmt(env, 'UPDATE gk_schedule_exceptions SET decision = ?, decided_by = ?, decided_at = ?, note = ?, single_approver = ? WHERE id = ? AND decision IS NULL', decision === 'approve' ? 'approved' : 'rejected', actor.id, now(), note, own ? 1 : 0, exception.id)]
  if (decision === 'approve') {
    // The occurrence asked about must still be the schedule's current one.
    insist(schedule!.next_due_date === exception.occurrence, 'occurrence_moved', 409)
    statements.push(guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_schedules WHERE id = ? AND revision = ?)', schedule!.id, schedule!.revision))
    if (exception.kind === 'skip') {
      statements.push(guard(env, 'open_work_exists', "NOT EXISTS(SELECT 1 FROM gk_work_orders WHERE schedule_id = ? AND status NOT IN ('closed', 'cancelled'))", schedule!.id), ...await advanceStatements(env, schedule!.id, actor.today))
    } else {
      // The issued work, if any, moves with it and keeps its checklist revision.
      statements.push(stmt(env, 'UPDATE gk_schedules SET next_due_date = ?, revision = revision + 1 WHERE id = ?', exception.until, schedule!.id),
        stmt(env, "UPDATE gk_work_orders SET due_date = ?, version = version + 1 WHERE schedule_id = ? AND status NOT IN ('closed', 'cancelled')", exception.until, schedule!.id))
    }
  }
  await commit(env, statements, { actor: actor.id, action: 'schedule.exception', subject: exception.schedule_id, detail: { exception: exception.id, kind: exception.kind, occurrence: exception.occurrence, until: exception.until, decision, note, ...(own ? { singleApprover: true } : {}) } })
  return { id: exception.id, decision: decision === 'approve' ? 'approved' : 'rejected' }
}

/** Changes a calendar schedule's interval, cadence or calendar. `preview` writes nothing and shows what the change does. */
export async function editSchedule(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const schedule = await scheduleFor(env, input)
  insist(schedule.every_days && schedule.nominal_date, 'no_calendar_cadence', 409)
  insist(input.integer('revision', { min: 1, max: 1_000_000 }) === schedule.revision, 'stale', 409)
  const limitFence = await auditRevision(env)
  const everyDays = input.integer('everyDays', { min: 1, max: 3660 })!
  await assertIntervalBounds(env, schedule.id, everyDays, schedule.every_units)
  const cadence = input.text('cadence', { optional: true, max: 12 }) || schedule.cadence
  insist(cadence === 'fixed' || cadence === 'completion', 'invalid_cadence')
  const fields = policyFields(input), maxDeferDays = input.integer('maxDeferDays', { min: 0, max: 365, optional: true }) ?? schedule.max_defer_days
  const after = { ...schedule, every_days: everyDays, cadence, months: fields.months, weekdays: fields.weekdays, observe_closures: fields.observeClosures ? 1 : 0, max_defer_days: maxDeferDays }
  const closed = await closures(env), issued = await all(env, OPEN_WORK, schedule.id)
  // Issued work keeps its occurrence; otherwise the current occurrence is re-placed on the new calendar.
  const nextDue = issued.length ? schedule.next_due_date : nextAllowed(schedule.nominal_date, policyOf(after), closed)
  const preview = {
    issued: issued.map(row => ({ id: row.id, number: row.number, due_date: row.due_date, checklist_revision: row.checklist_revision_id, unchanged: true })),
    before: upcoming(schedule.nominal_date, schedule.every_days, policyOf(schedule), closed, { completion: schedule.cadence === 'completion' }),
    after: [nextDue, ...upcoming(addDays(cadence === 'completion' ? nextDue : schedule.nominal_date, everyDays), everyDays, policyOf(after), closed, { count: 4, completion: cadence === 'completion' })],
  }
  if (input.flag('preview')) return { preview: true, ...preview }
  await commit(env, [auditFence(env, limitFence), guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_schedules WHERE id = ? AND revision = ?)', schedule.id, schedule.revision),
    stmt(env, 'UPDATE gk_schedules SET every_days = ?, cadence = ?, months = ?, weekdays = ?, observe_closures = ?, max_defer_days = ?, next_due_date = ?, revision = revision + 1 WHERE id = ?', everyDays, cadence, after.months, after.weekdays, after.observe_closures, maxDeferDays, nextDue, schedule.id)],
  { actor: actor.id, action: 'schedule.edit', subject: schedule.id, detail: { from: { everyDays: schedule.every_days, cadence: schedule.cadence, months: schedule.months, weekdays: schedule.weekdays, observeClosures: Boolean(schedule.observe_closures), maxDeferDays: schedule.max_defer_days }, to: { everyDays, cadence, months: after.months, weekdays: after.weekdays, observeClosures: fields.observeClosures, maxDeferDays } } })
  return { preview: false, ...preview }
}
