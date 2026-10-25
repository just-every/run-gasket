import { attachmentErasurePreview } from './attachment-erasure'
// Conservative retention default: retain indefinitely, with no automatic erasure.
// Holds protect request intake and any copied fault on linked maintenance work.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, commit, guard, insist, now, one, stmt } from './core'
import type { Input } from './input'

const ownerOnly = (actor: Actor) => insist(actor.role === 'owner', 'forbidden', 403)
export async function holdRecord(env: Bindings, actor: Actor, input: Input) {
  ownerOnly(actor)
  const kind = input.text('kind'), id = input.text('id'), reason = input.text('reason', { max: 500 }), held = input.flag('held')
  insist(['work','request','attachment','user'].includes(kind), 'invalid_hold_kind')
  const table = kind === 'work' ? 'gk_work_orders' : kind === 'request' ? 'gk_requests' : kind === 'user' ? 'gk_members' : 'gk_evidence'
  const exists = await one(env, `SELECT 1 FROM ${table} WHERE id=?`, id)
  insist(exists || (kind === 'attachment' && await one(env, 'SELECT 1 FROM gk_request_files WHERE id=?', id)), 'record_not_found', 404)
  const holds = ['attachment','user'].includes(kind) ? 'gk_retention_scope_holds' : 'gk_retention_holds'
  const old = await one(env, `SELECT revision FROM ${holds} WHERE kind=? AND record_id=?`, kind, id)
  const revision = input.integer('revision', { min: 0 })
  insist(revision === (old?.revision ?? 0), 'stale', 409)
  await commit(env, [
    guard(env, 'stale', `(SELECT COALESCE((SELECT revision FROM ${holds} WHERE kind=? AND record_id=?),0))=?`, kind, id, revision),
    stmt(env, `INSERT INTO ${holds}(kind,record_id,held,reason,revision,changed_by,changed_at) VALUES(?,?,?,?,1,?,?)
      ON CONFLICT(kind,record_id) DO UPDATE SET held=excluded.held,reason=excluded.reason,revision=${holds}.revision+1,changed_by=excluded.changed_by,changed_at=excluded.changed_at`, kind, id, Number(held), reason, actor.id, now()),
  ], { actor: actor.id, action: 'retention.hold', subject: id, detail: { kind, held, reason } })
  return { id, revision: (revision ?? 0) + 1, held }
}
export const REQUEST_NOT_HELD = `NOT EXISTS(SELECT 1 FROM gk_retention_holds h WHERE h.held=1 AND
  ((h.kind='request' AND h.record_id=?) OR (h.kind='work' AND h.record_id=(SELECT work_order_id FROM gk_requests WHERE id=?))))
 AND NOT EXISTS(SELECT 1 FROM gk_retention_scope_holds h WHERE h.held=1 AND
 ((h.kind='user' AND h.record_id=(SELECT requester_id FROM gk_requests WHERE id=?))
 OR (h.kind='attachment' AND h.record_id IN (SELECT id FROM gk_request_files WHERE request_id=?))))`
