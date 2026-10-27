import type { D1Database, D1Sql, Json } from '../../modules/import-kit/src/d1/index'
import { insist, now } from '../core'
import type { ExtraKind } from './generic-extra'

const sql = (query: string, ...params: unknown[]): D1Sql => ({ sql: query, params })
const LOCATION = ['portal_id', 'kind', 'asset_id', 'name', 'retired_at', 'created_by']
const PM = ['asset_id', 'location', 'checklist_id', 'title', 'every_days', 'meter_id', 'every_units', 'next_due_date', 'next_due_meter',
  'assignee_id', 'active', 'revision', 'created_by', 'cadence', 'months', 'weekdays', 'observe_closures', 'max_defer_days',
  'nominal_date', 'combine', 'trigger_when', 'trigger_value', 'reset_value', 'sustain_minutes', 'trigger_fired_on', 'team_id',
  'estimate_minutes', 'tools', 'calibration', 'grace_days']
function schema(kind: ExtraKind) {
  insist(kind === 'locations' || kind === 'pms', 'invalid_entity')
  return kind === 'locations' ? { table: 'gk_request_targets', fields: LOCATION } : { table: 'gk_schedules', fields: PM }
}

/** Every native dependent blocks undo; later audit records also catch modifications restored to old values. */
function untouched(kind: ExtraKind, id: string): D1Sql {
  const dependencies = kind === 'locations' ? [
    ['gk_requests', 'target_id=?', [id]],
    ['gk_audit', 'subject=?', [id]],
    ['gk_custom_history', "entity_type='location' AND entity_id=? AND revision>1", [id]],
  ] as const : [
    ['gk_work_orders', 'schedule_id=?', [id]],
    ['gk_schedule_exceptions', 'schedule_id=?', [id]],
    ['gk_nested_maps', 'higher=? OR lower=?', [id, id]],
    ['gk_calibration_certificates', 'schedule_id=?', [id]],
    ['gk_interval_limits', 'schedule_id=?', [id]],
    ['gk_interval_changes', 'schedule_id=?', [id]],
    ['gk_pm_bindings', 'schedule_id=?', [id]],
    ['gk_proposals', "kind='interval' AND json_extract(payload_json,'$.schedule')=?", [id]],
    ['gk_audit', 'subject=?', [id]],
  ] as const
  return sql(dependencies.map(([table, where]) => `NOT EXISTS(SELECT 1 FROM ${table} WHERE ${where})`).join(' AND '),
    ...dependencies.flatMap(([, , args]) => [...args]))
}

export async function readExtra(db: D1Database, kind: ExtraKind, id: string): Promise<{ native: Record<string, Json>; changed: boolean } | undefined> {
  const { table, fields } = schema(kind)
  const row = await db.prepare(`SELECT ${fields.join(',')} FROM ${table} WHERE id=?`).bind(id).first<Record<string, Json>>()
  if (!row) return
  const clean = untouched(kind, id)
  const marker = await db.prepare(`SELECT (${clean.sql}) AS clean`).bind(...clean.params ?? []).first<{ clean: number }>()
  return { native: Object.fromEntries(fields.map(field => [field, row[field] ?? null])), changed: marker?.clean !== 1 || (kind === 'pms' && row.revision !== 1) }
}

export function extraMatch(kind: ExtraKind, id: string, value: Record<string, Json>): D1Sql {
  const { table, fields } = schema(kind), clean = untouched(kind, id)
  return sql(`EXISTS(SELECT 1 FROM ${table} WHERE id=? AND ${fields.map(field => `${field} IS ?`).join(' AND ')}) AND (${clean.sql})`,
    id, ...fields.map(field => value[field] ?? null), ...clean.params ?? [])
}

/** Insert only: the import journal handles replay. No generation, publication or notifications. */
export function extraWrite(kind: ExtraKind, id: string, value: Record<string, Json>): D1Sql[] {
  const { table, fields } = schema(kind)
  const writes: D1Sql[] = []
  if (kind === 'locations') {
    insist(value.kind === 'location' && value.asset_id === null && value.retired_at === null, 'invalid_location_import')
    writes.push(sql(`INSERT INTO gk_guard(code,ok) SELECT 'authenticated_portal_required',EXISTS(SELECT 1 FROM gk_request_portals WHERE id=? AND mode='authenticated' AND enabled=1)`, value.portal_id))
  } else {
    insist(value.meter_id === null && value.every_days !== null && value.revision === 1 && (value.active === 0 || value.active === 1), 'invalid_calendar_import')
    writes.push(sql(`INSERT INTO gk_guard(code,ok) SELECT 'schedule_dependencies_changed',
      (? IS NULL OR EXISTS(SELECT 1 FROM gk_assets WHERE id=? AND retired_at IS NULL))
      AND EXISTS(SELECT 1 FROM gk_checklists WHERE id=?)
      AND (? IS NULL OR EXISTS(SELECT 1 FROM gk_teams WHERE id=?))
      AND (? IS NULL OR EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=? AND m.status='active' AND o.status='active' AND m.role IN ('owner','lead','maintainer')))
      AND (? IS NULL OR ? IS NULL OR EXISTS(SELECT 1 FROM gk_team_members WHERE member_id=? AND team_id=?))`,
    value.asset_id, value.asset_id, value.checklist_id, value.team_id, value.team_id, value.assignee_id, value.assignee_id,
    value.assignee_id, value.team_id, value.assignee_id, value.team_id))
  }
  writes.push(sql(`INSERT INTO ${table}(id,${fields.join(',')},created_at) VALUES(?,${fields.map(() => '?').join(',')},?)`,
    id, ...fields.map(field => value[field] ?? null), now()))
  return writes
}

export function extraAbsent(kind: ExtraKind, id: string): D1Sql {
  return sql(`NOT EXISTS(SELECT 1 FROM ${schema(kind).table} WHERE id=?)`, id)
}
export function extraRemove(kind: ExtraKind, id: string): D1Sql[] {
  const clean = untouched(kind, id)
  return [sql(`INSERT INTO gk_guard(code,ok) SELECT 'import_target_changed',(${clean.sql})`, ...clean.params ?? []),
    sql(`DELETE FROM ${schema(kind).table} WHERE id=?${kind === 'pms' ? ' AND revision=1' : " AND kind='location'"}`, id)]
}
