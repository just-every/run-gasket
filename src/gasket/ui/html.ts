// Page shell and small form helpers. Every value is escaped; pages need no script.
// Visual authority: the 12ui style picks: a white top bar with the mark and five centred destinations, a
// header band on paper with the asset's line drawing, cards, a bottom action bar.
import branding from '../../branding.json'
import { can, type Actor } from '../actor'
import { showNumber } from '../quantity'

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

const NAV: { href: string; label: string }[] = [
  { href: '/app', label: 'Work' },
  { href: '/app/assets', label: 'Assets' },
  { href: '/app/schedules', label: 'Schedules' },
  { href: '/app/parts', label: 'Parts' },
  { href: '/app/more', label: 'More' },
]

/** The destinations behind More, by what the person may do. */
export const MORE: { href: string; label: string; detail: string; show: (actor: Actor) => boolean }[] = [
  { href: '/app/board', label: 'Overdue and downtime', detail: 'Overdue work, work waiting for review, follow-ups, assets down and low parts.', show: actor => can(actor, 'board.read') },
  { href: '/app/proposals', label: 'Proposals', detail: 'Schedules, corrective work and counts an agent prepared for approval.', show: actor => can(actor, 'proposal.prepare') || can(actor, 'proposal.decide') },
  { href: '/app/move-in', label: 'Move in from MaintainX', detail: 'Dry run, apply and undo an import of MaintainX exports.', show: actor => can(actor, 'import.run') },
  { href: '/app/access', label: 'People and access', detail: 'Give access with a role, change roles and end access.', show: actor => can(actor, 'site.manage') },
  { href: '/app/site', label: 'Site', detail: 'The site name and its time zone.', show: actor => can(actor, 'site.manage') },
  { href: '/app/audit', label: 'Audit trail', detail: 'Every change, who made it and when.', show: actor => can(actor, 'audit.read') },
]

const headers = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'strict-origin',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
}

const current = (path: string) => path === '/app' || path.startsWith('/app/work') ? '/app'
  : path.startsWith('/app/assets') ? '/app/assets' : path.startsWith('/app/schedules') || path.startsWith('/app/checklists') ? '/app/schedules'
  : path.startsWith('/app/parts') ? '/app/parts' : '/app/more'

