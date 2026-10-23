import { can, type Actor } from '../actor'
import { usd } from '../bad-actors'
import { localNow, showInstant } from '../dates'
import { area, card, field, form, h, hidden, select, table, tag, type Html } from './html'

type Category = 'wrench' | 'travel' | 'wait' | 'admin'
const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'wrench', label: 'Wrench time' }, { value: 'travel', label: 'Travel' },
  { value: 'wait', label: 'Wait' }, { value: 'admin', label: 'Admin' },
]
const ENTRY_STATES: Record<string, string> = { pending: 'Waiting for review', approved: 'Approved', rejected: 'Rejected', superseded: 'Superseded' }
const label = (category: string) => CATEGORIES.find(item => item.value === category)?.label ?? category
const stateLabel = (state: string) => ENTRY_STATES[state] ?? state.replace(/_/g, ' ')
const minutes = (value: number) => `${Number(value.toFixed(2))} min`
const hours = (value: number) => `${Number((value / 60).toFixed(2))} h`

interface LaborEntry {
  id: string
  work_order_id: string
  person_id: string
  person: string | null
  category: string
  started_at: number
  ended_at: number
  reason: string | null
  supersedes_id: string | null
  state: string
  pendingFlags: string[]
  regular_minutes?: number | null
  overtime_minutes?: number | null
  cents?: number | null
  review_reason: string | null
  reviewed_by: string | null
  reviewer?: string | null
  invoice_ref?: string | null
}

export interface LaborView {
  entries: LaborEntry[]
  timer: { id: string; work_order_id: string; category: string; state: 'running' | 'paused'; started_at?: number | null } | null
  approvedMinutes: number
  byCategory: Record<string, number>
  people: { id: string; name: string }[]
  rates?: { id: string; person_id: string; cents_per_hour: number; overtime_after_minutes: number; overtime_multiplier: number }[]
  invoices?: { id: string; reference: string; contractor: string; minutes: number; cents: number; state: string }[]
  mayManage: boolean
}

interface WorkContext { id: string; back: string; recording: boolean }

function entryFields(actor: Actor, personField: Html, entry?: LaborEntry) {
  return h`${personField}<div class="gk-grid">${select('Time category', 'category', CATEGORIES, entry?.category ?? 'wrench')}
    ${field('Started', 'started', { type: 'datetime-local', value: entry ? localNow(actor.zone, entry.started_at) : '', hint: `Site clock: ${actor.zone}. Include the date when work crosses midnight.` })}
    ${field('Ended', 'ended', { type: 'datetime-local', value: entry ? localNow(actor.zone, entry.ended_at) : '' })}</div>
    ${area(entry ? 'Reason for correcting this entry' : 'Reason for this time entry', 'reason')}`
}

function timerControls(labor: LaborView, actor: Actor, work: WorkContext) {
  const timer = labor.timer
  const belongsHere = timer?.work_order_id === work.id
  const action = (operation: string, submit: string) => form('labor.timer', work.back, h`${hidden('workOrder', work.id)}${hidden('operation', operation)}`, submit, { secondary: true, layout: 'gk-inline' })
  if (timer && !belongsHere) return h`<p>${tag(timer.state === 'running' ? 'In progress' : 'Paused')} Your timer belongs to <a href="/app/work/${timer.work_order_id}#labor">another work order</a>. Stop it there before starting time here.</p>`
  if (timer) return h`<p><b>${label(timer.category)}</b> · ${tag(timer.state === 'running' ? 'In progress' : 'Paused')}${timer.started_at ? h`<span class="gk-sub">Current segment started ${showInstant(timer.started_at, actor.zone)}</span>` : ''}</p>
    <div class="gk-actions">${timer.state === 'running' ? action('pause', 'Pause timer') : action('resume', 'Resume timer')}${action('stop', 'Stop timer')}</div>`
  if (!work.recording) return h`<p class="gk-muted">No timer running on this work order.</p>`
  return form('labor.timer', work.back, h`${hidden('workOrder', work.id)}${hidden('operation', 'start')}${select('Time category', 'category', CATEGORIES, 'wrench')}<p class="gk-hint">The timer records time for ${actor.name}. Pause before a break; stop before starting another category.</p>`, 'Start timer', { secondary: true })
}

