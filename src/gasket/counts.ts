// PART-004: planned blind cycle counts with independent variance approval.
// - A lead or the owner plans a count of one shelf location's parts and/or
//   chosen parts for one counter (an active owner, lead or maintainer).
// - The count sheet never shows its counter the expected quantity while the
//   count is open; the parts register itself still shows on-hand.
// - A count stands for the shelf at the moment it is submitted: each line
//   keeps the on-hand and movement sequence then, and its variance is counted
//   minus that expected quantity. Movements during or after the count are
//   reconciled, never undone: an approved variance posts onto whatever is on
//   hand when it is approved.
// - A shortage needs the reason lost or damaged, an overage found; a matched
//   line needs none. Each variance is valued by PART-007 (the stock's average)
//   when it posts.
// - Variances valued at or above the site's approval threshold (owner-set;
//   $0.00, the default, means every variance) wait for a lead or the owner
//   who did not count them; smaller ones post at submission.
// - Approval is refused as stale once another count of that part has posted
//   after the line was counted, and refused when posting would leave on-hand
//   below zero; a rejection needs a reason and posts nothing.
import type { Bindings } from '../auth.server'
import { can, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { fromMilli, toMilli } from './quantity'
import { cents, varianceValue } from './valuation'

export const REASONS = ['lost', 'found', 'damaged'] as const
const ON_HAND_OF = '(SELECT COALESCE(SUM(quantity_milli), 0) FROM gk_part_moves WHERE part_id = ?)'
const LATEST_OF = '(SELECT COALESCE(MAX(seq), 0) FROM gk_part_moves WHERE part_id = ?)'

const threshold = async (env: Bindings) => (await one<{ cents: number }>(env, 'SELECT count_approval_cents AS cents FROM gk_site WHERE singleton = 1'))?.cents ?? 0

/** The owner sets the variance value (USD) at or above which a counted variance waits for approval. */
export async function setCountApproval(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const value = cents(input, 'threshold') ?? 0, before = await threshold(env)
  await commit(env, [stmt(env, 'UPDATE gk_site SET count_approval_cents = ?, updated_at = ? WHERE singleton = 1', value, now())],
    { actor: actor.id, action: 'count.policy', subject: 'site', detail: { fromCents: before, toCents: value } })
  return { thresholdCents: value }
}

export async function planCount(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const title = input.text('title', { max: 120 }), location = input.text('location', { optional: true, max: 120 }) || null
  const counter = await one(env, "SELECT id, name FROM gk_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'lead', 'maintainer')", input.text('counter', { max: 100 }))
  insist(counter, 'invalid_counter')
  const chosen = input.list('part')
  const found = await all<{ id: string }>(env, `SELECT id FROM gk_parts WHERE ${location ? 'location = ? OR ' : ''}id IN (SELECT value FROM json_each(?)) ORDER BY location, number`, ...(location ? [location] : []), JSON.stringify(chosen))
  insist(found.length && chosen.every(id => found.some(row => row.id === id)), 'invalid_parts')
  const id = newId()
  await commit(env, [
    stmt(env, 'INSERT INTO gk_counts (id, number, title, location, counter_id, planned_by, planned_at) VALUES (?, (SELECT COALESCE(MAX(number), 0) + 1 FROM gk_counts), ?, ?, ?, ?, ?)', id, title, location, counter.id, actor.id, now()),
    ...found.map((part, position) => stmt(env, 'INSERT INTO gk_count_lines (id, count_id, part_id, position) VALUES (?, ?, ?, ?)', newId(), id, part.id, position)),
  ], { actor: actor.id, action: 'count.plan', subject: id, detail: { title, location, counter: counter.id, parts: found.length } })
  return { id }
}

async function countOf(env: Bindings, actor: Actor, id: string) {
  const count = await one(env, 'SELECT c.*, m.name AS counter, p.name AS planned_by_name FROM gk_counts c JOIN gk_members m ON m.id = c.counter_id LEFT JOIN gk_members p ON p.id = c.planned_by WHERE c.id = ?', id)
  insist(count, 'count_not_found', 404)
  insist(can(actor, 'register.manage') || count.counter_id === actor.id, 'forbidden', 403)
  return count
}

/** The count sheet. Its counter never sees expected quantities while it is open. */
export async function countDetail(env: Bindings, actor: Actor, id: string) {
  const count = await countOf(env, actor, id)
  const blind = count.status === 'open' && count.counter_id === actor.id
  const lines = await all(env, `SELECT l.*, p.number, p.name, p.unit, p.location, ${ON_HAND_OF.replace('?', 'l.part_id')} AS on_hand, d.name AS decided_by_name, mv.value_cents
    FROM gk_count_lines l JOIN gk_parts p ON p.id = l.part_id LEFT JOIN gk_members d ON d.id = l.decided_by LEFT JOIN gk_part_moves mv ON mv.id = l.move_id WHERE l.count_id = ? ORDER BY l.position`, id)
  return { id: count.id, number: count.number, title: count.title, location: count.location, counter: { id: count.counter_id, name: count.counter }, plannedBy: count.planned_by_name, plannedAt: count.planned_at, status: count.status, submittedAt: count.submitted_at, blind,
    thresholdCents: await threshold(env),
    lines: lines.map(line => ({ id: line.id, part: { id: line.part_id, number: line.number, name: line.name, unit: line.unit, location: line.location }, state: line.state, reason: line.reason, note: line.note,
      counted: line.counted_milli === null ? null : fromMilli(line.counted_milli),
      ...(blind ? {} : {
        expected: line.expected_milli === null ? null : fromMilli(line.expected_milli),
        variance: line.counted_milli === null ? null : fromMilli(line.counted_milli - line.expected_milli),
        onHand: fromMilli(line.on_hand),
        // What on-hand becomes if a waiting variance is approved now: today's on-hand plus the counted variance.
        afterApproval: line.state === 'waiting' ? fromMilli(line.on_hand + line.counted_milli - line.expected_milli) : null,
        valueCents: line.value_cents ?? null, decidedBy: line.decided_by_name, decidedAt: line.decided_at, decisionNote: line.decision_note,
      }) })) }
}

export async function countList(env: Bindings, actor: Actor) {
  const mine = can(actor, 'register.manage') ? '' : 'WHERE c.counter_id = ?'
  return await all(env, `SELECT c.id, c.number, c.title, c.location, c.status, m.name AS counter, c.planned_at, c.submitted_at,
    (SELECT COUNT(*) FROM gk_count_lines l WHERE l.count_id = c.id) AS lines, (SELECT COUNT(*) FROM gk_count_lines l WHERE l.count_id = c.id AND l.state = 'waiting') AS waiting
    FROM gk_counts c JOIN gk_members m ON m.id = c.counter_id ${mine} ORDER BY c.number DESC`, ...(mine ? [actor.id] : []))
}

function reasonFor(variance: number, text: string) {
  const reason = text || null
  insist(reason === null || (REASONS as readonly string[]).includes(reason), 'invalid_reason')
  if (variance === 0) insist(reason === null, 'reason_without_variance')
  else insist(variance > 0 ? reason === 'found' : reason === 'lost' || reason === 'damaged', 'reason_required')
  return reason
}

const moveInsert = (env: Bindings, id: string, line: { id: string; part_id: string }, variance: number, value: number, counted: number, reason: string | null, number: number, actor: string) =>
  stmt(env, "INSERT INTO gk_part_moves (id, part_id, kind, quantity_milli, value_cents, counted_milli, reason, count_line_id, note, actor, at) VALUES (?, ?, 'count', ?, ?, ?, ?, ?, ?, ?, ?)",
    id, line.part_id, variance, value, counted, reason, line.id, `Cycle count CC-${number}`, actor, now())

/** The counter submits every line: counted quantity and, for a variance, its reason. */
export async function submitCount(env: Bindings, actor: Actor, input: Input) {
  const count = await countOf(env, actor, input.text('count', { max: 100 }))
  insist(count.counter_id === actor.id, 'not_the_counter', 403)
  insist(count.status === 'open', 'count_submitted', 409)
  const lines = await all<{ id: string; part_id: string }>(env, 'SELECT id, part_id FROM gk_count_lines WHERE count_id = ? ORDER BY position', count.id)
  const ids = input.list('line', { keepEmpty: true }), counted = input.list('counted', { keepEmpty: true }), reasons = input.list('reason', { keepEmpty: true }), notes = input.list('note', { keepEmpty: true })
  insist(ids.length === lines.length && lines.every(line => ids.includes(line.id)) && counted.length === ids.length, 'every_line_counted')
  const limit = await threshold(env), statements: D1PreparedStatement[] = [], outcome: Record<string, string> = {}
  for (const line of lines) {
    const at = ids.indexOf(line.id)
    const quantity = toMilli(counted[at] ?? '', 'counted', { allowZero: true })
    const stock = (await one<{ on_hand: number; seq: number }>(env, `SELECT ${ON_HAND_OF} AS on_hand, ${LATEST_OF} AS seq`, line.part_id, line.part_id))!
    const variance = quantity - stock.on_hand, reason = reasonFor(variance, reasons[at] ?? ''), note = (notes[at] ?? '').slice(0, 300) || null
    const value = await varianceValue(env, line.part_id, variance)
    const state = variance === 0 ? 'matched' : Math.abs(value) >= limit ? 'waiting' : 'posted'
    const move = state === 'posted' ? newId() : null
    statements.push(guard(env, 'stale', `${LATEST_OF} = ?`, line.part_id, stock.seq),
      stmt(env, 'UPDATE gk_count_lines SET counted_milli = ?, expected_milli = ?, seen_seq = ?, reason = ?, note = ?, state = ?, move_id = ? WHERE id = ?', quantity, stock.on_hand, stock.seq, reason, note, state, move, line.id),
      ...(move ? [moveInsert(env, move, line, variance, value, quantity, reason, count.number, actor.id)] : []))
    outcome[line.id] = state
  }
  await commit(env, [guard(env, 'count_submitted', "(SELECT status FROM gk_counts WHERE id = ?) = 'open'", count.id), ...statements,
    stmt(env, "UPDATE gk_counts SET status = 'submitted', submitted_at = ? WHERE id = ?", now(), count.id)],
  { actor: actor.id, action: 'count.submit', subject: count.id, detail: { lines: outcome } })
  return { id: count.id, lines: outcome }
}

/** A lead or the owner who did not count it approves or rejects a waiting variance. */
export async function decideCountLine(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const line = await one(env, 'SELECT l.*, c.number, c.counter_id FROM gk_count_lines l JOIN gk_counts c ON c.id = l.count_id WHERE l.id = ?', input.text('line', { max: 100 }))
  insist(line, 'count_line_not_found', 404)
  insist(line.counter_id !== actor.id, 'independent_approval_required', 403)
  insist(line.state === 'waiting', 'count_line_decided', 409)
  const decision = input.text('decision', { max: 10 }), note = input.text('note', { optional: true, max: 300 }) || null
  insist(decision === 'approve' || decision === 'reject', 'invalid_decision')
  const decided = [guard(env, 'count_line_decided', "(SELECT state FROM gk_count_lines WHERE id = ?) = 'waiting'", line.id)]
  if (decision === 'reject') {
    insist(note, 'reason_required')
    await commit(env, [...decided, stmt(env, "UPDATE gk_count_lines SET state = 'rejected', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?", actor.id, now(), note, line.id)],
      { actor: actor.id, action: 'count.reject', subject: line.count_id, detail: { line: line.id, note } })
    return { id: line.id, state: 'rejected' }
  }
  const later = "(SELECT COUNT(*) FROM gk_part_moves WHERE part_id = ? AND kind = 'count' AND seq > ?)"
  insist((await one<{ n: number }>(env, `SELECT ${later} AS n`, line.part_id, line.seen_seq))!.n === 0, 'stale_count', 409)
  const variance = line.counted_milli - line.expected_milli
  const stock = (await one<{ on_hand: number; seq: number }>(env, `SELECT ${ON_HAND_OF} AS on_hand, ${LATEST_OF} AS seq`, line.part_id, line.part_id))!
  insist(stock.on_hand + variance >= 0, 'count_below_zero', 409, { onHand: fromMilli(stock.on_hand), variance: fromMilli(variance) })
  const value = await varianceValue(env, line.part_id, variance), move = newId()
  await commit(env, [...decided, guard(env, 'stale', `${LATEST_OF} = ?`, line.part_id, stock.seq),
    moveInsert(env, move, line, variance, value, line.counted_milli, line.reason, line.number, actor.id),
    stmt(env, "UPDATE gk_count_lines SET state = 'approved', move_id = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?", move, actor.id, now(), note, line.id)],
  { actor: actor.id, action: 'count.approve', subject: line.count_id, detail: { line: line.id, part: line.part_id, variance: fromMilli(variance), valueCents: value, reason: line.reason } })
  return { id: line.id, state: 'approved', variance: fromMilli(variance), valueCents: value }
}
