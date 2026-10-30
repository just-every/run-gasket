import { correctiveProposalTools } from './outcomes'
import { intervalProposalTools } from './intervals'
import { procedureTools } from './procedures'
import { createAgentDoor, type Trust } from '../../modules/agent-door/index.ts'
import { runtimeBindings, type Bindings } from '../../auth.server'
import { serviceActor } from '../service-auth'
import { one } from '../core'
import { gasketPeople } from './people'
import { mutationTools } from './tools'
import { recordResources, recordTools } from './records'

function trust(env: Bindings): Trust | null {
  const issuer = env.RER_OWNER_CLAIM_ISSUER, installationId = env.RER_OWNER_CLAIM_INSTALLATION_ID, publicKeys = env.RER_OWNER_CLAIM_PUBLIC_KEYS
  if (![issuer, installationId, publicKeys].some(Boolean)) return null
  if (!issuer || !installationId || !publicKeys) throw new Error('Incomplete agent door trust')
  return { issuer, installationId, appOrigin: env.AUTH_ORIGIN, publicKeys: JSON.parse(publicKeys) }
}
export const notTools = [
  { clauses: ['GAS-12','MIG-001','MIG-002','MIG-003','MIG-004','MIG-005','MIG-006','MIG-007','MIG-008'], reason: 'import-door' as const },
  { clauses: ['HTTP-001','SAFE-003'], reason: 'installation' as const },
  { clauses: ['FIELD-001','FIELD-002','FIELD-003','FIELD-010'], reason: 'device' as const },
  { clauses: ['ADMIN-011'], reason: 'screen' as const },
]
export const capabilities = ['tools', 'policy', 'pause', 'audit', 'idempotency'] as const
export function gasketAgentDoor(original: Bindings) {
  const env = runtimeBindings(original)
  return createAgentDoor({ seed: 'gasket', name: 'Gasket', specialist: 'maintenance coordinator', db: env.DB, origin: env.AUTH_ORIGIN,
    trust: trust(env), people: gasketPeople(env), tools: [...recordTools(env), ...mutationTools(env), ...procedureTools(env), ...correctiveProposalTools(env), ...intervalProposalTools(env)], resources: recordResources(env), notTools, capabilities,
    async localCredentials(request) {
      try {
        const actor = await serviceActor(env, request)
        return { sponsor: { id: actor.id }, agent: { id: `gasket-service:${actor.service!.id}`, name: 'Gasket service', specialist: 'maintenance coordinator' }, scopes: actor.service!.scopes, clientId: `gasket-service:${actor.service!.id}` }
      } catch { return null }
    },
    async currentScopes(principal) {
      if (!principal.clientId?.startsWith('gasket-service:')) return principal.scopes
      const credential = await one(env, 'SELECT scopes_json FROM gk_api_credentials WHERE id=? AND revoked_at IS NULL AND expires_at>?', principal.clientId.slice('gasket-service:'.length), Date.now())
      return credential ? JSON.parse(credential.scopes_json) : []
    },
  })
}
