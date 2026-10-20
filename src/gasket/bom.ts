import { canonicalId, canonicalSql } from './part-identity'
// ASSET-006: each asset's bill of materials as numbered revisions. A lead saves
// a new revision (the earlier ones stay readable): lines of parts with the
// quantity a repair needs and an optional serial range the line fits, approved
// alternates per line with their own optional serial range, and the tools the
// work needs. Serial ranges include both ends and compare in natural order
// (digit runs as numbers, letters ignoring case); an asset with no serial fits
// only lines and alternates without a range. Work planning reads the current
// revision with each part's available stock (PART-002) and whether it fits
// the asset; reserving (PART-002) accepts an alternate the current revision
// approves for the asset's serial, and refuses one outside its range.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import type { Input } from './input'
import { fromMilli, toMilli } from './quantity'

const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
/** Whether a serial lies in an inclusive range; no range fits everything, a range never fits an unknown serial. */
export const fits = (serial: string | null, from: string | null, to: string | null) =>
  (!from && !to) || (Boolean(serial) && (!from || natural(serial!, from) >= 0) && (!to || natural(serial!, to) <= 0))

const range = (from: string | undefined, to: string | undefined) => {
  const span = { from: from?.trim() || null, to: to?.trim() || null }
  insist(!span.from || !span.to || natural(span.from, span.to) <= 0, 'invalid_serial_range')
  return span
}

const current = (env: Bindings, assetId: string) => one(env, 'SELECT * FROM gk_bom_revisions WHERE asset_id = ? ORDER BY number DESC LIMIT 1', assetId)

