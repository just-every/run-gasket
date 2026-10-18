// The Work screen (/app), rebuilt from the owner's pick (desk app look H):
// title and site clock, count tabs, the agent strip, a dense table of today's
// work with copper asset drawings, the next day's work, recent activity, and
// the overdue work order that needs a decision in the panel beside it. Then
// the work-order page: its asset header, checklist, readings, parts and
// evidence in the main column, downtime and findings beside them, one primary
// action in the bottom bar.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { daysBetween, localNow, showClock, showDate, showDay, showInstant, showLocal, showTime } from '../dates'
import { partList } from '../parts'
import { assignable, site } from '../site'
import { TABS, pendingProposals, recentActivity, workToday, type Tab } from '../today'
import { woDigits } from '../quantity'
import { workList, workOrderDetail } from '../work'
import { OUTCOME, STATUS, amount, area, backLink, band as headerBand, card, checkbox, details, field, fileField, form, h, hidden, initials, raw, select, table, tag, woNumber, type Html } from './html'
import { ICON, actionIcon, machine } from './icons'
import { ACTIONS, ZONE_LABELS, auditRecords } from './settings'
import { page, zoneName } from './shell'

const condition = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const dueTag = (due: string, status: string, today: string) => !['closed', 'cancelled', 'submitted'].includes(status) && due < today ? tag('Overdue') : ''
const TAB_LABEL: Record<Tab, string> = { today: 'Today', overdue: 'Overdue', progress: 'In progress', done: 'Done today' }
const SHOWN = 6

const isOpen = (status: string) => ['open', 'in_progress', 'returned'].includes(status)
const late = (due: string, today: string) => { const days = daysBetween(due, today); return `Overdue ${days} day${days === 1 ? '' : 's'}` }

/** The status chip: red-orange overdue, ultramarine in progress, hi-vis yellow pending, green done. */
function chip(row: { status: string; due_date: string }, today: string): Html {
  const make = (tone: string, icon: Html, text: string) => h`<span class="gk-chip gk-chip-${tone}">${icon}${text}</span>`
  if (isOpen(row.status) && row.due_date < today) return make('late', ICON.clock, late(row.due_date, today))
  if (row.status === 'in_progress') return make('progress', ICON.progress, STATUS.in_progress)
  if (row.status === 'returned') return make('pending', ICON.clock, STATUS.returned)
  if (row.status === 'open') return make('pending', ICON.clock, row.due_date === today ? 'Due today' : STATUS.open)
  if (row.status === 'submitted' || row.status === 'closed') return make('done', ICON.done, STATUS[row.status])
  return make('quiet', ICON.close, STATUS[row.status] ?? row.status)
}

const dueText = (due: string, today: string) => due === today ? 'Today' : daysBetween(due, today) === 1 ? 'Yesterday' : daysBetween(today, due) === 1 ? 'Tomorrow' : showDay(due, { short: true })
const person = (name: string | null) => name ? h`<span class="gk-person-cell"><span class="gk-avatar" aria-hidden="true">${initials(name)}</span><span>${name}</span></span>` : h`<span class="gk-muted">Not assigned</span>`

function workTable(rows: any[], today: string, alert: string | null) {
  return h`<table class="gk-work-table"><caption class="gk-visually-hidden">Work orders</caption><thead><tr><th scope="col">WO</th><th scope="col">Asset</th><th scope="col">Task</th><th scope="col">Assigned</th><th scope="col">Due</th><th scope="col">Status</th></tr></thead>
    <tbody>${rows.map(row => h`<tr${row.id === alert ? raw(' class="gk-row-alert"') : ''}>
      <td data-label="WO" class="gk-num"><a class="gk-wo" href="/app/work/${row.id}">${woDigits(row.number)}</a></td>
      <td data-label="Asset"><a class="gk-asset-cell" href="/app/assets/${row.asset_id}">${machine({ name: row.asset_name, category: row.asset_category })}<span>${row.asset_name}</span></a></td>
      <td data-label="Task" class="gk-task"><a href="/app/work/${row.id}">${row.title}</a></td>
      <td data-label="Assigned">${person(row.assignee)}</td>
      <td data-label="Due" class="gk-num">${dueText(row.due_date, today)}</td>
      <td data-label="Status">${chip(row, today)}</td></tr>`)}</tbody></table>`
}

