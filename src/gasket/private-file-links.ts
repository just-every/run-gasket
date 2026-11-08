// Private manual links narrow an existing session's access; they never delegate it.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { insist, type Row } from './core'
import { documentFileResponse, readableDocumentRevision } from './documents'

const LIFETIME = 5 * 60_000
const encoder = new TextEncoder()

async function manual(env: Bindings, actor: Actor, id: string) {
  const row = await readableDocumentRevision(env, actor, id)
  insist(row.kind === 'manual', 'manual_required', 409)
  return row
}

async function signatureKey(env: Bindings) {
  return crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

// Neither the session identifier nor the private file metadata goes in the URL.
const identity = (actor: Actor, row: Row, expiresAt: number) => encoder.encode(JSON.stringify([
  'gasket-private-manual-v1', 'primary', actor.id, actor.sessionId,
  row.id, row.document_id, row.asset_id, row.kind, row.revision, row.filename, row.media_type, row.size, row.sha256, expiresAt,
]))

/** Stateless issuance: no stored bearer, access grant, renewal or outbound action. */
export async function issuePrivateManualLink(env: Bindings, actor: Actor, id: string) {
  const row = await manual(env, actor, id), expiresAt = Date.now() + LIFETIME
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signatureKey(env), identity(actor, row, expiresAt)))
  const proof = Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('')
  return { href: `/app/private-manual-files/${row.id}?expires=${expiresAt}&proof=${proof}`, expiresAt, filename: row.filename, revision: row.revision, asset: row.asset_id }
}

/** Recheck live record access, expiry, session and exact file identity on every use. */
export async function downloadPrivateManual(env: Bindings, actor: Actor, id: string, url: URL) {
  const row = await manual(env, actor, id)
  const expires = url.searchParams.get('expires') ?? '', proof = url.searchParams.get('proof') ?? ''
  insist(url.searchParams.getAll('expires').length === 1 && url.searchParams.getAll('proof').length === 1 && /^\d{13}$/.test(expires) && /^[a-f0-9]{64}$/.test(proof), 'private_link_invalid', 403)
  const expiresAt = Number(expires), instant = Date.now()
  insist(expiresAt > instant, 'private_link_expired', 410)
  insist(expiresAt <= instant + LIFETIME, 'private_link_invalid', 403)
  const signature = Uint8Array.from(proof.match(/../g)!, byte => parseInt(byte, 16))
  insist(await crypto.subtle.verify('HMAC', await signatureKey(env), signature, identity(actor, row, expiresAt)), 'private_link_invalid', 403)
  return documentFileResponse(row, true)
}
