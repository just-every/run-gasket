import type { ToolDefinition } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { Input } from '../input'
import { readOutcome } from '../outcomes'
import { applyIntervalProposal, intervalApplication } from '../proposals'
import { nativeCall, nativeDisposition } from './native'
import { object, text } from './records'

/** A published cadence is a maintenance commitment, never a physical intervention or sign-off. */
export function intervalProposalTools(env: Bindings): ToolDefinition[] {
  const name = 'gasket.intervals.apply'
  return [{
    name, title: 'Apply a proposed maintenance interval',
    description: 'Apply an exact stored interval proposal under company policy and current native authority. Recheck its evidence, declared limits and source revision. Outcome reversals remeasure the retained assessment. Issued work and the next promised occurrence retain their instructions and due point.',
    scope: 'proposal.decide', readOnly: false, classes: ['commitment'],
    clauses: ['AGENT-003', 'AGENT-004', 'SURFACE-003', 'SURFACE-006'],
    inputSchema: object({ proposal: text, hash: { ...text, pattern: '^[a-f0-9]{64}$' } }),
    outputSchema: object({ id: text, status: { type: 'string', enum: ['approved'] }, result: text }),
    async classify(args, ctx, completed) {
      await nativeCall(env, ctx, actor => intervalApplication(env, actor, Input.of(args), Boolean(completed)))
      return [{ class: 'commitment', facts: { measure: 0, currency: 'USD', counterparty: 'internal' } }]
    },
    async target(args, ctx) {
      const { payload } = await nativeCall(env, ctx, actor => intervalApplication(env, actor, Input.of(args), true))
      return { kind: 'schedule', id: payload.schedule }
    },
    async summary(args, ctx) {
      const { proposal, basis, report } = await nativeCall(env, ctx, async actor => {
        const state = await intervalApplication(env, actor, Input.of(args))
        return { ...state, report: state.basis.outcome ? await readOutcome(env, actor, state.basis.outcome.id) : null }
      })
      return { target: { id: basis.schedule.id, name: basis.schedule.title }, items: [
        `Proposal: ${proposal.id}`, `Payload: ${proposal.payload_hash}`, `Schedule revision: ${basis.schedule.revision}`,
        ...(basis.change.fromDays !== null ? [`Calendar cadence: ${basis.change.fromDays} days to ${basis.change.toDays} days`] : []),
        ...(basis.change.fromUnits !== null ? [`Counter cadence: ${basis.change.fromUnits} to ${basis.change.toUnits} meter units`] : []),
        `Rollback plan: ${basis.rollbackPlan}`,
        ...basis.limits.map(limit => `Declared ${limit.source} limit, revision ${limit.revision}: ${limit.min_days === null ? '' : `${limit.min_days} to ${limit.max_days} days. `}${limit.min_units === null ? '' : `${limit.min_units} to ${limit.max_units} meter units. `}${limit.reference}`),
        ...(basis.outcome ? [`Assessment: ${basis.outcome.id}`, `Source fingerprint: ${basis.outcome.sourceHash}`, `Agreed window: ${basis.outcome.window}`] : []),
        ...(report ? [`Measured outcome: ${report.status}`, `Agreed baseline: ${report.source.windows.baseline.from} to ${report.source.windows.baseline.to}`, `Agreed follow-up: ${report.source.windows.post.from} to ${report.source.windows.post.to}`,
          ...report.uncertainty.map((item: string) => `Outcome uncertainty: ${item}`)] : []),
        basis.expectedEffect, ...basis.uncertainty,
      ] }
    },
    async run(args, ctx) {
      return nativeCall(env, ctx, async actor => ({ result: await applyIntervalProposal(env, actor, Input.of(args), await nativeDisposition(env, ctx, name)) }), true)
    },
  }]
}
