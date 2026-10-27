// Versioned public API adapters retain the existing action and record guards.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor, type Capability } from './actor'
import { all, GasketError, insist, now, one, sha256Hex, stmt } from './core'
import { Input } from './input'
import { searchEstate } from './search'
import { createsWork } from './site'
import { ON_HAND } from './parts'
import { RESERVED } from './reservations'
import { fromMilli } from './quantity'
import { workOrder, workOrderDetail } from './work'
import { isCollaborator } from './crew'
import { didWork } from './review'
import { DOCUMENT_BYTES } from './documents'
import { EVIDENCE_BYTES } from './work'
import { exceptionAuthority } from './exceptions'

const JSON_TYPE = ['application', 'json'].join('/')
const RETRYABLE: Record<string, Capability> = {
  'asset.create': 'register.manage', 'asset.update': 'register.manage',
  'asset.move': 'register.manage', 'asset.lifecycle': 'register.manage', 'asset.agreement': 'register.manage',
  'asset.contact': 'register.manage', 'asset.sighting': 'register.manage', 'asset.state': 'register.manage', 'asset.retire': 'register.manage',
  'meter.feed': 'register.manage', 'meter.adjust': 'register.manage', 'meter.window': 'register.manage',
  'part.create': 'register.manage', 'part.receive': 'register.manage', 'part.count': 'register.manage',
  'part.price': 'register.manage', 'part.substitute': 'register.manage', 'kit.create': 'register.manage', 'bom.revise': 'register.manage',
  'workorder.reserve': 'work.assign', 'reservation.release': 'work.assign',
  'part.photo': 'register.manage', 'comment.post': 'comment.write', 'comment.edit': 'comment.write',
  'workorder.create': 'work.create',
  'checklist.create': 'register.manage', 'checklist.revise': 'register.manage',
  'template.save': 'work.assign', 'workorder.assign': 'work.assign',
  'workorder.results': 'work.do', 'workorder.issue': 'work.do', 'workorder.return': 'work.do',
  'workorder.submit': 'work.do', 'workorder.review': 'work.review',
  'document.add': 'register.manage', 'document.revise': 'register.manage', 'document.expiry': 'register.manage', 'document.link': 'work.assign',
  'meter.create': 'register.manage', 'schedule.create': 'work.assign',
  'customfield.save': 'register.manage', 'customfield.retire': 'register.manage', 'customvalue.set': 'register.manage', 'part.category': 'register.manage',
  'workorder.evidence': 'work.do', 'workorder.annotate': 'work.do',
  'workorder.time': 'work.do', 'workorder.readings': 'work.do',
  'workorder.tool': 'work.do', 'workorder.sign': 'work.do',
  'finding.record': 'work.do', 'downtime.start': 'work.do', 'downtime.end': 'work.do',
  'workorder.cancel': 'work.assign', 'workorder.reopen': 'work.assign',
  'planning.qualification': 'site.manage', 'planning.tool': 'site.manage', 'planning.retire': 'site.manage',
  'planning.window': 'work.assign', 'planning.window.remove': 'work.assign', 'planning.requirements': 'work.assign', 'planning.slot': 'work.assign',
  'safety.publish': 'register.manage', 'safety.attest': 'work.do', 'calibration.create': 'register.manage',
  'closure.add': 'register.manage', 'closure.remove': 'register.manage',
  'automation.control': 'site.manage', 'automation.schedule': 'site.manage', 'automation.catchup': 'site.manage',
  'schedule.skip': 'work.assign', 'schedule.defer': 'work.assign', 'schedule.exception': 'work.review', 'schedule.edit': 'register.manage',
  'labor.entry': 'work.do', 'labor.timer': 'work.do', 'labor.rate': 'site.manage', 'labor.review': 'site.manage', 'labor.invoice': 'site.manage',
}

/** Bounded streamed JSON; an idempotency key never silently falls back to a plain write. */
async function body(request: Request, action: string) {
  insist(request.headers.get('content-type')?.startsWith(JSON_TYPE), 'idempotency_requires_json', 415)
  // Base64 originals plus bounded metadata; each handler still enforces its
  // decoded file limit. Only fingerprints and small results enter receipts.
  const fileBytes = action === 'document.add' || action === 'document.revise' || action === 'safety.attest' ? DOCUMENT_BYTES : action === 'workorder.evidence' || action === 'part.photo' ? EVIDENCE_BYTES : action === 'comment.post' ? EVIDENCE_BYTES * 4 : action === 'workorder.sign' ? 200_000 : 0
  const limit = fileBytes ? Math.ceil(fileBytes / 3) * 4 + 64_000 : 64_000
  const reader = request.body?.getReader(), chunks: Uint8Array[] = []
  let size = 0
  if (reader) while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); throw new GasketError('request_too_large', 413) }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

