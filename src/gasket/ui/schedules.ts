// Schedules and the checklists they use.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { assetList } from '../assets'
import { checklistDetail, checklistList } from '../checklists'
import { all } from '../core'
import { showDate, showInstant } from '../dates'
import { showNumber } from '../quantity'
import { HORIZON_DAYS, scheduleList } from '../schedules'
import { assignable } from '../site'
import { amount, area, backLink, card, field, form, h, hidden, raw, select, table, tag } from './html'
import { page } from './shell'

export async function schedulesPage(env: Bindings, actor: Actor, url: URL) {
  const [schedules, checklists] = await Promise.all([scheduleList(env, actor), checklistList(env, actor)])
  const manage = can(actor, 'register.manage')
  const cadence = (row: any) => [row.every_days ? `every ${row.every_days} days` : '', row.every_units ? `every ${amount(row.every_units, row.meter_unit)} of ${row.meter}` : ''].filter(Boolean).join(' or ')
  const list = schedules.length ? table(['Schedule', 'Asset', 'Cadence', 'Next due', 'Default maintainer', 'Open work'], schedules.map(row => [
    h`${row.title}<span class="gk-sub">${row.checklist}${row.active ? '' : ' · inactive'}</span>`, h`<a href="/app/assets/${row.asset_id}">${row.asset_name}</a><span class="gk-sub">${row.asset_tag}</span>`, cadence(row),
    h`${row.next_due_date ? showDate(row.next_due_date) : ''}${row.next_due_meter ? h`<span class="gk-sub">at ${amount(row.next_due_meter, row.meter_unit)} (now ${row.meter_now === null || row.meter_now === undefined ? '—' : showNumber(row.meter_now)})</span>` : ''}`,
    row.assignee ?? '—', row.open_work ? h`<a href="/app/work/${row.open_work}">Open</a>` : row.overdue ? h`${tag('Overdue')}${can(actor, 'work.assign') ? form('schedule.skip', '/app/schedules', h`${hidden('schedule', row.id)}${field('Reason to skip this occurrence', 'reason')}`, 'Skip occurrence', { secondary: true }) : ''}` : h`<span class="gk-muted">None</span>`]), 'Schedules', { wrap: [0, 2, 5] })
    : h`<div class="gk-empty"><img src="/brand/assets/clipboard.svg" alt="" width="200" height="160"><h2>No schedules yet</h2><p>${manage ? 'Write a checklist, then schedule it on an asset.' : 'A maintenance lead schedules preventive work.'}</p></div>`
  const generate = can(actor, 'work.assign') ? form('workorders.generate', '/app', '', 'Create due work orders', { secondary: true, layout: 'gk-inline' }) : ''
  let create = h``
  if (manage) {
    const assets = (await assetList(env, actor)).filter(asset => asset.status !== 'retired')
    const meters = await all(env, "SELECT m.id, m.name, m.unit, a.name AS asset FROM gk_meters m JOIN gk_assets a ON a.id = m.asset_id WHERE m.kind = 'counter' AND a.retired_at IS NULL ORDER BY a.name, m.name")
    create = checklists.length && assets.length ? card('Schedule preventive work', form('schedule.create', '/app/schedules', h`<div class="gk-grid">
      ${select('Asset', 'asset', assets.map(asset => ({ value: asset.id, label: `${asset.tag} ${asset.name}` })), '', { blank: 'Choose an asset' })}
      ${select('Checklist', 'checklist', checklists.map(item => ({ value: item.id, label: `${item.name} (revision ${item.revision.number})` })), '', { blank: 'Choose a checklist' })}
      ${field('Title', 'title', { hint: 'For example Monthly compressor check.' })}
      ${select('Default maintainer', 'assignee', (await assignable(env)).map(person => ({ value: person.id, label: person.name })), '', { required: false, blank: 'Assign later' })}
      ${field('Every (days)', 'everyDays', { type: 'number', required: false, attrs: 'min="1" max="3660"' })}${field('First due', 'firstDue', { type: 'date', required: false, value: actor.today })}
      ${select('Or by counter meter', 'meter', meters.map(meter => ({ value: meter.id, label: `${meter.asset}: ${meter.name} (${meter.unit})` })), '', { required: false, blank: 'No meter' })}${field('Every (meter units)', 'everyUnits', { required: false, attrs: 'inputmode="decimal"' })}
      </div><p class="gk-hint">Give days, a counter meter, or both. Work orders are created ${HORIZON_DAYS} days ahead of their due date, or when the meter reaches its due value.</p>`, 'Create schedule'), { id: 'schedule' })
      : card('Schedule preventive work', h`<p class="gk-muted">${assets.length ? 'Write a checklist first.' : 'Register an asset first.'}</p>`)
  }
  const checklistCard = card('Checklists', h`${checklists.length ? table(['Checklist', 'Revision', 'Items'], checklists.map(item => [h`<a href="/app/checklists/${item.id}">${item.name}</a>`, `Revision ${item.revision.number}`, String(item.revision.items.length)]), 'Checklists', { wrap: [0] }) : h`<p class="gk-muted">No checklists yet.</p>`}
    ${manage ? form('checklist.create', '/app/checklists/{id}', h`${field('Checklist name', 'name')}${area('Items, one per line', 'items', { hint: 'Each line is one check the maintainer marks pass, needs attention or fail.' })}`, 'Write checklist', { secondary: true }) : ''}`, { id: 'checklists' })
  return page(env, 'Schedules', actor, h`<div class="gk-head"><div><h1>Schedules</h1><p class="gk-lede">Preventive work by calendar or meter, and the checklists it follows.</p></div>${generate}</div>${list}<div class="gk-columns"><div class="gk-col-main">${create}</div><div class="gk-col-side">${checklistCard}</div></div>`, { url })
}

