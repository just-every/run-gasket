import type { ToolContext, ToolDefinition } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { requireCapability } from '../actor'
import { Input } from '../input'
import { applyReassignment, reassignmentProposal } from '../proposals'
import { nativeCall } from './native'
import { object, standard, text } from './records'

/** Internal reassignment is standard; company policy supplies the disposition. */
export function reassignmentTools(env: Bindings): ToolDefinition[] {
  const resolve = (args: Record<string, unknown>, ctx: ToolContext, completed = false) => nativeCall(env, ctx,
    actor => reassignmentProposal(env, actor, String(args.proposal), String(args.hash), String(args.source), completed))
  return [{ name: 'gasket.proposals.reassign', title: 'Apply an overdue reassignment proposal',
    description: 'Apply an existing primary-site reassignment with its exact retained work, rule, questions, blockers, linked evidence and assignee eligibility. No physical completion or maintenance sign-off.',
    scope: 'proposal.decide', readOnly: false, classes: ['standard'], clauses: ['AGENT-005','SURFACE-001','SURFACE-002','SURFACE-006'],
    inputSchema: object({ proposal: text, hash: { ...text, pattern: '^[a-f0-9]{64}$' }, source: { ...text, pattern: '^[a-f0-9]{64}$' } }),
    outputSchema: object({ id: text, status: text, result: text }),
    async classify(args, ctx, completed) {
      if (completed) await nativeCall(env, ctx, async actor => { requireCapability(actor, 'work.assign') })
      else await resolve(args, ctx)
      return standard()
    },
    async target(args, ctx) { const { payload } = await resolve(args, ctx); return { kind: 'work', id: payload.workOrder } },
    async summary(args, ctx) {
      const { proposal, payload, basis, source } = await resolve(args, ctx)
      return { target: { id: payload.workOrder, name: `Reassign work ${payload.workOrder}` }, recipients: [payload.assignee],
        items: [proposal.id, proposal.payload_hash, source, JSON.stringify(basis), payload.note] }
    },
    async run(args, ctx) {
      const result = await nativeCall(env, ctx, actor => applyReassignment(env, actor, Input.of(args)), true)
      return { result }
    },
  }]
}
