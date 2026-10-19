// PM-002: gauge and condition triggers. A schedule on a gauge fires when good
// readings stay above (or below) its threshold for its sustain time; on a
// condition meter, when they stay in its chosen conditions. Only good readings
// count (ASSET-005), so stale, suspect or flagged data never satisfies one. After
// it fires it re-arms only once a later good reading is back at or past its reset
// value (or out of the chosen conditions): hysteresis, so a value hovering at the
// threshold raises one work order, not many. Sustain is measured between source
// times, inclusive: the run of meeting readings must span at least that long.
// A trigger watches readings received after it was set up: earlier history,
// moved-in readings included, never fires it.
import { insist, type Row } from './core'
import { minutesBetween } from './dates'
import type { Input } from './input'
import type { MeterState } from './meters'
import { compareMeter, meterNumber } from './quantity'

const CONDITIONS = ['good', 'fair', 'poor']

/** The trigger fields of a schedule on a gauge or condition meter. */
export function triggerFields(input: Input, meter: Row) {
  const sustainMinutes = input.integer('sustainMinutes', { min: 0, max: 10_080, optional: true }) ?? 0
  if (meter.kind === 'condition') {
    const chosen = [...new Set(input.list('conditions').flatMap(value => value.split(',')).map(value => value.trim().toLowerCase()).filter(Boolean))]
    insist(chosen.length && chosen.length < CONDITIONS.length && chosen.every(value => CONDITIONS.includes(value)), 'invalid_conditions')
    return { when: 'is', value: CONDITIONS.filter(value => chosen.includes(value)).join(','), reset: null, sustainMinutes }
  }
  const when = input.text('when', { max: 10 })
  insist(when === 'above' || when === 'below', 'invalid_when')
  const value = meterNumber(input.text('threshold', { max: 30 }), 'threshold')
  const reset = input.has('resetAt') && input.text('resetAt', { optional: true, max: 30 }) ? meterNumber(input.text('resetAt', { max: 30 }), 'resetAt') : value
  // The reset value sits on the safe side of the threshold (or at it).
  insist(when === 'above' ? compareMeter(reset, value) <= 0 : compareMeter(reset, value) >= 0, 'invalid_resetAt')
  return { when, value, reset, sustainMinutes }
}

const meets = (schedule: Row, value: string) => schedule.trigger_when === 'is' ? String(schedule.trigger_value).split(',').includes(value)
  : schedule.trigger_when === 'above' ? compareMeter(value, schedule.trigger_value) > 0 : compareMeter(value, schedule.trigger_value) < 0
const resets = (schedule: Row, value: string) => schedule.trigger_when === 'is' ? !meets(schedule, value)
  : schedule.trigger_when === 'above' ? compareMeter(value, schedule.reset_value) <= 0 : compareMeter(value, schedule.reset_value) >= 0

/** The good reading that fires this trigger now, if any: after the last firing, once re-armed, sustained long enough. */
export function firingReading(schedule: Row, state: MeterState): Row | null {
  let armed = !schedule.trigger_fired_on, run: Row | null = null
  for (const reading of state.readings) {
    if (reading.standing !== 'good' || reading.entered_at < schedule.created_at || (schedule.trigger_fired_on && reading.taken_on <= schedule.trigger_fired_on)) continue
    if (!armed) { if (resets(schedule, reading.value)) armed = true; continue }
    if (!meets(schedule, reading.value)) { run = null; continue }
    run ??= reading
    if (minutesBetween(run.taken_on, reading.taken_on) >= schedule.sustain_minutes) return reading
  }
  return null
}
