import { reassignmentTools } from './reassignment'
import type { Bindings } from '../../auth.server'
import { mutationTools } from './tools'
import { procedureTools } from './procedures'
import { recordResources, recordTools } from './records'
import { capabilities, notTools } from './index'

/** Public, registry-derived documentation contains declarations only, never native records. */
export function agentDocumentation(request: Request, env: Bindings): Response | null {
  if (new URL(request.url).pathname !== '/docs/agents') return null
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const tools = [...recordTools(env), ...mutationTools(env), ...procedureTools(env), ...reassignmentTools(env)].sort((a, b) => a.name.localeCompare(b.name))
  const resources = recordResources(env).sort((a, b) => a.uriTemplate.localeCompare(b.uriTemplate))
  const body = [
    '# Gasket maintenance coordinator',
    '',
    'Use /mcp with an owner-bound Business token or an explicitly scoped native service credential. Company policy and current native maintenance authority decide each call. Before policy setup or while paused, no agent action runs.',
    '',
    '| Tool | Scope | Read only | Classes | Clauses |',
    '| --- | --- | --- | --- | --- |',
    ...tools.map(tool => `| ${tool.name} | ${tool.scope} | ${tool.readOnly} | ${tool.classes.join(', ')} | ${tool.clauses.join(', ')} |`),
    '',
    '## Maintenance resources',
    '',
    '| Resource template | Scope | Classes |',
    '| --- | --- | --- |',
    ...resources.map(resource => `| ${resource.uriTemplate} | ${resource.scope} | ${resource.classes.join(', ')} |`),
    '',
    'Discover resource templates through MCP and follow the returned links with its resource read method. Each read retrieves current primary-site native facts and rechecks sponsor, credential, scope, consent and policy. Detailed work computes sensitive personnel and pay facts from the current record; approval policy withholds content. Native service credentials retain their existing route restrictions and cannot read procedures. No additional credential scope is issued.',
    '',
    '## Declared door',
    '',
    `Capabilities: ${capabilities.join(', ')}. Events, prompts and subscriptions are undeclared. Their catalogues are empty and calls return capability_not_declared without native effects. Read tools inspect native records with current visibility; stored and imported text is untrusted.`,
    '',
    '## Verification',
    '',
    'agent-surface.json supplies every declared tool and class fixture. Its native owner initializer and additional journey exercise real production setup, scoped credentials, revocation, changed-key conflicts, stale revisions and native attribution. Standard is internal record work. Detailed work records include native personnel identities and authorized private pay and rate fields, so their class is sensitive; publishing the first immutable procedure revision and amending an existing exact revision are commitment, with no monetary consideration. Amendment resolves the primary-site target and step identities from native records, binds the source and proposed instructions to policy approval, and rechecks the source atomically. Earlier revisions and issued work keep their instructions. Native owner and lead authority is required; service credential scopes are unchanged.',
    '',
    '## Limits',
    '',
    'This Core adoption exposes the listed software jobs. It does not expose native purchasing, provider model runs, role administration, physical attestations, import, deployment or device operations as MCP jobs. Existing native screens and their permissions remain authoritative. Native maintenance events, prompts and subscriptions are undeclared. Remaining resource families, event handoffs, channel revocation, multi-sponsor completion, outside mail and queued continuations remain unproved. No cost reservation or provider call is registered. The pinned conformance journey checks Core jobs, every returned resource link under autonomous and held policy, and typed refusals for omitted families.',
    '',
    'The maintenance coordinator reads source records and stages proposals through the listed tools. Existing overdue reassignment proposals can execute under company policy, with exact source evidence and current assignee eligibility rechecked atomically. Standard review retains a real review record; a company-required independent approval retains its genuine lead or owner. Autonomous execution invents no human approval. An agent never certifies physical work, isolation, receipt, a person’s approval or an outside provider challenge.',
    '',
    '## Other doors',
    '',
    ...notTools.map(item => `- ${item.reason}: ${item.clauses.join(', ')}`),
    '',
    '## Refusals and capacities',
    '',
    'Native business codes are retained. Door codes include policy_unset, agents_paused, policy_blocked, insufficient_scope, idempotency_conflict, revision_conflict, resource_unavailable, capability_not_declared, tool_not_found and self_escalation. Discovery reports the current body and request capacities. Resource reads use the same policy decision as native read tools and return no record content on refusal. MCP supports 2026-07-28 and 2025-11-25.',
    '',
  ].join('\n')
  return new Response(request.method === 'HEAD' ? null : body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}
