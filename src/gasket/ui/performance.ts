// REPORT-004: the Performance page: backlog by age with estimated hours,
// overdue and at-risk work, PM compliance with its whole denominator drilled to
// work and blockers, planned against reactive work, and schedule attainment.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { teamList } from '../crew'
import { showDate } from '../dates'
import { performance } from '../performance'
import { STATUS, card, field, h, select, table, tag, woNumber } from './html'
import { page } from './shell'

const OUTCOME: Record<string, string> = { on_time: 'On time', late: 'Late', overdue: 'Overdue', cancelled: 'Cancelled', skipped: 'Skipped', ungenerated: 'Not generated', pending: 'Not yet due' }
const BAND: Record<string, string> = { '0-7': '0–7 days', '8-30': '8–30 days', '31-90': '31–90 days', 'over-90': 'Over 90 days' }
const pct = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`
const hrs = (row: { hours: number; unestimated: number }) => `${row.hours.toFixed(1)} h${row.unestimated ? ` + ${row.unestimated} without estimate` : ''}`
const work = (row: any) => row ? h`<a href="/app/work/${row.id}">${woNumber(row.number)}</a> ${row.title}<span class="gk-sub">${STATUS[row.status]}${row.assignee ? ` · ${row.assignee}` : ' · not assigned'}</span>` : h`<span class="gk-muted">No work issued</span>`

export async function performancePage(env: Bindings, actor: Actor, url: URL) {
  const r = await performance(env, actor, url), teams = await teamList(env)
  const filters = h`<form method="get" action="/app/performance" class="gk-form gk-audit-search"><div class="gk-grid">${field('From', 'from', { type: 'date', value: r.from })}${field('To', 'to', { type: 'date', value: r.to })}
    ${select('Team', 'team', teams.map(team => ({ value: team.id, label: `${team.name} (${team.trade})` })), r.team?.id ?? '', { required: false, blank: 'Every team' })}</div><div class="gk-actions"><button type="submit" class="gk-secondary">Show</button></div></form>`
  const tiles = h`<ul class="gk-tiles" aria-label="Summary">${[['PM on time', pct(r.compliance.onTimePercent)], ['Schedule attainment', pct(r.attainment.percent)], ['Planned work', pct(r.mix.plannedPercent)], ['Backlog', `${r.backlog.count} · ${r.backlog.hours.toFixed(1)} h`], ['Waiting for review', String(r.backlog.awaitingReview.count)]].map(([label, value]) => h`<li><span class="gk-tile-n">${value}</span><span>${label}</span></li>`)}</ul>`
  const c = r.compliance
  const compliance = card('PM compliance', h`<p>${c.onTime} of ${c.denominator} preventive occurrences due ${showDate(r.from)} to ${showDate(r.to)} were done on or before their due date. Late, overdue, cancelled, skipped and never-generated occurrences stay in the count${c.outcomes.pending ? `; ${c.outcomes.pending} not yet due are left out` : ''}.</p>
    ${c.occurrences.length ? table(['Due', 'Schedule', 'Outcome', 'Work and blockers'], c.occurrences.map((row: any) => [showDate(row.due_date), row.title, tag(OUTCOME[row.outcome]), h`${work(row.work)}${row.reason ? h`<span class="gk-sub">Skipped: ${row.reason}</span>` : ''}${row.blockers.map((item: any) => h`<span class="gk-sub">Blocked (${item.kind}): ${item.next_action} · ${item.owner ?? '—'} by ${showDate(item.promised_on)}</span>`)}`]), 'PM occurrences', { wrap: [1, 3] }) : h`<p class="gk-muted">No preventive work was due in this period.</p>`}`, { id: 'compliance' })
  const b = r.backlog
  const backlog = card('Backlog', h`${table(['Age', 'Orders', 'Hours', 'No estimate'], b.bands.map((row: any) => [BAND[row.band], String(row.count), row.hours.toFixed(1), String(row.unestimated)]), 'Backlog by age since raised')}
    <p><b>Overdue:</b> ${b.overdue.count} · ${hrs(b.overdue)}. <b>At risk</b> (due within 7 days, not started): ${b.atRisk.count} · ${hrs(b.atRisk)}. <b>Waiting for review:</b> ${b.awaitingReview.count}${b.awaitingReview.oldestDays !== null ? `, oldest ${b.awaitingReview.oldestDays} day${b.awaitingReview.oldestDays === 1 ? '' : 's'}` : ''}.</p>
    ${b.unestimated.length ? h`<p class="gk-sub">Without an estimate: ${b.unestimated.map((row: any, index: number) => h`${index ? ', ' : ''}<a href="/app/work/${row.id}">${woNumber(row.number)}</a>`)}</p>` : ''}`, { id: 'backlog' })
  const mix = card('Planned and reactive', h`<p class="gk-sub">Work approved and closed in the period.</p>${table(['Kind', 'Orders', 'Hours', 'No estimate'], [['Planned', String(r.mix.planned.count), r.mix.planned.hours.toFixed(1), String(r.mix.planned.unestimated)], ['Reactive', String(r.mix.reactive.count), r.mix.reactive.hours.toFixed(1), String(r.mix.reactive.unestimated)]], 'Planned and reactive')}`, { id: 'mix' })
  const attainment = card('Schedule attainment', h`<p>${r.attainment.attained} of ${r.attainment.due} work orders due in the period were done by their due date.</p>${r.attainment.missed.length ? h`<ul class="gk-plain-list">${r.attainment.missed.map((row: any) => h`<li>${work(row)}<span class="gk-sub">Due ${showDate(row.due_date)}</span></li>`)}</ul>` : ''}`, { id: 'attainment' })
  return page(env, 'Performance', actor, h`<h1>Performance</h1><p class="gk-lede">${r.site ?? 'The site'}${r.team ? `, team ${r.team.name}` : ''}: ${showDate(r.from)} to ${showDate(r.to)}, judged as of ${showDate(r.today)}. Hours are leads' estimates.</p>${filters}${tiles}
    <div class="gk-columns"><div class="gk-col-main">${compliance}${attainment}</div><div class="gk-col-side">${backlog}${mix}</div></div>`, { url })
}
