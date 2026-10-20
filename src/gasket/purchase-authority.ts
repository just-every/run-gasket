// BUY-003: exact-revision authority and atomic commitment accounting.
import type { Bindings } from '../auth.server'
import { capabilitySql, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import type { Input } from './input'
import { today } from './dates'
import { currentDelegationSql, currentPolicySql, eligibleMemberSql } from './purchase-policy'

export interface PurchaseOrderForAuthority {
  id: string
  created_by: string
  current_revision: number
  current: { id: string; created_by: string; snapshot: { currency: string; commitmentCents: number; costCenter: { id: string }; supplier: { id: string } }; approval?: Row | null }
}
export interface ApprovalStep {
  id: string
  policyRevision: string
  thresholdCents: number
  scope: 'site' | 'costCenter'
  position: number
  principalId: string
  principal: string
  effectiveId: string
  effective: string
  delegation: Row | null
  authorityKey: string
  eligible: boolean
  approval: Row | null
}
export interface PurchaseBudget {
  revisionId: string
  policyId: string
  costCenterId: string | null
  from: string
  to: string
  budgetCents: number
  committedCents: number
  remainingCents: number
  projectedCents: number
  exceeded: boolean
}
export interface ApprovalRoute {
  revisionId: string
  day: string
  bookedOn: string
  costCenterId: string
  commitmentCents: number
  policies: Row[]
  policyRevisions: string[]
  budgets: PurchaseBudget[]
  required: ApprovalStep[]
  legacy: boolean
  legacyApproval: Row | null
  emergency: Row | null
  release: Row | null
  complete: boolean
  blocked: boolean
  blockedReasons: string[]
  authorityLabel: string
  key: string
}

const memberEligible = (member: Row | undefined) => Boolean(member && member.status === 'active' && ['owner', 'supervisor'].includes(member.role))
const independent = (member: string, order: PurchaseOrderForAuthority) => member !== order.created_by && member !== order.current.created_by
const eligibleIndependentSql = `EXISTS(SELECT 1 FROM gk_members m WHERE m.id=? AND ${eligibleMemberSql('m')} AND m.id NOT IN (?,?))`

/** Raw route is internal: budgets/policy revisions must be redacted for ordinary PO readers. */
export async function approvalRoute(env: Bindings, actor: Actor, order: PurchaseOrderForAuthority): Promise<ApprovalRoute> {
  const facts = order.current.snapshot
  insist(facts.currency === 'USD' && Number.isSafeInteger(facts.commitmentCents) && facts.commitmentCents >= 0, 'invalid_commitment', 409)
  const policies = await all(env, `SELECT v.* ${currentPolicySql} WHERE (v.cost_center_id IS NULL OR v.cost_center_id=?) AND v.from_on<=? AND v.to_on>=? ORDER BY v.cost_center_id,v.id`, facts.costCenter.id, actor.today, actor.today)
  const [members, delegations, approvals, release, commitment, legacyApproval] = await Promise.all([
    all(env, 'SELECT id,name,status,role FROM gk_members'),
    all(env, `SELECT v.* ${currentDelegationSql} WHERE v.revoked=0 AND v.from_on<=? AND v.to_on>=?`, actor.today, actor.today),
    all(env, 'SELECT * FROM gk_purchase_step_approvals WHERE revision_id=? ORDER BY approved_at,id', order.current.id),
    one(env, 'SELECT * FROM gk_purchase_commitment_releases WHERE revision_id=?', order.current.id),
    one(env, 'SELECT * FROM gk_purchase_commitments WHERE revision_id=?', order.current.id),
    one(env, 'SELECT * FROM gk_purchase_approvals WHERE revision_id=?', order.current.id),
  ])
  const memberMap = new Map(members.map(member => [member.id, member]))
  const required: ApprovalStep[] = []
  for (const policy of policies) {
    const steps = await all(env, 'SELECT * FROM gk_spend_policy_steps WHERE policy_revision_id=? AND threshold_cents<=? ORDER BY position', policy.id, facts.commitmentCents)
    for (const step of steps) {
      const principal = memberMap.get(step.principal_id), delegation = delegations.find(row => row.principal_id === step.principal_id) ?? null
      const effectiveId = delegation?.delegate_id ?? step.principal_id, effective = memberMap.get(effectiveId)
      const authorityKey = delegation?.id ?? 'direct'
      const eligible = memberEligible(principal) && memberEligible(effective) && independent(step.principal_id, order) && independent(effectiveId, order)
      required.push({ id: step.id, policyRevision: policy.id, thresholdCents: step.threshold_cents, scope: policy.cost_center_id ? 'costCenter' : 'site', position: step.position,
        principalId: step.principal_id, principal: principal?.name ?? step.principal_id,
        effectiveId, effective: effective?.name ?? effectiveId, delegation, authorityKey, eligible,
        approval: eligible ? approvals.find(row => row.step_id === step.id && row.authority_key === authorityKey && row.approved_by === effectiveId && row.principal_id === step.principal_id) ?? null : null })
    }
  }
  required.sort((left, right) => left.thresholdCents - right.thresholdCents || Number(left.scope === 'costCenter') - Number(right.scope === 'costCenter') || left.position - right.position || left.policyRevision.localeCompare(right.policyRevision))
  const key = JSON.stringify({ revision: order.current.id, policies: policies.map(row => row.id), steps: required.map(step => [step.id, step.authorityKey]) })
  const emergencies = await all(env, 'SELECT * FROM gk_purchase_emergency_overrides WHERE revision_id=? AND route_key=? ORDER BY confirmed_at DESC,id', order.current.id, key)
  const emergency = emergencies.find(row => memberEligible(memberMap.get(row.approved_by)) && independent(row.approved_by, order)) ?? null
  const bookedOn = commitment?.booked_on ?? (legacyApproval ? today(actor.zone, legacyApproval.approved_at) : actor.today)
  const budgets: PurchaseBudget[] = await Promise.all(policies.map(async policy => {
    const sums = await one(env, `SELECT COALESCE(SUM(amount_cents),0) AS committed,COALESCE(SUM(CASE WHEN revision_id<>? THEN amount_cents ELSE 0 END),0) AS other
      FROM gk_live_purchase_commitments WHERE booked_on BETWEEN ? AND ? AND (? IS NULL OR cost_center_id=?)`, order.current.id, policy.from_on, policy.to_on, policy.cost_center_id, policy.cost_center_id)
    const candidate = bookedOn >= policy.from_on && bookedOn <= policy.to_on ? facts.commitmentCents : 0
    const projectedCents = sums.other + candidate
    return { revisionId: policy.id, policyId: policy.policy_id, costCenterId: policy.cost_center_id, from: policy.from_on, to: policy.to_on,
      budgetCents: policy.budget_cents, committedCents: sums.committed, remainingCents: policy.budget_cents - sums.committed,
      projectedCents, exceeded: projectedCents > policy.budget_cents }
  }))
  const legacy = policies.length === 0
  const validLegacy = legacyApproval && memberEligible(memberMap.get(legacyApproval.approved_by)) && independent(legacyApproval.approved_by, order) ? legacyApproval : null
  const noAuthority = legacy ? !members.some(member => memberEligible(member) && independent(member.id, order)) : required.some(step => !step.eligible)
  const blockedReasons = [...(release ? ['commitment_released'] : []), ...(!emergency && noAuthority ? ['missing_authority'] : []), ...(!emergency && budgets.some(budget => budget.exceeded) ? ['budget_exceeded'] : [])]
  const complete = !release && (Boolean(emergency) || (legacy ? Boolean(validLegacy) : required.every(step => Boolean(step.approval))))
  return { revisionId: order.current.id, day: actor.today, bookedOn, costCenterId: facts.costCenter.id, commitmentCents: facts.commitmentCents,
    policies, policyRevisions: policies.map(policy => policy.id), budgets, required, legacy, legacyApproval: validLegacy, emergency, release,
    complete, blocked: blockedReasons.length > 0, blockedReasons,
    authorityLabel: emergency ? 'Emergency override' : legacy ? 'Independent approval' : required.length ? 'Policy approval steps' : 'Policy threshold authorization; no manual approval', key }
}

/** Optimistic guards also reject a newly added policy/delegation, not only edits to old heads. */
export function routeGuardStatements(env: Bindings, order: PurchaseOrderForAuthority, route: ApprovalRoute): D1PreparedStatement[] {
  const ids = route.policyRevisions, placeholders = ids.map(() => '?').join(',')
  return [
    guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_purchase_orders p JOIN gk_purchase_revisions r ON r.order_id=p.id AND r.revision=p.current_revision
      WHERE p.id=? AND p.current_revision=? AND r.id=? AND p.created_by=? AND r.created_by=?)`, order.id, order.current_revision, route.revisionId, order.created_by, order.current.created_by),
    guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM gk_purchase_commitment_releases WHERE revision_id=?)', route.revisionId),
    guard(env, 'stale', `(SELECT COUNT(*) ${currentPolicySql} WHERE (v.cost_center_id IS NULL OR v.cost_center_id=?) AND v.from_on<=? AND v.to_on>=?)=?
      AND NOT EXISTS(SELECT 1 ${currentPolicySql} WHERE (v.cost_center_id IS NULL OR v.cost_center_id=?) AND v.from_on<=? AND v.to_on>=? ${ids.length ? `AND v.id NOT IN (${placeholders})` : ''})`,
    route.costCenterId, route.day, route.day, ids.length, route.costCenterId, route.day, route.day, ...ids),
    ...route.required.map(step => guard(env, 'stale', step.delegation
      ? `EXISTS(SELECT 1 ${currentDelegationSql} WHERE v.id=? AND v.principal_id=? AND v.delegate_id=? AND v.revoked=0 AND v.from_on<=? AND v.to_on>=?)`
      : `NOT EXISTS(SELECT 1 ${currentDelegationSql} WHERE v.principal_id=? AND v.revoked=0 AND v.from_on<=? AND v.to_on>=?)`,
    ...(step.delegation ? [step.delegation.id, step.principalId, step.effectiveId, route.day, route.day] : [step.principalId, route.day, route.day]))),
  ]
}

function stepCondition(step: ApprovalStep, order: PurchaseOrderForAuthority) {
  return {
    sql: `EXISTS(SELECT 1 FROM gk_purchase_step_approvals a JOIN gk_members m ON m.id=a.approved_by JOIN gk_members p ON p.id=a.principal_id
      WHERE a.revision_id=? AND a.step_id=? AND a.authority_key=? AND a.approved_by=? AND a.principal_id=?
      AND ${eligibleMemberSql('m')} AND ${eligibleMemberSql('p')} AND m.id NOT IN (?,?) AND p.id NOT IN (?,?))`,
    params: [order.current.id, step.id, step.authorityKey, step.effectiveId, step.principalId, order.created_by, order.current.created_by, order.created_by, order.current.created_by],
  }
}

/** Append these before completionStatements in the same audited commit. */
export function approvalStepStatements(env: Bindings, actor: Actor, order: PurchaseOrderForAuthority, route: ApprovalRoute, stepId: string, note = '') {
  requireCapability(actor, 'work.review')
  const step = route.required.find(item => item.id === stepId)
  insist(step && step.eligible && step.effectiveId === actor.id && !step.approval, 'independent_approval_required', 403)
  insist(!route.release, 'commitment_released', 409)
  const authority = capabilitySql(actor.sessionId, 'work.review')
  const earlier = route.required.slice(0, route.required.indexOf(step))
  const id = newId()
  return [guard(env, 'stale', authority.sql, ...authority.params), ...routeGuardStatements(env, order, route),
    ...[step.principalId, step.effectiveId].map(member => guard(env, 'stale', eligibleIndependentSql, member, order.created_by, order.current.created_by)),
    ...earlier.map(item => { const check = stepCondition(item, order); return guard(env, 'stale', check.sql, ...check.params) }),
    guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM gk_purchase_step_approvals WHERE revision_id=? AND step_id=? AND authority_key=?)', order.current.id, step.id, step.authorityKey),
    stmt(env, 'INSERT INTO gk_purchase_step_approvals(id,revision_id,step_id,authority_key,principal_id,effective_id,delegation_revision_id,approved_by,approved_at,note) VALUES (?,?,?,?,?,?,?,?,?,?)',
      id, order.current.id, step.id, step.authorityKey, step.principalId, step.effectiveId, step.delegation?.id ?? null, actor.id, now(), note)]
}

function emergencyCondition(order: PurchaseOrderForAuthority, route: ApprovalRoute, emergencyId: string) {
  return { sql: `EXISTS(SELECT 1 FROM gk_purchase_emergency_overrides e JOIN gk_members m ON m.id=e.approved_by
    WHERE e.id=? AND e.revision_id=? AND e.route_key=? AND ${eligibleMemberSql('m')} AND m.id NOT IN (?,?))`,
  params: [emergencyId, order.current.id, route.key, order.created_by, order.current.created_by] }
}

/** Safe both before creating the final marker and on send; target commitment is counted once.
 * Call AFTER a new step/override insert, BEFORE the final approval marker and send insert.
 * All statements and the caller's marker/send must share one commit(env, ...).
 */
export function completionStatements(env: Bindings, actor: Actor, order: PurchaseOrderForAuthority, route: ApprovalRoute, options: { emergencyId?: string } = {}): D1PreparedStatement[] {
  const statements = routeGuardStatements(env, order, route)
  const emergencyId = options.emergencyId ?? route.emergency?.id
  if (emergencyId) {
    const check = emergencyCondition(order, route, emergencyId)
    statements.push(guard(env, 'stale', check.sql, ...check.params))
  } else {
    if (route.legacy) statements.push(guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_purchase_approvals a JOIN gk_members m ON m.id=a.approved_by
      WHERE a.revision_id=? AND ${eligibleMemberSql('m')} AND m.id NOT IN (?,?))`, order.current.id, order.created_by, order.current.created_by))
    else for (const step of route.required) { const check = stepCondition(step, order); statements.push(guard(env, 'stale', check.sql, ...check.params)) }
    for (const budget of route.budgets) statements.push(guard(env, 'budget_exceeded', `
      COALESCE((SELECT SUM(amount_cents) FROM gk_live_purchase_commitments WHERE revision_id<>? AND booked_on BETWEEN ? AND ? AND (? IS NULL OR cost_center_id=?)),0)
      + CASE WHEN COALESCE((SELECT booked_on FROM gk_purchase_commitments WHERE revision_id=?),?) BETWEEN ? AND ? THEN ? ELSE 0 END <= ?`,
    order.current.id, budget.from, budget.to, budget.costCenterId, budget.costCenterId, order.current.id, route.bookedOn, budget.from, budget.to, route.commitmentCents, budget.budgetCents))
  }
  statements.push(stmt(env, `INSERT INTO gk_purchase_commitments(revision_id,amount_cents,cost_center_id,booked_on,recorded_by,recorded_at) VALUES (?,?,?,?,?,?) ON CONFLICT(revision_id) DO NOTHING`,
    order.current.id, route.commitmentCents, route.costCenterId, route.bookedOn, actor.id, now()))
  return statements
}