export async function checklistPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const checklist = await checklistDetail(env, actor, id)
  const latest = checklist.revisions[0]
  const revise = can(actor, 'register.manage') ? card('Publish a new revision', form('checklist.revise', `/app/checklists/${checklist.id}`, h`${hidden('checklist', checklist.id)}${area('Items, one per line', 'items', { value: latest.items.map(item => item.text).join('\n') })}${field('What changed', 'note')}`, 'Publish revision', { secondary: true }), { id: 'revise' }) : ''
  // PM-004: the lead-approved rule that turns a failed step into a correction.
  const rule = checklist.rules[0]
  const ruleText = (row: typeof rule) => row.active ? `${row.outcomes.map(outcome => outcome === 'fail' ? 'Fail' : 'Needs attention').join(' or ')} raises a ${row.severity}-severity correction due in ${row.due_days} day${row.due_days === 1 ? '' : 's'}` : 'Off: failed steps need a finding recorded by hand'
  const ruleCard = card('Failed-step rule', h`${rule ? h`<p>${ruleText(rule)}.</p><p class="gk-sub">Rule ${rule.number} · ${rule.approved_by ?? '—'} · ${showInstant(rule.approved_at, actor.zone)}</p>` : h`<p class="gk-muted">No rule: failed steps need a finding recorded by hand.</p>`}
    ${can(actor, 'register.manage') ? form('rule.set', `/app/checklists/${checklist.id}`, h`${hidden('checklist', checklist.id)}<fieldset><legend>Raise a correction on</legend><label class="gk-check"><input type="checkbox" name="outcome" value="fail"${!rule || rule.outcomes.includes('fail') ? raw(' checked') : ''}> Fail</label><label class="gk-check"><input type="checkbox" name="outcome" value="attention"${rule?.outcomes.includes('attention') ? raw(' checked') : ''}> Needs attention</label></fieldset>
      ${select('Severity', 'severity', [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }], rule?.severity ?? 'medium')}${field('Due within (days)', 'dueDays', { type: 'number', value: String(rule?.due_days ?? 3), attrs: 'min="0" max="365"' })}`, 'Approve rule', { secondary: true }) : ''}`, { id: 'rule' })
  const revisions = checklist.revisions.map(revision => card(`Revision ${revision.number}`, h`<ol class="gk-plain-list">${revision.items.map(item => h`<li>${item.text}</li>`)}</ol><p class="gk-sub">${revision.note ?? ''} · ${revision.publishedBy ?? ''} · ${showInstant(revision.publishedAt, actor.zone)}</p>`, { extra: revision === latest ? tag('Current') : '' }))
  return page(env, checklist.name, actor, h`${backLink('/app/schedules', 'Schedules')}<h1>${checklist.name}</h1><p class="gk-lede">Work orders keep the revision they were created with.</p><div class="gk-columns"><div class="gk-col-main">${revisions}</div><div class="gk-col-side">${ruleCard}${revise}</div></div>`, { url })
}
