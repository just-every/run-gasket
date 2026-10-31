import { applyInterval, intervalBasis } from './intervals'
import { approveMerge, mergeProposalBasis } from './part-merge'
// Native independent decisions retain the exact proposed payload and source facts.
// The reassignment adapter also admits company-policy execution as the current
// sponsor, without inventing a human approval for autonomous or review dispositions.
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
import { agentContext, agentPolicyFence } from './agent-door/context'
import { canonical } from '../modules/agent-door/policy/document'
import { fromMilli, meterNumber, toMilli } from './quantity'
import { assessOutcome, readOutcome } from './outcomes'

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
    const eligible = await one(env, `SELECT m.id,m.role,m.status,m.operator_id,o.status AS operator_status,o.role AS operator_role,
      sm.status AS site_status,tm.added_at AS team_joined_at FROM gk_members m LEFT JOIN oa_operators o ON o.id=m.operator_id
      LEFT JOIN gk_site_memberships sm ON sm.member_id=m.id AND sm.site_id='primary'
      LEFT JOIN gk_team_members tm ON tm.member_id=m.id AND tm.team_id=? WHERE m.id=?`, order.team_id, payload.assignee)
    insist(eligible?.operator_status === 'active' && eligible.site_status === 'active', 'assignee_not_assignable', 409)
    return { workOrder: state.workOrder, version: state.version, rule: state.rule, blockers: state.blockers, queries: state.queries, linked: state.linked, eligible }
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
  return Promise.all(rows.map(async row => ({ ...row, ...(['reassign','interval'].includes(row.kind) ? { source: await sha256Hex(row.basis_json) } : {}), ...(row.kind === 'interval' ? { application: await one(env, 'SELECT * FROM gk_interval_policy_changes WHERE proposal_id=?', row.id) } : {}), payload: JSON.parse(row.payload_json), basis: JSON.parse(row.basis_json), payload_json: undefined, basis_json: undefined })))
}

/** An existing reassignment, remeasured through native facts, never model-supplied evidence. */
export async function reassignmentProposal(env: Bindings, actor: Actor, id: string, hash: string, source: string, completed = false) {
  requireCapability(actor, 'work.assign')
  const proposal = await one(env, "SELECT * FROM gk_proposals WHERE id=? AND kind='reassign'", id)
  insist(proposal, 'proposal_not_found', 404)
  insist(hash === proposal.payload_hash && source === await sha256Hex(proposal.basis_json), 'proposal_changed', 409)
  const payload = JSON.parse(proposal.payload_json) as Record<string, string>
  const basis = JSON.parse(proposal.basis_json)
  if (!completed) {
    insist(proposal.status === 'pending', 'already_decided', 409)
    const current = await basisOf(env, 'reassign', payload, actor)
    insist(JSON.stringify(current) === proposal.basis_json, 'proposal_stale', 409)
  }
  return { proposal, payload, basis, source }
}

