// The asset register and one asset's page: identity, meters, sightings,
// schedules and the full history with its CSV download.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { assetList } from '../assets'
import { addDays, showDate, showInstant, showLocal } from '../dates'
import { assetHistory } from '../history'
import { assignable } from '../site'
import { STATUS, amount, area, assetMark, backLink, band as headerBand, card, details, drawingFor, field, form, h, hidden, page, select, table, tag, woNumber } from './html'

const CRITICALITY = [{ value: 'normal', label: 'Normal' }, { value: 'important', label: 'Important' }, { value: 'critical', label: 'Critical' }]
const identityFields = (asset: Record<string, any> = {}) => h`<div class="gk-grid">
  ${field('Asset tag', 'tag', { value: asset.tag ?? '', hint: 'The label on the equipment.' })}${field('Name', 'name', { value: asset.name ?? '' })}
  ${field('Serial', 'serial', { value: asset.serial ?? '', required: false })}${field('Location', 'location', { value: asset.location ?? '' })}
  ${field('Custodian', 'custodian', { value: asset.custodian ?? '', required: false, hint: 'The person responsible for it day to day.' })}${field('Category', 'category', { value: asset.category ?? '', required: false })}
  ${select('Criticality', 'criticality', CRITICALITY, asset.criticality ?? 'normal')}</div>${area('Notes', 'notes', { value: asset.notes ?? '', required: false })}`

export async function assetsPage(env: Bindings, actor: Actor, url: URL) {
  const rows = await assetList(env, actor)
  const manage = can(actor, 'register.manage')
  const list = rows.length ? table(['Asset', 'Location', 'Custodian', 'Criticality', 'Status', 'Next due', 'Last sighting'], rows.map(row => {
    const [outcome, at] = (row.last_sighting ?? '').split('|')
    return [h`<span class="gk-with-art">${assetMark(row)}<span><a href="/app/assets/${row.id}">${row.name}</a><span class="gk-sub">${row.tag}${row.serial ? ` · ${row.serial}` : ''}${row.origin === 'import' ? ' · moved in' : ''}</span></span></span>`, row.location, row.custodian ?? '—',
      row.criticality === 'normal' ? 'Normal' : row.criticality === 'important' ? 'Important' : 'Critical', tag(STATUS[row.status]), showDate(row.next_due),
      outcome ? h`${tag(outcome === 'found' ? 'Found' : outcome === 'elsewhere' ? 'Found elsewhere' : 'Missing')}<span class="gk-sub">${showInstant(Number(at), actor.zone)}</span>` : h`<span class="gk-muted">Never</span>`]
  }), 'Assets', { wrap: [1, 2] }) : h`<div class="gk-empty"><img src="/brand/assets/plinth.svg" alt="" width="360" height="244"><h2>No assets yet</h2><p>${manage ? 'Register the equipment you maintain below, or move in your MaintainX asset export.' : 'A maintenance lead registers the site\'s equipment.'}</p>${manage ? h`<p><a class="gk-button gk-secondary" href="/app/move-in">Move in from MaintainX</a></p>` : ''}</div>`
  const create = manage ? card('Register an asset', form('asset.create', '/app/assets/{id}', identityFields(), 'Register asset'), { id: 'register' }) : ''
  return page('Assets', actor, h`<div class="gk-head"><div><h1>Assets</h1><p class="gk-lede">The equipment this site owns and keeps in service.</p></div></div>${rows.length ? h`${list}${create}` : h`<div class="gk-columns gk-columns-even"><div class="gk-col-main">${list}</div><div class="gk-col-side">${create}</div></div>`}`, { url })
}

