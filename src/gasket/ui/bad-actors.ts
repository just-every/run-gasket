// REPORT-005: the Downtime Pareto page: downtime ranked by asset, line,
// failure mode and reason with shares, cumulative shares, repeats, repair cost
// and lost production (unknown where nothing is documented), each row's
// contributors with their duplicate time, the documented loss rates, the CSV of
// every input, and the work order's repair cost card.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { COST_CATEGORIES, badActors, lossRates, usd } from '../bad-actors'
import { all } from '../core'
import { showDate, showInstant, showLocal } from '../dates'
import type { WorkView } from '../work'
import { card, field, form, h, hidden, select, table, woNumber } from './html'
import { page } from './shell'

const pct = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`
const CATEGORY = { parts: 'Parts', labor: 'Labor', contractor: 'Contractor', other: 'Other' }
type Report = Awaited<ReturnType<typeof badActors>>

const money = (cents: number | null, unknown: number, noun: string) => h`${cents === null ? h`<span class="gk-muted">Unknown</span>` : usd(cents)}${unknown ? h`<span class="gk-sub">${unknown} ${noun} unknown</span>` : ''}`

function ranking(title: string, id: string, rows: Report['byAsset']) {
  return card(title, rows.length ? table(['Ranked', 'Downtime', 'Share', 'Cumulative', 'Repeats', 'Repair cost', 'Lost production'], rows.map(row => [
    h`<details class="gk-details"><summary>${row.label}</summary><ul class="gk-plain-list">${row.contributors.map(item => h`<li>${showLocal(item.started_on)} · ${item.asset.tag} · ${item.minutes} min${item.duplicateMinutes ? ` (${item.duplicateMinutes} duplicate min not counted)` : ''}${item.work ? h` · <a href="/app/work/${item.work.id}">${woNumber(item.work.number)}</a>` : ''}</li>`)}</ul></details>`,
    `${row.minutes} min`, pct(row.percent), pct(row.cumulativePercent), String(row.repeats),
    money(row.repairCents, row.repairUnknown, row.repairUnknown === 1 ? 'work order' : 'work orders'), money(row.lossCents, row.lossUnknownMinutes, 'min')]), title, { wrap: [0] }) : h`<p class="gk-muted">No failures in this period.</p>`, { id })
}

export async function badActorsPage(env: Bindings, actor: Actor, url: URL) {
  const r = await badActors(env, actor, url)
  const assets = await all(env, 'SELECT id, tag, name FROM gk_assets ORDER BY tag')
  const back = `/app/bad-actors${url.search}`
  const filters = h`<form method="get" action="/app/bad-actors" class="gk-form gk-audit-search"><div class="gk-grid">${field('From', 'from', { type: 'date', value: r.from })}${field('To', 'to', { type: 'date', value: r.to })}
    ${select('Entry', 'asset', assets.map(row => ({ value: row.id, label: `${row.tag} ${row.name}` })), r.asset?.id ?? '', { required: false, blank: 'The whole site' })}</div><div class="gk-actions"><button type="submit" class="gk-secondary">Show</button><a class="gk-secondary" href="/app/bad-actors.csv${url.search}">Download inputs (CSV)</a></div></form>`
  const t = r.totals
  const tiles = h`<ul class="gk-tiles" aria-label="Summary">${[['Downtime', `${t.minutes} min`], ['Failures', String(t.failures)], ['Duplicate time not counted', `${t.duplicateMinutes} min`], ['Repair cost', t.repairCents === null ? 'Unknown' : usd(t.repairCents)], ['Lost production', t.lossCents === null ? 'Unknown' : usd(t.lossCents)]].map(([label, value]) => h`<li><span class="gk-tile-n">${value}</span><span>${label}</span></li>`)}</ul>
    <p class="gk-muted">${t.repairUnknown ? `${t.repairUnknown} work order${t.repairUnknown === 1 ? ' has' : 's have'} no recorded repair cost. ` : ''}${t.lossUnknownMinutes ? `${t.lossUnknownMinutes} min have no documented loss rate and are not estimated. ` : ''}Left out: ${r.excluded.planned} planned stop${r.excluded.planned === 1 ? '' : 's'}, ${r.excluded.degraded} degraded running.</p>`
  const repeats = card('Repeat failures', r.repeats.length ? h`<ul class="gk-plain-list">${r.repeats.map(row => h`<li>${row.asset.tag} ${row.asset.name}: ${row.failureMode!.label}, ${row.count} times</li>`)}</ul>` : h`<p class="gk-muted">No asset failed the same way twice in this period.</p>`, { id: 'repeats' })
  const { history } = await lossRates(env)
  const rates = card('Lost-production rates', h`${history.length ? h`<ul class="gk-plain-list">${history.toReversed().map(row => h`<li>${row.tag} ${row.name}: ${row.cents_per_hour === null ? 'unknown' : `${usd(row.cents_per_hour)} per production hour`}<span class="gk-sub">${row.basis} · ${row.by ?? '—'} · ${showInstant(row.recorded_at, actor.zone)}</span></li>`)}</ul>` : h`<p class="gk-muted">No rate documented: every loss is unknown.</p>`}
    ${can(actor, 'register.manage') ? form('loss.rate', back, h`${select('Entry', 'asset', assets.map(row => ({ value: row.id, label: `${row.tag} ${row.name}` })), '', { blank: 'Choose an entry' })}${field('USD per production hour', 'rate', { required: false, hint: 'Leave empty to record that the loss is unknown.' })}${field('Basis', 'basis', { hint: 'Where the figure comes from, for example lost cases times margin.' })}`, 'Document rate', { secondary: true }) : ''}`, { id: 'rates' })
  const definitions = card('Definitions', h`<dl class="gk-pairs">${r.definitions.map(row => h`<div><dt>${row.term}</dt><dd>${row.text}</dd></div>`)}</dl>`, { id: 'definitions' })
  return page(env, 'Downtime Pareto', actor, h`<h1>Downtime Pareto</h1><p class="gk-lede">${r.asset ? `${r.asset.tag} ${r.asset.name} and everything below it` : r.site ?? 'The site'}: ${showDate(r.from)} to ${showDate(r.to)}, failure minutes inside production hours.</p>${filters}${tiles}
    <div class="gk-columns"><div class="gk-col-main">${ranking('By asset', 'by-asset', r.byAsset)}${ranking('By line', 'by-line', r.byLine)}${ranking('By failure mode', 'by-mode', r.byFailureMode)}${ranking('By reason', 'by-reason', r.byReason)}${repeats}</div><div class="gk-col-side">${rates}${definitions}</div></div>`, { url })
}

/** The work order's repair cost entries, and the form a lead records one with. */
export function costCard(w: WorkView, actor: Actor, back: string) {
  const c = w.costs
  return card('Repair cost', h`${c.entries.length ? h`<ul class="gk-plain-list">${c.entries.map(row => h`<li>${CATEGORY[row.category as keyof typeof CATEGORY]}: ${usd(row.cents)}<span class="gk-sub">${row.note} · ${row.by ?? '—'} · ${showInstant(row.recorded_at, actor.zone)}</span></li>`)}</ul><p><b>Total ${usd(c.totalCents)}</b></p>` : h`<p class="gk-muted">No repair cost recorded: unknown.</p>`}
    ${can(actor, 'work.assign') ? form('work.cost', back, h`${hidden('workOrder', w.id)}${select('Category', 'category', COST_CATEGORIES.map(value => ({ value, label: CATEGORY[value] })), 'parts')}${field('Amount (USD)', 'amount', { hint: 'A negative amount corrects an earlier entry.' })}${field('Note', 'note')}`, 'Record cost', { secondary: true }) : ''}`, { id: 'cost' })
}
