// Escaped markup and the small form, table and card helpers every screen uses.
// Every value is escaped; pages need no script. The page shell is shell.ts.
import { showNumber, woDigits } from '../quantity'
import { ICON, machine } from './icons'

export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))

export type Html = { html: string }
export const raw = (html: string): Html => ({ html })
export function h(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0]
  values.forEach((value, index) => { out += render(value) + strings[index + 1] })
  return { html: out }
}
function render(value: unknown): string {
  if (value === null || value === undefined || value === false) return ''
  if (Array.isArray(value)) return value.map(render).join('')
  if (typeof value === 'object' && 'html' in (value as Html)) return (value as Html).html
  return esc(value)
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase()

const ERRORS: Record<string, string> = {
  stale: 'someone changed this record first. Reload and try again.',
  insufficient_stock: 'there is not that much of this part on hand.',
  return_exceeds_issue: 'you can only return what this work order still holds.',
  not_your_work: 'this work order is assigned to someone else.',
  own_work: 'you cannot review work you did yourself.',
  own_proposal: 'someone other than the person who prepared it must decide.',
  not_ready_for_review: 'the work order is not complete yet.',
  meter_went_backwards: 'a counter reading cannot be lower than an earlier one. Record the reset, replacement or rollover first.',
  readings_after_change: 'readings are already kept at or after that time. A counter change only follows the latest reading.',
  unit_mismatch: 'the reading is in a different unit from the meter.',
  state_in_future: 'a state change cannot take effect in the future.',
  downtime_already_open: 'this asset already has open downtime.',
  downtime_overlaps: 'the asset was already down then. Start the downtime after the earlier one ended.',
  open_work_exists: 'this asset still has open work orders.',
  asset_tag_taken: 'another asset already uses that tag.',
  part_number_taken: 'another part already uses that number.',
  proposal_stale: 'the records changed after this proposal was prepared. Ask for a new one.',
  reviewed_fingerprint_changed: 'the files changed since the dry run. Run the dry run again.',
  undo_blocked: 'later Gasket records depend on this move-in. Reverse them first.',
  record_is_immutable: 'this record is kept as history and cannot be changed.',
  forbidden: 'your role does not allow this.',
  access_ended: 'this person no longer has access.',
  precondition_failed: 'something changed first. Reload and try again.',
  parts_still_issued: 'return the issued parts first.',
  insufficient_available: 'not enough of that part is available; the rest is reserved for other work.',
  substitute_not_approved: 'that part is not an approved substitute. A lead approves substitutes on the part.',
  substitute_not_compatible: 'that alternate does not fit this asset\'s serial number.',
  part_not_compatible: 'that part does not fit this asset\'s serial number.',
  already_reserved: 'this work order already holds a reservation of that part. Release it first.',
  downtime_open: 'end the open downtime first.',
  not_overdue: 'this work order is no longer overdue.',
  not_assigned: 'nobody holds this work order, so there is no one to keep it with.',
  plan_to_self: 'choose someone other than yourself; the work order page assigns anyone.',
  cycle: 'an asset cannot sit under itself or anything below it.',
  parent_level: 'that parent cannot hold this level: buildings hold lines, lines hold machines, machines hold components.',
  active_children: 'move or retire the assets under this one first.',
  parent_retired: 'the parent is retired.',
}
export const describeError = (code: string) => ERRORS[code] ?? code.replace(/_/g, ' ') + '.'

export const hidden = (name: string, value: unknown) => h`<input type="hidden" name="${name}" value="${value}">`

/** A POST form to the shared action door; returnTo may contain {id} for the created record. */
export function form(action: string, returnTo: string, fields: unknown, submit: string, { multipart = false, secondary = false, layout = '' } = {}) {
  return h`<form method="post" action="/app/do/${action}" class="gk-form${layout ? ` ${layout}` : ''}"${multipart ? raw(' enctype="multipart/form-data"') : ''}>${hidden('returnTo', returnTo)}${fields}<div class="gk-actions"><button type="submit"${secondary ? raw(' class="gk-secondary"') : ''}>${submit}</button></div></form>`
}

let sequence = 0
const uid = (name: string) => `f-${name.replace(/[^\w-]/g, '')}-${(sequence = (sequence + 1) % 1_000_000)}`

export function field(label: string, name: string, { type = 'text', value = '', required = true, hint = '', attrs = '' }: { type?: string; value?: unknown; required?: boolean; hint?: string; attrs?: string } = {}) {
  const id = uid(name)
  return h`<div class="gk-field"><label for="${id}">${label}</label>${hint ? h`<p class="gk-hint" id="${id}-hint">${hint}</p>` : ''}<input id="${id}" type="${type}" name="${name}" value="${value}"${required ? raw(' required') : ''}${hint ? raw(` aria-describedby="${esc(id)}-hint"`) : ''}${attrs ? raw(` ${attrs}`) : ''}></div>`
}

export function area(label: string, name: string, { value = '', required = true, hint = '' }: { value?: unknown; required?: boolean; hint?: string } = {}) {
  const id = uid(name)
  return h`<div class="gk-field"><label for="${id}">${label}</label>${hint ? h`<p class="gk-hint" id="${id}-hint">${hint}</p>` : ''}<textarea id="${id}" name="${name}"${required ? raw(' required') : ''}${hint ? raw(` aria-describedby="${esc(id)}-hint"`) : ''}>${value}</textarea></div>`
}

export function select(label: string, name: string, options: { value: string; label: string }[], selected = '', { required = true, blank = '' } = {}) {
  const id = uid(name)
  return h`<div class="gk-field"><label for="${id}">${label}</label><select id="${id}" name="${name}"${required ? raw(' required') : ''}>${blank ? h`<option value="">${blank}</option>` : ''}${options.map(option => h`<option value="${option.value}"${option.value === selected ? raw(' selected') : ''}>${option.label}</option>`)}</select></div>`
}

export function fileField(label: string, name: string, { required = false, accept = '', hint = '', multiple = false } = {}) {
  const id = uid(name)
  return h`<div class="gk-field"><label for="${id}">${label}</label>${hint ? h`<p class="gk-hint" id="${id}-hint">${hint}</p>` : ''}<input id="${id}" type="file" name="${name}"${accept ? h` accept="${accept}"` : ''}${multiple ? raw(' multiple') : ''}${required ? raw(' required') : ''}${hint ? raw(` aria-describedby="${esc(id)}-hint"`) : ''}></div>`
}

export const checkbox = (label: string, name: string, checked = false) => h`<label class="gk-check"><input type="checkbox" name="${name}" value="yes"${checked ? raw(' checked') : ''}> ${label}</label>`

/** A table that stacks as label/value pairs on a phone; data-label carries the heading. Each cell's content is one
 *  element, so a phone row keeps a cell's sub-lines and tags together beside its label. On wider screens cells keep
 *  short values on one line; the `wrap` columns (free text) wrap. */
export const table = (headings: string[], rows: unknown[][], caption = '', { wrap = [] as number[] } = {}) => h`<div class="gk-table-wrap"><table>${caption ? h`<caption class="gk-visually-hidden">${caption}</caption>` : ''}<thead><tr>${headings.map(heading => h`<th scope="col">${heading}</th>`)}</tr></thead><tbody>${rows.map(row => h`<tr>${row.map((cell, index) => h`<td${wrap.includes(index) ? raw(' class="gk-wrap"') : ''}${headings[index] ? h` data-label="${headings[index]}"` : ''}><div class="gk-cell">${cell}</div></td>`)}</tr>`)}</tbody></table></div>`

/** A value with its unit, kept on one line: "12,408 h". */
export const amount = (value: unknown, unit: string) => `${showNumber(value)}\u00a0${unit}`

const TONES: Record<string, 'ok' | 'warn' | 'bad' | 'info'> = {
  pass: 'ok', 'in service': 'ok', closed: 'ok', approved: 'ok', found: 'ok', completed: 'ok', 'reviewed and closed': 'ok', active: 'ok',
  'in progress': 'info', submitted: 'info', 'waiting for review': 'info', medium: 'info', current: 'info',
  open: 'warn', pending: 'warn', 'due today': 'warn', 'needs attention': 'warn', returned: 'warn', 'found elsewhere': 'warn', 'below minimum': 'warn', due: 'warn', suspect: 'warn', 'stale (late)': 'warn', degraded: 'warn', 'evidence disagrees': 'warn',
  fail: 'bad', down: 'bad', overdue: 'bad', missing: 'bad', high: 'bad', cancelled: 'bad', rejected: 'bad', retired: 'bad', ended: 'bad', 'out of service': 'bad',
}
export const tag = (text: unknown) => { const tone = TONES[String(text ?? '').toLowerCase()]; return h`<span class="gk-tag${tone ? ` gk-tone-${tone}` : ''}">${text}</span>` }

export function card(heading: string, body: unknown, { id = '', extra = '' as unknown } = {}) {
  const key = id || uid('card')
  return h`<section class="gk-card" id="${key}" aria-labelledby="${key}-h"><div class="gk-card-head"><h2 id="${key}-h">${heading}</h2>${extra}</div>${body}</section>`
}

/** Exact machine facts kept out of the work view, in a keyboard-operable disclosure. */
export const details = (facts: [string, unknown][]) => h`<details class="gk-details"><summary>Details</summary><dl>${facts.map(([key, value]) => h`<dt>${key}</dt><dd>${value}</dd>`)}</dl></details>`

export const STATUS: Record<string, string> = { open: 'Open', in_progress: 'In progress', submitted: 'Waiting for review', returned: 'Returned', closed: 'Reviewed and closed', cancelled: 'Cancelled', in_service: 'In service', degraded: 'Degraded', down: 'Down', out_of_service: 'Out of service', retired: 'Retired' }
export const OUTCOME: Record<string, string> = { pass: 'Pass', fail: 'Fail', attention: 'Needs attention' }
/** The asset beside its name in a list: its copper line drawing (decorative; the name is the label). */
export const assetMark = (asset: { name: string; category?: string | null }) => machine(asset)

/** A "← Back" link above a band. */
export const backLink = (href: string, label: string) => h`<p class="gk-back"><a href="${href}">${ICON.back}${label}</a></p>`

/** The record's header: its copper drawing, eyebrow, title and facts, then the status tag and meta pairs. */
export function band({ id, eyebrow, title, facts, status, meta, art }: { id: string; eyebrow: unknown; title: unknown; facts: unknown[]; status: unknown; meta: { label: string; value: unknown; icon?: Html }[]; art?: Html | null }) {
  return h`<section class="gk-band" aria-labelledby="${id}">${art ? h`<div class="gk-band-art">${art}</div>` : ''}<div class="gk-band-text"><p class="gk-eyebrow">${eyebrow}</p><h1 id="${id}">${title}</h1><p class="gk-facts">${facts.map(fact => h`<span>${fact}</span>`)}</p></div>
    <div class="gk-band-meta">${status}<dl>${meta.map(item => h`<div><dt>${item.label}</dt><dd>${item.icon ?? ''}${item.value}</dd></div>`)}</dl></div></section>`
}
export const woNumber = (number: number) => `WO-${woDigits(number)}`
