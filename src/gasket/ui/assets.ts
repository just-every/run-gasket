import { customCard, customInputs } from './custom-fields'
// The asset register and one asset's page: identity, meters, sightings,
// schedules and the full history with its CSV download.
import { PRIORITIES, PRIORITY_LABELS, templateList } from '../templates'
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { assetList } from '../assets'
import { codeList } from '../codes'
import { addDays, showDate, showInstant, showLocal } from '../dates'
import { assetHistory } from '../history'
import { COUNTER_CHANGES } from '../meters'
import { createsWork } from '../site'
import { assignChoice, doneAlready } from './create-work'
import { disposalFields, lifecycleCard } from './lifecycle'
import { documentsCard } from './documents'
import { assignable } from '../site'
import { LEVELS, LEVEL_LABELS, parentChoices, type Level as Tier } from '../hierarchy'
import { mentionable, readThread } from '../comments'
import { commentsCard } from './comments'
import { STATUS, amount, area, assetMark, backLink, band as headerBand, card, details, field, form, h, hidden, select, table, tag, woNumber } from './html'
import { machine } from './icons'
import { bomCard, bomForm } from './bom'
import { partList } from '../parts'
import { page } from './shell'

type Level = { key: string; label: string; retired: boolean }
/** Active criticality levels in catalog order, plus the asset's own level if it was retired since. */
const levels = (catalog: Level[], kept?: string) => catalog.filter(level => !level.retired || level.key === kept).map(level => ({ value: level.key, label: level.retired ? `${level.label} (retired)` : level.label }))
const identityFields = (catalog: Level[], asset: Record<string, any> = {}) => h`<div class="gk-grid">
  ${field('Asset tag', 'tag', { value: asset.tag ?? '', hint: 'The label on the equipment.' })}${field('Name', 'name', { value: asset.name ?? '' })}
  ${field('Model', 'model', { value: asset.model ?? '', required: false })}${field('Serial', 'serial', { value: asset.serial ?? '', required: false })}${field('Location', 'location', { value: asset.location ?? '' })}
  ${field('Custodian', 'custodian', { value: asset.custodian ?? '', required: false, hint: 'The person responsible for it day to day.' })}${field('Category', 'category', { value: asset.category ?? '', required: false })}
  ${select('Criticality', 'criticality', levels(catalog, asset.criticality), asset.criticality ?? 'normal')}</div>${area('Notes', 'notes', { value: asset.notes ?? '', required: false })}`

