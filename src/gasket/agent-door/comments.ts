import type { ToolContext, ToolDefinition } from '../../modules/agent-door/index.ts'
import { ToolRefusal } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { requireCapability } from '../actor'
import { actions } from '../actions'
import { one } from '../core'
import { Input } from '../input'
import { nativeCall } from './native'
import { object, standard, text } from './records'

/** Internal plain-text comments borrow only the current human sponsor's native rights. */
export function commentTools(env: Bindings): ToolDefinition[] {
  const resolve = (args: Record<string, unknown>, ctx: ToolContext) => nativeCall(env, ctx, async actor => {
    requireCapability(actor, 'comment.write')
    const work = await one<{ id: string; number: number; title: string }>(env, 'SELECT id,number,title FROM gk_work_orders WHERE id=?', args.workOrder)
    if (!work) throw new ToolRefusal('work_order_not_found')
    return work
  })
  return [{
    name: 'gasket.comments.post', title: 'Post an internal work comment',
    description: 'Post plain text on existing primary-site work as agent for the current human sponsor. Native comment rights and company policy apply. Photos, mentions, edits and handoff summaries are separate native operations.',
    scope: 'comment.post', readOnly: false, classes: ['standard'], clauses: ['PLAN-006', 'SURFACE-001', 'SURFACE-002'],
    inputSchema: object({ workOrder: { ...text, maxLength: 100 }, body: { ...text, maxLength: 2000 } }),
    outputSchema: object({ id: text, comment: text }),
    async classify(args, ctx) { await resolve(args, ctx); return standard() },
    async target(args, ctx) { return { kind: 'work', id: (await resolve(args, ctx)).id } },
    async summary(args, ctx) {
      const work = await resolve(args, ctx)
      return { target: { id: work.id, name: `WO-${String(work.number).padStart(4, '0')} ${work.title}` }, items: [String(args.body)] }
    },
    async run(args, ctx) {
      const work = await resolve(args, ctx)
      const result = await nativeCall(env, ctx, actor => actions['comment.post'](env, actor, Input.of({ workOrder: work.id, body: args.body }), new Request(`${env.AUTH_ORIGIN}/api/gasket/comment.post`, { method: 'POST', headers: { Origin: env.AUTH_ORIGIN } })), true)
      return { result }
    },
  }]
}
