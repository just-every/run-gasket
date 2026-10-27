import { authorityStatements } from './authority-audit'
import { serviceAuthority, withServiceAuthority } from './service-context'
// Shared primitives: typed errors, ids, D1 helpers, audited atomic commits and
// in-batch preconditions (gk_guard rows abort the whole batch when false).
import { AsyncLocalStorage } from 'node:async_hooks'
import { automationAuthority } from './automation-context'
import type { Bindings } from '../auth.server'

export class GasketError extends Error {
  constructor(readonly code: string, readonly status = 400, readonly detail?: unknown) {
    super(code)
  }
}

export function insist(condition: unknown, code: string, status = 400, detail?: unknown): asserts condition {
  if (!condition) throw new GasketError(code, status, detail)
}

export const newId = () => crypto.randomUUID()
const clock = new AsyncLocalStorage<number>()
/** The instant a change is stamped with: now, or the story moment `at` sets (the demo seed's morning). */
export const now = () => clock.getStore() ?? Date.now()
/** Runs `work` with every stamp it makes set to `instant`. */
export const at = <T>(instant: number, work: () => Promise<T>) => clock.run(instant, work)

export type Row = Record<string, any>

export async function one<T = any>(env: Bindings, sql: string, ...params: unknown[]): Promise<T | null> {
  return await env.DB.prepare(sql).bind(...params).first<T>()
}

export async function all<T = any>(env: Bindings, sql: string, ...params: unknown[]): Promise<T[]> {
  return (await env.DB.prepare(sql).bind(...params).all<T>()).results
}

export const stmt = (env: Bindings, sql: string, ...params: unknown[]) => env.DB.prepare(sql).bind(...params)

/** A precondition evaluated inside the batch: `condition` is a scalar SQL boolean. */
export const guard = (env: Bindings, code: string, condition: string, ...params: unknown[]) =>
  stmt(env, `INSERT INTO gk_guard (code, ok) SELECT ?, CASE WHEN (${condition}) THEN 1 ELSE 0 END`, code, ...params)

export interface Audit { actor: string; action: string; subject: string; detail?: unknown }

/** An audit entry with the role its actor holds now, read inside the same statement (ADMIN-006). Binds at, actor, actor, action, subject, detail. */
export const AUDIT_INSERT = "INSERT INTO gk_audit (at, actor, role, action, subject, detail) VALUES (?, ?, (SELECT CASE WHEN o.role = 'owner' THEN 'owner' ELSE m.role END FROM gk_members m LEFT JOIN oa_operators o ON o.id = m.operator_id WHERE m.id = ?), ?, ?, ?)"

/** Runs the statements atomically with their audit entries. A failed guard raises its code. */
export async function commit(env: Bindings, statements: D1PreparedStatement[], audit: Audit | Audit[]) {
  const events = Array.isArray(audit) ? audit : [audit]
  const authority = automationAuthority(), credential = serviceAuthority()
  try {
    const contextual = events.some(event => ['access.role', 'access.end'].includes(event.action))
    const [before, after] = authorityStatements(env.DB, { actor: events[0].actor, action: events[0].action, at: now() })
    const results = (await env.DB.batch([
      ...(contextual ? [before] : []),
      ...(authority ? [guard(env, 'automation_changed', 'EXISTS(SELECT 1 FROM gk_automation_rules WHERE id=? AND revision=? AND paused=0)', authority.rule, authority.revision)] : []),
      ...(serviceAuthority() ? [guard(env, 'service_authority_ended', `EXISTS(SELECT 1 FROM gk_api_credentials c JOIN gk_members m ON m.id=c.member_id JOIN oa_operators o ON o.id=m.operator_id WHERE c.id=? AND c.revoked_at IS NULL AND c.expires_at>? AND m.status='active' AND o.status='active' AND o.role='owner')`, serviceAuthority(), now())] : []),
      ...statements,
      stmt(env, 'DELETE FROM gk_guard'),
      ...events.map(event => stmt(env, AUDIT_INSERT, now(), event.actor, event.actor, event.action, event.subject, JSON.stringify(authority || credential ? { ...(event.detail && typeof event.detail === 'object' ? event.detail : { value: event.detail }), ...(authority ? { automation: authority } : {}), ...(credential ? { serviceCredential: credential } : {}) } : event.detail ?? {}))),
      ...(contextual ? [after] : []),
    ])).slice(contextual ? 1 : 0, contextual ? -1 : undefined)
    const relevant = events.some(event => /^(request\.submit|workorder\.(create|generate|schedule|trigger|submit|approve|return|cancel|reopen|merged|merge|readings|results|evidence|time|annotate)|asset\.(state|retire)|downtime\.(start|end)|meter\.feed|part\.(create|receive|count|issue|return|disposition)|finding\.record)$/.test(event.action))
    if (relevant) { const { dispatchRuleEvents } = await import('./rule-events'); await withServiceAuthority(undefined, () => dispatchRuleEvents(env, events, results.slice(results.length-events.length).map(result => result.meta.last_row_id))) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code = message.match(/gasket_guard_(\w+)/)?.[1]
    if (code) throw new GasketError(code === 'failed' ? 'precondition_failed' : code, 409)
    if (/gasket_immutable/.test(message)) throw new GasketError('record_is_immutable', 409)
    if (/UNIQUE constraint failed: gk_work_orders\.schedule_id|gk_work_orders_one_open/.test(message)) throw new GasketError('open_work_exists', 409)
    if (/UNIQUE constraint failed: gk_downtime\.asset_id|gk_downtime_one_open/.test(message)) throw new GasketError('downtime_already_open', 409)
    if (/UNIQUE constraint failed: gk_assets\.tag/.test(message)) throw new GasketError('asset_tag_taken', 409)
    if (/UNIQUE constraint failed: gk_parts\.number/.test(message)) throw new GasketError('part_number_taken', 409)
    if (/UNIQUE constraint failed: gk_meters/.test(message)) throw new GasketError('meter_name_taken', 409)
    if (/UNIQUE constraint failed: gk_checklists\.name/.test(message)) throw new GasketError('checklist_name_taken', 409)
    if (/UNIQUE constraint failed: gk_work_orders\.number/.test(message)) throw new GasketError('stale', 409)
    throw error
  }
}

export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Next work order number, claimed inside the insert so two writers cannot share one. */
export const NEXT_NUMBER = '(SELECT COALESCE(MAX(number), 0) + 1 FROM gk_work_orders)'