export async function assetPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const { asset, orders, events, downtimeMinutes } = await assetHistory(env, actor, id)
  const manage = can(actor, 'register.manage') && !asset.retired_at
  const back = `/app/assets/${asset.id}`
  const band = headerBand({ id: 'asset-name', eyebrow: `${asset.tag}${asset.category ? ` · ${asset.category}` : ''}`, title: asset.name,
    facts: [`Serial ${asset.serial ?? '—'}`, asset.location, `Custodian: ${asset.custodian ?? '—'}`], status: tag(STATUS[asset.status]),
    meta: [{ label: 'Criticality', value: asset.criticality === 'normal' ? 'Normal' : asset.criticality === 'important' ? 'Important' : 'Critical' }, { label: 'Downtime recorded', value: `${downtimeMinutes} minutes` }],
    art: drawingFor(asset) ?? 'pump' })
  const meters = card('Meters', h`${asset.meters.length ? table(['Meter', 'Latest'], asset.meters.map((meter: any) => [h`${meter.name}<span class="gk-sub">${meter.kind === 'counter' ? 'Counter' : meter.kind === 'gauge' ? 'Gauge' : 'Condition'}</span>`,
      meter.latest ? h`${meter.kind === 'condition' ? meter.latest.charAt(0).toUpperCase() + meter.latest.slice(1) : amount(meter.latest, meter.unit)}<span class="gk-sub">Taken ${showLocal(meter.latest_on)}</span>` : '—']), 'Meters', { wrap: [0] }) : h`<p class="gk-muted">No meters yet.</p>`}
    ${manage ? form('meter.create', back, h`${hidden('asset', asset.id)}<div class="gk-grid">${field('Meter name', 'name', { hint: 'For example Run hours or Oil condition.' })}${field('Unit', 'unit', { hint: 'h, °C, bar, km… use "condition" for good/fair/poor.' })}${select('Kind', 'kind', [{ value: 'counter', label: 'Counter (never goes down)' }, { value: 'gauge', label: 'Gauge (a measured value)' }, { value: 'condition', label: 'Condition (good, fair or poor)' }], 'counter')}</div>`, 'Add meter', { secondary: true }) : ''}`, { id: 'meters' })
  const work = card('Work orders', orders.length ? table(['Work order', 'Due', 'Status'], orders.map(order => [h`<a href="/app/work/${order.id}"><span class="gk-nowrap">${woNumber(order.number)}</span> · ${order.title}</a>${order.checklist ? h`<span class="gk-sub">${order.checklist}, revision ${order.revision}</span>` : ''}`, showDate(order.due_date), tag(STATUS[order.status])]), 'Work orders', { wrap: [0] }) : h`<p class="gk-muted">No work orders yet.</p>`, { id: 'work' })
  const corrective = can(actor, 'work.assign') && !asset.retired_at ? card('Raise corrective work', form('workorder.create', '/app/work/{id}', h`${hidden('asset', asset.id)}${field('What needs doing', 'title')}${area('Details', 'description', { required: false })}<div class="gk-grid">${field('Due', 'due', { type: 'date', value: addDays(actor.today, 7) })}${select('Assign to', 'assignee', (await assignable(env)).map(person => ({ value: person.id, label: person.name })), '', { required: false, blank: 'Not yet' })}</div>`, 'Raise work order', { secondary: true }), { id: 'corrective' }) : ''
  const sightings = card('Sightings', h`${asset.sightings.length ? table(['Outcome', 'Seen at', 'Note'], asset.sightings.map((row: any) => [h`${tag(row.outcome === 'found' ? 'Found' : row.outcome === 'elsewhere' ? 'Found elsewhere' : 'Missing')}<span class="gk-sub">${showInstant(row.recorded_at, actor.zone)}</span>`, row.seen_location ?? '—', row.note ?? '']), 'Sightings', { wrap: [1, 2] }) : h`<p class="gk-muted">Not physically checked yet.</p>`}
    ${can(actor, 'register.manage') ? form('asset.sighting', back, h`${hidden('asset', asset.id)}<div class="gk-grid">${select('What you found', 'outcome', [{ value: 'found', label: `Found at ${asset.location}` }, { value: 'elsewhere', label: 'Found somewhere else' }, { value: 'missing', label: 'Not found' }], 'found')}${field('Where it was (if elsewhere)', 'seenLocation', { required: false })}</div>${field('Note', 'note', { required: false })}`, 'Record sighting', { secondary: true }) : ''}`, { id: 'sightings' })
  const history = card('History', h`${events.length ? table(['When', 'Work order', 'What', 'Who'], events.map(event => [event.when, event.workOrder ?? '—', event.what, event.who ?? '—']), 'History', { wrap: [2] }) : h`<p class="gk-muted">No history yet.</p>`}
    ${can(actor, 'history.export') ? h`<p><a class="gk-button gk-secondary" href="/app/assets/${asset.id}/history.csv">Download history (CSV)</a></p>` : ''}`, { id: 'history' })
  const edit = manage ? card('Change details', h`${form('asset.update', back, h`${hidden('asset', asset.id)}${hidden('revision', asset.revision)}${identityFields(asset)}`, 'Save changes', { secondary: true })}
    ${form('asset.retire', '/app/assets', h`${hidden('asset', asset.id)}${field('Reason to retire', 'reason', { hint: 'Retiring keeps all history. Close or cancel its open work first.' })}`, 'Retire asset', { secondary: true })}`, { id: 'edit' }) : ''
  const earlier = asset.versions.length ? details(asset.versions.map((version: any) => [`Revision ${version.revision} (${showInstant(version.changed_at, actor.zone)})`, Object.entries(version.value).map(([key, value]) => `${key}: ${value ?? '—'}`).join(' · ')])) : ''
  const body = h`${backLink('/app/assets', 'Assets')}${band}<div class="gk-columns"><div class="gk-col-main">${work}${history}</div><div class="gk-col-side">${meters}${sightings}${corrective}${edit}${earlier}</div></div>`
  return page(asset.name, actor, body, { url })
}
