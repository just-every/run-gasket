import type { ToolContext, Person } from '../../modules/agent-door/index.ts'
import { ToolRefusal } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { type Actor, type Role, siteZone } from '../actor'
import { GasketError, one } from '../core'
import { today } from '../dates'
import { authorizeOperationalSite } from '../site-access'
import { withSiteAuthority } from '../site-context'
import { withServiceAuthority } from '../service-context'
import { withAgentContext, type NativePolicyFence } from './context'
import { gasketPeople } from './people'

export async function nativeActor(env: Bindings, person: Person): Promise<Actor> {
  const current = await gasketPeople(env).person(person.id)
  if (!current?.active) throw new ToolRefusal('unauthenticated')
  const zone = await siteZone(env)
  return { id: current.id, email: current.email, name: current.name, role: current.role as Role, sessionId: '', zone, today: today(zone) }
}
export async function nativeCall<T>(env: Bindings, ctx: ToolContext, run: (actor: Actor) => Promise<T>, effect = false): Promise<T> {
  try {
    const actor = await nativeActor(env, ctx.person)
    const credential = ctx.clientId?.startsWith('gasket-service:') ? ctx.clientId.slice('gasket-service:'.length) : undefined
    if (credential) {
      const row = await one(env, 'SELECT scopes_json FROM gk_api_credentials WHERE id=? AND revoked_at IS NULL AND expires_at>?', credential, Date.now())
      if (!row) throw new ToolRefusal('unauthenticated')
      actor.service = { id: credential, scopes: JSON.parse(row.scopes_json) }
    }
    await authorizeOperationalSite(env, actor, new Request(env.AUTH_ORIGIN))
    const policy = await one<NativePolicyFence>(env, 'SELECT envelope,local_document,local_revision FROM agent_door_state WHERE id=1')
    if (effect && !policy) throw new ToolRefusal('policy_unset')
    const envelope = policy?.envelope ? JSON.parse(policy.envelope) : null
    if (effect && envelope?.paused) throw new ToolRefusal('agents_paused')
    if (effect && envelope?.revoked?.consents?.includes(ctx.consent)) throw new ToolRefusal('consent_revoked')
    if (effect && envelope?.revoked?.agents?.includes(ctx.agent.id)) throw new ToolRefusal('unauthenticated')
    return await withAgentContext(ctx, policy ?? { envelope: null, local_document: null, local_revision: 0 }, () => withSiteAuthority(actor, () => withServiceAuthority(credential, () => run(actor))))
  } catch (error) {
    if (error instanceof GasketError) throw new ToolRefusal(error.code)
    throw error
  }
}
