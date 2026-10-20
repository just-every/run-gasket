// PM-008: each attempted execution keeps its inputs, governing revision and outcome.
import type { Bindings } from '../auth.server'
import { withAutomation } from './automation-context'
import { all, GasketError, insist, newId, now, one, stmt } from './core'

export const AUTOMATION_RULES = { pm: 'Preventive work', routes: 'Inspection routes', chase: 'Work reminders and escalation', expiry: 'Document expiry reminders', replenishment: 'Stores replenishment' }
export type AutomationRule = keyof typeof AUTOMATION_RULES
export type Source = 'cron' | 'catchup' | 'reading'
export async function automationRules(env: Bindings) { return await all(env, 'SELECT * FROM gk_automation_rules ORDER BY id') }

export async function runJob<T>(env: Bindings, rule: AutomationRule, source: Source, input: unknown, work: () => Promise<T>, { revision, instant = now() }: { revision?: number; instant?: number } = {}) {
  const grant = await one(env, 'SELECT * FROM gk_automation_rules WHERE id=?', rule)
  insist(grant, 'automation_not_found', 404)
  const job = newId(), stale = revision !== undefined && revision !== grant.revision
  const state = stale ? 'failed' : grant.paused ? 'paused' : 'running'
  await env.DB.batch([stmt(env, 'INSERT INTO gk_automation_jobs (id,rule_id,rule_revision,source,started_at,finished_at,state,input,error) VALUES (?,?,?,?,?,?,?,?,?)', job, rule, revision ?? grant.revision, source, instant, state === 'running' ? null : now(), state, JSON.stringify(input), stale ? 'automation_changed' : null)])
  if (stale) throw new GasketError('automation_changed', 409)
  if (grant.paused) return { job, state: 'paused' as const, output: null }
  try {
    const output = await withAutomation({ job, rule, revision: grant.revision }, work)
    await env.DB.batch([stmt(env, "UPDATE gk_automation_jobs SET state='completed',finished_at=?,output=? WHERE id=?", now(), JSON.stringify(output ?? null), job)])
    return { job, state: 'completed' as const, output }
  } catch (error) {
    const code = error instanceof GasketError ? error.code : 'job_failed'
    await env.DB.batch([stmt(env, "UPDATE gk_automation_jobs SET state='failed',finished_at=?,error=? WHERE id=?", now(), code, job)])
    throw error
  }
}

/** Retained data only, also used by the portable-archive journey. */
export async function automationLedger(env: Bindings) {
  return { rules: await automationRules(env), jobs: (await all(env, 'SELECT * FROM gk_automation_jobs ORDER BY started_at DESC,id')).map(row => ({ ...row, input: JSON.parse(row.input), output: row.output === null ? null : JSON.parse(row.output) })) }
}
