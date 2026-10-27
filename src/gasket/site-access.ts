// Site metadata is separate from operational access. Planned sites hold no estate.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import { isTimeZone } from './dates'
import type { Input } from './input'

const ownerOnly = (actor: Actor) => insist(actor.role === 'owner' && !actor.service, 'forbidden', 403)
const ownerGuard = (env: Bindings, actor: Actor) => guard(env, 'site_authority_ended', `EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id JOIN oa_sessions s ON s.operator_id=o.id
  WHERE m.id=? AND m.status='active' AND o.status='active' AND o.role='owner' AND s.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.operator_version=o.version)`, actor.id, actor.sessionId, now())

export async function siteDirectory(env: Bindings, actor: Actor, id?: string) {
  const rows = await all(env, `SELECT s.id,s.name,s.timezone,s.state,s.revision,COALESCE(sm.manager,0) AS manager FROM gk_sites s
    LEFT JOIN gk_site_memberships sm ON sm.site_id=s.id AND sm.member_id=? AND sm.status='active'
    WHERE (? OR sm.member_id IS NOT NULL) ${id ? 'AND s.id=?' : ''} ORDER BY s.created_at,s.id`, actor.id, actor.role === 'owner' ? 1 : 0, ...(id ? [id] : []))
  if (!id) return rows
  insist(rows.length === 1, 'site_not_found', 404)
  if (actor.role !== 'owner') return rows[0]
  return { ...rows[0], members: await all(env, `SELECT sm.member_id,sm.status,sm.manager,sm.revision,m.name,m.role,m.status AS member_status
    FROM gk_site_memberships sm JOIN gk_members m ON m.id=sm.member_id WHERE sm.site_id=? ORDER BY m.name,m.id`, id) }
}

/** Explicit site selection never falls back to another site's estate. */
export async function authorizeOperationalSite(env: Bindings, actor: Actor, request: Request) {
  const selected = request.headers.get('x-gasket-site') ?? 'primary'
  const row = await one(env, `SELECT s.state FROM gk_sites s LEFT JOIN gk_site_memberships sm ON sm.site_id=s.id AND sm.member_id=? AND sm.status='active'
    WHERE s.id=? AND (? OR sm.member_id IS NOT NULL)`, actor.id, selected, actor.role === 'owner' ? 1 : 0)
  // The unconfigured installation must still let its owner configure the first site.
  if (!row && selected === 'primary' && actor.role === 'owner' && !await one(env, 'SELECT 1 FROM gk_site WHERE singleton=1')) return
  insist(row, 'site_not_found', 404)
  insist(row.state === 'active' && selected === 'primary', 'site_not_operational', 409)
}

export async function createSite(env: Bindings, actor: Actor, input: Input) {
  ownerOnly(actor)
  input.only(['name', 'timezone', 'returnTo'])
  insist(await one(env, "SELECT 1 FROM gk_sites WHERE id='primary'"), 'site_not_set_up', 409)
  const name = input.text('name', { max: 120 }), timezone = input.text('timezone', { max: 64 }), id = newId()
  insist(isTimeZone(timezone), 'invalid_timezone')
  await commit(env, [ownerGuard(env, actor), stmt(env, "INSERT INTO gk_sites(id,name,timezone,state,created_at,updated_at) VALUES (?,?,?,'planned',?,?)", id, name, timezone, now(), now())],
    { actor: actor.id, action: 'site.create', subject: id, detail: { siteId: id, name, timezone, state: 'planned' } })
  return { id, name, timezone, state: 'planned', revision: 1 }
}

export async function updateSite(env: Bindings, actor: Actor, input: Input) {
  ownerOnly(actor)
  input.only(['site', 'revision', 'name', 'timezone', 'returnTo'])
  const id = input.text('site', { max: 100 }), revision = input.integer('revision', { min: 1 })!
  const name = input.text('name', { max: 120 }), timezone = input.text('timezone', { max: 64 })
  insist(isTimeZone(timezone), 'invalid_timezone')
  insist(await one(env, "SELECT 1 FROM gk_sites WHERE id=? AND state='planned'", id), 'planned_site_not_found', 404)
  await commit(env, [ownerGuard(env, actor), guard(env, 'stale', "EXISTS(SELECT 1 FROM gk_sites WHERE id=? AND revision=? AND state='planned')", id, revision),
    stmt(env, 'UPDATE gk_sites SET name=?,timezone=?,revision=revision+1,updated_at=? WHERE id=?', name, timezone, now(), id)],
    { actor: actor.id, action: 'site.update', subject: id, detail: { siteId: id, name, timezone, revision } })
  return { id, revision: revision + 1 }
}

export async function setSiteMembership(env: Bindings, actor: Actor, input: Input) {
  ownerOnly(actor)
  input.only(['site', 'member', 'status', 'manager', 'revision', 'returnTo'])
  const site = input.text('site', { max: 100 }), member = input.text('member', { max: 100 })
  insist(site !== 'primary', 'primary_membership_managed_by_access', 409)
  const status = input.text('status', { max: 10 }), manager = input.flag('manager') ? 1 : 0
  const revision = input.integer('revision', { min: 0 })!
  insist(status === 'active' || status === 'ended', 'invalid_status')
  insist(await one(env, 'SELECT 1 FROM gk_sites WHERE id=?', site), 'site_not_found', 404)
  const person = await one(env, 'SELECT role,status FROM gk_members WHERE id=?', member)
  insist(person, 'member_not_found', 404)
  insist(person.role !== 'owner', 'owner_access_fixed', 409)
  insist(person.status === 'active', 'access_ended', 409)
  await commit(env, [ownerGuard(env, actor), guard(env, 'access_ended', "EXISTS(SELECT 1 FROM gk_members WHERE id=? AND status='active' AND role!='owner')", member),
    guard(env, 'stale', 'COALESCE((SELECT revision FROM gk_site_memberships WHERE site_id=? AND member_id=?),0)=?', site, member, revision),
    stmt(env, `INSERT INTO gk_site_memberships(site_id,member_id,status,manager,revision,updated_at) VALUES (?,?,?,?,1,?)
      ON CONFLICT(site_id,member_id) DO UPDATE SET status=excluded.status,manager=excluded.manager,revision=gk_site_memberships.revision+1,updated_at=excluded.updated_at`, site, member, status, manager, now())],
    { actor: actor.id, action: 'site.membership', subject: member, detail: { siteId: site, status, manager: Boolean(manager), revision } })
  return { site, member, status, manager: Boolean(manager), revision: revision + 1 }
}
