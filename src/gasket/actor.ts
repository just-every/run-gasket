// The signed-in person as Gasket sees them: a Base operator-auth session joined
// to a Gasket member and that member's one role. Every handler asks for a
// capability here; the owner holds every role.
import { operatorAuth, type Bindings } from '../auth.server'
import { GasketError, insist, newId, now, one, stmt } from './core'
import { today } from './dates'

export const ROLES = ['lead', 'maintainer', 'supervisor', 'agent'] as const
export type Role = 'owner' | typeof ROLES[number]

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  lead: 'Maintenance lead',
  maintainer: 'Maintainer',
  supervisor: 'Supervisor',
  agent: 'Agent',
}

export type Capability =
  | 'site.manage' | 'register.manage' | 'work.create' | 'work.assign' | 'work.do' | 'work.review'
  | 'board.read' | 'history.export' | 'audit.read' | 'proposal.prepare' | 'proposal.decide' | 'import.run' | 'comment.write' | 'agent.run'

const GRANTS: Record<Role, Capability[]> = {
  owner: ['site.manage', 'register.manage', 'work.create', 'work.assign', 'work.do', 'work.review', 'board.read', 'history.export', 'audit.read', 'proposal.prepare', 'proposal.decide', 'import.run', 'comment.write', 'agent.run'],
  lead: ['register.manage', 'work.create', 'work.assign', 'work.do', 'board.read', 'history.export', 'proposal.prepare', 'proposal.decide', 'import.run', 'comment.write'],
  // FIELD-009 (slice): technicians create corrective and emergency work for themselves (ADMIN-003's default right).
  maintainer: ['work.create', 'work.do', 'comment.write'],
  supervisor: ['work.review', 'board.read', 'history.export', 'audit.read', 'comment.write'],
  agent: ['proposal.prepare'],
}

export interface Actor {
  id: string
  sessionId: string
  email: string
  name: string
  role: Role
  zone: string
  today: string
}

export const can = (actor: Actor, capability: Capability) => GRANTS[actor.role].includes(capability)

export function requireCapability(actor: Actor, capability: Capability) {
  insist(can(actor, capability), 'forbidden', 403)
}

export async function siteZone(env: Bindings): Promise<string> {
  return (await one<{ timezone: string }>(env, 'SELECT timezone FROM gk_site WHERE singleton = 1'))?.timezone ?? 'UTC'
}

export async function currentActor(env: Bindings, request: Request): Promise<Actor | null> {
  const session = await operatorAuth(env).getSession(request)
  if (!session) return null
  const email = session.operator.email.toLowerCase()
  const owner = session.operator.role === 'owner'
  let member = await one<{ id: string; name: string; role: Role; status: string }>(env, 'SELECT id, name, role, status FROM gk_members WHERE operator_id = ?', session.operator.id)
  if (!member && owner) {
    await env.DB.batch([stmt(env, "INSERT INTO gk_members (id, operator_id, email, name, role, created_at) VALUES (?, ?, ?, ?, 'owner', ?) ON CONFLICT DO NOTHING", newId(), session.operator.id, email, session.operator.displayName || email, now())])
    member = await one(env, 'SELECT id, name, role, status FROM gk_members WHERE operator_id = ?', session.operator.id)
  }
  if (!member) throw new GasketError('not_a_member', 403)
  insist(member.status === 'active' && session.operator.status === 'active', 'access_ended', 403)
  insist(owner || member.role !== 'owner', 'forbidden', 403)
  const zone = await siteZone(env)
  return { id: member.id, sessionId: session.id, email, name: member.name, role: owner ? 'owner' : member.role, zone, today: today(zone) }
}

/**
 * The same admission as SQL, for the import kit's in-batch authority checks:
 * the session is live, its operator active, and the member active with a role
 * that holds the capability.
 */
export function capabilitySql(sessionId: string, capability: Capability) {
  const roles = (Object.keys(GRANTS) as Role[]).filter(role => role !== 'owner' && GRANTS[role].includes(capability))
  return {
    sql: `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id = s.operator_id WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > CAST(strftime('%s','now') AS INTEGER) * 1000 AND o.version = s.operator_version AND o.status = 'active'
      AND EXISTS(SELECT 1 FROM gk_members m WHERE m.operator_id = o.id AND m.status = 'active' AND (o.role = 'owner' OR m.role IN (${roles.map(() => '?').join(', ') || "''"}))))`,
    params: [sessionId, ...roles],
  }
}
