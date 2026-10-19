// ASSET-008: calibration tasks. A calibration is a schedule on an instrument
// (an asset) whose procedure carries the tolerances: its number steps with
// inclusive limits (FIELD-004), so a reading outside them fails and needs a
// linked finding with follow-up work. Its due tolerance is a grace window in
// whole days after the due date: until today passes due date + grace it is
// "due", after that "overdue". The work needs a certificate attached (PDF or
// image) and the tools it names recorded; approving it keeps that certificate
// as the instrument's next version, with the procedure revision, the result
// (out of tolerance when any number step failed), and whether it was on time.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, insist, newId, now, one, stmt, type Row } from './core'
import { addDays } from './dates'
import type { Input } from './input'
import { createSchedule } from './schedules'
import { kindOf, type ChecklistItem } from './steps'
import { toolList } from './tools'

/** The procedure's tolerances: its number steps with at least one limit. */
export const tolerances = (steps: ChecklistItem[]) => steps.filter(step => kindOf(step) === 'number' && (step.min || step.max))
  .map(step => ({ text: step.text, unit: step.unit, min: step.min ?? null, max: step.max ?? null }))

export async function createCalibration(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  insist(input.text('asset', { optional: true, max: 100 }), 'asset_required')
  insist(input.integer('everyDays', { min: 1, max: 3660, optional: true }), 'invalid_everyDays')
  const latest = await one(env, 'SELECT items_json FROM gk_checklist_revisions WHERE checklist_id = ? ORDER BY number DESC LIMIT 1', input.text('checklist', { max: 100 }))
  insist(latest, 'checklist_not_found', 404)
  insist(tolerances(JSON.parse(latest.items_json)).length, 'tolerance_required')
  const graceDays = input.integer('graceDays', { min: 0, max: 90, optional: true }) ?? 0
  return await createSchedule(env, actor, input, { calibration: graceDays })
}

/** On approval of calibration work: its latest certificate becomes the instrument's next version. */
export async function certificateStatements(env: Bindings, actor: Actor, order: Row) {
  const schedule = order.schedule_id ? await one(env, 'SELECT id, calibration, grace_days FROM gk_schedules WHERE id = ?', order.schedule_id) : null
  if (!schedule?.calibration) return []
  const certificate = await one(env, 'SELECT id FROM gk_evidence WHERE work_order_id = ? AND certificate = 1 ORDER BY uploaded_at DESC, rowid DESC LIMIT 1', order.id)
  insist(certificate, 'certificate_required', 409)
  const steps = JSON.parse((await one(env, 'SELECT items_json FROM gk_checklist_revisions WHERE id = ?', order.checklist_revision_id))!.items_json) as ChecklistItem[]
  const failed = await all(env, "SELECT item FROM gk_results WHERE work_order_id = ? AND outcome = 'fail'", order.id)
  const result = failed.some(row => steps[row.item] && kindOf(steps[row.item]) === 'number') ? 'out_of_tolerance' : 'in_tolerance'
  const onTime = actor.today <= addDays(order.due_date, schedule.grace_days ?? 0) ? 1 : 0
  return [stmt(env, `INSERT INTO gk_calibration_certificates (id, schedule_id, version, work_order_id, evidence_id, checklist_revision_id, result, due_date, calibrated_on, on_time, approved_by, approved_at)
    VALUES (?, ?, (SELECT COALESCE(MAX(version), 0) + 1 FROM gk_calibration_certificates WHERE schedule_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  newId(), schedule.id, schedule.id, order.id, certificate.id, order.checklist_revision_id, result, order.due_date, actor.today, onTime, actor.id, now())]
}

/** Every calibration task: its instrument, procedure tolerances, grace, tools, state against today, open work and certificate versions. */
export async function calibrationList(env: Bindings, actor: Actor) {
  const rows = await all(env, `SELECT s.id, s.title, s.asset_id, a.tag AS asset_tag, a.name AS asset_name, s.checklist_id, c.name AS procedure, s.every_days, s.next_due_date, s.grace_days, s.tools, s.active,
    (SELECT r.number FROM gk_checklist_revisions r WHERE r.checklist_id = s.checklist_id ORDER BY r.number DESC LIMIT 1) AS procedure_revision,
    (SELECT r.items_json FROM gk_checklist_revisions r WHERE r.checklist_id = s.checklist_id ORDER BY r.number DESC LIMIT 1) AS items_json,
    (SELECT w.id FROM gk_work_orders w WHERE w.schedule_id = s.id AND w.status NOT IN ('closed', 'cancelled')) AS open_work
    FROM gk_schedules s JOIN gk_assets a ON a.id = s.asset_id JOIN gk_checklists c ON c.id = s.checklist_id WHERE s.calibration = 1 ORDER BY s.next_due_date, a.tag`)
  const certificates = await all(env, `SELECT k.schedule_id, k.version, k.work_order_id, w.number AS work_number, k.evidence_id, e.filename, e.sha256, r.number AS procedure_revision, k.result, k.due_date, k.calibrated_on, k.on_time, m.name AS approved_by
    FROM gk_calibration_certificates k JOIN gk_evidence e ON e.id = k.evidence_id JOIN gk_checklist_revisions r ON r.id = k.checklist_revision_id JOIN gk_work_orders w ON w.id = k.work_order_id LEFT JOIN gk_members m ON m.id = k.approved_by ORDER BY k.version DESC`)
  const used = await all(env, 'SELECT t.work_order_id, t.name, t.identifier FROM gk_work_tools t WHERE t.work_order_id IN (SELECT work_order_id FROM gk_calibration_certificates) ORDER BY t.position')
  return rows.map(({ items_json, tools, ...row }) => {
    const late = row.next_due_date ? addDays(row.next_due_date, row.grace_days ?? 0) : null
    const state = !row.next_due_date || actor.today < row.next_due_date ? 'in_date' : actor.today <= late! ? 'due' : 'overdue'
    return { ...row, tools: toolList(tools), tolerances: tolerances(JSON.parse(items_json)), state, overdue_after: late,
      certificates: certificates.filter(item => item.schedule_id === row.id).map(({ schedule_id: _, ...item }) => ({ ...item, on_time: Boolean(item.on_time), tools: used.filter(tool => tool.work_order_id === item.work_order_id).map(({ work_order_id: _w, ...tool }) => tool) })) }
  })
}
