import { assetUndoEffect } from './agent-door/asset-undo'
import { customStatements, customValues } from './custom-fields'
// Clause 2: the asset register. Edits write the previous identity to
// gk_asset_versions; retiring keeps every record. Sightings reconcile the
// register against what is physically on the floor.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { activeCode } from './codes'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import { bomOf } from './bom'
import { partList } from './parts'
import { thread } from './comments'
import { hierarchyOf, placement } from './hierarchy'
import type { Input } from './input'
import { DEFAULT_FEED_WINDOW_HOURS, FEED_WINDOW_HOURS, meterView } from './meters'
import { DECLARED_STATE, stateConflicts, stateHistory } from './states'
import { disposalStatements, lifecycleOf } from './lifecycle'
import { documentsOf } from './documents'

export const METER_KINDS = ['counter', 'gauge', 'condition']
const IDENTITY = ['tag', 'name', 'serial', 'model', 'location', 'custodian', 'category', 'criticality', 'notes'] as const

function identity(input: Input, keptModel: string | null = null) {
  const value = {
    tag: input.text('tag', { max: 60 }),
    name: input.text('name', { max: 160 }),
    serial: input.text('serial', { optional: true, max: 120 }) || null,
    model: input.present('model') ? input.text('model', { optional: true, max: 120 }) || null : keptModel,
    location: input.text('location', { max: 160 }),
    custodian: input.text('custodian', { optional: true, max: 120 }) || null,
    category: input.text('category', { optional: true, max: 80 }) || null,
    criticality: input.text('criticality', { optional: true, max: 40 }) || 'normal',
    notes: input.text('notes', { optional: true, max: 2000 }) || null,
  }
  return value
}

/** A criticality an asset is given must be an active catalog level; an asset keeps a level retired since. */
const CRITICALITY_LABEL = "(SELECT label FROM gk_codes WHERE id = 'criticality:' || a.criticality) AS criticality_label"
async function checkCriticality(env: Bindings, key: string, kept?: string) {
  if (key !== kept) await activeCode(env, 'criticality', key)
}

/** Status: retired, down while downtime is open, otherwise the declared state (ASSET-004), in service by default. */
export const ASSET_STATUS = `CASE WHEN a.retired_at IS NOT NULL THEN 'retired' WHEN EXISTS(SELECT 1 FROM gk_downtime d WHERE d.asset_id = a.id AND d.ended_on IS NULL) THEN 'down' ELSE COALESCE(${DECLARED_STATE}, 'in_service') END`

