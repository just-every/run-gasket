// The import kit's native targets: assets, meters, readings, parts (with
// their opening stock) and completed work history (MIG-002), written into Gasket's own tables with origin 'import'.
// A row that a person has since edited or built on carries `dependents`, so
// undo refuses to remove it: reverse that work in Gasket first.
import type { D1Database, D1Sql, D1TargetAdapter, Json, TargetRow } from '../../modules/import-kit/src/d1/index'
import { matchAssetCustom, readAssetCustom, writeAssetCustom } from './custom-target'

const sql = (text: string, ...params: unknown[]): D1Sql => ({ sql: text, params })

interface Kind {
  read(db: D1Database, id: string): Promise<{ value: Record<string, Json>; revision: string } | undefined>
  matches(value: Record<string, any>, id: string, revision: string): D1Sql
  absent(id: string): D1Sql
  write(value: Record<string, any>, id: string, revision: string, source?: string): D1Sql[]
  remove(id: string): D1Sql[]
  ids(db: D1Database): Promise<string[]>
  count: string
}

const eq = (pairs: [string, unknown][]) => ({ text: pairs.map(([column]) => `${column} IS ?`).join(' AND '), params: pairs.map(([, value]) => value ?? null) })
const withDependents = (value: Record<string, Json>, dependents: number) => dependents ? { ...value, dependents } : value
const idsOf = async (db: D1Database, table: string) => (await db.prepare(`SELECT id FROM ${table} WHERE origin = 'import' ORDER BY id`).all<{ id: string }>()).results.map(row => row.id)
const repeat = (expression: string, id: string) => Array((expression.match(/\?/g) ?? []).length).fill(id)
async function dependents(db: D1Database, expression: string, id: string) {
  return (await db.prepare(`SELECT ${expression} AS n`).bind(...repeat(expression, id)).first<{ n: number }>())!.n
}
const free = (expression: string, id: string) => ({ text: `${expression} = 0`, params: repeat(expression, id) })

// Later Gasket records that rely on an imported row.
// Work history moved in by a later move-in (another date range) depends on the asset; its own move-in's history does not.
const ASSET_DEPENDENTS = `((SELECT COUNT(*) FROM gk_work_orders WHERE asset_id = ?) + (SELECT COUNT(*) FROM gk_schedules WHERE asset_id = ?) + (SELECT COUNT(*) FROM gk_meters WHERE asset_id = ? AND origin = 'native')
  + (SELECT COUNT(*) FROM gk_sightings WHERE asset_id = ?) + (SELECT COUNT(*) FROM gk_asset_versions WHERE asset_id = ?) + (SELECT COUNT(*) FROM gk_downtime WHERE asset_id = ?) + (SELECT COUNT(*) FROM gk_assets WHERE id = ? AND retired_at IS NOT NULL)
  + (SELECT COUNT(*) FROM gk_custom_values WHERE entity_type='asset' AND entity_id=? AND revision>1)
  + (SELECT COUNT(*) FROM gk_custom_history WHERE entity_type='asset' AND entity_id=? AND revision>1)
  + (SELECT COUNT(*) FROM gk_work_history h WHERE h.asset_id = ? AND NOT EXISTS(SELECT 1 FROM ik_provenance pw JOIN ik_provenance pa ON pa.job_id = pw.job_id AND pa.target_kind = 'asset' AND pa.target_id = h.asset_id AND pa.reversed = 0 WHERE pw.target_kind = 'work' AND pw.target_id = h.id AND pw.reversed = 0)))`
