// ASSET-005: readings with their source time, receipt time, unit, provenance and
// quality, and the explained, append-only adjustments that reset, replace or
// roll over a counter or correct a reading. A counter's normalized value is its
// raw reading plus what every earlier counter change carried over. Only good
// readings (and corrected ones) move it, so a stale or suspect reading can never
// fire preventive work or take a counter backwards; it stays visible, flagged.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { isLocalTime, localNow, minutesBetween } from './dates'
import type { Input } from './input'
import { addMeter, compareMeter, meterNumber } from './quantity'

/** A feed reading that arrives more than its meter's feed window (whole hours, 24 unless declared) after its source time is stale. */
export const DEFAULT_FEED_WINDOW_HOURS = 24
export const FEED_WINDOW_HOURS = { min: 1, max: 168 }
export const COUNTER_CHANGES = ['reset', 'replacement', 'rollover']
const CONDITIONS = ['good', 'fair', 'poor']

const negate = (value: string) => value.startsWith('-') ? value.slice(1) : value === '0' ? '0' : `-${value}`
const minus = (a: string, b: string) => addMeter(a, negate(b))
const highest = (values: string[]) => values.reduce<string | null>((max, value) => max === null || compareMeter(value, max) > 0 ? value : max, null)
const lowest = (values: string[]) => values.reduce<string | null>((min, value) => min === null || compareMeter(value, min) < 0 ? value : min, null)

export interface Point { id: string; at: string; normalized: string }
export interface MeterState { meter: Row; readings: Row[]; adjustments: Row[]; points: Point[]; now: string | null; latest: Row | null; held: Row[]; offset: (at: string) => string }

/** One meter's readings in source-time order with their effective and normalized values, and its counter changes. */
export async function meterState(env: Bindings, meterId: string): Promise<MeterState> {
  const meter = await one(env, 'SELECT * FROM gk_meters WHERE id = ?', meterId)
  insist(meter, 'meter_not_found', 404)
  const adjustments = await all(env, 'SELECT j.*, m.name AS recorded_by_name FROM gk_meter_adjustments j LEFT JOIN gk_members m ON m.id = j.recorded_by WHERE j.meter_id = ? ORDER BY j.recorded_at, j.id', meter.id)
  const rows = await all(env, 'SELECT r.*, m.name AS entered_by_name FROM gk_readings r LEFT JOIN gk_members m ON m.id = r.entered_by WHERE r.meter_id = ? ORDER BY r.taken_on, r.entered_at, r.id', meter.id)
  const corrections = new Map<string, Row>()
  for (const adjustment of adjustments) if (adjustment.kind === 'correction') corrections.set(adjustment.reading_id, adjustment)
  const changes = adjustments.filter(adjustment => adjustment.kind !== 'correction').toSorted((a, b) => a.effective_on.localeCompare(b.effective_on))
  const offset = (at: string) => changes.filter(change => change.effective_on <= at).reduce((sum, change) => addMeter(sum, minus(change.last_value, change.start_value)), '0')
  const counter = meter.kind === 'counter'
  const readings = rows.map(row => {
    const correction = corrections.get(row.id)
    const value = correction?.value ?? row.value
    return { ...row, unit: row.unit ?? meter.unit, provenance: row.origin === 'import' ? 'import' : row.provenance, value, recorded_value: row.value,
      correction: correction ? { id: correction.id, reason: correction.reason, by: correction.recorded_by_name, at: correction.recorded_at } : null,
      standing: correction ? 'good' : row.quality, normalized: counter ? addMeter(value, offset(row.taken_on)) : value }
  })
  const good = readings.filter(reading => reading.standing === 'good')
  const points: Point[] = counter ? [...good.map(reading => ({ id: reading.id, at: reading.taken_on, normalized: reading.normalized })),
    ...changes.map(change => ({ id: change.id, at: change.effective_on, normalized: addMeter(change.start_value, offset(change.effective_on)) }))] : []
  const latest = good.at(-1) ?? null
  const now = counter ? highest(points.map(point => point.normalized)) : latest?.value ?? null
  const held = readings.filter(reading => reading.standing !== 'good' && (!latest || reading.taken_on >= latest.taken_on))
  return { meter, readings, adjustments, points, now, latest, held, offset }
}