export async function assetsPage(env: Bindings, actor: Actor, url: URL) {
  const rows = await assetList(env, actor, url)
  const customFilter = url.searchParams.get('field'), customValue = url.searchParams.get('value')
  const customDefinitions = await (await import('../custom-fields')).customFields(env,'asset')
  const filters = customDefinitions.length ? h`<details class="gk-details"><summary>Filter custom fields</summary><form method="get" action="/app/assets" class="gk-form">${select('Field','field',customDefinitions.map(f=>({value:f.id,label:f.name})),customFilter ?? '')}${field('Value','value',{value:customValue ?? ''})}<button class="gk-secondary">Apply filter</button></form></details>` : '' 
  const manage = can(actor, 'register.manage')
  const catalog = await codeList(env, 'criticality')
  const list = rows.length ? table(['Asset', 'Location', 'Custodian', 'Criticality', 'Status', 'Next due', 'Last sighting'], rows.map(row => {
    const [outcome, at] = (row.last_sighting ?? '').split('|')
    return [h`<span class="gk-with-art">${assetMark(row)}<span><a href="/app/assets/${row.id}">${row.name}</a><span class="gk-sub">${row.tag}${row.model ? ` · ${row.model}` : ''}${row.serial ? ` · ${row.serial}` : ''} · ${LEVEL_LABELS[row.level as Tier]}${row.parent_tag ? ` in ${row.parent_tag}` : ''}${row.origin === 'import' ? ' · moved in' : ''}</span></span></span>`, row.location, row.custodian ?? '—',
      row.criticality_label ?? row.criticality, h`${tag(STATUS[row.status])}${row.conflicts ? h`<span class="gk-sub">${tag('Evidence disagrees')}</span>` : ''}`, showDate(row.next_due),
      outcome ? h`${tag(outcome === 'found' ? 'Found' : outcome === 'elsewhere' ? 'Found elsewhere' : 'Missing')}<span class="gk-sub">${showInstant(Number(at), actor.zone)}</span>` : h`<span class="gk-muted">Never</span>`]
  }), 'Assets', { wrap: [1, 2] }) : h`<div class="gk-empty"><img src="/brand/assets/plinth.svg" alt="" width="360" height="244"><h2>No assets yet</h2><p>${manage ? 'Register the equipment you maintain below, or move in your MaintainX asset export.' : 'A maintenance lead registers the site\'s equipment.'}</p>${manage ? h`<p><a class="gk-button gk-secondary" href="/app/move-in">Move in from MaintainX</a></p>` : ''}</div>`
  // ASSET-001: where the new entry sits; the asset page moves it later.
  const where = h`<div class="gk-grid">${select('Level', 'level', LEVELS.map(level => ({ value: level, label: LEVEL_LABELS[level] })), 'machine')}${select('Under', 'parent', (await parentChoices(env, null)).map(row => ({ value: row.id, label: `${row.tag} ${row.name} (${LEVEL_LABELS[row.level as Tier]})` })), '', { required: false, blank: 'The site' })}</div>`
  const create = manage ? card('Register an asset', form('asset.create', '/app/assets/{id}', h`${identityFields(catalog)}${where}${await customInputs(env, 'asset')}`, 'Register asset'), { id: 'register' }) : ''
  return page(env, 'Assets', actor, h`<div class="gk-head"><div><h1>Assets</h1><p class="gk-lede">The equipment this site owns and keeps in service.</p></div></div>${filters}${can(actor,'history.export') ? h`<p><a href="/app/assets.csv?field=${customFilter ?? ''}&amp;value=${customValue ?? ''}">Download register CSV</a></p>` : ''}${rows.length ? h`${list}${create}` : h`<div class="gk-columns gk-columns-even"><div class="gk-col-main">${list}</div><div class="gk-col-side">${create}</div></div>`}`, { url })
}

