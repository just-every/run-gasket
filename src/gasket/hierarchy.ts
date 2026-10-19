// ASSET-001: the asset and location hierarchy. The site is the root; under it
// each register entry is a building, line, machine or component with a stable
// id and tag. A parent ranks above its child (building, then line, then
// machine, then component; a component may hold components), is active, and is
// never the entry itself or one of its descendants, which is checked again
// inside the move's own write. Moving an entry takes its whole subtree along;
// work, downtime and history stay on the entries they were recorded on.
// Roll-ups cover an entry and everything below it: downtime is the union of
// their ended outages, so an outage two of them share counts once (an outage
// still open is listed as down now and counts once it ends, as on the asset
// itself; degraded operation, REPORT-002, is not an outage), and cost is the moved-in work cost (MIG-002) of the subtree.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, now, one, stmt, type Row } from './core'
import { minutesBetween } from './dates'
import type { Input } from './input'

export const LEVELS = ['building', 'line', 'machine', 'component'] as const
export type Level = typeof LEVELS[number]
export const LEVEL_LABELS: Record<Level, string> = { building: 'Building', line: 'Line', machine: 'Machine', component: 'Component' }

/** Whether `parent` may hold `child`. */
export const holds = (parent: Level, child: Level) => LEVELS.indexOf(parent) < LEVELS.indexOf(child) || (parent === 'component' && child === 'component')

/** SQL: true when walking up from parent `?` never reaches asset `?` (no cycle). */
const NO_CYCLE = `NOT EXISTS(WITH RECURSIVE up(id) AS (SELECT ? UNION SELECT a.parent_id FROM gk_assets a JOIN up ON a.id = up.id WHERE a.parent_id IS NOT NULL) SELECT 1 FROM up WHERE id = ?)`

/** The level and parent a new entry is given: `level` (machine by default) and `parent` (none: directly under the site). */
export async function placement(env: Bindings, input: Input): Promise<{ level: Level; parent: string | null }> {
  const level = (input.text('level', { optional: true, max: 20 }) || 'machine') as Level
  insist(LEVELS.includes(level), 'invalid_level')
  const parent = input.text('parent', { optional: true, max: 100 }) || null
  if (parent) await checkParent(env, parent, level)
  return { level, parent }
}

async function checkParent(env: Bindings, id: string, level: Level) {
  const parent = await one(env, 'SELECT id, level, retired_at FROM gk_assets WHERE id = ?', id)
  insist(parent, 'parent_not_found', 404)
  insist(!parent.retired_at, 'parent_retired', 409)
  insist(holds(parent.level, level), 'parent_level', 409, { parent: parent.level, child: level })
  return parent
}

/** A lead moves an entry, with everything below it, under another parent or directly under the site (no `parent`). */
export async function moveAsset(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const asset = await one(env, 'SELECT a.*, p.tag AS parent_tag FROM gk_assets a LEFT JOIN gk_assets p ON p.id = a.parent_id WHERE a.id = ?', input.text('asset', { max: 100 }))
  insist(asset, 'asset_not_found', 404)
  insist(!asset.retired_at, 'asset_retired', 409)
  insist(input.integer('revision', { min: 1, max: 1_000_000 }) === asset.revision, 'stale', 409)
  const to = input.text('parent', { optional: true, max: 100 }) || null
  insist(to !== asset.parent_id, 'unchanged', 409)
  const parent = to ? await checkParent(env, to, asset.level) : null
  if (to) insist(await one(env, `SELECT ${NO_CYCLE} AS ok`, to, asset.id).then(row => row?.ok), 'cycle', 409)
  const toTag = parent ? (await one(env, 'SELECT tag FROM gk_assets WHERE id = ?', to))!.tag : null
  const detail = { tag: asset.tag, from: asset.parent_id, fromTag: asset.parent_tag ?? null, to, toTag }
  await commit(env, [
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_assets WHERE id = ? AND revision = ?)', asset.id, asset.revision),
    ...(to ? [guard(env, 'cycle', NO_CYCLE, to, asset.id), guard(env, 'parent_retired', 'EXISTS(SELECT 1 FROM gk_assets WHERE id = ? AND retired_at IS NULL)', to)] : []),
    stmt(env, 'UPDATE gk_assets SET parent_id = ?, revision = revision + 1, updated_at = ? WHERE id = ?', to, now(), asset.id),
  ], { actor: actor.id, action: 'asset.move', subject: asset.id, detail })
  return { id: asset.id, revision: asset.revision + 1 }
}

