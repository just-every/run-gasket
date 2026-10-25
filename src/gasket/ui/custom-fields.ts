import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { customFields, customValues, CUSTOM_TYPES } from '../custom-fields'
import { all, one, insist } from '../core'
import { showInstant } from '../dates'
import { area, card, checkbox, field, form, h, hidden, select, table, tag } from './html'
import { page } from './shell'
const typeLabels: Record<string, string> = { text: 'Text', number: 'Number with unit', single: 'Single choice', multiple: 'Multiple choice', date: 'Date', boolean: 'Yes or no', link: 'Link' }
export const displayCustom = (value: unknown) => value === null || value === undefined ? '—' : Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)
export async function customInputs(env: Bindings, entityType: string, category?: string | null, values: any[] = []) {
  const fields = await customFields(env, entityType, category)
  return h`${fields.map(f => {
    const value = values.find(v => v.id === f.id)?.value, label = `${f.name}${f.unit ? ` (${f.unit})` : ''}${f.scope === 'category' && category === undefined ? ` · ${f.category}` : ''}`
    const required = category !== undefined && Boolean(f.required), name = `cf.${f.id}`
    if (f.type === 'single' || f.type === 'boolean') return select(label, name, f.type === 'single' ? JSON.parse(f.options!) .map((s: string) => ({ value: s, label: s })) : [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], value === true ? 'yes' : value === false ? 'no' : value ?? '', { required, blank: 'Choose a value' })
    return field(label, name, { type: f.type === 'date' ? 'date' : f.type === 'link' ? 'url' : f.type === 'number' ? 'number' : 'text', value: Array.isArray(value) ? value.join(', ') : value ?? '', required, hint: f.type === 'multiple' ? `Choose comma-separated values: ${JSON.parse(f.options!).join(', ')}` : '', attrs: f.type === 'number' ? `step="any"${f.minimum === null ? '' : ` min="${f.minimum}"`}${f.maximum === null ? '' : ` max="${f.maximum}"`}` : '' })
  })}`
}
export async function customCard(env: Bindings, actor: Actor, entityType: string, entityId: string, category: string | null, back: string) {
  const values = await customValues(env, entityType, entityId, category)
  if (!values.length && entityType !== 'part') return ''
  const part = entityType === 'part' ? await one(env,'SELECT category,revision FROM gk_parts WHERE id=?',entityId) : null
  const active = values.filter(v => !v.archived)
  return card('Custom fields', h`${table(['Field', 'Value'], values.map(f => [h`${f.name}${f.archived ? h` ${tag('Archived')}` : ''}`, f.type === 'link' && f.value ? h`<a href="${f.value}">${f.value}</a>` : `${displayCustom(f.value)}${f.value !== null && f.unit ? ` ${f.unit}` : ''}`]), 'Custom fields', { wrap: [0, 1] })}${can(actor, 'register.manage') && active.length ? h`<details class="gk-details"><summary>Edit custom fields</summary>${form('customvalue.set', back, h`${hidden('entityType', entityType)}${hidden('entityId', entityId)}${await customInputs(env, entityType, category, values)}`, 'Update values', { secondary: true })}</details>` : ''}
    ${part && can(actor,'register.manage') ? h`<details class="gk-details"><summary>Change part category</summary>${form('part.category',back,h`${hidden('part',entityId)}${hidden('revision',part.revision)}${field('Category','category',{value:part.category??'',required:false})}${await customInputs(env,'part',undefined,values)}`,'Update category',{secondary:true})}</details>` : ''}<details class="gk-details"><summary>Value history</summary>${table(['Field', 'Value', 'Who', 'When'], values.flatMap(f => f.history.map(row => [f.name, displayCustom(row.value), row.actor ?? row.changed_by, showInstant(row.changed_at, actor.zone)])), 'Custom field history', { wrap: [0, 1] })}</details>`, { id: 'custom-fields' })
}
export async function customFieldsPage(env: Bindings, actor: Actor, url: URL) {
  const fields = await customFields(env, undefined, undefined, true), manage = can(actor, 'register.manage')
  const create = manage ? card('Define a field', form('customfield.save', '/app/settings/fields', h`<div class="gk-grid">${field('Field name', 'name')}${select('Record type', 'entityType', ['asset', 'location', 'part'].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })))}${select('Type', 'type', CUSTOM_TYPES.map(s => ({ value: s, label: typeLabels[s] })))}${select('Scope', 'scope', [{ value: 'organization', label: 'Organization' }, { value: 'site', label: 'Current site' }, { value: 'category', label: 'Category' }])}${field('Category (category scope)', 'category', { required: false })}${field('Unit (number fields)', 'unit', { required: false })}${field('Minimum (optional)', 'minimum', { type: 'number', required: false, attrs: 'step="any"' })}${field('Maximum (optional)', 'maximum', { type: 'number', required: false, attrs: 'step="any"' })}</div>${area('Choices (one per line)', 'options', { required: false })}${checkbox('A value is required', 'required')}`, 'Define field'), { id: 'define-field' }) : ''
  const locations = await all(env, "SELECT id,name FROM gk_request_targets WHERE kind='location' AND retired_at IS NULL ORDER BY name")
  return page(env, 'Custom fields', actor, h`<h1>Custom fields</h1><p class="gk-lede">Asset, location and part information for this organization and current site.</p>${card('Field definitions', fields.length ? table(['Field', 'Records and scope', 'Type', 'Manage'], fields.map(f => [h`${f.name}${f.retired ? h` ${tag('Archived')}` : ''}`, `${f.entity_type} · ${f.scope}${f.category ? ` · ${f.category}` : ''}`, `${typeLabels[f.type]}${f.unit ? ` (${f.unit})` : ''}${f.required ? ' · Required' : ' · Optional'}`, manage && !f.retired ? h`<details class="gk-details"><summary>Manage field</summary>${form('customfield.save', '/app/settings/fields', h`${hidden('id', f.id)}${hidden('revision', f.revision)}${hidden('entityType', f.entity_type)}${hidden('type', f.type)}${hidden('scope', f.scope)}${hidden('category', f.category)}${hidden('unit', f.unit)}${hidden('minimum', f.minimum)}${hidden('maximum', f.maximum)}${hidden('options', f.options ? JSON.parse(f.options).join('\n') : '')}${f.required ? hidden('required', 'yes') : ''}${field('New name', 'name', { value: f.name })}`, 'Rename field', { secondary: true })}${form('customfield.retire', '/app/settings/fields', h`${hidden('id', f.id)}${hidden('revision', f.revision)}`, 'Archive field', { secondary: true })}</details>` : '—']), 'Field definitions', { wrap: [0, 1, 3] }) : h`<p>No custom fields yet.</p>`)}${create}${locations.length ? card('Location register', h`${can(actor,'history.export') ? h`<p><a href="/app/locations.csv">Download location CSV</a></p>` : ''}${locations.map(l => h`<details class="gk-details"><summary>${l.name}</summary>${awaitLocationLink(l.id, l.name)}</details>`)}`) : ''}`, { url })
}
const awaitLocationLink = (id: string, name: string) => h`<a href="/app/locations/${id}">Open ${name}</a>`
export async function locationPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const locations = await all(env, "SELECT id,name FROM gk_request_targets WHERE id=? AND kind='location'", id)
  insist(locations.length, 'location_not_found', 404)
  return page(env, locations[0].name, actor, h`<h1>${locations[0].name}</h1>${await customCard(env, actor, 'location', id, null, `/app/locations/${id}`)}`, { url })
}