/** The normalized value a counter reading at `at` would have; refused if it goes back past an earlier one or above a later one. */
export function counterFits(state: MeterState, at: string, value: string, except?: string) {
  const normalized = addMeter(value, state.offset(at))
  const points = state.points.filter(point => point.id !== except)
  const earlier = highest(points.filter(point => point.at <= at).map(point => point.normalized))
  const later = lowest(points.filter(point => point.at > at).map(point => point.normalized))
  insist(earlier === null || compareMeter(normalized, earlier) >= 0, 'meter_went_backwards', 409, { meter: state.meter.name, earlier })
  insist(later === null || compareMeter(normalized, later) <= 0, 'meter_went_backwards', 409, { meter: state.meter.name, later })
  return normalized
}

const valueFor = (meter: Row, raw: string) => {
  if (meter.kind !== 'condition') return meterNumber(raw)
  insist(CONDITIONS.includes(raw), 'invalid_value')
  return raw
}

/** Holds the meter for this change: a concurrent write on it fails as stale. */
const holdMeter = (env: Bindings, meter: Row) => [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_meters WHERE id = ? AND revision = ?)', meter.id, meter.revision), stmt(env, 'UPDATE gk_meters SET revision = revision + 1 WHERE id = ?', meter.id)]

export interface Taken { takenOn: string; workOrder: string | null; provenance: 'manual' | 'feed'; source: string | null; quality: 'good' | 'suspect' }

