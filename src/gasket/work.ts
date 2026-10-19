// Clauses 6–8: work orders, assignment and the assigned person's record of the
// work: checklist results, evidence, readings, parts, downtime and findings.
// Every change bumps the work order's version, which a review names exactly.
import type { Bindings } from '../auth.server'
import { can, requireCapability, type Actor } from './actor'
import { NEXT_NUMBER, all, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from './core'
import { addDays, isDate, isLocalTime, localNow, minutesBetween } from './dates'
import { correctionOrigin, correctionStatements, obligation } from './corrections'
import type { Input } from './input'
import { issuePart, returnPart } from './parts'
import type { FromProposal } from './schedules'
import { chaseOf } from './chasing'
import { assigneeFits, crewChoice, crewOf, handoffStatements, isCollaborator } from './crew'
import { activeCode } from './codes'
import { readingStatements } from './meters'
import { fromMilli } from './quantity'
import { estimate } from './performance'
import { classifiedStops, stopClass } from './reliability'
import { releaseWithWork, reservations } from './reservations'

export const OPEN = "('open', 'in_progress', 'returned')"
export const EVIDENCE_BYTES = 1_500_000
const EVIDENCE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf' }

export async function workOrder(env: Bindings, id: string) {
  const row = await one(env, 'SELECT * FROM gk_work_orders WHERE id = ?', id)
  insist(row, 'work_order_not_found', 404)
  return row
}

/** The assigned person or a collaborator (PLAN-002) may record on an open work order; the version they saw must still be current. */
async function workable(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.do')
  const order = await workOrder(env, input.text('workOrder', { max: 100 }))
  insist(order.assignee_id === actor.id || await isCollaborator(env, order.id, actor.id), 'not_your_work', 403)
  insist(['open', 'in_progress', 'returned'].includes(order.status), 'work_order_not_open', 409)
  if (input.has('version')) insist(input.integer('version', { min: 1, max: 1_000_000 }) === order.version, 'stale', 409)
  return order
}

/** Statements that move the order to in progress and bump its version, guarded against a concurrent change. */
const touch = (env: Bindings, order: { id: string; version: number }) => [
  guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status IN ${OPEN})`, order.id, order.version),
  stmt(env, "UPDATE gk_work_orders SET version = version + 1, status = 'in_progress' WHERE id = ?", order.id),
]

export async function createCorrective(env: Bindings, actor: Actor, input: Input, { proposal, also }: FromProposal = {}) {
  requireCapability(actor, proposal ? 'proposal.decide' : 'work.assign')
  const asset = await one(env, 'SELECT id, retired_at FROM gk_assets WHERE id = ?', input.text('asset', { max: 100 }))
  insist(asset, 'asset_not_found', 404)
  insist(!asset.retired_at, 'asset_retired', 409)
  const title = input.text('title', { max: 160 }), description = input.text('description', { optional: true, max: 2000 }) || null
  const due = input.text('due', { max: 10 })
  insist(isDate(due), 'invalid_due')
  const assignee = input.text('assignee', { optional: true, max: 100 }) || null
  const crew = await crewChoice(env, input, null)
  if (assignee) await assigneeFits(env, assignee, crew.team)
  const estimateMinutes = estimate(input)
  const id = newId()
  await commit(env, [stmt(env, `INSERT INTO gk_work_orders (id, number, asset_id, kind, title, description, due_date, assignee_id, team_id, trade, shift, estimate_minutes, status, created_by, created_at) VALUES (?, ${NEXT_NUMBER}, ?, 'corrective', ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`, id, asset.id, title, description, due, assignee, crew.team, crew.trade, crew.shift, estimateMinutes, actor.id, now()), ...(also?.(id) ?? [])],
    { actor: actor.id, action: 'workorder.create', subject: id, detail: { asset: asset.id, title, due, assignee, ...(estimateMinutes ? { estimateMinutes } : {}), ...(crew.team || crew.trade || crew.shift ? crew : {}), ...(proposal ? { proposal } : {}) } })
  return { id }
}

/** PLAN-002: assign or reassign with an optional team, trade, shift and handoff note; the new assignee acknowledges afresh. */
export async function assign(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const order = await workOrder(env, input.text('workOrder', { max: 100 }))
  insist(['open', 'in_progress', 'returned'].includes(order.status), 'work_order_not_open', 409)
  const assignee = input.text('assignee', { max: 100 }), note = input.text('note', { optional: true, max: 1000 }) || null
  const crew = await crewChoice(env, input, order)
  await assigneeFits(env, assignee, crew.team)
  await commit(env, [
    guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status IN ${OPEN})`, order.id, order.version),
    ...handoffStatements(env, actor, order, assignee, crew, note),
  ], { actor: actor.id, action: 'workorder.assign', subject: order.id, detail: { from: order.assignee_id, to: assignee, ...crew, note } })
  return { id: order.id }
}

