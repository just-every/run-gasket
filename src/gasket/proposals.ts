import { applyInterval, intervalBasis } from './intervals'
import { approveMerge, mergeProposalBasis } from './part-merge'
// Native decisions remain independent. Company policy may authorize a bounded
// corrective application for a current human sponsor, with an atomic receipt.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { AUDIT_INSERT, all, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from './core'
import { Input } from './input'
import { countPart, partDetail } from './parts'
import { varianceValue } from './valuation'
import { createSchedule, scheduleFields } from './schedules'
import { assign, createCorrective } from './work'
import { assigneeFits } from './crew'
import { auditFence, auditRevision, followUpCase } from './agent-follow-up'
import { isDate } from './dates'
import { fromMilli, meterNumber, toMilli } from './quantity'
import { assessOutcome, readOutcome } from './outcomes'
import { agentContext } from './agent-door/context'

const KINDS = ['schedule', 'corrective', 'count', 'reassign', 'interval', 'merge'] as const
type Kind = typeof KINDS[number]
// Merge proposals are additive: existing outcome foreign keys keep their original parent.
const proposalTable = (kind: Kind) => kind === 'merge' ? 'gk_merge_proposals' : 'gk_proposals'

/** The versions a proposal relies on: if any changes before approval, the proposal is stale. */
async function basisOf(env: Bindings, kind: Kind, payload: Record<string, string>, actor: Actor) {
  if (kind === 'merge') return mergeProposalBasis(env, actor, Input.of(payload))
  if (kind === 'interval') return intervalBasis(env, actor, payload)
  if (kind === 'reassign') {
    const state = await followUpCase(env, actor, payload.workOrder)
    insist(['open', 'in_progress', 'returned'].includes(state.status), 'work_order_not_open', 409)
    insist(state.escalationDue, 'escalation_not_due', 409)
    const order = await one(env, 'SELECT team_id FROM gk_work_orders WHERE id=?', payload.workOrder)
    await assigneeFits(env, payload.assignee, order.team_id)
    insist(payload.assignee !== state.assignee, 'already_assigned', 409)
    return { workOrder: state.workOrder, version: state.version, rule: state.rule, blockers: state.blockers, queries: state.queries, linked: state.linked }
  }
  if (kind === 'count') {
    const part = await partDetail(env, actor, payload.part)
    const quantityDelta = toMilli(payload.counted, 'counted', { allowZero: true }) - part.on_hand
    return { part: part.id, partRevision: part.revision, moves: part.seen,
      number: part.number, unit: part.unit, observed: part.onHand, counted: payload.counted, valueCents: part.valueCents,
      quantityDelta: fromMilli(quantityDelta), valueDeltaCents: await varianceValue(env, part.id, quantityDelta),
      movements: part.moves.map((move: Row) => ({ id: move.id, kind: move.kind, quantity: move.quantity, valueCents: move.value_cents, workOrder: move.work_order_id, at: move.at })),
    }
  }
  const asset = await one(env, 'SELECT id, revision FROM gk_assets WHERE id = ?', payload.asset)
  insist(asset, 'asset_not_found', 404)
  if (kind === 'corrective' && payload.outcome) {
    const report = await readOutcome(env, actor, payload.outcome)
    insist(report.subject.asset === asset.id, 'outcome_asset_mismatch', 409)
    insist(['unproven', 'worsening', 'no_improvement'].includes(report.status), 'investigation_not_required', 409)
    // A fresh comparison is computed without rewriting or adding retained assessments.
    const current = await assessOutcome(env, actor, Input.of({ window: report.source.window }), false)
    insist(current.id === report.id && current.source.sourceHash === report.source.sourceHash, 'outcome_stale', 409)
    return { asset: asset.id, assetRevision: asset.revision, outcome: report.id, sourceHash: report.source.sourceHash, window: report.source.window }
  }
  return { asset: asset.id, assetRevision: asset.revision }
}

function payloadOf(kind: Kind, input: Input): Record<string, string> {
  const fields: Record<Kind, [string, boolean][]> = {
    schedule: [['asset', true], ['checklist', true], ['title', true], ['everyDays', false], ['meter', false], ['everyUnits', false], ['firstDue', false], ['firstDueMeter', false], ['assignee', false]],
    corrective: [['asset', true], ['title', true], ['description', false], ['due', true], ['assignee', false], ['outcome', false]],
    count: [['part', true], ['counted', true], ['note', false]],
    interval: [['schedule', true], ['everyDays', false], ['everyUnits', false], ['from', true], ['to', true], ['peers', true], ['rollbackPlan', true], ['rollbackOf', false], ['outcome', false]],
    merge: [['source', true], ['canonical', true], ['reason', true]],
    reassign: [['workOrder', true], ['assignee', true], ['note', true]],
  }
  const payload: Record<string, string> = {}
  for (const [name, required] of fields[kind]) {
    const value = input.text(name, { optional: !required, max: name === 'reason' ? 1000 : 2000 })
    if (value) payload[name] = value
  }
  if (kind === 'interval' && payload.everyUnits) payload.everyUnits = meterNumber(payload.everyUnits, 'everyUnits')
  return payload
}

