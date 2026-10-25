import { redactionStatements, invalidateTransfersStatements } from '@runeditrun/rer/modules/portability/journal'
import { REQUEST_NOT_HELD, REQUEST_EVIDENCE_RETAINED, REQUEST_ERASURE_TABLES, requestErasureCounts } from './retention'
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
  if (r.erased_at) {
    const saved = await one(env, 'SELECT result_json FROM gk_request_erasure_results WHERE request_id=?', id)
    return { id, result: saved ? JSON.parse(saved.result_json) : null }
  }
  const version = input.integer('version', { min: 1 })
  insist(version === r.version, 'stale', 409)
  const removed = await requestErasureCounts(env, id)
  const result = { removed, anonymized: { requests: 1, linkedWork: r.work_order_id && r.status === 'converted' ? 1 : 0 }, retained: { maintenanceWork: r.work_order_id ? 1 : 0, audit: true }, priorDownloads: 'Outside local erasure' }
  await commit(env, [
    guard(env, 'retention_hold', REQUEST_NOT_HELD, id, id, id, id),
    guard(env, 'request_evidence_retained', `NOT (${REQUEST_EVIDENCE_RETAINED})`, id),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND version=? AND erased_at IS NULL)', id, version),
    guard(env, 'retention_hold', `(SELECT created_at FROM gk_requests WHERE id=?)<=?-COALESCE((SELECT minimum_days FROM gk_retention_policies WHERE kind='request_contacts'),0)*86400000`, id, now()),
    guard(env, 'retention_hold', `NOT EXISTS(SELECT 1 FROM gk_request_files WHERE request_id=?) OR (SELECT created_at FROM gk_requests WHERE id=?)<=?-COALESCE((SELECT minimum_days FROM gk_retention_policies WHERE kind='attachments'),0)*86400000`, id, id, now()),
    ...Object.entries(REQUEST_ERASURE_TABLES).map(([kind, table]) => guard(env, 'stale', `(SELECT COUNT(*) FROM ${table} WHERE request_id=?)=?`, id, removed[kind])),
    stmt(env, 'INSERT INTO gk_request_erasure_results(request_id,result_json) VALUES(?,?)', id, JSON.stringify(result)),
    // Fence older archives and invalidate export snapshots in the erasure batch.
    ...await redactionStatements(env.DB),
    ...await invalidateTransfersStatements(env.DB),
    stmt(env, "INSERT INTO gk_guard(code,ok) VALUES('request_erasure',1)"),
    stmt(env, 'DELETE FROM gk_request_files WHERE request_id=?', id),
    stmt(env, 'DELETE FROM gk_request_events WHERE request_id=?', id),
    stmt(env, 'DELETE FROM gk_request_clock_events WHERE request_id=?', id),
    stmt(env, 'DELETE FROM gk_request_escalations WHERE request_id=?', id),
    stmt(env, 'DELETE FROM gk_request_clocks WHERE request_id=?', id),
    stmt(env, "UPDATE gk_audit SET detail='{}' WHERE subject=? AND action IN ('request.submit','request.triage','request.reply','request.convert','request.clock','request.escalation')", id),
    // Conversion copies the source description and title, so erase those copies.
    ...(r.work_order_id ? [
      stmt(env, "UPDATE gk_work_orders SET title='Erased operator fault',description=NULL WHERE id=? AND EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND status='converted')", r.work_order_id, id),
      stmt(env, "UPDATE gk_audit SET detail='{}' WHERE subject=? AND action='workorder.create' AND EXISTS(SELECT 1 FROM gk_requests WHERE id=? AND status='converted')", r.work_order_id, id),
    ] : []),
    stmt(env, "UPDATE gk_requests SET description='',contact='',requester_id=NULL,answers_json='{}',form_json='[]',status='declined',erased_at=?,version=version+1 WHERE id=?", now(), id),
  ], { actor: actor.id, action: 'request.erase', subject: id, detail: { erased: true } })
  return { id, result }
}