async function authorityOrder(env: Bindings, id: string): Promise<PurchaseOrderForAuthority> {
  const row = await one(env, `SELECT p.*,r.id AS revision_id,r.created_by AS revision_author,r.snapshot FROM gk_purchase_orders p
    JOIN gk_purchase_revisions r ON r.order_id=p.id AND r.revision=p.current_revision WHERE p.id=?`, id)
  insist(row, 'purchase_order_not_found', 404)
  return { id: row.id, created_by: row.created_by, current_revision: row.current_revision, current: { id: row.revision_id, created_by: row.revision_author, snapshot: JSON.parse(row.snapshot) } }
}

/** Separate confirmed action: retain the named independent authority, reason and all budget impacts. */
export async function saveEmergencyOverride(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.review')
  insist(input.flag('confirm'), 'confirmation_required')
  const reason = input.text('reason', { max: 2000 }), order = await authorityOrder(env, input.text('order'))
  insist(input.integer('revision', { min: 1 }) === order.current_revision, 'stale', 409)
  insist(independent(actor.id, order), 'independent_approval_required', 403)
  const route = await approvalRoute(env, actor, order)
  insist(!route.release, 'commitment_released', 409)
  const id = newId(), approval = newId(), authority = capabilitySql(actor.sessionId, 'work.review')
  const supplierId=order.current.snapshot.supplier.id
  const impact = route.budgets.map(budget => ({ ...budget, overrunCents: Math.max(0, budget.projectedCents - budget.budgetCents) }))
  await commit(env, [guard(env, 'stale', authority.sql, ...authority.params),
    guard(env, 'supplier_inactive', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id=? AND active=1)', supplierId),
    guard(env, 'stale', eligibleIndependentSql, actor.id, order.created_by, order.current.created_by), ...routeGuardStatements(env, order, route),
    ...route.budgets.map(budget => guard(env, 'stale', `COALESCE((SELECT SUM(amount_cents) FROM gk_live_purchase_commitments WHERE booked_on BETWEEN ? AND ? AND (? IS NULL OR cost_center_id=?)),0)=?`, budget.from, budget.to, budget.costCenterId, budget.costCenterId, budget.committedCents)),
    stmt(env, 'INSERT INTO gk_purchase_emergency_overrides(id,revision_id,route_key,reason,budget_impact,approved_by,confirmed_at) VALUES (?,?,?,?,?,?,?)', id, order.current.id, route.key, reason, JSON.stringify(impact), actor.id, now()),
    ...completionStatements(env, actor, order, route, { emergencyId: id }),
    stmt(env, `INSERT INTO gk_purchase_approvals(id,revision_id,approved_by,approved_at,note,authority_kind) SELECT ?,?,?,?,?,'emergency' WHERE NOT EXISTS(SELECT 1 FROM gk_purchase_approvals WHERE revision_id=?)`, approval, order.current.id, actor.id, now(), `Emergency override: ${reason}`, order.current.id)],
  { actor: actor.id, action: 'purchase.emergency.confirm', subject: order.id, detail: { id, revisionId: order.current.id, revision: order.current_revision, policyRevisions: route.policyRevisions, reason, budgetImpact: impact } })
  return { id: order.id, emergency: id }
}

