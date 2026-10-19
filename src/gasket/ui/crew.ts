// PLAN-002: the Teams page (teams, trades, people and each team's open work)
// and the crew card on a work order: team, trade and shift, the accountable
// assignee's acknowledgement, collaborators, handoffs and who recorded what.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { teamList } from '../crew'
import { showDate, showInstant } from '../dates'
import { assignable } from '../site'
import { blockerFields } from './chasing'
import { STATUS, area, card, field, form, h, hidden, select, table, tag, woNumber } from './html'
import { page } from './shell'

export async function teamsPage(env: Bindings, actor: Actor, url: URL) {
  const teams = await teamList(env), lead = can(actor, 'work.assign')
  const people = lead ? (await assignable(env)).map(person => ({ value: person.id, label: person.name })) : []
  const cards = []
  for (const team of teams) {
    const work = team.work as any[]
    cards.push(card(`${team.name} · ${team.trade}`, h`<p>${team.members.length ? team.members.map((person: any, index: number) => h`${index ? ', ' : ''}${person.name}${person.status === 'active' ? '' : ' (access ended)'}`) : h`<span class="gk-muted">No one yet.</span>`}</p>
      ${work.length ? table(['Work order', 'Assigned', 'Shift', 'Due'], work.map(row => [h`<a href="/app/work/${row.id}">${woNumber(row.number)}</a> ${row.title}<span class="gk-sub">${STATUS[row.status]}</span>`, row.assignee ?? 'Not assigned', row.shift ?? '—', showDate(row.due_date)]), `${team.name} open work`, { wrap: [0] }) : h`<p class="gk-muted">No open work for this team.</p>`}
      ${lead ? h`<div class="gk-split">${form('team.member', '/app/teams', h`${hidden('team', team.id)}${select('Add a person', 'member', people.filter(person => !team.members.some((member: any) => member.id === person.value)), '', { blank: 'Choose a person' })}`, 'Add to team', { secondary: true })}
        ${team.members.length ? form('team.member', '/app/teams', h`${hidden('team', team.id)}${hidden('remove', 'yes')}${select('Remove a person', 'member', team.members.map((person: any) => ({ value: person.id, label: person.name })), '', { blank: 'Choose a person' })}`, 'Remove from team', { secondary: true }) : ''}</div>` : ''}`, { id: `team-${team.id}`, extra: h`<span class="gk-count">${work.length} open</span>` }))
  }
  const create = lead ? card('Name a team', form('team.create', '/app/teams', h`<div class="gk-grid">${field('Team name', 'name')}${field('Trade', 'trade', { hint: 'For example Electrical, Mechanical or HVAC.' })}</div>`, 'Name team', { secondary: true }), { id: 'new-team' }) : ''
  return page(env, 'Teams', actor, h`<h1>Teams</h1><p class="gk-lede">Work given to a team goes to one of its people, who is accountable for it; collaborators record alongside them.</p>
    <div class="gk-columns"><div class="gk-col-main">${cards.length ? cards : card('No teams yet', h`<p class="gk-muted">${lead ? 'Name a team with its trade, then add its people.' : 'A lead names teams and their people.'}</p>`)}</div><div class="gk-col-side">${create}</div></div>`, { url })
}

/** The crew on one work order, with the assignee's acknowledge and decline, and a lead's collaborator controls. */
export function crewCard(w: any, actor: Actor, back: string, people: { id: string; name: string }[]) {
  const crew = w.crew, open = ['open', 'in_progress', 'returned'].includes(w.status)
  const mine = open && w.assignee_id === actor.id && can(actor, 'work.do'), lead = open && can(actor, 'work.assign')
  const post = (action: string, fields: unknown, label: string) => form(action, back, h`${hidden('workOrder', w.id)}${hidden('version', w.version)}${fields}`, label, { secondary: true })
  const facts = [crew.team ? `Team ${crew.team.name}` : null, crew.trade ? `Trade ${crew.trade}` : null, crew.shift ? `${crew.shift} shift` : null].filter(Boolean)
  const acknowledged = w.acknowledged_at ? h`<p class="gk-sub">Acknowledged by ${w.assignee_name ?? 'the assignee'} ${showInstant(w.acknowledged_at, actor.zone)}</p>` : w.assignee_id ? h`<p class="gk-sub">${w.assignee_name} has not acknowledged it yet.</p>` : ''
  return card('Crew', h`<p>${facts.length ? facts.join(' · ') : h`<span class="gk-muted">No team or shift named.</span>`}</p>
    <p><b>Accountable:</b> ${w.assignee_name ?? 'Not assigned'}</p>${acknowledged}
    ${crew.collaborators.length ? h`<p><b>Collaborators:</b> ${crew.collaborators.map((person: any) => person.name).join(', ')}</p>` : ''}
    ${crew.handoffs.length ? h`<ul class="gk-plain-list">${crew.handoffs.map((row: any) => h`<li>${row.from ?? 'Unassigned'}${row.from_shift ? ` (${row.from_shift})` : ''} → ${row.to ?? 'unassigned'}${row.to_shift ? ` (${row.to_shift})` : ''}${row.note ? `: ${row.note}` : ''}<span class="gk-sub">${row.by ?? '—'} · ${showInstant(row.at, actor.zone)}</span></li>`)}</ul>` : ''}
    ${crew.answers.length ? h`<ul class="gk-plain-list">${crew.answers.map((row: any) => h`<li>${tag(row.answer === 'acknowledged' ? 'Acknowledged' : 'Declined')} ${row.by ?? '—'}${row.note ? `: ${row.note}` : ''}<span class="gk-sub">${showInstant(row.at, actor.zone)}</span></li>`)}</ul>` : ''}
    ${crew.contributors.length ? table(['Recorded by', 'Part', 'Records'], crew.contributors.map((row: any) => [row.name, row.part === 'assignee' ? 'Accountable' : row.part === 'collaborator' ? 'Collaborator' : 'Earlier on this work', String(row.records)]), 'Contributors') : ''}
    ${mine && !w.acknowledged_at && !w.origin ? post('workorder.acknowledge', '', 'Acknowledge') : ''}
    ${mine ? post('workorder.decline', h`${blockerFields(people)}${area('Why you are declining', 'note', { required: false })}`, 'Decline with a blocker') : ''}
    ${lead ? h`<div class="gk-split">${post('workorder.collaborate', select('Add a collaborator', 'member', people.filter(person => person.id !== w.assignee_id && !crew.collaborators.some((row: any) => row.id === person.id)).map(person => ({ value: person.id, label: person.name })), '', { blank: 'Choose a person' }), 'Add collaborator')}
      ${crew.collaborators.length ? post('workorder.collaborate', h`${hidden('remove', 'yes')}${select('Remove a collaborator', 'member', crew.collaborators.map((row: any) => ({ value: row.id, label: row.name })), '', { blank: 'Choose a person' })}`, 'Remove collaborator') : ''}</div>` : ''}`, { id: 'crew' })
}
