// Schedules and the checklists they use.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { assetList } from '../assets'
import { checklistDetail, checklistList } from '../checklists'
import { lineOf, stepSummary } from '../steps'
import { routeList } from '../routes'
import { all, type Row } from '../core'
import { showDate, showInstant } from '../dates'
import { showNumber } from '../quantity'
import { closures } from '../calendar'
import { scheduleList } from '../schedules'
import { assignable, leadDays } from '../site'
import { amount, area, backLink, card, field, form, h, hidden, raw, select, table, tag } from './html'
import { schedulerView } from '../scheduler'
import { changesCard, exceptionsCard, pending, policyFields, policyText, schedulerCard } from './calendar'
import { calibrationList } from '../calibration'
import { calibrationCard } from './calibration'
import { page } from './shell'

const STEP_HINT = 'One step per line. A plain line is marked pass, needs attention or fail. Add parts after |: number °C -25..-18 (unit, then inclusive limits), text, options clear, cloudy | fail on cloudy, photo, when step 1 is fail, meter Cabinet temperature (keeps the number as that meter reading).'

export async function schedulesPage(env: Bindings, actor: Actor, url: URL) {
  const [schedules, checklists, closed] = await Promise.all([scheduleList(env, actor), checklistList(env, actor), closures(env)])
  const manage = can(actor, 'register.manage')
  const trigger = (row: any) => row.trigger_when === 'is' ? `when ${row.meter} is ${row.trigger_value.replace(/,/g, ' or ')}` : `when ${row.meter} is ${row.trigger_when} ${amount(row.trigger_value, row.meter_unit)}${row.reset_value !== row.trigger_value ? ` (re-arms at ${amount(row.reset_value, row.meter_unit)})` : ''}`
  const cadence = (row: any) => [row.every_days ? `every ${row.every_days} days` : '', row.every_units ? `every ${amount(row.every_units, row.meter_unit)} of ${row.meter}` : '', row.trigger_when ? `${trigger(row)}${row.sustain_minutes ? ` for ${row.sustain_minutes} min` : ''}` : ''].filter(Boolean).join(row.combine === 'both' ? ' and ' : ' or ')
  const list = schedules.length ? table(['Schedule', 'Asset', 'Cadence', 'Next due', 'Default maintainer', 'Open work'], schedules.map(row => [
    h`${row.title}<span class="gk-sub">${row.checklist}${row.active ? '' : ' · inactive'}</span>`, row.asset_id ? h`<a href="/app/assets/${row.asset_id}">${row.asset_name}</a><span class="gk-sub">${row.asset_tag}</span>` : h`${row.location}<span class="gk-sub">Location, no asset</span>`, h`${cadence(row)}${row.every_days ? h`<span class="gk-sub">${policyText(row)}</span>` : ''}`,
    h`${row.next_due_date ? showDate(row.next_due_date) : ''}${row.next_due_meter ? h`<span class="gk-sub">at ${amount(row.next_due_meter, row.meter_unit)} (now ${row.meter_now === null || row.meter_now === undefined ? '—' : showNumber(row.meter_now)})</span>` : ''}`,
    row.assignee ?? '—', h`${row.open_work ? h`<a href="/app/work/${row.open_work}">Open</a>` : row.overdue ? h`${tag('Overdue')}${can(actor, 'work.assign') && !row.exceptions.some((item: any) => !item.decision) ? form('schedule.skip', '/app/schedules', h`${hidden('schedule', row.id)}${field('Reason to skip this occurrence', 'reason', { hint: 'An owner or supervisor approves the skip; the missed occurrence stays on record.' })}`, 'Ask to skip', { secondary: true }) : ''}` : h`<span class="gk-muted">None</span>`}${pending(row, actor)}`]), 'Schedules', { wrap: [0, 2, 5] })
    : h`<div class="gk-empty"><img src="/brand/assets/clipboard.svg" alt="" width="200" height="160"><h2>No schedules yet</h2><p>${manage ? 'Write a checklist, then schedule it on an asset.' : 'A maintenance lead schedules preventive work.'}</p></div>`
  const generate = can(actor, 'work.assign') ? form('workorders.generate', '/app', '', 'Create due work orders', { secondary: true, layout: 'gk-inline' }) : ''
  let create = h``
  if (manage) {
    const assets = (await assetList(env, actor)).filter(asset => asset.status !== 'retired')
    const meters = await all(env, "SELECT m.id, m.name, m.unit, m.kind, a.name AS asset FROM gk_meters m JOIN gk_assets a ON a.id = m.asset_id WHERE a.retired_at IS NULL ORDER BY a.name, m.name")
    create = checklists.length && assets.length ? card('Schedule preventive work', form('schedule.create', '/app/schedules', h`<div class="gk-grid">
      ${select('Asset', 'asset', assets.map(asset => ({ value: asset.id, label: `${asset.tag} ${asset.name}` })), '', { required: false, blank: 'No asset: a location' })}${field('Or a location with no asset', 'location', { required: false, hint: 'For example Restroom 2 door. Calendar only: meters belong to assets.' })}
      ${select('Checklist', 'checklist', checklists.map(item => ({ value: item.id, label: `${item.name} (revision ${item.revision.number})` })), '', { blank: 'Choose a checklist' })}
      ${field('Title', 'title', { hint: 'For example Monthly compressor check.' })}
      ${select('Default maintainer', 'assignee', (await assignable(env)).map(person => ({ value: person.id, label: person.name })), '', { required: false, blank: 'Assign later' })}
      ${field('Every (days)', 'everyDays', { type: 'number', required: false, attrs: 'min="1" max="3660"' })}${field('First due', 'firstDue', { type: 'date', required: false, value: actor.today })}${policyFields()}
      ${select('Or by meter', 'meter', meters.map(meter => ({ value: meter.id, label: `${meter.asset}: ${meter.name} (${meter.kind === 'counter' ? meter.unit : meter.kind})` })), '', { required: false, blank: 'No meter' })}${field('Counter: every (units)', 'everyUnits', { required: false, attrs: 'inputmode="decimal"' })}
      ${select('Gauge: when the reading is', 'when', [{ value: 'above', label: 'Above the threshold' }, { value: 'below', label: 'Below the threshold' }], '', { required: false, blank: 'Not a gauge' })}${field('Gauge threshold', 'threshold', { required: false, attrs: 'inputmode="decimal"' })}${field('Gauge re-arms at', 'resetAt', { required: false, attrs: 'inputmode="decimal"', hint: 'After it fires, a reading back at or past this value re-arms it. Empty: the threshold.' })}
      ${field('Condition: when it is', 'conditions', { required: false, hint: 'For a condition meter: fair, poor or "fair, poor".' })}${field('Sustained for (minutes)', 'sustainMinutes', { type: 'number', required: false, value: '0', attrs: 'min="0" max="10080"' })}
      ${select('With a calendar and a meter', 'combine', [{ value: 'first', label: 'Due on whichever comes first' }, { value: 'both', label: 'Due only when both are due' }], 'first')}
      </div><p class="gk-hint">Give days, a meter, or both. Work orders are created ${await leadDays(env)} days ahead of their due date (the site's lead time), or as soon as a good reading reaches the counter value or fires the trigger.</p>`, 'Create schedule'), { id: 'schedule' })
      : card('Schedule preventive work', h`<p class="gk-muted">${assets.length ? 'Write a checklist first.' : 'Register an asset first.'}</p>`)
  }
  const checklistCard = card('Checklists', h`${checklists.length ? table(['Checklist', 'Revision', 'Items'], checklists.map(item => [h`<a href="/app/checklists/${item.id}">${item.name}</a>`, `Revision ${item.revision.number}`, String(item.revision.items.length)]), 'Checklists', { wrap: [0] }) : h`<p class="gk-muted">No checklists yet.</p>`}
    ${manage ? form('checklist.create', '/app/checklists/{id}', h`${field('Checklist name', 'name')}${area('Steps, one per line', 'items', { hint: STEP_HINT })}`, 'Write checklist', { secondary: true }) : ''}`, { id: 'checklists' })
  // ASSET-008: inspection routes across assets, their runs and each stop's state.
  const routes = await routeList(env), people = can(actor, 'work.assign') ? await assignable(env) : [], assets = manage ? (await assetList(env, actor)).filter(asset => asset.status !== 'retired') : []
  const STOP: Record<string, string> = { done: 'Done', open: 'Open', missed: 'Missed', cancelled: 'Cancelled' }
  const routeCard = card('Inspection routes', h`${routes.length ? routes.map(route => h`<h3>${route.name}</h3>${route.every_days ? h`<p class="gk-sub">Every ${route.every_days} days · next due ${showDate(route.next_due_date)}${route.assignee ? ` · ${route.assignee}` : ''}</p>` : ''}${route.tools.length ? h`<p class="gk-sub">Tools: ${route.tools.join(', ')}</p>` : ''}<ol class="gk-plain-list">${route.stops.map((stop: Row) => h`<li>${stop.asset_tag} ${stop.asset_name}<span class="gk-sub">${stop.checklist_name}</span></li>`)}</ol>
      ${route.runs.map((run: Row) => h`<p class="gk-sub">Run due ${showDate(run.due_date)}: ${run.signed_at ? `signed off by ${run.signed_by}` : run.complete ? 'every stop done' : 'incomplete'}</p><ul class="gk-files">${run.stops.map((stop: Row) => h`<li><a href="/app/work/${stop.id}">Stop ${stop.route_position + 1}: ${stop.asset_name}</a> ${tag(STOP[stop.state])}${stop.missed_reason ? h`<span class="gk-sub">Missed: ${stop.missed_reason}</span>` : ''}${stop.follow_ups ? h`<span class="gk-sub">${stop.follow_ups} follow-up${stop.follow_ups === 1 ? '' : 's'}</span>` : ''}</li>`)}</ul>
        ${can(actor, 'work.review') && run.complete && !run.signed_at ? form('route.sign', '/app/schedules', hidden('run', run.id), 'Sign off run', { secondary: true }) : ''}`)}`) : h`<p class="gk-muted">No inspection routes yet.</p>`}
    ${manage && assets.length && checklists.length ? form('route.create', '/app/schedules', h`${field('Route name', 'name')}${[0, 1, 2, 3, 4].map(index => h`<div class="gk-grid">${select(`Stop ${index + 1} asset`, 'asset', assets.map(asset => ({ value: asset.id, label: `${asset.tag} ${asset.name}` })), '', { required: index < 2, blank: 'No stop' })}${select(`Stop ${index + 1} checklist`, 'checklist', checklists.map(item => ({ value: item.id, label: item.name })), '', { required: index < 2, blank: 'No stop' })}</div>`)}
      <div class="gk-grid">${field('Repeat every (days)', 'everyDays', { type: 'number', required: false, attrs: 'min="1" max="3660"', hint: 'Empty: issue it by hand.' })}${field('First due', 'firstDue', { type: 'date', required: false, value: actor.today })}${select('Default maintainer', 'assignee', people.map(person => ({ value: person.id, label: person.name })), '', { required: false, blank: 'Leave for a lead' })}${field('Required tool', 'tool', { required: false, hint: 'Listed on every stop; the person doing it records which one they used.' })}</div>`, 'Write route', { secondary: true }) : ''}
    ${can(actor, 'work.assign') && routes.length ? form('route.issue', '/app/schedules', h`${select('Route', 'route', routes.map(route => ({ value: route.id, label: route.name })), '', { blank: 'Choose a route' })}${field('Due', 'due', { type: 'date' })}${select('Assign to', 'assignee', people.map(person => ({ value: person.id, label: person.name })), '', { required: false, blank: 'Leave for a lead' })}`, 'Issue route', { secondary: true }) : ''}`, { id: 'routes' })
  const calibrations = calibrationCard(await calibrationList(env, actor), actor, { assets, checklists, people })
  return page(env, 'Schedules', actor, h`<div class="gk-head"><div><h1>Schedules</h1><p class="gk-lede">Preventive work by calendar or meter, and the checklists it follows.</p></div>${generate}</div>${list}<p><a href="/app/programs">Nested preventive programs</a></p><div class="gk-columns"><div class="gk-col-main">${create}${exceptionsCard(schedules)}${changesCard(schedules, closed, actor)}</div><div class="gk-col-side">${can(actor, 'board.read') ? schedulerCard(await schedulerView(env, actor), actor) : ''}${checklistCard}${routeCard}${calibrations}</div></div>`, { url })
}

