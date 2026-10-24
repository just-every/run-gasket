import { REQUEST_NOT_HELD } from './retention'
// Explicit owner erasure keeps the request number while removing private intake.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { commit, guard, insist, now, one, stmt } from './core'
import type { Input } from './input'

export async function eraseRequest(env: Bindings, actor: Actor, input: Input) {
  insist(actor.role === 'owner', 'forbidden', 403)
  insist(input.flag('confirm'), 'erasure_confirmation_required')
  const id = input.text('request'), r = await one(env, 'SELECT * FROM gk_requests WHERE id=?', id)
  insist(r, 'request_not_found', 404)
  if (r.erased_at) return { id }
  const version = input.integer('version', { min: 1 })
  insist(version === r.version, 'stale', 409)
  await commit(env, [
    guard(env, 'retention_hold', REQUEST_NOT_HELD, id, id),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND version=? AND erased_at IS NULL)', id, version),
    stmt(env, "INSERT INTO gk_guard(code,ok) VALUES('request_erasure',1)"),
    stmt(env, 'DELETE FROM gk_request_files WHERE request_id=?', id),
    stmt(env, 'DELETE FROM gk_request_events WHERE request_id=?', id),
    stmt(env, "UPDATE gk_audit SET detail='{}' WHERE subject=? AND action IN ('request.submit','request.triage','request.reply','request.convert')", id),
    // Conversion copies the source description and title, so erase those copies.
    ...(r.work_order_id ? [
      stmt(env, "UPDATE gk_work_orders SET title='Erased operator fault',description=NULL WHERE id=? AND EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND status='converted')", r.work_order_id, id),
      stmt(env, "UPDATE gk_audit SET detail='{}' WHERE subject=? AND action='workorder.create' AND EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND status='converted')", r.work_order_id, id),
    ] : []),
    stmt(env, "UPDATE gk_requests SET description='',contact='',requester_id=NULL,answers_json='{}',form_json='[]',status='declined',erased_at=?,version=version+1 WHERE id=?", now(), id),
  ], { actor: actor.id, action: 'request.erase', subject: id, detail: { erased: true } })
  return { id }
}
