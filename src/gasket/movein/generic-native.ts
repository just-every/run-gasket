import type { D1Database, D1Sql, Json } from '../../modules/import-kit/src/d1/index'
import { NEXT_NUMBER } from '../core'
import { KINDS } from './target'
import { readExtra, extraMatch, extraWrite, extraAbsent, extraRemove } from './generic-extra-native'

export const sql = (query: string, ...params: unknown[]): D1Sql => ({ sql: query, params })
const OPEN = ['asset_id','location','title','description','kind','due_date','assignee_id','team_id','priority','estimate_minutes','status','created_by','created_at','version']
export const nativeKind = (kind: string) => kind === 'assets' ? 'asset' : kind === 'parts' ? 'part' : 'work'

export async function readNative(db: D1Database, kind: string, id: string): Promise<{ native: Record<string, Json>; changed: boolean } | undefined> {
  if(kind==='locations'||kind==='pms')return readExtra(db,kind,id)
  if (kind === 'open') {
    const row = await db.prepare('SELECT * FROM gk_work_orders WHERE id=?').bind(id).first<any>()
    if (!row) return
    const dependencies = await db.prepare(`SELECT (SELECT COUNT(*) FROM gk_audit WHERE subject=?)+(SELECT COUNT(*) FROM gk_comments WHERE work_order_id=?) AS n`).bind(id,id).first<any>()
    return { native: Object.fromEntries(OPEN.map(key => [key,row[key]])), changed: row.version !== 1 || dependencies!.n > 0 }
  }
  const row = await KINDS[nativeKind(kind)].read(db,id)
  if (!row) return
  const { customValues: _custom, dependents, ...native } = row.value
  if (kind === 'history') {
    const extra = (await db.prepare('SELECT source_system,details_json FROM gk_work_history WHERE id=?').bind(id).first<any>())!
    native.sourceSystem = extra.source_system; native.details = JSON.parse(extra.details_json)
  }
  if (kind === 'parts') native.category = (await db.prepare('SELECT category FROM gk_parts WHERE id=?').bind(id).first<any>())!.category
  return { native, changed: Boolean(dependents) }
}
export function nativeMatch(kind: string, id: string, value: Record<string, any>, revision: string): D1Sql {
  if(kind==='locations'||kind==='pms')return extraMatch(kind,id,value)
  if (kind !== 'open') {
    const match = KINDS[nativeKind(kind)].matches(value,id,revision)
    if (kind === 'history') return sql(`(${match.sql}) AND EXISTS(SELECT 1 FROM gk_work_history WHERE id=? AND source_system IS ? AND details_json IS ?)`,...match.params??[],id,value.sourceSystem,JSON.stringify(value.details))
    if (kind === 'parts') return sql(`(${match.sql}) AND EXISTS(SELECT 1 FROM gk_parts WHERE id=? AND category IS ?)`,...match.params??[],id,value.category)
    return match
  }
  return sql(`EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND ${OPEN.map(key=>`${key} IS ?`).join(' AND ')})`,id,...OPEN.map(key=>value[key]??null))
}
export function nativeWrite(kind: string, id: string, value: Record<string, any>, revision: string): D1Sql[] {
  if(kind==='locations'||kind==='pms')return extraWrite(kind,id,value)
  if (kind === 'open') return [sql("INSERT INTO gk_guard(code,ok) SELECT 'asset_changed',? IS NULL OR EXISTS(SELECT 1 FROM gk_assets WHERE id=? AND retired_at IS NULL)",value.asset_id,value.asset_id),sql(`INSERT INTO gk_work_orders(id,number,${OPEN.join(',')},created_via) VALUES(?,${NEXT_NUMBER},${OPEN.map(()=>'?').join(',')},'spreadsheet')`,id,...OPEN.map(key=>value[key]??null))]
  if(kind==='history')return [sql("INSERT INTO gk_guard(code,ok) SELECT 'asset_changed',EXISTS(SELECT 1 FROM gk_assets WHERE id=? AND retired_at IS NULL)",value.asset),...KINDS.work.write(value,id,revision)]
  return KINDS[nativeKind(kind)].write(value,id,revision,'spreadsheet')
}
export function nativeAbsent(kind: string, id: string): D1Sql {
  if(kind==='locations'||kind==='pms')return extraAbsent(kind,id)
  return kind === 'open' ? sql('NOT EXISTS(SELECT 1 FROM gk_work_orders WHERE id=?)',id) : KINDS[nativeKind(kind)].absent(id)
}
export function nativeRemove(kind: string, id: string): D1Sql[] {
  if(kind==='locations'||kind==='pms')return extraRemove(kind,id)
  return kind === 'open' ? [sql('DELETE FROM gk_work_field_values WHERE work_order_id=?',id),sql('DELETE FROM gk_work_orders WHERE id=? AND version=1',id)] : KINDS[nativeKind(kind)].remove(id)
}
