import { outcomeIntervention } from './outcome-intervention'
// AGENT-004: measured, observational follow-up of a human-approved interval.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { auditFence, auditRevision } from './agent-follow-up'
import { all, commit, insist, newId, now, one, sha256Hex, stmt, type Row } from './core'
import { addDays, daysBetween, isDate, localNow, minutesBetween, zonedInstant } from './dates'
import type { Input } from './input'
import { meterState } from './meters'
import { addMeter, compareMeter } from './quantity'
import { classifiedStops, HOUR_UNITS } from './reliability'

const sum = (rows: Row[], field: string) => rows.reduce((total, row) => total + Number(row[field]), 0)
const keys = ['failuresPerHour', 'downtimeMinutesPerHour', 'costCentsPerHour'] as const
type Rates = Record<typeof keys[number], number | null>
const rates = (hours: number | null, failures: number, downtime: number, cost: number | null): Rates => ({
  failuresPerHour: hours && hours > 0 ? failures / hours : null,
  downtimeMinutesPerHour: hours && hours > 0 ? downtime / hours : null,
  costCentsPerHour: hours && hours > 0 && cost !== null ? cost / hours : null,
})
const delta = (before: Rates, after: Rates): Rates => Object.fromEntries(keys.map(key => [key, before[key] === null || after[key] === null ? null : after[key]! - before[key]!])) as Rates
const sign = (value: number) => Math.abs(value) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 8 ? 0 : Math.sign(value)

// The authenticated internal record-read scope is the same as work and proposals.
export async function readOutcome(env: Bindings, _actor: Actor, id: string) {
  const stored = await one<Row>(env, 'SELECT report_json FROM gk_outcome_assessments WHERE id=?', id)
  insist(stored, 'outcome_not_found', 404)
  return JSON.parse(stored.report_json)
}