function entryHistory(labor: LaborView, actor: Actor, work: WorkContext, owner: boolean) {
  if (!labor.entries.length) return h`<p class="gk-muted">No time entries recorded.</p>`
  return table(['Person and category', 'Site time', 'Duration', 'Review', ...(owner ? ['Labor cost (USD)'] : []), 'Entry history'], labor.entries.map(entry => {
    const correctedBy = labor.entries.find(row => row.supersedes_id === entry.id && ['pending', 'approved'].includes(row.state))
    const mayCorrect = !correctedBy && ['pending', 'approved'].includes(entry.state) && can(actor, 'work.do') && (owner || entry.person_id === actor.id)
    const review = owner && entry.state === 'pending' && !correctedBy
      ? form('labor.review', work.back, h`${hidden('entry', entry.id)}${select('Decision', 'decision', [{ value: 'approve', label: 'Approve time' }, { value: 'reject', label: 'Reject time' }], '', { blank: 'Choose a decision' })}${area('Review reason', 'reason', { hint: 'Explain the decision, including any flagged overlap or duration.' })}`, 'Record review', { secondary: true }) : ''
    const correction = mayCorrect ? h`<details class="gk-details"><summary>Correct this time entry</summary><p class="gk-hint">The original entry stays in history. Its replacement needs review.</p>${form('labor.entry', work.back, h`${hidden('workOrder', work.id)}${hidden('person', entry.person_id)}${hidden('supersedes', entry.id)}${entryFields(actor, h`<p>Time for <b>${entry.person ?? 'Former member'}</b></p>`, entry)}`, 'Submit corrected time', { secondary: true })}</details>` : ''
    const flags = entry.pendingFlags.length ? h`<ul class="gk-plain-list">${entry.pendingFlags.map(flag => h`<li>${flag.replace(/_/g, ' ')}</li>`)}</ul>` : ''
    return [
      h`${entry.person ?? 'Former member'}<span class="gk-sub">${label(entry.category)}</span>`,
      h`${showInstant(entry.started_at, actor.zone)}<span class="gk-sub">to ${showInstant(entry.ended_at, actor.zone)}</span>`,
      h`${minutes((entry.ended_at - entry.started_at) / 60_000)}${entry.state === 'approved' && owner ? h`<span class="gk-sub">${minutes(entry.regular_minutes ?? 0)} regular · ${minutes(entry.overtime_minutes ?? 0)} overtime</span>` : ''}`,
      h`${tag(stateLabel(entry.state))}${flags}${entry.review_reason ? h`<span class="gk-sub">${entry.review_reason}</span>` : ''}${entry.reviewed_by ? h`<span class="gk-sub">Reviewed by ${entry.reviewer ?? 'Owner'}</span>` : ''}${review}`,
      ...(owner ? [entry.state === 'approved' && !correctedBy ? (entry.cents == null ? 'Unpriced' : usd(entry.cents)) : 'Not counted'] : []),
      h`${entry.reason ? h`<p>${entry.reason}</p>` : ''}${entry.supersedes_id ? h`<p class="gk-sub">Corrects an earlier entry.</p>` : ''}${correctedBy ? h`<p class="gk-sub">A later correction is retained below; it replaces this entry only after approval.</p>` : ''}${entry.invoice_ref ? h`<p class="gk-sub">Invoice ${entry.invoice_ref}</p>` : ''}${correction}`,
    ]
  }), 'Labor time entries', { wrap: [0, 1, 2, 3, owner ? 5 : 4] })
}

