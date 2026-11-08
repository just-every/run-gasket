import { createBusinessSettings, type TeamAdapter, type BusinessManifest } from '../../modules/business-settings/index.ts'
import { operatorAuth, type Bindings } from '../../auth.server'
import { newId, now, one, stmt } from '../core'

export const businessManifest: BusinessManifest = { settings: 1, values: ['display_name'], team: { roles: { admin: 'lead', member: 'maintainer' } } }

/** Reuse native invitation preparation, then join the real maintenance members in its guarded batch. */
function maintenanceTeam(env: Bindings): TeamAdapter {
  const operators = operatorAuth(env).businessTeam!
  return {
    ownerEmail: operators.ownerEmail,
    async prepare(input) {
      const prepared = await operators.prepare({ ...input, roles: { admin: 'member', member: 'member' } })
      const statements = [...prepared.statements]
      for (const row of prepared.rows) {
        if (!row.operatorId || row.state === 'conflict') continue
        const existing = await one(env, 'SELECT id,role FROM gk_members WHERE operator_id=?', row.operatorId)
        const desired = input.members.find(member => member.email === row.email)
        const role = desired?.role === 'admin' ? 'lead' : 'maintainer'
        const memberId = existing?.id ?? newId()
        // A native owner is never a team role, and an unrelated email cannot be adopted.
        statements.push(stmt(env, `INSERT INTO bs_assert(value) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM gk_members WHERE (email=? AND operator_id IS NOT ?) OR (operator_id=? AND role='owner')) THEN 1 ELSE NULL END`, row.email, row.operatorId, row.operatorId))
        if (desired) statements.push(stmt(env, `INSERT INTO gk_members(id,operator_id,email,name,role,status,created_at)
          SELECT ?,?,?,?,?, 'active',? WHERE ${input.guard.sql}
          ON CONFLICT(operator_id) DO UPDATE SET name=excluded.name,role=excluded.role,status='active'`,
          memberId, row.operatorId, row.email, desired.name, role, now(), ...input.guard.args))
        else if (existing) statements.push(stmt(env, `UPDATE gk_members SET status='ended' WHERE id=? AND role!='owner' AND ${input.guard.sql}`, existing.id, ...input.guard.args))
        statements.push(stmt(env, `INSERT INTO gk_audit(at,actor,role,action,subject,detail)
          SELECT ?,m.id,'owner','business.access',?,? FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id
          JOIN oa_bootstrap b ON b.claim_id=o.id WHERE o.role='owner' AND o.status='active' AND ${input.guard.sql}`,
          now(), memberId, JSON.stringify({ via: 'Business', businessId: desired?.id ?? input.managed.find(item => item.operatorId === row.operatorId)?.businessId ?? null, role: desired ? role : existing?.role, status: desired ? 'active' : 'ended' }), ...input.guard.args))
      }
      return { ...prepared, statements }
    },
  }
}
export function gasketBusiness(env: Bindings) {
  return createBusinessSettings({ db: env.DB, trust: env.RER_BUSINESS_TRUST, business: businessManifest, team: maintenanceTeam(env) })
}