export async function createAsset(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const value = identity(input), id = newId(), at = now()
  await checkCriticality(env, value.criticality)
  // ASSET-001: its level and parent (none: directly under the site).
  const place = await placement(env, input)
  const custom = await customStatements(env, actor, input, 'asset', id, value.category, true)
  await commit(env, [stmt(env, 'INSERT INTO gk_assets (id, tag, name, serial, model, location, custodian, category, criticality, notes, level, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, value.tag, value.name, value.serial, value.model, value.location, value.custodian, value.category, value.criticality, value.notes, place.level, place.parent, at, at), ...custom],
    { actor: actor.id, action: 'asset.create', subject: id, detail: { ...value, ...place } })
  return { id }
}

export async function updateAsset(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const asset = await one(env, 'SELECT * FROM gk_assets WHERE id = ?', input.text('asset', { max: 100 }))
  insist(asset, 'asset_not_found', 404)
  insist(!asset.retired_at, 'asset_retired', 409)
  const revision = input.integer('revision', { min: 1, max: 1_000_000 })
  insist(revision === asset.revision, 'stale', 409)
  const value = identity(input, asset.model)
  await checkCriticality(env, value.criticality, asset.criticality)
  const custom = await customStatements(env, actor, input, 'asset', asset.id, value.category)
  const before = Object.fromEntries(IDENTITY.map(key => [key, asset[key]]))
  const undo = assetUndoEffect(env, asset, before, value)
  await commit(env, [
    ...custom,
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_assets WHERE id = ? AND revision = ?)', asset.id, revision),
    stmt(env, 'INSERT INTO gk_asset_versions (asset_id, revision, value_json, changed_by, changed_at) VALUES (?, ?, ?, ?, ?)', asset.id, asset.revision, JSON.stringify(before), actor.id, now()),
    stmt(env, 'UPDATE gk_assets SET tag = ?, name = ?, serial = ?, model = ?, location = ?, custodian = ?, category = ?, criticality = ?, notes = ?, revision = revision + 1, updated_at = ? WHERE id = ?', value.tag, value.name, value.serial, value.model, value.location, value.custodian, value.category, value.criticality, value.notes, now(), asset.id),
    ...(undo?.statements ?? []),
  ], { actor: actor.id, action: 'asset.update', subject: asset.id, detail: { before, after: value, ...(undo ? { effect: undo.saved.effect } : {}) } })
  return { id: asset.id, revision: revision! + 1, ...(undo ? { undo: undo.saved } : {}) }
}

export async function retireAsset(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const asset = await one(env, 'SELECT * FROM gk_assets WHERE id = ?', input.text('asset', { max: 100 }))
  insist(asset, 'asset_not_found', 404)
  insist(!asset.retired_at, 'asset_retired', 409)
  const reason = input.text('reason', { max: 500 })
  // ASSET-001: nothing active is left under a retired entry; the batch checks again.
  insist(!await one(env, 'SELECT 1 FROM gk_assets WHERE parent_id = ? AND retired_at IS NULL', asset.id), 'active_children', 409)
  // ASSET-007: the disposal, when given, is recorded with the retirement.
  const disposal = disposalStatements(env, actor, asset.id, input)
  await commit(env, [
    guard(env, 'open_work_exists', "NOT EXISTS(SELECT 1 FROM gk_work_orders WHERE asset_id = ? AND status NOT IN ('closed', 'cancelled'))", asset.id),
    guard(env, 'active_children', 'NOT EXISTS(SELECT 1 FROM gk_assets WHERE parent_id = ? AND retired_at IS NULL)', asset.id),
    stmt(env, 'UPDATE gk_schedules SET active = 0, revision = revision + 1 WHERE asset_id = ?', asset.id),
    ...disposal.statements,
    stmt(env, 'UPDATE gk_assets SET retired_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?', now(), now(), asset.id),
  ], { actor: actor.id, action: 'asset.retire', subject: asset.id, detail: { reason, ...(disposal.disposal ? { disposal: disposal.disposal } : {}) } })
  return { id: asset.id }
}

export async function addMeter(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const asset = await one(env, 'SELECT id, retired_at FROM gk_assets WHERE id = ?', input.text('asset', { max: 100 }))
  insist(asset, 'asset_not_found', 404)
  insist(!asset.retired_at, 'asset_retired', 409)
  const name = input.text('name', { max: 80 }), unit = input.text('unit', { max: 30 }), kind = input.text('kind', { max: 20 })
  insist(METER_KINDS.includes(kind), 'invalid_kind')
  const feedWindowHours = input.integer('feedWindowHours', { ...FEED_WINDOW_HOURS, optional: true }) ?? DEFAULT_FEED_WINDOW_HOURS
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_meters (id, asset_id, name, unit, kind, feed_window_hours, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, asset.id, name, unit, kind, feedWindowHours, now())],
    { actor: actor.id, action: 'meter.create', subject: id, detail: { asset: asset.id, name, unit, kind, feedWindowHours } })
  return { id }
}

export async function recordSighting(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const asset = await one(env, 'SELECT id, location FROM gk_assets WHERE id = ?', input.text('asset', { max: 100 }))
  insist(asset, 'asset_not_found', 404)
  const outcome = input.text('outcome', { max: 20 })
  insist(['found', 'elsewhere', 'missing'].includes(outcome), 'invalid_outcome')
  const seen = outcome === 'elsewhere' ? input.text('seenLocation', { max: 160 }) : outcome === 'found' ? asset.location : null
  const note = input.text('note', { optional: true, max: 500 }) || null
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_sightings (id, asset_id, outcome, seen_location, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, asset.id, outcome, seen, note, actor.id, now())],
    { actor: actor.id, action: 'asset.sighting', subject: asset.id, detail: { outcome, seen } })
  return { id }
}

