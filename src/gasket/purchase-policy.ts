// BUY-003: owner-managed immutable period budgets, named steps and delegations.
import type { Bindings } from '../auth.server'
import { capabilitySql, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import { isDate, today } from './dates'
import type { Input } from './input'

export const eligibleMemberSql = (alias: string) => `${alias}.status='active' AND ${alias}.role IN ('owner','supervisor')`
export const currentPolicySql = `FROM gk_spend_policies h JOIN gk_spend_policy_revisions v ON v.policy_id=h.id AND v.revision=h.current_revision`
export const currentDelegationSql = `FROM gk_purchase_delegations h JOIN gk_purchase_delegation_revisions v ON v.delegation_id=h.id AND v.revision=h.current_revision`

export function usdCents(value: string): number {
  insist(/^\d+(?:\.\d{1,2})?$/.test(value), 'invalid_usd')
  const [whole, fraction = ''] = value.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  insist(Number.isSafeInteger(amount) && amount >= 0 && amount <= 1_000_000_000_000, 'invalid_usd')
  return amount
}

function period(input: Input) {
  const from = input.text('from'), to = input.text('to')
  insist(isDate(from) && isDate(to) && from <= to, 'invalid_period')
  return { from, to }
}

/** Recheck owner authority inside the same D1 transaction as the write. */
export function ownerStatements(env: Bindings, actor: Actor) {
  requireCapability(actor, 'site.manage')
  const authority = capabilitySql(actor.sessionId, 'site.manage')
  return [guard(env, 'stale', authority.sql, ...authority.params)]
}

/** Backfill real existing approvals before the first policy is introduced. Dates use the site's zone. */
async function existingCommitments(env: Bindings, actor: Actor) {
  const rows = await all(env, `SELECT r.id,r.snapshot,a.approved_at,a.approved_by FROM gk_purchase_approvals a
    JOIN gk_purchase_revisions r ON r.id=a.revision_id LEFT JOIN gk_purchase_commitments c ON c.revision_id=r.id WHERE c.revision_id IS NULL`)
  return rows.map(row => {
    const snapshot = JSON.parse(row.snapshot)
    insist(snapshot.currency === 'USD' && Number.isSafeInteger(snapshot.commitmentCents) && snapshot.commitmentCents >= 0, 'invalid_commitment', 409)
    return stmt(env, `INSERT INTO gk_purchase_commitments(revision_id,amount_cents,cost_center_id,booked_on,recorded_by,recorded_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(revision_id) DO NOTHING`, row.id, snapshot.commitmentCents, snapshot.costCenter.id, today(actor.zone, row.approved_at), row.approved_by, row.approved_at)
  })
}

export async function saveSpendPolicy(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const existingId = input.text('policy', { optional: true }), id = existingId || newId()
  const existing = existingId ? await one(env, 'SELECT * FROM gk_spend_policies WHERE id=?', id) : null
  insist(!existingId || existing, 'policy_not_found', 404)
  const seen = existing ? input.integer('revision', { min: 1 })! : 0
  insist(!existing || existing.current_revision === seen, 'stale', 409)
  const costCenter = input.text('costCenter', { optional: true }) || null, { from, to } = period(input)
  const currency = input.text('currency', { optional: true }) || 'USD'
  insist(currency === 'USD', 'usd_only')
  const budget = usdCents(input.text('budget')), thresholds = input.list('threshold', { keepEmpty: true }), approvers = input.list('approver', { keepEmpty: true })
  insist(thresholds.length > 0 && thresholds.length === approvers.length, 'invalid_policy_steps')
  const steps = thresholds.map((value, position) => ({ value, principal: approvers[position] })).filter(row => row.value.trim() || row.principal.trim()).map((row, position) => ({ id: newId(), position, threshold: usdCents(row.value), principal: row.principal }))
  insist(steps.length > 0 && steps.length <= 20, 'invalid_policy_steps')
  insist(steps.every((step, index) => step.principal && (!index || step.threshold >= steps[index - 1].threshold)), 'invalid_policy_steps')
  const eligible = await Promise.all(steps.map(step => one(env, `SELECT id FROM gk_members m WHERE id=? AND ${eligibleMemberSql('m')}`, step.principal)))
  insist(eligible.every(Boolean), 'ineligible_approver', 409)
  const revisionId = newId(), revision = seen + 1
  await commit(env, [...ownerStatements(env, actor),
    ...(existing ? [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_spend_policies WHERE id=? AND current_revision=?)', id, seen)] : []),
    guard(env, 'stale', `NOT EXISTS(SELECT 1 ${currentPolicySql} WHERE h.id<>? AND v.cost_center_id IS ? AND v.from_on<=? AND v.to_on>=?)`, id, costCenter, to, from),
    ...(costCenter ? [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_cost_centers WHERE id=? AND active=1)', costCenter)] : []),
    ...steps.map(step => guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_members m WHERE id=? AND ${eligibleMemberSql('m')})`, step.principal)),
    ...(await existingCommitments(env, actor)),
    existing ? stmt(env, 'UPDATE gk_spend_policies SET current_revision=? WHERE id=?', revision, id) : stmt(env, 'INSERT INTO gk_spend_policies(id,current_revision) VALUES (?,?)', id, revision),
    stmt(env, 'INSERT INTO gk_spend_policy_revisions(id,policy_id,revision,cost_center_id,from_on,to_on,budget_cents,currency,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', revisionId, id, revision, costCenter, from, to, budget, currency, actor.id, now()),
    ...steps.map(step => stmt(env, 'INSERT INTO gk_spend_policy_steps(id,policy_revision_id,position,threshold_cents,principal_id) VALUES (?,?,?,?,?)', step.id, revisionId, step.position, step.threshold, step.principal))],
  { actor: actor.id, action: 'purchase.policy.revise', subject: id, detail: { revision, revisionId, costCenter, from, to, budgetCents: budget, currency, steps } })
  return { id, revision, revisionId }
}

export async function saveDelegation(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const existingId = input.text('delegation', { optional: true }), id = existingId || newId()
  const existing = existingId ? await one(env, `SELECT v.* ${currentDelegationSql} WHERE h.id=?`, id) : null
  insist(!existingId || existing, 'delegation_not_found', 404)
  const seen = existing ? input.integer('revision', { min: 1 })! : 0, revoked = input.flag('revoke')
  insist(!existing || existing.revision === seen, 'stale', 409)
  insist(!revoked || existing, 'delegation_not_found', 404)
  const principal = revoked ? existing.principal_id : input.text('principal'), delegate = revoked ? existing.delegate_id : input.text('delegate')
  const { from, to } = revoked ? { from: existing.from_on, to: existing.to_on } : period(input)
  const reason = input.text('reason', { max: 2000 }), revisionId = newId(), revision = seen + 1
  insist(principal !== delegate, 'invalid_delegation')
  const eligibility = revoked ? [] : [principal, delegate].map(member => guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_members m WHERE id=? AND ${eligibleMemberSql('m')})`, member))
  await commit(env, [...ownerStatements(env, actor),
    ...(existing ? [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_purchase_delegations WHERE id=? AND current_revision=?)', id, seen)] : []),
    ...eligibility,
    ...(!revoked ? [guard(env, 'stale', `NOT EXISTS(SELECT 1 ${currentDelegationSql} WHERE h.id<>? AND v.revoked=0 AND v.principal_id=? AND v.from_on<=? AND v.to_on>=?)`, id, principal, to, from)] : []),
    existing ? stmt(env, 'UPDATE gk_purchase_delegations SET current_revision=? WHERE id=?', revision, id) : stmt(env, 'INSERT INTO gk_purchase_delegations(id,current_revision) VALUES (?,?)', id, revision),
    stmt(env, 'INSERT INTO gk_purchase_delegation_revisions(id,delegation_id,revision,principal_id,delegate_id,from_on,to_on,reason,revoked,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', revisionId, id, revision, principal, delegate, from, to, reason, Number(revoked), actor.id, now())],
  { actor: actor.id, action: revoked ? 'purchase.delegation.revoke' : 'purchase.delegation.revise', subject: id, detail: { revision, revisionId, principal, delegate, from, to, reason } })
  return { id, revision, revisionId }
}

export async function spendPolicySettings(env: Bindings, actor: Actor) {
  requireCapability(actor, 'site.manage')
  const [policies, delegations, members, costCenters, emergencies, releases] = await Promise.all([
    all(env, `SELECT v.*,h.current_revision,c.code AS cost_center_code,c.name AS cost_center_name ${currentPolicySql} LEFT JOIN gk_cost_centers c ON c.id=v.cost_center_id ORDER BY v.from_on DESC,v.cost_center_id`),
    all(env, `SELECT v.*,h.current_revision,m.name AS principal,d.name AS delegate ${currentDelegationSql} JOIN gk_members m ON m.id=v.principal_id JOIN gk_members d ON d.id=v.delegate_id ORDER BY v.from_on DESC`),
    all(env, `SELECT id,name,role FROM gk_members m WHERE ${eligibleMemberSql('m')} ORDER BY name`),
    all(env, 'SELECT id,code,name FROM gk_cost_centers WHERE active=1 ORDER BY code'),
    all(env, `SELECT e.*,r.order_id,r.revision,p.number,m.name AS approver FROM gk_purchase_emergency_overrides e JOIN gk_purchase_revisions r ON r.id=e.revision_id JOIN gk_purchase_orders p ON p.id=r.order_id JOIN gk_members m ON m.id=e.approved_by ORDER BY e.confirmed_at DESC`),
    all(env, `SELECT x.*,r.order_id,r.revision,p.number,m.name AS releaser FROM gk_purchase_commitment_releases x JOIN gk_purchase_revisions r ON r.id=x.revision_id JOIN gk_purchase_orders p ON p.id=r.order_id JOIN gk_members m ON m.id=x.released_by ORDER BY x.released_at DESC`),
  ])
  const steps = await all(env, 'SELECT s.*,m.name AS principal FROM gk_spend_policy_steps s JOIN gk_members m ON m.id=s.principal_id ORDER BY s.position')
  return { policies: policies.map(policy => ({ ...policy, steps: steps.filter(step => step.policy_revision_id === policy.id) })), delegations, members, costCenters, emergencies, releases }
}
