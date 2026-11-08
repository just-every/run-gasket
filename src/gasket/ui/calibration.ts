// ASSET-010: calibration tasks on the Schedules page: each instrument's
// tolerances, grace window, tools, state and certificate versions, and the form
// a lead publishes one with.
import { can, type Actor } from '../actor'
import { showDate } from '../dates'
import type { Row } from '../core'
import { amount, card, field, form, h, select, tag } from './html'

const STATE: Record<string, string> = { in_date: 'In date', due: 'Due', overdue: 'Overdue' }
const RESULT: Record<string, string> = { in_tolerance: 'In tolerance', out_of_tolerance: 'Out of tolerance' }
const limits = (row: Row) => row.min && row.max ? `${amount(row.min, row.unit)} to ${amount(row.max, row.unit)}` : row.min ? `at least ${amount(row.min, row.unit)}` : `at most ${amount(row.max, row.unit)}`

export function calibrationCard(calibrations: Row[], actor: Actor, choices: { assets: Row[]; checklists: Row[]; people: Row[] }) {
  const list = calibrations.length ? calibrations.map(item => h`<h3>${item.asset_tag} ${item.asset_name} ${tag(STATE[item.state])}</h3>
    <p class="gk-sub">${item.procedure} (revision ${item.procedure_revision}) · every ${item.every_days} days · next due ${item.next_due_date ? showDate(item.next_due_date) : '—'}, overdue after ${item.overdue_after ? showDate(item.overdue_after) : '—'} (${item.grace_days ?? 0} days' grace)</p>
    <ul class="gk-plain-list">${item.tolerances.map((point: Row) => h`<li>${point.text}<span class="gk-sub">Tolerance ${limits(point)}</span></li>`)}</ul>
    ${item.tools.length ? h`<p class="gk-sub">Tools: ${item.tools.join(', ')}</p>` : ''}${item.open_work ? h`<p><a href="/app/work/${item.open_work}">Open calibration work</a></p>` : ''}
    ${item.certificates.length ? h`<ul class="gk-files">${item.certificates.map((cert: Row) => h`<li><a href="/app/evidence/${cert.evidence_id}">Certificate v${cert.version}: ${cert.filename}</a> ${tag(RESULT[cert.result])}<span class="gk-sub">Calibrated ${showDate(cert.calibrated_on)}${cert.on_time ? '' : ' (late)'} · procedure revision ${cert.procedure_revision} · <a href="/app/work/${cert.work_order_id}">work ${cert.work_number}</a> · approved by ${cert.approved_by}</span>${cert.tools.length ? h`<span class="gk-sub">Used: ${cert.tools.map((tool: Row) => `${tool.name} ${tool.identifier}`).join(', ')}</span>` : ''}</li>`)}</ul>` : h`<p class="gk-muted">No certificate yet.</p>`}`)
    : h`<p class="gk-muted">No calibration tasks yet.</p>`
  const publish = can(actor, 'register.manage') && choices.assets.length && choices.checklists.length ? form('calibration.create', '/app/schedules', h`
    ${select('Instrument', 'asset', choices.assets.map(asset => ({ value: asset.id, label: `${asset.tag} ${asset.name}` })), '', { blank: 'Choose an asset' })}
    ${select('Procedure (its number steps with limits are the tolerances)', 'checklist', choices.checklists.map(item => ({ value: item.id, label: item.name })), '', { blank: 'Choose a checklist' })}
    ${field('Title', 'title', { hint: 'For example Pressure gauge calibration.' })}
    ${field('Every (days)', 'everyDays', { type: 'number', attrs: 'min="1" max="3660"' })}${field('First due', 'firstDue', { type: 'date', value: actor.today })}
    ${field('Grace after due (days)', 'graceDays', { type: 'number', value: '0', attrs: 'min="0" max="90"', hint: 'Due until this many days after its due date, overdue after.' })}
    ${select('Default maintainer', 'assignee', choices.people.map(person => ({ value: person.id, label: person.name })), '', { required: false, blank: 'Assign later' })}
    ${field('Required tool', 'tool', { required: false, hint: 'For example Deadweight tester. The person doing it records which one they used.' })}${field('Another required tool', 'tool', { required: false })}`, 'Publish calibration task', { secondary: true }) : ''
  return card('Calibration', h`${list}${publish}`, { id: 'calibration' })
}
