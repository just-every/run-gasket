// PM-003 on the Schedules page: each calendar schedule's policy, the site's
// closures, and skip and deferral requests with their independent decisions.
import type { Actor } from '../actor'
import { can } from '../actor'
import { showDate, showInstant } from '../dates'
import { card, field, form, h, hidden, raw, select, table, tag } from './html'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const chosen = (text: string | null) => text ? text.split(',').map(Number) : []

/** "fixed, Apr–Sep months, Mon/Wed, avoids closures" for one schedule. */
export function policyText(row: any) {
  if (!row.every_days) return ''
  const months = chosen(row.months), days = chosen(row.weekdays)
  return [row.cadence === 'completion' ? 'from completion' : 'fixed dates', months.length ? `in ${months.map(month => MONTHS[month - 1]).join(', ')}` : '', days.length ? `on ${days.map(day => DAYS[day - 1]).join(', ')}` : '',
    row.observe_closures ? 'moves off closures' : 'runs through closures', `deferral up to ${row.max_defer_days} days`].filter(Boolean).join(' · ')
}

const boxes = (legend: string, name: string, labels: string[], picked: number[]) => h`<fieldset><legend>${legend}</legend>${labels.map((label, index) => h`<label class="gk-check"><input type="checkbox" name="${name}" value="${index + 1}"${picked.includes(index + 1) ? raw(' checked') : ''}> ${label}</label>`)}</fieldset>`

/** The calendar fields shared by creating and changing a schedule. */
export const policyFields = (row: any = {}) => h`${select('Cadence', 'cadence', [{ value: 'fixed', label: 'Fixed dates (from the planned date)' }, { value: 'completion', label: 'From completion (the day the work is approved)' }], row.cadence ?? 'fixed')}
  ${select('Holidays and shutdowns', 'observeClosures', [{ value: 'yes', label: 'Move off closed days' }, { value: 'no', label: 'Runs through closures' }], row.observe_closures === 0 ? 'no' : 'yes')}
  ${field('Deferral allowed up to (days)', 'maxDeferDays', { type: 'number', value: String(row.max_defer_days ?? 14), attrs: 'min="0" max="365"' })}
  ${boxes('Only in these months (none ticked: every month)', 'months', MONTHS, chosen(row.months ?? null))}${boxes('Only on these weekdays (none ticked: every day)', 'weekdays', DAYS, chosen(row.weekdays ?? null))}`

/** A pending skip or deferral on a schedule row, with the decision for an independent reviewer. */
export function pending(row: any, actor: Actor) {
  const ask = row.exceptions.find((item: any) => !item.decision)
  if (!ask) return ''
  const what = ask.kind === 'skip' ? `Skip of ${showDate(ask.occurrence)}` : `Deferral of ${showDate(ask.occurrence)} to ${showDate(ask.until)}`
  const decide = can(actor, 'work.review') && ask.requested_by !== actor.id ? h`${form('schedule.exception', '/app/schedules', h`${hidden('exception', ask.id)}${hidden('decision', 'approve')}`, 'Approve', { secondary: true, layout: 'gk-inline' })}${form('schedule.exception', '/app/schedules', h`${hidden('exception', ask.id)}${hidden('decision', 'reject')}`, 'Reject', { secondary: true, layout: 'gk-inline' })}` : ''
  return h`<span class="gk-sub">${tag('Waiting for approval')} ${what}: ${ask.reason} (${ask.requested_by_name ?? '—'})</span>${decide}`
}

/** PM-001: when the scheduler last ran, when it did not, and what it issued late. */
export function schedulerCard(health: any, actor: Actor) {
  const gaps = health.gaps.slice(0, 5).map((row: any) => h`<li>${tag('Missed runs')} Not running for ${row.minutes} minutes before ${showInstant(row.until, actor.zone)}</li>`)
  const late = health.late.slice(0, 10).map((row: any) => h`<li>${tag('Issued late')} <a href="/app/work/${row.id}">${row.title}</a>, due ${showDate(row.due_date)}, issued ${showDate(row.issued_on)}</li>`)
  return card('Automatic scheduling', h`<p>${health.lastRun ? h`Gasket issues due work every 15 minutes; last run ${showInstant(health.lastRun, actor.zone)}.` : 'The scheduler has not run yet.'}</p>${gaps.length || late.length ? h`<ul class="gk-plain-list">${gaps}${late}</ul>` : h`<p class="gk-muted">No missed runs.</p>`}`, { id: 'scheduler' })
}

