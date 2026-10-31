import type { ToolContext, ToolDefinition } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { Input } from '../input'
import { intervalProposal, applyIntervalProposal } from '../proposals'
import { nativeCall } from './native'
import { object, text } from './records'

/** Stored maintenance-standard changes carry commitment, regardless of caller labels. */
export function intervalTools(env: Bindings): ToolDefinition[] {
  const resolve = (args: Record<string, unknown>, ctx: ToolContext, completed = false) => nativeCall(env, ctx,
    actor => intervalProposal(env, actor, String(args.proposal), String(args.hash), String(args.source), completed))
  return [{ name: 'gasket.proposals.interval', title: 'Apply a constrained PM interval shortening',
    description: 'Apply an existing primary-site non-rollback interval shortening with exact cohort evidence, schedule revision and mandatory maintenance limits. Company policy controls execution; physical maintenance is not certified.',
    scope: 'proposal.decide', readOnly: false, classes: ['commitment'], clauses: ['AGENT-003','SURFACE-001','SURFACE-003','SURFACE-006'],
    inputSchema: object({ proposal: text, hash: { ...text, pattern: '^[a-f0-9]{64}$' }, source: { ...text, pattern: '^[a-f0-9]{64}$' } }),
    outputSchema: object({ id: text, status: text, result: text }),
    async classify(args, ctx, completed) {
      await resolve(args, ctx, Boolean(completed))
      return [{ class: 'commitment', facts: { measure: 0, currency: 'USD', counterparty: 'internal' } }]
    },
    async target(args, ctx) { return { kind: 'schedule', id: (await resolve(args, ctx)).basis.schedule.id } },
    async summary(args, ctx) {
      const { basis } = await resolve(args, ctx)
      const meter = basis.assets[0].meters.find(row => row.id === basis.schedule.meter_id)
      const unit = String(meter?.unit ?? 'recorded units')
      return { target: { id: basis.schedule.id, name: basis.schedule.title }, items: [
        ...(basis.change.fromDays === null ? [] : [`Calendar interval: ${basis.change.fromDays} days to ${basis.change.toDays} days.`]),
        ...(basis.change.fromUnits === null ? [] : [`Counter interval (${meter?.name ?? 'schedule meter'}): ${basis.change.fromUnits} ${unit} to ${basis.change.toUnits} ${unit}.`]),
        `Evidence from ${basis.from} through ${basis.to}; schedule revision ${basis.schedule.revision}.`,
        ...basis.limits.map(limit => `${String(limit.source).toUpperCase()} bounds: ${[
          limit.min_days === null ? '' : `${limit.min_days} to ${limit.max_days} days`,
          limit.min_units === null ? '' : `${limit.min_units} to ${limit.max_units} ${unit}`,
        ].filter(Boolean).join('; ')}. Reference revision ${limit.revision}: ${limit.reference}`),
        basis.expectedEffect, ...basis.uncertainty, basis.rollbackPlan,
      ] }
    },
    async run(args, ctx) {
      return { result: await nativeCall(env, ctx, actor => applyIntervalProposal(env, actor, Input.of(args)), true) }
    },
  }]
}