/** A lead saves a new revision: parallel `part`, `quantity`, `serialFrom`, `serialTo` lines; parallel `alternateFor` (a line's part), `alternate`, `alternateFrom`, `alternateTo`; `tool` names; an optional `note`. */
export async function reviseBom(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const asset = await one(env, 'SELECT id, retired_at FROM gk_assets WHERE id = ?', input.text('asset', { max: 100 }))
  insist(asset, 'asset_not_found', 404)
  insist(!asset.retired_at, 'asset_retired', 409)
  const list = (name: string) => input.list(name, { keepEmpty: true })
  const quantities = list('quantity'), froms = list('serialFrom'), tos = list('serialTo')
  const lines = list('part').flatMap((part, index) => part ? [{ part, quantity: toMilli(quantities[index] ?? ''), ...range(froms[index], tos[index]) }] : [])
  insist(lines.length, 'bom_has_no_lines')
  insist(new Set(lines.map(line => line.part)).size === lines.length, 'bom_part_repeated')
  const altFor = list('alternateFor'), altFroms = list('alternateFrom'), altTos = list('alternateTo')
  const alternates = list('alternate').flatMap((alternate, index) => {
    if (!alternate) return []
    const part = altFor[index]
    insist(part && part !== alternate && lines.some(line => line.part === part), 'invalid_alternate')
    return [{ part, alternate, ...range(altFroms[index], altTos[index]) }]
  })
  insist(new Set(alternates.map(row => `${row.part}:${row.alternate}`)).size === alternates.length, 'invalid_alternate')
  for (const id of new Set([...lines.map(line => line.part), ...alternates.map(row => row.alternate)])) insist(await one(env, 'SELECT 1 FROM gk_parts WHERE id = ?', id), 'part_not_found', 404)
  const tools = list('tool').map(tool => tool.slice(0, 120)).filter(Boolean)
  insist(tools.length <= 20 && tools.every(tool => !tool.includes('|')), 'invalid_tool')
  const note = input.text('note', { optional: true, max: 500 }) || null
  const latest = await current(env, asset.id), seen = latest?.number ?? 0
  if (input.has('revision')) insist(input.integer('revision', { min: 0, max: 100_000 }) === seen, 'stale', 409)
  const id = newId(), number = seen + 1
  await commit(env, [
    guard(env, 'stale', '(SELECT COALESCE(MAX(number), 0) FROM gk_bom_revisions WHERE asset_id = ?) = ?', asset.id, seen),
    stmt(env, 'INSERT INTO gk_bom_revisions (id, asset_id, number, tools, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, asset.id, number, tools.join('|') || null, note, actor.id, now()),
    ...lines.map((line, position) => stmt(env, 'INSERT INTO gk_bom_lines (revision_id, position, part_id, quantity_milli, serial_from, serial_to) VALUES (?, ?, ?, ?, ?, ?)', id, position, line.part, line.quantity, line.from, line.to)),
    ...alternates.map((row, position) => stmt(env, 'INSERT INTO gk_bom_alternates (revision_id, part_id, alternate_id, position, serial_from, serial_to) VALUES (?, ?, ?, ?, ?, ?)', id, row.part, row.alternate, position, row.from, row.to)),
  ], { actor: actor.id, action: 'bom.revise', subject: asset.id, detail: { revision: number, lines: lines.map(line => ({ ...line, quantity: fromMilli(line.quantity) })), alternates, tools, note } })
  return { id, number }
}

type Stock = { id: string; number: string; name: string; unit: string; onHand: string; available: string }

/** The asset's current revision for planning: each line's need, stock and fit, its alternates likewise, the tools, and every earlier revision. */
export async function bomOf(env: Bindings, asset: { id: string; serial: string | null }, stock: (Row & Stock)[]) {
  const revisions = await all(env, 'SELECT r.id, r.number, r.note, r.tools, r.created_at, m.name AS created_by FROM gk_bom_revisions r LEFT JOIN gk_members m ON m.id = r.created_by WHERE r.asset_id = ? ORDER BY r.number DESC', asset.id)
  if (!revisions.length) return null
  const latest = revisions[0], currentStock = new Map(stock.map(part => [part.id, part]))
  const identities = await all(env, `SELECT p.*,${canonicalSql('p.id')} AS canonical_id FROM gk_parts p`)
  const parts = new Map(identities.map(part => [part.id,{...part,...currentStock.get(part.canonical_id),id:part.id,number:part.number,name:part.name,canonical_id:part.canonical_id}]))
  const describe = (id: string, from: string | null, to: string | null, quantity: number) => {
    const part = parts.get(id)!
    return { part: { id, canonicalId:part.canonical_id, number: part.number, name: part.name, unit: part.unit }, onHand: part.onHand, available: part.available, serialFrom: from, serialTo: to, fits: fits(asset.serial, from, to), short: Number(part.available) < quantity / 1000 }
  }
  const alternates = await all(env, 'SELECT * FROM gk_bom_alternates WHERE revision_id = ? ORDER BY position', latest.id)
  const lines = (await all(env, 'SELECT * FROM gk_bom_lines WHERE revision_id = ? ORDER BY position', latest.id)).map(line => ({
    ...describe(line.part_id, line.serial_from, line.serial_to, line.quantity_milli), quantity: fromMilli(line.quantity_milli),
    alternates: alternates.filter(row => row.part_id === line.part_id).map(row => describe(row.alternate_id, row.serial_from, row.serial_to, line.quantity_milli)),
  }))
  return { revision: latest.number, note: latest.note, tools: latest.tools ? String(latest.tools).split('|') : [], createdBy: latest.created_by, createdAt: latest.created_at, serial: asset.serial, lines,
    revisions: revisions.map(row => ({ number: row.number, note: row.note, createdBy: row.created_by, createdAt: row.created_at })) }
}

/**
 * Whether `chosen` may fill a need for `requested` on work for this asset: an alternate on the asset's current
 * revision decides by its serial range; otherwise a site-wide approval (PART-002) decides. The part itself must fit
 * when its line has a range. Returns the refusal code, or null.
 */
export async function substitutionRefusal(env: Bindings, assetId: string, requestedId: string, chosenId: string) {
  const asset = await one(env, 'SELECT serial FROM gk_assets WHERE id = ?', assetId)
  const latest = await current(env, assetId)
  // First honor the exact historical alternate, including its serial restriction.
  const alternate = latest ? await one(env, 'SELECT serial_from, serial_to FROM gk_bom_alternates WHERE revision_id = ? AND part_id = ? AND alternate_id = ?', latest.id, requestedId, chosenId) : null
  if (alternate) return fits(asset?.serial ?? null, alternate.serial_from, alternate.serial_to) ? null : 'substitute_not_compatible'
  if (await canonicalId(env,requestedId) === await canonicalId(env,chosenId)) {
    const lines = latest ? await all(env, `SELECT serial_from, serial_to FROM gk_bom_lines WHERE revision_id=? AND ${canonicalSql('part_id')}=?`, latest.id, await canonicalId(env,requestedId)) : []
    return lines.some(line=>!fits(asset?.serial ?? null,line.serial_from,line.serial_to)) ? 'part_not_compatible' : null
  }
  const mapped = latest ? await all(env, `SELECT serial_from,serial_to FROM gk_bom_alternates WHERE revision_id=? AND ${canonicalSql('part_id')}=? AND ${canonicalSql('alternate_id')}=?`,latest.id,await canonicalId(env,requestedId),await canonicalId(env,chosenId)) : []
  if(mapped.length) return mapped.every(row=>fits(asset?.serial ?? null,row.serial_from,row.serial_to)) ? null : 'substitute_not_compatible'
  return await one(env, `SELECT 1 FROM gk_part_substitutes WHERE ${canonicalSql('part_id')}=? AND ${canonicalSql('substitute_id')}=? AND withdrawn_at IS NULL`, await canonicalId(env,requestedId), await canonicalId(env,chosenId)) ? null : 'substitute_not_approved'
}
