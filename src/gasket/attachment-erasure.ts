// Conservative owner-only erasure of optional evidence on unfinished work.
import { redactionStatements, invalidateTransfersStatements } from '@runeditrun/rer/modules/portability/journal'
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import type { Input } from './input'
import { commit, guard, insist, now, one, stmt } from './core'

// Preserve signed records, required answers, certificates and work held for review.
const ELIGIBLE = `EXISTS(SELECT 1 FROM gk_evidence e JOIN gk_work_orders w ON w.id=e.work_order_id
 WHERE e.id=? AND w.version=? AND w.status IN ('open','in_progress','returned')
 AND w.submitted_version IS NULL AND w.requires_evidence=0 AND e.item IS NULL AND e.certificate=0
 AND NOT EXISTS(SELECT 1 FROM gk_print_entries paper WHERE paper.evidence_id=e.id)
 AND NOT EXISTS(SELECT 1 FROM gk_signatures s WHERE s.work_order_id=w.id)
 AND NOT EXISTS(SELECT 1 FROM gk_calibration_certificates c WHERE c.work_order_id=w.id)
 AND NOT EXISTS(SELECT 1 FROM gk_evidence certificate WHERE certificate.work_order_id=w.id AND certificate.certificate=1)
 AND e.uploaded_at<=?-COALESCE((SELECT minimum_days FROM gk_retention_policies WHERE kind='attachments'),0)*86400000
 AND NOT EXISTS(SELECT 1 FROM gk_retention_scope_holds h WHERE h.held=1 AND ((h.kind='attachment' AND h.record_id=e.id) OR (h.kind='user' AND h.record_id=e.uploaded_by)))
 AND NOT EXISTS(SELECT 1 FROM gk_retention_holds h WHERE h.kind='work' AND h.record_id=w.id AND h.held=1))`
export async function attachmentErasurePreview(env: Bindings, actor: Actor, id: string) {
  insist(actor.role === 'owner', 'forbidden', 403)
  const evidence = await one(env, 'SELECT e.id,e.work_order_id,e.size,w.version FROM gk_evidence e JOIN gk_work_orders w ON w.id=e.work_order_id WHERE e.id=?', id)
  const saved = await one(env, 'SELECT result_json FROM gk_attachment_erasure_results WHERE evidence_id=?', id)
  insist(evidence || saved, 'evidence_not_found', 404)
  if (!evidence) return { id, erased: true, result: JSON.parse(saved.result_json) }
  const annotations = (await one(env, 'SELECT COUNT(*) AS n FROM gk_annotations WHERE evidence_id=?', id)).n
  const paperEntries = (await one(env, 'SELECT COUNT(*) AS n FROM gk_print_entries WHERE evidence_id=?', id)).n
  return { id, erased: false, work: evidence.work_order_id, version: evidence.version, eligible: Boolean(await one(env, `SELECT 1 WHERE ${ELIGIBLE}`, id, evidence.version, now())),
    dependencies: { attachments: 1, bytes: evidence.size, annotations, ...(paperEntries ? { paperEntries } : {}) },
    obligations: ['Held, submitted, signed, required and certificate evidence is retained.', 'Maintenance work and anonymized audit remain. Prior downloads remain outside local erasure.', 'Later restores require the later erasure journal.', ...(paperEntries ? ['Controlled paper originals remain linked to their durable entry receipt.'] : [])] }
}
export async function eraseAttachment(env: Bindings, actor: Actor, input: Input) {
  insist(actor.role === 'owner', 'forbidden', 403)
  insist(input.flag('confirm'), 'erasure_confirmation_required')
  const id = input.text('evidence'), preview = await attachmentErasurePreview(env, actor, id)
  if (preview.erased) return { id, result: preview.result }
  const version = input.integer('version', { min: 1 })
  insist(version === preview.version, 'stale', 409)
  insist(preview.eligible, 'attachment_retained', 409)
  const result = { removed: preview.dependencies, retained: { maintenanceWork: 1, audit: true }, priorDownloads: 'Outside local erasure' }
  await commit(env, [
    guard(env, 'stale', ELIGIBLE, id, version, now()),
    ...await redactionStatements(env.DB), ...await invalidateTransfersStatements(env.DB),
    stmt(env, "INSERT INTO gk_guard(code,ok) VALUES('attachment_erasure',1)"),
    stmt(env, 'DELETE FROM gk_annotations WHERE evidence_id=?', id),
    stmt(env, 'DELETE FROM gk_evidence WHERE id=?', id),
    stmt(env, "UPDATE gk_audit SET detail='{}' WHERE subject=? AND action IN ('workorder.evidence','workorder.annotate')", preview.work),
    stmt(env, 'UPDATE gk_work_orders SET version=version+1 WHERE id=?', preview.work),
    stmt(env, 'INSERT INTO gk_attachment_erasure_results(evidence_id,work_order_id,result_json) VALUES(?,?,?)', id, preview.work, JSON.stringify(result)),
  ], { actor: actor.id, action: 'attachment.erase', subject: id, detail: result })
  return { id, result }
}
