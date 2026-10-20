// AGENT-003: a reproducible comparison of recorded evidence, never a causal
// prediction or an invoked model. Approval, maintenance limits and rollback
// authority belong to the proposal command, not this read-only calculation.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, insist, one, type Row } from './core'
import { addDays, daysBetween, isDate, localNow, minutesBetween, zonedInstant } from './dates'
import { Input } from './input'
import { meterState } from './meters'
import { addMeter, compareMeter, meterNumber } from './quantity'
import { classifiedStops, HOUR_UNITS } from './reliability'

const round1 = (value: number) => Math.round(value * 10) / 10
const sum = (rows: Row[], field: string) => rows.reduce((total, row) => total + Number(row[field]), 0)
const difference = (last: string, first: string) => addMeter(last, first === '0' ? '0' : first.startsWith('-') ? first.slice(1) : `-${first}`)

/** Only the trusted proposal rollback path may bypass the extension evidence
 * gate. It must first verify the original approval, unchanged revision and
 * applicable maintenance limits; caller payload fields cannot enable it. */
export async function intervalEvidence(env: Bindings, actor: Actor, payload: Record<string, string>, options: { rollback?: boolean } = {}) {
  requireCapability(actor, 'proposal.prepare')
  const input = Input.of(payload)
  const schedule = await one<Row>(env, 'SELECT * FROM gk_schedules WHERE id = ?', input.text('schedule', { max: 100 }))
  insist(schedule, 'schedule_not_found', 404)
  insist(schedule.active && schedule.asset_id, 'interval_requires_active_asset_schedule', 409)
  const subject = await one<Row>(env, 'SELECT * FROM gk_assets WHERE id = ?', schedule.asset_id)
  insist(subject && !subject.retired_at, 'asset_not_found', 404)

  const hasDays = input.has('everyDays'), hasUnits = input.has('everyUnits')
  insist(hasDays || hasUnits, 'interval_required')
  insist(!hasDays || schedule.every_days, 'calendar_interval_required', 409)
  insist(!hasUnits || schedule.every_units, 'counter_interval_required', 409)
  const toDays = hasDays ? input.integer('everyDays', { min: 1, max: 3660 })! : schedule.every_days as number | null
  const toUnits = hasUnits ? meterNumber(input.text('everyUnits', { max: 30 }), 'everyUnits') : schedule.every_units as string | null
  if (toUnits !== null) insist(compareMeter(toUnits, '0') > 0, 'invalid_everyUnits')
  const dayDelta = hasDays ? Math.sign(toDays! - schedule.every_days) : 0
  const unitDelta = hasUnits ? compareMeter(toUnits!, schedule.every_units) : 0
  insist(dayDelta || unitDelta, 'interval_unchanged', 409)
  const extension = dayDelta > 0 || unitDelta > 0
  const direction = extension ? 'extension' : 'shortening'
  const rollbackPlan = input.text('rollbackPlan', { max: 2000 })

  const from = input.text('from', { max: 10 }), to = input.text('to', { max: 10 })
  // Complete historical days give identical results when reviewed later;
  // neither an elapsed open stop nor the current clock enters the basis.
  insist(isDate(from) && isDate(to) && from <= to && to < actor.today && daysBetween(from, to) <= 366, 'invalid_period')
  const start = `${from}T00:00`, end = `${addDays(to, 1)}T00:00`
  const startAt = zonedInstant(actor.zone, start), endAt = zonedInstant(actor.zone, end)
  const inside = (at: string) => at >= start && at < end
  const instantInside = (at: number | null) => at !== null && at >= startAt && at < endAt
  const peerIds = input.text('peers', { optional: true, max: 2100 }).split(',').map(id => id.trim()).filter(Boolean)
  insist(peerIds.length >= 1 && peerIds.length <= 20 && new Set(peerIds).size === peerIds.length && !peerIds.includes(subject.id), 'invalid_peers')
  const sortedPeers = peerIds.toSorted()
  const peers = await Promise.all(sortedPeers.map(id => one<Row>(env, 'SELECT * FROM gk_assets WHERE id = ?', id)))
  for (let index = 0; index < peers.length; index++) {
    const peer = peers[index]
    insist(peer && !peer.retired_at && subject.category && peer.category === subject.category, 'peer_not_comparable', 409, { asset: sortedPeers[index] })
  }
  const members = [subject, ...peers as Row[]], ids = members.map(asset => asset.id), slots = ids.map(() => '?').join(',')
  const stopScope = `d.asset_id IN (${slots}) AND d.started_on < ? AND (d.ended_on IS NULL OR d.ended_on > ?)`
  const [meters, work, importedWork, stops, classes, costs] = await Promise.all([
    all<Row>(env, `SELECT * FROM gk_meters WHERE asset_id IN (${slots}) ORDER BY name, id`, ...ids),
    all<Row>(env, `SELECT * FROM gk_work_orders WHERE asset_id IN (${slots}) ORDER BY number, id`, ...ids),
    all<Row>(env, `SELECT * FROM gk_work_history WHERE asset_id IN (${slots}) AND completed_on >= ? AND completed_on < ? ORDER BY completed_on, id`, ...ids, start, end),
    classifiedStops(env, stopScope, ...ids, end, start),
    all<Row>(env, `SELECT c.* FROM gk_downtime_classes c JOIN gk_downtime d ON d.id = c.downtime_id WHERE ${stopScope} ORDER BY c.recorded_at, c.id`, ...ids, end, start),
    all<Row>(env, `SELECT c.*, w.asset_id FROM gk_work_costs c JOIN gk_work_orders w ON w.id = c.work_order_id WHERE w.asset_id IN (${slots}) AND c.recorded_at >= ? AND c.recorded_at < ? ORDER BY c.recorded_at, c.id`, ...ids, startAt, endAt),
  ])
  // Source edits after the selected period still invalidate a pending decision:
  // the human must see the current history, not an earlier snapshot of it.
  const sourceRevision = (await one<{ seq: number }>(env, `SELECT COALESCE(MAX(seq),0) AS seq FROM gk_audit WHERE subject IN (${slots}) OR subject IN (SELECT id FROM gk_work_orders WHERE asset_id IN (${slots})) OR subject IN (SELECT id FROM gk_meters WHERE asset_id IN (${slots})) OR subject=?`, ...ids, ...ids, ...ids, schedule.id))!.seq
  const states = await Promise.all(meters.map(meter => meterState(env, meter.id)))
  const uncertainty = ['This is an observational category cohort; duty, age, environment and unrecorded maintenance may differ. No causal reliability improvement or cost saving is established.']

  const assets = members.map(asset => {
    const assetStates = states.filter(state => state.meter.asset_id === asset.id)
    const hourState = assetStates.find(state => state.meter.kind === 'counter' && HOUR_UNITS.includes(String(state.meter.unit).toLowerCase()))
    // Counter changes carry normalization but are not substitute observations:
    // coverage must have two actual good readings at different source times.
    const good = (hourState?.readings ?? []).filter(reading => reading.standing === 'good' && inside(reading.taken_on))
      .toSorted((a, b) => a.taken_on.localeCompare(b.taken_on) || compareMeter(a.normalized, b.normalized) || a.id.localeCompare(b.id))
    const first = good[0], last = good.at(-1)
    const hasExposure = Boolean(first && last && first.taken_on < last.taken_on && compareMeter(last.normalized, first.normalized) >= 0)
    const exactHours = hasExposure ? difference(last!.normalized, first.normalized) : null
    const operatingHours = exactHours === null ? null : Number(exactHours)
    const unknownHours = round1((hasExposure ? minutesBetween(start, first.taken_on) + minutesBetween(last!.taken_on, end) : minutesBetween(start, end)) / 60)
    const assetStops = stops.filter(stop => stop.asset_id === asset.id).map(stop => ({
      ...stop, classificationSources: classes.filter(row => row.downtime_id === stop.id),
      clippedFrom: stop.started_on < start ? start : stop.started_on,
      clippedTo: stop.ended_on && stop.ended_on < end ? stop.ended_on : end,
      windowMinutes: minutesBetween(stop.started_on < start ? start : stop.started_on, stop.ended_on && stop.ended_on < end ? stop.ended_on : end),
    }))
    const failures = assetStops.filter(stop => !stop.degraded && !stop.planned)
    const coveredFailures = failures.filter(stop => hasExposure && stop.started_on >= first.taken_on && stop.started_on <= last!.taken_on)
    const assetCosts = costs.filter(row => row.asset_id === asset.id)
    const relevant = work.filter(row => row.asset_id === asset.id && (
      row.due_date >= from && row.due_date <= to || instantInside(row.created_at) || instantInside(row.submitted_at) || instantInside(row.closed_at)
      || assetStops.some(stop => stop.work_order_id === row.id) || assetCosts.some(cost => cost.work_order_id === row.id)))
    const pm = relevant.filter(row => row.kind === 'preventive')
    const completed = pm.filter(row => row.status === 'closed' && instantInside(row.closed_at))
    const closedSchedulePMs = completed.filter(row => row.schedule_id === schedule.id).length
    // As in schedule attainment, submission is the technician's completion;
    // independent approval delay alone does not make a PM late.
    const late = completed.filter(row => localNow(actor.zone, row.submitted_at ?? row.closed_at).slice(0, 10) > row.due_date)
    const due = pm.filter(row => row.due_date >= from && row.due_date <= to && row.status !== 'cancelled')
    const overdue = due.filter(row => !row.submitted_at || row.submitted_at >= endAt)
    const history = importedWork.filter(row => row.asset_id === asset.id)
    const importedWithCosts = history.filter(row => ['parts_cents', 'labor_cents', 'other_cents'].some(field => row[field] !== null))
    const missingCosts = relevant.filter(row => row.status !== 'cancelled' && !assetCosts.some(cost => cost.work_order_id === row.id)).map(row => row.id)
    if (operatingHours === null || operatingHours <= 0) uncertainty.push(`${asset.tag}: no positive operating-hour exposure from two good hour-meter readings.`)
    if (unknownHours > 0) uncertainty.push(`${asset.tag}: ${unknownHours} calendar hours outside hour-meter observations have unknown operating exposure.`)
    if (!completed.length) uncertainty.push(`${asset.tag}: no independently closed native preventive work in this period.`)
    else if (asset.id === subject.id && !closedSchedulePMs) uncertainty.push(`${asset.tag}: no closed preventive work belongs to the schedule being changed in this period.`)
    if (missingCosts.length) uncertainty.push(`${asset.tag}: ${missingCosts.length} relevant work orders have no actual cost entries posted in the period; missing costs are unknown.`)
    if (history.length) uncertainty.push(`${asset.tag}: imported completed work has no recorded due date for lateness comparison; imported costs are shown separately by completion date.`)
    const readings = assetStates.flatMap(state => state.readings.filter(row => inside(row.taken_on)))
    const held = readings.filter(row => row.standing !== 'good')
    if (held.length) uncertainty.push(`${asset.tag}: ${held.length} stale or suspect readings are retained but excluded from operating-hour evidence.`)
    return {
      ...asset, id: asset.id as string, tag: asset.tag as string, name: asset.name as string, category: asset.category as string | null,
      role: asset.id === subject.id ? 'subject' : 'peer',
      operatingHours, operatingHoursExact: exactHours, unknownHours,
      coverage: { meter: hourState?.meter ?? null, from: hasExposure ? first.taken_on : null, to: hasExposure ? last!.taken_on : null, readingIds: good.map(row => row.id) },
      failures: failures.length, failuresStarted: failures.filter(stop => inside(stop.started_on)).length, coveredFailures: coveredFailures.length,
      failuresPer1000Hours: operatingHours && coveredFailures.length ? round1(coveredFailures.length / operatingHours * 1000) : operatingHours ? 0 : null,
      mtbfHours: operatingHours !== null && coveredFailures.length ? round1(operatingHours / coveredFailures.length) : null,
      completedPMs: completed.length, closedSchedulePMs,
      latePMs: late.length, overduePMs: overdue.length, duePMs: due.length,
      completedPMIds: completed.map(row => row.id), latePMIds: late.map(row => row.id), overduePMIds: overdue.map(row => row.id),
      actualCostCents: assetCosts.length ? sum(assetCosts, 'cents') : null, costUnknownWorkIds: missingCosts,
      importedCompletedPMs: history.filter(row => row.kind === 'preventive').length,
      importedKnownCostCents: importedWithCosts.length ? importedWithCosts.reduce((total, row) => total + (row.parts_cents ?? 0) + (row.labor_cents ?? 0) + (row.other_cents ?? 0), 0) : null,
      importedUnknownCostFields: history.reduce((total, row) => total + ['parts_cents', 'labor_cents', 'other_cents'].filter(field => row[field] === null).length, 0),
      downtimeMinutes: sum(assetStops.filter(stop => !stop.degraded), 'windowMinutes'), failureDowntimeMinutes: sum(failures, 'windowMinutes'),
      plannedDowntimeMinutes: sum(assetStops.filter(stop => !stop.degraded && stop.planned), 'windowMinutes'), degradedMinutes: sum(assetStops.filter(stop => stop.degraded), 'windowMinutes'),
      meters: assetStates.map(state => state.meter), readings,
      meterAdjustments: assetStates.flatMap(state => state.adjustments), work: relevant, importedWork: history, stops: assetStops, costEntries: assetCosts,
    }
  })

  const reasons: string[] = []
  if (!peers.length) { reasons.push('no_comparable_peers'); uncertainty.push('No comparable peer assets were supplied.') }
  for (const asset of assets) {
    if (asset.operatingHours === null || asset.operatingHours <= 0) reasons.push(`${asset.id}:missing_operating_hours`)
    if (asset.role === 'subject' ? !asset.closedSchedulePMs : !asset.completedPMs) reasons.push(`${asset.id}:no_closed_pm_evidence`)
    if (asset.failures) reasons.push(`${asset.id}:recorded_failures`)
  }
  if (extension && !options.rollback) insist(!reasons.length, 'unsupported_interval_extension', 409, { reasons, uncertainty })
  const change = { fromDays: schedule.every_days as number | null, toDays, fromUnits: schedule.every_units as string | null, toUnits, direction }
  const calendarFrequencyChangePercent = dayDelta ? round1((schedule.every_days / toDays! - 1) * 100) : null
  const meterFrequencyChangePercent = unitDelta ? round1((Number(schedule.every_units) / Number(toUnits) - 1) * 100) : null
  const expectedEffect = options.rollback
    ? 'Restores an earlier human-approved maintenance interval. This restoration is not an evidence-supported reliability forecast; observed failures, exposure gaps and costs remain disclosed.'
    : extension
      ? 'A longer interval reduces nominal PM frequency and increases time or counter exposure between PMs. The observed cohort has no recorded failures and has PM and operating-hour evidence; future failure risk, downtime and savings remain unproven.'
      : 'A shorter interval increases nominal PM frequency and reduces time or counter exposure between PMs, with more planned maintenance effort. The recorded histories do not establish how much failure risk or downtime will change.'
  return {
    sourceRevision, schedule, from, to, window: { start, end, zone: actor.zone }, change, rollbackPlan,
    method: 'deterministic_record_comparison', assets,
    comparison: { subject: subject.id, peers: peers.map(peer => peer!.id), category: subject.category,
      rows: assets.map(asset => ({ asset: asset.id, operatingHours: asset.operatingHours, unknownHours: asset.unknownHours, failures: asset.failures,
        failuresPer1000Hours: asset.failuresPer1000Hours, completedPMs: asset.completedPMs, latePMs: asset.latePMs, actualCostCents: asset.actualCostCents, downtimeMinutes: asset.downtimeMinutes })) },
    uncertainty, expectedEffect, calendarFrequencyChangePercent, meterFrequencyChangePercent,
    extensionEvidence: { supported: !reasons.length, reasons, rollbackRestoration: Boolean(options.rollback) },
    definitions: [
      'Period includes both site-local dates, ends at midnight after to, and contains complete past days only.',
      'Failures are non-planned, non-degraded stops overlapping the period using the latest retained classification. Downtime is clipped wall-clock minutes, not estimated production loss.',
      'Operating hours use the first hour counter by name and ID, and its first and last actual good readings inside the period, normalized for corrections and counter changes. Outside their span exposure is unknown.',
      'Failure rates use only failures starting inside the observed hour-meter span. Zero recorded failures does not establish zero future risk.',
      'Completed PMs are native preventive work independently closed in the period. Late PMs were submitted after their due date; without submission time, closure time is used. Overdue PMs were due in the period and had no submission before its end.',
      'Actual costs are USD cents from cost entries posted in the period, including correction entries. No entries means unknown. Imported cost fields are separate and grouped by work completion date.',
      'Nominal frequency changes assume unchanged use and exclude calendar closures, other due triggers and combined cadence. They are arithmetic, not predicted labor, savings or reliability outcomes.',
    ],
    citations: { schedule: schedule.id, assets: ids, meters: meters.map(row => row.id), readings: assets.flatMap(asset => asset.readings.map(row => row.id)),
      meterAdjustments: assets.flatMap(asset => asset.meterAdjustments.map(row => row.id)), work: assets.flatMap(asset => asset.work.map(row => row.id)),
      importedWork: importedWork.map(row => row.id), downtime: stops.map(row => row.id), classifications: classes.map(row => row.id), costs: costs.map(row => row.id) },
  }
}
