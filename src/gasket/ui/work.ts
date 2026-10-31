import { printPackCard } from './print-packs'
import { safetyState } from '../safety'
import { safetyCard } from './safety'
import { stockSources } from '../stock-sources'
import { all as sourceRows, newId } from '../core'
import { requestSourcesCard } from './request-sources'
import { one as nestedOne } from '../core'
// The Work screen (/app), rebuilt from the owner's pick (desk app look H):
// title and site clock, count tabs, the agent strip, a dense table of today's
// work with copper asset drawings, the next day's work, recent activity, and
// the overdue work order that needs a decision in the panel beside it. Then
// the work-order page: its asset header, checklist, readings, parts and
// evidence in the main column, downtime and findings beside them, one primary
// action in the bottom bar.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { codeList } from '../codes'
import { daysBetween, localNow, showClock, showDate, showDay, showInstant, showLocal, showTime } from '../dates'
import { partList } from '../parts'
import { usd } from '../bad-actors'
import { assignable, site } from '../site'
import { TABS, pendingProposals, recentActivity, workToday, todayPageRows, type Tab } from '../today'
import { woDigits } from '../quantity'
import { workList, workPageRows, workOrderDetail } from '../work'
import { teamList } from '../crew'
import { kitList, substituteList } from '../reservations'
import { chaseCard, dependencyCard } from './chasing'
import { commentsCard } from './comments'
import { mentionable, readThread } from '../comments'
import { bomCard } from './bom'
import { costCard } from './bad-actors'
import { laborCard } from './labor'
import { PRIORITIES, PRIORITY_LABELS, type Priority } from '../templates'
import { crewCard } from './crew'
import { annotateForm, evidenceExtras, evidenceFields, signaturesCard } from './evidence'
import { workDocumentsCard } from './documents'
import { all } from '../core'
import { statusList } from '../work-fields'
import { CODE_KIND } from './codes'
import { OUTCOME, STATUS, amount, area, backLink, band as headerBand, card, checkbox, details, field, fileField, form, h, hidden, initials, raw, select, table, tag, woNumber, type Html } from './html'
import { ICON, actionIcon, machine } from './icons'
import { ACTIONS, ZONE_LABELS, auditRecords } from './settings'
import { page, zoneName } from './shell'

