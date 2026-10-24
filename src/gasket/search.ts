// Estate search uses the same record boundaries as the existing read doors.
// Result pages contain identities, never contacts, prices, attachments or secrets.
import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt } from './core'
import { isDate, localNow, zonedInstant, addDays } from './dates'
import { ASSET_STATUS } from './assets'
import type { Input } from './input'

const KINDS = ['asset', 'work', 'request', 'procedure', 'part', 'vendor']
const KEYS = ['kind', 'q', 'tag', 'serial', 'site', 'owner', 'from', 'to', 'status', 'field', 'value'] as const
export type SearchFilters = Record<typeof KEYS[number], string>
export function searchFilters(params: URLSearchParams): SearchFilters {
  const filters = Object.fromEntries(KEYS.map(key => [key, (params.get(key) ?? '').trim()])) as SearchFilters
  insist(KEYS.every(key => filters[key].length <= 200), 'search_filter_too_long')
  insist(!filters.kind || KINDS.includes(filters.kind), 'invalid_search_kind')
  insist(!filters.from || isDate(filters.from), 'invalid_from')
  insist(!filters.to || isDate(filters.to), 'invalid_to')
  insist(!filters.from || !filters.to || filters.from <= filters.to, 'invalid_date_range')
  insist(Boolean(filters.field) === Boolean(filters.value), 'search_field_requires_value')
  return filters
}

