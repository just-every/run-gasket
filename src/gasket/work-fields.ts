// PLAN-001 (slice): custom work fields and permissioned waiting statuses.
// A lead defines a field (text, number or a choice) and may mark it required:
// a required field needs a value before any work order is submitted for review
// (the field's current definition counts; a retired field never does). A
// template can require fields and photo or document evidence; work made from
// it keeps the requirements of the revision it was made from. The assignee, a
// collaborator or a lead sets a value; every change is audited with what it
// replaced. A waiting status ("Waiting on parts") sits inside the fixed
// lifecycle on open work: its definition names the roles that may set or clear
// it (the owner always may), and a maintainer only on work they hold. Choices
// are given as a list or separated by commas, so a choice never holds a comma.
import type { Bindings } from '../auth.server'
import { can, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { isCollaborator } from './crew'
import type { Input } from './input'

const KINDS = ['text', 'number', 'choice'] as const
export const STATUS_ROLES = ['lead', 'maintainer', 'supervisor'] as const
const OPEN_STATES = ['open', 'in_progress', 'returned']

export const fieldList = (env: Bindings) => all(env, 'SELECT id, label, kind, options, required, position, retired_at FROM gk_work_fields ORDER BY retired_at IS NOT NULL, position')
export const statusList = async (env: Bindings) => (await all(env, 'SELECT id, label, roles, retired_at FROM gk_work_statuses ORDER BY retired_at IS NOT NULL, label')).map(row => ({ ...row, roles: JSON.parse(row.roles) as string[] }))

/** A lead adds a field: `label` (unique, any case), `kind`, `option` list for a choice, and `required`. */
export async function saveField(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const label = input.text('label', { max: 80 }), kind = input.text('kind', { max: 10 }) as typeof KINDS[number], required = input.flag('required')
  insist(KINDS.includes(kind), 'invalid_kind')
  const options = kind === 'choice' ? [...new Set(input.list('option').flatMap(option => option.split(',')).map(option => option.trim()).filter(Boolean))] : null
  insist(!options || (options.length >= 2 && options.length <= 30 && options.every(option => option.length <= 80)), 'invalid_option')
  insist(!await one(env, 'SELECT 1 FROM gk_work_fields WHERE label = ? COLLATE NOCASE', label), 'field_label_taken', 409)
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_work_fields (id, label, kind, options, required, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM gk_work_fields), ?, ?)', id, label, kind, options && JSON.stringify(options), required ? 1 : 0, actor.id, now())],
    { actor: actor.id, action: 'workfield.save', subject: id, detail: { label, kind, options, required } })
  return { id }
}

/** A retired field keeps its values on every work order but takes no new ones and is no longer required. */
export async function retireField(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const field = await one(env, 'SELECT * FROM gk_work_fields WHERE id = ?', input.text('field', { max: 100 }))
  insist(field, 'field_not_found', 404)
  insist(!field.retired_at, 'field_retired', 409)
  await commit(env, [stmt(env, 'UPDATE gk_work_fields SET retired_at = ? WHERE id = ? AND retired_at IS NULL', now(), field.id)], { actor: actor.id, action: 'workfield.retire', subject: field.id, detail: { label: field.label } })
  return { id: field.id }
}

/** The active fields a template names as required, checked when the template is saved. */
export async function requiredFieldsOf(env: Bindings, input: Input) {
  const ids = [...new Set([...input.list('requiredField'), ...input.list('requiredFields')])]
  for (const id of ids) {
    const field = await one(env, 'SELECT retired_at FROM gk_work_fields WHERE id = ?', id)
    insist(field, 'field_not_found', 404)
    insist(!field.retired_at, 'field_retired', 409)
  }
  return ids
}

/** The assignee, a collaborator or a lead sets one field's value on open work; an empty value clears it. */
export async function setFieldValue(env: Bindings, actor: Actor, input: Input) {
  const order = await one(env, 'SELECT id, assignee_id, status, version FROM gk_work_orders WHERE id = ?', input.text('workOrder', { max: 100 }))
  insist(order, 'work_order_not_found', 404)
  insist(can(actor, 'work.assign') || (can(actor, 'work.do') && (order.assignee_id === actor.id || await isCollaborator(env, order.id, actor.id))), 'not_your_work', 403)
  insist(OPEN_STATES.includes(order.status), 'work_order_not_open', 409)
  if (input.has('version')) insist(input.integer('version', { min: 1, max: 1_000_000 }) === order.version, 'stale', 409)
  const field = await one(env, 'SELECT * FROM gk_work_fields WHERE id = ?', input.text('field', { max: 100 }))
  insist(field, 'field_not_found', 404)
  insist(!field.retired_at, 'field_retired', 409)
  const value = input.text('value', { optional: true, max: 500 }) || null
  if (value !== null && field.kind === 'number') insist(/^-?\d{1,12}(\.\d{1,6})?$/.test(value), 'invalid_value')
  if (value !== null && field.kind === 'choice') insist((JSON.parse(field.options) as string[]).includes(value), 'invalid_value')
  const before = await one(env, 'SELECT value FROM gk_work_field_values WHERE work_order_id = ? AND field_id = ?', order.id, field.id)
  insist((before?.value ?? null) !== value, 'unchanged', 409)
  await commit(env, [
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ?)', order.id, order.version),
    value === null ? stmt(env, 'DELETE FROM gk_work_field_values WHERE work_order_id = ? AND field_id = ?', order.id, field.id)
      : stmt(env, 'INSERT INTO gk_work_field_values (work_order_id, field_id, value, set_by, set_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(work_order_id, field_id) DO UPDATE SET value = excluded.value, set_by = excluded.set_by, set_at = excluded.set_at', order.id, field.id, value, actor.id, now()),
    stmt(env, 'UPDATE gk_work_orders SET version = version + 1 WHERE id = ?', order.id),
  ], { actor: actor.id, action: 'workorder.field', subject: order.id, detail: { field: field.id, label: field.label, from: before?.value ?? null, to: value } })
  return { id: order.id, field: field.id, value }
}

