import type { ToolDefinition, ToolContext } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { actions } from '../actions'
import { requireCapability } from '../actor'
import { insist, one } from '../core'
import { lineOf, type ChecklistItem } from '../steps'
import { Input } from '../input'
import { object, text } from './records'
import { nativeCall } from './native'

/** Publishing a procedure is a relied-on maintenance standard, including its first revision. */
export function procedureTools(env: Bindings): ToolDefinition[] {
  return [{ name: 'gasket.procedures.publish', title: 'Publish a maintenance procedure', description: 'Create a native checklist with its immutable first published revision. This publishes instructions; it certifies no physical work.', scope: 'checklist.create', readOnly: false,
    inputSchema: object({ name: { ...text, maxLength: 160 }, items: { type: 'array', minItems: 1, maxItems: 100, items: { ...text, maxLength: 600 } } }), outputSchema: object({ id: text, revision: text, number: { type: 'integer' } }), classes: ['commitment'], clauses: ['GAS-04', 'SURFACE-001', 'SURFACE-003'],
    classify() { return [{ class: 'commitment', facts: { measure: 0, currency: 'USD', counterparty: 'internal' } }] },
    summary(args) { return { target: { name: String(args.name) }, items: [...args.items as string[]] } },
    async run(args, ctx) {
      const result = await nativeCall(env, ctx, actor => actions['checklist.create'](env, actor, Input.of({ name: args.name, items: args.items }), new Request(`${env.AUTH_ORIGIN}/api/gasket/checklist.create`, { method: 'POST', headers: { Origin: env.AUTH_ORIGIN } })), true) as { id: string; revision: string; number: number }
      return { result, resources: [{ uri: `gasket://procedures/${result.id}`, name: 'Published procedure' }] }
    },
  }, amendmentTool(env)]
}


/** Resolve existing primary-site instructions, never authority supplied by the caller. */
function amendmentTool(env: Bindings): ToolDefinition {
  const source = (args: Record<string, unknown>, ctx: ToolContext) => nativeCall(env, ctx, async actor => {
    requireCapability(actor, 'register.manage')
    const row = await one<{ id: string; name: string; revision: string; number: number; items_json: string }>(env,
      `SELECT c.id,c.name,r.id AS revision,r.number,r.items_json FROM gk_checklists c
       JOIN gk_checklist_revisions r ON r.checklist_id=c.id WHERE c.id=? ORDER BY r.number DESC LIMIT 1`, args.checklist)
    insist(row, 'checklist_not_found', 404)
    return row
  })
  const proposed = async (args: Record<string, unknown>, ctx: ToolContext) => {
    const row = await source(args, ctx)
    insist(row.revision === args.sourceRevision, 'revision_conflict', 409)
    const original = JSON.parse(row.items_json) as ChecklistItem[]
    const changes = args.amendments as { step: string; text: string }[]
    insist(new Set(changes.map(change => change.step)).size === changes.length, 'duplicate_step')
    insist(changes.every(change => original.some(item => item.key === change.step)), 'step_not_found', 404)
    // Labels change; the stored type, limits, conditions and step identities remain authoritative.
    const amended = original.map(item => ({ ...item, text: changes.find(change => change.step === item.key)?.text.trim() ?? item.text }))
    insist(amended.every(item => item.text.length && !/[|\r\n]/.test(item.text)), 'invalid_items')
    const lines = amended.map(item => `${lineOf(item, amended)} | key ${item.key}`)
    return { row, original, amended, lines }
  }
  return {
    name: 'gasket.procedures.amend', title: 'Amend published procedure instructions',
    description: 'Amend step labels on an exact existing procedure revision. Native step identities, types, limits and issued-work pins stay intact. Publishes instructions; certifies no physical work.',
    scope: 'checklist.revise', readOnly: false,
    inputSchema: object({ checklist: text, sourceRevision: text, amendments: { type: 'array', minItems: 1, maxItems: 60, items: object({ step: text, text: { ...text, maxLength: 300 } }) }, note: { ...text, maxLength: 300 } }),
    outputSchema: object({ id: text, revision: text, number: { type: 'integer' } }),
    classes: ['commitment'], clauses: ['GAS-04', 'SURFACE-001', 'SURFACE-003', 'SURFACE-006'], revisionType: 'string',
    async revision(args, ctx) { return (await source(args, ctx)).revision },
    async target(args, ctx) { return { kind: 'procedure', id: (await source(args, ctx)).id } },
    async classify(args, ctx, completed) {
      if (completed) { await source(args, ctx); return [...completed] }
      await proposed(args, ctx)
      return [{ class: 'commitment', facts: { measure: 0, currency: 'USD', counterparty: 'internal' } }]
    },
    async summary(args, ctx) {
      const { row, original, amended } = await proposed(args, ctx)
      return { target: { id: row.id, name: row.name }, items: [
        `Primary-site procedure; source revision ${row.revision} (revision ${row.number}); publishes revision ${row.number + 1}`,
        ...original.map(item => `Source ${item.key}: ${lineOf(item, original)}`),
        ...amended.map(item => `Proposed ${item.key}: ${lineOf(item, amended)}`),
        `Reason: ${String(args.note).trim()}`, 'Published instructions only; no physical certification.',
      ] }
    },
    async run(args, ctx) {
      const { row, lines } = await proposed(args, ctx)
      const result = await nativeCall(env, ctx, actor => actions['checklist.revise'](env, actor,
        Input.of({ checklist: row.id, sourceRevision: args.sourceRevision, items: lines, note: args.note }),
        new Request(`${env.AUTH_ORIGIN}/api/gasket/checklist.revise`, { method: 'POST', headers: { Origin: env.AUTH_ORIGIN } })), true)
      return { result, resources: [{ uri: `gasket://procedures/${row.id}`, name: 'Amended procedure' }] }
    },
  }
}
