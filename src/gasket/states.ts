// ASSET-004 (slice): an asset's declared state (in service, degraded, down or
// out of service) with its effective time and reason, and where the evidence
// disagrees with it: open downtime while declared in service or degraded, or a
// feed counter still rising while declared down or out of service.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, insist, newId, now, one, stmt, type Row } from './core'
import { isLocalTime, localNow } from './dates'
import type { Input } from './input'
import { meterState } from './meters'
import { compareMeter } from './quantity'

export const ASSET_STATES = ['in_service', 'degraded', 'down', 'out_of_service']
const STOPPED = ['down', 'out_of_service']

/** The latest declared state by effective time; a reclassification recorded later wins at the same time. */
export const DECLARED_STATE = '(SELECT s.state FROM gk_asset_states s WHERE s.asset_id = a.id ORDER BY s.effective_on DESC, s.recorded_at DESC LIMIT 1)'

export async function declareState(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const asset = await one(env, 'SELECT id, retired_at FROM gk_assets WHERE id = ?', input.text('asset', { max: 100 }))
  insist(asset, 'asset_not_found', 404)
  insist(!asset.retired_at, 'asset_retired', 409)
  const state = input.text('state', { max: 20 })
  insist(ASSET_STATES.includes(state), 'invalid_state')
  const reason = input.text('reason', { max: 500 })
  // A reclassification takes the effective time of the entry it corrects.
  const correctsId = input.text('corrects', { optional: true, max: 100 }) || null
  const corrected = correctsId ? await one(env, 'SELECT id, asset_id, state, effective_on FROM gk_asset_states WHERE id = ?', correctsId) : null
  insist(!correctsId || (corrected && corrected.asset_id === asset.id), 'state_not_found', 404)
  const effectiveOn = corrected ? corrected.effective_on : input.text('effectiveOn', { max: 16 })
  insist(isLocalTime(effectiveOn), 'invalid_effectiveOn')
  insist(effectiveOn <= localNow(actor.zone), 'state_in_future')
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_asset_states (id, asset_id, state, effective_on, reason, corrects, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, asset.id, state, effectiveOn, reason, correctsId, actor.id, now())],
    { actor: actor.id, action: 'asset.state', subject: asset.id, detail: { state, effectiveOn, reason, ...(corrected ? { corrects: corrected.id, was: corrected.state } : {}) } })
  return { id }
}

/** Every declared state, newest effective first, each marked with the entry that reclassified it. */
export async function stateHistory(env: Bindings, assetId: string) {
  const rows = await all(env, 'SELECT s.id, s.state, s.effective_on, s.reason, s.corrects, s.recorded_at, m.name AS recorded_by FROM gk_asset_states s LEFT JOIN gk_members m ON m.id = s.recorded_by WHERE s.asset_id = ? ORDER BY s.effective_on DESC, s.recorded_at DESC', assetId)
  const correctedBy = new Map(rows.filter(row => row.corrects).map(row => [row.corrects, row.id]))
  return rows.map(row => ({ ...row, corrected_by: correctedBy.get(row.id) ?? null }))
}

/** Where the declared state and the recorded evidence disagree. */
export async function stateConflicts(env: Bindings, asset: Row, history: Row[]) {
  const declared = history[0]
  if (!declared || asset.retired_at) return []
  const conflicts: Row[] = []
  const open = await one(env, 'SELECT started_on, reason FROM gk_downtime WHERE asset_id = ? AND ended_on IS NULL', asset.id)
  if (open && !STOPPED.includes(declared.state)) conflicts.push({ kind: 'open_downtime', declared: declared.state, since: open.started_on, reason: open.reason })
  if (STOPPED.includes(declared.state)) {
    for (const meter of await all(env, "SELECT id FROM gk_meters WHERE asset_id = ? AND kind = 'counter'", asset.id)) {
      const state = await meterState(env, meter.id)
      const before = state.points.filter(point => point.at <= declared.effective_on).map(point => point.normalized).reduce<string | null>((max, value) => max === null || compareMeter(value, max) > 0 ? value : max, null)
      const rising = state.readings.filter(row => row.provenance === 'feed' && row.standing === 'good' && row.taken_on > declared.effective_on && before !== null && compareMeter(row.normalized, before) > 0)
      if (rising.length) conflicts.push({ kind: 'telemetry_running', declared: declared.state, meter: state.meter.name, unit: state.meter.unit, from: before, to: rising.at(-1)!.normalized, at: rising.at(-1)!.taken_on, source: rising.at(-1)!.source })
    }
  }
  return conflicts
}