export async function assetPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const { asset, orders, events, downtimeMinutes } = await assetHistory(env, actor, id)
  const manage = can(actor, 'register.manage') && !asset.retired_at
  const back = `/app/assets/${asset.id}`
  // PLAN-006: opening the page reads its thread; the card still marks what was unread.
  await readThread(env, actor, 'asset', asset.id)
  const band = headerBand({ id: 'asset-name', eyebrow: `${asset.tag}${asset.category ? ` · ${asset.category}` : ''}`, title: asset.name,
    facts: [`Model ${asset.model ?? 'unknown'}`, `Serial ${asset.serial ?? '—'}`, asset.location, `Custodian: ${asset.custodian ?? '—'}`], status: tag(STATUS[asset.status]),
    meta: [{ label: 'Criticality', value: asset.criticality_label ?? asset.criticality }, { label: 'Downtime recorded', value: `${downtimeMinutes} minutes` }],
    art: machine(asset, 'band') })
  const meters = card('Meters', h`${asset.meters.length ? table(['Meter', 'Latest'], asset.meters.map((meter: any) => [h`${meter.name}<span class="gk-sub">${meter.kind === 'counter' ? 'Counter' : meter.kind === 'gauge' ? 'Gauge' : 'Condition'}</span>`,
      meter.latest ? h`${meter.kind === 'condition' ? meter.latest.charAt(0).toUpperCase() + meter.latest.slice(1) : amount(meter.latest, meter.unit)}<span class="gk-sub">Taken ${showLocal(meter.latest_on)}</span>${meter.kind === 'counter' && meter.normalized !== meter.latest ? h`<span class="gk-sub">Total across counter changes ${amount(meter.normalized, meter.unit)}</span>` : ''}${meter.held ? h`<span class="gk-sub">${tag('Suspect')} ${meter.held} flagged reading${meter.held === 1 ? '' : 's'} held back</span>` : ''}` : '—']), 'Meters', { wrap: [0] }) : h`<p class="gk-muted">No meters yet.</p>`}
    ${asset.meters.length ? h`<p class="gk-muted">${asset.meters.map((meter: any) => `${meter.name}: feed readings are stale after ${meter.feed_window_hours} h`).join(' · ')}. Readings taken on a work order are never aged.</p>` : ''}
    ${manage ? form('meter.create', back, h`${hidden('asset', asset.id)}<div class="gk-grid">${field('Meter name', 'name', { hint: 'For example Run hours or Oil condition.' })}${field('Unit', 'unit', { hint: 'hrs, °F, psi, mi… use "condition" for good/fair/poor.' })}${select('Kind', 'kind', [{ value: 'counter', label: 'Counter (never goes down)' }, { value: 'gauge', label: 'Gauge (a measured value)' }, { value: 'condition', label: 'Condition (good, fair or poor)' }], 'counter')}${field('Feed readings stale after (hours)', 'feedWindowHours', { type: 'number', value: 24, required: false, hint: 'How late a feed reading may arrive. A daily export might need 36.' })}</div>`, 'Add meter', { secondary: true }) : ''}
    ${manage && asset.meters.length ? form('meter.window', back, h`<div class="gk-grid">${select('Meter', 'meter', asset.meters.map((meter: any) => ({ value: meter.id, label: meter.name })))}${field('Feed readings stale after (hours)', 'feedWindowHours', { type: 'number', hint: 'Readings already kept keep their quality.' })}</div>`, 'Set feed window', { secondary: true }) : ''}`, { id: 'meters' })
  const readings = meterReadings(asset, manage, back)
  const place = hierarchyCard(asset, manage, manage ? await parentChoices(env, asset, asset.level) : [], back)
  const status = assetStates(asset, manage, back)
  const work = card('Work orders', orders.length ? table(['Work order', 'Due', 'Status'], orders.map(order => [h`<a href="/app/work/${order.id}"><span class="gk-nowrap">${woNumber(order.number)}</span> · ${order.title}</a>${order.checklist ? h`<span class="gk-sub">${order.checklist}, revision ${order.revision}</span>` : ''}`, showDate(order.due_date), tag(STATUS[order.status])]), 'Work orders', { wrap: [0] }) : h`<p class="gk-muted">No work orders yet.</p>`, { id: 'work' })
  const templates = (await templateList(env)).filter(row => !row.retired_at)
  const corrective = await createsWork(env, actor) && !asset.retired_at ? card('Raise corrective work', form('workorder.create', '/app/work/{id}', h`${hidden('asset', asset.id)}${templates.length ? select('From template', 'template', templates.map(row => ({ value: row.id, label: row.name })), '', { required: false, blank: 'No template' }) : ''}${field('What needs doing', 'title', { required: !templates.length, hint: templates.length ? 'Leave empty to use the template\'s title.' : '' })}${area('Details', 'description', { required: false })}<div class="gk-grid">${select('Priority', 'priority', [{ value: '', label: 'Template or normal' }, ...PRIORITIES.map(value => ({ value, label: PRIORITY_LABELS[value] }))], '', { required: false })}${field('Due', 'due', { type: 'date', value: addDays(actor.today, 7) })}${await assignChoice(env, actor)}</div>${doneAlready(actor)}`, 'Raise work order', { secondary: true }), { id: 'corrective' }) : ''
  const sightings = card('Sightings', h`${asset.sightings.length ? table(['Outcome', 'Seen at', 'Note'], asset.sightings.map((row: any) => [h`${tag(row.outcome === 'found' ? 'Found' : row.outcome === 'elsewhere' ? 'Found elsewhere' : 'Missing')}<span class="gk-sub">${showInstant(row.recorded_at, actor.zone)}</span>`, row.seen_location ?? '—', row.note ?? '']), 'Sightings', { wrap: [1, 2] }) : h`<p class="gk-muted">Not physically checked yet.</p>`}
    ${can(actor, 'register.manage') ? form('asset.sighting', back, h`${hidden('asset', asset.id)}<div class="gk-grid">${select('What you found', 'outcome', [{ value: 'found', label: `Found at ${asset.location}` }, { value: 'elsewhere', label: 'Found somewhere else' }, { value: 'missing', label: 'Not found' }], 'found')}${field('Where it was (if elsewhere)', 'seenLocation', { required: false })}</div>${field('Note', 'note', { required: false })}`, 'Record sighting', { secondary: true }) : ''}`, { id: 'sightings' })
  const history = card('History', h`${events.length ? table(['When', 'Work order', 'What', 'Who'], events.map(event => [event.when, event.workOrder ?? '—', event.what, event.who ?? '—']), 'History', { wrap: [2] }) : h`<p class="gk-muted">No history yet.</p>`}
    ${can(actor, 'history.export') ? h`<p><a class="gk-button gk-secondary" href="/app/assets/${asset.id}/history.csv">Download history (CSV)</a></p>` : ''}`, { id: 'history' })
  const edit = manage ? card('Change details', h`${form('asset.update', back, h`${hidden('asset', asset.id)}${hidden('revision', asset.revision)}${identityFields(await codeList(env, 'criticality'), asset)}${await customInputs(env, 'asset', asset.category, asset.customFields)}`, 'Save changes', { secondary: true })}
    ${form('asset.retire', '/app/assets', h`${hidden('asset', asset.id)}${field('Reason to retire', 'reason', { hint: 'Retiring keeps all history. Close or cancel its open work first.' })}${disposalFields}`, 'Retire asset', { secondary: true })}`, { id: 'edit' }) : ''
  const earlier = asset.versions.length ? details(asset.versions.map((version: any) => [`Revision ${version.revision} (${showInstant(version.changed_at, actor.zone)})`, Object.entries(version.value).map(([key, value]) => `${key}: ${value ?? '—'}`).join(' · ')])) : ''
  const body = h`${backLink('/app/assets', 'Assets')}${band}<div class="gk-columns"><div class="gk-col-main">${await customCard(env, actor, 'asset', asset.id, asset.category, back)}${work}${lifecycleCard(asset, manage, can(actor, 'history.export'), back)}${documentsCard(asset, actor.zone, manage, back, (await assignable(env)).map(person => ({ id: person.id, name: person.name })))}${bomCard(asset.bom, actor.zone, manage ? bomForm(asset.bom, asset.id, back, await partList(env, actor)) : '')}${history}${commentsCard(asset.comments, actor, { field: 'asset', id: asset.id }, back, await mentionable(env, actor))}</div><div class="gk-col-side">${place}${status}${meters}${readings}${sightings}${corrective}${edit}${earlier}</div></div>`
  return page(env, asset.name, actor, body, { url })
}