const METER_DEPENDENTS = "((SELECT COUNT(*) FROM gk_readings WHERE meter_id = ? AND origin = 'native') + (SELECT COUNT(*) FROM gk_schedules WHERE meter_id = ?) + (SELECT COUNT(*) FROM gk_meter_adjustments WHERE meter_id = ?))"
const READING_DEPENDENTS = '(SELECT COUNT(*) FROM gk_meter_adjustments WHERE reading_id = ?)'
const PART_DEPENDENTS = "((SELECT COUNT(*) FROM gk_part_moves WHERE part_id = ? AND origin = 'native') + (SELECT COUNT(*) FROM gk_part_canonical WHERE part_id=? OR canonical_id=?) + (SELECT COUNT(*) FROM gk_supplier_items WHERE part_id=?))"
const ASSET_FIELDS = ['tag', 'name', 'serial', 'location', 'custodian', 'category', 'criticality', 'notes'] as const

const asset: Kind = {
  async read(db, id) {
    const row = await db.prepare("SELECT * FROM gk_assets WHERE id = ? AND origin = 'import'").bind(id).first<any>()
    return row ? { value: withDependents({ ...Object.fromEntries(ASSET_FIELDS.map(field => [field, row[field]])), ...await readAssetCustom(db, id) }, await dependents(db, ASSET_DEPENDENTS, id)), revision: row.import_revision } : undefined
  },
  matches(value, id, revision) {
    const main = eq([...ASSET_FIELDS.map(field => [field, value[field]] as [string, unknown]), ['import_revision', revision], ['revision', 1]]), rest = free(ASSET_DEPENDENTS, id)
    const custom = matchAssetCustom(value, id)
    return sql(`EXISTS(SELECT 1 FROM gk_assets WHERE id = ? AND origin = 'import' AND ${main.text}) AND ${rest.text} AND ${custom.sql}`, id, ...main.params, ...rest.params, ...(custom.params ?? []))
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM gk_assets WHERE id = ?)', id),
  write: (value, id, revision) => [sql(`INSERT INTO gk_assets (id, ${ASSET_FIELDS.join(', ')}, origin, import_revision, created_at, updated_at) VALUES (?, ${ASSET_FIELDS.map(() => '?').join(', ')}, 'import', ?, ?, ?)`, id, ...ASSET_FIELDS.map(field => value[field] ?? null), revision, Date.now(), Date.now())],
  remove: id => [sql("DELETE FROM gk_custom_values WHERE entity_type='asset' AND entity_id=? AND EXISTS(SELECT 1 FROM gk_assets WHERE id=? AND origin='import')", id, id), sql("DELETE FROM gk_assets WHERE id = ? AND origin = 'import'", id)],
  ids: db => idsOf(db, 'gk_assets'),
  count: "(SELECT COUNT(*) FROM gk_assets WHERE origin = 'import')",
}

const meter: Kind = {
  async read(db, id) {
    const row = await db.prepare("SELECT * FROM gk_meters WHERE id = ? AND origin = 'import'").bind(id).first<any>()
    return row ? { value: withDependents({ asset: row.asset_id, name: row.name, unit: row.unit, kind: row.kind }, await dependents(db, METER_DEPENDENTS, id)), revision: row.import_revision } : undefined
  },
  matches(value, id, revision) {
    const main = eq([['asset_id', value.asset], ['name', value.name], ['unit', value.unit], ['kind', value.kind], ['import_revision', revision], ['revision', 1]]), rest = free(METER_DEPENDENTS, id)
    return sql(`EXISTS(SELECT 1 FROM gk_meters WHERE id = ? AND origin = 'import' AND ${main.text}) AND ${rest.text}`, id, ...main.params, ...rest.params)
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM gk_meters WHERE id = ?)', id),
  write: (value, id, revision) => [sql("INSERT INTO gk_meters (id, asset_id, name, unit, kind, origin, import_revision, created_at) VALUES (?, ?, ?, ?, ?, 'import', ?, ?)", id, value.asset, value.name, value.unit, value.kind, revision, Date.now())],
  remove: id => [sql("DELETE FROM gk_meters WHERE id = ? AND origin = 'import'", id)],
  ids: db => idsOf(db, 'gk_meters'),
  count: "(SELECT COUNT(*) FROM gk_meters WHERE origin = 'import')",
}

