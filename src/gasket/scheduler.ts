// PM-001: the installation's own scheduler. A Cron Trigger runs it every 15
// minutes, deployed and under `rer dev`, with no one pressing a button. Each run
// issues the work every schedule is due for (calendar work seven days ahead of
// its due date at the site's time zone, fixed or completion cadence per PM-003,
// counters and triggers per PM-002), once per occurrence: restarts, overlapping
// runs and retries find the occurrence already issued. A run more than 45
// minutes after the one before records the gap, and calendar work it issued
// after its due date is listed as issued late, so missed runs stay visible.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { chase } from './chasing'
import { remindExpiring } from './documents'
import { all, newId, now, one, stmt } from './core'
import { today } from './dates'
import { DUE_SCHEDULES, issueDue } from './schedules'
import { issueDueRoutes } from './routes'
import { site } from './site'

export const SCHEDULER = { id: 'scheduler', name: 'Gasket scheduler', cron: '*/15 * * * *', missedAfterMinutes: 45 }

export async function runScheduler(env: Bindings, at: number, cron = SCHEDULER.cron) {
  const current = await site(env)
  if (!current) return { created: 0 }
  const previous = await one<{ ran_at: number }>(env, 'SELECT ran_at FROM gk_scheduler_runs ORDER BY ran_at DESC LIMIT 1')
  const day = today(current.timezone, at)
  const { created } = await issueDue(env, { id: SCHEDULER.id, today: day }, await all(env, DUE_SCHEDULES), 'workorder.schedule', { automatic: true })
  // ASSET-008: scheduled routes, one run per occurrence.
  const runs = await issueDueRoutes(env, { id: SCHEDULER.id, today: day })
  // PM-006: then chase overdue work on the same clock.
  await chase(env, day)
  // ASSET-003: and remind each expiring document's owner.
  await remindExpiring(env, day)
  const gap = previous ? Math.round((at - previous.ran_at) / 60_000) : null
  await env.DB.batch([stmt(env, 'INSERT INTO gk_scheduler_runs (id, cron, ran_at, created, gap_minutes, finished_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), cron, at, created.length + runs.reduce((sum, run) => sum + run.workOrders.length, 0), gap !== null && gap > SCHEDULER.missedAfterMinutes ? gap : null, now())])
  return { created: created.length, runs: runs.length }
}

/** The scheduler's health: its recent runs, the gaps when it did not run, and calendar work it issued late. */
export async function schedulerView(env: Bindings, actor: Actor) {
  requireCapability(actor, 'board.read')
  const runs = await all(env, 'SELECT ran_at, cron, created, gap_minutes FROM gk_scheduler_runs ORDER BY ran_at DESC LIMIT 20')
  const gaps = await all(env, 'SELECT ran_at, gap_minutes FROM gk_scheduler_runs WHERE gap_minutes IS NOT NULL ORDER BY ran_at DESC LIMIT 20')
  const issued = await all(env, `SELECT w.id, w.number, w.title, w.due_date, w.occurrence, w.created_at FROM gk_work_orders w WHERE w.created_by = ? AND w.schedule_id IS NOT NULL AND w.due_meter IS NULL AND w.trigger_reading_id IS NULL ORDER BY w.created_at DESC`, SCHEDULER.id)
  const late = issued.map(row => ({ ...row, issued_on: today(actor.zone, row.created_at) })).filter(row => row.issued_on > row.due_date)
  return { cron: SCHEDULER.cron, lastRun: runs[0]?.ran_at ?? null, runs, gaps: gaps.map(row => ({ until: row.ran_at, minutes: row.gap_minutes })), late }
}
