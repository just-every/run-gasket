import { fieldTools } from './fields'
import type { Bindings } from '../../auth.server'
import { mutationTools } from './tools'
import { procedureTools } from './procedures'
import { recordTools } from './records'
import { capabilities, notTools } from './index'

/** Public, registry-derived documentation contains declarations only, never native records. */
export function agentDocumentation(request: Request, env: Bindings): Response | null {
  if (new URL(request.url).pathname !== '/docs/agents') return null
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const tools = [...recordTools(env), ...mutationTools(env), ...procedureTools(env), ...fieldTools(env)].sort((a, b) => a.name.localeCompare(b.name))
  const body = [
    '# Gasket maintenance coordinator',
    '',
    'Use /mcp with an owner-bound Business token or an explicitly scoped native service credential. Company policy and current native maintenance authority decide each call. Before policy setup or while paused, no agent action runs.',
    '',
    '| Tool | Scope | Read only | Classes | Clauses |',
    '| --- | --- | --- | --- | --- |',
    ...tools.map(tool => `| ${tool.name} | ${tool.scope} | ${tool.readOnly} | ${tool.classes.join(', ')} | ${tool.clauses.join(', ')} |`),
    '',
    '## Declared door',
    '',
    `Capabilities: ${capabilities.join(', ')}. Events, resources, prompts and subscriptions are undeclared. Their catalogues are empty and calls return capability_not_declared without native effects. Read tools inspect native records with current visibility; stored and imported text is untrusted.`,
    '',
    '## Verification',
    '',
    'agent-surface.json supplies every declared tool/class fixture. Its native owner initializer and additional journey exercise real production setup, scoped credentials, revocation, changed-key conflicts, stale revisions and native attribution. Standard is internal record work. Detailed work records include native personnel identities and authorized private pay/rate fields, so their class is sensitive; publishing the first immutable procedure revision is commitment, with no monetary consideration. Retiring an existing custom-field identity is destructive, counts that one stored identity, binds its exact revision and retains all native values and history. Schema and membership authority remain unchanged.',
    '',
    '## Limits',
    '',
    'This Core adoption exposes the listed software jobs. It does not expose native purchasing, provider model runs, role administration, physical attestations, import, deployment or device operations as MCP jobs. Existing native screens and their permissions remain authoritative. Native maintenance events, resources, prompts and subscriptions are undeclared. Resource refresh, multi-sponsor completion, outside mail and queued continuations remain unproved. No cost reservation or provider call is registered. The 0.2.91 conformance journey checks Core jobs and typed refusals for omitted families.',
    '',
    'The maintenance coordinator reads source records and stages proposals through the listed tools. An agent never certifies physical work, isolation, receipt, a person’s approval or an outside provider challenge.',
    '',
    '## Other doors',
    '',
    ...notTools.map(item => `- ${item.reason}: ${item.clauses.join(', ')}`),
    '',
    '## Refusals and capacities',
    '',
    'Native business codes are retained. Door codes include policy_unset, agents_paused, policy_blocked, insufficient_scope, idempotency_conflict, revision_conflict, resource_unavailable, capability_not_declared, tool_not_found and self_escalation. Discovery reports the current body and request capacities. The public resource door is undeclared and returns capability_not_declared; native read tools retain their visibility checks. MCP supports 2026-07-28 and 2025-11-25.',
    '',
  ].join('\n')
  return new Response(request.method === 'HEAD' ? null : body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}