/**
 * The decision on an overdue work order (the Work panel's plans): keep it with the person who holds it, keep it as it
 * is, or hand it to someone ("to:<member>"), which is an ordinary assignment. Each is recorded, so the panel shows
 * the decision for the rest of the day and the work order keeps it in its history.
 */
export async function decidePlan(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const order = await workOrder(env, input.text('workOrder', { max: 100 }))
  insist(['open', 'in_progress', 'returned'].includes(order.status), 'work_order_not_open', 409)
  insist(order.due_date < actor.today, 'not_overdue', 409)
  if (input.has('version')) insist(input.integer('version', { min: 1, max: 1_000_000 }) === order.version, 'stale', 409)
  const choice = input.text('plan', { max: 120 })
  const unchanged = guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status IN ${OPEN})`, order.id, order.version)
  if (choice === 'keep' || choice === 'as_is') {
    if (choice === 'keep') insist(order.assignee_id, 'not_assigned', 409)
    await commit(env, [unchanged], { actor: actor.id, action: 'workorder.plan', subject: order.id, detail: { plan: choice, holder: order.assignee_id } })
    return { id: order.id, plan: choice }
  }
  const to = choice.startsWith('to:') ? choice.slice(3) : ''
  insist(to && to !== order.assignee_id, 'invalid_plan')
  insist(to !== actor.id, 'plan_to_self', 409)
  await assigneeFits(env, to, order.team_id)
  await commit(env, [unchanged, ...handoffStatements(env, actor, order, to, { team: order.team_id, trade: order.trade, shift: order.shift }, null)], [
    { actor: actor.id, action: 'workorder.assign', subject: order.id, detail: { from: order.assignee_id, to } },
    { actor: actor.id, action: 'workorder.plan', subject: order.id, detail: { plan: 'reassign', holder: order.assignee_id, to } },
  ])
  return { id: order.id, plan: 'reassign', to }
}

export async function cancel(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const order = await workOrder(env, input.text('workOrder', { max: 100 }))
  insist(['open', 'in_progress', 'returned'].includes(order.status), 'work_order_not_open', 409)
  const reason = input.text('reason', { max: 500 })
  await commit(env, [
    guard(env, 'parts_still_issued', "(SELECT COALESCE(SUM(quantity_milli), 0) FROM gk_part_moves WHERE work_order_id = ?) = 0", order.id),
    guard(env, 'downtime_open', 'NOT EXISTS(SELECT 1 FROM gk_downtime WHERE work_order_id = ? AND ended_on IS NULL)', order.id),
    stmt(env, "UPDATE gk_work_orders SET status = 'cancelled', version = version + 1, closed_at = ?, closed_by = ? WHERE id = ?", now(), actor.id, order.id),
    releaseWithWork(env, actor, order.id, `Work order cancelled: ${reason}`),
  ], { actor: actor.id, action: 'workorder.cancel', subject: order.id, detail: { reason } })
  return { id: order.id }
}

/** Clause 7: a result for each checklist item of the pinned revision, with a note. */
export async function recordResults(env: Bindings, actor: Actor, input: Input) {
  const order = await workable(env, actor, input)
  insist(order.checklist_revision_id, 'no_checklist', 409)
  const revision = await one(env, 'SELECT items_json FROM gk_checklist_revisions WHERE id = ?', order.checklist_revision_id)
  const count = (JSON.parse(revision!.items_json) as unknown[]).length
  // JSON callers send parallel `outcome` and `note` lists; the form sends outcome-N and note-N per item.
  const keyed = !input.has('outcome')
  const outcomes = keyed ? Array.from({ length: count }, (_, item) => input.text(`outcome-${item}`, { optional: true, max: 20 })) : input.list('outcome', { keepEmpty: true })
  const notes = keyed ? Array.from({ length: count }, (_, item) => input.text(`note-${item}`, { optional: true, max: 1000 })) : input.list('note', { keepEmpty: true })
  insist(outcomes.length === count, 'invalid_outcome')
  const statements: D1PreparedStatement[] = [], recorded: { item: number; outcome: string; note: string | null }[] = []
  outcomes.forEach((outcome, item) => {
    if (!outcome) return
    insist(['pass', 'fail', 'attention'].includes(outcome), 'invalid_outcome')
    const note = (notes[item] ?? '').slice(0, 1000) || null
    statements.push(
      stmt(env, 'INSERT INTO gk_results (work_order_id, item, outcome, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(work_order_id, item) DO UPDATE SET outcome = excluded.outcome, note = excluded.note, recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at', order.id, item, outcome, note, actor.id, now()),
      stmt(env, 'INSERT INTO gk_result_log (work_order_id, item, outcome, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)', order.id, item, outcome, note, actor.id, now()))
    recorded.push({ item, outcome, note })
  })
  insist(recorded.length, 'invalid_outcome')
  // PM-004: results the checklist's failure rule covers raise their correction in the same batch.
  const correction = await correctionStatements(env, actor, order, recorded)
  await commit(env, [...touch(env, order), ...statements, ...correction.statements], [{ actor: actor.id, action: 'workorder.results', subject: order.id, detail: { recorded } }, ...correction.audits])
  return { id: order.id }
}

export async function addEvidence(env: Bindings, actor: Actor, input: Input) {
  const order = await workable(env, actor, input)
  const file = (await input.file('file', { maxBytes: EVIDENCE_BYTES }))!
  const extension = file.filename.split('.').pop()?.toLowerCase() ?? ''
  const mediaType = EVIDENCE_TYPES[extension]
  insist(mediaType, 'unsupported_file_type')
  const id = newId(), sha256 = await sha256Hex(file.bytes)
  await commit(env, [...touch(env, order), stmt(env, 'INSERT INTO gk_evidence (id, work_order_id, filename, media_type, size, sha256, bytes, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, order.id, file.filename, mediaType, file.bytes.length, sha256, file.bytes, actor.id, now())],
    { actor: actor.id, action: 'workorder.evidence', subject: order.id, detail: { evidence: id, filename: file.filename, size: file.bytes.length, sha256 } })
  return { id: order.id, evidence: id }
}

/** Dated readings for the asset's meters, taken by the assigned person (ASSET-005 keeps their unit, source and quality). */
export async function recordReadings(env: Bindings, actor: Actor, input: Input) {
  const order = await workable(env, actor, input)
  const takenOn = input.text('takenOn', { max: 16 })
  insist(isLocalTime(takenOn), 'invalid_takenOn')
  insist(takenOn <= localNow(actor.zone), 'reading_in_future')
  const meters = input.list('meter', { keepEmpty: true }), values = input.list('value', { keepEmpty: true })
  insist(meters.length === values.length && meters.length > 0, 'invalid_value')
  const statements: D1PreparedStatement[] = [], recorded: { meter: string; value: string }[] = [], read: string[] = []
  for (const [index, meterId] of meters.entries()) {
    const raw = values[index]
    if (!raw) continue
    const meter = await one(env, 'SELECT * FROM gk_meters WHERE id = ? AND asset_id = ?', meterId, order.asset_id)
    insist(meter, 'meter_not_found', 404)
    const kept = await readingStatements(env, actor, meter, raw, { takenOn, workOrder: order.id, provenance: 'manual', source: null, quality: 'good' })
    statements.push(...kept.statements)
    recorded.push({ meter: meter.name, value: kept.value })
    read.push(meter.id)
  }
  insist(recorded.length, 'invalid_value')
  await commit(env, [...touch(env, order), ...statements], { actor: actor.id, action: 'workorder.readings', subject: order.id, detail: { takenOn, recorded } })
  return { id: order.id, meters: read }
}

export async function issue(env: Bindings, actor: Actor, input: Input) {
  const order = await workable(env, actor, input)
  const move = await issuePart(env, actor, input, order)
  await commit(env, [...touch(env, order), ...move.statements], { actor: actor.id, action: 'part.issue', subject: order.id, detail: { part: move.part.id, quantity: fromMilli(move.quantity) } })
  return { id: order.id }
}

export async function giveBack(env: Bindings, actor: Actor, input: Input) {
  const order = await workable(env, actor, input)
  const move = await returnPart(env, actor, input, order)
  await commit(env, [...touch(env, order), ...move.statements], { actor: actor.id, action: 'part.return', subject: order.id, detail: { part: move.part.id, quantity: fromMilli(move.quantity) } })
  return { id: order.id }
}

export async function downtimeStart(env: Bindings, actor: Actor, input: Input) {
  const order = await workable(env, actor, input)
  const startedOn = input.text('startedOn', { max: 16 }), reason = input.text('reason', { max: 300 })
  insist(isLocalTime(startedOn), 'invalid_startedOn')
  insist(startedOn <= localNow(actor.zone), 'downtime_in_future')
  // REPORT-003: a planned stop, or a failure with an optional failure mode.
  const kind = await stopClass(env, input)
  // Downtime never overlaps an earlier outage of the same asset (an open one is refused by gk_downtime_one_open).
  const overlap = 'NOT EXISTS(SELECT 1 FROM gk_downtime WHERE asset_id = ? AND ended_on > ?)'
  insist(!await one(env, `SELECT 1 WHERE ${overlap.replace('NOT EXISTS', 'EXISTS')}`, order.asset_id, startedOn), 'downtime_overlaps', 409)
  const id = newId()
  await commit(env, [...touch(env, order), guard(env, 'downtime_overlaps', overlap, order.asset_id, startedOn), stmt(env, 'INSERT INTO gk_downtime (id, asset_id, work_order_id, started_on, reason, planned, failure_mode, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, order.asset_id, order.id, startedOn, reason, kind.planned ? 1 : 0, kind.failureMode, actor.id, now())],
    { actor: actor.id, action: 'downtime.start', subject: order.asset_id, detail: { workOrder: order.id, startedOn, reason, planned: kind.planned, failureMode: kind.key } })
  return { id: order.id, downtime: id }
}

export async function downtimeEnd(env: Bindings, actor: Actor, input: Input) {
  const order = await workable(env, actor, input)
  const open = await one(env, 'SELECT * FROM gk_downtime WHERE work_order_id = ? AND ended_on IS NULL', order.id)
  insist(open, 'no_open_downtime', 409)
  const endedOn = input.text('endedOn', { max: 16 })
  insist(isLocalTime(endedOn), 'invalid_endedOn')
  insist(endedOn >= open.started_on, 'downtime_ends_before_start')
  insist(endedOn <= localNow(actor.zone), 'downtime_in_future')
  const minutes = minutesBetween(open.started_on, endedOn)
  await commit(env, [...touch(env, order), stmt(env, 'UPDATE gk_downtime SET ended_on = ?, minutes = ? WHERE id = ? AND ended_on IS NULL', endedOn, minutes, open.id)],
    { actor: actor.id, action: 'downtime.end', subject: order.asset_id, detail: { workOrder: order.id, endedOn, minutes } })
  return { id: order.id, minutes }
}

/** A corrective finding; one that needs follow-up raises a linked corrective work order. */
export async function recordFinding(env: Bindings, actor: Actor, input: Input) {
  const order = await workable(env, actor, input)
  const severity = input.text('severity', { max: 10 }), text = input.text('text', { max: 2000 })
  insist(['low', 'medium', 'high'].includes(severity), 'invalid_severity')
  // The checklist step this finding answers, by its index in the pinned revision; none means the whole work order.
  const item = input.integer('item', { optional: true, max: 1000 })
  if (item !== null) {
    insist(order.checklist_revision_id, 'no_checklist', 409)
    const revision = await one(env, 'SELECT items_json FROM gk_checklist_revisions WHERE id = ?', order.checklist_revision_id)
    insist(item < (JSON.parse(revision!.items_json) as unknown[]).length, 'invalid_item')
  }
  // ASSET-004: optional failure mode, cause, remedy and risk codes, each an active catalog code.
  const codes: Record<string, string | null> = {}
  for (const [kind, name] of [['failure_mode', 'failureMode'], ['cause', 'cause'], ['remedy', 'remedy'], ['risk', 'risk']] as const) {
    const key = input.text(name, { optional: true, max: 40 })
    codes[kind] = key ? (await activeCode(env, kind, key)).id : null
  }
  const followUp = input.flag('followUp')
  const id = newId(), followUpId = followUp ? newId() : null
  const statements = [...touch(env, order)]
  if (followUpId) {
    const due = input.text('followUpDue', { optional: true, max: 10 }) || addDays(actor.today, severity === 'high' ? 1 : 7)
    insist(isDate(due), 'invalid_followUpDue')
    statements.push(stmt(env, `INSERT INTO gk_work_orders (id, number, asset_id, kind, follow_up_of, title, description, due_date, status, created_by, created_at) VALUES (?, ${NEXT_NUMBER}, ?, 'corrective', ?, ?, ?, ?, 'open', ?, ?)`,
      followUpId, order.asset_id, order.id, `Follow-up: ${text.slice(0, 120)}`, text, due, actor.id, now()))
  }
  statements.push(stmt(env, 'INSERT INTO gk_findings (id, work_order_id, asset_id, item, severity, text, follow_up_id, failure_mode, cause, remedy, risk, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, order.id, order.asset_id, item, severity, text, followUpId, codes.failure_mode, codes.cause, codes.remedy, codes.risk, actor.id, now()))
  await commit(env, statements, [{ actor: actor.id, action: 'finding.record', subject: order.id, detail: { finding: id, item, severity, followUp: followUpId, ...codes } },
    ...(followUpId ? [{ actor: actor.id, action: 'workorder.create', subject: followUpId, detail: { followUpOf: order.id } }] : [])])
  return { id: order.id, finding: id, followUp: followUpId }
}

export type WorkView = Row & { crew: Awaited<ReturnType<typeof crewOf>>; collaborating: boolean; items: { index: number; text: string; result: Row | null }[]; meters: Row[]; readings: Row[]; parts: Row[]; reservations: Awaited<ReturnType<typeof reservations>>; downtime: Row[]; findings: Row[]; evidence: Row[]; reviews: Row[]; decisions: Row[]; control: Row[]; merged: Row[]; origin: Awaited<ReturnType<typeof correctionOrigin>>; mine: boolean; missing: string[] }

/** Everything about one work order, for its page and the JSON door. */
export async function workOrderDetail(env: Bindings, actor: Actor, id: string): Promise<WorkView> {
  const order = await one(env, `SELECT w.*, a.tag AS asset_tag, a.name AS asset_name, a.serial AS asset_serial, a.location AS asset_location, a.custodian AS asset_custodian, a.category AS asset_category,
    m.name AS assignee_name, c.name AS checklist_name, r.number AS checklist_revision, r.items_json, s.title AS schedule_title, f.number AS follow_up_of_number, mi.number AS merged_into_number
    FROM gk_work_orders w JOIN gk_assets a ON a.id = w.asset_id LEFT JOIN gk_members m ON m.id = w.assignee_id
    LEFT JOIN gk_checklist_revisions r ON r.id = w.checklist_revision_id LEFT JOIN gk_checklists c ON c.id = r.checklist_id
    LEFT JOIN gk_schedules s ON s.id = w.schedule_id LEFT JOIN gk_work_orders f ON f.id = w.follow_up_of LEFT JOIN gk_work_orders mi ON mi.id = w.merged_into WHERE w.id = ?`, id)
  insist(order, 'work_order_not_found', 404)
  const results = new Map((await all(env, 'SELECT r.item, r.outcome, r.note, m.name AS recorded_by, r.recorded_at FROM gk_results r LEFT JOIN gk_members m ON m.id = r.recorded_by WHERE r.work_order_id = ?', id)).map(row => [row.item, row]))
  const items = order.items_json ? (JSON.parse(order.items_json) as { text: string }[]).map((item, index) => ({ index, text: item.text, result: results.get(index) ?? null })) : []
  const meters = await all(env, 'SELECT id, name, unit, kind FROM gk_meters WHERE asset_id = ? ORDER BY name', order.asset_id)
  const readings = await all(env, 'SELECT r.value, r.taken_on, g.name AS meter, g.unit, g.kind, m.name AS entered_by FROM gk_readings r JOIN gk_meters g ON g.id = r.meter_id LEFT JOIN gk_members m ON m.id = r.entered_by WHERE r.work_order_id = ? ORDER BY r.taken_on, g.name', id)
  const parts = (await all(env, `SELECT p.id, p.number, p.name, p.unit,
    -SUM(CASE WHEN mv.kind = 'issue' THEN mv.quantity_milli ELSE 0 END) AS issued, SUM(CASE WHEN mv.kind = 'return' THEN mv.quantity_milli ELSE 0 END) AS returned
    FROM gk_part_moves mv JOIN gk_parts p ON p.id = mv.part_id WHERE mv.work_order_id = ? GROUP BY p.id ORDER BY p.number`, id))
    .map(row => ({ ...row, issued: fromMilli(row.issued), returned: fromMilli(row.returned), used: fromMilli(row.issued - row.returned) }))
  const downtime = (await classifiedStops(env, 'd.work_order_id = ?', id)).map(row => ({ id: row.id, started_on: row.started_on, ended_on: row.ended_on, minutes: row.minutes, reason: row.reason, planned: row.planned, failure_mode: row.failureMode, reclassified: row.reclassified, classifications: row.classifications }))
  const findings = (await all(env, 'SELECT f.id, f.item, f.severity, f.text, f.follow_up_id, f.rule_id, (SELECT group_concat(c.label, \' · \') FROM gk_codes c WHERE c.id IN (f.failure_mode, f.cause, f.remedy, f.risk)) AS codes, f.failure_mode, f.cause, f.remedy, f.risk, w.number AS follow_up_number, w.status AS follow_up_status, w.acknowledged_at AS follow_up_acknowledged, m.name AS recorded_by, f.recorded_at FROM gk_findings f LEFT JOIN gk_work_orders w ON w.id = f.follow_up_id LEFT JOIN gk_members m ON m.id = f.recorded_by WHERE f.work_order_id = ? ORDER BY f.recorded_at, f.item', id))
    .map(row => ({ ...row, obligation: obligation(row) }))
  const reserved = await reservations(env, 'r.work_order_id = ?', id)
  const evidence = await all(env, 'SELECT e.id, e.filename, e.media_type, e.size, e.sha256, m.name AS uploaded_by, e.uploaded_at FROM gk_evidence e LEFT JOIN gk_members m ON m.id = e.uploaded_by WHERE e.work_order_id = ? ORDER BY e.uploaded_at', id)
  const reviews = await all(env, 'SELECT r.version, r.decision, r.reason, m.name AS reviewer, r.at FROM gk_reviews r LEFT JOIN gk_members m ON m.id = r.reviewer WHERE r.work_order_id = ? ORDER BY r.at', id)
  const decisions = (await all(env, `SELECT a.at, a.detail, m.name AS decided_by, h.name AS holder, t.name AS too FROM gk_audit a LEFT JOIN gk_members m ON m.id = a.actor
    LEFT JOIN gk_members h ON h.id = json_extract(a.detail, '$.holder') LEFT JOIN gk_members t ON t.id = json_extract(a.detail, '$.to') WHERE a.action = 'workorder.plan' AND a.subject = ? ORDER BY a.at DESC, a.seq DESC`, id))
    .map(({ detail, too, ...row }) => ({ ...row, plan: JSON.parse(detail).plan, to: too }))
  // PLAN-007: cancellations, reschedules, reopenings and merges, with their reasons, and the duplicates merged into this one.
  const control = (await all(env, `SELECT a.at, a.action, a.detail, m.name AS by FROM gk_audit a LEFT JOIN gk_members m ON m.id = a.actor
    WHERE a.subject = ? AND a.action IN ('workorder.cancel', 'workorder.reschedule', 'workorder.reopen', 'workorder.merge', 'workorder.merged') ORDER BY a.seq`, id))
    .map(({ detail, ...row }) => ({ ...row, ...JSON.parse(detail) }))
  const merged = await all(env, 'SELECT id, number, title FROM gk_work_orders WHERE merged_into = ? ORDER BY number', id)
  const origin = await correctionOrigin(env, id)
  // PM-002: the reading that raised this preventive work, as evidence.
  const trigger = order.trigger_reading_id ? await one(env, 'SELECT r.id, r.value, r.taken_on, r.provenance, r.source, r.quality, g.name AS meter, g.unit FROM gk_readings r JOIN gk_meters g ON g.id = r.meter_id WHERE r.id = ?', order.trigger_reading_id) : null
  const chase = await chaseOf(env, order, actor.today)
  const crew = await crewOf(env, order, actor)
  const { items_json: _items, ...rest } = order
  return { ...rest, trigger, chase, crew, collaborating: crew.collaborating, items, meters, readings, parts, reservations: reserved, downtime, findings, evidence, reviews, decisions, control, merged, origin, mine: order.assignee_id === actor.id, missing: submitBlockers({ items, findings, downtime, unacknowledged: Boolean(origin && !order.acknowledged_at) }) }
}

/** Why a work order cannot be submitted yet, in the person's words. Each failed or needs-attention step needs its own linked finding. */
export function submitBlockers({ items, findings, downtime, unacknowledged = false }: { items: { index: number; text: string; result: { outcome: string } | null }[]; findings: { item: number | null }[]; downtime: { ended_on: string | null }[]; unacknowledged?: boolean }) {
  const blockers: string[] = []
  if (unacknowledged) blockers.push('the assignee has not acknowledged this correction')
  const missing = items.filter(item => !item.result).length
  if (missing) blockers.push(`${missing} checklist item${missing === 1 ? '' : 's'} without a result`)
  for (const item of items) if (item.result && item.result.outcome !== 'pass' && !findings.some(finding => finding.item === item.index))
    blockers.push(`step ${item.index + 1} (${item.text}) ${item.result.outcome === 'fail' ? 'failed' : 'needs attention'} and needs a linked corrective finding`)
  if (downtime.some(row => !row.ended_on)) blockers.push('downtime is still open')
  return blockers
}

/** Work lists: everything open, one team's (`team`), or one person's own: assigned to them or collaborating on it (PLAN-002). */
export async function workList(env: Bindings, actor: Actor, url: URL) {
  const mine = url.searchParams.get('mine') === '1' || (!can(actor, 'work.assign') && !can(actor, 'work.review') && actor.role !== 'agent')
  const team = url.searchParams.get('team')
  const state = url.searchParams.get('state') ?? 'open'
  const filter = state === 'closed' ? "w.status IN ('closed', 'cancelled')" : "w.status NOT IN ('closed', 'cancelled')"
  const collaborating = 'EXISTS(SELECT 1 FROM gk_collaborators c WHERE c.work_order_id = w.id AND c.member_id = ? AND c.removed_at IS NULL)'
  return await all(env, `SELECT w.id, w.number, w.title, w.kind, w.status, w.due_date, w.version, a.id AS asset_id, a.tag AS asset_tag, a.name AS asset_name, a.location AS asset_location, a.category AS asset_category, m.name AS assignee, w.assignee_id,
    t.name AS team, w.trade, w.shift, CASE WHEN w.assignee_id = ? THEN 'assignee' WHEN ${collaborating} THEN 'collaborator' END AS my_part
    FROM gk_work_orders w JOIN gk_assets a ON a.id = w.asset_id LEFT JOIN gk_members m ON m.id = w.assignee_id LEFT JOIN gk_teams t ON t.id = w.team_id
    WHERE ${filter} ${mine ? `AND (w.assignee_id = ? OR ${collaborating})` : ''} ${team ? 'AND w.team_id = ?' : ''} ORDER BY ${state === 'closed' ? 'w.closed_at DESC' : 'w.due_date, w.number'} LIMIT 500`,
  actor.id, actor.id, ...(mine ? [actor.id, actor.id] : []), ...(team ? [team] : []))
}

export async function evidenceFile(env: Bindings, _actor: Actor, id: string) {
  const row = await one<{ filename: string; media_type: string; bytes: ArrayBuffer | number[] }>(env, 'SELECT filename, media_type, bytes FROM gk_evidence WHERE id = ?', id)
  insist(row, 'evidence_not_found', 404)
  return new Response(new Uint8Array(row.bytes as ArrayBuffer), { headers: { 'content-type': row.media_type, 'content-disposition': `inline; filename="${row.filename.replace(/["\\]/g, '_')}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" } })
}