const QUALITY: Record<string, string> = { good: 'Good', suspect: 'Suspect', stale: 'Stale (late)' }
const CHANGE: Record<string, string> = { reset: 'Reset', replacement: 'Replacement', rollover: 'Rollover', correction: 'Correction' }
const shown = (meter: any, value: string) => meter.kind === 'condition' ? value.charAt(0).toUpperCase() + value.slice(1) : amount(value, meter.unit)

/** ASSET-005: every reading with its source and receipt times, where it came from and its quality; counter changes and corrections, each with its reason. */
function meterReadings(asset: any, manage: boolean, back: string) {
  const rows = asset.meters.flatMap((meter: any) => meter.readings.map((row: any) => ({ meter, row }))).toSorted((a: any, b: any) => b.row.taken_on.localeCompare(a.row.taken_on))
  const changes = asset.meters.flatMap((meter: any) => meter.adjustments.map((row: any) => ({ meter, row })))
  if (!rows.length && !changes.length && !manage) return ''
  const counters = asset.meters.filter((meter: any) => meter.kind === 'counter')
  const list = rows.length ? table(['Reading', 'Taken · received', 'From', 'Quality'], rows.map(({ meter, row }: any) => [
    h`${meter.name}: ${shown(meter, row.value)}${row.correction ? h`<span class="gk-sub">Recorded as ${shown(meter, row.recorded_value)}; corrected: ${row.correction.reason}</span>` : ''}${meter.kind === 'counter' && row.normalized !== row.value ? h`<span class="gk-sub">Total ${amount(row.normalized, meter.unit)}</span>` : ''}`,
    h`${showLocal(row.taken_on)}<span class="gk-sub">Received ${showLocal(row.received_on)}</span>`,
    row.provenance === 'feed' ? `Feed: ${row.source}` : row.provenance === 'import' ? 'Moved in' : row.entered_by ?? 'Manual',
    row.correction ? tag('Corrected') : tag(QUALITY[row.quality])]), 'Meter readings', { wrap: [0, 2] }) : h`<p class="gk-muted">No readings yet.</p>`
  const history = changes.length ? table(['Change', 'Reason'], changes.map(({ meter, row }: any) => [
    h`${meter.name}: ${CHANGE[row.kind]}<span class="gk-sub">${row.kind === 'correction' ? `To ${row.value}` : `At ${showLocal(row.effective_on)}: last ${row.last_value}, new counter from ${row.start_value}`}</span>`, h`${row.reason}<span class="gk-sub">${row.recorded_by ?? ''}, ${showLocal(row.recorded_on)}</span>`]), 'Meter changes', { wrap: [0, 1] }) : ''
  const forms = manage ? h`${counters.length ? form('meter.adjust', back, h`<div class="gk-grid">${select('Counter', 'meter', counters.map((meter: any) => ({ value: meter.id, label: meter.name })))}${select('What happened', 'kind', COUNTER_CHANGES.map(kind => ({ value: kind, label: CHANGE[kind] })))}
      ${field('When', 'effectiveOn', { type: 'datetime-local' })}${field('Last value on the old count', 'lastValue', { attrs: 'inputmode="decimal"' })}${field('New counter starts at', 'startValue', { value: '0', attrs: 'inputmode="decimal"' })}</div>${field('Reason', 'reason', { hint: 'Kept with the change; readings already kept are never rewritten.' })}`, 'Record counter change', { secondary: true }) : ''}
    ${rows.length ? form('meter.adjust', back, h`${hidden('kind', 'correction')}<div class="gk-grid">${select('Reading to correct', 'reading', rows.map(({ meter, row }: any) => ({ value: row.id, label: `${meter.name} ${row.value}, taken ${showLocal(row.taken_on)}` })))}${field('Correct value', 'value', { attrs: 'inputmode="decimal"' })}</div>${field('Reason', 'reason')}`, 'Correct reading', { secondary: true }) : ''}` : ''
  return card('Meter readings', h`${list}${history}${forms}`, { id: 'readings' })
}

