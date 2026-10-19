// PLAN-001 (slice): work priority and reusable work templates. Priority is
// emergency, high, normal (the default) or low; emergency work is corrective
// work at emergency priority. Leads and the owner keep templates (a unique
// name, the work's title, instructions, priority and optional estimate), edit
// them as numbered revisions (a stale revision is refused) and retire them.
// Work made from an active template copies those fields, anything given with
// the work taking precedence, and records the template and its revision; a
// later edit or retirement never changes work already made. A template may also
// name a checklist (FIELD-009), whose current revision its work pins.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { requiredFieldsOf } from './work-fields'
import { estimate } from './performance'

export const PRIORITIES = ['emergency', 'high', 'normal', 'low'] as const
export type Priority = typeof PRIORITIES[number]
export const PRIORITY_LABELS: Record<Priority, string> = { emergency: 'Emergency', high: 'High', normal: 'Normal', low: 'Low' }

/** The priority given, if any; anything else is refused. */
export function priorityOf(input: Input): Priority | null {
  const value = input.text('priority', { optional: true, max: 20 })
  if (!value) return null
  insist((PRIORITIES as readonly string[]).includes(value), 'invalid_priority')
  return value as Priority
}

export const templateList = async (env: Bindings) => (await all(env, 'SELECT t.id, t.name, t.title, t.instructions, t.priority, t.estimate_minutes, t.required_fields, t.requires_evidence, t.checklist_id, c.name AS checklist_name, t.revision, t.retired_at FROM gk_work_templates t LEFT JOIN gk_checklists c ON c.id = t.checklist_id ORDER BY t.retired_at IS NOT NULL, t.name'))
  .map(({ required_fields, requires_evidence, ...row }) => ({ ...row, requiredFields: required_fields ? JSON.parse(required_fields) as string[] : [], requiresEvidence: Boolean(requires_evidence) }))

/** The active template a new work order is made from, when one is named. */
export async function chosenTemplate(env: Bindings, input: Input) {
  const id = input.text('template', { optional: true, max: 100 })
  if (!id) return null
  const template = await one(env, 'SELECT * FROM gk_work_templates WHERE id = ?', id)
  insist(template, 'template_not_found', 404)
  insist(!template.retired_at, 'template_retired', 409)
  return template
}

/** A lead saves a template: new without `template`, otherwise its next revision from the revision they read. */
export async function saveTemplate(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const id = input.text('template', { optional: true, max: 100 }) || null
  const fields = { name: input.text('name', { max: 80 }), title: input.text('title', { max: 160 }), instructions: input.text('instructions', { optional: true, max: 2000 }) || null, priority: priorityOf(input) ?? 'normal', estimateMinutes: estimate(input),
    requiredFields: await requiredFieldsOf(env, input), requiresEvidence: input.flag('requiresEvidence'), checklist: input.text('checklist', { optional: true, max: 100 }) || null }
  // FIELD-009: a template may name a checklist; work made from it pins the checklist's revision current at that moment.
  if (fields.checklist) insist(await one(env, 'SELECT id FROM gk_checklists WHERE id = ?', fields.checklist), 'checklist_not_found', 404)
  const requirements = [fields.requiredFields.length ? JSON.stringify(fields.requiredFields) : null, fields.requiresEvidence ? 1 : 0, fields.checklist]
  const named = await one(env, 'SELECT id FROM gk_work_templates WHERE name = ? COLLATE NOCASE', fields.name)
  insist(!named || named.id === id, 'template_name_taken', 409)
  if (!id) {
    const created = newId()
    await commit(env, [stmt(env, 'INSERT INTO gk_work_templates (id, name, title, instructions, priority, estimate_minutes, required_fields, requires_evidence, checklist_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', created, fields.name, fields.title, fields.instructions, fields.priority, fields.estimateMinutes, ...requirements, actor.id, now(), now())],
      { actor: actor.id, action: 'template.save', subject: created, detail: { ...fields, revision: 1 } })
    return { id: created, revision: 1 }
  }
  const template = await one(env, 'SELECT * FROM gk_work_templates WHERE id = ?', id)
  insist(template, 'template_not_found', 404)
  insist(!template.retired_at, 'template_retired', 409)
  insist(input.integer('revision', { min: 1, max: 1_000_000 }) === template.revision, 'stale', 409)
  await commit(env, [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_work_templates WHERE id = ? AND revision = ?)', id, template.revision),
    stmt(env, 'UPDATE gk_work_templates SET name = ?, title = ?, instructions = ?, priority = ?, estimate_minutes = ?, required_fields = ?, requires_evidence = ?, checklist_id = ?, revision = revision + 1, updated_at = ? WHERE id = ?', fields.name, fields.title, fields.instructions, fields.priority, fields.estimateMinutes, ...requirements, now(), id)],
  { actor: actor.id, action: 'template.save', subject: id, detail: { ...fields, revision: template.revision + 1 } })
  return { id, revision: template.revision + 1 }
}

export async function retireTemplate(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const template = await one(env, 'SELECT * FROM gk_work_templates WHERE id = ?', input.text('template', { max: 100 }))
  insist(template, 'template_not_found', 404)
  insist(!template.retired_at, 'template_retired', 409)
  await commit(env, [stmt(env, 'UPDATE gk_work_templates SET retired_at = ?, updated_at = ? WHERE id = ? AND retired_at IS NULL', now(), now(), template.id)], { actor: actor.id, action: 'template.retire', subject: template.id, detail: { name: template.name } })
  return { id: template.id }
}

/** A lead changes an open work order's priority, with a reason kept in the audit. */
export async function setPriority(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const order = await one(env, 'SELECT id, priority, status, version FROM gk_work_orders WHERE id = ?', input.text('workOrder', { max: 100 }))
  insist(order, 'work_order_not_found', 404)
  insist(['open', 'in_progress', 'returned', 'submitted'].includes(order.status), 'work_order_not_open', 409)
  const priority = priorityOf(input), reason = input.text('reason', { max: 500 })
  insist(priority, 'invalid_priority')
  insist(priority !== order.priority, 'unchanged', 409)
  await commit(env, [stmt(env, 'UPDATE gk_work_orders SET priority = ? WHERE id = ?', priority, order.id)], { actor: actor.id, action: 'workorder.priority', subject: order.id, detail: { from: order.priority, to: priority, reason } })
  return { id: order.id, priority }
}