type Exception = NonNullable<Awaited<ReturnType<typeof workToday>>['exception']>

/** What was decided, in the panel's words. */
const outcome = (decision: NonNullable<Exception['decision']>, busy: Exception['busy']) => decision.plan === 'keep'
  ? `Kept with ${decision.holder ?? 'the assignee'}${busy.length ? `, after ${busy.map(row => `${woDigits(row.number)} ${row.asset_name}`).join(' and ')}` : ''}.`
  : decision.plan === 'reassign' ? `Reassigned to ${decision.to ?? 'someone else'}${decision.holder ? ` from ${decision.holder}` : ''}.`
  : `Kept as is${decision.holder ? `, with ${decision.holder}` : ''}: no plan today.`

/**
 * The panel beside the table: the overdue work order a manager decides on, its plans with what each costs (keeping it
 * with the person who holds it comes first and is chosen; nothing pre-picks a reassignment), and once decided, the
 * decision. Or the calm state.
 */
function exceptionPanel(actor: Actor, exception: Awaited<ReturnType<typeof workToday>>['exception'], own: boolean) {
  if (!exception) return h`<aside class="gk-panel gk-panel-calm" aria-labelledby="panel-h"><p class="gk-panel-eyebrow">Needs a decision</p><h2 id="panel-h">${own ? 'Nothing overdue is assigned to you' : 'Nothing is overdue'}</h2><p class="gk-muted">Work that passes its due date waits here, with who holds it and who could take it.</p></aside>`
  const { order, busy, plans, decision } = exception
  const holder = order.assignee ? order.assignee.split(' ')[0] : null
  const chosen = plans[0]?.value
  const decide = plans.length ? h`<form method="post" action="/app/do/workorder.plan" class="gk-plan">${hidden('returnTo', '/app')}${hidden('workOrder', order.id)}${hidden('version', order.version)}<fieldset><legend>Choose a plan</legend>
      ${plans.map(plan => h`<label class="gk-option"><input type="radio" name="plan" value="${plan.value}"${plan.value === chosen ? raw(' checked') : ''}><span><b>${plan.label}</b><span class="gk-option-cost">${plan.cost}</span></span></label>`)}</fieldset>
      <div class="gk-panel-actions"><button type="submit">Approve plan</button></div></form>
    <form method="post" action="/app/do/workorder.plan" class="gk-panel-actions gk-panel-keep">${hidden('returnTo', '/app')}${hidden('workOrder', order.id)}${hidden('version', order.version)}${hidden('plan', 'as_is')}<button type="submit" class="gk-secondary">Keep as is</button></form>` : ''
  const decided = decision ? h`<section class="gk-decided" aria-labelledby="decided-h">${ICON.done}<div><h3 id="decided-h">Decided</h3><p>${outcome(decision, busy)}</p><p class="gk-sub">${decision.by ?? '—'}, ${showTime(decision.at, actor.zone)}</p></div></section>` : ''
  return h`<aside class="gk-panel" aria-labelledby="panel-h"><header class="gk-panel-head"><span class="gk-wo-id">${woNumber(order.number)}</span><a class="gk-icon-link" href="/app/work/${order.id}" aria-label="Open ${woNumber(order.number)}">${ICON.open}</a></header>
    <div class="gk-equipment">${machine({ name: order.asset_name, category: order.asset_category }, 'band')}<div><h2 id="panel-h">${order.asset_name}</h2><p>${order.asset_tag}${order.asset_category ? h` · ${order.asset_category}` : ''}</p><p>${order.asset_location}</p></div></div>
    <section class="gk-warning" aria-label="Overdue">${ICON.clock}<div><h3>${late(order.due_date, actor.today)}</h3><p>${order.title}, due ${showDay(order.due_date, { short: true })}${order.assignee ? `, assigned to ${order.assignee}` : ', not assigned'}.${busy.length ? ` ${holder} is on ${busy.map(row => `${woDigits(row.number)} ${row.asset_name}`).join(' and ')}, in progress.` : ''}</p></div></section>
    ${decided}${decide}${plans.length ? '' : h`<div class="gk-panel-actions"><a class="gk-button gk-secondary" href="/app/work/${order.id}">Open work order</a></div>`}</aside>`
}