/** Release a sent historical/current obligation explicitly; this is never receipt or payment. */
export async function releaseCommitment(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.review')
  insist(input.flag('confirm'), 'confirmation_required')
  const reason = input.text('reason', { max: 2000 }), revisionId = input.text('revisionId')
  const row = await one(env, `SELECT r.*,p.created_by AS initiator,c.amount_cents,a.approved_at,a.approved_by FROM gk_purchase_revisions r
    JOIN gk_purchase_orders p ON p.id=r.order_id JOIN gk_purchase_approvals a ON a.revision_id=r.id LEFT JOIN gk_purchase_commitments c ON c.revision_id=r.id WHERE r.id=?`, revisionId)
  insist(row, 'commitment_not_found', 404)
  insist(actor.id !== row.created_by && actor.id !== row.initiator, 'independent_approval_required', 403)
  const facts = JSON.parse(row.snapshot), amountCents = row.amount_cents ?? facts.commitmentCents
  insist(facts.currency === 'USD' && Number.isSafeInteger(amountCents) && amountCents >= 0, 'invalid_commitment', 409)
  const id = newId(), authority = capabilitySql(actor.sessionId, 'work.review')
  await commit(env, [guard(env, 'stale', authority.sql, ...authority.params),
    guard(env, 'stale', eligibleIndependentSql, actor.id, row.initiator, row.created_by),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_purchase_sends WHERE revision_id=?) AND NOT EXISTS(SELECT 1 FROM gk_purchase_commitment_releases WHERE revision_id=?)', revisionId, revisionId),
    stmt(env, `INSERT INTO gk_purchase_commitments(revision_id,amount_cents,cost_center_id,booked_on,recorded_by,recorded_at) VALUES (?,?,?,?,?,?) ON CONFLICT(revision_id) DO NOTHING`, revisionId, amountCents, facts.costCenter.id, today(actor.zone, row.approved_at), row.approved_by, row.approved_at),
    stmt(env, 'INSERT INTO gk_purchase_commitment_releases(id,revision_id,reason,released_by,released_at) VALUES (?,?,?,?,?)', id, revisionId, reason, actor.id, now())],
  { actor: actor.id, action: 'purchase.commitment.release', subject: row.order_id, detail: { id, revisionId, revision: row.revision, amountCents, reason } })
  return { id: row.order_id, release: id }
}
