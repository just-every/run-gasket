import type { ToolDefinition } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { actions } from '../actions'
import { Input } from '../input'
import { object, text } from './records'
import { nativeCall } from './native'

/** Publishing a procedure is a relied-on maintenance standard, including its first revision. */
export function procedureTools(env: Bindings): ToolDefinition[] {
  return [{ name: 'gasket.procedures.publish', title: 'Publish a maintenance procedure', description: 'Create a native checklist with its immutable first published revision. This publishes instructions; it certifies no physical work.', scope: 'checklist.create', readOnly: false,
    inputSchema: object({ name: { ...text, maxLength: 160 }, items: { type: 'array', minItems: 1, maxItems: 100, items: { ...text, maxLength: 600 } } }), outputSchema: object({ id: text, revision: text, number: { type: 'integer' } }), classes: ['commitment'], clauses: ['GAS-04'],
    classify() { return [{ class: 'commitment', facts: { measure: 0, currency: 'USD', counterparty: 'internal' } }] },
    summary(args) { return { target: { name: String(args.name) }, items: [...args.items as string[]] } },
    async run(args, ctx) {
      const result = await nativeCall(env, ctx, actor => actions['checklist.create'](env, actor, Input.of({ name: args.name, items: args.items }), new Request(`${env.AUTH_ORIGIN}/api/gasket/checklist.create`, { method: 'POST', headers: { Origin: env.AUTH_ORIGIN } })), true) as { id: string; revision: string; number: number }
      return { result, resources: [{ uri: `gasket://procedures/${result.id}`, name: 'Published procedure' }] }
    },
  }]
}
