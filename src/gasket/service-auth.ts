// Owner-issued service credentials are explicit, narrow, expiring and revocable.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, commit, insist, newId, now, one, sha256Hex, stmt } from './core'
import { today } from './dates'
import type { Input } from './input'

const SCOPES = ['assets:read', 'work:read', 'parts:read', 'asset.create', 'asset.update', 'part.create', 'part.receive', 'part.count', 'workorder.create']
export async function createServiceCredential(env: Bindings, actor: Actor, input: Input) {
  insist(actor.role === 'owner' && !actor.service, 'forbidden', 403)
  insist(input.flag('consent'), 'service_consent_required')
  const name = input.text('name', { max: 100 }), scopes = [...new Set(input.list('scopes'))]
  insist(scopes.length > 0 && scopes.every(scope => SCOPES.includes(scope)), 'invalid_service_scope')
  const expiresAt = input.integer('expiresAt', { min: now() + 60_000, max: now() + 90 * 86400_000 })!
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_api_credentials(id,member_id,name,token_hash,scopes_json,expires_at,created_at) VALUES (?,?,?,?,?,?,?)', id, actor.id, name, await sha256Hex(token), JSON.stringify(scopes), expiresAt, now())],
    { actor: actor.id, action: 'service.create', subject: id, detail: { name, scopes, expiresAt, consent: true } })
  return { id, token, name, scopes, expiresAt }
}

export async function revokeServiceCredential(env: Bindings, actor: Actor, input: Input) {
  insist(actor.role === 'owner' && !actor.service, 'forbidden', 403)
  const id = input.text('credential', { max: 100 })
  insist(await one(env, 'SELECT 1 FROM gk_api_credentials WHERE id=? AND member_id=?', id, actor.id), 'credential_not_found', 404)
  await commit(env, [stmt(env, 'UPDATE gk_api_credentials SET revoked_at=COALESCE(revoked_at,?) WHERE id=?', now(), id)], { actor: actor.id, action: 'service.revoke', subject: id })
  return { id }
}

export async function serviceCredentials(env: Bindings, actor: Actor) {
  insist(actor.role === 'owner' && !actor.service, 'forbidden', 403)
  return all(env, 'SELECT id,name,scopes_json,expires_at,created_at,revoked_at FROM gk_api_credentials WHERE member_id=? ORDER BY created_at,id', actor.id)
}

export async function serviceActor(env: Bindings, request: Request): Promise<Actor> {
  const authorization = request.headers.get('authorization') ?? ''
  insist(/^Bearer [a-f0-9]{64}$/.test(authorization), 'invalid_service_credential', 401)
  const row = await one(env, `SELECT c.id AS credential,c.scopes_json,c.expires_at,c.revoked_at,m.id,m.email,m.name,m.status,m.role,o.status AS operator_status,o.role AS operator_role
    FROM gk_api_credentials c JOIN gk_members m ON m.id=c.member_id JOIN oa_operators o ON o.id=m.operator_id WHERE c.token_hash=?`, await sha256Hex(authorization.slice(7)))
  insist(row && row.revoked_at === null && row.expires_at > now(), 'invalid_service_credential', 401)
  insist(row.status === 'active' && row.operator_status === 'active' && row.operator_role === 'owner', 'service_authority_ended', 403)
  const zone = (await one(env, 'SELECT timezone FROM gk_site WHERE singleton=1'))?.timezone ?? 'UTC'
  return { id: row.id, sessionId: '', email: row.email, name: row.name, role: 'owner', zone, today: today(zone), service: { id: row.credential, scopes: JSON.parse(row.scopes_json) } }
}

export function authorizeService(actor: Actor, request: Request, path: string) {
  if (!actor.service) return
  const read = path.match(/^(assets|parts|work)(?:\/[\w-]+(?:\/history)?)?$/)
  const scope = request.method === 'POST' ? path : read ? `${read[1]}:read` : ''
  // Neither site administration nor approvals can ever be delegated here.
  insist(SCOPES.includes(scope) && actor.service.scopes.includes(scope), 'service_scope_forbidden', 403)
}
