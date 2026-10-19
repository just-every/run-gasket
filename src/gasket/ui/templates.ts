// PLAN-001 (slice): the Work templates page: every template with its revision,
// the form a lead saves a new one or the next revision with, and retirement.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { PRIORITIES, PRIORITY_LABELS, templateList, type Priority } from '../templates'
import { area, card, field, form, h, hidden, select, tag } from './html'
import { page } from './shell'

const priorities = (chosen: string) => select('Priority', 'priority', PRIORITIES.map(value => ({ value, label: PRIORITY_LABELS[value] })), chosen)
const hours = (minutes: number | null) => minutes === null ? '' : String(Math.round(minutes / 6) / 10)

export async function templatesPage(env: Bindings, actor: Actor, url: URL) {
  const templates = await templateList(env), lead = can(actor, 'work.assign')
  const fields = (row: any = {}) => h`${field('Name', 'name', { value: row.name ?? '' })}${field('Work title', 'title', { value: row.title ?? '' })}${area('Instructions', 'instructions', { value: row.instructions ?? '', required: false })}
    <div class="gk-grid">${priorities(row.priority ?? 'normal')}${field('Estimated hours', 'estimateHours', { value: hours(row.estimate_minutes ?? null), required: false })}</div>`
  const list = templates.length ? templates.map(row => card(row.name, h`<p>${row.title} · ${PRIORITY_LABELS[row.priority as Priority]} priority${row.estimate_minutes ? ` · ${hours(row.estimate_minutes)} h` : ''} · revision ${row.revision}${row.retired_at ? h` ${tag('Retired')}` : ''}</p>${row.instructions ? h`<p class="gk-muted">${row.instructions}</p>` : ''}
    ${lead && !row.retired_at ? h`<details class="gk-details"><summary>Edit</summary>${form('template.save', '/app/templates', h`${hidden('template', row.id)}${hidden('revision', row.revision)}${fields(row)}`, 'Save revision', { secondary: true })}</details>${form('template.retire', '/app/templates', hidden('template', row.id), 'Retire', { secondary: true })}` : ''}`, { id: `template-${row.id}` }))
    : [h`<p class="gk-muted">No work templates yet.</p>`]
  const add = lead ? card('New template', form('template.save', '/app/templates', fields(), 'Save template', { secondary: true }), { id: 'new' }) : ''
  return page(env, 'Work templates', actor, h`<h1>Work templates</h1><p class="gk-lede">Reusable work: a title, instructions, priority and estimate copied into each work order made from it. Editing a template never changes work already made.</p>
    <div class="gk-columns"><div class="gk-col-main">${list}</div><div class="gk-col-side">${add}</div></div>`, { url })
}
