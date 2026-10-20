// AGENT-005: a signed-in agent asks and follows up; people own promises and decisions.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import { chaseRule } from './chasing'
import { daysBetween, isDate } from './dates'
import type { Input } from './input'
import { workOrderDetail } from './work'

export const queriesOf = (env: Bindings, id: string) => all(env, `SELECT q.*, a.next_action, a.promised_on, a.answered_by, a.answered_at, m.name AS recipient
  FROM gk_agent_queries q LEFT JOIN gk_agent_answers a ON a.query_id=q.id LEFT JOIN gk_members m ON m.id=q.recipient_id WHERE q.work_order_id=? ORDER BY q.asked_at,q.id`, id)

export async function followUpCase(env: Bindings, actor: Actor, id: string) {
  const work = await workOrderDetail(env, actor, id), rule = await chaseRule(env), queries = await queriesOf(env, id)
  const open = !['closed', 'cancelled'].includes(work.status)
  const overdueDays = Math.max(0, daysBetween(work.overdue_since ?? work.due_date, actor.today))
  const missed = queries.filter(q => q.promised_on && q.promised_on < actor.today && open)
  const unanswered = queries.filter(q => !q.answered_at && now() - q.asked_at >= rule.response_within_days * 86_400_000 && open)
  const blockers = work.chase.blockers.filter((b: any) => !b.resolved_at)
  const missedBlockers = blockers.filter((b: any) => b.promised_on < actor.today)
  const escalationDue = open && (overdueDays >= rule.lead_after_days && work.due_date < actor.today || Boolean(missed.length || missedBlockers.length || unanswered.length))
  const linked = [], seen = new Set<string>([id]), pending = [...work.findings.filter((f: any) => f.follow_up_id).map((f: any) => f.follow_up_id)]
  while (pending.length) {
    const next = pending.shift()!
    if (seen.has(next)) continue
    seen.add(next)
    const detail = await workOrderDetail(env, actor, next)
    linked.push({ id: detail.id, number: detail.number, status: detail.status, version: detail.version, missing: detail.missing, reviews: detail.reviews, findings: detail.findings })
    pending.push(...detail.findings.filter((f: any) => f.follow_up_id).map((f: any) => f.follow_up_id))
  }
  const verified = (w: Record<string, any>) => w.status === 'closed' && !w.missing.length && w.reviews.some((r: any) => r.decision === 'approved')
  const closureReady = verified(work) && linked.every(verified) && !blockers.length
  return { workOrder: id, version: work.version, number: work.number, title: work.title, status: work.status, dueDate: work.due_date,
    assignee: work.assignee_id, acknowledgedAt: work.acknowledged_at, findings: work.findings, missing: work.missing, reviews: work.reviews,
    blockers, linked, queries, rule, overdueDays, missed, unanswered, missedBlockers, escalationDue, closureReady,
    closureReason: closureReady ? 'Technician evidence and independent approvals retained for this work and every linked corrective outcome.' : 'Work and all linked corrective outcomes need complete technician evidence, independent approval and cleared blockers.' }
}

export async function followUpView(env: Bindings, actor: Actor, id: string) {
  requireCapability(actor, 'proposal.prepare')
  return followUpCase(env, actor, id)
}

const workGuard = (env: Bindings, id: string, version: number) => guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=?)', id, version)
// Fence cross-record reads against any intervening audited mutation in the same transaction.
export const auditRevision = async (env: Bindings) => (await one<{ seq: number }>(env, 'SELECT COALESCE(MAX(seq),0) AS seq FROM gk_audit'))!.seq
export const auditFence = (env: Bindings, seq: number) => guard(env, 'stale', '(SELECT COALESCE(MAX(seq),0) FROM gk_audit)=?', seq)

export async function askFollowUp(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'proposal.prepare')
  const revision = await auditRevision(env), state = await followUpCase(env, actor, input.text('workOrder', { max: 100 }))
  insist(!['closed','cancelled'].includes(state.status), 'work_order_not_open', 409)
  insist(input.integer('version', { min: 1 }) === state.version, 'stale', 409)
  const responsible = state.status === 'submitted'
    ? (await all(env, "SELECT id FROM gk_members WHERE status='active' AND role='supervisor' ORDER BY id")).map(m => m.id)
    : [...new Set([state.assignee, ...state.blockers.map((b: any) => b.owner_id)].filter(Boolean))]
  if (!responsible.length) responsible.push(...(await all(env, "SELECT id FROM gk_members WHERE status='active' AND role IN ('owner','lead') ORDER BY id")).map(m => m.id))
  const recipient = input.text('recipient', { optional: true, max: 100 }) || responsible[0]
  insist(responsible.includes(recipient) && await one(env, "SELECT 1 FROM gk_members WHERE id=? AND status='active'", recipient), 'not_responsible', 409)
  const existing = await one(env, 'SELECT id FROM gk_agent_queries WHERE work_order_id=? AND work_version=? AND recipient_id=?', state.workOrder, state.version, recipient)
  if (existing) return { id: existing.id }
  const question = input.text('question', { max: 1000 }), id = newId()
  await commit(env, [auditFence(env, revision), workGuard(env, state.workOrder, state.version),
    stmt(env, 'INSERT INTO gk_agent_queries VALUES (?,?,?,?,?,?,?)', id, state.workOrder, state.version, recipient, question, actor.id, now()),
    stmt(env, 'INSERT INTO gk_notices (id,recipient_id,work_order_id,kind,occasion,text,created_at) VALUES (?,?,?,?,?,?,?)', newId(), recipient, state.workOrder, 'agent_query', id, `WO-${state.number}: ${question} Reply with your next action and promised date.`, now())],
  { actor: actor.id, action: 'agent.query', subject: state.workOrder, detail: { query: id, recipient, question, version: state.version } })
  return { id }
}

