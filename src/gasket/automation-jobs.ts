import { qualificationInputSql } from './qualification-copies'
// PM-008: each attempted execution keeps its inputs, governing revision and outcome.
import type { Bindings } from '../auth.server'
import { withAutomation } from './automation-context'
import { all, GasketError, insist, newId, now, one, stmt } from './core'

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
  await env.DB.batch([
    stmt(env, `INSERT INTO gk_automation_jobs (id,rule_id,rule_revision,source,started_at,finished_at,state,input,error,lease_expires_at) SELECT ?,?,?,?,?,?,?,${qualificationInputSql('payload','capture')},?,? FROM (SELECT ? AS payload)`, job, rule, revision ?? grant.revision, source, instant, state === 'running' ? null : now(), state, stale ? 'automation_changed' : null, rule === 'pm' && state === 'running' ? executionTime + PM_ATTEMPT_MS : null, JSON.stringify(input)),
    ...(rule === 'pm' && state === 'running' ? [recoverPM(env, job, executionTime)] : []),
  ])
  if (stale) throw new GasketError('automation_changed', 409)
  if (grant.paused) return { job, state: 'paused' as const, output: null }
  try {
    const output = await withAutomation({ job, rule, revision: grant.revision }, work)
    const [finished] = await env.DB.batch([stmt(env, "UPDATE gk_automation_jobs SET state='completed',finished_at=?,output=? WHERE id=? AND state='running' AND (lease_expires_at IS NULL OR lease_expires_at>?)", now(), JSON.stringify(output ?? null), job, Date.now())])
    insist(finished.meta.changes === 1, 'automation_changed', 409)
    return { job, state: 'completed' as const, output }
  } catch (error) {
    const code = error instanceof GasketError ? error.code : 'job_failed'
    await env.DB.batch([stmt(env, "UPDATE gk_automation_jobs SET state='failed',finished_at=?,error=? WHERE id=? AND state='running' AND (lease_expires_at IS NULL OR lease_expires_at>?)", now(), code, job, Date.now())])
    throw error
  }
}

/** Retained data only, also used by the portable-archive journey. */
export async function automationLedger(env: Bindings) {
  const jobs = await all(env, 'SELECT * FROM gk_automation_jobs ORDER BY started_at DESC,id')
  return { rules: await automationRules(env), jobs: jobs.map(row => ({ ...row, interrupted: interruptedPM(row), recovers: jobs.filter(old => old.recovered_by === row.id).map(old => old.id), input: JSON.parse(row.input), output: row.output === null ? null : JSON.parse(row.output) })) }
}
