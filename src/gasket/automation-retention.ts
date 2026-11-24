// The scheduler runs every 15 minutes for the life of the installation, so what it keeps per run must not
// accumulate without bound. A run that did nothing (no work issued, no notices, nothing delivered) is marked idle
// and, once it is older than the retention window, removed with its inputs. A run that did something is kept
// for good: work orders, notices and the audit trail point back to it.
import type { Bindings } from '../auth.server'
import { stmt } from './core'

export const RETAIN_IDLE_DAYS = 30
const DAY_MS = 86_400_000
const PRUNE_BATCH = 3000

const empty = (value: unknown): boolean => value === null || value === undefined || value === false || value === 0 || value === ''
  || (Array.isArray(value) ? value.length === 0 : typeof value === 'object' && Object.values(value as object).every(empty))

/** A job whose output holds nothing at all did nothing. */
export const isIdle = (output: unknown) => empty(output)

const REFERENCES = ['gk_notices', 'gk_qualification_reminders', 'gk_request_escalations', 'gk_replenishments', 'gk_replenishment_events', 'gk_replenishment_envelope_uses', 'gk_vendor_reminders', 'gk_connector_attempts']

/** Removes idle jobs and finished scheduler runs older than the retention window, on the first run of each UTC day. */
export async function pruneAutomationHistory(env: Bindings, at: number, previousRanAt: number | null) {
  if (previousRanAt !== null && Math.floor(previousRanAt / DAY_MS) === Math.floor(at / DAY_MS)) return
  const cutoff = at - RETAIN_IDLE_DAYS * DAY_MS
  await env.DB.batch([
    stmt(env, `DELETE FROM gk_automation_jobs WHERE id IN (SELECT j.id FROM gk_automation_jobs j WHERE j.idle=1 AND j.started_at<?
      AND NOT EXISTS(SELECT 1 FROM gk_automation_jobs r WHERE r.recovered_by=j.id)
      ${REFERENCES.map(table => `AND NOT EXISTS(SELECT 1 FROM ${table} WHERE automation_job_id=j.id)`).join('\n      ')}
      ORDER BY j.started_at LIMIT ?)`, cutoff, PRUNE_BATCH),
    stmt(env, "DELETE FROM gk_scheduler_runs WHERE id IN (SELECT id FROM gk_scheduler_runs WHERE ran_at<? AND state!='running' ORDER BY ran_at LIMIT ?)", cutoff, PRUNE_BATCH),
  ])
}
