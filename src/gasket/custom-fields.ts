import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import { Input } from './input'
import { CUSTOM_TYPES, validateCustomValue, type CustomField } from './custom-validation'
export { CUSTOM_TYPES, validateCustomValue, type CustomField } from './custom-validation'
export type EntityType = 'asset' | 'part' | 'location'
export async function customFields(env: Bindings, entityType?: string, category?: string | null, includeRetired = false) {
  return all<CustomField>(env, `SELECT * FROM gk_custom_fields WHERE (? IS NULL OR entity_type=?) AND (?=1 OR retired=0) AND (? IS NULL OR scope!='category' OR category=? COLLATE NOCASE) ORDER BY name,id`, entityType ?? null, entityType ?? null, Number(includeRetired), category === undefined ? null : category ?? '', category ?? '')
}
export async function saveCustomField(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const id = input.text('id', { optional: true }) || newId(), existing = await one<CustomField>(env, 'SELECT * FROM gk_custom_fields WHERE id=?', id)
  const name = input.text('name', { max: 100 }), entityType = input.text('entityType'), type = input.text('type'), scope = input.text('scope')
  insist(['asset', 'part', 'location'].includes(entityType) && CUSTOM_TYPES.includes(type as any) && ['organization', 'site', 'category'].includes(scope), 'invalid_custom_definition')
  insist(entityType !== 'location' || scope !== 'category', 'location_category_not_supported')
  const category = scope === 'category' ? input.text('category', { max: 80 }) : null
  const options = ['single', 'multiple'].includes(type) ? input.text('options', { max: 2000 }).split(/\r?\n|,/).map(s => s.trim()).filter(Boolean) : null
  insist(!options || (options.length > 0 && options.length <= 100 && new Set(options).size === options.length), 'invalid_custom_options')
  const unit = type === 'number' ? input.text('unit', { max: 40 }) : null
  const bound = (key: string) => { if (!input.has(key)) return null; const n = Number(input.text(key)); insist(Number.isFinite(n), 'invalid_custom_range'); return n }
  const minimum = type === 'number' ? bound('minimum') : null, maximum = type === 'number' ? bound('maximum') : null
  insist(minimum === null || maximum === null || minimum <= maximum, 'invalid_custom_range')
  const required = Number(input.flag('required'))
  // A rename cannot reinterpret retained values or change their applicability.
  if (existing) {
    insist(!existing.retired, 'custom_field_retired', 409)
    insist(existing.entity_type === entityType && existing.type === type && existing.scope === scope && existing.category === category && existing.options === (options ? JSON.stringify(options) : null) && existing.unit === unit && existing.required === required && existing.minimum === minimum && existing.maximum === maximum, 'custom_definition_immutable', 409)
  }
  await commit(env, existing ? [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_custom_fields WHERE id=? AND revision=? AND retired=0)', id, input.integer('revision', { min: 1 })), stmt(env, 'UPDATE gk_custom_fields SET name=?,revision=revision+1 WHERE id=?', name, id)] : [stmt(env, 'INSERT INTO gk_custom_fields(id,name,entity_type,type,scope,category,required,options,unit,minimum,maximum,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', id, name, entityType, type, scope, category, required, options ? JSON.stringify(options) : null, unit, minimum, maximum, actor.id, now())], { actor: actor.id, action: 'customfield.save', subject: id, detail: { name, entityType, type, scope, category, required } })
  return { id, revision: existing ? existing.revision + 1 : 1 }
}
export async function retireCustomField(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const id = input.text('id')
  await commit(env, [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_custom_fields WHERE id=? AND revision=? AND retired=0)', id, input.integer('revision', { min: 1 })), stmt(env, 'UPDATE gk_custom_fields SET retired=1,revision=revision+1 WHERE id=?', id)], { actor: actor.id, action: 'customfield.retire', subject: id })
  return { id }
}
export async function customValues(env: Bindings, entityType: string, entityId: string, category: string | null = null) {
  const fields = await customFields(env, entityType, category, true)
  const values = await all(env, 'SELECT * FROM gk_custom_values WHERE entity_type=? AND entity_id=?', entityType, entityId)
  const history = await all(env, 'SELECT h.*,m.name AS actor FROM gk_custom_history h LEFT JOIN gk_members m ON m.id=h.changed_by WHERE entity_type=? AND entity_id=? ORDER BY seq DESC', entityType, entityId)
  return fields.filter(f => !f.retired || values.some(v => v.field_id === f.id)).map(f => {
    const row = values.find(v => v.field_id === f.id)
    return { ...f, value: row ? JSON.parse(row.value) : null, valueRevision: row?.revision ?? 0, history: history.filter(h => h.field_id === f.id).map(h => ({ ...h, value: JSON.parse(h.value) })) }
  })
}
export async function customStatements(env: Bindings, actor: Actor, input: Input, entityType: string, entityId: string, category: string | null, creating = false) {
  const fields = (await customFields(env, entityType, category)).filter(f => f.scope !== 'category' || f.category?.toLowerCase() === category?.toLowerCase())
  const supplied = input.has('customValues') ? input.json('customValues') : null
  insist(!supplied || (typeof supplied === 'object' && !Array.isArray(supplied)), 'invalid_custom_values')
  if (supplied) insist(Object.keys(supplied).every(k => fields.some(f => f.id === k)), 'custom_field_out_of_scope')
  const kept = creating ? [] : await all(env, 'SELECT * FROM gk_custom_values WHERE entity_type=? AND entity_id=?', entityType, entityId)
  const writes: D1PreparedStatement[] = []
  for (const f of fields) {
    const has = supplied ? Object.hasOwn(supplied, f.id) : input.present(`cf.${f.id}`)
    const previous = kept.find(v => v.field_id === f.id)
    const value = validateCustomValue(f, has ? supplied ? (supplied as any)[f.id] : input.text(`cf.${f.id}`, { optional: true, max: 2000 }) : previous ? JSON.parse(previous.value) : null)
    if (!has && !creating) continue
    if (value === null && !previous) continue
    const json = JSON.stringify(value), revision = (previous?.revision ?? 0) + 1
    writes.push(guard(env, 'custom_field_changed', 'EXISTS(SELECT 1 FROM gk_custom_fields WHERE id=? AND revision=? AND retired=0)', f.id, f.revision))
    if (previous) writes.push(guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_custom_values WHERE entity_type=? AND entity_id=? AND field_id=? AND revision=?)', entityType, entityId, f.id, previous.revision))
    else writes.push(guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM gk_custom_values WHERE entity_type=? AND entity_id=? AND field_id=?)', entityType, entityId, f.id))
    writes.push(stmt(env, 'INSERT INTO gk_custom_values(entity_type,entity_id,field_id,value,revision,changed_by,changed_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(entity_type,entity_id,field_id) DO UPDATE SET value=excluded.value,revision=excluded.revision,changed_by=excluded.changed_by,changed_at=excluded.changed_at', entityType, entityId, f.id, json, revision, actor.id, now()), stmt(env, 'INSERT INTO gk_custom_history(entity_type,entity_id,field_id,value,revision,changed_by,changed_at) VALUES(?,?,?,?,?,?,?)', entityType, entityId, f.id, json, revision, actor.id, now()))
  }
  return writes
}
export async function setCustomValues(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const entityType = input.text('entityType'), entityId = input.text('entityId')
  insist(['asset', 'part', 'location'].includes(entityType), 'invalid_custom_entity')
  const table = entityType === 'part' ? 'gk_parts' : entityType === 'location' ? 'gk_request_targets' : 'gk_assets'
  const record = await one(env, `SELECT * FROM ${table} WHERE id=?`, entityId)
  insist(record && (entityType !== 'location' || record.kind === 'location'), 'custom_record_not_found', 404)
  insist(!record.retired_at, 'record_retired', 409)
  await commit(env, await customStatements(env, actor, input, entityType, entityId, record.category ?? null), { actor: actor.id, action: 'customvalue.set', subject: entityId, detail: { entityType } })
  return { id: entityId }
}