export function page(title: string, actor: Actor | null, body: Html, { url, status = 200, bar }: { url?: URL; status?: number; bar?: Html } = {}): Response {
  const notice = url?.searchParams.get('notice'), error = url?.searchParams.get('error')
  const here = url ? current(url.pathname) : ''
  const nav = actor ? h`<nav class="gk-nav" aria-label="Main"><ul>${NAV.map(item => h`<li><a href="${item.href}"${item.href === here ? raw(' aria-current="page"') : ''}>${item.label}</a></li>`)}</ul></nav>` : ''
  const who = actor ? h`<span class="gk-who" title="${actor.email}"><span class="gk-initials" aria-hidden="true">${initials(actor.name)}</span><span class="gk-who-name">${actor.name}</span></span>` : ''
  const document = h`<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ${branding.name}</title><link rel="icon" href="/favicon.ico" sizes="16x16 32x32"><link rel="icon" type="image/svg+xml" href="/brand/favicon-32.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="preload" href="/fonts/inter/inter-variable-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/rer-theme.css"><link rel="stylesheet" href="/gasket.css"></head><body>
<header class="gk-top"><div class="gk-top-inner"><a class="gk-brand" href="/app"><img src="/brand/mark.svg" alt="" width="30" height="30"><span data-rer-name>Gasket</span></a>${nav}${who}</div></header>
<main class="gk-main${bar ? ' gk-has-bar' : ''}">${notice ? h`<p class="gk-flash" role="status">${notice}</p>` : ''}${error ? h`<p class="gk-flash gk-error" role="alert">That did not work: ${describeError(error)}</p>` : ''}${body}</main>${bar ? h`<div class="gk-bar"><div class="gk-bar-inner">${bar}</div></div>` : ''}</body></html>`
  return new Response(document.html, { status, headers })
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase()

const ERRORS: Record<string, string> = {
  stale: 'someone changed this record first. Reload and try again.',
  insufficient_stock: 'there is not that much of this part on hand.',
  return_exceeds_issue: 'you can only return what this work order still holds.',
  not_your_work: 'this work order is assigned to someone else.',
  own_work: 'you cannot review work you did yourself.',
  own_proposal: 'someone other than the person who prepared it must decide.',
  not_ready_for_review: 'the work order is not complete yet.',
  meter_went_backwards: 'a counter reading cannot be lower than an earlier one.',
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
  downtime_open: 'end the open downtime first.',
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

export function fileField(label: string, name: string, { required = false, accept = '', hint = '' } = {}) {
  const id = uid(name)
  return h`<div class="gk-field"><label for="${id}">${label}</label>${hint ? h`<p class="gk-hint" id="${id}-hint">${hint}</p>` : ''}<input id="${id}" type="file" name="${name}"${accept ? h` accept="${accept}"` : ''}${required ? raw(' required') : ''}${hint ? raw(` aria-describedby="${esc(id)}-hint"`) : ''}></div>`
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
  'in progress': 'info', open: 'info', submitted: 'info', 'waiting for review': 'info', pending: 'info', medium: 'info', current: 'info',
  'needs attention': 'warn', returned: 'warn', 'found elsewhere': 'warn', 'below minimum': 'warn', due: 'warn',
  fail: 'bad', down: 'bad', overdue: 'bad', missing: 'bad', high: 'bad', cancelled: 'bad', rejected: 'bad', retired: 'bad', ended: 'bad',
}
export const tag = (text: unknown) => { const tone = TONES[String(text ?? '').toLowerCase()]; return h`<span class="gk-tag${tone ? ` gk-tone-${tone}` : ''}">${text}</span>` }

export function card(heading: string, body: unknown, { id = '', extra = '' as unknown } = {}) {
  const key = id || uid('card')
  return h`<section class="gk-card" id="${key}" aria-labelledby="${key}-h"><div class="gk-card-head"><h2 id="${key}-h">${heading}</h2>${extra}</div>${body}</section>`
}

/** Exact machine facts kept out of the work view, in a keyboard-operable disclosure. */
export const details = (facts: [string, unknown][]) => h`<details class="gk-details"><summary>Details</summary><dl>${facts.map(([key, value]) => h`<dt>${key}</dt><dd>${value}</dd>`)}</dl></details>`

export const STATUS: Record<string, string> = { open: 'Open', in_progress: 'In progress', submitted: 'Waiting for review', returned: 'Returned', closed: 'Reviewed and closed', cancelled: 'Cancelled', in_service: 'In service', down: 'Down', retired: 'Retired' }
export const OUTCOME: Record<string, string> = { pass: 'Pass', fail: 'Fail', attention: 'Needs attention' }
/** The fine-line drawing (public/brand/assets) for an asset, chosen by its category or name; null when none matches. */
const DRAWINGS: [RegExp, string][] = [[/refrigerat|cool|chill|freez|condens/i, 'compressor'], [/fry|cook|oven|grill|range|hot line/i, 'fryer'], [/air|pneumatic/i, 'air-compressor'], [/pump|water|plumb/i, 'pump']]
export const drawingFor = (asset: { name: string; category?: string | null }) => DRAWINGS.find(([pattern]) => pattern.test(`${asset.category ?? ''} ${asset.name}`))?.[1] ?? null
/** The asset beside its name in a list: its drawing, or two letters when none matches (decorative; the name is the label). */
export const assetMark = (asset: { name: string; category?: string | null }) => {
  const drawing = drawingFor(asset)
  return drawing ? h`<img class="gk-asset-art" src="/brand/assets/${drawing}.svg" alt="" width="64" height="60">`
    : h`<span class="gk-asset-icon" aria-hidden="true">${asset.name.split(/\s+/).filter(word => /^[A-Za-z0-9]/.test(word)).map(word => word[0]).slice(0, 2).join('').toUpperCase()}</span>`
}

/** Line icons drawn in currentColor. */
export const ICON = {
  calendar: raw('<svg class="gk-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'),
  person: raw('<svg class="gk-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="6.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 17.5c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'),
  back: raw('<svg class="gk-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M16.5 10h-13M8.5 5l-5 5 5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
}

/** A "← Back" link above a band. */
export const backLink = (href: string, label: string) => h`<p class="gk-back"><a href="${href}">${ICON.back}${label}</a></p>`

/** The header band on paper: eyebrow, title, facts, the status tag and meta pairs, and the asset's drawing at the right. */
export function band({ id, eyebrow, title, facts, status, meta, art }: { id: string; eyebrow: unknown; title: unknown; facts: unknown[]; status: unknown; meta: { label: string; value: unknown; icon?: Html }[]; art?: string | null }) {
  return h`<section class="gk-band" aria-labelledby="${id}"><div class="gk-band-text"><p class="gk-eyebrow">${eyebrow}</p><h1 id="${id}">${title}</h1><p class="gk-facts">${facts.map(fact => h`<span>${fact}</span>`)}</p></div>
    <div class="gk-band-meta">${status}<dl>${meta.map(item => h`<div><dt>${item.label}</dt><dd>${item.icon ?? ''}${item.value}</dd></div>`)}</dl></div>
    ${art ? h`<img class="gk-band-art" src="/brand/assets/${art}.svg" alt="" width="220" height="200">` : ''}</section>`
}
export const woNumber = (number: number) => `WO-${String(number).padStart(4, '0')}`