/** SQL: the ids of asset `?` and everything below it. */
export const SUBTREE = 'WITH RECURSIVE tree(id, depth) AS (SELECT ?, 0 UNION ALL SELECT a.id, tree.depth + 1 FROM gk_assets a JOIN tree ON a.parent_id = tree.id)'

/** Minutes covered by a set of outages, each overlap counted once. */
function unionMinutes(spans: { started_on: string; ended_on: string }[]) {
  let total = 0, start = '', end = ''
  for (const span of [...spans].sort((a, b) => a.started_on.localeCompare(b.started_on) || a.ended_on.localeCompare(b.ended_on))) {
    if (end && span.started_on <= end) { if (span.ended_on > end) end = span.ended_on; continue }
    if (end) total += minutesBetween(start, end)
    start = span.started_on; end = span.ended_on
  }
  return end ? total + minutesBetween(start, end) : total
}

/** One entry's place and roll-ups: path from the site, children, and subtree totals. */
export async function hierarchyOf(env: Bindings, asset: Row) {
  const path = await all(env, `WITH RECURSIVE up(id, depth) AS (SELECT ?, 0 UNION ALL SELECT a.parent_id, up.depth + 1 FROM gk_assets a JOIN up ON a.id = up.id WHERE a.parent_id IS NOT NULL)
    SELECT a.id, a.tag, a.name, a.level FROM up JOIN gk_assets a ON a.id = up.id WHERE up.depth > 0 ORDER BY up.depth DESC`, asset.id)
  const children = await all(env, 'SELECT id, tag, name, level, retired_at FROM gk_assets WHERE parent_id = ? ORDER BY tag', asset.id)
  const below = await all(env, `${SUBTREE} SELECT a.id, a.tag FROM tree JOIN gk_assets a ON a.id = tree.id WHERE tree.depth > 0 ORDER BY a.tag`, asset.id)
  const spans = await all(env, `${SUBTREE} SELECT d.asset_id, d.started_on, d.ended_on FROM gk_downtime d WHERE d.asset_id IN (SELECT id FROM tree) AND d.ended_on IS NOT NULL AND d.degraded = 0`, asset.id)
  const down = await all(env, `${SUBTREE} SELECT DISTINCT a.tag FROM gk_downtime d JOIN gk_assets a ON a.id = d.asset_id WHERE d.asset_id IN (SELECT id FROM tree) AND d.ended_on IS NULL AND d.degraded = 0 ORDER BY a.tag`, asset.id)
  const each = [...new Set(spans.map(span => span.asset_id))].reduce((sum, id) => sum + unionMinutes(spans.filter(span => span.asset_id === id)), 0)
  const rolled = unionMinutes(spans)
  const work = await one(env, `${SUBTREE} SELECT SUM(w.status NOT IN ('closed', 'cancelled')) AS open, SUM(w.status = 'closed') AS closed FROM gk_work_orders w WHERE w.asset_id IN (SELECT id FROM tree)`, asset.id)
  const cost = await one(env, `${SUBTREE} SELECT SUM(parts_cents) AS parts, SUM(labor_cents) AS labor, SUM(other_cents) AS other FROM gk_work_history WHERE asset_id IN (SELECT id FROM tree)`, asset.id)
  return {
    level: asset.level, parent: path.at(-1) ?? null, path, children: children.map(row => ({ ...row, retired: Boolean(row.retired_at), retired_at: undefined })),
    subtree: {
      below: below.map(row => row.tag), downNow: down.map(row => row.tag), openWork: work?.open ?? 0, closedWork: work?.closed ?? 0,
      downtimeMinutes: rolled, downtimeOverlapMinutes: each - rolled,
      movedInCostCents: { parts: cost?.parts ?? 0, labor: cost?.labor ?? 0, other: cost?.other ?? 0 },
    },
  }
}

/** The entries a lead may put `asset` under: active, of a level that holds it, and not the entry or below it. */
export async function parentChoices(env: Bindings, asset: Row | null, level: Level | null = null) {
  const excluded = asset ? new Set((await all(env, `${SUBTREE} SELECT id FROM tree`, asset.id)).map(row => row.id)) : new Set<string>()
  return (await all(env, 'SELECT id, tag, name, level FROM gk_assets WHERE retired_at IS NULL ORDER BY tag'))
    .filter(row => !excluded.has(row.id) && (!level || holds(row.level, level)))
}
