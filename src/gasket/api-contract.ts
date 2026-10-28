// Versioned public API adapters retain the existing action and record guards.
import type { Bindings } from '../auth.server'
import { can, requireCapability, type Actor, type Capability } from './actor'
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
import { purchaseOrderDetail } from './purchase-orders'
import { approvalRoute } from './purchase-authority'
import { reportScheduleAuthority } from './report-schedules'
import { withApiWriteClaim } from './api-write-context'

const JSON_TYPE = ['application', 'json'].join('/')
const RETRYABLE: Record<string, Capability | null> = {
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
  'supplier.save': 'site.manage', 'supplier.catalog': 'site.manage', 'costcenter.save': 'site.manage', 'requisition.request': 'work.do',
  'schedule.skip': 'work.assign', 'schedule.defer': 'work.assign', 'schedule.exception': 'work.review', 'schedule.edit': 'register.manage',
  'labor.entry': 'work.do', 'labor.timer': 'work.do', 'labor.rate': 'site.manage', 'labor.review': 'site.manage', 'labor.invoice': 'site.manage',
  'team.create': 'work.assign', 'team.member': 'work.assign', 'workorder.collaborate': 'work.assign',
  'workorder.acknowledge': 'work.do', 'workorder.decline': 'work.do', 'workorder.respond': 'work.do',
  'workorder.plan': 'work.assign', 'workorder.priority': 'work.assign', 'workorder.merge': 'work.assign',
  'workorders.bulk': 'work.assign', 'workorders.fromTemplate': 'work.assign', 'template.retire': 'work.assign',
  'workfield.save': 'work.assign', 'workfield.retire': 'work.assign', 'workstatus.save': 'work.assign',
  'route.create': 'register.manage', 'route.issue': 'work.assign', 'route.sign': 'work.review',
  'rule.set': 'register.manage', 'chase.rule': 'register.manage', 'step.except': 'work.review',
  'workorder.field': null, 'workorder.waiting': null, 'route.miss': null,
  'blocker.raise': null, 'blocker.resolve': null,
  'count.plan': 'register.manage', 'count.submit': null, 'count.decide': 'register.manage',
  'site.countApproval': 'site.manage', 'part.quarantine.dispose': 'site.manage',
  'code.set': 'register.manage', 'code.move': 'register.manage', 'code.retire': 'register.manage',
  'downtime.classify': 'register.manage', 'production.hours.add': 'register.manage', 'production.hours.remove': 'register.manage',
  'work.cost': 'work.assign', 'loss.rate': 'register.manage',
  'work.cost_comparison': 'site.manage', 'work.cost_center': 'site.manage',
  'quote.save': 'site.manage', 'purchase.save': 'site.manage', 'purchase.approve': 'work.review',
  'purchase.send': 'site.manage', 'purchase.acknowledge': 'site.manage',
  'receipt.receive': 'register.manage', 'receipt.inspect': 'register.manage',
  'pm.copy': 'register.manage', 'pm.adapt': 'register.manage', 'pm.approve': 'work.review', 'pm.rollout': 'work.review',
  'nested.map': 'register.manage', 'nested.satisfy': 'work.assign',
  'rules.save': 'register.manage', 'rules.control': 'register.manage', 'interval.limit': 'register.manage',
  'outcome.window': 'register.manage', 'outcome.assess': 'proposal.prepare',
  'outcome.reversal': 'proposal.prepare', 'outcome.investigate': 'proposal.prepare',
  'workorders.generate': 'work.assign',
  'site.create': 'site.manage', 'site.update': 'site.manage', 'site.membership': 'site.manage',
  'site.configure': 'site.manage', 'site.technicianWork': 'site.manage',
  'access.give': 'site.manage', 'access.role': 'site.manage', 'access.end': 'site.manage',
  'service.revoke': 'site.manage', 'retention.policy': 'site.manage', 'retention.hold': 'site.manage',
  'record.erase': 'site.manage', 'attachment.erase': 'site.manage', 'recovery.drill': 'site.manage',
  'search.save': null, 'search.delete': null, 'report.schedule': null,
}