const condition = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const dueTag = (due: string, status: string, today: string) => !['closed', 'cancelled', 'submitted'].includes(status) && due < today ? tag('Overdue') : ''
const TAB_LABEL: Record<Tab, string> = { today: 'Today', overdue: 'Overdue', progress: 'In progress', done: 'Done today' }
const SHOWN = 6
const OBLIGATION: Record<string, string> = { open: 'not acknowledged', acknowledged: 'acknowledged', resolved: 'resolved by independent review', cancelled: 'cancelled' }

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
      <td data-label="Asset">${row.asset_id ? h`<a class="gk-asset-cell" href="/app/assets/${row.asset_id}">${machine({ name: row.asset_name, category: row.asset_category })}<span>${row.asset_name}</span></a>` : h`<span class="gk-asset-cell">${machine({ name: row.asset_name, category: null })}<span>${row.asset_name}<span class="gk-sub">Location, no asset</span></span></span>`}</td>
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
  return h`<aside class="gk-panel" aria-labelledby="panel-h"><header class="gk-panel-head"><span class="gk-wo-id">${woNumber(order.number)}</span><a href="/app/work/${order.id}">Open work order</a></header>
    <div class="gk-equipment">${machine({ name: order.asset_name, category: order.asset_category }, 'band')}<div><h2 id="panel-h">${order.asset_name}</h2><p>${order.asset_tag ?? 'Location, no asset'}${order.asset_category ? h` · ${order.asset_category}` : ''}</p><p>${order.asset_location}</p></div></div>
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
  const filtered = mine || state === 'closed' || state === 'open' || url.searchParams.has('team')
  const tab = (TABS as readonly string[]).includes(url.searchParams.get('tab') ?? '') ? url.searchParams.get('tab') as Tab : 'today'
  const [today, place, pending, activity] = await Promise.all([workToday(env, actor, url), site(env), pendingProposals(env), recentActivity(env, actor)])
  const selection = new URL(url)
  if (!selection.searchParams.has('limit')) selection.searchParams.set('limit', selection.searchParams.get('all') === '1' ? '100' : String(SHOWN))
  const result = filtered ? await workPageRows(env, actor, selection) : await todayPageRows(env, actor, selection)
  const rows = result.rows, shown = rows
  const assigner = can(actor, 'work.assign')
  const here = (params: string) => `/app${params ? `?${params}` : ''}`

  const tabs = h`<nav class="gk-count-tabs" aria-label="Today's work">${TABS.map((key, index) => h`${index === 1 ? raw('<span class="gk-tab-rule" aria-hidden="true"></span>') : ''}<a href="${here(key === 'today' ? '' : `tab=${key}`)}" class="gk-count-tab gk-count-${key}"${!filtered && key === tab ? raw(' aria-current="page"') : ''}>${TAB_LABEL[key]} <b class="gk-num">${today.counts[key]}</b></a>`)}</nav>`

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

  const continuation = new URLSearchParams(selection.searchParams)
  continuation.set('cursor', result.next ?? '')
  const first = new URLSearchParams(selection.searchParams); first.delete('cursor')
  const exportParams = new URLSearchParams(selection.searchParams); exportParams.delete('cursor'); exportParams.set('snapshot', result.start)
  const more = h`<nav class="gk-more-rows" aria-label="Work pages"><span role="status">${result.total ? result.offset + 1 : 0}–${result.offset + rows.length} of ${result.total} work orders</span> ${result.offset ? h`<a href="${here(first.toString())}">First page</a> ` : ''}${result.next ? h`<a href="${here(continuation.toString())}">Next page</a>` : ''}</nav>${filtered ? h`<p><a href="/app/work.csv?${exportParams.toString()}">Download work CSV</a> · Up to 2,000 matching work orders. Larger or changed lists are refused; accepted work and files are preserved.</p>` : ''}`

  const next = today.next.length ? h`<p class="gk-next">${ICON.calendar}<span><b>${showDay(today.next[0].due_date, { short: true })}</b> next: ${today.next.map((row, index) => h`${index ? ' · ' : ''}<a href="/app/work/${row.id}" title="${row.title}">${woDigits(row.number)} ${row.asset_tag ?? row.location}</a> ${shortTask(row.title)}`)}</span><a href="${here('state=open')}">All open work</a></p>` : ''

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
  w.missing.push(...(await safetyState(env,actor,w)).missing)
  const back = `/app/work/${w.id}`
  // PLAN-006: opening the page reads its thread; the card still marks what was unread.
  await readThread(env, actor, 'work', w.id)
  const working = w.mine && can(actor, 'work.do') && ['open', 'in_progress', 'returned'].includes(w.status)
  // PLAN-002: collaborators record alongside the accountable assignee, who alone submits.
  const recording = (w.mine || w.collaborating) && can(actor, 'work.do') && ['open', 'in_progress', 'returned'].includes(w.status)
  const reviewing = can(actor, 'work.review') && w.status === 'submitted' && !w.mine
  const ids = h`${hidden('workOrder', w.id)}${hidden('version', w.version)}`
  const post = (action: string, fields: unknown, submit: string, options: { multipart?: boolean; secondary?: boolean; layout?: string } = {}) => form(action, back, h`${ids}${fields}`, submit, options)

  const band = h`${headerBand({ id: 'wo-asset',
    eyebrow: h`${woNumber(w.number)} · ${w.kind === 'preventive' ? 'Preventive' : 'Corrective'} · ${PRIORITY_LABELS[w.priority as Priority]} priority${w.waiting_label ? ` · ${w.waiting_label}` : ''}${w.template_name ? ` · from template ${w.template_name} (revision ${w.template_revision})` : ''}${w.follow_up_of_number ? h` · follow-up of <a href="/app/work/${w.follow_up_of}">${woNumber(w.follow_up_of_number)}</a>` : ''}`,
    title: w.asset_id ? h`<a href="/app/assets/${w.asset_id}">${w.asset_name}</a>` : h`${w.location}`,
    facts: w.asset_id ? [`Serial ${w.asset_serial ?? '—'}`, w.asset_location, `Custodian: ${w.asset_custodian ?? '—'}`] : ['Location, no asset'],
    status: tag(STATUS[w.status]),
    meta: [{ label: 'Due date', icon: ICON.calendar, value: h`${showDate(w.due_date)} ${dueTag(w.due_date, w.status, actor.today)}` }, { label: 'Assigned maintainer', icon: ICON.person, value: w.assignee_name ?? 'Not assigned' }],
    art: machine({ name: w.asset_name, category: w.asset_category }, 'band') })}`
  // FIELD-009: who raised the work, through which door, and when work already done ran.
  const DOOR: Record<string, string> = { web: 'the web workspace', api: 'the JSON API' }
  const raisedBy = (w: any) => h`${w.created_via ? h`<p class="gk-sub">Raised by ${w.created_by_name ?? 'a former member'} through ${DOOR[w.created_via] ?? w.created_via}</p>` : ''}${w.work_started_on ? h`<p class="gk-sub">Done ${showLocal(w.work_started_on)} to ${showLocal(w.work_ended_on)}, recorded afterwards</p>` : ''}`
  // The checklist card names preventive work; other work says what needs doing in its own card.
  const task = w.items.length && w.title === w.checklist_name && !w.description ? '' : card('What needs doing', h`<p>${w.title}</p>${w.description ? h`<p class="gk-muted">${w.description}</p>` : ''}${raisedBy(w)}`, { id: 'task' })

  // FIELD-004: each step takes the answer its kind asks for; a step that does not apply yet says why, a photo step takes its photo under evidence.
  const owed = w.items.filter(item => item.applies)
  const done = owed.filter(item => item.result || item.exception || (item.kind === 'photo' && item.photos)).length
  const stepNote = (item: (typeof w.items)[number]) => h`<p class="gk-sub">${item.summary}</p>${item.exception ? h`<p class="gk-sub">Exception by ${item.exception.granted_by ?? '—'}: ${item.exception.reason}</p>` : ''}`
  const answerField = (item: (typeof w.items)[number]) => item.kind === 'check'
    ? h`<div class="gk-segmented">${['pass', 'attention', 'fail'].map(outcome => h`<label><input type="radio" name="outcome-${item.index}" value="${outcome}"${item.result?.outcome === outcome ? raw(' checked') : ''}><span>${OUTCOME[outcome]}</span></label>`)}</div>`
    : item.kind === 'number' ? field(`Reading (${item.unit})`, `value-${item.index}`, { value: item.result?.value ?? '', required: false, attrs: 'inputmode="decimal"' })
    : item.kind === 'option' ? select('Answer', `value-${item.index}`, item.options!.map(option => ({ value: option, label: option })), item.result?.value ?? '', { required: false, blank: 'Not answered' })
    : field('Answer', `value-${item.index}`, { value: item.result?.value ?? '', required: false })
  const stepRecord = (item: (typeof w.items)[number]) => !item.applies ? h`<li class="gk-muted"><fieldset class="gk-item"><legend>${item.text}</legend><p class="gk-sub">Not needed now: ${item.summary.split('; ').pop()}</p></fieldset></li>`
    : item.kind === 'photo' ? h`<li><fieldset class="gk-item"><legend>${item.text}</legend>${stepNote(item)}<p>${item.photos ? `${item.photos} photo${item.photos === 1 ? '' : 's'} attached` : 'Attach the photo under Inspection evidence, choosing this step.'}</p></fieldset></li>`
    : h`<li><fieldset class="gk-item"><legend>${item.text}</legend>${stepNote(item)}${item.result?.recorded_by ? h`<p class="gk-sub">Signed off by ${item.result.recorded_by}</p>` : ''}${answerField(item)}
        ${field('Note', `note-${item.index}`, { value: item.result?.note ?? '', required: false })}</fieldset></li>`
  const shown = (item: (typeof w.items)[number]) => !item.applies ? h`<span class="gk-muted">Not needed</span>` : item.kind === 'photo' ? (item.photos ? tag('Photo attached') : h`<span class="gk-muted">No photo yet</span>`) : item.result ? tag(OUTCOME[item.result.outcome]) : h`<span class="gk-muted">No result yet</span>`
  // A supervisor who did none of the work may except a step, with a reason; it then blocks nothing at submission.
  const excepting = can(actor, 'work.review') && !w.mine && !w.collaborating && ['open', 'in_progress', 'returned'].includes(w.status) && w.items.some(item => item.applies && !item.exception)
  const exceptForm = excepting ? post('step.except', h`${select('Step', 'item', w.items.filter(item => item.applies && !item.exception).map(item => ({ value: String(item.index), label: `${item.index + 1}. ${item.text}` })), '', { blank: 'Choose a step' })}${area('Reason for the exception', 'reason')}`, 'Grant exception', { secondary: true }) : ''
  const checklist = !w.items.length ? '' : card(`${w.checklist_name}, revision ${w.checklist_revision}`, h`${recording
    ? h`<form method="post" action="/app/do/workorder.results" class="gk-form">${hidden('returnTo', back)}${ids}<ol class="gk-checklist">${w.items.map(stepRecord)}</ol>
      <div class="gk-actions"><button type="submit" class="gk-secondary">Save results</button></div></form>`
    : table(['Item', 'Result', 'Reading or answer', 'Note', 'Signed off by'], w.items.map(item => [h`${item.text}${stepNote(item)}`, shown(item), item.result?.value ? (item.kind === 'number' ? amount(item.result.value, item.unit!) : item.result.value) : '', item.result?.note ?? '', item.result?.recorded_by ?? '']), 'Checklist results', { wrap: [0, 3] })}${exceptForm}`,
  { id: 'checklist', extra: h`<span class="gk-count">${done} of ${owed.length} complete</span>` })

  const meters = w.meters
  const readings = card('Meter and condition readings', h`${w.readings.length ? h`<dl class="gk-readings">${w.readings.map(row => h`<div><dt>${row.meter}</dt><dd>${row.kind === 'condition' ? condition(row.value) : amount(row.value, row.unit)}<span class="gk-sub">Taken ${showLocal(row.taken_on)}</span></dd></div>`)}</dl>` : h`<p class="gk-muted">No readings recorded on this work order.</p>`}
    ${recording && meters.length ? post('workorder.readings', h`${field('Taken on', 'takenOn', { type: 'datetime-local', value: localNow(actor.zone) })}<div class="gk-grid">${meters.map(meter => h`${hidden('meter', meter.id)}${meter.kind === 'condition'
      ? select(`${meter.name}`, 'value', [{ value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }], '', { required: false, blank: 'Not read' })
      : field(`${meter.name} (${meter.unit})`, 'value', { required: false, attrs: 'inputmode="decimal"' })}`)}</div>`, 'Record readings', { secondary: true }) : ''}
    ${recording && !meters.length ? h`<p class="gk-muted">${w.asset_id ? 'This asset has no meters. A lead adds them on the asset.' : 'Work at a location has no asset meters to read.'}</p>` : ''}`, { id: 'readings' })

  const timeEntries = card('Time entries', h`${w.timeEntries.length ? table(['Worked on', 'Minutes', 'Recorded by', 'Note'], w.timeEntries.map(row => [showDate(row.worked_on), row.minutes, row.recorded_by, row.note]), 'Time entries', { wrap: [2, 3] }) : h`<p class="gk-muted">No time recorded.</p>`}
    ${recording ? post('workorder.time', h`${field('Worked on', 'workedOn', { type: 'date', value: actor.today })}${field('Minutes worked', 'minutes', { type: 'number', attrs: 'min="1" max="1440" step="1"' })}${field('Time note', 'note')}`, 'Record time', { secondary: true }) : ''}<p class="gk-sub">Original minutes only. Labor charges are recorded separately.</p>`, { id: 'time-entries' })

  // PART-002: what is reserved to this work order, and the planner's reserve and release doors.
  const planning = can(actor, 'work.assign') && ['open', 'in_progress', 'returned'].includes(w.status)
  const stock = recording || planning ? (await partList(env, actor)) : []
  const sources = recording ? await stockSources(env, actor) : []
  const sourceIssues = recording ? await sourceRows(env, `SELECT c.move_id,p.number,l.bin,l.lot,l.serial FROM gk_controlled_moves c JOIN gk_part_moves m ON m.id=c.move_id JOIN gk_parts p ON p.id=m.part_id JOIN gk_receipt_lines l ON l.id=c.receipt_line_id WHERE m.work_order_id=? AND m.kind='issue'`, w.id) : []
  const RESERVATION: Record<string, string> = { open: 'Reserved', issued: 'Issued', released: 'Released' }
  const held = w.reservations.length ? table(['Reserved', 'Quantity', 'Still needed', 'State'], w.reservations.map(row => [h`${row.part.name}<span class="gk-sub">${row.part.number}${row.insteadOf ? ` · instead of ${row.insteadOf.number}` : ''}${row.kit ? ` · ${row.kit}` : ''}</span>`,
    amount(row.quantity, row.part.unit), amount(row.stillNeeded, row.part.unit), h`${tag(RESERVATION[row.state])}${row.releaseReason ? h`<span class="gk-sub">${row.releaseReason}</span>` : ''}`]), 'Reservations', { wrap: [0, 3] }) : ''
  const kits = planning ? await kitList(env) : [], swaps = planning ? await substituteList(env) : []
  const reserveForms = planning && stock.length ? h`<div class="gk-split">${post('workorder.reserve', h`${select('Part', 'part', stock.map(part => ({ value: part.id, label: `${part.number} ${part.name} (${amount(part.available, part.unit)} available)` })), '', { blank: 'Choose a part' })}${field('Quantity', 'quantity', { attrs: 'inputmode="decimal"' })}
      ${swaps.length ? select('Instead of', 'insteadOf', [...new Map(swaps.map(row => [row.part_id, { value: row.part_id, label: `${row.part_number} ${row.part_name}` }])).values()], '', { required: false, blank: 'The part itself' }) : ''}`, 'Reserve part', { secondary: true })}
    ${kits.length ? post('workorder.reserve', h`${select('Repair kit', 'kit', kits.map(kit => ({ value: kit.id, label: `${kit.name}: ${kit.lines.map(line => `${line.quantity} ${line.number}`).join(', ')}` })), '', { blank: 'Choose a kit' })}
      ${swaps.length ? select('Use a substitute', 'swap', swaps.map(row => ({ value: `${row.part_id}:${row.substitute_id}`, label: `${row.substitute_number} for ${row.part_number}` })), '', { required: false, blank: 'No substitute' }) : ''}`, 'Reserve kit', { secondary: true }) : ''}</div>
    ${w.reservations.some(row => row.state === 'open') ? post('reservation.release', h`${select('Reservation', 'reservation', w.reservations.filter(row => row.state === 'open').map(row => ({ value: row.id, label: `${row.part.number} ${row.part.name}` })), '', { blank: 'Choose a reservation' })}${field('Reason', 'reason')}`, 'Release reservation', { secondary: true }) : ''}` : ''
  const parts = card('Parts issued and returned', h`${held}${w.parts.length ? table(['Part', 'Issued', 'Returned', 'Used', 'Parts cost'], w.parts.map(row => [h`${row.name}<span class="gk-sub">${row.number}</span>`, amount(row.issued, row.unit), h`${amount(row.returned, row.unit)}${row.quarantined !== '0' ? h`<span class="gk-sub">${amount(row.quarantined, row.unit)} still in quarantine</span>` : ''}`, amount(row.used, row.unit), row.usedCents === null ? 'Unpriced' : usd(row.usedCents)]), 'Parts', { wrap: [0] }) : h`<p class="gk-muted">No parts issued.</p>`}
    ${recording && stock.length ? h`<div class="gk-split">${post('workorder.issue', h`${select('Part', 'part', stock.map(part => ({ value: part.id, label: `${part.number} ${part.name} (${amount(part.onHand, part.unit)} on hand)` })), '', { blank: 'Choose a part' })}${select('Receipt source', 'receiptLine', sources.filter(row=>row.on_hand_milli>0&&!row.expired&&!row.reconciliationRequired).map(row=>({value:row.id,label:`${row.number} · ${row.bin || 'No bin'} · ${row.lot || 'No lot'} · ${row.serial || 'No serial'} · ${row.onHand} ${row.unit}`})), '', {required:false,blank:'Untracked shelf stock'})}${hidden('identity',newId())}${field('Quantity', 'quantity', { attrs: 'inputmode="decimal"' })}`, 'Issue part', { secondary: true })}
      ${w.parts.length ? post('workorder.return', h`${select('Part', 'part', w.parts.map(part => ({ value: part.id, label: `${part.number} ${part.name} (${amount(part.used, part.unit)} held)` })), '', { blank: 'Choose a part' })}${field('Quantity', 'quantity', { attrs: 'inputmode="decimal"' })}${select('Original controlled issue','sourceIssue',sourceIssues.map(row=>({value:row.move_id,label:`${row.number} · ${row.bin} · ${row.lot} · ${row.serial}`})),'',{required:false,blank:'Untracked shelf issue'})}${select('Return condition', 'condition', [{ value: 'usable', label: 'Unused, usable' }, { value: 'damaged', label: 'Damaged, quarantine' }], 'usable')}${field('Return reason', 'reason', { required: false, hint: 'Required for damaged returns. Quarantined parts cannot be issued.' })}`, 'Return part', { secondary: true }) : ''}</div>` : ''}${reserveForms}`, { id: 'parts' })

  const evidence = card('Inspection evidence', h`${w.evidence.length ? h`<ul class="gk-files">${w.evidence.map(file => h`<li><a href="/app/evidence/${file.id}">${file.filename}</a>${file.certificate ? h` ${tag('Certificate')}` : ''}${evidenceExtras(file, actor.zone)}<span class="gk-sub">${file.item !== null ? `Step ${file.item + 1} · ` : ''}${Math.ceil(file.size / 1024)} KB · ${file.uploaded_by}</span>${details([['SHA-256', file.sha256], ['Type', file.media_type]])}</li>`)}</ul>` : h`<p class="gk-muted">No photos or documents attached.</p>`}
    ${recording ? post('workorder.evidence', h`${fileField('Photo or document', 'file', { required: true, accept: '.png,.jpg,.jpeg,.webp,.heic,.pdf', hint: 'PNG, JPEG, WebP, HEIC or PDF, up to 1.5 MB. A photo step takes an image.' })}${w.items.length ? select('For checklist step', 'item', w.items.map(item => ({ value: String(item.index), label: `${item.index + 1}. ${item.text}${item.kind === 'photo' ? ' (photo required)' : ''}` })), w.items.find(item => item.kind === 'photo' && item.applies && !item.photos)?.index.toString() ?? '', { required: false, blank: 'The whole work order' }) : ''}${evidenceFields(actor)}${w.calibration ? checkbox('This is the calibration certificate', 'certificate', !w.calibration.certificate) : ''}`, 'Attach evidence', { multipart: true, secondary: true }) : ''}${recording ? annotateForm(w, post) : ''}`, { id: 'evidence' })
  // FIELD-005: signatures bound to the work's version.
  const signatures = signaturesCard(w, actor, post, recording)
  // ASSET-008 / ASSET-010: the tools this work needs, which one was used, and a calibration's grace window.
  const toolsCard = w.tools.length || w.calibration ? card(w.calibration ? 'Calibration' : 'Tools', h`${w.calibration ? h`<p class="gk-sub">Due ${showDate(w.due_date)}, overdue after ${showDate(w.calibration.overdue_after)}. ${w.calibration.certificate ? `Certificate: ${w.calibration.certificate.filename}` : 'Attach the certificate under Inspection evidence.'}</p>` : ''}
    ${w.tools.length ? h`<ul class="gk-plain-list">${w.tools.map(tool => h`<li>${tool.name}<span class="gk-sub">${tool.identifier ? `Used ${tool.identifier} · ${tool.recorded_by}` : 'Not recorded yet'}</span></li>`)}</ul>` : ''}
    ${recording && w.tools.length ? post('workorder.tool', h`${select('Tool', 'tool', w.tools.map(tool => ({ value: String(tool.position), label: tool.name })), String(w.tools.find(tool => !tool.identifier)?.position ?? 0))}${field('Which one (serial or asset number)', 'identifier')}`, 'Record tool used', { secondary: true }) : ''}`, { id: 'tools' }) : ''

  // ASSET-004: the catalog's active codes, offered on a finding (and a stop's failure mode) when the catalog has any.
  const catalog = (await codeList(env)).filter(code => !code.retired)
  const failureModes = catalog.filter(code => code.kind === 'failure_mode').map(code => ({ value: code.key, label: code.label }))
  const open = w.downtime.find(row => !row.ended_on)
  // REPORT-003: each stop is a planned stop or a failure, with the failure mode that counts and whether it was reclassified.
  // REPORT-002: degraded operation (still running at reduced output) is not a stop.
  const stopKind = (row: (typeof w.downtime)[number]) => row.planned ? 'Planned stop' : row.degraded ? `Degraded operation${row.failure_mode ? `: ${row.failure_mode.label}` : ''}` : `Failure${row.failure_mode ? `: ${row.failure_mode.label}` : ', not classified'}`
  const downtime = card('Downtime', h`${w.downtime.length ? h`<dl class="gk-pairs">${w.downtime.map(row => h`<div><dt>Start</dt><dd>${showLocal(row.started_on)}</dd></div><div><dt>End</dt><dd>${row.ended_on ? showLocal(row.ended_on) : tag(row.degraded ? 'Degraded' : 'Down')}</dd></div>${row.minutes !== null ? h`<div class="gk-total"><dt>Total downtime</dt><dd>${row.minutes} minutes</dd></div>` : ''}<div><dt>Reason</dt><dd>${row.reason}</dd></div><div><dt>Counts as</dt><dd>${stopKind(row)}${row.reclassified ? h`<span class="gk-sub">Reclassified: ${row.classifications.at(-1)!.reason}</span>` : ''}</dd></div>`)}</dl>` : h`<p class="gk-muted">${w.asset_id ? 'The asset has not been taken down for this work.' : 'Work at a location has no asset to take down.'}</p>`}
    ${recording && !open && w.asset_id ? post('downtime.start', h`${field('Went down at', 'startedOn', { type: 'datetime-local', value: localNow(actor.zone) })}${field('Reason', 'reason')}${checkbox('Planned stop (not a failure)', 'planned')}${checkbox('Degraded: still running at reduced output', 'degraded')}${failureModes.length ? select('Failure mode', 'failureMode', failureModes, '', { required: false, blank: 'Not classified' }) : ''}`, 'Record asset down', { secondary: true }) : ''}
    ${recording && open ? post('downtime.end', field('Back in service at', 'endedOn', { type: 'datetime-local', value: localNow(actor.zone) }), 'Record back in service', { secondary: true }) : ''}`, { id: 'downtime' })

  const codeFields = h`<div class="gk-grid">${(['failure_mode', 'cause', 'remedy', 'risk'] as const).map(kind => ({ kind, options: catalog.filter(code => code.kind === kind) })).filter(({ options }) => options.length).map(({ kind, options }) => select(CODE_KIND[kind], kind === 'failure_mode' ? 'failureMode' : kind, options.map(code => ({ value: code.key, label: code.label })), '', { required: false, blank: 'Not classified' }))}</div>`
  const findings = card('Corrective findings', h`${w.findings.length ? h`<ul class="gk-findings">${w.findings.map(row => h`<li>${tag(row.severity === 'high' ? 'High' : row.severity === 'medium' ? 'Medium' : 'Low')} ${row.item !== null ? h`<b>Step ${row.item + 1}:</b> ` : ''}${row.text}${row.codes ? h`<span class="gk-sub">${row.codes}</span>` : ''}${row.follow_up_id ? h`<span class="gk-sub">${row.rule_id ? 'Correction' : 'Follow-up'} <a href="/app/work/${row.follow_up_id}">${woNumber(row.follow_up_number)}</a> · ${STATUS[row.follow_up_status]}${row.obligation ? ` · ${OBLIGATION[row.obligation]}` : ''}</span>` : ''}</li>`)}</ul>` : h`<p class="gk-muted">No findings recorded.</p>`}
    ${recording ? post('finding.record', h`${w.items.length ? select('Checklist step', 'item', w.items.map(item => ({ value: String(item.index), label: `${item.index + 1}. ${item.text}${item.result && item.result.outcome !== 'pass' ? ` (${OUTCOME[item.result.outcome]})` : ''}` })), w.items.find(item => item.result && item.result.outcome !== 'pass' && !w.findings.some(row => row.item === item.index))?.index.toString() ?? '', { required: false, blank: 'The whole work order' }) : ''}${area('What was found and what was done', 'text')}${select('Severity', 'severity', [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }], 'low')}${codeFields}${checkbox('Needs follow-up work (raises a corrective work order)', 'followUp')}${field('Follow-up due', 'followUpDue', { type: 'date', required: false, hint: 'Leave empty for tomorrow (high) or a week from today.' })}`, 'Record finding', { secondary: true }) : ''}`, { id: 'findings' })

  // PM-004: the failure this correction answers, and its assignee's acknowledgement.
  const origin = w.origin ? card('Failed step to correct', h`<p>${w.origin.text}</p><p class="gk-sub">From <a href="/app/work/${w.origin.work_order_id}">${woNumber(w.origin.number)}</a> · ${w.origin.severity} severity · rule ${w.origin.rule}</p>
    ${w.origin.readings.length ? h`<ul class="gk-files">${w.origin.readings.map(row => h`<li>${row.meter}: ${row.kind === 'condition' ? condition(row.value) : amount(row.value, row.unit)}<span class="gk-sub">Taken ${showLocal(row.taken_on)}</span></li>`)}</ul>` : ''}
    ${w.origin.evidence.length ? h`<ul class="gk-files">${w.origin.evidence.map(file => h`<li><a href="/app/evidence/${file.id}">${file.filename}</a>${details([['SHA-256', file.sha256]])}</li>`)}</ul>` : ''}
    ${w.acknowledged_at ? h`<p class="gk-sub">Acknowledged ${showInstant(w.acknowledged_at, actor.zone)}</p>` : working ? post('workorder.acknowledge', '', 'Acknowledge correction', { secondary: true }) : h`<p class="gk-sub">Not acknowledged yet</p>`}`, { id: 'origin' }) : ''
  const decisions = w.decisions.length ? card('Overdue decisions', h`<ul class="gk-findings">${w.decisions.map(row => h`<li>${row.plan === 'keep' ? `Kept with ${row.holder ?? 'the assignee'}` : row.plan === 'reassign' ? `Reassigned to ${row.to ?? 'someone else'}` : `Kept as is${row.holder ? `, with ${row.holder}` : ''}`}<span class="gk-sub">${row.decided_by ?? '—'} · ${showInstant(row.at, actor.zone)}</span></li>`)}</ul>`, { id: 'decisions' }) : ''
  const reviews = w.reviews.length ? card('Reviews', table(['Decision', 'By', 'Reason'], w.reviews.map(row => [tag(row.decision === 'approved' ? 'Approved' : 'Returned'), h`${row.reviewer}<span class="gk-sub">${showInstant(row.at, actor.zone)}</span>`, row.reason ?? '']), 'Reviews', { wrap: [2] }), { id: 'reviews' }) : ''

  // ASSET-008: a route stop that could not be done keeps its reason and stays open.
  const missCard = w.route_run_id && ['open', 'in_progress', 'returned'].includes(w.status) && (working || can(actor, 'work.assign')) ? card('Route stop', h`${w.missed_reason ? h`<p>Missed: ${w.missed_reason}</p><p class="gk-sub">This stop stays open, and its route run stays incomplete, until the work is done.</p>` : ''}${!w.missed_reason ? post('route.miss', area('Why this stop could not be done', 'reason'), 'Record missed stop', { secondary: true }) : ''}`, { id: 'route-stop' }) : ''
  const lead = can(actor, 'work.assign')
  // PLAN-001: custom field values (set by whoever records the work, or a lead) and the waiting status.
  const settable = (recording || lead) && ['open', 'in_progress', 'returned'].includes(w.status)
  const fieldsCard = w.fields.length ? card('Fields', h`<dl class="gk-pairs">${w.fields.map(f => h`<div><dt>${f.label}${f.required ? ' (required)' : ''}</dt><dd>${f.value ?? h`<span class="gk-muted">No value</span>`}${f.setBy ? h`<span class="gk-sub">${f.setBy}</span>` : ''}</dd></div>`)}</dl>
    ${settable ? w.fields.filter(f => !f.retired).map(f => post('workorder.field', h`${hidden('field', f.id)}${f.options ? select(f.label, 'value', f.options.map(option => ({ value: option, label: option })), f.value ?? '', { required: false, blank: 'No value' }) : field(f.label, 'value', { value: f.value ?? '', required: false, attrs: f.kind === 'number' ? 'inputmode="decimal"' : '' })}`, `Save ${f.label}`, { secondary: true })) : ''}`, { id: 'fields' }) : ''
  const statuses = settable ? (await statusList(env)).filter(row => !row.retired_at) : []
  const waitingCard = w.waiting_label || statuses.length ? card('Waiting', h`<p>${w.waiting_label ?? h`<span class="gk-muted">Not waiting</span>`}</p>${statuses.length ? post('workorder.waiting', select('Waiting status', 'status', statuses.map(row => ({ value: row.id, label: row.label })), w.waiting_status ?? '', { required: false, blank: 'Not waiting' }), 'Set waiting status', { secondary: true }) : ''}`, { id: 'waiting' }) : ''
  const siblings = lead && w.kind === 'corrective' && ['open', 'in_progress', 'returned'].includes(w.status)
    ? (await workList(env, actor, new URL('https://gasket.invalid/?state=open'))).filter(row => row.asset_id === w.asset_id && row.location === w.location && row.id !== w.id) : []
  const assign = lead && ['open', 'in_progress', 'returned'].includes(w.status)
    ? card('Assignment', h`${post('workorder.assign', h`<div class="gk-grid">${select('Assign to', 'assignee', (await assignable(env)).map(person => ({ value: person.id, label: person.name })), w.assignee_id ?? '', { blank: 'Choose a person' })}${select('Team', 'team', (await teamList(env)).map(team => ({ value: team.id, label: `${team.name} (${team.trade})` })), w.team_id ?? '', { required: false, blank: 'No team' })}${field('Trade', 'trade', { required: false, value: w.trade ?? '', hint: 'Leave empty for the team\'s trade.' })}${field('Shift', 'shift', { required: false, value: w.shift ?? '', hint: 'For example Day or Night.' })}</div>${area('Handoff note', 'note', { required: false, hint: 'What the next person needs to know.' })}`, 'Assign', { secondary: true })}
      ${post('workorder.cancel', field('Reason to cancel', 'reason'), 'Cancel work order', { secondary: true })}
      ${siblings.length ? post('workorder.merge', h`${select('Duplicate of', 'into', siblings.map(row => ({ value: row.id, label: `${woNumber(row.number)} ${row.title}` })), '', { blank: 'Choose the work order that carries on' })}${field('Reason to merge', 'reason')}`, 'Merge as duplicate', { secondary: true }) : ''}`, { id: 'assignment' }) : ''
  // PLAN-007: what was cancelled, rescheduled, reopened or merged, and why; cancelled or reviewed repairs can be reopened.
  const verb: Record<string, string> = { 'workorder.cancel': 'Cancelled', 'workorder.reschedule': 'Rescheduled', 'workorder.reopen': 'Reopened', 'workorder.merge': 'Merged as a duplicate', 'workorder.merged': 'Took in a duplicate' }
  const equivalent = await nestedOne(env, 'SELECT n.*,w.number AS higher_number FROM gk_nested_satisfaction n JOIN gk_work_orders w ON w.id=n.higher_work WHERE n.lower_work=?', w.id)
  const reopenable = !equivalent && lead && !w.merged_into && (w.status === 'cancelled' || (w.status === 'closed' && w.kind === 'corrective'))
  const control = w.control.length || w.merged.length || w.merged_into || reopenable ? card('Changes to this work order', h`${w.merged_into ? h`<p>Merged into <a href="/app/work/${w.merged_into}">${woNumber(w.merged_into_number)}</a>; its records stay here.</p>` : ''}
    ${w.merged.length ? h`<p>Duplicates merged in: ${w.merged.map((row, index) => h`${index ? ', ' : ''}<a href="/app/work/${row.id}">${woNumber(row.number)}</a>`)}</p>` : ''}
    ${w.control.length ? h`<ul class="gk-findings">${w.control.map(row => h`<li>${verb[row.action] ?? 'Changed'}${row.action === 'workorder.reschedule' ? ` to ${showDate(row.to)}` : ''}${row.reason ? `: ${row.reason}` : ''}<span class="gk-sub">${row.by ?? '—'} · ${showInstant(row.at, actor.zone)}</span></li>`)}</ul>` : ''}
    ${reopenable ? post('workorder.reopen', field('Reason to reopen', 'reason'), 'Reopen work order', { secondary: true }) : ''}`, { id: 'changes' }) : ''

  let bar = h``
  if (working) bar = w.missing.length
    ? h`<p class="gk-bar-note">Before review: ${w.missing.join('; ')}.</p><button type="button" disabled>Submit for review</button>`
    : h`<p class="gk-bar-note">This work order is ready for review.</p><form method="post" action="/app/do/workorder.submit" class="gk-inline">${hidden('returnTo', back)}${ids}<button type="submit">Submit for review</button></form>`
  if (reviewing) bar = h`<p class="gk-bar-note">Reviewing records what was entered. It is not a safety sign-off.</p>
    <form method="post" action="/app/do/workorder.review" class="gk-inline gk-review">${hidden('returnTo', back)}${ids}${hidden('decision', 'return')}${field('Reason to return', 'reason')}<button type="submit" class="gk-secondary">Return for more work</button></form>
    <form method="post" action="/app/do/workorder.review" class="gk-inline">${hidden('returnTo', back)}${ids}${hidden('decision', 'approve')}<button type="submit">Approve and close</button></form>`

  const body = h`${backLink('/app', 'Work orders')}${band}
    ${actor.role !== 'agent' ? h`<p><a class="gk-button gk-secondary" href="/app/work/${w.id}/report.pdf">Download work PDF</a></p>` : ''}
    ${can(actor, 'work.assign') ? h`<details class="gk-details"><summary>Download several work PDFs</summary><form method="get" action="/app/work-reports.zip" class="gk-form">${field('Work order numbers', 'numbers', { value: String(w.number), hint: 'Comma-separated numbers, up to 20. For example: 1, 2, 3.' })}<button type="submit" class="gk-secondary">Download PDFs as ZIP</button></form></details>` : ''}
    <div class="gk-columns"><div class="gk-col-main">${await safetyCard(env,actor,w,back)}${origin}${(w.mine || w.collaborating) && can(actor,'work.do') && w.checklist_revision_id ? await printPackCard(env,actor,{id:w.id,version:w.version,canIssue:recording}) : ''}${requestSourcesCard(w.requestSources)}${task}${missCard}${toolsCard}${checklist}${readings}${timeEntries}${w.bom ? bomCard(w.bom, actor.zone) : ''}${parts}${laborCard(w.labor, actor, { id: w.id, back, recording })}${evidence}${signatures}${workDocumentsCard(w, lead && w.asset_id && ['open', 'in_progress', 'returned'].includes(w.status) ? await all(env, 'SELECT id, title, current_revision FROM gk_documents WHERE asset_id = ? ORDER BY kind, title', w.asset_id) : null, back)}${commentsCard(w.comments, actor, { field: 'workOrder', id: w.id }, back, await mentionable(env, actor))}</div><div class="gk-col-side">${decisions}${await dependencyCard(env,w,actor,back,url)}${crewCard(w, actor, back, (await assignable(env)).map(person => ({ id: person.id, name: person.name })))}${chaseCard(w, actor, back, (await assignable(env)).map(person => ({ id: person.id, name: person.name })))}${downtime}${lead && ['open', 'in_progress', 'returned', 'submitted'].includes(w.status) ? card('Priority', form('workorder.priority', back, h`${hidden('workOrder', w.id)}${select('Priority', 'priority', PRIORITIES.map(value => ({ value, label: PRIORITY_LABELS[value] })), w.priority)}${field('Reason', 'reason')}`, 'Change priority', { secondary: true }), { id: 'priority' }) : ''}${waitingCard}${fieldsCard}${costCard(w, actor, back)}${findings}${reviews}${assign}${control}
    ${details([['Work order id', w.id], ['Version', w.version], ['Schedule', w.schedule_title ?? '—'], ...(w.trigger ? [['Raised by reading', `${w.trigger.meter} ${w.trigger.value}${w.trigger.unit === 'condition' ? '' : ` ${w.trigger.unit}`}, taken ${showLocal(w.trigger.taken_on)}${w.trigger.provenance === 'feed' ? ` (feed: ${w.trigger.source})` : ''}`] as [string, unknown]] : []), ['Created', showInstant(w.created_at, actor.zone)]])}</div></div>`
  return page(env, `${woNumber(w.number)} ${w.asset_name}`, actor, h`${equivalent ? card('Satisfied by approved equivalent', h`<p>This occurrence was not performed separately. <a href="/app/work/${equivalent.higher_work}">${woNumber(equivalent.higher_number)}</a> supplies its approved evidence. <a href="/app/programs">Inspect the mapping and occurrence</a>.</p>`) : ''}${body}`, { url, bar: working || reviewing ? bar : undefined })
}
