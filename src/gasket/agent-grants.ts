// AGENT-009: the owner's run grant. It names the agent identity, the provider and
// model, the assets whose facts may leave, the proposal kinds, a dollar budget
// and the per-million-token prices the cost is computed from. Only an owner
// creates or revokes one, a grant is never edited, and revoking is permanent.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { ACTIONS, grantOf, type Grant } from './agent-run-input'
import { providerState } from './agent-provider'
import { all, commit, GasketError, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'

/** Decimal dollars to whole micro-dollars; at most six places, nothing negative or exponent-shaped. */
export function microOf(text: string, name: string, max: number): number {
  insist(/^\d{1,6}(\.\d{1,6})?$/.test(text), `invalid_${name}`)
  const micro = Math.round(Number(text) * 1_000_000)
  insist(micro <= max * 1_000_000, `invalid_${name}`)
  return micro
}

export async function saveGrant(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'agent.run')
  const provider = providerState(env)
  insist(provider.configured, 'provider_not_configured', 409, { reason: provider.configured ? undefined : provider.reason })
  insist(input.text('provider', { max: 200 }) === provider.name, 'provider_changed', 409)
  const agent = input.text('agent', { max: 100 })
  insist(await one(env, "SELECT 1 FROM gk_members WHERE id = ? AND role = 'agent' AND status = 'active'", agent), 'agent_not_found', 404)
  const model = input.text('model', { max: 80 })
  insist(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/.test(model), 'invalid_model')
  const assets = [...new Set(input.list('assets'))]
  insist(assets.length >= 1 && assets.length <= 3, 'invalid_assets')
  for (const id of assets) insist(await one(env, 'SELECT 1 FROM gk_assets WHERE id = ? AND retired_at IS NULL', id), 'asset_not_found', 404)
  const actions = [...new Set(input.list('actions'))]
  insist(actions.length >= 1 && actions.every(kind => (ACTIONS as readonly string[]).includes(kind)), 'invalid_actions')
  const costs = input.flag('costs'), terms = input.text('termsAck', { optional: true, max: 600 })
  // Private posted costs reach a provider only under terms the owner has written down.
  insist(!costs || terms.length >= 20, 'terms_required')
  const maxProposals = input.integer('maxProposals', { min: 1, max: 5 })!, maxOutputTokens = input.integer('maxOutputTokens', { min: 100, max: 4000 })!
  const budget = microOf(input.text('budget', { max: 20 }), 'budget', 1000)
  insist(budget > 0, 'invalid_budget')
  const inputPrice = microOf(input.text('inputPrice', { max: 20 }), 'input_price', 1000), outputPrice = microOf(input.text('outputPrice', { max: 20 }), 'output_price', 1000)
  insist((await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM gk_agent_grants WHERE status = 'active'"))!.n < 20, 'too_many_grants', 409)
  const id = newId()
  await commit(env, [stmt(env, `INSERT INTO gk_agent_grants (id, created_by, created_at, agent_id, purpose, provider, model, assets_json, costs, terms_ack, actions_json, max_proposals, max_output_tokens, budget_micro, input_price_micro, output_price_micro)
    VALUES (?, ?, ?, ?, 'reliability', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, actor.id, now(), agent, provider.name, model, JSON.stringify(assets), costs ? 1 : 0, terms, JSON.stringify(actions), maxProposals, maxOutputTokens, budget, inputPrice, outputPrice)],
    { actor: actor.id, action: 'agentrun.grant', subject: id, detail: { provider: provider.name, model, assets, costs, actions, budgetMicro: budget } })
  return { id }
}

/**
 * Revoking ends the grant, marks its running runs revoked (their answers will be discarded)
 * and rejects every proposal its runs left pending, all in one batch.
 */
export async function revokeGrant(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'agent.run')
  const grant = await one(env, 'SELECT * FROM gk_agent_grants WHERE id = ?', input.text('grant', { max: 100 }))
  insist(grant, 'grant_not_found', 404)
  insist(grant.status === 'active', 'already_revoked', 409)
  const reason = input.text('reason', { max: 500 }), at = now()
  const pending = await all(env, `SELECT p.id FROM gk_agent_run_proposals l JOIN gk_agent_runs r ON r.id = l.run_id JOIN gk_proposals p ON p.id = l.proposal_id WHERE r.grant_id = ? AND p.status = 'pending'`, grant.id)
  await commit(env, [
    guard(env, 'stale', "EXISTS(SELECT 1 FROM gk_agent_grants WHERE id = ? AND status = 'active')", grant.id),
    stmt(env, "UPDATE gk_agent_grants SET status = 'revoked', revision = revision + 1, revoked_by = ?, revoked_at = ?, revoke_reason = ? WHERE id = ? AND status = 'active'", actor.id, at, reason, grant.id),
    stmt(env, "UPDATE gk_agent_runs SET status = 'revoked' WHERE grant_id = ? AND status = 'running'", grant.id),
    stmt(env, `UPDATE gk_proposals SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ? WHERE status = 'pending' AND id IN (SELECT l.proposal_id FROM gk_agent_run_proposals l JOIN gk_agent_runs r ON r.id = l.run_id WHERE r.grant_id = ?)`, actor.id, at, `Run grant revoked: ${reason}`, grant.id),
  ], { actor: actor.id, action: 'agentrun.revoke', subject: grant.id, detail: { reason, rejectedPending: pending.map(row => row.id) } })
  return { id: grant.id, rejected: pending.length }
}

export async function loadGrant(env: Bindings, id: string): Promise<Grant> {
  const row = await one(env, 'SELECT * FROM gk_agent_grants WHERE id = ?', id)
  if (!row) throw new GasketError('grant_not_found', 404)
  return grantOf(row)
}