/** Bounded streamed JSON; an idempotency key never silently falls back to a plain write. */
async function body(request: Request, action: string) {
  insist(request.headers.get('content-type')?.startsWith(JSON_TYPE), 'idempotency_requires_json', 415)
  // Base64 originals plus bounded metadata; each handler still enforces its
  // decoded file limit. Only fingerprints and small results enter receipts.
  const fileBytes = action === 'document.add' || action === 'document.revise' || action === 'safety.attest' ? DOCUMENT_BYTES : action === 'workorder.evidence' || action === 'part.photo' || action === 'receipt.receive' ? EVIDENCE_BYTES : action === 'comment.post' ? EVIDENCE_BYTES * 4 : action === 'quote.save' || action === 'purchase.save' ? EVIDENCE_BYTES * 5 : action === 'workorder.sign' ? 200_000 : 0
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
  if (capability) requireCapability(actor, capability)
  if (['planning.slot', 'schedule.edit', 'workorders.bulk', 'workorders.fromTemplate', 'nested.satisfy'].includes(action) && input.flag('preview')) throw new GasketError('idempotency_preview_not_supported', 400)
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
  if (['workorder.field', 'workorder.waiting', 'route.miss', 'blocker.raise'].includes(action)) {
    const order = await workOrder(env, input.text('workOrder', { max: 100 }))
    const planner = can(actor, 'work.assign'), reviewer = action === 'workorder.waiting' && can(actor, 'work.review')
    insist(planner || reviewer || (can(actor, 'work.do') && (order.assignee_id === actor.id || (action !== 'route.miss' && action !== 'blocker.raise' && await isCollaborator(env, order.id, actor.id)))), action === 'route.miss' ? 'forbidden' : 'not_your_work', 403)
    if (action === 'workorder.waiting') {
      const target = input.text('status', { optional: true, max: 100 })
      for (const id of new Set([order.waiting_status, target].filter(Boolean))) {
        const status = await one(env, 'SELECT roles FROM gk_work_statuses WHERE id=?', id)
        insist(status, 'status_not_found', 404)
        insist(actor.role === 'owner' || JSON.parse(status.roles).includes(actor.role), 'status_not_permitted', 403)
      }
    }
  }
  if (action === 'blocker.resolve') {
    const blocker = await one(env, 'SELECT b.owner_id,w.assignee_id FROM gk_blockers b JOIN gk_work_orders w ON w.id=b.work_order_id WHERE b.id=?', input.text('blocker', { max: 100 }))
    insist(blocker, 'blocker_not_found', 404)
    insist([blocker.owner_id, blocker.assignee_id].includes(actor.id) || can(actor, 'work.assign'), 'forbidden', 403)
  }
  if (action === 'count.submit' || action === 'count.decide') {
    const count = action === 'count.submit'
      ? await one(env, 'SELECT counter_id FROM gk_counts WHERE id=?', input.text('count', { max: 100 }))
      : await one(env, 'SELECT c.counter_id FROM gk_counts c JOIN gk_count_lines l ON l.count_id=c.id WHERE l.id=?', input.text('line', { max: 100 }))
    insist(count, action === 'count.submit' ? 'count_not_found' : 'count_line_not_found', 404)
    insist(action === 'count.submit' ? count.counter_id === actor.id : count.counter_id !== actor.id, action === 'count.submit' ? 'not_the_counter' : 'independent_approval_required', 403)
  }
  if (action === 'purchase.approve') {
    const order = await purchaseOrderDetail(env, actor, input.text('order'))
    insist(order.created_by !== actor.id && order.current.created_by !== actor.id, 'independent_approval_required', 403)
    const route = await approvalRoute(env, actor, order)
    if (!route.legacy) {
      const step = input.text('step', { optional: true })
      insist(route.required.some(row => (!step || row.id === step) && row.effectiveId === actor.id && row.eligible), 'approval_authority_changed', 403)
    }
  }
  if (action === 'pm.approve' || action === 'pm.rollout') {
    const strategy = await one(env, 'SELECT r.number,r.created_by FROM gk_pm_strategy_revisions r WHERE r.strategy_id=? ORDER BY r.number DESC LIMIT 1', input.text('strategy'))
    insist(strategy, 'strategy_not_found', 404)
    insist(strategy.created_by !== actor.id && (action !== 'pm.approve' || strategy.number > 1), action === 'pm.approve' ? 'independent_adapted_strategy_required' : 'independent_rollout_required', 409)
  }
  if ((action === 'rules.save' && input.has('rule')) || action === 'rules.control') {
    const rule = await one(env, 'SELECT owner_id FROM gk_rules WHERE id=?', input.text('rule'))
    if (action === 'rules.control') insist(rule, 'rule_not_found', 404)
    if (rule) insist(actor.role === 'owner' || rule.owner_id === actor.id, 'rule_not_yours', 403)
  }
  if (action === 'nested.satisfy') {
    const higher = await one(env, 'SELECT schedule_id FROM gk_work_orders WHERE id=?', input.text('higherWork'))
    const lower = await one(env, 'SELECT schedule_id FROM gk_work_orders WHERE id=?', input.text('lowerWork'))
    insist(higher?.schedule_id && lower?.schedule_id, 'scheduled_work_required', 409)
  }
  if (action === 'report.schedule') await reportScheduleAuthority(env, actor, input)
  if (action === 'search.save' || action === 'search.delete') {
    if (action === 'search.save') insist(!input.flag('shared') || actor.role === 'owner', 'forbidden', 403)
    const id = input.text('id', { optional: action === 'search.save', max: 100 })
    const saved = id ? await one(env, 'SELECT owner_id FROM gk_search_views WHERE id=?', id) : null
    // A deleted view has no private result payload. Its original principal may
    // still recover the deletion receipt; a new request uses the normal handler.
    if (saved) insist(saved.owner_id === actor.id || actor.role === 'owner', 'forbidden', 403)
  }
  // Receipt access must not outlive the record authority that made it.
  // State and version checks stay in the handler for new effects; a completed
  // receipt remains replayable after its own successful state transition.
  if ((action.startsWith('workorder.') && action !== 'workorder.create') || action === 'document.link' || action === 'finding.record' || action === 'downtime.start' || action === 'downtime.end' || action === 'step.except') {
    const order = await workOrder(env, input.text('workOrder', { max: 100 }))
    if (capability === 'work.do') {
      const assigneeOnly = ['workorder.submit', 'workorder.acknowledge', 'workorder.respond', 'workorder.decline'].includes(action)
      // Declining releases the assignment itself. Its receipt is still available
      // while that attributable handoff remains the latest assignment decision.
      const declined = action === 'workorder.decline' && !order.assignee_id && await one(env, 'SELECT 1 FROM gk_handoffs WHERE work_order_id=? AND from_id=? AND to_id IS NULL AND by_id=? AND rowid=(SELECT MAX(rowid) FROM gk_handoffs WHERE work_order_id=?)', order.id, actor.id, actor.id, order.id)
      insist(order.assignee_id === actor.id || declined || (!assigneeOnly && await isCollaborator(env, order.id, actor.id)), 'not_your_work', 403)
    }
    if (action === 'workorder.review' || action === 'step.except' || (action === 'workorder.sign' && capability === 'work.review')) insist(order.assignee_id !== actor.id && !await didWork(env, order.id, actor.id), 'own_work', 403)
    if (action === 'workorder.merge') await workOrder(env, input.text('into', { max: 100 }))
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
    const result = await withApiWriteClaim({ principal, keyHash }, () => run(input))
    const encoded = JSON.stringify(result)
    insist(encoded.length <= 64_000, 'idempotency_result_too_large', 500)
    // An erasure can finish while a response is being retained. Its opaque
    // journal marker also fences late result storage, without releasing the key.
    const erasureResult = action === 'record.erase' || action === 'attachment.erase'
    const kept = await stmt(env, "UPDATE gk_api_writes SET state='completed',result_json=? WHERE actor_id=? AND key_hash=? AND state='pending' AND (? OR NOT EXISTS(SELECT 1 FROM gk_record_erasure_results e WHERE instr(?,e.record_id)>0 OR (e.kind='user' AND (e.record_id=? OR substr(?,1,length(e.record_id)+1)=e.record_id||':'))))", encoded, principal, keyHash, Number(erasureResult), encoded, principal, principal).run()
    insist(kept.meta.changes, 'idempotency_result_erased', 409)
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
