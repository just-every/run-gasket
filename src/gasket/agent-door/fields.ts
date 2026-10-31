import type { ToolContext, ToolDefinition } from '../../modules/agent-door/index.ts'
import { ToolRefusal } from '../../modules/agent-door/index.ts'
import type { Bindings } from '../../auth.server'
import { requireCapability } from '../actor'
import { one } from '../core'
import { retireCustomField, type CustomField } from '../custom-fields'
import { Input } from '../input'
import { nativeCall } from './native'
import { object, text } from './records'

/** Retire one stored identity; values and history remain under their native record permissions. */
export function fieldTools(env: Bindings): ToolDefinition[] {
  const resolve = (args: Record<string, unknown>, ctx: ToolContext) => nativeCall(env, ctx, async actor => {
    requireCapability(actor, 'register.manage')
    const field = await one<CustomField>(env, 'SELECT * FROM gk_custom_fields WHERE id=?', args.id)
    if (!field) throw new ToolRefusal('record_unavailable')
    return field
  })
  return [{
    name: 'gasket.fields.retire', title: 'Retire a custom field',
    description: 'Irreversibly retire an existing primary-site custom-field identity at its exact revision. Retains its values and history; grants no schema or membership authority.',
    scope: 'customfield.retire', readOnly: false,
    inputSchema: object({ id: text, revision: { type: 'integer', minimum: 1 } }),
    outputSchema: object({ id: text }), classes: ['destructive'], clauses: ['ASSET-009', 'SURFACE-004'],
    async target(args, ctx) { const field = await resolve(args, ctx); return { kind: 'custom-field', id: field.id } },
    async revision(args, ctx) { return (await resolve(args, ctx)).revision },
    async classify(args, ctx, completed) {
      const field = await resolve(args, ctx)
      // A completed replay rechecks authority without reinterpreting a consumed identity.
      if (completed) return [...completed]
      if (field.retired) throw new ToolRefusal('custom_field_retired')
      if (args.revision !== field.revision) throw new ToolRefusal('revision_conflict', 'revision_conflict', { current_revision: field.revision })
      return [{ class: 'destructive', facts: { measure: Number(Boolean(field.id)) } }]
    },
    async summary(args, ctx) {
      const field = await resolve(args, ctx)
      return { target: { id: field.id, name: field.name }, items: [
        'Irreversibly retire 1 custom-field identity', `Revision: ${field.revision}`,
        `Entity: ${field.entity_type}`, `Type: ${field.type}`, `Scope: ${field.scope}`,
        ...(field.category ? [`Category: ${field.category}`] : []), 'Retain all values and history',
      ] }
    },
    async run(args, ctx) {
      const result = await nativeCall(env, ctx, actor => retireCustomField(env, actor, Input.of({ id: args.id, revision: args.revision })), true)
      return { result }
    },
  }]
}
