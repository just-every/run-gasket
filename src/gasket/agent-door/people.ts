import type { PeopleAdapter, Person } from '../../modules/agent-door/index.ts'
import { operatorAuthPeople } from '../../modules/agent-door/index.ts'
import { currentActor } from '../actor'
import { one } from '../core'
import { operatorAuth, authConfig, type Bindings } from '../../auth.server'

/** Business IDs bind to operators; maintenance authority stays on the native member. */
export function gasketPeople(env: Bindings): PeopleAdapter {
  const policyRoles = new Map<string, 'owner' | 'editor' | null>()
  const native = operatorAuthPeople({ db: env.DB, allowList: authConfig(env).allowList, session: request => operatorAuth(env).getSession(request) })
  const fromOperator = async (operator: Person | null): Promise<Person | null> => {
    if (!operator) return null
    const member = await one(env, 'SELECT id,name,role,status FROM gk_members WHERE operator_id=?', operator.id)
    if (!member || member.role === 'agent' || member.role === 'owner' && operator.role !== 'owner') return null
    const admitted = operator.role === 'owner' || !!await one(env, "SELECT 1 FROM gk_site_memberships WHERE member_id=? AND site_id='primary' AND status='active'", member.id)
    const person = { id: member.id, email: operator.email, name: member.name, role: operator.role === 'owner' ? 'owner' : member.role, active: operator.active && member.status === 'active' && admitted }
    const admin = await one(env, `SELECT 1 FROM bs_team t JOIN bs_settings s ON s.singleton=1 AND s.stopped=0
      WHERE t.operator_id=? AND t.business_id IS NOT NULL AND t.business_role='admin' AND t.state IN ('active','invited')`, operator.id)
    policyRoles.set(person.id, operator.role === 'owner' ? 'owner' : admin ? 'editor' : null)
    return person
  }
  const operatorId = async (id: string) => (await one(env, 'SELECT operator_id FROM gk_members WHERE id=?', id))?.operator_id as string | undefined
  return {
    async sponsor(claims) {
      const settings = await one(env, 'SELECT owner_id FROM bs_settings WHERE singleton=1 AND stopped=0')
      if (!settings || settings.owner_id !== claims.sub && !await one(env, "SELECT 1 FROM bs_team WHERE business_id=? AND state IN ('active','invited')", claims.sub)) return null
      return fromOperator(await native.sponsor(claims))
    },
    async person(id) { const operator = await operatorId(id); return operator ? fromOperator(await native.person(operator)) : null },
    async session(request) { const actor = await currentActor(env, request); return actor ? this.person(actor.id) : null },
    businessRole(person) { return policyRoles.get(person.id) ?? null },
    async businessMember(person) {
      if (!await one(env, 'SELECT 1 FROM bs_settings WHERE singleton=1 AND stopped=0')) return null
      const id = await operatorId(person.id), operator = id ? await native.person(id) : null
      if (!operator?.active) return null
      const mapping = await native.businessMember!(operator)
      if (!mapping || mapping.role === 'owner') return mapping
      return await one(env, "SELECT 1 FROM bs_team WHERE business_id=? AND state IN ('active','invited')", mapping.id) ? mapping : null
    },
  }
}
