// REPORT-002: the Availability page: each entry's production time, planned
// time, denominator, down time (overlaps counted once), degraded operation,
// availability and unknown coverage; the source timeline of every outage with
// its clipped window and production minutes; the site's production hours and
// the definitions.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { availability } from '../availability'
import { all } from '../core'
import { showClock, showDate, showLocal } from '../dates'
import { card, field, form, h, select, table, tag } from './html'
import { page } from './shell'

const hours = (minutes: number) => `${(Math.round(minutes / 6) / 10).toFixed(1)} h`
const pct = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const KIND = { failure: 'Failure', planned: 'Planned stop', degraded: 'Degraded operation' }

export async function availabilityPage(env: Bindings, actor: Actor, url: URL) {
  const r = await availability(env, actor, url)
  const assets = await all(env, 'SELECT id, tag, name FROM gk_assets ORDER BY tag')
  const back = `/app/availability${url.search}`
  const filters = h`<form method="get" action="/app/availability" class="gk-form gk-audit-search"><div class="gk-grid">${field('From', 'from', { type: 'date', value: r.from })}${field('To', 'to', { type: 'date', value: r.to })}
    ${select('Entry', 'asset', assets.map(row => ({ value: row.id, label: `${row.tag} ${row.name}` })), r.asset?.id ?? '', { required: false, blank: 'Every line and every entry with an outage' })}</div><div class="gk-actions"><button type="submit" class="gk-secondary">Show</button></div></form>`
  const entries = card('Availability by entry', r.entries.length ? table(['Entry', 'Production', 'Down', 'Availability', 'Unknown coverage'], r.entries.map(row => [
    h`<a href="/app/availability?from=${r.from}&to=${r.to}&asset=${row.id}">${row.tag} ${row.name}</a><span class="gk-sub">${row.level}${row.downNow.length ? h` · ${tag('Down')} ${row.downNow.join(', ')}` : ''}</span>`,
    h`${hours(row.productionMinutes)}<span class="gk-sub">${hours(row.plannedMinutes)} planned</span>`,
    h`${hours(row.downMinutes)}${row.overlapMinutes ? h`<span class="gk-sub">${row.overlapMinutes} overlapping min counted once</span>` : ''}<span class="gk-sub">${hours(row.degradedMinutes)} degraded running</span>`,
    h`${pct(row.availabilityPercent)}<span class="gk-sub">of ${hours(row.denominatorMinutes)}</span>`,
    h`${hours(row.unknownCoverageMinutes)}<span class="gk-sub">${row.hourMeters.length ? row.hourMeters.join(', ') : 'No hour meter'}</span>`]), 'Availability by entry', { wrap: [0, 2, 4] }) : h`<p class="gk-muted">No line and no outage in this period.</p>`, { id: 'availability' })
  const timeline = card('Source timeline', r.outages.length ? table(['Outage', 'Entry and work', 'Counts as', 'In this period', 'Production'], r.outages.map(row => [
    h`${showLocal(row.started_on)}<span class="gk-sub">to ${row.open ? 'now (still open)' : showLocal(row.ended_on)}</span>`,
    h`${row.asset.tag} ${row.asset.name}${row.line ? h`<span class="gk-sub">Line ${row.line.tag}</span>` : ''}<span class="gk-sub">${row.work ? h`<a href="/app/work/${row.work.id}">${row.work.title}</a>` : 'No work order'}</span>`,
    h`${KIND[row.kind]}${row.failureMode ? `: ${row.failureMode.label}` : ''}<span class="gk-sub">${row.reason}</span>`,
    h`${showLocal(row.span.from)}<span class="gk-sub">to ${showLocal(row.span.to)}${row.startsBefore ? ' · began before the period' : ''}${row.endsAfter ? (row.open ? ' · still open' : ' · ends after the period') : ''}</span>`,
    h`${row.productionMinutes} min<span class="gk-sub">${row.outsideProductionMinutes} min outside production hours</span>`]), 'Source timeline', { wrap: [1, 2, 3, 4] }) : h`<p class="gk-muted">No outage in this period.</p>`, { id: 'timeline' })
  const declared = r.production.hours
  const window = (row: { weekday: number; starts: string; ends: string }) => `${WEEKDAYS[row.weekday - 1]}: ${showClock(row.starts)} to ${row.ends === '24:00' ? 'midnight' : showClock(row.ends)}`
  const productionCard = card('Production hours', h`${declared.length ? h`<ul class="gk-plain-list">${declared.map(row => h`<li>${window(row)}</li>`)}</ul>${can(actor, 'register.manage') ? form('production.hours.remove', back, select('Remove a window', 'hours', declared.map(row => ({ value: row.id, label: window(row) })), '', { blank: 'Choose a window' }), 'Remove', { secondary: true }) : ''}` : h`<p class="gk-muted">None declared: every hour of every day is production time.</p>`}
    ${can(actor, 'register.manage') ? form('production.hours.add', back, h`<fieldset><legend>Weekdays</legend>${WEEKDAYS.map((day, index) => h`<label class="gk-check"><input type="checkbox" name="weekdays" value="${index + 1}"> ${day}</label>`)}</fieldset>
      <div class="gk-grid">${field('Starts', 'starts', { type: 'time', value: '06:00' })}${field('Ends', 'ends', { value: '22:00', hint: 'HH:MM, or 24:00 for midnight.' })}</div>`, 'Add production hours', { secondary: true }) : ''}`, { id: 'production' })
  const definitions = card('Definitions', h`<dl class="gk-pairs">${r.definitions.map(row => h`<div><dt>${row.term}</dt><dd>${row.text}</dd></div>`)}</dl>`, { id: 'definitions' })
  return page(env, 'Availability', actor, h`<h1>Availability</h1><p class="gk-lede">${r.asset ? `${r.asset.tag} ${r.asset.name} and everything below it` : r.site ?? 'The site'}: ${showDate(r.from)} to ${showDate(r.to)}, from ${showLocal(r.window.start)} to ${showLocal(r.window.end)}; ${hours(r.production.minutes)} of production time.</p>${filters}
    <div class="gk-columns"><div class="gk-col-main">${entries}${timeline}</div><div class="gk-col-side">${productionCard}${definitions}</div></div>`, { url })
}