export async function retentionPreview(env: Bindings, actor: Actor, url: URL) {
  ownerOnly(actor)
  if (url.searchParams.get('kind') === 'attachment') return attachmentErasurePreview(env, actor, url.searchParams.get('id') ?? '')
  const id = url.searchParams.get('request') ?? ''
  const request = await one(env, 'SELECT id,version,erased_at,work_order_id,created_at FROM gk_requests WHERE id=?', id)
  insist(request, 'request_not_found', 404)
  const held = !await one(env, `SELECT 1 WHERE ${REQUEST_NOT_HELD}`, id, id, id, id)
  const files = (await one<{ count: number; bytes: number }>(env, 'SELECT COUNT(*) AS count,COALESCE(SUM(size),0) AS bytes FROM gk_request_files WHERE request_id=?', id))!
  const settings = await retentionSettings(env, actor)
  const contactDays = settings.policies.find(row => row.kind === 'request_contacts')!.minimum_days
  const attachmentDays = files.count ? settings.policies.find(row => row.kind === 'attachments')!.minimum_days : 0
  const eligible = !held && !request.erased_at && request.created_at <= now()-Math.max(contactDays, attachmentDays)*86400000
  const dependencies = await requestErasureCounts(env, id)
  const result = await one(env, 'SELECT result_json FROM gk_request_erasure_results WHERE request_id=?', id)
  return { eligible, dependencies, result: result ? JSON.parse(result.result_json) : null, id, version: request.version, held, erased: Boolean(request.erased_at), files, linkedWork: request.work_order_id,
    scopeHolds: await all(env, `SELECT kind,record_id,held,reason,revision FROM gk_retention_scope_holds WHERE (kind='user' AND record_id=(SELECT requester_id FROM gk_requests WHERE id=?)) OR (kind='attachment' AND record_id IN (SELECT id FROM gk_request_files WHERE request_id=?))`, id, id),
    holds: await all(env, "SELECT kind,record_id,held,reason,revision FROM gk_retention_holds WHERE (kind='request' AND record_id=?) OR (kind='work' AND record_id=?)", id, request.work_order_id),
    policy: 'Retain indefinitely. No automatic erasure. Explicit owner confirmation is required by the request erasure door.',
    obligations: ['Maintenance work and its audit remain; copied request fault details are anonymized.', 'Prior downloads remain outside local erasure.', 'Supply a later archive as the erasure journal when restoring. An archive older than a request erasure is refused.'] }
}

export async function requestErasureCounts(env: Bindings, id: string) {
  const tables = REQUEST_ERASURE_TABLES
  const counts: Record<string, number> = {}
  for (const [kind, table] of Object.entries(tables)) counts[kind] = (await one(env, `SELECT COUNT(*) AS n FROM ${table} WHERE request_id=?`, id)).n
  return counts
}
export const REQUEST_ERASURE_TABLES = { attachments: 'gk_request_files', events: 'gk_request_events', clocks: 'gk_request_clocks', clockEvents: 'gk_request_clock_events', escalations: 'gk_request_escalations' }

export const RETENTION_KINDS = ['attachments','request_contacts','users','maintenance_records']
export async function retentionSettings(env: Bindings, actor: Actor) {
  ownerOnly(actor)
  const rows = await all(env, 'SELECT * FROM gk_retention_policies ORDER BY kind')
  return { automaticErasure: false, policy: 'Retain indefinitely until explicit owner erasure. Minimum ages only delay eligibility.',
    policies: RETENTION_KINDS.map(kind => rows.find(row => row.kind === kind) ?? { kind, minimum_days: 0, revision: 0 }) }
}
export async function setRetentionPolicy(env: Bindings, actor: Actor, input: Input) {
  ownerOnly(actor)
  const kind = input.text('kind'), days = input.integer('minimumDays', { max: 36500 }), revision = input.integer('revision')!
  const reason = input.text('reason', { max: 500 })
  insist(RETENTION_KINDS.includes(kind), 'invalid_retention_kind')
  await commit(env, [
    guard(env, 'stale', 'COALESCE((SELECT revision FROM gk_retention_policies WHERE kind=?),0)=?', kind, revision),
    stmt(env, `INSERT INTO gk_retention_policies(kind,minimum_days,revision,changed_by,changed_at) VALUES(?,?,1,?,?)
      ON CONFLICT(kind) DO UPDATE SET minimum_days=excluded.minimum_days,revision=gk_retention_policies.revision+1,changed_by=excluded.changed_by,changed_at=excluded.changed_at`, kind, days, actor.id, now()),
  ], { actor: actor.id, action: 'retention.policy', subject: kind, detail: { minimumDays: days, reason, automaticErasure: false } })
  return { kind, revision: revision+1 }
}