const reading: Kind = {
  async read(db, id) {
    const row = await db.prepare("SELECT * FROM gk_readings WHERE id = ? AND origin = 'import'").bind(id).first<any>()
    return row ? { value: withDependents({ meter: row.meter_id, asset: row.asset_id, value: row.value, takenOn: row.taken_on, enteredBy: row.entered_by }, await dependents(db, READING_DEPENDENTS, id)), revision: row.import_revision } : undefined
  },
  matches(value, id, revision) {
    const main = eq([['meter_id', value.meter], ['asset_id', value.asset], ['value', value.value], ['taken_on', value.takenOn], ['entered_by', value.enteredBy], ['import_revision', revision]]), rest = free(READING_DEPENDENTS, id)
    return sql(`EXISTS(SELECT 1 FROM gk_readings WHERE id = ? AND origin = 'import' AND ${main.text}) AND ${rest.text}`, id, ...main.params, ...rest.params)
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM gk_readings WHERE id = ?)', id),
  write: (value, id, revision) => [sql("INSERT INTO gk_readings (id, meter_id, asset_id, value, taken_on, entered_by, entered_at, origin, import_revision) VALUES (?, ?, ?, ?, ?, ?, ?, 'import', ?)", id, value.meter, value.asset, value.value, value.takenOn, value.enteredBy, Date.now(), revision)],
  remove: id => [sql("DELETE FROM gk_readings WHERE id = ? AND origin = 'import'", id)],
  ids: db => idsOf(db, 'gk_readings'),
  count: "(SELECT COUNT(*) FROM gk_readings WHERE origin = 'import')",
}

const part: Kind = {
  async read(db, id) {
    const row = await db.prepare("SELECT p.*, (SELECT quantity_milli FROM gk_part_moves WHERE id = p.id || ':opening') AS opening FROM gk_parts p WHERE p.id = ? AND p.origin = 'import'").bind(id).first<any>()
    return row ? { value: withDependents({ number: row.number, name: row.name, unit: row.unit, minimumMilli: row.minimum_milli, location: row.location, openingMilli: row.opening }, await dependents(db, PART_DEPENDENTS, id)), revision: row.import_revision } : undefined
  },
  matches(value, id, revision) {
    const main = eq([['number', value.number], ['name', value.name], ['unit', value.unit], ['minimum_milli', value.minimumMilli], ['location', value.location], ['import_revision', revision], ['revision', 1]]), rest = free(PART_DEPENDENTS, id)
    return sql(`EXISTS(SELECT 1 FROM gk_parts WHERE id = ? AND origin = 'import' AND ${main.text}) AND (SELECT quantity_milli FROM gk_part_moves WHERE id = ?) IS ? AND ${rest.text}`, id, ...main.params, `${id}:opening`, value.openingMilli, ...rest.params)
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM gk_parts WHERE id = ?) AND NOT EXISTS(SELECT 1 FROM gk_part_moves WHERE id = ?)', id, `${id}:opening`),
  write: (value, id, revision, source='MaintainX') => [
    sql("INSERT INTO gk_parts (id, number, name, unit, minimum_milli, location, category, origin, import_revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'import', ?, ?)", id, value.number, value.name, value.unit, value.minimumMilli, value.location, value.category??null, revision, Date.now()),
    sql("INSERT INTO gk_part_moves (id, part_id, kind, quantity_milli, note, actor, at, origin) VALUES (?, ?, 'opening', ?, ?, 'import', ?, 'import')", `${id}:opening`, id, value.openingMilli, `Opening stock from ${source}`, Date.now()),
  ],
  remove: id => [sql("DELETE FROM gk_part_aliases WHERE part_id=? AND kind='part' AND EXISTS(SELECT 1 FROM gk_parts WHERE id=? AND origin='import')",id,id),sql("DELETE FROM gk_part_moves WHERE id = ? AND origin = 'import'", `${id}:opening`), sql("DELETE FROM gk_parts WHERE id = ? AND origin = 'import'", id)],
  ids: db => idsOf(db, 'gk_parts'),
  count: "(SELECT COUNT(*) FROM gk_parts WHERE origin = 'import')",
}

