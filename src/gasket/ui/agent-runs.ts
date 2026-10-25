// AGENT-009: grants, the exact preview of what a run would send, the run history
// and its export. Owner only; a person other than the agent decides each proposal.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { agentRunsView, showRunTime } from '../agent-run-views'
import { previewRun } from '../agent-runs'
import { card, field, form, h, hidden, select, table, tag } from './html'
import { page } from './shell'

const dollars = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`
const STATUS: Record<string, string> = { running: 'Running', completed: 'Completed', failed: 'Failed', uncertain: 'Uncertain', revoked: 'Revoked' }
const OUTCOME: Record<string, string> = { answered: 'Answer received', agent_unavailable: 'Agent identity ended', upstream_uncertain: 'Provider did not answer in time; it may have billed', upstream_auth: 'Provider refused the key', upstream_limited: 'Provider rate limit', upstream_unavailable: 'Provider unavailable', upstream_error: 'Provider refused the request', ai_invalid_response: 'Provider reply was unreadable', response_too_large: 'Provider reply was too large' }

export async function agentRunsPage(env: Bindings, actor: Actor, url: URL) {
  const view = await agentRunsView(env, actor), active = view.grants.filter(grant => grant.status === 'active')
  const named = url.searchParams.get('preview'), preview = named && active.some(grant => grant.id === named) ? await previewRun(env, actor, named) : null
  const provider = view.provider.configured
    ? h`<p>Provider: <strong>${view.provider.name}</strong>. Its key is held by this installation and is never shown or exported.</p>`
    : h`<p>No model provider is switched on (${(view.provider as { reason: string }).reason.replace(/_/g, ' ')}). An administrator turns it on with the AI settings of this installation; until then no run can be granted.</p>`
  const grantForm = view.provider.configured && view.agents.length && view.assets.length ? card('Grant a run', form('agentrun.grant', '/app/agent-runs', h`
    ${select('Agent identity', 'agent', view.agents.map(agent => ({ value: agent.id, label: agent.name })))}
    ${select('Provider', 'provider', [{ value: view.provider.configured ? view.provider.name : '', label: view.provider.configured ? view.provider.name : '' }])}
    ${field('Model', 'model', { hint: 'The exact model id this grant may call.' })}
    <fieldset class="gk-field"><legend>Assets whose records may be sent (up to 3)</legend>${view.assets.slice(0, 60).map(asset => h`<label class="gk-check"><input type="checkbox" name="assets" value="${asset.id}"> ${asset.tag} ${asset.name}</label>`)}</fieldset>
    ${hidden('actions', 'corrective')}<p class="gk-sub">The run may only prepare pending corrective work proposals. A person approves or rejects each one.</p>
    ${field('Budget (USD)', 'budget', { attrs: 'inputmode="decimal"', hint: 'A run is refused when its reserve would pass this total.' })}
    ${field('Input price (USD per million tokens)', 'inputPrice', { attrs: 'inputmode="decimal"' })}${field('Output price (USD per million tokens)', 'outputPrice', { attrs: 'inputmode="decimal"' })}
    ${field('Most proposals per run', 'maxProposals', { type: 'number', value: 3, attrs: 'min="1" max="5"' })}${field('Most output tokens per run', 'maxOutputTokens', { type: 'number', value: 800, attrs: 'min="100" max="4000"' })}
    <label class="gk-check"><input type="checkbox" name="costs" value="yes"> Also send posted work costs</label>
    ${field('Provider terms for private costs', 'termsAck', { required: false, hint: 'Required when costs are sent: record the terms that bind this provider, for example no retention and no training.' })}`, 'Grant run')) : ''
  const grants = active.map(grant => card(`${grant.model} on ${grant.assets.length} asset${grant.assets.length === 1 ? '' : 's'}`, h`
    <dl class="gk-pairs"><div><dt>Agent</dt><dd>${grant.agent}</dd></div><div><dt>Provider</dt><dd>${grant.provider}</dd></div><div><dt>Budget</dt><dd>${grant.budgetUsd ? `$${grant.budgetUsd}` : ''}, spent $${grant.spentUsd}</dd></div>
    <div><dt>Granted action</dt><dd>${grant.actions.join(', ')} proposals, up to ${grant.maxProposals} per run</dd></div><div><dt>Posted costs</dt><dd>${grant.costsSent ? 'Sent, under the recorded terms' : 'Not sent'}</dd></div></dl>
    <div class="gk-split"><a class="gk-button gk-secondary" href="/app/agent-runs?preview=${grant.id}#preview">Preview data and actions</a>
    ${form('agentrun.revoke', '/app/agent-runs', h`${hidden('grant', grant.id)}${field('Reason to revoke', 'reason')}`, 'Revoke grant', { secondary: true })}</div>`, { extra: tag('Active') }))
  const previewCard = preview ? card('Preview: exactly what this run would send', h`<p>${preview.inputs.length} records from ${preview.provider}, model ${preview.model}. Withheld: ${preview.withheld.join(', ')}.</p>
    <p>Reserve charged now: ${dollars(preview.reserveMicro)} of ${dollars(preview.budgetMicro - preview.spentMicro)} left. ${preview.wouldFit ? '' : 'This does not fit the budget.'}</p>
    <details open><summary>Request body (${preview.request.messages.length} messages)</summary>${preview.request.messages.map((message: { role: string; content: string }) => h`<p class="gk-eyebrow">${message.role}</p><pre class="gk-prompt">${message.content}</pre>`)}</details>
    ${form('agentrun.start', '/app/agent-runs', h`${hidden('grant', preview.grant)}${hidden('previewHash', preview.previewHash)}`, 'Start one run now')}`, { id: 'preview' }) : ''
  const runs = view.runs.length ? table(['Started', 'Model', 'Status', 'Cost', 'Proposals', 'What happened'], view.runs.map(run => [showRunTime(run.startedAt, actor.zone), run.model, tag(STATUS[run.status] ?? run.status),
    run.costUsd === null ? 'Reserved' : `$${run.costUsd} (${run.costBasis})`,
    run.proposals.length ? h`<a href="/app/proposals">${run.proposals.map(proposal => proposal.status).join(', ')}</a>` : '0',
    h`${OUTCOME[run.providerOutcome ?? ''] ?? (run.providerOutcome?.startsWith('output_invalid') ? `Answer refused: not in the granted shape (${run.providerOutcome.slice(15).replace(/_/g, ' ')})` : run.providerOutcome) ?? 'In progress'}${run.discarded ? ' · answer discarded' : ''}${run.stalled ? ' · stalled' : ''}`]), 'Model runs', { wrap: [5] }) : h`<p class="gk-muted">No run has been started.</p>`
  return page(env, 'Agent runs', actor, h`<h1>Agent runs</h1><p class="gk-lede">An owner grants a model run its provider, data scope and dollar budget. It sends only the previewed records, prepares pending proposals as the agent, and decides, buys and sends nothing. Revoking stops it and rejects what it left pending.</p>
    ${card('Provider', provider)}${grantForm}${grants}${previewCard}
    ${card('Run history', h`${runs}<p><a href="/app/agent-runs.csv">Export decisions, cost and outcomes (CSV)</a> · <a href="/api/gasket/agent-runs">Read as JSON</a></p>`)}`, { url })
}
