// Move-in kit 1: MaintainX. Reads MaintainX's asset export, part export,
// manual meter-reading export and work-order export (MIG-002 history) (CSV, MaintainX's documented column names)
// through Base's import kit: a dry run that writes nothing, apply bound to the
// reviewed fingerprint, a durable journal with retained originals, re-import
// that adds nothing, and strict undo that removes only an untouched import.
import type { Bindings } from '../../auth.server'
import { applyD1ImportBatches, canonicalJson, createD1ImportJob, planD1Import, resumeD1Import, sha256, undoD1Import, type D1ImportContext, type Json, type SourceBundle, type SourceRecord, type TargetEffect } from '../../modules/import-kit/src/d1/index'
import { sourceIdentity } from '../../modules/import-kit/src/provenance/identity'
import { capabilitySql, requireCapability, type Actor } from '../actor'
import { codeList, matchCode } from '../codes'
import { GasketError, all, commit, insist, one, now, stmt, sha256Hex } from '../core'
import { isDate, localNow } from '../dates'
import type { Input } from '../input'
import { compareMeter, meterNumber, toMilli } from '../quantity'
import { columns, readCsv } from './csv'
import { WORK_NEEDS, mapWork } from './maintainx-work'
import { assetCustomMapping, type CustomMapping } from './maintainx-custom'
import { KINDS, gasketTargets } from './target'

const namespace = 'maintainx', mappingVersion = 'maintainx-csv-1', destination = 'register'
const FILE_BYTES = 4_000_000
const FILES = ['assets', 'parts', 'readings', 'work'] as const
type FileName = typeof FILES[number]
const NEEDS: Record<FileName, string[]> = {
  assets: ['ID', 'Name'],
  parts: ['ID', 'Name', 'Quantity'],
  readings: ['Meter ID', 'Meter Name', 'Asset Name', 'Unit of Measure (U/M)', 'Reading', 'Entered On'],
  work: WORK_NEEDS,
}
const COUNTER_UNITS = /^(h|hr|hrs|hour|hours|km|kms|kilometres|kilometers|mi|mile|miles|cycle|cycles|count|counts|start|starts)$/i

export type DateOrder = 'MDY' | 'DMY'

/** MaintainX "Entered On": ISO, or month-first / day-first with optional time and AM/PM. */
export function parseEnteredOn(text: string, order: DateOrder): string | null {
  const value = text.trim()
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/)
  const pad = (n: number) => String(n).padStart(2, '0')
  const build = (y: number, m: number, d: number, h: number, min: number) => { const date = `${y}-${pad(m)}-${pad(d)}`; return isDate(date) && h < 24 && min < 60 ? `${date}T${pad(h)}:${pad(min)}` : null }
  if (iso) return build(+iso[1], +iso[2], +iso[3], +iso[4], +iso[5])
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?$/)
  if (!us) return null
  let hour = us[4] ? Number(us[4]) : 0
  if (us[6]) { if (hour === 12) hour = 0; if (/p/i.test(us[6])) hour += 12 }
  const [m, d] = order === 'MDY' ? [+us[1], +us[2]] : [+us[2], +us[1]]
  return build(+us[3], m, d, hour, us[5] ? Number(us[5]) : 0)
}

interface KitFile { filename: string; bytes: Uint8Array }

async function kitFile(input: Input, name: FileName, optional: boolean): Promise<KitFile | null> {
  if (input.has(`${name}_b64`)) {
    const base64 = input.text(`${name}_b64`, { max: 6_000_000 })
    insist(/^[A-Za-z0-9+/]*={0,2}$/.test(base64), 'invalid_base64')
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))
    insist(bytes.length > 0 && bytes.length <= FILE_BYTES, 'file_size')
    return { filename: input.text(`${name}_name`, { max: 200 }), bytes }
  }
  return await input.file(name, { optional, maxBytes: FILE_BYTES })
}

const hex = (text: string) => sha256(text)
export const targetIds = {
  asset: (id: string) => hex(`gasket:maintainx:asset:${id}`),
  meter: (id: string) => hex(`gasket:maintainx:meter:${id}`),
  reading: (meter: string, row: string) => hex(`gasket:maintainx:reading:${meter}:${row}`),
  part: (id: string) => hex(`gasket:maintainx:part:${id}`),
  work: (id: string) => hex(`gasket:maintainx:work:${id}`),
}

