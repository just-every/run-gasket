import type { D1Database, D1TargetAdapter, Json, TargetRow } from '../../modules/import-kit/src/d1/index'
import { now } from '../core'
import { nativeAbsent, nativeMatch, nativeRemove, nativeWrite, readNative, sql } from './generic-native'

const entity = (kind: string) => kind === 'assets' ? 'asset' : kind === 'parts' ? 'part' : kind==='locations'?'location':null
async function custom(db: D1Database, kind: string, id: string) {
  const type = entity(kind)
  const rows = type ? (await db.prepare('SELECT field_id,value,revision FROM gk_custom_values WHERE entity_type=? AND entity_id=? ORDER BY field_id').bind(type,id).all<any>()).results
    : kind === 'open' ? (await db.prepare('SELECT field_id,value,1 AS revision FROM gk_work_field_values WHERE work_order_id=? ORDER BY field_id').bind(id).all<any>()).results : []
  return { values: Object.fromEntries(rows.map(r=>[r.field_id,type ? JSON.parse(r.value) : r.value])), changed: rows.some(r=>r.revision!==1) }
}
export function genericTargets(importer: string): D1TargetAdapter {
  return {
    async read(db,destination,kind,id) {
      const row = await db.prepare('SELECT * FROM gk_spreadsheet_rows WHERE id=? AND kind=?').bind(id,kind).first<any>()
      if (!row) return
      const actual = await readNative(db,kind,id)
      if (!actual) return
      const fields = await custom(db,kind,id)
      return { destination,targetKind:kind,targetId:id,revision:row.import_revision,value:{ native:actual.native,customValues:fields.values,sourceId:row.source_id,source:JSON.parse(row.source_json),...(actual.changed||fields.changed?{changed:true}:{}) } }
    },
    matches(row,_destination,kind,id) {
      const absent=nativeAbsent(kind,id)
      if (!row) return sql(`NOT EXISTS(SELECT 1 FROM gk_spreadsheet_rows WHERE id=?) AND (${absent.sql})`,id,...absent.params??[])
      const v=row.value as any
      if(v.changed) return sql('0')
      const match=nativeMatch(kind,id,kind==='assets'?{...v.native,customValues:v.customValues}:v.native,row.revision),type=entity(kind)
      const table=type?'gk_custom_values':'gk_work_field_values',where=type?'entity_type=? AND entity_id=?':'work_order_id=?',args=type?[type,id]:[id]
      const values=JSON.stringify(Object.fromEntries(Object.entries(v.customValues).map(([key,value])=>[key,type?JSON.stringify(value):value])))
      return sql(`EXISTS(SELECT 1 FROM gk_spreadsheet_rows WHERE id=? AND kind=? AND source_id IS ? AND source_json IS ? AND import_revision IS ?) AND (${match.sql}) AND (SELECT COUNT(*) FROM ${table} WHERE ${where})=? AND NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM ${table} WHERE ${where} AND field_id=e.key AND value=e.value))`,id,kind,v.sourceId,JSON.stringify(v.source),row.revision,...match.params??[],...args,Object.keys(v.customValues).length,values,...args)
    },
    write(row) {
      const v=row.value as any,id=row.targetId,kind=row.targetKind,type=entity(kind),at=now()
      const writes=[...nativeWrite(kind,id,v.native,row.revision),sql('INSERT INTO gk_spreadsheet_rows(id,kind,source_id,source_json,import_revision) VALUES(?,?,?,?,?)',id,kind,v.sourceId,JSON.stringify(v.source),row.revision)]
      if(type)writes.push(sql(`INSERT INTO gk_guard(code,ok) SELECT 'custom_field_changed',NOT EXISTS(SELECT 1 FROM gk_custom_fields f WHERE f.entity_type=? AND f.retired=0 AND f.required=1 AND (f.scope!='category' OR f.category=? COLLATE NOCASE) AND NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE e.key=f.id))`,type,v.native.category??null,JSON.stringify(v.customValues)))
      for(const [field,value]of Object.entries(v.customValues)) {
        if(type)writes.push(sql(`INSERT INTO gk_guard(code,ok) SELECT 'custom_field_changed',EXISTS(SELECT 1 FROM gk_custom_fields WHERE id=? AND entity_type=? AND retired=0 AND (scope!='category' OR category=? COLLATE NOCASE))`,field,type,v.native.category??null),sql('INSERT INTO gk_custom_values(entity_type,entity_id,field_id,value,revision,changed_by,changed_at) VALUES(?,?,?,?,1,?,?)',type,id,field,JSON.stringify(value),importer,at),sql('INSERT INTO gk_custom_history(entity_type,entity_id,field_id,value,revision,changed_by,changed_at) VALUES(?,?,?,?,1,?,?)',type,id,field,JSON.stringify(value),importer,at))
        else writes.push(sql(`INSERT INTO gk_guard(code,ok) SELECT 'custom_field_changed',EXISTS(SELECT 1 FROM gk_work_fields WHERE id=? AND retired_at IS NULL)`,field),sql('INSERT INTO gk_work_field_values(work_order_id,field_id,value,set_by,set_at) VALUES(?,?,?,?,?)',id,field,value,importer,at))
      }
      if(kind==='open')writes.push(sql(`INSERT INTO gk_guard(code,ok) SELECT 'assignment_changed',NOT EXISTS(SELECT 1 FROM gk_work_orders w WHERE w.id=? AND w.assignee_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=w.assignee_id AND m.status='active' AND o.status='active' AND m.role IN ('owner','lead','maintainer')) OR (w.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM gk_team_members t WHERE t.team_id=w.team_id AND t.member_id=w.assignee_id))))`,id))
      return writes
    },
    remove(_destination,kind,id) {
      const type=entity(kind)
      return [...type?[sql('DELETE FROM gk_custom_values WHERE entity_type=? AND entity_id=?',type,id)]:[],...nativeRemove(kind,id),sql('DELETE FROM gk_spreadsheet_rows WHERE id=? AND kind=?',id,kind)]
    },
    async list(db,destination) {
      const rows:TargetRow[]=[]
      for(const r of (await db.prepare('SELECT id,kind FROM gk_spreadsheet_rows ORDER BY id').all<any>()).results){const row=await this.read(db,destination,r.kind,r.id);if(row)rows.push(row)}
      return rows
    },
    matchesCount:count=>sql('(SELECT COUNT(*) FROM gk_spreadsheet_rows)=?',count),
  }
}
