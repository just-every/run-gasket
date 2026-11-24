import { qualificationInputSql } from './qualification-copies'
// PM-008: each attempted execution keeps its inputs, governing revision and outcome.
import type { Bindings } from '../auth.server'
import { withAutomation } from './automation-context'
import { all, GasketError, insist, newId, now, one, stmt } from './core'
import { isIdle } from './automation-retention'

export const AUTOMATION_RULES = { connectors: 'Maintenance webhooks', pm: 'Preventive work', routes: 'Inspection routes', chase: 'Work reminders and escalation', expiry: 'Document expiry reminders', replenishment: 'Stores replenishment', vendor: 'Vendor delivery follow-up' }
export type AutomationRule = keyof typeof AUTOMATION_RULES
export type Source = 'cron' | 'catchup' | 'reading'
export async function automationRules(env: Bindings) { return await all(env, 'SELECT * FROM gk_automation_rules ORDER BY id') }

// A PM attempt cannot retain write authority indefinitely after a lost Worker.
// Use execution time, independently of a delayed Cron event's business time.
const PM_ATTEMPT_MS = 15 * 60_000
export const interruptedPM = (row: any) => row.rule_id === 'pm' && row.state === 'running' && row.lease_expires_at <= Date.now()

/** Reconcile the original atomic work audit, never replay the interrupted inputs. */
const recoverPM = (env: Bindings, job: string, instant: number) => stmt(env, `UPDATE gk_automation_jobs SET
  state='failed',finished_at=?,error='pm_interrupted',recovered_by=?,
  output=json_object('created',json((SELECT json_group_array(json(json_remove(a.detail,'$.automation')))
    FROM gk_audit a WHERE a.action IN ('workorder.schedule','workorder.trigger')
      AND json_extract(a.detail,'$.automation.job')=gk_automation_jobs.id)),
    'recovery',json_object('reconciledAt',?,'recoveredBy',?))
  WHERE rule_id='pm' AND state='running' AND id!=? AND lease_expires_at<=?`, instant, job, instant, job, job, instant)

export async function runJob<T>(env: Bindings, rule: AutomationRule, source: Source, input: unknown, work: () => Promise<T>, { revision, instant = now() }: { revision?: number; instant?: number } = {}) {
  const grant = await one(env, 'SELECT * FROM gk_automation_rules WHERE id=?', rule)
  insist(grant, 'automation_not_found', 404)
  const job = newId(), stale = revision !== undefined && revision !== grant.revision
  const state = stale ? 'failed' : grant.paused ? 'paused' : 'running'
  const executionTime = Date.now()
  // Recovery of an interrupted attempt is only looked for when a PM attempt is actually overdue.
  const overdue = rule === 'pm' && state === 'running' && Boolean(await one(env, "SELECT 1 AS n FROM gk_automation_jobs WHERE rule_id='pm' AND state='running' AND lease_expires_at<=? LIMIT 1", executionTime))
  await env.DB.batch([
    stmt(env, `INSERT INTO gk_automation_jobs (id,rule_id,rule_revision,source,started_at,finished_at,state,input,error,lease_expires_at,idle) SELECT ?,?,?,?,?,?,?,${qualificationInputSql('payload','capture')},?,?,? FROM (SELECT ? AS payload)`, job, rule, revision ?? grant.revision, source, instant, state === 'running' ? null : now(), state, stale ? 'automation_changed' : null, rule === 'pm' && state === 'running' ? executionTime + PM_ATTEMPT_MS : null, state === 'paused' ? 1 : 0, JSON.stringify(input)),
    ...(overdue ? [recoverPM(env, job, executionTime)] : []),
    ...(overdue ? [stmt(env, `UPDATE gk_scheduler_runs SET state='failed',error='pm_interrupted',finished_at=?,
      created=(SELECT COUNT(*) FROM gk_audit a JOIN gk_automation_jobs j ON json_extract(a.detail,'$.automation.job')=j.id
        WHERE json_extract(j.input,'$.schedulerRun')=gk_scheduler_runs.id AND a.action IN ('workorder.schedule','workorder.trigger'))
      WHERE state='running' AND id IN (SELECT json_extract(input,'$.schedulerRun') FROM gk_automation_jobs WHERE recovered_by=? AND source='cron')`, executionTime, job)] : []),
  ])
  if (stale) throw new GasketError('automation_changed', 409)
  if (grant.paused) return { job, state: 'paused' as const, output: null }
  try {
    const output = await withAutomation({ job, rule, revision: grant.revision }, work)
    const idle = isIdle(output)
    const [finished] = await env.DB.batch([stmt(env, "UPDATE gk_automation_jobs SET state='completed',finished_at=?,output=?,idle=? WHERE id=? AND state='running' AND (lease_expires_at IS NULL OR lease_expires_at>?)", now(), JSON.stringify(output ?? null), idle ? 1 : 0, job, Date.now())])
    insist(finished.meta.changes === 1, 'automation_changed', 409)
    return { job, state: 'completed' as const, output }
  } catch (error) {
    const code = error instanceof GasketError ? error.code : 'job_failed'
    await env.DB.batch([stmt(env, "UPDATE gk_automation_jobs SET state='failed',finished_at=?,error=? WHERE id=? AND state='running' AND (lease_expires_at IS NULL OR lease_expires_at>?)", now(), code, job, Date.now())])
    throw error
  }
}

export const LEDGER_PAGE = 50
/** Retained data only, newest first, one page at a time (`before` is the last job of the previous page), or a single job by id. */
export async function automationLedger(env: Bindings, { job, before, limit = LEDGER_PAGE }: { job?: string; before?: string; limit?: number } = {}) {
  const cursor = before === undefined ? undefined : await one(env, 'SELECT started_at,id FROM gk_automation_jobs WHERE id=?', before)
  insist(before === undefined || cursor, 'invalid_cursor')
  const rows = job !== undefined ? await all(env, 'SELECT * FROM gk_automation_jobs WHERE id=?', job)
    : await all(env, `SELECT * FROM gk_automation_jobs ${cursor ? 'WHERE started_at<? OR (started_at=? AND id<?)' : ''} ORDER BY started_at DESC,id DESC LIMIT ?`, ...(cursor ? [cursor.started_at, cursor.started_at, cursor.id] : []), limit + 1)
  const jobs = rows.slice(0, limit), more = rows.length > limit
  const recoveries = jobs.length ? await all(env, `SELECT id,recovered_by FROM gk_automation_jobs WHERE recovered_by IN (${jobs.map(() => '?').join(',')})`, ...jobs.map(row => row.id)) : []
  return { rules: await automationRules(env), next: more ? jobs[jobs.length - 1].id as string : null, jobs: jobs.map(row => ({ ...row, interrupted: interruptedPM(row), recovers: recoveries.filter(old => old.recovered_by === row.id).map(old => old.id), input: JSON.parse(row.input), output: row.output === null ? null : JSON.parse(row.output) })) }
}