export interface Preview {
  fingerprint: string
  counts: Json
  create: { assets: number; meters: number; readings: number; parts: number; work: number }
  /** Rows an earlier apply already moved in with the same values: applying again leaves them as they are. */
  unchanged: number
  rejected: { location: string; reason: string }[]
  attention: { location: string; reason: string }[]
  gaps: string[]
  carry: Record<string, string>
  customMapping: CustomMapping
}

/** Import authority is checked in SQL on every batch: a live session whose member may run imports. */
function importContext(actor: Actor, env: Bindings): D1ImportContext {
  return { destination, namespace, mappingVersion, storage: { database: env.DB as never, targets: gasketTargets(actor.id) }, authorization: { principalId: `role:import`, predicate: () => capabilitySql(actor.sessionId, 'import.run') }, batchSize: 25 }
}


/** Counter readings checked in date order, whatever order the export lists them in: each one
 * against the readings dated before and after it, from the file and already in Gasket.
 * Returns the reason each refused row (by row number) is refused. */
function counterOrder(table: { rows: { cells: string[]; row: number }[]; read: ReturnType<typeof columns> }, order: DateOrder, today: string, native: { meter_id: string; value: string; takenOn: string }[]) {
  const refused = new Map<number, string>(), byMeter = new Map<string, { row: number; value: string; takenOn: string }[]>()
  for (const { cells, row } of table.rows) {
    const meterId = table.read.get(cells, 'Meter ID'), takenOn = parseEnteredOn(table.read.get(cells, 'Entered On'), order)
    if (!meterId || !takenOn || takenOn > today) continue
    let value: string
    try { value = meterNumber(table.read.get(cells, 'Reading')) } catch { continue }
    byMeter.set(meterId, [...(byMeter.get(meterId) ?? []), { row, value, takenOn }])
  }
  for (const [meterId, rows] of byMeter) {
    const first = table.rows.find(item => table.read.get(item.cells, 'Meter ID') === meterId)!
    if (!COUNTER_UNITS.test(table.read.get(first.cells, 'Unit of Measure (U/M)') || 'units')) continue
    const kept = native.filter(reading => reading.meter_id === targetIds.meter(meterId))
    const accepted: { value: string; takenOn: string }[] = []
    for (const reading of [...rows].sort((a, b) => a.takenOn.localeCompare(b.takenOn) || a.row - b.row)) {
      const earlier = [...kept, ...accepted].filter(other => other.takenOn <= reading.takenOn).reduce<{ value: string } | null>((max, other) => !max || compareMeter(other.value, max.value) > 0 ? other : max, null)
      const later = kept.filter(other => other.takenOn > reading.takenOn).reduce<{ value: string } | null>((min, other) => !min || compareMeter(other.value, min.value) < 0 ? other : min, null)
      if (earlier && compareMeter(reading.value, earlier.value) < 0) refused.set(reading.row, `counter reading ${reading.value} is lower than the earlier ${earlier.value}`)
      else if (later && compareMeter(reading.value, later.value) > 0) refused.set(reading.row, `counter reading ${reading.value} is higher than the later ${later.value} recorded in Gasket`)
      else accepted.push(reading)
    }
  }
  return refused
}

