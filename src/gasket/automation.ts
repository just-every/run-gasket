import { visibleEnvelope } from './replenishment-policy'
// PM-008 public controls and views; only the installation owner changes authority.
import type { Bindings } from '../auth.server'
import { can, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, now, one, stmt } from './core'
import type { Input } from './input'
import { AUTOMATION_RULES, automationLedger, automationRules, type AutomationRule } from './automation-jobs'
import { issueDue } from './schedules'
import { addDays } from './dates'
import { meterState } from './meters'
import { leadDays } from './site'
import { executeRule, SCHEDULER } from './scheduler'

function ruleName(input: Input): AutomationRule {
  const rule = input.text('rule'); insist(Object.hasOwn(AUTOMATION_RULES, rule), 'invalid_automation_rule'); return rule as AutomationRule
}
export async function controlAutomation(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const rule = ruleName(input), revision = input.integer('revision', { min: 1 }), paused = input.flag('paused'), reason = input.text('reason', { max: 1000 })
  await commit(env, [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_automation_rules WHERE id=? AND revision=?)', rule, revision), stmt(env, 'UPDATE gk_automation_rules SET paused=?,reason=?,revision=revision+1,changed_by=?,changed_at=? WHERE id=?', Number(paused), reason, actor.id, now(), rule)], { actor: actor.id, action: 'automation.control', subject: rule, detail: { revision: revision! + 1, paused, reason } })
  return { id: rule }
}
export async function controlSchedule(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const id = input.text('schedule'), revision = input.integer('revision', { min: 1 }), active = input.flag('active'), reason = input.text('reason', { max: 1000 })
  insist(await one(env, 'SELECT 1 FROM gk_schedules WHERE id=?', id), 'schedule_not_found', 404)
  await commit(env, [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_schedules WHERE id=? AND revision=?)', id, revision), stmt(env, 'UPDATE gk_schedules SET active=?,revision=revision+1 WHERE id=?', Number(active), id)], { actor: actor.id, action: 'automation.schedule', subject: id, detail: { revision: revision! + 1, active, reason } })
  return { id }
}
export async function catchUp(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  return await executeRule(env, ruleName(input), actor.today, 'catchup', { revision: input.integer('revision', { min: 1 })! })
}

/** The ordinary due evaluator, without committing statements, invoking other jobs or recording a run. */
export async function previewAutomation(env: Bindings, actor: Actor, id: string) {
  requireCapability(actor, 'site.manage')
  const schedule = await one(env, 'SELECT s.* FROM gk_schedules s LEFT JOIN gk_assets a ON a.id=s.asset_id WHERE s.id=? AND a.retired_at IS NULL', id)
  insist(schedule, 'schedule_not_found', 404)
  const open = await one(env, "SELECT id FROM gk_work_orders WHERE schedule_id=? AND status NOT IN ('closed','cancelled')", id)
  const proposed = open ? { created: [], held: [] } : await issueDue(env, actor, [schedule], 'workorder.schedule', { automatic: true, preview: true })
  return { preview: true, schedule: id, title: schedule.title, revision: schedule.revision, active: Boolean(schedule.active), ...proposed, openWork: open?.id ?? null }
}

export async function automationHealth(env: Bindings, actor: Actor) {
  requireCapability(actor, 'board.read')
  const [rules, jobs, schedules] = await Promise.all([automationRules(env), all(env, 'SELECT id,rule_id,rule_revision,source,started_at,finished_at,state,error,output FROM gk_automation_jobs ORDER BY started_at DESC,id DESC LIMIT 50'), all(env, `SELECT s.*,
    (SELECT w.id FROM gk_work_orders w WHERE w.schedule_id=s.id AND w.status NOT IN ('closed','cancelled') LIMIT 1) AS open_work,
    (SELECT w.occurrence FROM gk_work_orders w WHERE w.schedule_id=s.id ORDER BY w.created_at DESC LIMIT 1) AS last_occurrence,
    (SELECT w.status FROM gk_work_orders w WHERE w.schedule_id=s.id ORDER BY w.created_at DESC LIMIT 1) AS last_status
    FROM gk_schedules s ORDER BY s.title,s.id`)])
  const instant = now(), horizon = addDays(actor.today, await leadDays(env))
  const coverage = await Promise.all(schedules.map(async row => {
    const proposed = row.open_work ? { created: [], held: [] } : await issueDue(env, actor, [row], 'workorder.schedule', { automatic: true, preview: true })
    const state = row.meter_id ? await meterState(env, row.meter_id) : null
    const cancelled = row.last_status === 'cancelled' && row.next_due_date && row.last_occurrence === `${row.id}@${row.next_due_date}`
    const status = !row.active || rules.find(rule => rule.id === 'pm')?.paused ? 'paused' : row.open_work ? 'work_issued' : proposed.created.length ? 'due' : cancelled ? 'cancelled_occurrence_owed' : proposed.held.length ? 'reading_held' : state && !state.latest ? 'no_good_reading' : 'not_due'
    return { ...row, calendarDue: Boolean(row.next_due_date && row.next_due_date <= horizon), due: Boolean(proposed.created.length), status }
  }))
  return { cron: SCHEDULER.cron, lastTrigger: await one(env, 'SELECT ran_at,state,error FROM gk_scheduler_runs ORDER BY ran_at DESC LIMIT 1'), nextRun: (Math.floor(instant / 900_000) + 1) * 900_000,
    rules: await Promise.all(rules.map(async rule => {
      const latest = await one(env, "SELECT started_at FROM gk_automation_jobs WHERE rule_id=? AND state='completed' ORDER BY started_at DESC LIMIT 1", rule.id)
      const since = latest?.started_at ?? (rule.changed_at || null), minutes = since === null ? null : Math.max(0, Math.floor((instant - since) / 60_000))
      return { ...rule, name: AUTOMATION_RULES[rule.id as AutomationRule], lastRun: latest?.started_at ?? null, uncoveredMinutes: minutes, missed: minutes !== null && minutes > SCHEDULER.missedAfterMinutes }
    })), jobs: jobs.map(row => ({ ...row, output: row.output === null ? null : JSON.parse(row.output) })), coverage,
    delivery: { replenishment: { pendingJobs: (await one(env, "SELECT COUNT(*) AS n FROM gk_automation_jobs WHERE rule_id='replenishment' AND state='running'")).n, failedJobs: (await one(env, "SELECT COUNT(*) AS n FROM gk_automation_jobs WHERE rule_id='replenishment' AND state='failed'")).n }, inApp: { pendingJobs: (await one(env, "SELECT COUNT(*) AS n FROM gk_automation_jobs WHERE rule_id IN ('chase','expiry') AND state='running'")).n, failedJobs: (await one(env, "SELECT COUNT(*) AS n FROM gk_automation_jobs WHERE rule_id IN ('chase','expiry') AND state='failed'")).n, stored: (await one(env, 'SELECT COUNT(*) AS n FROM gk_notices')).n }, external: { state: 'unavailable', detail: 'Email and push delivery workers are not configured. In-app notices are saved synchronously.' } },
  }
}
export async function ledgerView(env: Bindings, actor: Actor, url?: URL) {
  requireCapability(actor, 'board.read')
  const ledger = await automationLedger(env), job = url?.searchParams.get('job')
  if (!can(actor,'work.review')) ledger.jobs = ledger.jobs.map(row=>{
    if (row.rule_id!=='replenishment' || !row.input.replenishment) return row
    const {uses:_uses,envelopes,...facts}=row.input.replenishment
    return {...row,input:{...row.input,replenishment:{...facts,envelopes:envelopes.map((entry: any)=>visibleEnvelope(entry,false)),envelopeBudgetAccess:false}}}
  })
  if (!job) return ledger
  const record = ledger.jobs.find(row => row.id === job); insist(record, 'job_not_found', 404); return record
}