/** A validated proposal as one insert and its audit entry, so a caller can commit it inside its own guarded batch. */
export async function draftProposal(env: Bindings, actor: Actor, kind: Kind, reasoning: string, raw: Record<string, unknown>) {
  const payload = payloadOf(kind, Input.of(raw))
  // Validate now so the approver sees a proposal that would run today.
  if (kind === 'schedule') await scheduleFields(env, Input.of(payload))
  if (kind === 'corrective') { insist(isDate(payload.due), 'invalid_due'); insist(await one(env, 'SELECT 1 FROM gk_assets WHERE id = ? AND retired_at IS NULL', payload.asset), 'asset_not_found', 404) }
  if (kind === 'count') toMilli(payload.counted, 'counted', { allowZero: true })
  const basis = await basisOf(env, kind, payload, actor)
  const json = JSON.stringify(payload), hash = await sha256Hex(json), id = newId()
  return { id, kind, hash,
    statement: stmt(env, `INSERT INTO ${proposalTable(kind)} (id, kind, payload_json, payload_hash, basis_json, reasoning, prepared_by, prepared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, kind, json, hash, JSON.stringify(basis), reasoning, actor.id, now()),
    audit: { actor: actor.id, action: 'proposal.prepare', subject: id, detail: { kind, hash } } }
}

export async function prepare(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'proposal.prepare')
  const kind = input.text('kind', { max: 20 }) as Kind
  insist(KINDS.includes(kind), 'invalid_kind')
  const reasoning = input.text('reasoning', { max: 4000 })
  const draft = await draftProposal(env, actor, kind, reasoning, input.json('payload') as Record<string, unknown>)
  await commit(env, [draft.statement], draft.audit)
  return { id: draft.id, kind, hash: draft.hash }
}

export async function decide(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'proposal.decide')
  const revision = await auditRevision(env)
  const proposal = await one(env, 'SELECT * FROM gk_all_proposals WHERE id = ?', input.text('proposal', { max: 100 }))
  insist(proposal, 'proposal_not_found', 404)
  const table = proposalTable(proposal.kind)
  insist(proposal.status === 'pending', 'already_decided', 409)
  insist(proposal.prepared_by !== actor.id, 'own_proposal', 403)
  const decision = input.text('decision', { max: 10 })
  insist(['approve', 'reject'].includes(decision), 'invalid_decision')
  const note = input.text('note', { optional: decision === 'approve', max: 1000 }) || null
  if (decision === 'reject') {
    await commit(env, [stmt(env, `UPDATE ${table} SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ? AND status = 'pending'`, actor.id, now(), note, proposal.id)],
      { actor: actor.id, action: 'proposal.reject', subject: proposal.id, detail: { note } })
    return { id: proposal.id, status: 'rejected' }
  }
  insist(input.text('hash', { max: 64 }) === proposal.payload_hash, 'proposal_changed', 409)
  const payload = JSON.parse(proposal.payload_json) as Record<string, string>
  const basis = await basisOf(env, proposal.kind, payload, actor)
  // Pending pre-upgrade counts retain their original version-bound contract.
  const retainedBasis = JSON.parse(proposal.basis_json)
  const comparedBasis = proposal.kind === 'count' && !Object.hasOwn(retainedBasis, 'quantityDelta')
    ? { part: (basis as any).part, partRevision: (basis as any).partRevision, moves: (basis as any).moves } : basis
  insist(JSON.stringify(comparedBasis) === proposal.basis_json, 'proposal_stale', 409)
  const command = Input.of(proposal.kind === 'count' ? { ...payload, seen: String((basis as { moves: number }).moves) } : payload)
  // The command and the decision commit in one batch: a second approver finds it decided.
  const also = (resultId: string) => [
    ...(['reassign', 'interval', 'merge'].includes(proposal.kind) || payload.outcome ? [auditFence(env, revision)] : []),
    guard(env, 'already_decided', `EXISTS(SELECT 1 FROM ${table} WHERE id = ? AND status = 'pending')`, proposal.id),
    stmt(env, `UPDATE ${table} SET status = 'approved', decided_by = ?, decided_at = ?, decision_note = ?, result_id = ? WHERE id = ?`, actor.id, now(), note, resultId, proposal.id),
    stmt(env, AUDIT_INSERT, now(), actor.id, actor.id, 'proposal.approve', proposal.id, JSON.stringify({ hash: proposal.payload_hash, result: resultId })),
  ]
  const options = { proposal: proposal.id, also }
  const result = proposal.kind === 'merge' ? await approveMerge(env, actor, Input.of({ ...payload, fingerprint: (basis as { fingerprint: string }).fingerprint }), options)
    : proposal.kind === 'interval' ? await applyInterval(env, actor, payload, basis as Awaited<ReturnType<typeof intervalBasis>>, proposal.id, also(payload.schedule))
    : proposal.kind === 'schedule' ? await createSchedule(env, actor, command, options)
    : proposal.kind === 'corrective' ? await createCorrective(env, actor, command, options)
    : proposal.kind === 'reassign' ? await assign(env, actor, command, options)
    : await countPart(env, actor, command, options)
  return { id: proposal.id, status: 'approved', result: result.id }
}

/** Only corrective application is exposed here; money and maintenance standards keep their native doors. */
export async function correctiveApplication(env: Bindings, actor: Actor, input: Input, completed = false) {
  requireCapability(actor, 'proposal.decide')
  const proposal = await one<Row>(env, 'SELECT * FROM gk_proposals WHERE id=?', input.text('proposal', { max: 100 }))
  insist(proposal, 'proposal_not_found', 404)
  insist(proposal.kind === 'corrective', 'unsupported_proposal_kind', 409)
  insist(input.text('hash', { max: 64 }) === proposal.payload_hash, 'proposal_changed', 409)
  const payload = JSON.parse(proposal.payload_json) as Record<string, string>
  if (completed && proposal.status === 'approved' && proposal.result_id) return { proposal, payload, basis: JSON.parse(proposal.basis_json) }
  insist(proposal.status === 'pending', 'already_decided', 409)
  const basis = await basisOf(env, 'corrective', payload, actor)
  insist(JSON.stringify(basis) === proposal.basis_json, 'proposal_stale', 409)
  return { proposal, payload, basis }
}

/** The application receipt, source fence, work and attribution commit together. Review invents no human decision. */
export async function applyCorrectiveProposal(env: Bindings, actor: Actor, input: Input, disposition: string) {
  const ctx = agentContext()
  insist(ctx, 'agent_policy_required', 403)
  const revision = await auditRevision(env)
  const { proposal, payload, basis } = await correctiveApplication(env, actor, input)
  if (disposition === 'review') return { id: proposal.id, status: 'pending', result: null }
  insist(['autonomous', 'approval'].includes(disposition), 'agent_policy_required', 403)
  let approver: string | null = null
  if (disposition === 'approval') {
    for (const person of ctx.approvers) {
      if (person.id === actor.id || person.id === proposal.prepared_by) continue
      const eligible = await one(env, `SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id
        WHERE m.id=? AND m.status='active' AND o.status='active' AND (o.role='owner' OR (m.role='lead'
          AND EXISTS(SELECT 1 FROM gk_site_memberships WHERE site_id='primary' AND member_id=m.id AND status='active')))`, person.id)
      if (eligible) { approver = person.id; break }
    }
    insist(approver, 'independent_decision_required', 403)
  }
  const also = (result: string) => [
    auditFence(env, revision),
    guard(env, 'already_decided', "EXISTS(SELECT 1 FROM gk_proposals WHERE id=? AND status='pending' AND payload_hash=? AND basis_json=?)", proposal.id, proposal.payload_hash, proposal.basis_json),
    ...(approver ? [guard(env, 'independent_decision_required', `EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id
      WHERE m.id=? AND m.status='active' AND o.status='active' AND (o.role='owner' OR (m.role='lead'
        AND EXISTS(SELECT 1 FROM gk_site_memberships WHERE site_id='primary' AND member_id=m.id AND status='active'))))`, approver)] : []),
    stmt(env, "UPDATE gk_proposals SET status='approved',decided_by=?,decided_at=?,decision_note=?,result_id=? WHERE id=?", approver, now(),
      approver ? 'Independent company-policy approval' : 'Company policy authorized agent execution; no human approval asserted.', result, proposal.id),
    stmt(env, AUDIT_INSERT, now(), actor.id, actor.id, 'proposal.apply', proposal.id, JSON.stringify({
      hash: proposal.payload_hash, result, basis, disposition, preparedBy: ctx.actor, approvers: ctx.approvers, operationId: ctx.operationId,
    })),
  ]
  const result = await createCorrective(env, actor, Input.of(payload), { proposal: proposal.id, also })
  return { id: proposal.id, status: 'approved', result: result.id }
}

export async function proposalList(env: Bindings, _actor: Actor) {
  const rows = await all(env, `SELECT p.*, COALESCE((SELECT json_extract(a.detail,'$.preparedBy.label') FROM gk_audit a WHERE a.subject=p.id AND a.action='proposal.prepare' ORDER BY a.seq LIMIT 1),m.name) AS prepared_by_name, d.name AS decided_by_name FROM gk_all_proposals p LEFT JOIN gk_members m ON m.id = p.prepared_by LEFT JOIN gk_members d ON d.id = p.decided_by
    ORDER BY p.status = 'pending' DESC, p.prepared_at DESC LIMIT 200`)
  return rows.map(row => ({ ...row, payload: JSON.parse(row.payload_json), basis: JSON.parse(row.basis_json), payload_json: undefined, basis_json: undefined }))
}