async function build(env: Bindings, actor: Actor, input: Input) {
  const order = (input.text('dateFormat', { optional: true, max: 3 }) || 'MDY') as DateOrder
  insist(order === 'MDY' || order === 'DMY', 'invalid_dateFormat')
  const files: Partial<Record<FileName, KitFile>> = {}
  for (const name of FILES) { const file = await kitFile(input, name, name !== 'assets'); if (file) files[name] = file }
  const carry: Record<string, string> = { dateFormat: order }
  const artifacts: SourceBundle['artifacts'] = [], records: SourceRecord[] = []
  const tables: Partial<Record<FileName, { header: string[]; rows: { cells: string[]; row: number }[]; read: ReturnType<typeof columns>; hash: string; filename: string }>> = {}
  for (const name of FILES) {
    const file = files[name]
    if (!file) continue
    const base64 = btoa(Array.from(file.bytes, byte => String.fromCharCode(byte)).join(''))
    const hash = await sha256Hex(file.bytes)
    artifacts.push({ name: file.filename, sha256: hash, size: file.bytes.length, original: { status: 'available', base64 } })
    carry[`${name}_b64`] = base64; carry[`${name}_name`] = file.filename
    const sheet = readCsv(file.bytes, file.filename)
    insist(sheet.rows.length >= 1, `${name}_empty`)
    const read = columns(sheet.rows[0])
    const missing = NEEDS[name].filter(column => !read.has(column))
    if (missing.length) throw new GasketError(`${name}_columns`, 400, { needs: NEEDS[name], missing })
    tables[name] = { header: sheet.rows[0], rows: sheet.rows.slice(1).map((cells, index) => ({ cells, row: index + 2 })), read, hash, filename: file.filename }
  }
  const custom = await assetCustomMapping(env, input, tables.assets!.header)
  carry.customMapping = custom.carry
  const record = (kind: string, sourceId: string, payload: Json, table: NonNullable<(typeof tables)[FileName]>, row: number) =>
    records.push({ namespace, kind, sourceId, payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: table.hash, location: { artifact: table.filename, row } })
  const cellsOf = (table: NonNullable<(typeof tables)[FileName]>, cells: string[]) => Object.fromEntries(table.header.map((header, index) => [header || `column ${index + 1}`, cells[index] ?? '']))
  // Source identity follows MaintainX's ID, so a later export of the same record is recognised.
  // A repeated ID (or a row without one) gets its own identity and is rejected in mapping.
  for (const [name, kind] of [['assets', 'asset'], ['parts', 'part']] as const) {
    const table = tables[name], seen = new Set<string>()
    if (table) for (const row of table.rows) {
      const id = table.read.get(row.cells, 'ID')
      const sourceId = id && !seen.has(id) ? `${kind}:${id}` : `${kind}:${id || 'no-id'}:row-${row.row}`
      if (id) seen.add(id)
      record(kind, sourceId, { row: row.row, cells: cellsOf(table, row.cells) }, table, row.row)
    }
  }
  const readings = tables.readings
  if (readings) {
    const meters = new Map<string, number>()
    for (const row of readings.rows) { const id = readings.read.get(row.cells, 'Meter ID'); if (id && !meters.has(id)) meters.set(id, row.row) }
    for (const [id, row] of meters) record('meter', `meter:${id}`, { row, cells: cellsOf(readings, readings.rows.find(item => item.row === row)!.cells) }, readings, row)
    // A reading is identified by its content; identical repeated rows are numbered by occurrence.
    const occurrences = new Map<string, number>()
    for (const row of readings.rows) {
      const key = `reading:${readings.read.get(row.cells, 'Meter ID')}:${sha256(row.cells.join('\u001f')).slice(0, 24)}`
      const count = (occurrences.get(key) ?? 0) + 1
      occurrences.set(key, count)
      record('reading', count === 1 ? key : `${key}:${count}`, { row: row.row, cells: cellsOf(readings, row.cells) }, readings, row.row)
    }
  }
  // Work history last, so an undo removes it before the assets it names.
  const work = tables.work, workSeen = new Set<string>()
  if (work) for (const row of work.rows) {
    const id = work.read.get(row.cells, 'ID')
    record('work', id && !workSeen.has(id) ? `work:${id}` : `work:${id || 'no-id'}:row-${row.row}`, { row: row.row, cells: cellsOf(work, row.cells) }, work, row.row)
    if (id) workSeen.add(id)
  }

  // What Gasket already holds, so duplicates are refused rather than merged.
  const nativeTags = new Set((await all<{ tag: string }>(env, "SELECT tag FROM gk_assets WHERE origin = 'native'")).map(row => row.tag.toLowerCase()))
  const nativeNumbers = new Set((await all<{ number: string }>(env, "SELECT number FROM gk_parts WHERE origin = 'native'")).map(row => row.number.toLowerCase()))
  const existingAssets = await all<{ id: string; name: string }>(env, 'SELECT id, name FROM gk_assets WHERE retired_at IS NULL')
  const nativeReadings = await all<{ meter_id: string; value: string; takenOn: string }>(env, "SELECT meter_id, value, taken_on AS takenOn FROM gk_readings WHERE origin = 'native' ORDER BY taken_on")
  // ASSET-004: imported criticality and work categories map onto the central catalog.
  const catalog = await codeList(env)
  const claimed = new Map((await all(env, 'SELECT target_kind, target_id, record_json FROM ik_provenance WHERE destination = ? AND reversed = 0', destination)).map(row => [`${row.target_kind}:${row.target_id}`, JSON.parse(row.record_json).sourceIdentity as string]))

  const rejected: Preview['rejected'] = [], attention: Preview['attention'] = []
  const create = { assets: 0, meters: 0, readings: 0, parts: 0, work: 0 }
  let unchanged = 0
  // Counts what the apply would write: a row an earlier apply already holds is unchanged, not created again.
  const tally = { asset: 'assets', meter: 'meters', reading: 'readings', part: 'parts', work: 'work' } as const
  const counted = (kind: keyof typeof tally, targetId: string) => { if (claimed.has(`${kind}:${targetId}`)) unchanged++; else create[tally[kind]]++ }
  const at = (source: SourceRecord) => `${source.location.artifact} row ${source.location.row}`
  const reject = (source: SourceRecord, reason: string) => { rejected.push({ location: at(source), reason }); return { effects: [], rejection: reason } }
  const conflict = (kind: string, id: string, source: SourceRecord) => { const owner = claimed.get(`${kind}:${id}`); return owner !== undefined && owner !== sourceIdentity(destination, namespace, source.kind, source.sourceId) }
  const effect = (targetKind: string, targetId: string, value: Record<string, Json>): TargetEffect => ({ targetKind, targetId, value })
  const today = localNow(actor.zone)

  // Pre-pass over assets: the first row per MaintainX ID wins; tags and names are resolved once.
  const assetRows = new Map<string, number>(), assetsByName = new Map<string, string[]>(), tagsSeen = new Map<string, number>()
  const assetTable = tables.assets!
  for (const row of assetTable.rows) {
    const id = assetTable.read.get(row.cells, 'ID')
    if (!id || assetRows.has(id)) continue
    assetRows.set(id, row.row)
    const name = assetTable.read.get(row.cells, 'Name').toLowerCase()
    if (name) assetsByName.set(name, [...(assetsByName.get(name) ?? []), targetIds.asset(id)])
  }
  const partRows = new Map<string, number>()
  for (const row of tables.parts?.rows ?? []) { const id = tables.parts!.read.get(row.cells, 'ID'); if (id && !partRows.has(id)) partRows.set(id, row.row) }
  const workRows = new Map<string, number>()
  for (const row of tables.work?.rows ?? []) { const id = tables.work!.read.get(row.cells, 'ID'); if (id && !workRows.has(id)) workRows.set(id, row.row) }
  // Assets an earlier apply of this same export created are the same assets, not a second match.
  for (const asset of existingAssets) { const ids = assetsByName.get(asset.name.toLowerCase()) ?? []; if (!ids.includes(asset.id)) assetsByName.set(asset.name.toLowerCase(), [...ids, asset.id]) }
  const acceptedAssets = new Set<string>()
  const meterAsset = new Map<string, string>(), meterKind = new Map<string, string>()
  const counterRejections = readings ? counterOrder(readings, order, today, nativeReadings) : new Map<number, string>()

  const context = importContext(actor, env)
  const plan = await planD1Import({ artifacts, records, diagnostics: [] }, {
    version: mappingVersion,
    map(source) {
      const payload = source.payload as { row: number; cells: Record<string, string> }
      const header = Object.keys(payload.cells), values = Object.values(payload.cells), read = columns(header)
      const get = (name: string) => read.get(values, name)
      if (source.kind === 'asset') {
        const id = get('ID'), name = get('Name'), location = get('Location')
        if (!id) return reject(source, 'no MaintainX ID')
        if (assetRows.get(id) !== payload.row) return reject(source, `duplicate of row ${assetRows.get(id)} (same MaintainX ID)`)
        if (!name) return reject(source, 'no asset name')
        if (!location) return reject(source, 'no location: set it in MaintainX and export again, or register the asset in Gasket')
        const tag = get('QR/Barcode') || `MX-${id}`
        if (nativeTags.has(tag.toLowerCase())) return reject(source, `asset tag ${tag} is already used by an asset registered in Gasket`)
        if (tagsSeen.has(tag.toLowerCase())) return reject(source, `asset tag ${tag} is also used by row ${tagsSeen.get(tag.toLowerCase())}`)
        const criticality = matchCode(catalog, 'criticality', get('Criticality') || 'normal')
        if (!criticality) return reject(source, `criticality "${get('Criticality')}" is not a criticality level in Gasket: add it, or an import name for a level, under Codes`)
        const targetId = targetIds.asset(id)
        if (conflict('asset', targetId, source)) return reject(source, 'already moved in earlier with different values; edit the asset in Gasket instead')
        const category = get('Types').split(',')[0]?.trim() || null
        let customValues: Record<string, Json>
        try { customValues = custom.values(payload.cells, category) }
        catch (error) { if (!(error instanceof GasketError)) throw error; return reject(source, error.code) }
        tagsSeen.set(tag.toLowerCase(), payload.row)
        acceptedAssets.add(targetId)
        const notes = [get('Description'), [get('Manufacturer'), get('Model'), get('Year')].filter(Boolean).join(' '), get('Parent') ? `Parent asset in MaintainX: ${get('Parent')}` : ''].filter(Boolean).join('\n') || null
        if (get('Parent')) attention.push({ location: at(source), reason: `${name}: its MaintainX parent (${get('Parent')}) is kept as a note; a lead places it under its parent on the asset page` })
        if (/offline/i.test(get('Status'))) attention.push({ location: at(source), reason: `${name} was Offline in MaintainX: record its downtime in Gasket if it is still down` })
        const custodian = get('Teams Assigned to').split(',')[0]?.trim() || null
        counted('asset', targetId)
        return { effects: [effect('asset', targetId, { tag, name, serial: get('Serial Number') || null, location, custodian, category, criticality: criticality.key, notes, ...(Object.keys(customValues).length ? { customValues } : {}) })] }
      }
      if (source.kind === 'part') {
        const id = get('ID'), name = get('Name')
        if (!id) return reject(source, 'no MaintainX ID')
        if (partRows.get(id) !== payload.row) return reject(source, `duplicate of row ${partRows.get(id)} (same MaintainX ID)`)
        if (!name) return reject(source, 'no part name')
        const number = get('Part Numbers').split(',')[0]?.trim() || `MX-${id}`
        if (nativeNumbers.has(number.toLowerCase())) return reject(source, `part number ${number} is already used by a part entered in Gasket`)
        let opening: number, minimum: number
        try { opening = toMilli(get('Quantity') || '0', 'quantity', { allowZero: true }) } catch { return reject(source, `quantity "${get('Quantity')}" is not a number of at most three decimal places`) }
        try { minimum = toMilli(get('Minimum Quantity') || '0', 'minimum', { allowZero: true }) } catch { return reject(source, `minimum quantity "${get('Minimum Quantity')}" is not a number of at most three decimal places`) }
        const targetId = targetIds.part(id)
        if (conflict('part', targetId, source)) return reject(source, 'already moved in earlier with different values')
        counted('part', targetId)
        return { effects: [effect('part', targetId, { number, name, unit: 'each', minimumMilli: minimum, location: get('Location') || null, openingMilli: opening })] }
      }
      if (source.kind === 'work') {
        const id = get('ID')
        if (!id) return reject(source, 'no MaintainX ID')
        if (workRows.get(id) !== payload.row) return reject(source, `duplicate of row ${workRows.get(id)} (same MaintainX ID)`)
        const mapped = mapWork(get, { parse: text => parseEnteredOn(text, order), today, assetFor: (assetId, assetName) => {
          // By MaintainX asset ID when the export carries it, else by exact name, as meters are.
          const byId = assetId ? targetIds.asset(assetId) : null
          if (byId) return acceptedAssets.has(byId) || existingAssets.some(asset => asset.id === byId) ? { id: byId } : { refused: `asset ${assetId} (${assetName || 'no name'}) is not in this move-in or in Gasket` }
          if (!assetName) return { refused: 'no asset: work on a location alone is not carried' }
          const matches = (assetsByName.get(assetName.toLowerCase()) ?? []).filter(candidate => acceptedAssets.has(candidate) || existingAssets.some(asset => asset.id === candidate))
          return matches.length === 1 ? { id: matches[0] } : { refused: matches.length ? `asset name "${assetName}" matches more than one asset` : `asset "${assetName}" is not in this move-in or in Gasket` }
        } })
        if ('refused' in mapped) return reject(source, mapped.refused)
        // The first category that is a failure mode code (by key, label or import name) classifies it; otherwise it moves in unclassified.
        const categories = String(mapped.value.categories ?? '').split(',').map(name => name.trim()).filter(Boolean)
        const failureMode = categories.map(name => matchCode(catalog, 'failure_mode', name)).find(Boolean) ?? null
        if (categories.length && !failureMode) attention.push({ location: at(source), reason: `#${id} ${mapped.value.title}: no failure mode code matches its categories (${categories.join(', ')}); it moves in unclassified` })
        mapped.value.failureMode = failureMode?.id ?? null
        const targetId = targetIds.work(id)
        if (conflict('work', targetId, source)) return reject(source, 'already moved in earlier with different values')
        counted('work', targetId)
        return { effects: [effect('work', targetId, mapped.value)] }
      }
      if (source.kind === 'meter') {
        const id = get('Meter ID'), assetName = get('Asset Name').toLowerCase()
        const matches = (assetsByName.get(assetName) ?? []).filter(candidate => acceptedAssets.has(candidate) || existingAssets.some(asset => asset.id === candidate))
        if (matches.length !== 1) return reject(source, matches.length ? `asset name "${get('Asset Name')}" matches more than one asset` : `asset "${get('Asset Name')}" is not in this move-in or in Gasket`)
        const unit = get('Unit of Measure (U/M)') || 'units'
        const kind = COUNTER_UNITS.test(unit) ? 'counter' : 'gauge'
        const targetId = targetIds.meter(id)
        if (conflict('meter', targetId, source)) return reject(source, 'already moved in earlier with different values')
        meterAsset.set(id, matches[0]); meterKind.set(id, kind)
        counted('meter', targetId)
        return { effects: [effect('meter', targetId, { asset: matches[0], name: get('Meter Name') || `Meter ${id}`, unit, kind })] }
      }
      // A manual reading.
      const meterId = get('Meter ID')
      if (!meterAsset.has(meterId)) return reject(source, `its meter (${get('Meter Name') || meterId}) was not moved in`)
      let value: string
      try { value = meterNumber(get('Reading')) } catch { return reject(source, `reading "${get('Reading')}" is not a number`) }
      const takenOn = parseEnteredOn(get('Entered On'), order)
      if (!takenOn) return reject(source, `Entered On "${get('Entered On')}" is not a date and time Gasket can read`)
      if (takenOn > today) return reject(source, 'reading is dated in the future')
      if (meterKind.get(meterId) === 'counter' && counterRejections.has(payload.row)) return reject(source, counterRejections.get(payload.row)!)
      const targetId = targetIds.reading(meterId, source.sourceId)
      if (conflict('reading', targetId, source)) return reject(source, 'already moved in earlier')
      counted('reading', targetId)
      return { effects: [effect('reading', targetId, { meter: targetIds.meter(meterId), asset: meterAsset.get(meterId)!, value, takenOn, enteredBy: `MaintainX: ${get('Entered By') || 'unknown'}` })] }
    },
  }, context)

  const preview: Preview = {
    fingerprint: plan.fingerprint, counts: plan.counts as unknown as Json, create, unchanged, rejected, attention,
    gaps: [
      'MaintainX asset hierarchy, teams, vendors, costs, depreciation and attachments are not carried; parents are kept as a note for a lead to place on the asset page.',
      'Asset custom columns move into existing Gasket fields selected below. A unique, exact field-name match is selected automatically. Unmapped columns are retained in the original export only. Choices use exact option names; multiple choices use a comma-separated cell or JSON array. Dates use YYYY-MM-DD; booleans use yes, no, true or false.',
      'The custodian is MaintainX\'s first assigned team; change it in Gasket where a named person is responsible.',
      ...(files.parts ? ['MaintainX parts have no unit column: every part arrives in "each". Change units before the first count if needed.', 'Opening stock is MaintainX\'s Quantity on the day of export: count the shelves in Gasket after moving in.'] : ['No part export: add parts in Gasket.']),
      ...(files.readings ? ['Meters whose unit is hours, kilometres, miles, cycles or starts are counters (they never go down); every other meter is a gauge.'] : ['No meter-reading export: add meters to assets in Gasket.']),
      ...(files.work ? ['Completed MaintainX work orders move in as asset history, with their recurrence kept as text: history never raises work or moves a schedule. Open work orders, procedure answers, time entries, attachments and custom fields are not carried.'] : ['No work-order export: MaintainX work history is not moved in.']),
      'MaintainX procedures and PM schedules are not moved in: write checklists and schedules in Gasket.',
      'Keep MaintainX read-only until a lead has run one full preventive cycle in Gasket.',
    ],
    carry, customMapping: custom.preview,
  }
  return { plan, preview, context }
}

