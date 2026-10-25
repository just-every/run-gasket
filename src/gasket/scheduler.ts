import { overdueRuleEvents } from './rule-events'
import { runRequestEscalations } from './request-response'
import { runConnectors } from './connector-jobs'
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
import { runReplenishment } from './replenishment'
import { chase } from './chasing'
import { runVendorFollowUp } from './vendor-reminders'
import { remindExpiring } from './documents'
import { all, at as atInstant, newId, now, one, stmt } from './core'
import { today } from './dates'
import { issueDue } from './schedules'
import { issueDueRoutes } from './routes'
import { site } from './site'
import { automationAuthority } from './automation-context'
import { automationInputs } from './automation-inputs'
import { runJob, type AutomationRule, type Source } from './automation-jobs'

export const SCHEDULER = { id: 'scheduler', name: 'Gasket scheduler', cron: '*/15 * * * *', missedAfterMinutes: 45 }

/** A bounded current job; cron, explicit catch-up and reading-triggered PM share its grant. */
export async function executeRule(env: Bindings, rule: AutomationRule, day: string, source: Source, { revision, instant = now() }: { revision?: number; instant?: number } = {}) {
  const input = await automationInputs(env, rule, day)
  return await runJob<{ created: any[]; runs: any[]; notices: any[] }>(env, rule, source, input, async () => {
    if (rule === 'connectors') return await runConnectors(env, input.connectors!)
    if (rule === 'replenishment') return await runReplenishment(env, day)
    if (rule === 'vendor') return await runVendorFollowUp(env, day)
    if (rule === 'pm') return { ...await issueDue(env, { id: SCHEDULER.id, today: day }, input.schedules!, 'workorder.schedule', { automatic: true }), runs: [], notices: [] }
    if (rule === 'routes') return { created: [], runs: await issueDueRoutes(env, { id: SCHEDULER.id, today: day }), notices: [] }
    if (rule === 'chase') { await chase(env, day); await runRequestEscalations(env) }
    else await remindExpiring(env, day)
    return { created: [], runs: [], notices: [...await all(env, 'SELECT id,kind,recipient_id,work_order_id,asset_id FROM gk_notices WHERE automation_job_id=?', automationAuthority()!.job), ...await all(env,"SELECT 'request:'||request_id||':'||kind AS id,kind,recipient_id,request_id FROM gk_request_escalations WHERE automation_job_id=?",automationAuthority()!.job)] }
  }, { revision, instant })
}

export async function runScheduler(env: Bindings, at: number, cron = SCHEDULER.cron) {
  const current = await site(env)
  if (!current) return { created: 0 }
  return await atInstant(at, async () => {
    const previous = await one<{ ran_at: number }>(env, 'SELECT ran_at FROM gk_scheduler_runs ORDER BY ran_at DESC LIMIT 1')
    const day = today(current.timezone, at), id = newId(), gap = previous ? Math.round((at - previous.ran_at) / 60_000) : null
    await env.DB.batch([stmt(env, "INSERT INTO gk_scheduler_runs (id,cron,ran_at,created,gap_minutes,finished_at,state) VALUES (?,?,?,0,?,?,'running')", id, cron, at, gap !== null && gap > SCHEDULER.missedAfterMinutes ? gap : null, at)])
    try {
      const pm = await executeRule(env, 'pm', day, 'cron', { instant: at })
      const routes = await executeRule(env, 'routes', day, 'cron', { instant: at })
      await executeRule(env, 'chase', day, 'cron', { instant: at })
      await executeRule(env, 'expiry', day, 'cron', { instant: at })
      await executeRule(env, 'replenishment', day, 'cron', { instant: at })
      await executeRule(env, 'vendor', day, 'cron', { instant: at })
      await executeRule(env, 'connectors', day, 'cron', { instant: at })
      await overdueRuleEvents(env,at)
      const created = pm.output?.created.length ?? 0
      const runs = routes.output && 'runs' in routes.output ? routes.output.runs : []
      await env.DB.batch([stmt(env, "UPDATE gk_scheduler_runs SET created=?,finished_at=?,state='completed' WHERE id=?", created + runs.reduce((sum: number, run: any) => sum + run.workOrders.length, 0), now(), id)])
      return { created, runs: runs.length }
    } catch (error) {
      await env.DB.batch([stmt(env, "UPDATE gk_scheduler_runs SET finished_at=?,state='failed',error='job_failed' WHERE id=?", now(), id)])
      throw error
    }
  })
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