/** Only a running, policy-admitted agent call may use the autonomous application path. */
export async function applyReassignment(env: Bindings, actor: Actor, input: Input) {
  const ctx = agentContext(), policy = agentPolicyFence()
  insist(ctx && policy, 'forbidden', 403)
  const revision = await auditRevision(env)
  const { proposal, payload, basis, source } = await reassignmentProposal(env, actor,
    input.text('proposal', { max: 100 }), input.text('hash', { max: 64 }), input.text('source', { max: 64 }))
  const admission = await one(env, `SELECT id,row,evidence FROM agent_door_audit
    WHERE json_extract(row,'$.operation_id')=? AND json_extract(row,'$.tool')='gasket.proposals.reassign'
      AND json_extract(row,'$.outcome')='running' ORDER BY sequence DESC LIMIT 1`, ctx.operationId)
  insist(admission, 'agent_policy_changed', 409)
  const decision = JSON.parse(admission.row), evidence = JSON.parse(admission.evidence)
  const envelope = policy.envelope ? JSON.parse(policy.envelope) : null
  const document = envelope?.document ?? (policy.local_document ? JSON.parse(policy.local_document) : null)
  insist(decision.sponsor.id === actor.id && decision.agent.id === ctx.agent.id && decision.idempotency_key === ctx.idempotencyKey
    && decision.revision === (envelope?.revision ?? policy.local_revision) && canonical(document) === canonical(evidence.document)
    && ['autonomous','review','approval'].includes(decision.decision), 'agent_policy_changed', 409)
  // A company-required approval is a genuine current person's decision, retained separately from preparation.
  const decider = decision.decision === 'approval' ? ctx.approvers.find(person => person.id !== proposal.prepared_by) : null
  if (decision.decision === 'approval') {
    insist(decider, 'own_proposal', 403)
    const member = await one(env, `SELECT m.id FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id
      WHERE m.id=? AND m.status='active' AND o.status='active' AND (o.role='owner' OR m.role='lead')`, decider!.id)
    insist(member, 'forbidden', 403)
  }
  const team = (await one(env, 'SELECT team_id FROM gk_work_orders WHERE id=?', payload.workOrder)).team_id
  const also = (result: string) => [
    auditFence(env, revision),
    guard(env, 'assignee_not_assignable', `EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id
      JOIN gk_site_memberships sm ON sm.member_id=m.id AND sm.site_id='primary'
      WHERE m.id=? AND m.status='active' AND m.role=? AND o.status='active' AND o.role=? AND sm.status='active'
      AND (? IS NULL OR EXISTS(SELECT 1 FROM gk_team_members tm WHERE tm.team_id=? AND tm.member_id=m.id AND tm.added_at IS ?)))`,
      basis.eligible.id, basis.eligible.role, basis.eligible.operator_role, team,
      team, basis.eligible.team_joined_at),
    ...(decider ? [guard(env, 'agent_authority_ended', `EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id
      JOIN gk_site_memberships sm ON sm.member_id=m.id AND sm.site_id='primary'
      WHERE m.id=? AND m.status='active' AND o.status='active' AND sm.status='active' AND (o.role='owner' OR m.role='lead'))`, decider.id)] : []),
    guard(env, 'agent_policy_changed', "EXISTS(SELECT 1 FROM agent_door_audit WHERE id=? AND row=? AND evidence=?)", admission.id, admission.row, admission.evidence),
    guard(env, 'already_decided', "EXISTS(SELECT 1 FROM gk_proposals WHERE id=? AND status='pending' AND payload_hash=? AND basis_json=?)", proposal.id, proposal.payload_hash, proposal.basis_json),
    stmt(env, `UPDATE gk_proposals SET status='approved',decided_by=?,decided_at=?,decision_note=?,result_id=? WHERE id=?`,
      decider?.id ?? null, now(), `Company policy ${decision.revision}: ${decision.decision}; decision ${decision.decision_id ?? decision.id}`, result, proposal.id),
    stmt(env, AUDIT_INSERT, now(), actor.id, actor.id, 'proposal.apply', proposal.id, JSON.stringify({
      hash: proposal.payload_hash, source, basis, result, decision: decision.decision_id ?? decision.id, disposition: decision.decision,
      preparedBy: ctx.actor, approvers: ctx.approvers, operationId: ctx.operationId,
    })),
  ]
  await assign(env, actor, Input.of({ ...payload, version: basis.version }), { proposal: proposal.id, also })
  return { id: proposal.id, status: 'approved', result: payload.workOrder }
}

/** Only existing, non-rollback shortenings are exposed by this policy adapter. */
export async function intervalProposal(env: Bindings, actor: Actor, id: string, hash: string, source: string, completed = false) {
  requireCapability(actor, 'proposal.decide')
  const proposal = await one(env, "SELECT * FROM gk_proposals WHERE id=? AND kind='interval'", id)
  insist(proposal, 'proposal_not_found', 404)
  insist(hash === proposal.payload_hash && hash === await sha256Hex(proposal.payload_json)
    && source === await sha256Hex(proposal.basis_json), 'proposal_changed', 409)
  const payload = JSON.parse(proposal.payload_json) as Record<string, string>
  const basis = JSON.parse(proposal.basis_json) as Awaited<ReturnType<typeof intervalBasis>>
  insist(!payload.rollbackOf && !basis.rollback && basis.change.direction === 'shortening', 'interval_policy_shortening_only', 409)
  insist(basis.schedule.id === payload.schedule && basis.limits.length === 3, 'proposal_changed', 409)
  if (!completed) {
    insist(proposal.status === 'pending', 'already_decided', 409)
    const current = await intervalBasis(env, actor, payload)
    insist(JSON.stringify(current) === proposal.basis_json, 'proposal_stale', 409)
  }
  return { proposal, payload, basis, source }
}