/** One work order's fields: every active field and any retired one holding a value, with whether it is required here. */
export async function fieldsOf(env: Bindings, order: Row) {
  const pinned = new Set<string>(order.required_fields ? JSON.parse(order.required_fields) : [])
  const rows = await all(env, `SELECT f.id, f.label, f.kind, f.options, f.required, f.retired_at, v.value, m.name AS set_by, v.set_at FROM gk_work_fields f
    LEFT JOIN gk_work_field_values v ON v.field_id = f.id AND v.work_order_id = ? LEFT JOIN gk_members m ON m.id = v.set_by WHERE f.retired_at IS NULL OR v.value IS NOT NULL ORDER BY f.position`, order.id)
  return rows.map(row => ({ id: row.id as string, label: row.label as string, kind: row.kind as string, options: row.options ? JSON.parse(row.options) as string[] : null, retired: Boolean(row.retired_at),
    value: row.value as string | null, setBy: row.set_by as string | null, setAt: row.set_at as number | null, required: !row.retired_at && (Boolean(row.required) || pinned.has(row.id)) }))
}

/** A lead defines a waiting status with the roles that may set or clear it. */
export async function saveStatus(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const label = input.text('label', { max: 60 }), roles = [...new Set(input.has('role') ? input.list('role') : [])]
  insist(roles.length > 0 && roles.every(role => (STATUS_ROLES as readonly string[]).includes(role)), 'invalid_role')
  insist(!await one(env, 'SELECT 1 FROM gk_work_statuses WHERE label = ? COLLATE NOCASE', label), 'status_label_taken', 409)
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_work_statuses (id, label, roles, created_by, created_at) VALUES (?, ?, ?, ?, ?)', id, label, JSON.stringify(roles), actor.id, now())],
    { actor: actor.id, action: 'workstatus.save', subject: id, detail: { label, roles } })
  return { id }
}

const mayUse = (actor: Actor, status: Row & { roles: string[] }) => actor.role === 'owner' || status.roles.includes(actor.role)

/** Set (`status`) or clear (empty `status`) open work's waiting status; the person needs the role both statuses allow. */
export async function setWaiting(env: Bindings, actor: Actor, input: Input) {
  const order = await one(env, 'SELECT id, assignee_id, status, version, waiting_status FROM gk_work_orders WHERE id = ?', input.text('workOrder', { max: 100 }))
  insist(order, 'work_order_not_found', 404)
  insist(OPEN_STATES.includes(order.status), 'work_order_not_open', 409)
  if (!can(actor, 'work.assign') && !can(actor, 'work.review')) insist(order.assignee_id === actor.id || await isCollaborator(env, order.id, actor.id), 'not_your_work', 403)
  const statuses = new Map((await statusList(env)).map(row => [row.id as string, row]))
  const to = input.text('status', { optional: true, max: 100 }) || null
  const target = to ? statuses.get(to) : null
  if (to) {
    insist(target, 'status_not_found', 404)
    insist(!target!.retired_at, 'status_retired', 409)
    insist(mayUse(actor, target!), 'status_not_permitted', 403)
  }
  const current = order.waiting_status ? statuses.get(order.waiting_status) : null
  if (current) insist(mayUse(actor, current), 'status_not_permitted', 403)
  insist(order.waiting_status !== to, 'unchanged', 409)
  await commit(env, [
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ?)', order.id, order.version),
    stmt(env, 'UPDATE gk_work_orders SET waiting_status = ?, version = version + 1 WHERE id = ?', to, order.id),
  ], { actor: actor.id, action: 'workorder.waiting', subject: order.id, detail: { from: current?.label ?? null, to: target?.label ?? null } })
  return { id: order.id, status: target?.label ?? null }
}
