// Clause 1: the one site and the people with access to it. Sign-in accounts are
// Base operator-auth operators (all 'member' except the owner); the Gasket role
// lives in gk_members and is checked by every handler.
import { operatorAuth, type Bindings } from '../auth.server'
import { ROLES, can, requireCapability, type Actor, type Role } from './actor'
import { all, commit, insist, newId, now, one, stmt } from './core'
import { isTimeZone } from './dates'
import type { Input } from './input'

export async function site(env: Bindings) {
  return await one<{ name: string; timezone: string; lead_days: number; technician_create_work: number }>(env, 'SELECT name, timezone, lead_days, technician_create_work FROM gk_site WHERE singleton = 1')
}

/**
 * FIELD-009: creating work is a default right of the technician (maintainer) role that the owner turns off, and back on,
 * for the site; while it is off every create door refuses a technician. Leads and the owner always create work.
 */
export async function createsWork(env: Bindings, actor: Actor) {
  if (!can(actor, 'work.create')) return false
  return actor.role !== 'maintainer' || (await site(env))?.technician_create_work !== 0
}

export async function setTechnicianWork(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const current = await site(env)
  insist(current, 'site_not_set_up', 409)
  const allowed = input.flag('allowed')
  insist(Boolean(current.technician_create_work) !== allowed, 'unchanged', 409)
  await commit(env, [stmt(env, 'UPDATE gk_site SET technician_create_work = ?, updated_at = ? WHERE singleton = 1', allowed ? 1 : 0, now())],
    { actor: actor.id, action: 'site.technicianwork', subject: 'site', detail: { site: current.name, allowed } })
  return { allowed }
}

/** PM-001: the site's lead time, the whole days ahead of its due date that calendar PM work is issued. */
export const leadDays = async (env: Bindings) => (await site(env))?.lead_days ?? 7

export async function configureSite(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const name = input.text('name', { max: 120 }), timezone = input.text('timezone', { max: 64 })
  insist(isTimeZone(timezone), 'invalid_timezone')
  const lead = input.integer('leadDays', { min: 0, max: 90, optional: true }) ?? await leadDays(env)
  await commit(env, [stmt(env, `INSERT INTO gk_site (singleton, name, timezone, lead_days, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(singleton) DO UPDATE SET name = excluded.name, timezone = excluded.timezone, lead_days = excluded.lead_days, updated_at = excluded.updated_at`, name, timezone, lead, now(), now())],
  { actor: actor.id, action: 'site.configure', subject: 'site', detail: { name, timezone, leadDays: lead } })
  return { name, timezone, leadDays: lead }
}

export async function members(env: Bindings) {
  return await all<{ id: string; email: string; name: string; role: Role; status: string }>(env, "SELECT id, email, name, role, status FROM gk_members ORDER BY status, CASE role WHEN 'owner' THEN 0 ELSE 1 END, name")
}

/** People who may be assigned work: active owner, leads and maintainers. */
export async function assignable(env: Bindings) {
  return await all<{ id: string; name: string; role: Role }>(env, "SELECT id, name, role FROM gk_members WHERE status = 'active' AND role IN ('owner', 'lead', 'maintainer') ORDER BY name")
}

async function operatorByEmail(env: Bindings, request: Request, email: string) {
  return (await operatorAuth(env).listOperators(request)).find(operator => operator.email.toLowerCase() === email) ?? null
}

const role = (input: Input) => {
  const value = input.text('role', { max: 20 }) as Role
  insist((ROLES as readonly string[]).includes(value), 'invalid_role')
  return value
}

/** Gives a person sign-in access with one role; sends them Base's ordinary invitation. */
export async function giveAccess(env: Bindings, actor: Actor, input: Input, request: Request) {
  requireCapability(actor, 'site.manage')
  const email = input.text('email', { max: 200 }).toLowerCase(), name = input.text('name', { max: 120 }), chosen = role(input)
  insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'invalid_email')
  const member = await one(env, 'SELECT * FROM gk_members WHERE email = ?', email)
  insist(!member || member.status === 'ended', 'already_has_access', 409)
  const auth = operatorAuth(env), operator = await operatorByEmail(env, request, email)
  insist(operator?.role !== 'owner', 'owner_access_fixed', 409)
  if (!operator) await auth.invite(request, { email, displayName: name, role: 'member', returnTo: '/app' })
  else if (operator.status === 'inactive') await auth.setOperatorStatus(request, operator.id, 'active')
  const id = member?.id ?? newId()
  await commit(env, [member
    ? stmt(env, "UPDATE gk_members SET name = ?, role = ?, status = 'active' WHERE id = ?", name, chosen, id)
    : stmt(env, "INSERT INTO gk_members (id, email, name, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)", id, email, name, chosen, now())],
  { actor: actor.id, action: 'access.give', subject: id, detail: { email, role: chosen, invited: !operator } })
  return { id, email, role: chosen }
}

export async function setRole(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const member = await one(env, 'SELECT * FROM gk_members WHERE id = ?', input.text('member', { max: 100 }))
  insist(member, 'member_not_found', 404)
  insist(member.role !== 'owner', 'owner_access_fixed', 409)
  insist(member.status === 'active', 'access_ended', 409)
  const chosen = role(input)
  await commit(env, [stmt(env, 'UPDATE gk_members SET role = ? WHERE id = ?', chosen, member.id)], { actor: actor.id, action: 'access.role', subject: member.id, detail: { from: member.role, to: chosen } })
  return { id: member.id, role: chosen }
}

/** Ends access at once: the sign-in is deactivated and every session revoked. */
export async function endAccess(env: Bindings, actor: Actor, input: Input, request: Request) {
  requireCapability(actor, 'site.manage')
  const member = await one(env, 'SELECT * FROM gk_members WHERE id = ?', input.text('member', { max: 100 }))
  insist(member, 'member_not_found', 404)
  insist(member.role !== 'owner', 'owner_access_fixed', 409)
  insist(member.status === 'active', 'access_ended', 409)
  const auth = operatorAuth(env), operator = await operatorByEmail(env, request, member.email)
  if (operator && operator.status !== 'inactive') {
    await auth.setOperatorStatus(request, operator.id, 'inactive')
    for (const session of await auth.listSessions(request, operator.id)) if (session.active) await auth.revokeSession(request, session.id)
  }
  await commit(env, [stmt(env, "UPDATE gk_members SET status = 'ended' WHERE id = ?", member.id)], { actor: actor.id, action: 'access.end', subject: member.id })
  return { id: member.id, status: 'ended' }
}