export function exceptionsCard(schedules: any[]) {
  const rows = schedules.flatMap(row => row.exceptions.map((item: any) => ({ row, item })))
  if (!rows.length) return ''
  return card('Skips and deferrals', table(['Schedule', 'Occurrence', 'Asked', 'Decision'], rows.map(({ row, item }) => [row.title,
    h`${item.kind === 'skip' ? 'Skip' : `Defer to ${showDate(item.until)}`}<span class="gk-sub">Due ${showDate(item.occurrence)}</span>`, h`${item.reason}<span class="gk-sub">${item.requested_by_name ?? '—'}</span>`,
    item.decision ? h`${tag(item.decision === 'approved' ? 'Approved' : 'Rejected')}<span class="gk-sub">${item.decided_by_name ?? '—'}${item.note ? `: ${item.note}` : ''}</span>` : tag('Waiting for approval')]), 'Skips and deferrals', { wrap: [0, 2, 3] }), { id: 'exceptions' })
}

export function changesCard(schedules: any[], closures: any[], actor: Actor) {
  const calendar = schedules.filter(row => row.active && row.every_days)
  const manage = can(actor, 'register.manage'), assign = can(actor, 'work.assign')
  const closed = table(['Closed', 'Dates'], closures.map(row => [h`${row.label}<span class="gk-sub">${row.kind === 'holiday' ? 'Holiday' : 'Shutdown'}</span>`,
    h`${showDate(row.starts_on)}${row.ends_on !== row.starts_on ? ` to ${showDate(row.ends_on)}` : ''}${manage ? form('closure.remove', '/app/schedules', hidden('closure', row.id), 'Remove', { secondary: true, layout: 'gk-inline' }) : ''}`]), 'Closures', { wrap: [0] })
  const add = manage ? form('closure.add', '/app/schedules', h`<div class="gk-grid">${select('Kind', 'kind', [{ value: 'holiday', label: 'Holiday' }, { value: 'shutdown', label: 'Shutdown window' }])}${field('Name', 'label')}${field('From', 'startsOn', { type: 'date' })}${field('To (inclusive)', 'endsOn', { type: 'date', required: false })}</div>`, 'Add closed days', { secondary: true }) : ''
  const defer = assign && calendar.length ? form('schedule.defer', '/app/schedules', h`<div class="gk-grid">${select('Schedule', 'schedule', calendar.map(row => ({ value: row.id, label: `${row.title} (due ${showDate(row.next_due_date)})` })))}${field('Defer to', 'until', { type: 'date' })}</div>${field('Reason', 'reason', { hint: 'An owner or supervisor approves it before anything moves.' })}`, 'Ask to defer', { secondary: true }) : ''
  const edits = manage ? calendar.map(row => form('schedule.edit', '/app/schedules', h`<h3>${row.title}</h3>${hidden('schedule', row.id)}${hidden('revision', row.revision)}<div class="gk-grid">${field('Every (days)', 'everyDays', { type: 'number', value: String(row.every_days), attrs: 'min="1" max="3660"' })}${policyFields(row)}</div>`, 'Save change', { secondary: true })) : []
  return card('Calendar', h`${closures.length ? closed : h`<p class="gk-muted">No holidays or shutdowns.</p>`}${add}${defer}${edits}<p class="gk-hint">Due dates are calendar days at the site; a due date on a closed or excluded day moves to the next allowed day. Issued work keeps its due date and checklist revision when a schedule changes.</p>`, { id: 'calendar' })
}
