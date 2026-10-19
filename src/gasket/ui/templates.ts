// PLAN-001 (slice): the Work templates page: every template with its revision,
// the form a lead saves a new one or the next revision with, and retirement;
// beside them, raising work at a location that has no asset (a dock light),
// and the custom work fields and waiting statuses work orders carry.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { PRIORITIES, PRIORITY_LABELS, templateList, type Priority } from '../templates'
import { all } from '../core'
import { addDays } from '../dates'
import { assignable } from '../site'
import { STATUS_ROLES, fieldList, statusList } from '../work-fields'
import { area, card, checkbox, field, form, h, hidden, raw, select, table, tag } from './html'
import { page } from './shell'

const priorities = (chosen: string) => select('Priority', 'priority', PRIORITIES.map(value => ({ value, label: PRIORITY_LABELS[value] })), chosen)
const hours = (minutes: number | null) => minutes === null ? '' : String(Math.round(minutes / 6) / 10)

export async function templatesPage(env: Bindings, actor: Actor, url: URL) {
  const templates = await templateList(env), lead = can(actor, 'work.assign')
  const workFields = await fieldList(env), statuses = await statusList(env), activeFields = workFields.filter(row => !row.retired_at)
  const label = new Map(workFields.map(row => [row.id as string, row.label as string]))
  const assets = lead ? await all(env, 'SELECT id, tag, name FROM gk_assets WHERE retired_at IS NULL ORDER BY tag') : []
  // Raising one template's work for several assets: preview first, then raise.
  const raise = (row: any) => form('workorders.fromTemplate', '/app/templates', h`${hidden('template', row.id)}<fieldset><legend>Assets</legend>${assets.map(asset => h`<label class="gk-check"><input type="checkbox" name="asset" value="${asset.id}"> ${asset.tag} ${asset.name}</label>`)}</fieldset>
    <div class="gk-grid">${field('Due', 'due', { type: 'date', value: addDays(actor.today, 7) })}</div>${checkbox('Preview only', 'preview', true)}`, 'Raise work', { secondary: true })
  const fields = (row: any = {}) => h`${field('Name', 'name', { value: row.name ?? '' })}${field('Work title', 'title', { value: row.title ?? '' })}${area('Instructions', 'instructions', { value: row.instructions ?? '', required: false })}
    <div class="gk-grid">${priorities(row.priority ?? 'normal')}${field('Estimated hours', 'estimateHours', { value: hours(row.estimate_minutes ?? null), required: false })}</div>
    ${activeFields.length ? h`<fieldset><legend>Fields required before review</legend>${activeFields.map(f => h`<label class="gk-check"><input type="checkbox" name="requiredField" value="${f.id}"${(row.requiredFields ?? []).includes(f.id) ? raw(' checked') : ''}> ${f.label}</label>`)}</fieldset>` : ''}${checkbox('Requires a photo or document as evidence', 'requiresEvidence', Boolean(row.requiresEvidence))}`
  const list = templates.length ? templates.map(row => card(row.name, h`<p>${row.title} · ${PRIORITY_LABELS[row.priority as Priority]} priority${row.estimate_minutes ? ` · ${hours(row.estimate_minutes)} h` : ''} · revision ${row.revision}${row.retired_at ? h` ${tag('Retired')}` : ''}</p>${row.requiredFields.length || row.requiresEvidence ? h`<p class="gk-sub">Before review: ${[...row.requiredFields.map((id: string) => label.get(id) ?? id), ...(row.requiresEvidence ? ['photo or document evidence'] : [])].join(', ')}</p>` : ''}${row.instructions ? h`<p class="gk-muted">${row.instructions}</p>` : ''}
    ${lead && !row.retired_at ? h`<details class="gk-details"><summary>Edit</summary>${form('template.save', '/app/templates', h`${hidden('template', row.id)}${hidden('revision', row.revision)}${fields(row)}`, 'Save revision', { secondary: true })}</details><details class="gk-details"><summary>Raise for several assets</summary>${raise(row)}</details>${form('template.retire', '/app/templates', hidden('template', row.id), 'Retire', { secondary: true })}` : ''}`, { id: `template-${row.id}` }))
    : [h`<p class="gk-muted">No work templates yet.</p>`]
  const add = lead ? card('New template', form('template.save', '/app/templates', fields(), 'Save template', { secondary: true }), { id: 'new' }) : ''
  // Known places (asset locations and earlier work locations) are offered; any other place is typed as it is.
  const creator = can(actor, 'work.create')
  const places = creator ? (await all(env, 'SELECT location FROM gk_assets WHERE retired_at IS NULL UNION SELECT location FROM gk_work_orders WHERE location IS NOT NULL ORDER BY 1')).map(row => row.location as string) : []
  const active = templates.filter(row => !row.retired_at)
  const atLocation = creator ? card('Raise work at a location', form('workorder.create', '/app/work/{id}', h`${field('Location', 'location', { attrs: 'list="gk-places" autocomplete="off"', hint: 'Where the work is, with no asset: Dock 3 light, Restroom 2 door.' })}<datalist id="gk-places">${places.map(place => h`<option value="${place}"></option>`)}</datalist>
    ${active.length ? select('From template', 'template', active.map(row => ({ value: row.id, label: row.name })), '', { required: false, blank: 'No template' }) : ''}${field('What needs doing', 'title', { required: !active.length, hint: active.length ? 'Leave empty to use the template\'s title.' : '' })}${area('Details', 'description', { required: false })}
    <div class="gk-grid">${select('Priority', 'priority', [{ value: '', label: 'Template or normal' }, ...PRIORITIES.map(value => ({ value, label: PRIORITY_LABELS[value] }))], '', { required: false })}${field('Due', 'due', { type: 'date', value: addDays(actor.today, 7) })}${lead ? select('Assign to', 'assignee', (await assignable(env)).map(person => ({ value: person.id, label: person.name })), '', { required: false, blank: 'Not yet' }) : ''}</div>${lead ? '' : h`<p class="gk-hint">The work order is assigned to you.</p>`}`, 'Raise work order', { secondary: true }), { id: 'location-work' }) : ''
  const KIND: Record<string, string> = { text: 'Text', number: 'Number', choice: 'Choice' }
  const fieldsCard = card('Work fields', h`${workFields.length ? table(['Field', 'Kind', 'Required'], workFields.map(row => [h`${row.label}${row.retired_at ? h` ${tag('Retired')}` : ''}`, `${KIND[row.kind]}${row.options ? `: ${JSON.parse(row.options).join(', ')}` : ''}`, row.required ? 'On all work' : 'By template'])) : h`<p class="gk-muted">No custom fields yet.</p>`}
    ${lead ? form('workfield.save', '/app/templates', h`<div class="gk-grid">${field('Field', 'label')}${select('Kind', 'kind', Object.entries(KIND).map(([value, text]) => ({ value, label: text })), 'text')}</div>${field('Choices', 'option', { required: false, hint: 'For a choice: each choice, separated by commas.' })}${checkbox('Required on all work before review', 'required')}`, 'Add field', { secondary: true }) : ''}
    ${lead && activeFields.length ? form('workfield.retire', '/app/templates', select('Field', 'field', activeFields.map(row => ({ value: row.id, label: row.label })), '', { blank: 'Choose a field' }), 'Retire field', { secondary: true }) : ''}`, { id: 'fields' })
  const ROLE: Record<string, string> = { lead: 'Leads', maintainer: 'Maintainers (on their own work)', supervisor: 'Supervisors' }
  const statusCard = card('Waiting statuses', h`${statuses.length ? table(['Status', 'Set and cleared by'], statuses.map(row => [row.label, ['The owner', ...row.roles.map((role: string) => ROLE[role])].join(', ')])) : h`<p class="gk-muted">No waiting statuses yet.</p>`}
    ${lead ? form('workstatus.save', '/app/templates', h`${field('Status', 'label', { hint: 'For example Waiting on parts.' })}<fieldset><legend>Who may set and clear it</legend>${STATUS_ROLES.map(role => h`<label class="gk-check"><input type="checkbox" name="role" value="${role}"> ${ROLE[role]}</label>`)}</fieldset>`, 'Add status', { secondary: true }) : ''}`, { id: 'statuses' })
  return page(env, 'Work templates', actor, h`<h1>Work templates</h1><p class="gk-lede">Reusable work: a title, instructions, priority and estimate copied into each work order made from it. Editing a template never changes work already made.</p>
    <div class="gk-columns"><div class="gk-col-main">${list}</div><div class="gk-col-side">${atLocation}${add}${fieldsCard}${statusCard}</div></div>`, { url })
}