/** The next day's work by name: "4471 AC-02 Replace motor bearings, 6316-C3 × 2". */
const shortTask = (title: string) => {
  const text = title.replace(/^Follow-up: /, '').split(/[;.]/)[0].trim()
  return text.length <= 48 ? text : `${text.slice(0, 46).replace(/\s+\S*$/, '')}…`
}

export async function workPage(env: Bindings, actor: Actor, url: URL) {
  const mine = url.searchParams.get('mine') === '1', state = url.searchParams.get('state')
  const filtered = mine || state === 'closed' || state === 'open'
  const tab = (TABS as readonly string[]).includes(url.searchParams.get('tab') ?? '') ? url.searchParams.get('tab') as Tab : 'today'
  const [today, place, pending, activity] = await Promise.all([workToday(env, actor, url), site(env), pendingProposals(env), recentActivity(env, actor)])
  const rows = filtered ? await workList(env, actor, url) : today.tabs[tab]
  const all = url.searchParams.get('all') === '1', shown = all ? rows : rows.slice(0, SHOWN)
  const assigner = can(actor, 'work.assign')
  const here = (params: string) => `/app${params ? `?${params}` : ''}`

  const tabs = h`<nav class="gk-count-tabs" aria-label="Today's work">${TABS.map((key, index) => h`${index === 1 ? raw('<span class="gk-tab-rule" aria-hidden="true"></span>') : ''}<a href="${here(key === 'today' ? '' : `tab=${key}`)}" class="gk-count-tab gk-count-${key}"${!filtered && key === tab ? raw(' aria-current="page"') : ''}>${TAB_LABEL[key]} <b class="gk-num">${today.tabs[key].length}</b></a>`)}</nav>`

  const filters = h`<nav class="gk-tab-filters" aria-label="Other work lists">${[['state=open', 'All open', state === 'open' && !mine], ['mine=1', 'Assigned to me', mine], ['state=closed', 'Closed', state === 'closed']].map(([params, label, on]) => h`<a href="${here(params as string)}"${on ? raw(' aria-current="page"') : ''}>${label}</a>`)}</nav>`
  const agent = pending.count && pending.latest && (can(actor, 'proposal.decide') || can(actor, 'proposal.prepare')) ? h`<p class="gk-agent">${ICON.proposals}<span class="gk-agent-text"><b>${pending.latest.prepared_by}:</b> ${pending.latest.reasoning.split(/(?<=\.)\s/)[0]}</span><span class="gk-approval"><i class="gk-dot" aria-hidden="true"></i>${pending.count} proposal${pending.count === 1 ? '' : 's'} waiting for a decision</span><a class="gk-agent-link" href="/app/proposals">Review</a></p>` : ''

  const emptyText: Record<Tab, [string, string]> = {
    today: ['Nothing on today\'s plate', assigner ? 'Work orders appear here when a schedule falls due or when you raise corrective work on an asset.' : 'Work assigned to you for today appears here.'],
    overdue: ['Nothing is overdue', 'Work that passes its due date shows here until it is done.'],
    progress: ['Nothing in progress', 'Work moves here once someone records a result, reading, part or finding on it.'],
    done: ['Nothing done yet today', 'Work submitted for review or closed today shows here.'],
  }
  const [title, text] = filtered ? [state === 'closed' ? 'No closed work orders yet' : mine ? 'Nothing is assigned to you' : 'No open work orders', 'Work orders appear here when a schedule falls due or when you raise corrective work on an asset.'] : emptyText[tab]
  const empty = h`<div class="gk-empty gk-empty-flat"><img src="/brand/assets/clipboard.svg" alt="" width="160" height="128"><h2>${title}</h2><p>${text}</p>${assigner && !filtered && tab === 'today' ? h`<p><a class="gk-button gk-secondary" href="/app/schedules">Go to schedules</a></p>` : ''}</div>`

  const more = rows.length > shown.length ? h`<a class="gk-more-rows" href="${here([filtered ? url.searchParams.toString() : tab === 'today' ? '' : `tab=${tab}`, 'all=1'].filter(Boolean).join('&'))}">+ ${rows.length - shown.length} more</a>` : ''
  const next = today.next.length ? h`<p class="gk-next">${ICON.calendar}<span><b>${showDay(today.next[0].due_date, { short: true })}</b> next: ${today.next.map((row, index) => h`${index ? ' · ' : ''}<a href="/app/work/${row.id}" title="${row.title}">${woDigits(row.number)} ${row.asset_tag}</a> ${shortTask(row.title)}`)}</span><a class="gk-icon-link" href="${here('state=open')}" aria-label="All open work">${ICON.arrow}</a></p>` : ''

  let log: Html = h``
  if (activity) {
    const records = await auditRecords(env)
    log = h`<section class="gk-activity gk-work-log" aria-labelledby="activity-h"><header><h2 id="activity-h">Recent activity</h2><a href="/app/audit">All activity ›</a></header>
      ${activity.length ? h`<ol>${activity.map(row => h`<li><time class="gk-num">${showTime(row.at, actor.zone)}</time>${actionIcon(row.action)}<p><b>${row.actor_name ?? '—'}</b> ${ACTIONS[row.action] ?? 'Changed a record'}${records.get(row.subject) ? h` · ${records.get(row.subject)}` : ''}</p></li>`)}</ol>` : h`<p class="gk-muted">Nothing has changed yet.</p>`}</section>`
  }

  const generate = assigner ? form('workorders.generate', '/app', '', 'Create due work orders', { secondary: true, layout: 'gk-inline' }) : ''
  const clock = localNow(actor.zone)
  const body = h`<div class="gk-work">
    <header class="gk-work-head"><div class="gk-work-title"><h1>Work</h1><p>${place?.name ?? ''}${place ? ', ' : ''}${showDay(actor.today)}</p></div><div class="gk-work-tools">${filters}${generate}</div>
      <p class="gk-site-clock"><strong class="gk-num">${showClock(clock.slice(11))}</strong><span>${showDay(actor.today)} · ${zoneName(actor.zone)}</span><span>${ZONE_LABELS[actor.zone] ?? actor.zone} site clock</span></p></header>
    <div class="gk-work-main">${tabs}${agent}<section class="gk-work-card" aria-label="${filtered ? 'Work orders' : TAB_LABEL[tab]}">${rows.length ? workTable(shown, actor.today, today.exception?.order.id ?? null) : empty}${more}${next}</section></div>
    ${exceptionPanel(actor, today.exception, today.own)}${log}</div>`
  return page(env, 'Work', actor, body, { url })
}