const WORK_FIELDS: [string, string][] = [['asset', 'asset_id'], ['sourceRef', 'source_ref'], ['title', 'title'], ['kind', 'kind'], ['description', 'description'], ['completedOn', 'completed_on'], ['completedBy', 'completed_by'],
  ['assignedTo', 'assigned_to'], ['categories', 'categories'], ['recurrence', 'recurrence'], ['partsCents', 'parts_cents'], ['laborCents', 'labor_cents'], ['otherCents', 'other_cents'], ['failureMode', 'failure_mode']]

const work: Kind = {
  async read(db, id) {
    const row = await db.prepare('SELECT * FROM gk_work_history WHERE id = ?').bind(id).first<any>()
    return row ? { value: Object.fromEntries(WORK_FIELDS.map(([key, column]) => [key, row[column]])), revision: row.import_revision } : undefined
  },
  matches(value, id, revision) {
    const main = eq([...WORK_FIELDS.map(([key, column]) => [column, value[key]] as [string, unknown]), ['import_revision', revision]])
    return sql(`EXISTS(SELECT 1 FROM gk_work_history WHERE id = ? AND ${main.text})`, id, ...main.params)
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM gk_work_history WHERE id = ?)', id),
  write: (value, id, revision) => [sql(`INSERT INTO gk_work_history (id, ${WORK_FIELDS.map(([, column]) => column).join(', ')}, import_revision, created_at,source_system,details_json) VALUES (?, ${WORK_FIELDS.map(() => '?').join(', ')}, ?, ?,?,?)`,
    id, ...WORK_FIELDS.map(([key]) => value[key] ?? null), revision, Date.now(),value.sourceSystem??'MaintainX',value.details===undefined?null:JSON.stringify(value.details))],
  remove: id => [sql('DELETE FROM gk_work_history WHERE id = ?', id)],
  ids: db => idsOf(db, 'gk_work_history'),
  count: '(SELECT COUNT(*) FROM gk_work_history)',
}

export const KINDS: Record<string, Kind> = { asset, meter, reading, part, work }
const kindOf = (name: string) => { const kind = Object.hasOwn(KINDS, name) ? KINDS[name] : undefined; if (!kind) throw new Error(`TARGET_KIND_UNKNOWN: ${name}`); return kind }

export const gasketTargets = (importer: string): D1TargetAdapter => ({
  async read(db, destination, kind, id) {
    const row = await kindOf(kind).read(db, id)
    return row ? { destination, targetKind: kind, targetId: id, value: row.value as Json, revision: row.revision } : undefined
  },
  matches(row, _destination, kind, id) {
    const value = row?.value as Record<string, any> | undefined
    if (row && value && 'dependents' in value) return sql('0')
    return row ? kindOf(kind).matches(value!, id, row.revision) : kindOf(kind).absent(id)
  },
  write(row: TargetRow) {
    const value = row.value as Record<string, any>
    return [...kindOf(row.targetKind).write(value, row.targetId, row.revision), ...(row.targetKind === 'asset' ? writeAssetCustom(value, row.targetId, importer) : [])]
  },
  remove(_destination, kind, id) {
    return kindOf(kind).remove(id)
  },
  async list(db, destination) {
    const rows: TargetRow[] = []
    for (const [name, kind] of Object.entries(KINDS)) for (const id of await kind.ids(db)) rows.push((await this.read(db, destination, name, id))!)
    return rows
  },
  matchesCount(count) {
    return sql(`(${Object.values(KINDS).map(kind => kind.count).join(' + ')}) = ?`, count)
  },
})