export async function previewImport(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'import.run')
  return (await build(env, actor, input)).preview
}

export async function applyImport(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'import.run')
  const reviewed = input.text('fingerprint', { max: 100 })
  const { plan, context, preview } = await build(env, actor, input)
  insist(plan.fingerprint === reviewed, 'reviewed_fingerprint_changed', 409)
  // Repeating an apply returns its job; after an undo, applying again is a new job.
  const undone = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM ik_jobs WHERE destination = ? AND fingerprint = ? AND state IN ('undone', 'rolled_back')", destination, reviewed))!.n
  const reviewedContext = { ...context, reviewedFingerprint: reviewed, ...(undone ? { operationKey: `${reviewed}:${undone}` } : {}) }
  const job = await createD1ImportJob(plan, reviewedContext)
  await commit(env, [stmt(env, 'INSERT OR IGNORE INTO gk_import_quality(job_id,reviewed_json,recorded_at) VALUES (?,?,?)', job.id, JSON.stringify({ fingerprint: reviewed, rejected: preview.rejected, attention: preview.attention, gaps: preview.gaps }), now())], [])
  const result = await applyD1ImportBatches(job.id, reviewedContext)
  if (!await one(env, "SELECT 1 FROM gk_audit WHERE action = 'import.apply' AND subject = ?", job.id))
    await commit(env, [], { actor: actor.id, action: 'import.apply', subject: job.id, detail: { kit: 'maintainx', fingerprint: reviewed, counts: plan.counts } })
  return { job: job.id, state: result.state }
}