/** Checks one reading against its meter and returns the statements that keep it, with its quality as received. */
export async function readingStatements(env: Bindings, actor: Actor, meter: Row, raw: string, taken: Taken) {
  const value = valueFor(meter, raw)
  const late = taken.provenance === 'feed' && minutesBetween(taken.takenOn, localNow(actor.zone)) > meter.feed_window_hours * 60
  const quality = taken.quality === 'good' && late ? 'stale' : taken.quality
  const statements: D1PreparedStatement[] = []
  let normalized = value
  if (meter.kind === 'counter') {
    statements.push(...holdMeter(env, meter))
    const state = await meterState(env, meter.id)
    normalized = quality === 'good' ? counterFits(state, taken.takenOn, value) : addMeter(value, state.offset(taken.takenOn))
  }
  const id = newId()
  statements.push(stmt(env, 'INSERT INTO gk_readings (id, meter_id, asset_id, work_order_id, value, taken_on, entered_by, entered_at, unit, provenance, source, quality) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, meter.id, meter.asset_id, taken.workOrder, value, taken.takenOn, actor.id, now(), meter.unit, taken.provenance, taken.source, quality))
  return { id, value, quality, normalized, statements }
}

const takenOnFrom = (input: Input, actor: Actor, name: string) => {
  const value = input.text(name, { max: 16 })
  insist(isLocalTime(value), `invalid_${name}`)
  insist(value <= localNow(actor.zone), 'reading_in_future')
  return value
}

async function liveMeter(env: Bindings, meterId: string) {
  const meter = await one(env, 'SELECT m.*, a.retired_at FROM gk_meters m JOIN gk_assets a ON a.id = m.asset_id WHERE m.id = ?', meterId)
  insist(meter, 'meter_not_found', 404)
  insist(!meter.retired_at, 'asset_retired', 409)
  return meter
}

/** A reading from a named feed (a gateway, a telematics export, a script): its unit must be the meter's; it may arrive late or flagged. */
export async function feedReading(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const meter = await liveMeter(env, input.text('meter', { max: 100 }))
  const source = input.text('source', { max: 120 })
  const unit = input.text('unit', { optional: true, max: 30 })
  insist(!unit || unit === meter.unit, 'unit_mismatch', 400, { meter: meter.unit, sent: unit })
  const declared = input.text('quality', { optional: true, max: 20 }) || 'good'
  insist(declared === 'good' || declared === 'suspect', 'invalid_quality')
  const takenOn = takenOnFrom(input, actor, 'takenOn')
  const kept = await readingStatements(env, actor, meter, input.text('value', { max: 30 }), { takenOn, workOrder: null, provenance: 'feed', source, quality: declared })
  await commit(env, kept.statements, { actor: actor.id, action: 'meter.feed', subject: meter.asset_id, detail: { meter: meter.id, reading: kept.id, value: kept.value, takenOn, source, quality: kept.quality } })
  return { id: kept.id, quality: kept.quality, normalized: kept.normalized }
}

/** Declares how late this meter's feed readings may arrive before they are kept as stale; readings already kept keep their quality. */
export async function setFeedWindow(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const meter = await liveMeter(env, input.text('meter', { max: 100 }))
  const hours = input.integer('feedWindowHours', FEED_WINDOW_HOURS)!
  await commit(env, [...holdMeter(env, meter), stmt(env, 'UPDATE gk_meters SET feed_window_hours = ? WHERE id = ?', hours, meter.id)],
    { actor: actor.id, action: 'meter.window', subject: meter.asset_id, detail: { meter: meter.id, from: meter.feed_window_hours, to: hours } })
  return { id: meter.id, feedWindowHours: hours }
}

/** A counter reset, replacement or rollover, or a corrected reading: always with a reason, never rewriting a kept reading. */
export async function adjustMeter(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const kind = input.text('kind', { max: 20 })
  insist(kind === 'correction' || COUNTER_CHANGES.includes(kind), 'invalid_kind')
  // A correction names its reading; the reading names its meter.
  const readingId = kind === 'correction' ? input.text('reading', { max: 100 }) : null
  const meterId = readingId ? (await one<{ meter_id: string }>(env, 'SELECT meter_id FROM gk_readings WHERE id = ?', readingId))?.meter_id : input.text('meter', { max: 100 })
  insist(meterId, 'reading_not_found', 404)
  const meter = await liveMeter(env, meterId)
  const reason = input.text('reason', { max: 500 })
  const state = await meterState(env, meter.id), id = newId()
  let row: unknown[], detail: Record<string, unknown>
  if (kind === 'correction') {
    const reading = state.readings.find(item => item.id === readingId)
    insist(reading, 'reading_not_found', 404)
    const value = valueFor(meter, input.text('value', { max: 30 }))
    if (meter.kind === 'counter') counterFits(state, reading.taken_on, value, reading.id)
    row = [reading.taken_on, null, null, reading.id, value]
    detail = { meter: meter.id, kind, reading: reading.id, from: reading.value, to: value, reason }
  } else {
    insist(meter.kind === 'counter', 'meter_not_counter')
    const effectiveOn = takenOnFrom(input, actor, 'effectiveOn')
    const last = meterNumber(input.text('lastValue', { max: 30 }), 'lastValue'), start = meterNumber(input.text('startValue', { max: 30 }), 'startValue')
    insist(compareMeter(last, '0') >= 0 && compareMeter(start, '0') >= 0, 'invalid_value')
    // A change only ends the series so far: no kept reading or earlier change may sit at or after it.
    insist(!state.points.some(point => point.at >= effectiveOn), 'readings_after_change', 409)
    counterFits(state, effectiveOn, last)
    row = [effectiveOn, last, start, null, null]
    detail = { meter: meter.id, kind, effectiveOn, lastValue: last, startValue: start, reason }
  }
  await commit(env, [...holdMeter(env, meter), stmt(env, 'INSERT INTO gk_meter_adjustments (id, meter_id, kind, effective_on, last_value, start_value, reading_id, value, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, meter.id, kind, ...row, reason, actor.id, now())], { actor: actor.id, action: 'meter.adjust', subject: meter.asset_id, detail })
  return { id, normalized: (await meterState(env, meter.id)).now }
}

/** A meter as the asset view shows it: latest good reading, normalized total, every reading (newest first) and its changes. */
export async function meterView(env: Bindings, actor: Actor, meterId: string) {
  const state = await meterState(env, meterId)
  const received = (row: Row) => localNow(actor.zone, row.entered_at)
  return {
    latest: state.latest?.value ?? null, latest_on: state.latest?.taken_on ?? null, normalized: state.now, held: state.held.length,
    readings: state.readings.toReversed().map(row => ({ id: row.id, value: row.value, recorded_value: row.recorded_value, normalized: row.normalized, unit: row.unit, taken_on: row.taken_on, received_on: received(row),
      provenance: row.provenance, source: row.provenance === 'import' ? row.entered_by : row.source, quality: row.quality, standing: row.standing, correction: row.correction, work_order: row.work_order_id, entered_by: row.entered_by_name ?? row.entered_by })),
    adjustments: state.adjustments.toReversed().map(row => ({ id: row.id, kind: row.kind, effective_on: row.effective_on, last_value: row.last_value, start_value: row.start_value, reading: row.reading_id, value: row.value, reason: row.reason, recorded_by: row.recorded_by_name, recorded_on: received({ entered_at: row.recorded_at }) })),
  }
}
