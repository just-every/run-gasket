// PM-004: a failed inspection step raises an accountable correction. A lead
// approves one rule per checklist (which outcomes count, severity, deadline);
// recording a matching result creates the step's finding and a linked corrective
// work order carrying the step, its note, the readings and the evidence. The
// correction's assignee acknowledges it before submitting it, and only its
// independent approval resolves the original failure; closing the inspection
// leaves it open on the board.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { NEXT_NUMBER, all, commit, guard, insist, newId, now, one, stmt, type Audit, type Row } from './core'
import { addDays } from './dates'
import type { Input } from './input'

const OUTCOMES = ['fail', 'attention']

export async function setRule(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const checklist = await one(env, 'SELECT id FROM gk_checklists WHERE id = ?', input.text('checklist', { max: 100 }))
  insist(checklist, 'checklist_not_found', 404)
  const outcomes = input.list('outcome')
  insist(outcomes.every(outcome => OUTCOMES.includes(outcome)) && new Set(outcomes).size === outcomes.length, 'invalid_outcome')
  const active = outcomes.length > 0
  const severity = active ? input.text('severity', { max: 10 }) : 'low'
  insist(['low', 'medium', 'high'].includes(severity), 'invalid_severity')
  const dueDays = active ? input.integer('dueDays', { min: 0, max: 365 })! : 0
  const latest = await one<{ number: number }>(env, 'SELECT number FROM gk_failure_rules WHERE checklist_id = ? ORDER BY number DESC LIMIT 1', checklist.id)
  const id = newId(), number = (latest?.number ?? 0) + 1
  await commit(env, [stmt(env, 'INSERT INTO gk_failure_rules (id, checklist_id, number, outcomes, severity, due_days, active, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, checklist.id, number, outcomes.join(','), severity, dueDays, active ? 1 : 0, actor.id, now())],
  { actor: actor.id, action: 'rule.set', subject: checklist.id, detail: { rule: id, number, outcomes, severity, dueDays } })
  return { id, number }
}

export async function rules(env: Bindings, checklistId: string): Promise<(Row & { outcomes: string[] })[]> {
  return (await all(env, 'SELECT r.id, r.number, r.outcomes, r.severity, r.due_days, r.active, m.name AS approved_by, r.approved_at FROM gk_failure_rules r LEFT JOIN gk_members m ON m.id = r.approved_by WHERE r.checklist_id = ? ORDER BY r.number DESC', checklistId))
    .map(row => ({ ...row, outcomes: row.outcomes ? row.outcomes.split(',') : [] }))
}

/** Statements and audit entries raising a correction for each recorded result the checklist's rule covers and no finding answers yet. */
export async function correctionStatements(env: Bindings, actor: Actor, order: Row, recorded: { item: number; outcome: string; note: string | null }[]) {
  const statements: D1PreparedStatement[] = [], audits: Audit[] = []
  const revision = await one(env, 'SELECT checklist_id, items_json FROM gk_checklist_revisions WHERE id = ?', order.checklist_revision_id)
  const rule = await one(env, 'SELECT * FROM gk_failure_rules WHERE checklist_id = ? ORDER BY number DESC LIMIT 1', revision!.checklist_id)
  if (!rule?.active) return { statements, audits }
  const items = JSON.parse(revision!.items_json) as { text: string }[]
  const answered = new Set((await all(env, 'SELECT item FROM gk_findings WHERE work_order_id = ? AND item IS NOT NULL', order.id)).map(row => row.item))
  const covered = recorded.filter(row => rule.outcomes.split(',').includes(row.outcome) && !answered.has(row.item))
  if (!covered.length) return { statements, audits }
  const readings = await all(env, 'SELECT g.name, g.unit, r.value, r.taken_on FROM gk_readings r JOIN gk_meters g ON g.id = r.meter_id WHERE r.work_order_id = ? ORDER BY r.taken_on, g.name', order.id)
  const evidence = await all(env, 'SELECT filename, sha256 FROM gk_evidence WHERE work_order_id = ? ORDER BY uploaded_at', order.id)
  for (const row of covered) {
    const what = `Step ${row.item + 1} (${items[row.item].text}) ${row.outcome === 'fail' ? 'failed' : 'needs attention'}${row.note ? `: ${row.note}` : ''}`
    const description = [what, ...readings.map(reading => `Reading: ${reading.name} ${reading.value}${reading.unit && reading.unit !== 'condition' ? ` ${reading.unit}` : ''}, taken ${reading.taken_on.replace('T', ' ')}`),
      ...evidence.map(file => `Evidence: ${file.filename} (SHA-256 ${file.sha256})`)].join('\n')
    const finding = newId(), correction = newId(), due = addDays(actor.today, rule.due_days)
    statements.push(
      stmt(env, `INSERT INTO gk_work_orders (id, number, asset_id, kind, follow_up_of, title, description, due_date, assignee_id, status, created_by, created_at) VALUES (?, ${NEXT_NUMBER}, ?, 'corrective', ?, ?, ?, ?, ?, 'open', ?, ?)`,
        correction, order.asset_id, order.id, `Correct: ${what}`.slice(0, 160), description, due, order.assignee_id, actor.id, now()),
      stmt(env, 'INSERT INTO gk_findings (id, work_order_id, asset_id, item, severity, text, follow_up_id, rule_id, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        finding, order.id, order.asset_id, row.item, rule.severity, what, correction, rule.id, actor.id, now()))
    audits.push({ actor: actor.id, action: 'finding.record', subject: order.id, detail: { finding, item: row.item, severity: rule.severity, followUp: correction, rule: rule.id } },
      { actor: actor.id, action: 'workorder.create', subject: correction, detail: { followUpOf: order.id, item: row.item, rule: rule.id, due } })
  }
  return { statements, audits }
}

/** The assignee of a correction takes it on. */
export async function acknowledge(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.do')
  const order = await one(env, 'SELECT * FROM gk_work_orders WHERE id = ?', input.text('workOrder', { max: 100 }))
  insist(order, 'work_order_not_found', 404)
  insist(order.assignee_id === actor.id, 'not_your_work', 403)
  insist(await one(env, 'SELECT 1 FROM gk_findings WHERE follow_up_id = ? AND rule_id IS NOT NULL', order.id), 'not_a_correction', 409)
  insist(!order.acknowledged_at, 'already_acknowledged', 409)
  await commit(env, [
    guard(env, 'stale', "EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status IN ('open', 'in_progress', 'returned'))", order.id, order.version),
    stmt(env, 'UPDATE gk_work_orders SET acknowledged_at = ?, acknowledged_by = ?, version = version + 1 WHERE id = ?', now(), actor.id, order.id),
  ], { actor: actor.id, action: 'workorder.acknowledge', subject: order.id, detail: {} })
  return { id: order.id }
}

/** For a correction: the failure it answers, with the inspection's readings and evidence. */
export async function correctionOrigin(env: Bindings, id: string) {
  const finding = await one(env, `SELECT f.id AS finding, f.work_order_id, f.item, f.severity, f.text, f.rule_id, r.number AS rule, w.number, w.status FROM gk_findings f
    JOIN gk_failure_rules r ON r.id = f.rule_id JOIN gk_work_orders w ON w.id = f.work_order_id WHERE f.follow_up_id = ?`, id)
  if (!finding) return null
  const readings = await all(env, 'SELECT g.name AS meter, g.unit, g.kind, r.value, r.taken_on FROM gk_readings r JOIN gk_meters g ON g.id = r.meter_id WHERE r.work_order_id = ? ORDER BY r.taken_on, g.name', finding.work_order_id)
  const evidence = await all(env, 'SELECT id, filename, sha256 FROM gk_evidence WHERE work_order_id = ? ORDER BY uploaded_at', finding.work_order_id)
  return { ...finding, readings, evidence } as Row & { readings: Row[]; evidence: Row[] }
}

/** Where a finding's correction stands: open, acknowledged, resolved by independent approval, or cancelled. */
export const obligation = (row: { follow_up_id: string | null; follow_up_status: string | null; follow_up_acknowledged: number | null }) =>
  !row.follow_up_id ? null : row.follow_up_status === 'closed' ? 'resolved' : row.follow_up_status === 'cancelled' ? 'cancelled' : row.follow_up_acknowledged ? 'acknowledged' : 'open'
