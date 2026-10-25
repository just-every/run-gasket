// Custom values are owned by the imported asset's target snapshot, so replay
// and undo use the import kit's existing atomic guards and provenance.
import type { D1Database, D1Sql, Json } from '../../modules/import-kit/src/d1/index'
import { now } from '../core'

const sql = (text: string, ...params: unknown[]): D1Sql => ({ sql: text, params })

export async function readAssetCustom(db: D1Database, id: string): Promise<Record<string, Json>> {
  const rows = (await db.prepare("SELECT field_id,value FROM gk_custom_values WHERE entity_type='asset' AND entity_id=? ORDER BY field_id").bind(id).all<{ field_id: string; value: string }>()).results
  return rows.length ? { customValues: Object.fromEntries(rows.map(row => [row.field_id, JSON.parse(row.value) as Json])) } : {}
}

export function matchAssetCustom(value: Record<string, any>, id: string): D1Sql {
  const entries = Object.entries(value.customValues ?? {})
  const json = JSON.stringify(Object.fromEntries(entries.map(([field, v]) => [field, JSON.stringify(v)])))
  return sql(`(SELECT COUNT(*) FROM gk_custom_values WHERE entity_type='asset' AND entity_id=?)=?
    AND NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM gk_custom_values v WHERE v.entity_type='asset' AND v.entity_id=? AND v.field_id=e.key AND v.value=e.value AND v.revision=1))`, id, entries.length, json, id)
}

export function writeAssetCustom(value: Record<string, any>, id: string, importer: string): D1Sql[] {
  const values = value.customValues ?? {}, entries = Object.entries(values), at = now()
  const writes = [sql(`INSERT INTO gk_guard(code,ok) SELECT 'custom_field_changed', CASE WHEN NOT EXISTS(
    SELECT 1 FROM gk_custom_fields f WHERE f.entity_type='asset' AND f.retired=0 AND f.required=1
    AND (f.scope!='category' OR f.category=? COLLATE NOCASE) AND NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE e.key=f.id)
  ) THEN 1 ELSE 0 END`, value.category ?? null, JSON.stringify(values))]
  for (const [field, v] of entries) {
    const json = JSON.stringify(v)
    writes.push(sql(`INSERT INTO gk_guard(code,ok) SELECT 'custom_field_changed',CASE WHEN EXISTS(
      SELECT 1 FROM gk_custom_fields WHERE id=? AND entity_type='asset' AND retired=0 AND (scope!='category' OR category=? COLLATE NOCASE)
    ) THEN 1 ELSE 0 END`, field, value.category ?? null),
    sql("INSERT INTO gk_custom_values(entity_type,entity_id,field_id,value,revision,changed_by,changed_at) VALUES('asset',?,?,?,1,?,?)", id, field, json, importer, at),
    sql("INSERT INTO gk_custom_history(entity_type,entity_id,field_id,value,revision,changed_by,changed_at) VALUES('asset',?,?,?,1,?,?)", id, field, json, importer, at))
  }
  return writes
}