export async function assetList(env: Bindings, _actor: Actor, url?: URL) {
  const filter = url?.searchParams.get('field'), value = url?.searchParams.get('value')
  const selected = filter && value ? new Set((await all(env, "SELECT v.entity_id FROM gk_custom_values v JOIN gk_custom_fields f ON f.id=v.field_id WHERE v.entity_type='asset' AND v.field_id=? AND f.retired=0 AND (CAST(json_extract(v.value,'$') AS TEXT)=? OR (json_type(v.value)='array' AND EXISTS(SELECT 1 FROM json_each(v.value) j WHERE CAST(j.value AS TEXT)=?)))", filter, value, value)).map(v=>v.entity_id)) : null
  const rows = (await all(env, `SELECT a.id, a.tag, a.name, a.serial, a.model, a.location, a.custodian, a.category, a.criticality, ${CRITICALITY_LABEL}, a.origin, ${ASSET_STATUS} AS status, a.level, a.parent_id, (SELECT p.tag FROM gk_assets p WHERE p.id = a.parent_id) AS parent_tag,
    (SELECT s.outcome || '|' || s.recorded_at FROM gk_sightings s WHERE s.asset_id = a.id ORDER BY s.recorded_at DESC LIMIT 1) AS last_sighting,
    (SELECT MIN(w.due_date) FROM gk_work_orders w WHERE w.asset_id = a.id AND w.status NOT IN ('closed', 'cancelled')) AS next_due
    FROM gk_assets a ORDER BY a.retired_at IS NOT NULL, a.tag`)).filter(row=>!selected || selected.has(row.id))
  // Where a declared state disagrees with open downtime or a feed counter, the register says so.
  const declared = new Set((await all(env, 'SELECT DISTINCT asset_id FROM gk_asset_states')).map(row => row.asset_id))
  return await Promise.all(rows.map(async row => ({ ...row, conflicts: declared.has(row.id) ? (await stateConflicts(env, { id: row.id, retired_at: row.status === 'retired' ? 1 : null }, await stateHistory(env, row.id))).length : 0 })))
}

export async function assetDetail(env: Bindings, actor: Actor, id: string) {
  const asset = await one(env, `SELECT a.*, ${CRITICALITY_LABEL}, ${ASSET_STATUS} AS status FROM gk_assets a WHERE a.id = ?`, id)
  insist(asset, 'asset_not_found', 404)
  const meters = await Promise.all((await all(env, 'SELECT m.id, m.name, m.unit, m.kind, m.feed_window_hours, m.revision FROM gk_meters m WHERE m.asset_id = ? ORDER BY m.name', id))
    .map(async meter => ({ ...meter, ...await meterView(env, actor, meter.id) })))
  const versions = await all(env, 'SELECT revision, value_json, changed_by, changed_at FROM gk_asset_versions WHERE asset_id = ? ORDER BY revision DESC', id)
  const sightings = await all(env, 'SELECT outcome, seen_location, note, recorded_by, recorded_at FROM gk_sightings WHERE asset_id = ? ORDER BY recorded_at DESC', id)
  const schedules = await all(env, 'SELECT id, title, every_days, every_units, meter_id, next_due_date, next_due_meter, active FROM gk_schedules WHERE asset_id = ? ORDER BY title', id)
  const states = await stateHistory(env, id)
  const bom = await bomOf(env, { id: asset.id, serial: asset.serial, model: asset.model }, await partList(env, actor))
  return { ...asset, customFields: await customValues(env, 'asset', id, asset.category), bom, lifecycle: await lifecycleOf(env, actor, id), documents: await documentsOf(env, actor, id), states, conflicts: await stateConflicts(env, asset, states), hierarchy: await hierarchyOf(env, asset), comments: await thread(env, actor, 'asset', id), meters, versions: versions.map(row => ({ ...row, value: JSON.parse(row.value_json), value_json: undefined })), sightings, schedules }
}