const STATE_OPTIONS = [{ value: 'in_service', label: 'In service' }, { value: 'degraded', label: 'Degraded (running with a fault)' }, { value: 'down', label: 'Down (stopped by a failure)' }, { value: 'out_of_service', label: 'Out of service (taken out on purpose)' }]

/** ASSET-004: the declared state's history with reasons and reclassifications, and where the evidence disagrees with it. */
function assetStates(asset: any, manage: boolean, back: string) {
  if (!asset.states.length && !manage) return ''
  const conflicts = asset.conflicts.map((row: any) => row.kind === 'open_downtime'
    ? h`<p>${tag('Evidence disagrees')} Declared ${STATUS[row.declared]}, but downtime has been open since ${showLocal(row.since)}: ${row.reason}.</p>`
    : h`<p>${tag('Evidence disagrees')} Declared ${STATUS[row.declared]}, but ${row.source} shows ${row.meter} rising from ${amount(row.from, row.unit)} to ${amount(row.to, row.unit)} by ${showLocal(row.at)}.</p>`)
  const list = asset.states.length ? table(['State', 'Effective', 'Reason'], asset.states.map((row: any) => [
    h`${tag(STATUS[row.state])}${row.corrected_by ? h`<span class="gk-sub">Reclassified later</span>` : ''}${row.corrects ? h`<span class="gk-sub">Reclassifies an earlier entry</span>` : ''}`,
    showLocal(row.effective_on), h`${row.reason}<span class="gk-sub">${row.recorded_by ?? ''}</span>`]), 'State history', { wrap: [2] }) : h`<p class="gk-muted">No state declared; it reads as in service unless downtime is open.</p>`
  const change = manage ? form('asset.state', back, h`${hidden('asset', asset.id)}<div class="gk-grid">${select('State', 'state', STATE_OPTIONS)}${field('Effective from', 'effectiveOn', { type: 'datetime-local', required: false })}</div>
    ${asset.states.length ? select('Reclassify an earlier entry', 'corrects', asset.states.map((row: any) => ({ value: row.id, label: `${STATUS[row.state]} from ${showLocal(row.effective_on)}` })), '', { required: false, blank: 'No, this is a new change' }) : ''}${field('Reason', 'reason')}`, 'Record state', { secondary: true }) : ''
  return card('State', h`${conflicts}${list}${change}`, { id: 'state' })
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** ASSET-001: where the entry sits, what is below it, its roll-ups and the lead's move. */
function hierarchyCard(asset: any, manage: boolean, choices: { id: string; tag: string; name: string; level: string }[], back: string) {
  const { hierarchy: place } = asset, totals = place.subtree, cost = totals.movedInCostCents
  const path = h`<a href="/app/assets">The site</a>${place.path.map((row: any) => h` › <a href="/app/assets/${row.id}">${row.tag}</a>`)} › ${asset.tag}`
  return card('Hierarchy', h`<p>${LEVEL_LABELS[place.level as Tier]}<span class="gk-sub">${path}</span></p>
    ${place.children.length ? h`<ul class="gk-plain-list">${place.children.map((row: any) => h`<li><a href="/app/assets/${row.id}">${row.tag} ${row.name}</a><span class="gk-sub">${LEVEL_LABELS[row.level as Tier]}${row.retired ? ' · retired' : ''}</span></li>`)}</ul>` : ''}
    ${totals.below.length ? h`<dl class="gk-readings"><div><dt>Below this asset</dt><dd>${totals.below.length}</dd></div><div><dt>Open work, this and below</dt><dd>${totals.openWork}</dd></div>
      <div><dt>Downtime, this and below</dt><dd>${totals.downtimeMinutes} minutes<span class="gk-sub">Ended outages, overlapping ones counted once${totals.downtimeOverlapMinutes ? ` (${totals.downtimeOverlapMinutes} shared minutes)` : ''}${totals.downNow.length ? `. Down now: ${totals.downNow.join(', ')}` : ''}</span></dd></div>
      <div><dt>Moved-in cost, this and below</dt><dd>${money(cost.parts + cost.labor + cost.other)}<span class="gk-sub">Parts ${money(cost.parts)} · labor ${money(cost.labor)} · other ${money(cost.other)}</span></dd></div></dl>` : ''}
    ${manage && (choices.length || place.parent) ? form('asset.move', back, h`${hidden('asset', asset.id)}${hidden('revision', asset.revision)}${select('Move under', 'parent', choices.filter(row => row.id !== place.parent?.id).map(row => ({ value: row.id, label: `${row.tag} ${row.name} (${LEVEL_LABELS[row.level as Tier]})` })), '', { required: false, blank: 'The site' })}`, 'Move with everything below', { secondary: true }) : ''}`, { id: 'hierarchy' })
}