export async function answerFollowUp(env: Bindings, actor: Actor, input: Input) {
  const query = await one(env, 'SELECT q.*, w.version, w.status FROM gk_agent_queries q JOIN gk_work_orders w ON w.id=q.work_order_id WHERE q.id=?', input.text('query', { max: 100 }))
  insist(query, 'query_not_found', 404)
  insist(query.recipient_id === actor.id, 'not_your_query', 403)
  insist(!['closed','cancelled'].includes(query.status), 'work_order_not_open', 409)
  insist(!await one(env, 'SELECT 1 FROM gk_agent_answers WHERE query_id=?', query.id), 'already_answered', 409)
  const nextAction = input.text('nextAction', { max: 1000 }), promisedOn = input.text('promisedOn', { max: 10 })
  insist(isDate(promisedOn) && promisedOn >= actor.today, 'invalid_promisedOn')
  await commit(env, [workGuard(env, query.work_order_id, query.version), stmt(env, 'INSERT INTO gk_agent_answers VALUES (?,?,?,?,?)', query.id, nextAction, promisedOn, actor.id, now()),
    stmt(env, 'UPDATE gk_work_orders SET version=version+1 WHERE id=?', query.work_order_id)],
  { actor: actor.id, action: 'agent.answer', subject: query.work_order_id, detail: { query: query.id, nextAction, promisedOn } })
  return { id: query.id }
}

export async function escalateFollowUp(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'proposal.prepare')
  const revision = await auditRevision(env), state = await followUpCase(env, actor, input.text('workOrder', { max: 100 }))
  insist(state.escalationDue, 'escalation_not_due', 409)
  const roles = state.overdueDays >= state.rule.supervisor_after_days ? ['lead','supervisor','owner'] : ['lead','owner']
  const recipients = (await all(env, "SELECT id,role FROM gk_members WHERE status='active'")).filter(m => roles.includes(m.role))
  const text = `WO-${state.number} ${state.title}: ${state.status}, ${state.overdueDays} days overdue; acknowledgment ${state.acknowledgedAt ? 'recorded' : 'missing'}. ${state.blockers.map((b: any) => `${b.kind}: ${b.next_action} (promised ${b.promised_on})`).join('; ')} ${state.missed.map(q => `Missed promise ${q.promised_on}: ${q.next_action}`).join('; ')} ${state.unanswered.length} unanswered queries; ${state.missing.length} missing evidence items; ${state.linked.filter(w => w.status !== 'closed').length} unresolved linked outcomes. Human decision required.`
  const occasion = `agent-escalation:${state.workOrder}:${state.version}:${state.rule.number}:${state.missed.map(q=>q.id).join(',')}:${state.unanswered.map(q=>q.id).join(',')}:${state.missedBlockers.map((b:any)=>b.id).join(',')}`
  await commit(env, [auditFence(env, revision), ...recipients.map(m => stmt(env, 'INSERT OR IGNORE INTO gk_notices (id,recipient_id,work_order_id,kind,occasion,text,created_at) VALUES (?,?,?,?,?,?,?)', newId(), m.id, state.workOrder, 'agent_escalation', occasion, text, now()))],
    { actor: actor.id, action: 'agent.escalate', subject: state.workOrder, detail: { rule: state.rule.number, version: state.version, recipients: recipients.map(m => m.id), text } })
  return { id: state.workOrder, text, recipients: recipients.map(m => m.id) }
}

export async function recommendClosure(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'proposal.prepare')
  const revision = await auditRevision(env), state = await followUpCase(env, actor, input.text('workOrder', { max: 100 }))
  insist(state.closureReady, 'closure_not_verified', 409, { reason: state.closureReason, linked: state.linked })
  await commit(env, [auditFence(env, revision)], { actor: actor.id, action: 'agent.closure', subject: state.workOrder, detail: { version: state.version, linked: state.linked, reasoning: input.text('reasoning', { max: 2000 }) } })
  return { id: state.workOrder, recommendation: 'verified_closed', changedWork: false }
}
