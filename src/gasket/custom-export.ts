import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, insist } from './core'
import { customValues, customFields } from './custom-fields'
const displayCustom = (value: unknown) => value == null ? '—' : Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)
const cell = (value: unknown) => { const text = String(value ?? ''); return '"' + (/^[=+\-@\t\r]/.test(text) ? "'" : '') + text.replace(/"/g, '""') + '"' }
export async function customRegisterCsv(env: Bindings, actor: Actor, type: string, url: URL) {
  requireCapability(actor, 'history.export')
  insist(['asset', 'part', 'location'].includes(type), 'invalid_custom_entity')
  const rows = await all(env, type === 'part' ? 'SELECT id,number AS tag,name,category FROM gk_parts ORDER BY number' : type === 'location' ? "SELECT id,id AS tag,name,NULL AS category FROM gk_request_targets WHERE kind='location' ORDER BY name" : 'SELECT id,tag,name,category FROM gk_assets ORDER BY tag')
  const fields = await customFields(env, type, undefined, true), filter = url.searchParams.get('field'), wanted = url.searchParams.get('value')
  const output: unknown[][] = [['ID', 'Tag', 'Name', 'Category', ...fields.map(f => f.name + (f.retired ? ' (archived)' : '') + (f.unit ? ` (${f.unit})` : ''))]]
  for (const row of rows) {
    const values = await customValues(env, type, row.id, row.category)
    if (filter && !values.some(v => v.id === filter && (Array.isArray(v.value) ? v.value.some(x => String(x) === wanted) : String(v.value) === wanted))) continue
    output.push([row.id, row.tag, row.name, row.category, ...fields.map(f => displayCustom(values.find(v => v.id === f.id)?.value))])
  }
  return output.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
