import { qualificationInputSql } from './qualification-copies'
import { redactionStatements, invalidateTransfersStatements } from '@runeditrun/rer/modules/portability/journal'
import type { Bindings } from '../auth.server'
import { capabilitySql, type Actor } from './actor'
import { all, commit, guard, insist, now, one, stmt } from './core'
import type { Input } from './input'

type QualificationPair = [string, string]

// Erase an unused retired qualification family, including corrections and notices.
// Active replacements, holds and any retained safety sign-off refuse the operation.
const FAMILY = `kind='qualification' AND json_extract(snapshot,'$.member_id')=? AND json_extract(snapshot,'$.name')=? COLLATE NOCASE`
const AUDITS = `(action='planning.qualification' AND subject=? AND json_extract(detail,'$.name')=? COLLATE NOCASE)
 OR (action='planning.retire' AND subject IN (SELECT id FROM gk_retired_resources WHERE ${FAMILY}))`
const RECORDS = `SELECT record_id FROM gk_retired_resources WHERE ${FAMILY}
 UNION SELECT json_extract(detail,'$.previous.record_id') FROM gk_audit WHERE action='planning.qualification' AND subject=? AND json_extract(detail,'$.name')=? COLLATE NOCASE
 UNION SELECT json_extract(detail,'$.recordId') FROM gk_audit WHERE action='planning.qualification' AND subject=? AND json_extract(detail,'$.name')=? COLLATE NOCASE`
const COPIES = `EXISTS(SELECT 1 FROM json_each(input,'$.qualificationReminders.qualifications') q WHERE json_extract(q.value,'$.member_id')=? AND json_extract(q.value,'$.name')=? COLLATE NOCASE)`
const NOTICES = `record_id<>'legacy' AND record_id IN (${RECORDS})`
const ELIGIBLE = `NOT EXISTS(SELECT 1 FROM gk_qualifications WHERE member_id=? AND name=? COLLATE NOCASE)
 AND NOT EXISTS(SELECT 1 FROM gk_safety_attestations WHERE signer=? AND json_extract(qualification_json,'$.name')=? COLLATE NOCASE)
 AND NOT EXISTS(SELECT 1 FROM gk_retention_scope_holds WHERE held=1 AND
 ((kind='user' AND record_id=?) OR (kind='qualification' AND record_id IN (SELECT id FROM gk_retired_resources WHERE ${FAMILY}))))
 AND NOT EXISTS(SELECT 1 FROM gk_retired_resources WHERE ${FAMILY}
 AND retired_at>?-COALESCE((SELECT MAX(minimum_days) FROM gk_retention_policies WHERE kind IN ('maintenance_records','users')),0)*86400000)`

async function context(env: Bindings, id: string) {
  const record = await one(env, "SELECT snapshot FROM gk_retired_resources WHERE id=? AND kind='qualification'", id)
  insist(record, 'qualification_not_found', 404)
  const q = JSON.parse(record.snapshot), pair: QualificationPair = [q.member_id, q.name]
  return { pair, family: await all(env, `SELECT id FROM gk_retired_resources WHERE ${FAMILY} ORDER BY id`, ...pair) }
}
const noticeParams = (pair: QualificationPair) => [...pair, ...pair, ...pair]
const eligibleParams = (pair: QualificationPair) => [...pair, ...pair, pair[0], ...pair, ...pair, now()]

