// PART-004: cycle counts on the Parts page and the count sheet.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { usd } from '../bad-actors'
import { countDetail, countList } from '../counts'
import { showInstant } from '../dates'
import { assignable } from '../site'
import { amount, backLink, card, field, form, h, hidden, select, table, tag } from './html'
import { page } from './shell'

const STATE: Record<string, string> = { open: 'To count', matched: 'Matched', posted: 'Posted', waiting: 'Waiting for approval', approved: 'Approved', rejected: 'Rejected' }
const REASON: Record<string, string> = { lost: 'Lost', found: 'Found', damaged: 'Damaged' }

/** The Parts page card: counts the viewer plans or counts, and the plan form for leads. */
export async function countsCard(env: Bindings, actor: Actor, parts: { id: string; number: string; name: string; location: string | null }[]) {
  const counts = await countList(env, actor)
  const manage = can(actor, 'register.manage')
  if (!manage && !counts.length) return ''
  const locations = [...new Set(parts.map(part => part.location).filter(Boolean))] as string[]
  const people = await assignable(env)
  const list = counts.length ? h`<ul class="gk-plain-list">${counts.map(count => h`<li><a href="/app/counts/${count.id}">CC-${count.number} ${count.title}</a><span class="gk-sub">${count.counter} · ${count.lines} part${count.lines === 1 ? '' : 's'} · ${count.status === 'open' ? 'to count' : count.waiting ? `${count.waiting} waiting for approval` : 'counted'}</span></li>`)}</ul>` : h`<p class="gk-muted">No cycle counts yet.</p>`
  const plan = manage && parts.length ? form('count.plan', '/app/counts/{id}', h`${field('Title', 'title')}${select('Shelf location', 'location', locations.map(location => ({ value: location, label: location })), '', { required: false, blank: 'Only the parts ticked below' })}
    <fieldset class="gk-field"><legend>Parts</legend>${parts.map(part => h`<label class="gk-check"><input type="checkbox" name="part" value="${part.id}"> ${part.number} ${part.name}</label>`)}</fieldset>
    ${select('Counter', 'counter', people.map(person => ({ value: person.id, label: person.name })), '', { blank: 'Choose a person' })}`, 'Plan count', { secondary: true }) : ''
  return card('Cycle counts', h`${list}${plan}`, { id: 'counts' })
}

export async function countPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const count = await countDetail(env, actor, id)
  const back = `/app/counts/${count.id}`
  const head = h`<div class="gk-head"><div><p class="gk-eyebrow">CC-${count.number}</p><h1>${count.title}</h1><p class="gk-lede">${count.location ?? 'Chosen parts'} · counted by ${count.counter.name}${count.submittedAt ? ` · submitted ${showInstant(count.submittedAt, actor.zone)}` : ''}</p></div>${tag(count.status === 'open' ? 'To count' : 'Counted')}</div>`
  let body
  if (count.blind) {
    body = card('Count the shelf', form('count.submit', back, h`${hidden('count', count.id)}<p class="gk-muted">Count what is on the shelf. A shortage needs a reason (lost or damaged), an overage found.</p>
      ${count.lines.map(line => h`<div class="gk-grid">${hidden('line', line.id)}${field(`${line.part.number} ${line.part.name} (${line.part.unit})`, 'counted', { attrs: 'inputmode="decimal"', hint: line.part.location ?? '' })}${select('Reason for a difference', 'reason', Object.entries(REASON).map(([value, label]) => ({ value, label })), '', { required: false, blank: 'No difference' })}${hidden('note', '')}</div>`)}`, 'Submit count'), { id: 'sheet' })
  } else {
    const decide = (line: typeof count.lines[number]) => line.state === 'waiting' && can(actor, 'register.manage') && count.counter.id !== actor.id
      ? h`${form('count.decide', back, h`${hidden('line', line.id)}${hidden('decision', 'approve')}`, 'Approve')}${form('count.decide', back, h`${hidden('line', line.id)}${hidden('decision', 'reject')}${field('Reason', 'note')}`, 'Reject', { secondary: true })}` : ''
    body = card('Lines', count.lines.length ? table(['Part', 'Expected', 'Counted', 'Variance', 'Value', 'State', ''], count.lines.map(line => [
      h`${line.part.name}<span class="gk-sub">${line.part.number}${line.part.location ? ` · ${line.part.location}` : ''}</span>`,
      line.expected === null || line.expected === undefined ? '—' : amount(line.expected, line.part.unit),
      line.counted === null ? '—' : amount(line.counted, line.part.unit),
      line.variance === null || line.variance === undefined ? '—' : h`${line.variance}${line.reason ? h`<span class="gk-sub">${REASON[line.reason]}</span>` : ''}`,
      line.valueCents === null || line.valueCents === undefined ? (line.state === 'waiting' ? 'On approval' : '—') : usd(line.valueCents),
      h`${tag(STATE[line.state])}${line.afterApproval !== null && line.afterApproval !== undefined ? h`<span class="gk-sub">On hand now ${amount(line.onHand, line.part.unit)}; ${amount(line.afterApproval, line.part.unit)} after approval</span>` : ''}${line.decidedBy ? h`<span class="gk-sub">${line.decidedBy}${line.decisionNote ? `: ${line.decisionNote}` : ''}</span>` : ''}`,
      decide(line)]), 'Count lines', { wrap: [0, 5, 6] }) : '', { id: 'lines', extra: h`<span class="gk-count">Variances of ${usd(count.thresholdCents)} or more wait for approval</span>` })
  }
  return page(env, `CC-${count.number}`, actor, h`${backLink('/app/parts', 'Parts')}${head}${body}`, { url })
}