/** The policy decision, exact proposal and cadence effect share one native commit. */
export async function applyIntervalProposal(env: Bindings, actor: Actor, input: Input) {
  const ctx = agentContext(), policy = agentPolicyFence()
  insist(ctx && policy && !actor.service, 'forbidden', 403)
  const revision = await auditRevision(env)
  const { proposal, payload, basis, source } = await intervalProposal(env, actor,
    input.text('proposal', { max: 100 }), input.text('hash', { max: 64 }), input.text('source', { max: 64 }))
  const admission = await one(env, `SELECT id,row,evidence FROM agent_door_audit
    WHERE json_extract(row,'$.operation_id')=? AND json_extract(row,'$.tool')='gasket.proposals.interval'
      AND json_extract(row,'$.outcome')='running' ORDER BY sequence DESC LIMIT 1`, ctx.operationId)
  insist(admission, 'agent_policy_changed', 409)
  const decision = JSON.parse(admission.row), evidence = JSON.parse(admission.evidence)
  const envelope = policy.envelope ? JSON.parse(policy.envelope) : null
  const document = envelope?.document ?? (policy.local_document ? JSON.parse(policy.local_document) : null)
  insist(decision.sponsor.id === actor.id && decision.agent.id === ctx.agent.id && decision.idempotency_key === ctx.idempotencyKey
    && decision.resource?.kind === 'schedule' && decision.resource.id === basis.schedule.id
    && decision.classes.length === 1 && decision.classes[0].class === 'commitment'
    && decision.revision === (envelope?.revision ?? policy.local_revision) && canonical(document) === canonical(evidence.document)
    && ['autonomous','review','approval'].includes(decision.decision), 'agent_policy_changed', 409)
  const decider = decision.decision === 'approval'
    ? ctx.approvers.find(person => person.id !== proposal.prepared_by && person.id !== actor.id) : null
  if (decision.decision === 'approval') {
    insist(decider, 'own_proposal', 403)
    insist(await one(env, `SELECT m.id FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id
      JOIN gk_site_memberships sm ON sm.member_id=m.id AND sm.site_id='primary'
      WHERE m.id=? AND m.status='active' AND o.status='active' AND sm.status='active' AND (o.role='owner' OR m.role='lead')`, decider!.id), 'forbidden', 403)
  }
  const decisionId = decision.decision_id ?? decision.id
  const digest = await sha256Hex(canonical({ name: 'gasket.proposals.interval', arguments: {
    proposal: proposal.id, hash: proposal.payload_hash, source, idempotency_key: ctx.idempotencyKey,
  }, ...(ctx.clientId === undefined ? {} : { client_id: ctx.clientId }) }))
  const claim = await one(env, 'SELECT agent,key,digest,decision_id FROM agent_door_calls WHERE agent=? AND decision_id=?', ctx.agent.id, decisionId)
  insist(claim?.digest === digest, 'proposal_changed', 409)
  const also = [
    auditFence(env, revision),
    guard(env, 'proposal_changed', 'EXISTS(SELECT 1 FROM agent_door_calls WHERE agent=? AND key=? AND digest=? AND decision_id=?)', claim.agent, claim.key, digest, decisionId),
    ...(decider ? [guard(env, 'agent_authority_ended', `EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id
      JOIN gk_site_memberships sm ON sm.member_id=m.id AND sm.site_id='primary'
      WHERE m.id=? AND m.status='active' AND o.status='active' AND sm.status='active' AND (o.role='owner' OR m.role='lead'))`, decider.id)] : []),
    guard(env, 'agent_policy_changed', 'EXISTS(SELECT 1 FROM agent_door_audit WHERE id=? AND row=? AND evidence=?)', admission.id, admission.row, admission.evidence),
    guard(env, 'already_decided', `EXISTS(SELECT 1 FROM gk_proposals WHERE id=? AND status='pending'
      AND payload_hash=? AND payload_json=? AND basis_json=? AND prepared_by=?)`, proposal.id, proposal.payload_hash, proposal.payload_json, proposal.basis_json, proposal.prepared_by),
    ...basis.limits.map(limit => guard(env, 'proposal_stale', `EXISTS(SELECT 1 FROM gk_interval_limits l WHERE l.id=? AND l.revision=?
      AND NOT EXISTS(SELECT 1 FROM gk_interval_limits n WHERE n.schedule_id=l.schedule_id AND n.source=l.source AND n.revision>l.revision))`, limit.id, limit.revision)),
    stmt(env, `UPDATE gk_proposals SET status='approved',decided_by=?,decided_at=?,decision_note=?,result_id=? WHERE id=?`,
      decider?.id ?? null, now(), `Company policy ${decision.revision}: ${decision.decision}; decision ${decisionId}`, payload.schedule, proposal.id),
    stmt(env, AUDIT_INSERT, now(), actor.id, actor.id, 'proposal.apply', proposal.id, JSON.stringify({
      hash: proposal.payload_hash, source, basis, result: payload.schedule, decision: decisionId, disposition: decision.decision,
      preparedBy: ctx.actor, approvers: ctx.approvers, operationId: ctx.operationId,
    })),
  ]
  await applyInterval(env, actor, payload, basis, proposal.id, also, {
    sponsor: actor.id, agent: ctx.agent.id, operation: ctx.operationId, decision: decisionId,
    disposition: decision.decision, approver: decider?.id ?? null, hash: proposal.payload_hash, source, basis: proposal.basis_json,
  })
  return { id: proposal.id, status: 'approved', result: payload.schedule }
}
