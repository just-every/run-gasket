// AGENT-003: installation-declared limits are evidence, never certification.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { auditFence, auditRevision } from './agent-follow-up'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { Input } from './input'
import { compareMeter, meterNumber } from './quantity'
import { intervalEvidence } from './interval-evidence'
import { assessOutcome, readOutcome } from './outcomes'

export async function intervalLimits(env: Bindings, schedule: string) {
  return all<Row>(env, `SELECT l.*, m.name AS recorded_by_name FROM gk_interval_limits l LEFT JOIN gk_members m ON m.id=l.recorded_by
    WHERE l.schedule_id=? AND l.revision=(SELECT MAX(x.revision) FROM gk_interval_limits x WHERE x.schedule_id=l.schedule_id AND x.source=l.source) ORDER BY l.source`, schedule)
}

/** All recorded limits remain mandatory even at the existing manual edit door. */
export async function assertIntervalBounds(env: Bindings, schedule: string, days: number | null, units: string | null, complete = false) {
  const limits = await intervalLimits(env, schedule)
  if (complete) insist(limits.length === 3, 'interval_limits_required', 409)
  for (const limit of limits) {
    if (days !== null) insist(limit.min_days !== null && limit.max_days !== null && days >= limit.min_days && days <= limit.max_days, 'interval_outside_limits', 409, { source: limit.source })
    if (units !== null) insist(limit.min_units !== null && limit.max_units !== null && compareMeter(units, limit.min_units) >= 0 && compareMeter(units, limit.max_units) <= 0, 'interval_outside_limits', 409, { source: limit.source })
  }
  return limits
}

export async function setIntervalLimit(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const fence = await auditRevision(env), schedule = await one<Row>(env, 'SELECT * FROM gk_schedules WHERE id=?', input.text('schedule'))
  insist(schedule, 'schedule_not_found', 404)
  const source = input.text('source'); insist(['oem','legal','site'].includes(source), 'invalid_source')
  const current = (await intervalLimits(env, schedule.id)).find(row => row.source === source)
  insist(input.integer('revision', { min: 0 }) === (current?.revision ?? 0), 'stale', 409)
  const minDays = schedule.every_days ? input.integer('minDays', { min: 1, max: 3660 }) : null
  const maxDays = schedule.every_days ? input.integer('maxDays', { min: 1, max: 3660 }) : null
  const minUnits = schedule.every_units ? meterNumber(input.text('minUnits'), 'minUnits') : null
  const maxUnits = schedule.every_units ? meterNumber(input.text('maxUnits'), 'maxUnits') : null
  insist(minDays === null || minDays <= maxDays!, 'invalid_interval_bounds')
  insist(minUnits === null || (compareMeter(minUnits, '0') > 0 && compareMeter(minUnits, maxUnits!) <= 0), 'invalid_interval_bounds')
  const reference = input.text('reference', { max: 1000 }), id = newId(), revision = (current?.revision ?? 0) + 1
  await commit(env, [auditFence(env, fence), stmt(env, 'INSERT INTO gk_interval_limits (id,schedule_id,source,revision,min_days,max_days,min_units,max_units,reference,recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', id,schedule.id,source,revision,minDays,maxDays,minUnits,maxUnits,reference,actor.id,now())],
    { actor: actor.id, action: 'interval.limit', subject: schedule.id, detail: { id, source, revision, minDays, maxDays, minUnits, maxUnits, reference, declaredNotVerified: true } })
  return { id, revision }
}

export async function intervalBasis(env: Bindings, actor: Actor, payload: Record<string,string>) {
  let rollback: Row | null = null
  let outcome: { id: string; sourceHash: string; window: string } | undefined
  if (payload.outcome) {
    const report = await readOutcome(env, actor, payload.outcome)
    insist(report.status === 'worsening' && report.proposal === payload.rollbackOf && report.source.schedule === payload.schedule, 'outcome_reversal_mismatch', 409)
    const current = await assessOutcome(env, actor, Input.of({ window: report.source.window }), false)
    insist(current.id === report.id && current.source.sourceHash === report.source.sourceHash, 'outcome_stale', 409)
    outcome = { id: report.id, sourceHash: report.source.sourceHash, window: report.source.window }
  }
  if (payload.rollbackOf) {
    rollback = await one<Row>(env, 'SELECT * FROM gk_interval_changes WHERE proposal_id=? AND schedule_id=?', payload.rollbackOf, payload.schedule)
    insist(rollback, 'rollback_not_found', 404)
    const schedule = await one<Row>(env, 'SELECT * FROM gk_schedules WHERE id=?', payload.schedule)
    insist(schedule, 'schedule_not_found', 404)
    insist(schedule.revision === rollback.revision && schedule.every_days === rollback.after_days && schedule.every_units === rollback.after_units, 'rollback_stale', 409)
    insist((payload.everyDays ? Number(payload.everyDays) : null) === rollback.before_days && (payload.everyUnits || null) === rollback.before_units, 'rollback_target_mismatch', 409)
  }
  const evidence = await intervalEvidence(env, actor, payload, { rollback: Boolean(rollback) })
  const schedule = evidence.schedule
  const days = payload.everyDays ? Number(payload.everyDays) : schedule.every_days
  const units = payload.everyUnits || schedule.every_units
  const limits = await assertIntervalBounds(env, schedule.id, days, units, true)
  return { ...evidence, limits, rollback, ...(outcome ? { outcome } : {}) }
}

export async function applyInterval(env: Bindings, actor: Actor, payload: Record<string,string>, basis: Awaited<ReturnType<typeof intervalBasis>>, proposal: string, also: D1PreparedStatement[], execution?: { approver: string | null }) {
  requireCapability(actor, 'proposal.decide')
  const schedule = basis.schedule, days = payload.everyDays ? Number(payload.everyDays) : schedule.every_days, units = payload.everyUnits || schedule.every_units
  const revision = schedule.revision + 1
  // Issued orders and the next promised occurrence retain their instructions/due point.
  // Approval changes subsequent cadence only; the normal completion scheduler advances it.
  await commit(env, [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_schedules WHERE id=? AND revision=? AND active=1)', schedule.id, schedule.revision),
    stmt(env, 'UPDATE gk_schedules SET every_days=?, every_units=?, revision=revision+1 WHERE id=?', days,units,schedule.id),
    stmt(env, 'INSERT INTO gk_interval_changes (proposal_id,schedule_id,revision,before_days,after_days,before_units,after_units,rollback_plan,rollback_of,approved_by,approved_at,executed_by,execution_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', proposal,schedule.id,revision,schedule.every_days,days,schedule.every_units,units,payload.rollbackPlan,payload.rollbackOf || null,execution ? execution.approver : actor.id,now(),actor.id,execution ? 'company_policy' : 'human'), ...also],
  { actor: actor.id, action: 'schedule.interval', subject: schedule.id, detail: { proposal, revision, fromDays: schedule.every_days, toDays: days, fromUnits: schedule.every_units, toUnits: units, rollbackPlan: payload.rollbackPlan, rollbackOf: payload.rollbackOf || null, limits: basis.limits.map(l => l.id) } })
  return { id: schedule.id }
}