export async function qualificationErasurePreview(env: Bindings, actor: Actor, id: string) {
  insist(actor.role === 'owner' && !actor.service, 'forbidden', 403)
  const saved = await one(env, 'SELECT result_json FROM gk_qualification_erasure_results WHERE resource_id=?', id)
  if (saved) return { id, erased: true, result: JSON.parse(saved.result_json) }
  const { pair, family } = await context(env, id)
  const audit = (await one(env, `SELECT COUNT(*) AS n FROM gk_audit WHERE ${AUDITS}`, ...pair, ...pair)).n
  const reminders = (await one(env, `SELECT COUNT(*) AS n FROM gk_qualification_reminders WHERE ${NOTICES}`, ...noticeParams(pair))).n
  const safety = (await one(env, "SELECT COUNT(*) AS n FROM gk_safety_attestations WHERE signer=? AND json_extract(qualification_json,'$.name')=? COLLATE NOCASE", ...pair)).n
  const reminderInputs = (await one(env, `SELECT COUNT(*) AS n FROM gk_automation_jobs WHERE ${COPIES}`, ...pair)).n
  return { id, erased: false, revision: (await one(env, 'SELECT revision FROM gk_planning_state WHERE singleton=1')).revision,
    eligible: Boolean(await one(env, `SELECT 1 WHERE ${ELIGIBLE}`, ...eligibleParams(pair))),
    dependencies: { retiredQualifications: family.length, auditDetails: audit, reminders, safetySignoffs: safety, reminderInputs },
    policy: 'Retain indefinitely until explicit owner confirmation. Active qualifications, holds, minimum ages and retained safety sign-offs prevent erasure.',
    obligations: ['Audit actor, action, record, site and time remain. User identity erasure is separate.', 'Prior downloads remain outside local erasure. Restore requires the later erasure journal.'] }
}

export async function eraseQualification(env: Bindings, actor: Actor, input: Input) {
  insist(actor.role === 'owner' && !actor.service, 'forbidden', 403)
  insist(input.flag('confirm'), 'erasure_confirmation_required')
  const id = input.text('id'), preview = await qualificationErasurePreview(env, actor, id)
  if (preview.erased) return { id, result: preview.result }
  const seen = input.integer('revision', { min: 1 })!
  insist(seen === preview.revision, 'stale', 409)
  insist(preview.eligible, 'qualification_retained', 409)
  const { pair, family } = await context(env, id)
  const result = { removed: { retiredQualifications: family.length, reminders: preview.dependencies!.reminders },
    anonymized: { auditDetails: preview.dependencies!.auditDetails, reminderInputs: preview.dependencies!.reminderInputs }, retained: { audit: true, userIdentity: true }, priorDownloads: 'Outside local erasure' }
  const authority = capabilitySql(actor.sessionId, 'site.manage')
  await commit(env, [
    guard(env, 'forbidden', authority.sql, ...authority.params),
    guard(env, 'stale', '(SELECT revision FROM gk_planning_state WHERE singleton=1)=?', seen),
    guard(env, 'qualification_retained', ELIGIBLE, ...eligibleParams(pair)),
    guard(env, 'stale', `(SELECT COUNT(*) FROM gk_retired_resources WHERE ${FAMILY})=?`, ...pair, family.length),
    guard(env, 'stale', `(SELECT COUNT(*) FROM gk_qualification_reminders WHERE ${NOTICES})=?`, ...noticeParams(pair), preview.dependencies!.reminders),
    ...await redactionStatements(env.DB), ...await invalidateTransfersStatements(env.DB),
    stmt(env, "INSERT INTO gk_guard(code,ok) VALUES('qualification_erasure',1)"),
    stmt(env, `INSERT OR IGNORE INTO gk_erased_qualification_records SELECT record_id FROM (${RECORDS}) WHERE record_id IS NOT NULL AND record_id<>'legacy'`, ...noticeParams(pair)),
    stmt(env, `UPDATE gk_automation_jobs SET input=${qualificationInputSql('input')}`),
    // Delete notices before redacting the only remaining links to earlier versions.
    stmt(env, `DELETE FROM gk_qualification_reminders WHERE ${NOTICES}`, ...noticeParams(pair)),
    stmt(env, `UPDATE gk_audit SET detail='{}' WHERE ${AUDITS}`, ...pair, ...pair),
    ...family.map(row => stmt(env, 'INSERT INTO gk_qualification_erasure_results VALUES(?,?)', row.id, JSON.stringify(result))),
    stmt(env, `DELETE FROM gk_retired_resources WHERE ${FAMILY}`, ...pair),
    stmt(env, 'UPDATE gk_planning_state SET revision=revision+1 WHERE singleton=1'),
  ], { actor: actor.id, action: 'qualification.erase', subject: id, detail: result })
  return { id, result }
}
