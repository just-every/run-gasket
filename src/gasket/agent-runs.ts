// AGENT-009: an invoked model run. The owner starts one run from a grant after
// seeing its exact preview; the run makes one provider call, charges a reserve up
// front and the reported cost afterwards, and only prepares pending proposals as
// the grant's agent identity. It cannot decide, spend or send anything: a lead or
// the owner still approves each proposal, and revoking the grant discards an
// answer that arrives afterwards.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { loadGrant } from './agent-grants'
import { askModel, providerState, type ModelAnswer } from './agent-provider'
import { buildRunInput, costOf, type Grant, type InputRef } from './agent-run-input'
import { commit, GasketError, guard, insist, newId, now, one, stmt, type Row } from './core'
import { addDays } from './dates'
import type { Input } from './input'
import { runDetail } from './agent-run-views'
import { draftProposal } from './proposals'
import { AiError } from '../modules/ai/index.mjs'

type Draft = Awaited<ReturnType<typeof draftProposal>>
interface Settled { status: 'completed' | 'failed' | 'uncertain'; outcome: string; costMicro: number; basis: 'reported' | 'reserved' | 'none'; answer?: ModelAnswer; discarded: boolean; summary?: string }

const fail = (reason: string): never => { throw new GasketError('output_invalid', 502, { reason }) }

