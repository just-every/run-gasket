import type { ToolDefinition } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { Input } from '../input'
import { applyCorrectiveProposal, correctiveApplication } from '../proposals'
import { nativeCall, nativeDisposition } from './native'
import { object, text, standard } from './records'

/** Outcome investigations use the ordinary corrective proposal path, with its retained source fingerprint. */
export function correctiveProposalTools(env: Bindings): ToolDefinition[] {
  const name = 'gasket.proposals.apply'
  return [{
    name, title: 'Apply a corrective proposal',
    description: 'Apply an exact stored corrective proposal within the sponsor authority and company policy. Outcome investigations remeasure the retained comparison. Review leaves the native proposal pending for an independent lead or owner; no physical intervention or causal success is asserted.',
    scope: 'proposal.decide', readOnly: false, classes: ['standard'],
    clauses: ['GAS-13', 'AGENT-004', 'SURFACE-001', 'SURFACE-002', 'SURFACE-006'],
    inputSchema: object({ proposal: text, hash: { ...text, pattern: '^[a-f0-9]{64}$' } }),
    outputSchema: object({ id: text, status: { type: 'string', enum: ['pending', 'approved'] }, result: { type: ['string', 'null'] } }),
    async classify(args, ctx, completed) {
      await nativeCall(env, ctx, actor => correctiveApplication(env, actor, Input.of(args), Boolean(completed)))
      return standard()
    },
    async target(args, ctx) {
      const state = await nativeCall(env, ctx, actor => correctiveApplication(env, actor, Input.of(args), true))
      return { kind: 'proposal', id: state.proposal.id }
    },
    async summary(args, ctx) {
      const { proposal, payload, basis } = await nativeCall(env, ctx, actor => correctiveApplication(env, actor, Input.of(args)))
      return { target: { id: proposal.id, name: payload.title }, items: [
        `Payload: ${proposal.payload_hash}`, `Asset: ${basis.asset}, revision ${basis.assetRevision}`,
        ...(payload.outcome ? [`Assessment: ${payload.outcome}`, `Source fingerprint: ${basis.sourceHash}`, `Agreed window: ${basis.window}`] : []),
        payload.description ?? '', 'Creates corrective investigation work only; no physical result or causal success.',
      ] }
    },
    async run(args, ctx) {
      return nativeCall(env, ctx, async actor => {
        const disposition = await nativeDisposition(env, ctx, name)
        const result = await applyCorrectiveProposal(env, actor, Input.of(args), disposition)
        return { result }
      }, true)
    },
  }]
}