export async function workOrderPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const w = await workOrderDetail(env, actor, id)
  const back = `/app/work/${w.id}`
  const working = w.mine && can(actor, 'work.do') && ['open', 'in_progress', 'returned'].includes(w.status)
  const reviewing = can(actor, 'work.review') && w.status === 'submitted' && !w.mine
  const ids = h`${hidden('workOrder', w.id)}${hidden('version', w.version)}`
  const post = (action: string, fields: unknown, submit: string, options: { multipart?: boolean; secondary?: boolean; layout?: string } = {}) => form(action, back, h`${ids}${fields}`, submit, options)

  const band = h`${headerBand({ id: 'wo-asset',
    eyebrow: h`${woNumber(w.number)} · ${w.kind === 'preventive' ? 'Preventive' : 'Corrective'}${w.follow_up_of_number ? h` · follow-up of <a href="/app/work/${w.follow_up_of}">${woNumber(w.follow_up_of_number)}</a>` : ''}`,
    title: h`<a href="/app/assets/${w.asset_id}">${w.asset_name}</a>`,
    facts: [`Serial ${w.asset_serial ?? '—'}`, w.asset_location, `Custodian: ${w.asset_custodian ?? '—'}`],
    status: tag(STATUS[w.status]),
    meta: [{ label: 'Due date', icon: ICON.calendar, value: h`${showDate(w.due_date)} ${dueTag(w.due_date, w.status, actor.today)}` }, { label: 'Assigned maintainer', icon: ICON.person, value: w.assignee_name ?? 'Not assigned' }],
    art: machine({ name: w.asset_name, category: w.asset_category }, 'band') })}`
  // The checklist card names preventive work; other work says what needs doing in its own card.
  const task = w.items.length && w.title === w.checklist_name && !w.description ? '' : card('What needs doing', h`<p>${w.title}</p>${w.description ? h`<p class="gk-muted">${w.description}</p>` : ''}`, { id: 'task' })

  const done = w.items.filter(item => item.result).length
  const checklist = !w.items.length ? '' : card(`${w.checklist_name}, revision ${w.checklist_revision}`, working
    ? h`<form method="post" action="/app/do/workorder.results" class="gk-form">${hidden('returnTo', back)}${ids}<ol class="gk-checklist">${w.items.map(item => h`<li>
        <fieldset class="gk-item"><legend>${item.text}</legend><div class="gk-segmented">${['pass', 'attention', 'fail'].map(outcome => h`<label><input type="radio" name="outcome-${item.index}" value="${outcome}"${item.result?.outcome === outcome ? raw(' checked') : ''}><span>${OUTCOME[outcome]}</span></label>`)}</div>
        ${field('Note', `note-${item.index}`, { value: item.result?.note ?? '', required: false })}</fieldset></li>`)}</ol>
      <div class="gk-actions"><button type="submit" class="gk-secondary">Save results</button></div></form>`
    : table(['Item', 'Result', 'Note'], w.items.map(item => [item.text, item.result ? tag(OUTCOME[item.result.outcome]) : h`<span class="gk-muted">No result yet</span>`, item.result?.note ?? '']), 'Checklist results', { wrap: [0, 2] }),
  { id: 'checklist', extra: h`<span class="gk-count">${done} of ${w.items.length} complete</span>` })

  const meters = w.meters
  const readings = card('Meter and condition readings', h`${w.readings.length ? h`<dl class="gk-readings">${w.readings.map(row => h`<div><dt>${row.meter}</dt><dd>${row.kind === 'condition' ? condition(row.value) : amount(row.value, row.unit)}<span class="gk-sub">Taken ${showLocal(row.taken_on)}</span></dd></div>`)}</dl>` : h`<p class="gk-muted">No readings recorded on this work order.</p>`}
    ${working && meters.length ? post('workorder.readings', h`${field('Taken on', 'takenOn', { type: 'datetime-local', value: localNow(actor.zone) })}<div class="gk-grid">${meters.map(meter => h`${hidden('meter', meter.id)}${meter.kind === 'condition'
      ? select(`${meter.name}`, 'value', [{ value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }], '', { required: false, blank: 'Not read' })
      : field(`${meter.name} (${meter.unit})`, 'value', { required: false, attrs: 'inputmode="decimal"' })}`)}</div>`, 'Record readings', { secondary: true }) : ''}
    ${working && !meters.length ? h`<p class="gk-muted">This asset has no meters. A lead adds them on the asset.</p>` : ''}`, { id: 'readings' })

  const stock = working ? (await partList(env, actor)) : []
  const parts = card('Parts issued and returned', h`${w.parts.length ? table(['Part', 'Issued', 'Returned', 'Used'], w.parts.map(row => [h`${row.name}<span class="gk-sub">${row.number}</span>`, amount(row.issued, row.unit), amount(row.returned, row.unit), amount(row.used, row.unit)]), 'Parts', { wrap: [0] }) : h`<p class="gk-muted">No parts issued.</p>`}
    ${working && stock.length ? h`<div class="gk-split">${post('workorder.issue', h`${select('Part', 'part', stock.map(part => ({ value: part.id, label: `${part.number} ${part.name} (${amount(part.onHand, part.unit)} on hand)` })), '', { blank: 'Choose a part' })}${field('Quantity', 'quantity', { attrs: 'inputmode="decimal"' })}`, 'Issue part', { secondary: true })}
      ${w.parts.length ? post('workorder.return', h`${select('Part', 'part', w.parts.map(part => ({ value: part.id, label: `${part.number} ${part.name} (${amount(part.used, part.unit)} held)` })), '', { blank: 'Choose a part' })}${field('Quantity', 'quantity', { attrs: 'inputmode="decimal"' })}`, 'Return unused', { secondary: true }) : ''}</div>` : ''}`, { id: 'parts' })

  const evidence = card('Inspection evidence', h`${w.evidence.length ? h`<ul class="gk-files">${w.evidence.map(file => h`<li><a href="/app/evidence/${file.id}">${file.filename}</a><span class="gk-sub">${Math.ceil(file.size / 1024)} KB · ${file.uploaded_by} · ${showInstant(file.uploaded_at, actor.zone)}</span>${details([['SHA-256', file.sha256], ['Type', file.media_type]])}</li>`)}</ul>` : h`<p class="gk-muted">No photos or documents attached.</p>`}
    ${working ? post('workorder.evidence', fileField('Photo or document', 'file', { required: true, accept: '.png,.jpg,.jpeg,.webp,.heic,.pdf', hint: 'PNG, JPEG, WebP, HEIC or PDF, up to 1.5 MB.' }), 'Attach evidence', { multipart: true, secondary: true }) : ''}`, { id: 'evidence' })

  const open = w.downtime.find(row => !row.ended_on)
  const downtime = card('Downtime', h`${w.downtime.length ? h`<dl class="gk-pairs">${w.downtime.map(row => h`<div><dt>Start</dt><dd>${showLocal(row.started_on)}</dd></div><div><dt>End</dt><dd>${row.ended_on ? showLocal(row.ended_on) : tag('Down')}</dd></div>${row.minutes !== null ? h`<div class="gk-total"><dt>Total downtime</dt><dd>${row.minutes} minutes</dd></div>` : ''}<div><dt>Reason</dt><dd>${row.reason}</dd></div>`)}</dl>` : h`<p class="gk-muted">The asset has not been taken down for this work.</p>`}
    ${working && !open ? post('downtime.start', h`${field('Went down at', 'startedOn', { type: 'datetime-local', value: localNow(actor.zone) })}${field('Reason', 'reason')}`, 'Record asset down', { secondary: true }) : ''}
    ${working && open ? post('downtime.end', field('Back in service at', 'endedOn', { type: 'datetime-local', value: localNow(actor.zone) }), 'Record back in service', { secondary: true }) : ''}`, { id: 'downtime' })

  const findings = card('Corrective findings', h`${w.findings.length ? h`<ul class="gk-findings">${w.findings.map(row => h`<li>${tag(row.severity === 'high' ? 'High' : row.severity === 'medium' ? 'Medium' : 'Low')} ${row.text}${row.follow_up_id ? h`<span class="gk-sub">Follow-up <a href="/app/work/${row.follow_up_id}">${woNumber(row.follow_up_number)}</a> · ${STATUS[row.follow_up_status]}</span>` : ''}</li>`)}</ul>` : h`<p class="gk-muted">No findings recorded.</p>`}
    ${working ? post('finding.record', h`${area('What was found and what was done', 'text')}${select('Severity', 'severity', [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }], 'low')}${checkbox('Needs follow-up work (raises a corrective work order)', 'followUp')}${field('Follow-up due', 'followUpDue', { type: 'date', required: false, hint: 'Leave empty for tomorrow (high) or a week from today.' })}`, 'Record finding', { secondary: true }) : ''}`, { id: 'findings' })

  const decisions = w.decisions.length ? card('Overdue decisions', h`<ul class="gk-findings">${w.decisions.map(row => h`<li>${row.plan === 'keep' ? `Kept with ${row.holder ?? 'the assignee'}` : row.plan === 'reassign' ? `Reassigned to ${row.to ?? 'someone else'}` : `Kept as is${row.holder ? `, with ${row.holder}` : ''}`}<span class="gk-sub">${row.decided_by ?? '—'} · ${showInstant(row.at, actor.zone)}</span></li>`)}</ul>`, { id: 'decisions' }) : ''
  const reviews = w.reviews.length ? card('Reviews', table(['Decision', 'By', 'Reason'], w.reviews.map(row => [tag(row.decision === 'approved' ? 'Approved' : 'Returned'), h`${row.reviewer}<span class="gk-sub">${showInstant(row.at, actor.zone)}</span>`, row.reason ?? '']), 'Reviews', { wrap: [2] }), { id: 'reviews' }) : ''

  const assign = can(actor, 'work.assign') && ['open', 'in_progress', 'returned'].includes(w.status)
    ? card('Assignment', h`${post('workorder.assign', select('Assign to', 'assignee', (await assignable(env)).map(person => ({ value: person.id, label: person.name })), w.assignee_id ?? '', { blank: 'Choose a person' }), 'Assign', { secondary: true })}
      ${post('workorder.cancel', field('Reason to cancel', 'reason'), 'Cancel work order', { secondary: true })}`, { id: 'assignment' }) : ''

  let bar = h``
  if (working) bar = w.missing.length
    ? h`<p class="gk-bar-note">Before review: ${w.missing.join('; ')}.</p><button type="button" disabled>Submit for review</button>`
    : h`<p class="gk-bar-note">This work order is ready for review.</p><form method="post" action="/app/do/workorder.submit" class="gk-inline">${hidden('returnTo', back)}${ids}<button type="submit">Submit for review</button></form>`
  if (reviewing) bar = h`<p class="gk-bar-note">Reviewing records what was entered. It is not a safety sign-off.</p>
    <form method="post" action="/app/do/workorder.review" class="gk-inline gk-review">${hidden('returnTo', back)}${ids}${hidden('decision', 'return')}${field('Reason to return', 'reason')}<button type="submit" class="gk-secondary">Return for more work</button></form>
    <form method="post" action="/app/do/workorder.review" class="gk-inline">${hidden('returnTo', back)}${ids}${hidden('decision', 'approve')}<button type="submit">Approve and close</button></form>`

  const body = h`${backLink('/app', 'Work orders')}${band}
    <div class="gk-columns"><div class="gk-col-main">${task}${checklist}${readings}${parts}${evidence}</div><div class="gk-col-side">${decisions}${downtime}${findings}${reviews}${assign}
    ${details([['Work order id', w.id], ['Version', w.version], ['Schedule', w.schedule_title ?? '—'], ['Created', showInstant(w.created_at, actor.zone)]])}</div></div>`
  return page(env, `${woNumber(w.number)} ${w.asset_name}`, actor, body, { url, bar: working || reviewing ? bar : undefined })
}