export async function keyedWrite(env: Bindings, actor: Actor, request: Request, action: string, run: (input: Input) => Promise<unknown>) {
  const key = request.headers.get('idempotency-key')!
  insist(/^[A-Za-z0-9._:-]{1,128}$/.test(key), 'invalid_idempotency_key')
  insist(Object.hasOwn(RETRYABLE, action), 'idempotency_not_supported', 400)
  if (action === 'workorder.create') insist(await createsWork(env, actor), 'create_work_right_revoked', 403)
  const bytes = await body(request, action)
  const input = await Input.from(new Request(request.url, { method: 'POST', headers: { 'content-type': JSON_TYPE }, body: bytes }))
  const capability = action === 'workorder.sign' && input.text('role', { max: 12 }) === 'supervisor' ? 'work.review' : RETRYABLE[action]
  requireCapability(actor, capability)
  if ((action === 'planning.slot' || action === 'schedule.edit') && input.flag('preview')) throw new GasketError('idempotency_preview_not_supported', 400)
  if (action === 'schedule.exception') await exceptionAuthority(env, actor, input)
  if (action === 'labor.entry') insist(actor.role === 'owner' || (input.text('person', { optional: true }) || actor.id) === actor.id, 'forbidden', 403)
  if (action === 'labor.entry' || action === 'labor.timer' || action === 'labor.invoice') await workOrder(env, input.text('workOrder', { max: 100 }))
  if (action === 'safety.attest') {
    const order = await workOrder(env, input.text('workOrder', { max: 100 }))
    insist(order.assignee_id === actor.id, 'not_your_work', 403)
  }
  if (action === 'comment.edit') {
    const comment = await one(env, 'SELECT author_id FROM gk_comments WHERE id=?', input.text('comment', { max: 100 }))
    insist(comment, 'comment_not_found', 404)
    insist(comment.author_id === actor.id, 'not_your_comment', 403)
  }
  if (action === 'comment.post') {
    const work = input.text('workOrder', { optional: true, max: 100 }), asset = input.text('asset', { optional: true, max: 100 })
    insist(Boolean(work) !== Boolean(asset), 'invalid_subject')
    insist(await one(env, `SELECT 1 FROM ${work ? 'gk_work_orders' : 'gk_assets'} WHERE id=?`, work || asset), work ? 'work_order_not_found' : 'asset_not_found', 404)
  }
  // Receipt access must not outlive the record authority that made it.
  // State and version checks stay in the handler for new effects; a completed
  // receipt remains replayable after its own successful state transition.
  if ((action.startsWith('workorder.') && action !== 'workorder.create') || action === 'document.link' || action === 'finding.record' || action.startsWith('downtime.')) {
    const order = await workOrder(env, input.text('workOrder', { max: 100 }))
    if (capability === 'work.do') {
      insist(order.assignee_id === actor.id || (action !== 'workorder.submit' && await isCollaborator(env, order.id, actor.id)), 'not_your_work', 403)
    }
    if (action === 'workorder.review' || (action === 'workorder.sign' && capability === 'work.review')) insist(order.assignee_id !== actor.id && !await didWork(env, order.id, actor.id), 'own_work', 403)
  }
  const principal = actor.service ? `${actor.id}:${actor.service.id}` : actor.id
  const keyHash = await sha256Hex(key), fingerprint = await sha256Hex(bytes)
  const claimed = await stmt(env, "INSERT INTO gk_api_writes (actor_id,key_hash,action,fingerprint,role,state,created_at) VALUES (?,?,?,?,?,'pending',?) ON CONFLICT DO NOTHING", principal, keyHash, action, fingerprint, actor.role, now()).run()
  if (!claimed.meta.changes) {
    const kept = await one(env, 'SELECT action,fingerprint,role,state,result_json FROM gk_api_writes WHERE actor_id=? AND key_hash=?', principal, keyHash)
    insist(kept && kept.action === action && kept.fingerprint === fingerprint, 'idempotency_key_conflict', 409)
    // A role change requires inspection, even when the new role could perform a new write.
    insist(kept.role === actor.role, 'idempotency_authority_changed', 403)
    insist(kept.state === 'completed', kept.state === 'pending' ? 'idempotency_pending' : 'idempotency_failed', 409)
    const result = JSON.parse(kept.result_json)
    if (action === 'workorder.create') await workOrderDetail(env, actor, result.id)
    return { result, replayed: true }
  }
  // Claim before invoking the action: overlap, restart or uncertain results never
  // repeat a mutation. An interrupted claim stays pending for human reconciliation.
  try {
    const result = await run(input)
    const encoded = JSON.stringify(result)
    insist(encoded.length <= 64_000, 'idempotency_result_too_large', 500)
    await stmt(env, "UPDATE gk_api_writes SET state='completed',result_json=? WHERE actor_id=? AND key_hash=?", encoded, principal, keyHash).run()
    return { result, replayed: false }
  } catch (error) {
    await stmt(env, "UPDATE gk_api_writes SET state='failed' WHERE actor_id=? AND key_hash=?", principal, keyHash).run()
    throw error
  }
}

/** Keyset search avoids the legacy Work list's 500-record ceiling. */
export async function apiEstate(env: Bindings, actor: Actor, path: string, url: URL) {
  const kind = ({ assets: 'asset', work: 'work', parts: 'part' } as Record<string, string>)[path]
  insist(kind, 'not_found', 404)
  const selection = new URL(url)
  insist(!selection.searchParams.has('view') && !selection.searchParams.has('kind'), 'unexpected_input')
  selection.searchParams.set('kind', kind)
  const result = await searchEstate(env, actor, selection)
  // Keep a page bounded in database calls, even at the 200-row limit. Full
  // records stay behind their individually authorized detail doors.
  const balances = kind === 'part' && result.rows.length ? await all(env, `SELECT p.id,p.unit,p.revision,${ON_HAND} AS on_hand,${RESERVED} AS reserved FROM gk_parts p WHERE p.id IN (${result.rows.map(() => '?').join(',')})`, ...result.rows.map(row => row.id)) : []
  const rows = result.rows.map(row => {
    const balance = balances.find(balance => balance.id === row.id)
    return { ...row, sourceDoor: `/api/gasket/v1/${path}/${row.id}`, ...(balance ? { unit: balance.unit, revision: balance.revision, onHand: fromMilli(balance.on_hand), reserved: fromMilli(balance.reserved), available: fromMilli(balance.on_hand - balance.reserved) } : {}) }
  })
  return { ...result, rows }
}