function payPolicy(labor: LaborView, work: WorkContext) {
  const names = new Map(labor.people.map(person => [person.id, person.name]))
  return h`<details class="gk-details"><summary>Pay rates and overtime policy · owner only</summary><p class="gk-hint">This is a configurable overtime review policy for maintenance costing. It is not a legal wage calculation and sends no payroll data.</p>
    ${labor.rates?.length ? table(['Person', 'Hourly rate (USD)', 'Overtime starts after', 'Overtime multiplier'], labor.rates.map(rate => [names.get(rate.person_id) ?? 'Former member', usd(rate.cents_per_hour), minutes(rate.overtime_after_minutes), `${rate.overtime_multiplier / 100}×`]), 'Pay rates and overtime policy', { wrap: [0, 2] }) : h`<p class="gk-muted">No pay rates recorded. A rate is required before time can be approved.</p>`}
    ${form('labor.rate', work.back, h`${select('Person', 'person', labor.people.map(person => ({ value: person.id, label: person.name })), '', { blank: 'Choose a person' })}
      <div class="gk-grid">${field('Hourly rate (USD)', 'amount', { type: 'number', attrs: 'min="0" step="0.01"' })}
      ${field('Daily minutes before overtime', 'overtimeAfterMinutes', { type: 'number', attrs: 'min="1" step="1"', hint: 'Applies across this person’s work orders.' })}
      ${field('Overtime multiplier in hundredths', 'overtimeMultiplier', { type: 'number', attrs: 'min="100" step="1"', hint: '150 means 1.5 times the hourly rate; 100 pays the regular rate.' })}</div>`, 'Save pay policy', { secondary: true })}</details>`
}

function contractorInvoices(labor: LaborView, work: WorkContext) {
  return h`<details class="gk-details"><summary>Contractor invoices · owner only</summary>
    ${labor.invoices?.length ? table(['Contractor', 'Invoice reference', 'Time', 'Amount (USD)', 'State'], labor.invoices.map(invoice => [invoice.contractor, invoice.reference, minutes(invoice.minutes), usd(invoice.cents), tag(stateLabel(invoice.state))]), 'Contractor invoices', { wrap: [0, 1] }) : h`<p class="gk-muted">No contractor invoices recorded.</p>`}
    ${form('labor.invoice', work.back, h`${hidden('workOrder', work.id)}<div class="gk-grid">${field('Contractor', 'contractor')}${field('Invoice reference', 'reference')}${field('Minutes worked', 'minutes', { type: 'number', attrs: 'min="0" step="1"' })}${field('Invoice amount (USD)', 'amount', { type: 'number', attrs: 'min="0" step="0.01"' })}</div>${area('Invoice note', 'note')}`, 'Record contractor invoice', { secondary: true })}</details>`
}

export function laborCard(labor: LaborView, actor: Actor, work: WorkContext) {
  const owner = actor.role === 'owner' && labor.mayManage
  const personField = owner ? select('Person', 'person', labor.people.map(person => ({ value: person.id, label: person.name })), actor.id, { blank: 'Choose a person' }) : h`${hidden('person', actor.id)}<p>Time for <b>${actor.name}</b></p>`
  const record = work.recording || owner ? h`<details class="gk-details"><summary>Enter time manually</summary>${form('labor.entry', work.back, h`${hidden('workOrder', work.id)}${entryFields(actor, personField)}`, 'Submit time for review', { secondary: true })}</details>` : ''
  return card('Labor time', h`<p><b>${hours(labor.approvedMinutes)} approved</b> · ${minutes(labor.approvedMinutes)}<span class="gk-sub">${actor.zone} site clock. Pending, rejected and superseded entries do not count toward approved hours.</span></p>
    <dl class="gk-pairs">${CATEGORIES.map(category => h`<div><dt>${category.label}</dt><dd>${minutes(labor.byCategory[category.value] ?? 0)} approved</dd></div>`)}</dl>
    ${timerControls(labor, actor, work)}${record}${entryHistory(labor, actor, work, owner)}${owner ? h`${payPolicy(labor, work)}${contractorInvoices(labor, work)}` : ''}`, { id: 'labor', extra: can(actor, 'board.read') ? h`<a href="/app/costing?workOrder=${work.id}">Work cost report</a>` : h`` })
}
