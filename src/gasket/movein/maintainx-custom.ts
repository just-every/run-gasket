// Asset custom columns use the same reviewed row and provenance as the asset.
import type { Bindings } from '../../auth.server'
import type { Json } from '../../modules/import-kit/src/d1/index'
import { GasketError, insist } from '../core'
import { customFields, validateCustomValue, type CustomField } from '../custom-fields'
import type { Input } from '../input'

export interface CustomMapping {
  columns: { column: string; fieldId: string }[]
  fields: { id: string; name: string; category: string | null; type: string }[]
}

const applies = (field: CustomField, category: string | null) => field.scope !== 'category' || field.category?.toLowerCase() === category?.toLowerCase()

export async function assetCustomMapping(env: Bindings, input: Input, header: string[], entityType = 'asset') {
  const fields = await customFields(env, entityType)
  let supplied: unknown = input.has('customMapping') ? input.json('customMapping') : {}
  if (typeof supplied === 'string') {
    insist(supplied.length <= 500_000, 'invalid_custom_mapping')
    try { supplied = JSON.parse(supplied) } catch { throw new GasketError('invalid_custom_mapping') }
  }
  // Parallel repeated form fields let the dry run offer mapping without JSON.
  const columns = input.list('customColumn', { keepEmpty: true })
  if (columns.length) {
    const ids = input.list('customField', { keepEmpty: true })
    insist(columns.length === ids.length && new Set(columns).size === columns.length, 'invalid_custom_mapping')
    supplied = Object.fromEntries(columns.map((column, index) => [column, ids[index]]))
  }
  insist(supplied && typeof supplied === 'object' && !Array.isArray(supplied), 'invalid_custom_mapping')
  const explicit = supplied as Record<string, unknown>
  insist(Object.entries(explicit).every(([column, id]) => header.includes(column) && typeof id === 'string' && (!id || fields.some(f => f.id === id))), 'invalid_custom_mapping')
  const mapping: Record<string, string> = Object.create(null)
  for (const column of header) {
    // Auto-map only a unique, exact name. Category ambiguity requires a choice.
    const matching = fields.filter(f => f.name === column)
    mapping[column] = Object.hasOwn(explicit, column) ? explicit[column] as string : matching.length === 1 ? matching[0].id : ''
  }
  const chosen = Object.values(mapping).filter(Boolean)
  insist(new Set(chosen).size === chosen.length, 'duplicate_custom_mapping')
  for (const column of Object.keys(mapping).filter(column => mapping[column]))
    insist(header.filter(name => name === column).length === 1, 'ambiguous_custom_column')
  const preview: CustomMapping = { columns: Object.entries(mapping).map(([column, fieldId]) => ({ column, fieldId })), fields: fields.map(f => ({ id: f.id, name: f.name, category: f.category, type: f.type })) }
  return {
    preview,
    carry: JSON.stringify(mapping),
    values(cells: Record<string, string>, category: string | null): Record<string, Json> {
      const values: Record<string, Json> = Object.create(null)
      for (const field of fields) {
        const column = Object.keys(mapping).find(column => mapping[column] === field.id)
        if (!applies(field, category)) {
          if (column && cells[column]?.trim()) throw new GasketError(`Custom field “${field.name}” does not apply to category “${category ?? 'none'}”`)
          continue
        }
        try {
          let raw: unknown = column ? (cells[column] ?? '').trim() : null
          // Multi-selects may be a JSON array or a comma-separated cell.
          if (field.type === 'multiple' && typeof raw === 'string' && raw.startsWith('[')) raw = JSON.parse(raw)
          if (field.type === 'boolean' && typeof raw === 'string') {
            if (/^(true|yes)$/i.test(raw)) raw = true
            else if (/^(false|no)$/i.test(raw)) raw = false
          }
          const value = validateCustomValue(field, raw)
          if (value !== null) values[field.id] = value
        } catch (error) {
          if (!(error instanceof GasketError) && !(error instanceof SyntaxError)) throw error
          throw new GasketError(`Custom field “${field.name}”: ${error instanceof GasketError ? error.code.replaceAll('_', ' ') : 'invalid choice array'}`)
        }
      }
      return values
    },
  }
}
