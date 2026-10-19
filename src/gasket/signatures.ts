// FIELD-005: named signatures bound to the exact work version. The technician
// doing the work signs as themselves; a customer signs on their device by the
// name they give (with an optional drawn mark); a supervisor signs submitted
// work they review. Signing never changes the work, but any later change to it
// does: a signature for an earlier version is stale, and submission waits until
// each technician and customer signer has signed the current one. A signature
// confirms the work record at that version; it is not an equipment
// certification, and a customer's name is as they gave it, not verified.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from './core'
import { isCollaborator } from './crew'
import type { Input } from './input'
import { didWork } from './review'
import { OPEN, workOrder, type Door } from './work'

export const ROLES = ['technician', 'customer', 'supervisor'] as const
const MARK_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }

export async function sign(env: Bindings, actor: Actor, input: Input, door: Door) {
  const order = await workOrder(env, input.text('workOrder', { max: 100 }))
  const role = input.text('role', { max: 12 }) as typeof ROLES[number]
  insist(ROLES.includes(role), 'invalid_role')
  if (role === 'supervisor') {
    requireCapability(actor, 'work.review')
    insist(order.status === 'submitted', 'not_submitted', 409)
    insist(order.assignee_id !== actor.id && !await didWork(env, order.id, actor.id), 'own_work', 403)
  } else {
    requireCapability(actor, 'work.do')
    insist(order.assignee_id === actor.id || await isCollaborator(env, order.id, actor.id), 'not_your_work', 403)
    insist(['open', 'in_progress', 'returned'].includes(order.status), 'work_order_not_open', 409)
  }
  const version = input.integer('version', { min: 1, max: 1_000_000 })
  insist(version === order.version, 'stale', 409, { current: order.version })
  const name = role === 'customer' ? input.text('name', { max: 120 }) : actor.name
  const file = role === 'customer' ? await input.file('mark', { optional: true, maxBytes: 200_000 }) : null
  const markType = file ? MARK_TYPES[file.filename.split('.').pop()?.toLowerCase() ?? ''] : null
  if (file) insist(markType, 'unsupported_file_type')
  const id = newId(), markSha = file ? await sha256Hex(file.bytes) : null
  await commit(env, [guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status IN ${role === 'supervisor' ? "('submitted')" : OPEN})`, order.id, version),
    stmt(env, 'INSERT INTO gk_signatures (id, work_order_id, version, role, signer_name, member_id, mark, mark_sha256, door, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, order.id, version, role, name, role === 'customer' ? null : actor.id, file?.bytes ?? null, markSha, door, actor.id, now())],
  { actor: actor.id, action: 'workorder.sign', subject: order.id, detail: { signature: id, role, name, version, door, ...(markSha ? { markSha256: markSha } : {}) } })
  return { id: order.id, signature: id }
}

/**
 * Every signature on the work with its state: current when it is for the version that counts now (open work: its version;
 * submitted or closed work: the version submitted, or for a supervisor the version reviewed), superseded when the same
 * signer signed again later, otherwise stale.
 */
export async function signaturesOf(env: Bindings, order: Row) {
  const rows = await all(env, 'SELECT s.id, s.version, s.role, s.signer_name, s.member_id, s.mark_sha256, s.door, m.name AS recorded_by, s.recorded_at FROM gk_signatures s LEFT JOIN gk_members m ON m.id = s.recorded_by WHERE s.work_order_id = ? ORDER BY s.recorded_at, s.rowid', order.id)
  const open = ['open', 'in_progress', 'returned'].includes(order.status)
  const reviewed = order.status === 'submitted' ? order.version : (await one(env, 'SELECT version FROM gk_reviews WHERE work_order_id = ? ORDER BY at DESC, rowid DESC LIMIT 1', order.id))?.version ?? null
  const key = (row: Row) => `${row.role}:${String(row.signer_name).toLowerCase()}`
  return rows.map((row, index) => {
    const counts = row.role === 'supervisor' ? reviewed : open ? order.version : order.submitted_version
    const later = rows.slice(index + 1).some(other => key(other) === key(row))
    return { ...row, state: later ? 'superseded' : row.version === counts ? 'current' : 'stale' }
  })
}

/** Signers whose latest signature is for an earlier version of open work: they sign again before submission. */
export const resignBlockers = (signatures: { role: string; signer_name: string; version: number; state: string }[], version: number) =>
  signatures.filter(row => row.role !== 'supervisor' && row.state === 'stale').map(row => `${row.signer_name} (${row.role}) signed version ${row.version} and must sign version ${version} again`)

export async function signatureMark(env: Bindings, _actor: Actor, id: string) {
  const row = await one<{ mark: ArrayBuffer | null; mark_sha256: string }>(env, 'SELECT mark, mark_sha256 FROM gk_signatures WHERE id = ?', id)
  insist(row?.mark, 'signature_not_found', 404)
  const bytes = new Uint8Array(row.mark as ArrayBuffer)
  return new Response(bytes, { headers: { 'content-type': bytes[0] === 0x89 ? 'image/png' : 'image/jpeg', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } })
}
