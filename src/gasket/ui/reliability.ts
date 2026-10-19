// REPORT-003: the Reliability page: MTBF, MTTR and MTTA with their samples and
// exclusions, the definitions they use, operating-time coverage per asset, the
// failure-mode Pareto and repeat failures linked to work, every failure with
// its classification history, and the door that corrects a classification.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { codeList } from '../codes'
import { all } from '../core'
import { showDate, showInstant, showLocal } from '../dates'
import { reliability } from '../reliability'
import { card, checkbox, field, form, h, select, table, tag, woNumber } from './html'
import { page } from './shell'

const one = (value: number | null, unit: string) => value === null ? '—' : `${value.toFixed(1)} ${unit}`
const pct = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`
const work = (row: { id: string; number: number; title: string } | null) => row ? h`<a href="/app/work/${row.id}">${woNumber(row.number)}</a> ${row.title}` : h`<span class="gk-muted">No work order</span>`
const kind = (row: { planned: boolean; failureMode: { label: string } | null }) => row.planned ? 'Planned stop' : `Failure${row.failureMode ? `: ${row.failureMode.label}` : ', not classified'}`

export async function reliabilityPage(env: Bindings, actor: Actor, url: URL) {
  const r = await reliability(env, actor, url)
  const assets = await all(env, 'SELECT id, tag, name FROM gk_assets ORDER BY tag')
  const back = `/app/reliability${url.search}`
  const filters = h`<form method="get" action="/app/reliability" class="gk-form gk-audit-search"><div class="gk-grid">${field('From', 'from', { type: 'date', value: r.from })}${field('To', 'to', { type: 'date', value: r.to })}
    ${select('Asset', 'asset', assets.map(row => ({ value: row.id, label: `${row.tag} ${row.name}` })), r.asset?.id ?? '', { required: false, blank: 'Every asset' })}</div><div class="gk-actions"><button type="submit" class="gk-secondary">Show</button></div></form>`
  const tiles = h`<ul class="gk-tiles" aria-label="Summary">${[['MTBF', one(r.mtbf.hours, 'h')], ['MTTR', one(r.mttr.minutes, 'min')], ['MTTA', one(r.mtta.minutes, 'min')], ['Failures', String(r.failures.length)], ['Planned stops', String(r.plannedStops.length)]].map(([label, value]) => h`<li><span class="gk-tile-n">${value}</span><span>${label}</span></li>`)}</ul>`
  const samples = card('Measures and samples', table(['Measure', 'Value', 'Sample', 'Excluded'], [
    ['MTBF', one(r.mtbf.hours, 'h'), `${r.mtbf.operatingHours.toFixed(1)} operating h over ${r.mtbf.failures} failure${r.mtbf.failures === 1 ? '' : 's'}`, `${r.mtbf.excluded} outside hour-meter coverage; ${r.mtbf.unknownHours.toFixed(1)} h of unknown coverage`],
    ['MTTR', one(r.mttr.minutes, 'min'), `${r.mttr.sample} ended failure${r.mttr.sample === 1 ? '' : 's'}`, `${r.mttr.excluded} still down`],
    ['MTTA', one(r.mtta.minutes, 'min'), `${r.mtta.sample} acknowledged failure${r.mtta.sample === 1 ? '' : 's'}`, `${r.mtta.excluded} not acknowledged since the stop`],
  ], 'Measures and samples', { wrap: [2, 3] }), { id: 'measures' })
  const pareto = card('Failures by failure mode', r.pareto.length ? table(['Failure mode', 'Failures', 'Share', 'Cumulative', 'Work'], r.pareto.map(row => [row.key ? row.label : tag('Unclassified'), String(row.count), pct(row.percent), pct(row.cumulativePercent), h`${row.work.map((item, index) => h`${index ? ', ' : ''}${item ? h`<a href="/app/work/${item.id}">${woNumber(item.number)}</a>` : '—'}`)}`]), 'Failure Pareto', { wrap: [0, 4] }) : h`<p class="gk-muted">No failures in this period.</p>`, { id: 'pareto' })
  const repeats = card('Repeat failures', r.repeats.length ? h`<ul class="gk-plain-list">${r.repeats.map(row => h`<li><a href="/app/assets/${row.asset.id}">${row.asset.tag} ${row.asset.name}</a>: ${row.failureMode!.label}, ${row.count} times<span class="gk-sub">${row.failures.map((item, index) => h`${index ? ' · ' : ''}${showLocal(item.started_on)} ${item.work ? h`<a href="/app/work/${item.work.id}">${woNumber(item.work.number)}</a>` : ''}`)}</span></li>`)}</ul>` : h`<p class="gk-muted">No asset failed the same way twice in this period.</p>`, { id: 'repeats' })
  const history = (row: { classifications: { planned: boolean; failureMode: { label: string } | null; reason: string; by: string | null; at: number; original: boolean }[] }) =>
    h`${row.classifications.map(entry => h`<span class="gk-sub">${entry.original ? 'Recorded' : 'Reclassified'} as ${kind(entry).toLowerCase()} · ${entry.by ?? '—'} · ${showInstant(entry.at, actor.zone)}${entry.original ? '' : `: ${entry.reason}`}</span>`)}`
  const failures = card('Failures', r.failures.length ? table(['Stopped', 'Asset and work', 'Counts as', 'Repair', 'Acknowledged'], r.failures.map(row => [
    h`${showLocal(row.started_on)}${row.covered ? '' : h`<span class="gk-sub">Outside hour-meter coverage</span>`}`, h`${row.asset.tag} ${row.asset.name}<span class="gk-sub">${work(row.work)}</span>`, h`${kind({ planned: false, failureMode: row.failureMode })}${history(row)}`,
    row.ended_on ? `${row.minutes} min` : tag('Down'), row.ackMinutes === null ? h`<span class="gk-muted">Not acknowledged since</span>` : `${row.ackMinutes.toFixed(1)} min`]), 'Failures', { wrap: [1, 2] }) : h`<p class="gk-muted">No failures in this period.</p>`, { id: 'failures' })
  const planned = card('Planned stops', r.plannedStops.length ? h`<ul class="gk-plain-list">${r.plannedStops.map(row => h`<li>${showLocal(row.started_on)} · ${row.asset.tag} ${row.asset.name} · ${row.ended_on ? `${row.minutes} min` : 'still down'}<span class="gk-sub">${work(row.work)}</span>${history({ classifications: row.classifications })}</li>`)}</ul>` : h`<p class="gk-muted">No planned stops in this period.</p>`, { id: 'planned' })
  const stops = [...r.failures.map(row => ({ id: row.id, label: `${showLocal(row.started_on)} ${row.asset.tag}: ${kind({ planned: false, failureMode: row.failureMode })}` })), ...r.plannedStops.map(row => ({ id: row.id, label: `${showLocal(row.started_on)} ${row.asset.tag}: Planned stop` }))]
  const modes = (await codeList(env, 'failure_mode')).filter(code => !code.retired).map(code => ({ value: code.key, label: code.label }))
  const correct = can(actor, 'register.manage') && stops.length ? card('Correct a classification', form('downtime.classify', back, h`${select('Stop', 'downtime', stops.map(row => ({ value: row.id, label: row.label })), '', { blank: 'Choose a stop' })}${checkbox('Planned stop (not a failure)', 'planned')}
    ${modes.length ? select('Failure mode', 'failureMode', modes, '', { required: false, blank: 'Not classified' }) : ''}${field('Reason', 'reason', { hint: 'Kept with the stop; the earlier classification stays on record.' })}`, 'Correct classification', { secondary: true }), { id: 'correct' }) : ''
  const coverage = card('Operating time', r.assets.length ? table(['Asset', 'Hour meter', 'Covered', 'Operating', 'Unknown', 'MTBF'], r.assets.map(row => [`${row.tag} ${row.name}`, row.meter ?? h`<span class="gk-muted">None</span>`,
    row.from ? h`${showLocal(row.from)}<span class="gk-sub">to ${showLocal(row.to)}</span>` : h`<span class="gk-muted">No readings</span>`, one(row.operatingHours, 'h'), one(row.unknownHours, 'h'), one(row.mtbfHours, 'h')]), 'Operating time by asset', { wrap: [0] }) : h`<p class="gk-muted">No asset has an hour meter reading or a stop in this period.</p>`, { id: 'coverage' })
  const definitions = card('Definitions', h`<dl class="gk-pairs">${r.definitions.map(row => h`<div><dt>${row.term}</dt><dd>${row.text}</dd></div>`)}</dl>`, { id: 'definitions' })
  return page(env, 'Reliability', actor, h`<h1>Reliability</h1><p class="gk-lede">${r.asset ? `${r.asset.tag} ${r.asset.name}` : r.site ?? 'The site'}: ${showDate(r.from)} to ${showDate(r.to)}, from ${showLocal(r.window.start)} to ${showLocal(r.window.end)}.</p>${filters}${tiles}
    <div class="gk-columns"><div class="gk-col-main">${samples}${coverage}${pareto}${repeats}${failures}${planned}</div><div class="gk-col-side">${correct}${definitions}</div></div>`, { url })
}
