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
  insist(kind === 'work' || kind === 'request', 'invalid_hold_kind')
  const table = kind === 'work' ? 'gk_work_orders' : 'gk_requests'
  insist(await one(env, `SELECT 1 FROM ${table} WHERE id=?`, id), 'record_not_found', 404)
  const old = await one(env, 'SELECT revision FROM gk_retention_holds WHERE kind=? AND record_id=?', kind, id)
  const revision = input.integer('revision', { min: 0 })
  insist(revision === (old?.revision ?? 0), 'stale', 409)
  await commit(env, [
    guard(env, 'stale', '(SELECT COALESCE((SELECT revision FROM gk_retention_holds WHERE kind=? AND record_id=?),0))=?', kind, id, revision),
    stmt(env, `INSERT INTO gk_retention_holds(kind,record_id,held,reason,revision,changed_by,changed_at) VALUES(?,?,?,?,1,?,?)
      ON CONFLICT(kind,record_id) DO UPDATE SET held=excluded.held,reason=excluded.reason,revision=gk_retention_holds.revision+1,changed_by=excluded.changed_by,changed_at=excluded.changed_at`, kind, id, Number(held), reason, actor.id, now()),
  ], { actor: actor.id, action: 'retention.hold', subject: id, detail: { kind, held, reason } })
  return { id, revision: (revision ?? 0) + 1, held }
}
export const REQUEST_NOT_HELD = `NOT EXISTS(SELECT 1 FROM gk_retention_holds h WHERE h.held=1 AND
  ((h.kind='request' AND h.record_id=?) OR (h.kind='work' AND h.record_id=(SELECT work_order_id FROM gk_requests WHERE id=?))))`
export async function retentionPreview(env: Bindings, actor: Actor, url: URL) {
  ownerOnly(actor)
  const id = url.searchParams.get('request') ?? ''
  const request = await one(env, 'SELECT id,version,erased_at,work_order_id FROM gk_requests WHERE id=?', id)
  insist(request, 'request_not_found', 404)
  const held = !await one(env, `SELECT 1 WHERE ${REQUEST_NOT_HELD}`, id, id)
  const files = (await one<{ count: number; bytes: number }>(env, 'SELECT COUNT(*) AS count,COALESCE(SUM(size),0) AS bytes FROM gk_request_files WHERE request_id=?', id))!
  return { id, version: request.version, held, erased: Boolean(request.erased_at), files, linkedWork: request.work_order_id,
    holds: await all(env, "SELECT kind,record_id,held,reason,revision FROM gk_retention_holds WHERE (kind='request' AND record_id=?) OR (kind='work' AND record_id=?)", id, request.work_order_id),
    policy: 'Retain indefinitely. No automatic erasure. Explicit owner confirmation is required by the request erasure door.',
    obligations: ['Maintenance work and its audit remain; copied request fault details are anonymized.', 'Prior downloads remain outside local erasure.', 'Restoring an older archive does not yet enforce later domain erasure decisions.'] }
}
