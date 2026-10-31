import type { ToolDefinition } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { Input } from '../input'
import { applyCorrectiveProposal, correctiveProposal } from '../proposals'
import { nativeCall } from './native'
import { object, text, standard } from './records'

/** Apply the saved corrective payload only; policy never grants additional maintenance authority. */
export function proposalTools(env: Bindings): ToolDefinition[] {
  const resolve = (args: Record<string, unknown>, ctx: Parameters<typeof nativeCall>[1], completed = false) =>
    nativeCall(env, ctx, actor => correctiveProposal(env, actor, String(args.proposal), String(args.hash), Number(args.assetRevision), completed))
  return [{ name: 'gasket.proposals.apply_corrective', title: 'Apply a corrective work proposal',
    description: 'Apply an existing exact-hash corrective proposal under company policy. Review keeps the native proposal pending for a different lead or owner. No physical work is certified.',
    scope: 'proposal.decide', readOnly: false,
    inputSchema: object({ proposal: { ...text, maxLength: 100 }, hash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, assetRevision: { type: 'integer', minimum: 1 } }),
    outputSchema: object({ id: text, status: { type: 'string', enum: ['pending', 'applied', 'approved'] }, result: { type: ['string', 'null'] } }),
    classes: ['standard'], clauses: ['GAS-13', 'SURFACE-001', 'SURFACE-002', 'SURFACE-006'],
    async classify(args, ctx, completed) { await resolve(args, ctx, !!completed); return standard() },
    async target(args, ctx) { const { proposal } = await resolve(args, ctx, true); return { kind: 'proposal', id: proposal.id } },
    async revision(args, ctx) { return (await resolve(args, ctx, true)).asset.revision },
    async summary(args, ctx) {
      const { proposal, payload, basis } = await resolve(args, ctx)
      return { target: { id: proposal.id, name: payload.title }, items: [proposal.reasoning, `Payload hash: ${proposal.payload_hash}`, `Asset: ${basis.asset}; revision: ${basis.assetRevision}`, `Due: ${payload.due}`, payload.description ?? '', ...(payload.assignee ? [`Assignee: ${payload.assignee}`] : [])] }
    },
    async run(args, ctx) { return { result: await nativeCall(env, ctx, actor => applyCorrectiveProposal(env, actor, Input.of(args)), true) } },
  }]
}
