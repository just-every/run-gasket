import type { ToolDefinition, ToolContext } from '../../modules/agent-door/index.ts'
import { ToolRefusal } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { actions } from '../actions'
import { Input } from '../input'
import { one } from '../core'
import { object, text, standard } from './records'
import { nativeCall } from './native'

const identity = { tag: text, name: text, location: text, serial: text, custodian: text, category: text, criticality: { type: 'string', enum: ['normal','important','critical'] }, notes: text }
const definitions = [
  { name: 'gasket.assets.create', action: 'asset.create', clauses: ['GAS-02'], properties: identity, required: ['tag','name','location'], target: 'asset' },
  { name: 'gasket.assets.update', action: 'asset.update', clauses: ['GAS-02'], properties: { ...identity, asset: text, revision: { type: 'integer', minimum: 1 } }, required: ['asset','revision','tag','name','location'], target: 'asset', table: 'gk_assets', version: 'revision' },
  { name: 'gasket.work.create', action: 'workorder.create', clauses: ['GAS-06','PLAN-001','FIELD-009'], properties: { asset: text, location: text, title: text, description: text, due: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, assignee: text, unassigned: { type: 'boolean' } }, required: ['title','due'], target: 'work' },
  { name: 'gasket.work.assign', action: 'workorder.assign', clauses: ['GAS-06'], properties: { workOrder: text, assignee: text, version: { type: 'integer', minimum: 1 } }, required: ['workOrder','assignee','version'], target: 'work', table: 'gk_work_orders', version: 'version', key: 'workOrder' },
  { name: 'gasket.parts.create', action: 'part.create', clauses: ['GAS-03'], properties: { number: text, name: text, unit: text, location: text, minimum: { type: 'string', pattern: '^\\d+(?:\\.\\d{1,3})?$' } }, required: ['number','name','unit','location','minimum'], target: 'part' },
  { name: 'gasket.proposals.prepare', action: 'proposal.prepare', clauses: ['GAS-13','AGENT-002','AGENT-003','AGENT-004','AGENT-005','AGENT-006'], properties: { kind: { type: 'string', enum: ['schedule','corrective','count','reassign','interval','merge'] }, reasoning: { ...text, maxLength: 4000 }, payload: { type: 'object', additionalProperties: { type: 'string' } } }, required: ['kind','reasoning','payload'], target: 'proposal' },
] as const

export function mutationTools(env: Bindings): ToolDefinition[] {
  return definitions.map(definition => {
    const def = definition as typeof definition & { table?: string; version?: string; key?: string }
    const resolve = async (args: Record<string, unknown>, ctx: ToolContext) => nativeCall(env, ctx, async () => {
      if (!def.table) return null
      const record = await one(env, `SELECT * FROM ${def.table} WHERE id=?`, args[def.key ?? def.target])
      if (!record) throw new ToolRefusal('record_unavailable')
      return record
    })
    return {
      name: def.name, title: def.action.replaceAll('.', ' '), description: `Run native ${def.action} as the current maintenance sponsor. Native roles, validation and source-version guards apply.`,
      scope: def.action, readOnly: false, inputSchema: object(def.properties, [...def.required]), outputSchema: { type: 'object', additionalProperties: true },
      classes: ['standard'], clauses: [...def.clauses, 'SURFACE-001', 'SURFACE-002', ...(def.table || def.action === 'proposal.prepare' ? ['SURFACE-006'] : [])],
      async classify(args, ctx) { await resolve(args, ctx); return standard() },
      ...(def.table ? { async revision(args: Record<string, unknown>, ctx: ToolContext) { return (await resolve(args, ctx))?.[def.version!] ?? null } } : {}),
      async target(args, ctx) { const record = await resolve(args, ctx); return record ? { kind: def.target, id: record.id } : null },
      async summary(args, ctx) {
        const record = await resolve(args, ctx)
        return { target: { ...(record?.id ? { id: record.id } : {}), name: String(record?.name ?? record?.title ?? args.name ?? args.title ?? def.target) }, items: Object.keys(def.properties).filter(key => args[key] !== undefined && !['asset','workOrder','revision'].includes(key)).map(key => `${key}: ${typeof args[key] === 'string' ? args[key] : JSON.stringify(args[key])}`), ...(args.assignee ? { recipients: [String(args.assignee)] } : {}) }
      },
      async run(args, ctx) {
        // Pick only the declared native arguments; neither policy hints nor door metadata reach the action.
        const input = Object.fromEntries(Object.keys(def.properties).filter(key => args[key] !== undefined).map(key => [key, args[key]]))
        const result = await nativeCall(env, ctx, actor => actions[def.action](env, actor, Input.of(input), new Request(`${env.AUTH_ORIGIN}/api/gasket/${def.action}`, { method: 'POST', headers: { origin: env.AUTH_ORIGIN } })), true)
        const id = (result as { id?: string })?.id
        return { result, ...(id && ['asset','work','part'].includes(def.target) ? { resources: [{ uri: `gasket://${def.target === 'asset' ? 'assets' : def.target === 'part' ? 'parts' : 'work'}/${id}`, name: def.target }] } : {}) }
      },
    }
  })
}