export async function assessOutcome(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'proposal.prepare')
  const fence = await auditRevision(env)
  const plan = await one<Row>(env, 'SELECT * FROM gk_outcome_windows WHERE id=?', input.text('window', { max: 100 }))
  insist(plan, 'outcome_window_not_found', 404)
  const intervention=await outcomeIntervention(env,plan.proposal_id,plan.work_order_id)
  const approvalDay=localNow(actor.zone,plan.source_approved_at).slice(0,10)
  const window = (from: string, to: string) => {
    insist(isDate(from) && isDate(to) && from <= to && to < actor.today && daysBetween(from, to) <= 366, 'invalid_period')
    const start = `${from}T00:00`, end = `${addDays(to, 1)}T00:00`
    return { from, to, start, end, startAt: zonedInstant(actor.zone, start), endAt: zonedInstant(actor.zone, end), zone: actor.zone }
  }
  const baseline = window(plan.baseline_from, plan.baseline_to), post = window(plan.post_from, plan.post_to)
  insist(baseline.to < approvalDay && post.from >= approvalDay && baseline.to < post.from, 'invalid_outcome_windows')
  const peerIds: unknown = JSON.parse(plan.peers_json)
  insist(Array.isArray(peerIds) && peerIds.length >= 1 && peerIds.length <= 20 && peerIds.every(id => typeof id === 'string') && new Set(peerIds).size === peerIds.length && !peerIds.includes(intervention.asset), 'invalid_peers')
  const ids = [intervention.asset as string, ...(peerIds as string[]).toSorted()], slots = ids.map(() => '?').join(',')
  const assets = await Promise.all(ids.map(id => one<Row>(env, 'SELECT * FROM gk_assets WHERE id=?', id)))
  const subjectAsset = assets[0]
  insist(subjectAsset && !subjectAsset.retired_at, 'asset_not_found', 404)
  assets.slice(1).forEach((asset, index) => insist(asset && !asset.retired_at && subjectAsset.category && asset.category === subjectAsset.category, 'peer_not_comparable', 409, { asset: ids[index + 1] }))
  const stopScope = `d.asset_id IN (${slots}) AND d.started_on < ? AND (d.ended_on IS NULL OR d.ended_on > ?)`
  const [meters, work, stops, classifications, costs, lifecycle] = await Promise.all([
    all<Row>(env, `SELECT * FROM gk_meters WHERE asset_id IN (${slots}) ORDER BY name,id`, ...ids),
    all<Row>(env, `SELECT * FROM gk_work_orders WHERE asset_id IN (${slots}) ORDER BY id`, ...ids),
    classifiedStops(env, stopScope, ...ids, post.end, baseline.start),
    all<Row>(env, `SELECT c.* FROM gk_downtime_classes c JOIN gk_downtime d ON d.id=c.downtime_id WHERE ${stopScope} ORDER BY c.recorded_at,c.id`, ...ids, post.end, baseline.start),
    all<Row>(env, `SELECT c.*,w.asset_id FROM gk_work_costs c JOIN gk_work_orders w ON w.id=c.work_order_id WHERE w.asset_id IN (${slots}) AND c.recorded_at>=? AND c.recorded_at<? ORDER BY c.recorded_at,c.id`, ...ids, baseline.startAt, post.endAt),
    all<Row>(env, `SELECT * FROM gk_asset_lifecycle WHERE asset_id IN (${slots}) ORDER BY asset_id`, ...ids),
  ])
  const hourMeters = ids.map(id => meters.find(meter => meter.asset_id === id && meter.kind === 'counter' && HOUR_UNITS.includes(String(meter.unit).toLowerCase())))
  const states = await Promise.all(hourMeters.map(meter => meter ? meterState(env, meter.id) : null))
  const measure = (asset: Row, index: number, period: typeof baseline) => {
    const state = states[index], readings = (state?.readings ?? []).filter(row => row.taken_on >= period.start && row.taken_on <= period.end)
    const good = readings.filter(row => row.standing === 'good').toSorted((a, b) => a.taken_on.localeCompare(b.taken_on) || compareMeter(a.normalized, b.normalized) || a.id.localeCompare(b.id))
    const first = good[0], last = good.at(-1)
    const observed = Boolean(first && last && first.taken_on < last.taken_on && good.every((row, i) => !i || compareMeter(row.normalized, good[i - 1].normalized) >= 0))
    const operatingHoursExact = observed ? addMeter(last!.normalized, first.normalized === '0' ? '0' : first.normalized.startsWith('-') ? first.normalized.slice(1) : `-${first.normalized}`) : null
    const operatingHours = operatingHoursExact === null ? null : Number(operatingHoursExact)
    const unknownHours = (observed ? minutesBetween(period.start, first.taken_on) + minutesBetween(last!.taken_on, period.end) : minutesBetween(period.start, period.end)) / 60
    const held = readings.filter(row => row.standing !== 'good')
    const spanStart = observed ? first.taken_on : period.start, spanEnd = observed ? last!.taken_on : period.start
    const clipped = (rows: Row[], from: string, to: string): Row[] => rows.map(row => ({ ...row, clippedFrom: row.started_on < from ? from : row.started_on,
      clippedTo: row.ended_on && row.ended_on < to ? row.ended_on : to,
      windowMinutes: Math.max(0, minutesBetween(row.started_on < from ? from : row.started_on, row.ended_on && row.ended_on < to ? row.ended_on : to)) }))
    const assetStops = stops.filter(row => row.asset_id === asset.id && row.started_on < period.end && (!row.ended_on || row.ended_on > period.start))
    const stopRows = clipped(assetStops, period.start, period.end), actualStops = stopRows.filter(row => !row.degraded)
    const failures = actualStops.filter(row => !row.planned && row.started_on >= period.start && row.started_on < period.end)
    const coveredFailures = failures.filter(row => observed && row.started_on >= spanStart && row.started_on < spanEnd)
    const assetCosts = costs.filter(row => row.asset_id === asset.id && row.recorded_at >= period.startAt && row.recorded_at < period.endAt)
    const spanCosts = assetCosts.filter(row => observed && row.recorded_at >= zonedInstant(actor.zone, spanStart) && row.recorded_at < zonedInstant(actor.zone, spanEnd))
    const inPeriod = (at: number | null) => at !== null && at >= period.startAt && at < period.endAt
    const relevantWork = work.filter(row => row.asset_id === asset.id && row.status !== 'cancelled' && (row.due_date >= period.from && row.due_date <= period.to || inPeriod(row.created_at) || inPeriod(row.submitted_at) || inPeriod(row.closed_at) || assetStops.some(stop => stop.work_order_id === row.id) || assetCosts.some(cost => cost.work_order_id === row.id)))
    const costUnknownWorkIds = relevantWork.filter(row => !assetCosts.some(cost => cost.work_order_id === row.id)).map(row => row.id)
    const costCents = assetCosts.length ? sum(assetCosts, 'cents') : null
    const rateInputs = { failures: coveredFailures.length, downtimeMinutes: sum(clipped(assetStops.filter(row => !row.degraded), spanStart, spanEnd), 'windowMinutes'), costCents: spanCosts.length ? sum(spanCosts, 'cents') : null }
    return { ...period, operatingHours, operatingHoursExact, unknownHours, failures: failures.length,
      downtimeMinutes: sum(actualStops, 'windowMinutes'), failureDowntimeMinutes: sum(actualStops.filter(row => !row.planned), 'windowMinutes'), plannedDowntimeMinutes: sum(actualStops.filter(row => row.planned), 'windowMinutes'), costCents, currency: 'USD', costUnknownWorkIds,
      telemetryComplete: Boolean(observed && operatingHours! > 0 && unknownHours === 0 && !held.length),
      coverage: { meter: state?.meter.id ?? null, from: observed ? spanStart : null, to: observed ? spanEnd : null, readingIds: good.map(row => row.id), excludedReadingIds: held.map(row => row.id) },
      rates: rates(operatingHours, rateInputs.failures, rateInputs.downtimeMinutes, rateInputs.costCents), rateInputs,
      operatingHoursPerCalendarHour: operatingHours === null ? null : operatingHours / (minutesBetween(period.start, period.end) / 60),
      sources: { stops: stopRows, costs: assetCosts, work: relevantWork, readings, adjustments: state?.adjustments ?? [] } }
  }
  const rows = (assets as Row[]).map((asset, index) => {
    const before = measure(asset, index, baseline), after = measure(asset, index, post)
    const commissionedOn = lifecycle.find(row => row.asset_id === asset.id)?.commissioned_on ?? null
    return { asset: asset.id, tag: asset.tag, baseline: before, post: after, delta: delta(before.rates, after.rates),
      productionReduction: before.operatingHoursPerCalendarHour !== null && after.operatingHoursPerCalendarHour !== null && after.operatingHoursPerCalendarHour < before.operatingHoursPerCalendarHour,
      age: { commissionedOn, baselineDays: commissionedOn ? daysBetween(commissionedOn, baseline.from) : null, postDays: commissionedOn ? daysBetween(commissionedOn, post.from) : null },
      duty: { location: asset.location, level: asset.level, criticality: asset.criticality, measuredProductionOutput: null } }
  })
  const subject = rows[0], peers = rows.slice(1)
  const pooled = (period: 'baseline' | 'post') => {
    const periods = peers.map(row => row[period]), hours = periods.every(row => row.operatingHours !== null && row.operatingHours > 0) ? periods.reduce((total, row) => total + row.operatingHours!, 0) : null
    return rates(hours, periods.reduce((total, row) => total + row.rateInputs.failures, 0), periods.reduce((total, row) => total + row.rateInputs.downtimeMinutes, 0), periods.every(row => row.rateInputs.costCents !== null) ? periods.reduce((total, row) => total + row.rateInputs.costCents!, 0) : null)
  }
  const peerBaseline = pooled('baseline'), peerPost = pooled('post'), peerDelta = delta(peerBaseline, peerPost), relative = delta(peerDelta, subject.delta)
  const uncertainty = ['Observational comparison only: neither a causal benefit nor statistical significance is established. Counts are finite and no confidence interval or model prediction is claimed.',
    'Peers match the recorded category; duty, age, environment, production mix and unrecorded maintenance may differ. Calendar age is not equivalent to accumulated duty.',
    'Operating-hour utilization is a production-reduction proxy; production output and continuous sensor coverage are not recorded here. Cumulative counter endpoints do not prove continuous sensor availability.']
  for (const row of rows) {
    for (const period of ['baseline','post'] as const) {
      const measured = row[period]
      if (!measured.telemetryComplete) uncertainty.push(`${row.tag} ${period}: missing positive exposure, ${measured.unknownHours} unknown wall hours, or excluded readings (${measured.coverage.excludedReadingIds.length}).`)
      if (measured.costCents === null || measured.costUnknownWorkIds.length) uncertainty.push(`${row.tag} ${period}: posted USD costs are incomplete; missing entries are unknown, never zero.`)
    }
    if (row.productionReduction) uncertainty.push(`${row.tag}: measured operation per calendar hour fell; fewer events may reflect reduced production or duty.`)
    if (!row.age.commissionedOn) uncertainty.push(`${row.tag}: commissioning age is unknown.`)
  }
  // Routine PM completion advances schedule revisions too; only changed
  // cadence or another approved intervention confounds the intervention here.
  const otherWork=work.filter(row=>row.asset_id===intervention.asset && row.id!==intervention.workOrder && row.status==='closed' && row.closed_at>=post.startAt && row.closed_at<post.endAt)
  if(otherWork.length) uncertainty.push(`${otherWork.length} other approved maintenance interventions occurred on this asset in the post window; attribution is confounded.`)
  const changedIntervention = !intervention.unchanged || intervention.approvedAt !== plan.source_approved_at || (intervention.kind==='work' && intervention.currentRevision !== plan.source_revision)
  if (changedIntervention) uncertainty.push('The approved source changed again or is inactive; this window cannot isolate the intervention from later changes.')
  if (post.from === approvalDay) uncertainty.push('The post window includes the approval day, including hours before the approval instant. Subsequent cadence changes also do not establish when physical maintenance took effect.')
  const worsening = keys.some(key => subject.delta[key] !== null && sign(subject.delta[key]!) > 0)
  const incomplete = changedIntervention || otherWork.length>0 || rows.some(row => [row.baseline, row.post].some(period => !period.telemetryComplete || period.costCents === null || period.costUnknownWorkIds.length))
  const improvement = keys.every(key => subject.delta[key] !== null && sign(subject.delta[key]!) <= 0 && relative[key] !== null && sign(relative[key]!) <= 0) && keys.some(key => relative[key] !== null && sign(relative[key]!) < 0)
  const status = worsening ? 'worsening' : incomplete ? 'unproven' : improvement ? 'observational_improvement' : 'no_improvement'
  uncertainty.push('Improvement requires no worsening of any subject exposure-normalized measure and a favorable change beyond pooled matched peers; a lower event count alone never qualifies.')
  const recommendedAction = status === 'worsening' ? intervention.kind==='interval' ? 'Prepare a reversal of the approved interval or a new investigation for independent human approval; do not apply automatically.' : 'Prepare a new investigation of the approved work for independent human approval; no physical repair is reversed automatically.'
    : status === 'unproven' ? 'Investigate missing coverage, exposure, costs and intervening changes with the lead; agree further observation or prepare a human-reviewed intervention.'
      : status === 'observational_improvement' ? 'Review the observational improvement and confounders with the lead; continue agreed observation without a causal success claim.'
        : 'Review the absence of improvement beyond matched peers and investigate duty, production and maintenance differences with the lead.'
  const records = { intervention, assets, meters, lifecycle, work, stops, classifications, costs,
    hourEvidence: states.map(state => state ? { meter: state.meter, readings: state.readings, adjustments: state.adjustments } : null) }
  const sourceHash = await sha256Hex(JSON.stringify({ method: 'agent004-observational-v1', plan, windows: { baseline, post }, records }))
  const existing = await one<Row>(env, 'SELECT id FROM gk_outcome_assessments WHERE source_hash=?', sourceHash)
  if (existing) return readOutcome(env, actor, existing.id)
  const id = `outcome-${sourceHash}`
  const report = { id, proposal: intervention.proposal, workOrder: intervention.workOrder, status, method: 'deterministic_record_comparison', subject, peers,
    comparison: { baseline: peerBaseline, post: peerPost, delta: peerDelta, subjectMinusPeerDelta: relative }, uncertainty, recommendedAction,
    source: { window: plan.id, plan, proposal: intervention.proposal, workOrder: intervention.workOrder, schedule: intervention.kind==='interval'?intervention.state.id:null, subject: subject.asset, peers: peers.map(row => row.asset), windows: { baseline, post }, sourceHash, records },
    citations: { window: plan.id, proposal: intervention.proposal, workOrder: intervention.workOrder, schedule: intervention.kind==='interval'?intervention.state.id:null, assets: ids, meters: meters.map(row => row.id), lifecycle: lifecycle.map(row => ({ asset: row.asset_id, revision: row.revision })),
      readings: states.flatMap(state => state?.readings.map(row => row.id) ?? []), meterAdjustments: states.flatMap(state => state?.adjustments.map(row => row.id) ?? []), work: work.map(row => row.id), downtime: stops.map(row => row.id), classifications: classifications.map(row => row.id), costs: costs.map(row => row.id), laterChanges: intervention.later.map(row => row.proposal_id) },
    definitions: ['Both site-local dates are inclusive complete past days. Counter readings at midnight after the last day may close the observed exposure; events and posted costs exclude that endpoint.',
      'Exposure is the exact normalized delta between actual good hour-counter observations, never interpolation. The first hour counter by name and ID is used consistently in both periods. Stale/suspect readings remain cited and excluded.',
      'Failures are unplanned, nondegraded stops starting in the window under the latest retained classification. Downtime includes planned and unplanned nondegraded stops, clipped to the window; degraded operation is excluded.',
      'Rates use failures starting, clipped downtime and native posted USD cost entries within the same observed meter span. Full-window totals remain separate. Imported cost fields and estimated production losses are not posted actual costs.',
      'Peer rates pool numerators over measured operating hours, never average raw counts. Relative change is subject post-minus-baseline rate minus pooled peer post-minus-baseline rate.'] }
  let recipients: Row[] = []
  if (status === 'worsening' || status === 'unproven') {
    recipients = await all<Row>(env, "SELECT id FROM gk_members WHERE status='active' AND role='lead' ORDER BY id")
    if (!recipients.length) recipients = await all<Row>(env, "SELECT id FROM gk_members WHERE status='active' AND role='owner' ORDER BY id")
  }
  await commit(env, [auditFence(env, fence), stmt(env, 'INSERT INTO gk_outcome_assessments (id,proposal_id,source_hash,report_json,recorded_by,recorded_at) VALUES (?,?,?,?,?,?) ON CONFLICT(source_hash) DO NOTHING', id, intervention.proposal, sourceHash, JSON.stringify(report), actor.id, now()),
    ...recipients.map(recipient => stmt(env, "INSERT OR IGNORE INTO gk_notices (id,recipient_id,asset_id,kind,occasion,text,created_at,outcome_id) VALUES (?,?,?,'agent_escalation',?,?,?,?)", newId(), recipient.id, subject.asset, `outcome:${id}`, `${subjectAsset.tag}: maintenance outcome ${status}. ${recommendedAction} Read the retained comparison.`, now(), id))],
  { actor: actor.id, action: 'outcome.assess', subject: subject.asset, detail: { id, proposal: intervention.proposal, workOrder: intervention.workOrder, window: plan.id, sourceHash, status, recipients: recipients.map(row => row.id) } })
  return readOutcome(env, actor, id)
}
