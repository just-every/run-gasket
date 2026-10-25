// AGENT-009: the owner's read side of model runs: grants, each run with its
// inputs, proposals, human decisions, cost and measured outcome, and the same
// history as a download. Owner only: it carries private costs and run inputs.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { providerState } from './agent-provider'
import { cell } from './audit'
import { all, insist, now, one, type Row } from './core'
import { showInstant } from './dates'

const STALLED_MS = 10 * 60_000
const usd = (micro: number | null) => micro === null ? null : (micro / 1_000_000).toFixed(6)
const iso = (instant: number | null) => instant === null ? null : new Date(instant).toISOString()

const proposalsOf = async (env: Bindings, runs: string[]) => {
  if (!runs.length) return new Map<string, Row[]>()
  const rows = await all(env, `SELECT l.run_id, l.position, l.evidence_json, p.id, p.kind, p.payload_json, p.status, p.prepared_at, p.decided_at, p.decision_note, p.result_id, p.payload_hash, d.name AS decided_by
    FROM gk_agent_run_proposals l JOIN gk_proposals p ON p.id = l.proposal_id LEFT JOIN gk_members d ON d.id = p.decided_by WHERE l.run_id IN (${runs.map(() => '?').join(',')}) ORDER BY l.run_id, l.position`, ...runs)
  const out = new Map<string, Row[]>()
  for (const row of rows) {
    const window = row.status === 'approved' && row.result_id ? await one(env, 'SELECT id FROM gk_outcome_windows WHERE work_order_id = ?', row.result_id) : null
    const assessed = window ? await one(env, "SELECT id, json_extract(report_json, '$.status') AS status FROM gk_outcome_assessments WHERE json_extract(report_json, '$.source.window') = ? ORDER BY recorded_at DESC LIMIT 1", window.id) : null
    const payload = JSON.parse(row.payload_json)
    out.set(row.run_id, [...out.get(row.run_id) ?? [], { id: row.id, kind: row.kind, title: payload.title, asset: payload.asset, due: payload.due, hash: row.payload_hash, evidence: JSON.parse(row.evidence_json),
      status: row.status, preparedAt: iso(row.prepared_at), decidedBy: row.decided_by, decidedAt: iso(row.decided_at), decisionNote: row.decision_note, applied: row.status === 'approved' ? row.result_id : null,
      outcome: assessed ? { status: assessed.status, assessment: assessed.id, window: window!.id } : { status: window ? 'awaiting_assessment' : 'not_measured', window: window?.id ?? null } }])
  }
  return out
}

const shape = (row: Row, proposals: Row[]) => ({
  id: row.id, grant: row.grant_id, grantRevision: row.grant_revision, startedBy: row.started_by_name, startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
  status: row.status, stalled: row.status === 'running' && now() - row.started_at > STALLED_MS, providerOutcome: row.provider_outcome, provider: row.provider, model: row.model,
  previewHash: row.preview_hash, inputs: JSON.parse(row.inputs_json), reserveUsd: usd(row.reserve_micro), costMicro: row.cost_micro, costUsd: usd(row.cost_micro), costBasis: row.cost_basis,
  promptTokens: row.prompt_tokens, completionTokens: row.completion_tokens, discarded: row.discarded === 1, summary: row.summary, proposals,
})

const RUNS = `SELECT r.*, m.name AS started_by_name FROM gk_agent_runs r LEFT JOIN gk_members m ON m.id = r.started_by`

export async function runDetail(env: Bindings, id: string) {
  const row = await one(env, `${RUNS} WHERE r.id = ?`, id)
  insist(row, 'run_not_found', 404)
  return shape(row, (await proposalsOf(env, [id])).get(id) ?? [])
}

export async function agentRunsView(env: Bindings, actor: Actor) {
  requireCapability(actor, 'agent.run')
  const [grants, runs, agents, assets] = await Promise.all([
    all(env, 'SELECT g.*, a.name AS agent_name, c.name AS created_by_name, v.name AS revoked_by_name FROM gk_agent_grants g LEFT JOIN gk_members a ON a.id = g.agent_id LEFT JOIN gk_members c ON c.id = g.created_by LEFT JOIN gk_members v ON v.id = g.revoked_by ORDER BY g.created_at DESC, g.id'),
    all(env, `${RUNS} ORDER BY r.started_at DESC, r.id LIMIT 200`),
    all(env, "SELECT id, name FROM gk_members WHERE role = 'agent' AND status = 'active' ORDER BY name"),
    all(env, 'SELECT id, tag, name FROM gk_assets WHERE retired_at IS NULL ORDER BY tag'),
  ])
  const proposals = await proposalsOf(env, runs.map(run => run.id))
  return { provider: providerState(env), agents, assets,
    grants: grants.map(row => ({ id: row.id, revision: row.revision, status: row.status, agent: row.agent_name, createdBy: row.created_by_name, createdAt: iso(row.created_at), provider: row.provider, model: row.model, assets: JSON.parse(row.assets_json),
      costsSent: row.costs === 1, termsAck: row.terms_ack, actions: JSON.parse(row.actions_json), maxProposals: row.max_proposals, maxOutputTokens: row.max_output_tokens, budgetUsd: usd(row.budget_micro), spentUsd: usd(row.spent_micro),
      budgetMicro: row.budget_micro, spentMicro: row.spent_micro, inputPriceUsdPerMillion: usd(row.input_price_micro), outputPriceUsdPerMillion: usd(row.output_price_micro), revokedBy: row.revoked_by_name, revokedAt: iso(row.revoked_at), revokeReason: row.revoke_reason })),
    runs: runs.map(row => shape(row, proposals.get(row.id) ?? [])) }
}

export async function readRun(env: Bindings, actor: Actor, id: string) {
  requireCapability(actor, 'agent.run')
  return await runDetail(env, id)
}

/** One row per run and proposal (a run with none keeps one row), so decisions, cost and outcome read together. */
export async function agentRunsCsv(env: Bindings, actor: Actor) {
  const { runs } = await agentRunsView(env, actor)
  const head = ['run', 'grant', 'grant_revision', 'started_at', 'started_by', 'provider', 'model', 'status', 'provider_outcome', 'discarded', 'inputs', 'input_hash', 'prompt_tokens', 'completion_tokens', 'cost_usd', 'cost_basis',
    'proposal', 'kind', 'title', 'proposal_status', 'decided_by', 'decided_at', 'decision_note', 'applied_record', 'measured_outcome']
  const lines = runs.flatMap(run => (run.proposals.length ? run.proposals : [null]).map((proposal: any) => [run.id, run.grant, run.grantRevision, run.startedAt, run.startedBy, run.provider, run.model, run.status, run.providerOutcome, run.discarded ? 'yes' : 'no', run.inputs.length, run.previewHash, run.promptTokens, run.completionTokens, run.costUsd, run.costBasis,
    proposal?.id, proposal?.kind, proposal?.title, proposal?.status, proposal?.decidedBy, proposal?.decidedAt, proposal?.decisionNote, proposal?.applied, proposal?.outcome.status].map(cell).join(',')))
  return [head.join(','), ...lines].join('\r\n') + '\r\n'
}
export const showRunTime = (instant: string | null, zone: string) => instant ? showInstant(Date.parse(instant), zone) : '—'
