// The work list (/app) and the work-order page, built from the picked 12ui
// design: asset header band, checklist, readings and parts in the main column,
// downtime and findings beside them, one primary action in the bottom bar.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { localNow, showDate, showInstant, showLocal } from '../dates'
import { partList } from '../parts'
import { assignable } from '../site'
import { workList, workOrderDetail } from '../work'
import { ICON, OUTCOME, STATUS, amount, assetMark, area, backLink, band as headerBand, card, checkbox, details, drawingFor, field, fileField, form, h, hidden, page, raw, select, table, tag, woNumber } from './html'

const condition = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const dueTag = (due: string, status: string, today: string) => !['closed', 'cancelled', 'submitted'].includes(status) && due < today ? tag('Overdue') : ''

export async function workPage(env: Bindings, actor: Actor, url: URL) {
  const mine = url.searchParams.get('mine') === '1', state = url.searchParams.get('state') ?? 'open'
  const rows = await workList(env, actor, url)
  const assigner = can(actor, 'work.assign')
  const tabs: [string, string, boolean][] = [['/app', 'All open', !mine && state === 'open'], ['/app?mine=1', 'Assigned to me', mine], ['/app?state=closed', 'Closed', state === 'closed']]
  const filters = h`<nav class="gk-tabs" aria-label="Work filters">${tabs.map(([href, label, on]) => h`<a href="${href}"${on ? raw(' aria-current="page"') : ''}>${label}</a>`)}</nav>`
  const empty = h`<div class="gk-empty"><img src="/brand/assets/clipboard.svg" alt="" width="200" height="160"><h2>${state === 'closed' ? 'No closed work orders yet' : mine ? 'Nothing is assigned to you' : 'No open work orders'}</h2><p>${assigner ? 'Work orders appear here when a schedule falls due or when you raise corrective work on an asset.' : 'Work assigned to you appears here.'}</p>${assigner && state !== 'closed' ? h`<p><a class="gk-button gk-secondary" href="/app/schedules">Go to schedules</a></p>` : ''}</div>`
  const list = rows.length ? table(['Work order', 'Asset', 'Due', 'Assigned to', 'Status'], rows.map(row => [
    h`<a class="gk-wo-link" href="/app/work/${row.id}">${woNumber(row.number)}<span class="gk-title">${row.title}</span></a>`,
    h`<span class="gk-with-art">${assetMark({ name: row.asset_name, category: row.asset_category })}<span>${row.asset_name}<span class="gk-sub">${row.asset_tag} · ${row.asset_location}</span></span></span>`,
    h`<span class="gk-with-icon">${ICON.calendar}<span>${showDate(row.due_date)}${dueTag(row.due_date, row.status, actor.today)}</span></span>`,
    row.assignee ? h`<span class="gk-with-icon">${ICON.person}<span>${row.assignee}</span></span>` : h`<span class="gk-muted">Not assigned</span>`,
    tag(STATUS[row.status]),
  ]), 'Work orders') : empty
  const generate = assigner && state === 'open' ? form('workorders.generate', '/app', '', 'Create due work orders', { secondary: true, layout: 'gk-inline' }) : ''
  return page('Work', actor, h`<div class="gk-head"><div><h1>Work</h1><p class="gk-lede">Preventive and corrective work on the site's equipment.</p></div>${generate}</div>${filters}${list}`, { url })
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
    art: drawingFor({ name: w.asset_name, category: w.asset_category }) ?? 'pump' })}`
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
    <div class="gk-columns"><div class="gk-col-main">${task}${checklist}${readings}${parts}${evidence}</div><div class="gk-col-side">${downtime}${findings}${reviews}${assign}
    ${details([['Work order id', w.id], ['Version', w.version], ['Schedule', w.schedule_title ?? '—'], ['Created', showInstant(w.created_at, actor.zone)]])}</div></div>`
  return page(`${woNumber(w.number)} ${w.asset_name}`, actor, body, { url, bar: working || reviewing ? bar : undefined })
}