export async function checklistPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const checklist = await checklistDetail(env, actor, id)
  const latest = checklist.revisions[0]
  const revise = can(actor, 'register.manage') ? card('Publish a new revision', form('checklist.revise', `/app/checklists/${checklist.id}`, h`${hidden('checklist', checklist.id)}${area('Steps, one per line', 'items', { value: latest.items.map(item => lineOf(item, latest.items)).join('\n'), hint: `${STEP_HINT} A step keeps its identity when its label stays the same, or with key and its earlier key.` })}${field('What changed', 'note')}`, 'Publish revision', { secondary: true }), { id: 'revise' }) : ''
  // PM-004: the lead-approved rule that turns a failed step into a correction.
  const rule = checklist.rules[0]
  const ruleText = (row: typeof rule) => row.active ? `${row.outcomes.map(outcome => outcome === 'fail' ? 'Fail' : 'Needs attention').join(' or ')} raises a ${row.severity}-severity correction due in ${row.due_days} day${row.due_days === 1 ? '' : 's'}` : 'Off: failed steps need a finding recorded by hand'
  const ruleCard = card('Failed-step rule', h`${rule ? h`<p>${ruleText(rule)}.</p><p class="gk-sub">Rule ${rule.number} · ${rule.approved_by ?? '—'} · ${showInstant(rule.approved_at, actor.zone)}</p>` : h`<p class="gk-muted">No rule: failed steps need a finding recorded by hand.</p>`}
    ${can(actor, 'register.manage') ? form('rule.set', `/app/checklists/${checklist.id}`, h`${hidden('checklist', checklist.id)}<fieldset><legend>Raise a correction on</legend><label class="gk-check"><input type="checkbox" name="outcome" value="fail"${!rule || rule.outcomes.includes('fail') ? raw(' checked') : ''}> Fail</label><label class="gk-check"><input type="checkbox" name="outcome" value="attention"${rule?.outcomes.includes('attention') ? raw(' checked') : ''}> Needs attention</label></fieldset>
      ${select('Severity', 'severity', [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }], rule?.severity ?? 'medium')}${field('Due within (days)', 'dueDays', { type: 'number', value: String(rule?.due_days ?? 3), attrs: 'min="0" max="365"' })}`, 'Approve rule', { secondary: true }) : ''}`, { id: 'rule' })
  const revisions = checklist.revisions.map(revision => card(`Revision ${revision.number}`, h`<ol class="gk-plain-list">${revision.items.map(item => h`<li>${item.text}<span class="gk-sub">${stepSummary(item, revision.items)}${item.key ? ` · key ${item.key}` : ''}</span></li>`)}</ol><p class="gk-sub">${revision.note ?? ''} · ${revision.publishedBy ?? ''} · ${showInstant(revision.publishedAt, actor.zone)}</p>`, { extra: revision === latest ? tag('Current') : '' }))
  return page(env, checklist.name, actor, h`${backLink('/app/schedules', 'Schedules')}<h1>${checklist.name}</h1><p class="gk-lede">Work orders keep the revision they were created with.</p><div class="gk-columns"><div class="gk-col-main">${revisions}</div><div class="gk-col-side">${ruleCard}${revise}</div></div>`, { url })
}