export async function undoBlockers(env: Bindings, jobId: string) {
  const rows = await all(env, 'SELECT target_kind, target_id, record_json FROM ik_provenance WHERE job_id = ? AND reversed = 0', jobId)
  const blockers: { kind: string; target: string; reason: string }[] = []
  for (const row of rows) {
    const recorded = JSON.parse(row.record_json)
    const current = await KINDS[row.target_kind].read(env.DB as never, row.target_id)
    if (!current) blockers.push({ kind: row.target_kind, target: row.target_id, reason: 'removed since the move-in' })
    else if ('dependents' in current.value) blockers.push({ kind: row.target_kind, target: row.target_id, reason: `${current.value.dependents} later Gasket record(s) depend on it` })
    else if (current.revision !== recorded.appliedRevision || sha256(canonicalJson(current.value as Json)) !== recorded.valueHash) blockers.push({ kind: row.target_kind, target: row.target_id, reason: 'edited since the move-in' })
  }
  return blockers
}

export async function importAction(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'import.run')
  const job = input.text('job', { max: 100 }), action = input.text('action', { max: 10 })
  const context = importContext(actor, env)
  if (action === 'resume') return await resumeD1Import(job, context)
  insist(action === 'undo', 'invalid_action')
  const blockers = await undoBlockers(env, job)
  insist(!blockers.length, 'undo_blocked', 409, { blockers })
  const result = await undoD1Import(job, context)
  await commit(env, [], { actor: actor.id, action: 'import.undo', subject: job, detail: { state: result.state } })
  return { job, state: result.state }
}

export async function importJobs(env: Bindings, actor: Actor) {
  requireCapability(actor, 'import.run')
  const jobs = await all<{ id: string; at: number; detail: string; state: string; total: number; who: string }>(env,
    `SELECT j.id, a.at, a.detail, j.state, j.total, m.name AS who FROM gk_audit a JOIN ik_jobs j ON j.id = a.subject LEFT JOIN gk_members m ON m.id = a.actor
     WHERE a.action = 'import.apply' AND j.destination = ? AND j.namespace = ? AND j.mapping_version = ? ORDER BY a.at DESC`, destination, namespace, mappingVersion)
  const result = []
  for (const job of jobs) result.push({ id: job.id, appliedAt: job.at, by: job.who, state: job.state, counts: JSON.parse(job.detail).counts, effects: job.total, blockers: job.state === 'completed' ? await undoBlockers(env, job.id) : [] })
  return result
}
