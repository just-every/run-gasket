// PM-006: my notices and the chase rule, and the chasing card on a work order.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { chaseRule, notices } from '../chasing'
import { showDate, showInstant } from '../dates'
import { card, field, form, h, hidden, select, table, tag } from './html'
import { page } from './shell'

const KIND: Record<string, string> = { qualification_expiry: 'Qualification expiry', agent_query: 'Agent question', agent_escalation: 'Agent escalation', replenishment: 'Replenishment', reminder: 'Reminder', overdue: 'Overdue', escalation_lead: 'Escalated to leads', escalation_supervisor: 'Escalated to supervisors', blocker_missed: 'Blocker promise missed', declined: 'Declined', mention: 'Mentioned', expiry: 'Document expiry' }
const BLOCKERS = [{ value: 'parts', label: 'Parts' }, { value: 'access', label: 'Access' }, { value: 'skill', label: 'Skill' }, { value: 'production', label: 'Production' }]

export async function noticesPage(env: Bindings, actor: Actor, url: URL) {
  const mine = await notices(env, actor), rule = await chaseRule(env)
  const list = mine.length ? table(['Notice', 'Sent'], mine.map(row => [h`${tag(KIND[row.kind])}${row.unread ? h` ${tag('Unread')}` : ''} <a href="${row.link}">${row.text}</a>`, showInstant(row.created_at, actor.zone)]), 'Notices', { wrap: [0] }) : h`<p class="gk-muted">No notices.</p>`
  const ruleText = `Remind ${rule.remind_before_days} day${rule.remind_before_days === 1 ? '' : 's'} before the due date and when overdue; escalate to leads after ${rule.lead_after_days} day${rule.lead_after_days === 1 ? '' : 's'} overdue or ${rule.response_within_days} day${rule.response_within_days === 1 ? '' : 's'} without a response; to supervisors after ${rule.supervisor_after_days} days.`
  const ruleCard = card('Chase rule', h`<p>${ruleText}</p><p class="gk-sub">${rule.number ? `Rule ${rule.number}` : 'Gasket\'s default rule'}. Notices appear here and on the work order; email and push are not sent yet.</p>
    ${can(actor, 'register.manage') ? form('chase.rule', '/app/notices', h`<div class="gk-grid">${field('Remind before due (days)', 'remindBeforeDays', { type: 'number', value: String(rule.remind_before_days) })}${field('Response expected within (days)', 'responseWithinDays', { type: 'number', value: String(rule.response_within_days) })}${field('Escalate to leads after (days overdue)', 'leadAfterDays', { type: 'number', value: String(rule.lead_after_days) })}${field('Escalate to supervisors after (days overdue)', 'supervisorAfterDays', { type: 'number', value: String(rule.supervisor_after_days) })}</div>`, 'Approve rule', { secondary: true }) : ''}`, { id: 'rule' })
  return page(env, 'Notices', actor, h`<h1>Notices</h1><p class="gk-lede">Reminders and escalations about overdue work, work its assignee declined, and comments that mention you.</p><div class="gk-columns"><div class="gk-col-main">${card('My notices', list, { id: 'mine' })}</div><div class="gk-col-side">${ruleCard}</div></div>`, { url })
}

export const blockerFields = (people: { id: string; name: string }[]) => h`<div class="gk-grid">${select('Blocked by', 'kind', BLOCKERS)}${select('Owner', 'owner', people.map(person => ({ value: person.id, label: person.name })), '', { required: false, blank: 'Me' })}${field('Next action', 'nextAction')}${field('Promised by', 'promisedOn', { type: 'date' })}</div>`

/** The chase on one work order: overdue age, responses, blockers and notices, with the assignee's and a lead's actions. */
export function chaseCard(w: any, actor: Actor, back: string, people: { id: string; name: string }[]) {
  const chase = w.chase, open = ['open', 'in_progress', 'returned'].includes(w.status)
  if (!chase.overdue_since && !chase.blockers.length && !chase.notices.length && !chase.queries.length && !open) return ''
  const post = (action: string, fields: unknown, label: string) => form(action, back, h`${hidden('workOrder', w.id)}${fields}`, label, { secondary: true })
  const mine = open && w.assignee_id === actor.id, lead = open && can(actor, 'work.assign')
  return card('Chasing', h`${chase.queries.map((q: any) => h`<p><b>${q.question}</b><span class="gk-sub">For ${q.recipient}${q.answered_at ? ` · Next: ${q.next_action} · Promised ${showDate(q.promised_on)}` : ' · Awaiting next action and promised date'}</span></p>${q.recipient_id === actor.id && !q.answered_at && !['closed','cancelled'].includes(w.status) ? form('agent.answer', back, h`${hidden('query', q.id)}${field('Next action', 'nextAction')}${field('Promised by', 'promisedOn', { type: 'date' })}`, 'Answer agent', { secondary: true }) : ''}`)}${chase.overdue_since ? h`<p>${tag('Overdue')} since ${showDate(chase.overdue_since)}: ${chase.overdue_days} day${chase.overdue_days === 1 ? '' : 's'}. Reassigning keeps this age.</p>` : ''}
    ${chase.responses.length ? h`<ul class="gk-plain-list">${chase.responses.map((row: any) => h`<li>${row.response === 'on_it' ? 'On it' : 'Blocked'}${row.note ? `: ${row.note}` : ''}<span class="gk-sub">${row.by ?? '—'}</span></li>`)}</ul>` : ''}
    ${chase.blockers.length ? table(['Blocker', 'Owner', 'Promised'], chase.blockers.map((row: any) => [h`${tag(BLOCKERS.find(item => item.value === row.kind)!.label)} ${row.next_action}${row.resolved_at ? h`<span class="gk-sub">Cleared: ${row.resolution}</span>` : ''}`, row.owner ?? '—',
      showDate(row.promised_on)]), 'Blockers', { wrap: [0] }) : ''}
    ${chase.blockers.filter((row: any) => !row.resolved_at && (row.owner_id === actor.id || mine || lead)).map((row: any) => form('blocker.resolve', back, h`${hidden('blocker', row.id)}${field(`What cleared the ${BLOCKERS.find(item => item.value === row.kind)!.label.toLowerCase()} blocker`, 'resolution')}`, 'Clear blocker', { secondary: true }))}
    ${chase.notices.length ? h`<ul class="gk-plain-list">${chase.notices.map((row: any) => h`<li>${tag(KIND[row.kind])} ${row.recipient ?? '—'}<span class="gk-sub">${row.text}</span></li>`)}</ul>` : ''}
    ${mine ? h`${post('workorder.respond', hidden('response', 'on_it'), 'I am on it')}${post('workorder.respond', h`${hidden('response', 'blocked')}${blockerFields(people)}`, 'Report a blocker')}` : lead ? post('blocker.raise', blockerFields(people), 'Raise a blocker') : ''}`, { id: 'chasing' })
}