/** The model's answer, accepted only exactly as the grant allows; nothing is repaired or defaulted. */
function parseAnswer(text: string, grant: Grant, refs: InputRef[], today: string) {
  let value: any
  try { value = JSON.parse(text) } catch { return fail('not_json') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('not_an_object')
  const word = (field: unknown, max: number, optional = false) => { if (optional && (field === undefined || field === '')) return ''; if (typeof field !== 'string' || !field.trim() || field.trim().length > max) fail('invalid_text'); return (field as string).trim() }
  const summary = word(value.summary, 400, true)
  if (!Array.isArray(value.proposals) || value.proposals.length > grant.maxProposals) fail('invalid_proposals')
  const known = new Map(refs.map(ref => [ref.ref, ref]))
  return { summary, proposals: (value.proposals as any[]).map(item => {
    if (!item || typeof item !== 'object' || !grant.actions.includes(item.kind)) fail('action_not_granted')
    const asset = known.get(item.asset)
    if (asset?.type !== 'asset') fail('asset_out_of_scope')
    if (!Number.isInteger(item.dueInDays) || item.dueInDays < 1 || item.dueInDays > 30) fail('invalid_due')
    if (!Array.isArray(item.evidence) || !item.evidence.length || item.evidence.length > 10 || item.evidence.some((ref: unknown) => typeof ref !== 'string' || !known.has(ref))) fail('invalid_evidence')
    return { kind: item.kind as 'corrective', asset: asset!.id, title: word(item.title, 100), description: word(item.description, 400, true), due: addDays(today, item.dueInDays), reasoning: word(item.reasoning, 400), evidence: item.evidence as string[] }
  }) }
}

/** What a provider failure cost: nothing when the provider refused before work, the whole reserve when it may have billed. */
function failure(error: unknown, reserve: number): Settled {
  const code = error instanceof AiError ? error.code : error instanceof GasketError ? error.code : 'upstream_uncertain'
  const mayHaveBilled = ['upstream_uncertain', 'upstream_unavailable', 'response_too_large', 'ai_invalid_response'].includes(code)
  return { status: code === 'upstream_uncertain' ? 'uncertain' : 'failed', outcome: code, costMicro: mayHaveBilled ? reserve : 0, basis: mayHaveBilled ? 'reserved' : 'none', discarded: true }
}

export async function previewRun(env: Bindings, actor: Actor, grantId: string) {
  requireCapability(actor, 'agent.run')
  const grant = await loadGrant(env, grantId), built = await buildRunInput(env, actor, grant), provider = providerState(env)
  return { grant: grant.id, revision: grant.revision, status: grant.status, provider: grant.provider, providerReady: provider.configured && provider.name === grant.provider, model: grant.model,
    request: built.request, inputs: built.refs, actions: grant.actions, maxProposals: grant.maxProposals, costsSent: grant.costs,
    withheld: ['people and their names', 'notes and attachments', 'manual and document files', 'pay rates', ...(grant.costs ? [] : ['posted work costs'])],
    budgetMicro: grant.budgetMicro, spentMicro: grant.spentMicro, reserveMicro: built.reserveMicro, wouldFit: grant.spentMicro + built.reserveMicro <= grant.budgetMicro, previewHash: built.previewHash }
}

export async function startRun(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'agent.run')
  const grant = await loadGrant(env, input.text('grant', { max: 100 }))
  insist(grant.status === 'active', 'grant_revoked', 409)
  const provider = providerState(env)
  insist(provider.configured, 'provider_not_configured', 409)
  insist(provider.name === grant.provider, 'provider_changed', 409)
  const agent = await one(env, "SELECT id, name, email FROM gk_members WHERE id = ? AND role = 'agent' AND status = 'active'", grant.agent_id)
  insist(agent, 'agent_unavailable', 409)
  const built = await buildRunInput(env, actor, grant)
  insist(input.text('previewHash', { max: 64 }) === built.previewHash, 'preview_changed', 409)
  const run = newId(), live = (id: string) => guard(env, 'grant_revoked', "EXISTS(SELECT 1 FROM gk_agent_grants WHERE id = ? AND revision = ? AND status = 'active')", id, grant.revision)
  const begin = () => commit(env, [live(grant.id),
    guard(env, 'budget_exhausted', 'COALESCE((SELECT spent_micro + ? <= budget_micro FROM gk_agent_grants WHERE id = ?), 0)', built.reserveMicro, grant.id),
    stmt(env, 'UPDATE gk_agent_grants SET spent_micro = spent_micro + ? WHERE id = ?', built.reserveMicro, grant.id),
    stmt(env, "INSERT INTO gk_agent_runs (id, grant_id, grant_revision, started_by, started_at, status, provider, model, preview_hash, inputs_json, reserve_micro) VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)", run, grant.id, grant.revision, actor.id, now(), grant.provider, grant.model, built.previewHash, JSON.stringify(built.refs), built.reserveMicro)],
    { actor: actor.id, action: 'agentrun.start', subject: run, detail: { grant: grant.id, revision: grant.revision, provider: grant.provider, model: grant.model, previewHash: built.previewHash, reserveMicro: built.reserveMicro } })
  try { await begin() } catch (error) {
    // Guards share one failure code: say which one it was.
    if (!(error instanceof GasketError) || error.code !== 'precondition_failed') throw error
    throw new GasketError((await loadGrant(env, grant.id)).status === 'active' ? 'budget_exhausted' : 'grant_revoked', 409)
  }

  const agentActor: Actor = { id: agent.id, sessionId: `agent-run:${run}`, email: agent.email, name: agent.name, role: 'agent', zone: actor.zone, today: actor.today }
  let settled: Settled, drafts: Draft[] = [], evidence: string[][] = []
  try {
    const answer = await askModel(env, built.request)
    // Reported usage prices the call; without it the whole reserve stays charged rather than an invented figure.
    const reported = answer.promptTokens !== null && answer.completionTokens !== null
    const cost = reported ? costOf(grant, answer.promptTokens!, answer.completionTokens!) : built.reserveMicro
    settled = { status: 'completed', outcome: 'answered', costMicro: cost, basis: reported ? 'reported' : 'reserved', answer, discarded: false }
    try {
      const parsed = parseAnswer(answer.text, grant, built.refs, actor.today)
      drafts = await Promise.all(parsed.proposals.map(item => draftProposal(env, agentActor, item.kind, `${item.reasoning}\n\nEvidence: ${item.evidence.join(', ')}. Prepared by ${grant.model} in run ${run}.`, { asset: item.asset, title: item.title, description: item.description, due: item.due })))
      evidence = parsed.proposals.map(item => item.evidence)
      settled.summary = parsed.summary
    } catch (error) {
      if (!(error instanceof GasketError)) throw error
      settled = { ...settled, status: 'failed', outcome: `output_invalid:${(error.detail as { reason?: string } | undefined)?.reason ?? error.code}`, discarded: true }
    }
  } catch (error) { settled = failure(error, built.reserveMicro) }

  const finish = (extra: unknown[] = [], audits: { actor: string; action: string; subject: string; detail?: unknown }[] = []) => commit(env, [
    guard(env, 'run_ended', "EXISTS(SELECT 1 FROM gk_agent_runs WHERE id = ? AND finished_at IS NULL)", run),
    ...extra as D1PreparedStatement[],
    stmt(env, "UPDATE gk_agent_runs SET status = CASE WHEN status = 'revoked' THEN 'revoked' ELSE ? END, discarded = CASE WHEN status = 'revoked' THEN 1 ELSE ? END, finished_at = ?, cost_micro = ?, cost_basis = ?, prompt_tokens = ?, completion_tokens = ?, provider_outcome = ?, summary = ? WHERE id = ?",
      settled.status, settled.discarded ? 1 : 0, now(), settled.costMicro, settled.basis, settled.answer?.promptTokens ?? null, settled.answer?.completionTokens ?? null, settled.outcome, settled.discarded ? null : settled.summary ?? null, run),
    stmt(env, 'UPDATE gk_agent_grants SET spent_micro = spent_micro - ? + ? WHERE id = ?', built.reserveMicro, settled.costMicro, grant.id),
  ], [{ actor: actor.id, action: 'agentrun.finish', subject: run, detail: { outcome: settled.outcome, costMicro: settled.costMicro, basis: settled.basis, proposals: drafts.map(draft => draft.id) } }, ...audits])

  try {
    if (settled.discarded) await finish()
    else await finish([live(grant.id), guard(env, 'agent_unavailable', "EXISTS(SELECT 1 FROM gk_members WHERE id = ? AND role = 'agent' AND status = 'active')", agent.id),
      ...drafts.flatMap((draft, position) => [draft.statement, stmt(env, 'INSERT INTO gk_agent_run_proposals (run_id, proposal_id, position, evidence_json) VALUES (?, ?, ?, ?)', run, draft.id, position, JSON.stringify(evidence[position]))])],
      drafts.map(draft => ({ ...draft.audit, detail: { ...draft.audit.detail, run } })))
  } catch (error) {
    // Revoked, or the agent identity ended, while the provider worked: keep the cost and the fact, drop the answer and every write it would have made.
    if (!(error instanceof GasketError) || error.code !== 'precondition_failed') throw error
    drafts = []
    const agentEnded = !await one(env, "SELECT 1 FROM gk_members WHERE id = ? AND role = 'agent' AND status = 'active'", agent.id)
    settled = { ...settled, status: 'failed', outcome: agentEnded ? 'agent_unavailable' : settled.outcome, discarded: true, summary: undefined }
    await finish()
  }
  return await runDetail(env, run)
}