export async function savedSearches(env: Bindings, actor: Actor) {
  return (await all(env, 'SELECT id,owner_id,name,shared,filters_json,revision FROM gk_search_views WHERE owner_id=? OR shared=1 ORDER BY name,id', actor.id))
    .map(({ filters_json, ...row }) => ({ ...row, shared: Boolean(row.shared), filters: JSON.parse(filters_json) }))
}
export async function saveSearch(env: Bindings, actor: Actor, input: Input) {
  const name = input.text('name', { max: 100 }), supplied = input.json('filters')
  insist(supplied && typeof supplied === 'object' && !Array.isArray(supplied), 'invalid_filters')
  insist(Object.entries(supplied).every(([key, value]) => KEYS.includes(key as typeof KEYS[number]) && typeof value === 'string'), 'invalid_filters')
  const filters = searchFilters(new URLSearchParams(supplied as Record<string, string>))
  const id = input.text('id', { optional: true, max: 100 }) || newId(), shared = input.flag('shared')
  insist(!shared || actor.role === 'owner', 'forbidden', 403)
  const existing = await one(env, 'SELECT owner_id,revision FROM gk_search_views WHERE id=?', id)
  if (existing) insist(existing.owner_id === actor.id || actor.role === 'owner', 'forbidden', 403)
  const statements = existing ? [
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_search_views WHERE id=? AND revision=?)', id, input.integer('revision', { min: 1 })),
    stmt(env, 'UPDATE gk_search_views SET name=?,shared=?,filters_json=?,revision=revision+1 WHERE id=?', name, Number(shared), JSON.stringify(filters), id),
  ] : [stmt(env, 'INSERT INTO gk_search_views (id,owner_id,name,shared,filters_json,created_at) VALUES (?,?,?,?,?,?)', id, actor.id, name, Number(shared), JSON.stringify(filters), now())]
  await commit(env, statements, { actor: actor.id, action: 'search.save', subject: id, detail: { shared } })
  return { id, revision: existing ? existing.revision + 1 : 1 }
}
export async function deleteSearch(env: Bindings, actor: Actor, input: Input) {
  const id = input.text('id', { max: 100 }), revision = input.integer('revision', { min: 1 })
  const existing = await one(env, 'SELECT owner_id FROM gk_search_views WHERE id=?', id)
  insist(existing, 'search_view_not_found', 404)
  insist(existing.owner_id === actor.id || actor.role === 'owner', 'forbidden', 403)
  await commit(env, [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_search_views WHERE id=? AND revision=?)', id, revision), stmt(env, 'DELETE FROM gk_search_views WHERE id=?', id)], { actor: actor.id, action: 'search.delete', subject: id })
  return { id }
}

export async function searchEstate(env: Bindings, actor: Actor, url: URL) {
  let params = url.searchParams
  const view = params.get('view')
  if (view) {
    const saved = await one(env, 'SELECT filters_json FROM gk_search_views WHERE id=? AND (owner_id=? OR shared=1)', view, actor.id)
    insist(saved, 'search_view_not_found', 404)
    // Paging controls may change; a saved view's filters never change implicitly.
    insist(KEYS.every(key => !params.has(key)), 'saved_search_filter_override')
    params = new URLSearchParams({ ...JSON.parse(saved.filters_json), ...Object.fromEntries([...params].filter(([key]) => !KEYS.includes(key as typeof KEYS[number]))) })
  }
  const filters = searchFilters(params), limitText = params.get('limit') ?? '100'
  insist(/^\d{1,3}$/.test(limitText) && +limitText >= 1 && +limitText <= 200, 'invalid_limit')
  const limit = +limitText
  // Dates refer to the site's local creation day. Work uses its due date.
  const site = await one(env, 'SELECT name FROM gk_site WHERE singleton=1')
  const wide = can(actor, 'work.assign') || can(actor, 'work.review') || actor.role === 'agent'
  const pieces = [
    `SELECT 'asset' AS kind,a.id,a.name AS title,a.tag,a.serial,a.custodian AS owner,${ASSET_STATUS} AS status,a.created_at AS stamp,NULL AS due,a.location,'/app/assets/'||a.id AS href FROM gk_assets a`,
    `SELECT 'work',w.id,w.title,a.tag,a.serial,w.assignee_id,w.status,w.created_at,w.due_date,COALESCE(a.location,w.location),'/app/work/'||w.id FROM gk_work_orders w LEFT JOIN gk_assets a ON a.id=w.asset_id ${wide ? '' : "WHERE w.assignee_id=? OR EXISTS(SELECT 1 FROM gk_collaborators c WHERE c.work_order_id=w.id AND c.member_id=? AND c.removed_at IS NULL)"}`,
    `SELECT 'procedure',id,name,NULL,NULL,created_by,'published',created_at,NULL,NULL,'/app/checklists/'||id FROM gk_checklists`,
    `SELECT 'part',p.id,p.name,p.number,NULL,NULL,'active',p.created_at,NULL,p.location,'/app/parts/'||p.id FROM gk_parts p WHERE NOT EXISTS(SELECT 1 FROM gk_part_canonical c WHERE c.part_id=p.id)`,
    `SELECT 'vendor',id,name,NULL,NULL,NULL,CASE active WHEN 1 THEN 'active' ELSE 'inactive' END,updated_at,NULL,NULL,'/app/suppliers/'||id FROM gk_suppliers`,
  ]
  const args: unknown[] = wide ? [] : [actor.id, actor.id]
  if (can(actor, 'work.assign')) pieces.push(`SELECT 'request',r.id,r.description,a.tag,a.serial,r.requester_id,r.status,r.created_at,NULL,COALESCE(a.location,r.location),'/app/requests/'||r.id FROM gk_requests r LEFT JOIN gk_assets a ON a.id=r.asset_id`)
  const where: string[] = [], values: unknown[] = []
  const add = (sql: string, ...bind: unknown[]) => { where.push(sql); values.push(...bind) }
  if (filters.kind) add('kind=?', filters.kind)
  if (filters.q) add("instr(lower(COALESCE(title,'')||' '||COALESCE(tag,'')||' '||COALESCE(serial,'')||' '||COALESCE(location,'')),lower(?))>0", filters.q)
  for (const key of ['tag', 'serial', 'owner', 'status'] as const) if (filters[key]) add(`${key}=? COLLATE NOCASE`, filters[key])
  if (filters.site) add('?=? COLLATE NOCASE', filters.site, site?.name ?? '')
  if (filters.field) add("kind='work' AND EXISTS(SELECT 1 FROM gk_work_field_values f WHERE f.work_order_id=estate.id AND f.field_id=? AND f.value=?)", filters.field, filters.value)
  // D1 stores epoch instants; UTC bounds cover the local-day interval, including DST.
  if (filters.from) add('(CASE WHEN kind=\'work\' THEN due>=? ELSE stamp>=? END)', filters.from, zonedInstant(actor.zone, filters.from + 'T00:00'))
  if (filters.to) add('(CASE WHEN kind=\'work\' THEN due<=? ELSE stamp<? END)', filters.to, zonedInstant(actor.zone, addDays(filters.to, 1) + 'T00:00'))
  const identity = await sha256Hex(JSON.stringify({ filters, actor: actor.id, role: actor.role, zone: actor.zone }))
  let after = ''
  if (params.has('cursor')) {
    try { const cursor = JSON.parse(atob(params.get('cursor')!)); insist(cursor.query === identity && typeof cursor.after === 'string' && /^[a-z]+:[\w-]+$/.test(cursor.after), 'invalid_cursor'); after = cursor.after }
    catch { insist(false, 'invalid_cursor') }
  }
  // Keep each compound below D1's five-term SQL limit.
  const union = [pieces.slice(0, 3), pieces.slice(3)].map(group => `SELECT * FROM (${group.join(' UNION ALL ')})`).join(' UNION ALL ')
  const source = `WITH estate AS (${union}), filtered AS (SELECT * FROM estate ${where.length ? 'WHERE ' + where.join(' AND ') : ''})`
  const bindings = [...args, ...values]
  const results = await env.DB.batch<Record<string, any>>([
    stmt(env, `${source} SELECT COUNT(*) AS total FROM filtered`, ...bindings),
    stmt(env, `${source} SELECT * FROM filtered WHERE kind||':'||id>? ORDER BY kind,id LIMIT ?`, ...bindings, after, limit + 1),
  ])
  const rows: Record<string, any>[] = results[1].results.slice(0, limit).map(row => ({ ...row, date: row.kind === 'work' ? row.due : localNow(actor.zone, row.stamp as number).slice(0, 10), site: site?.name ?? '' }))
  const last = rows.at(-1)
  return { filters, total: results[0].results[0].total, rows, next: results[1].results.length > limit && last ? btoa(JSON.stringify({ query: identity, after: `${last.kind}:${last.id}` })) : null }
}
