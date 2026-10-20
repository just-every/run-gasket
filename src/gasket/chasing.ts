import { queriesOf } from './agent-follow-up'
// PM-006: chasing overdue work. Each scheduler run (PM-001) applies the site's
// chase rule at the site's date: it reminds the assignee a set number of days
// before the due date and again once it is overdue, asks them to respond (on it,
// or blocked), and escalates to every active lead when the work has been overdue
// for the rule's lead days or the assignee has not responded within its response
// days, and to every active supervisor (the owners when there is none) after the
// supervisor days. A blocker has a kind, an owner, a next action and a promised
// date; a missed promise notifies its owner and the leads. Notices are in-app
// (email and push are PM-005) and each one is sent once per recipient and
// occasion. Overdue age counts from the day the work first became overdue, which
// reassignment or rescheduling never resets.
import { automationAuthority } from './automation-context'
import type { Bindings } from '../auth.server'
import { can, requireCapability, type Actor } from './actor'
import { all, commit, insist, newId, now, one, stmt, type Row } from './core'
import { NOTICE_UNREAD, noticeLink } from './comments'
import { addDays, daysBetween, isDate } from './dates'
import type { Input } from './input'

export const DEFAULT_RULE = { number: 0, remind_before_days: 1, response_within_days: 1, lead_after_days: 2, supervisor_after_days: 5 }
const KINDS = ['parts', 'access', 'skill', 'production']
const OPEN = "('open', 'in_progress', 'returned')"

export const chaseRule = async (env: Bindings) => await one(env, 'SELECT * FROM gk_chase_rules ORDER BY number DESC LIMIT 1') ?? DEFAULT_RULE

/** A lead approves a new revision of the chase rule. */
export async function setChaseRule(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const value = {
    remind_before_days: input.integer('remindBeforeDays', { min: 0, max: 30 })!, response_within_days: input.integer('responseWithinDays', { min: 0, max: 30 })!,
    lead_after_days: input.integer('leadAfterDays', { min: 0, max: 90 })!, supervisor_after_days: input.integer('supervisorAfterDays', { min: 0, max: 180 })!,
  }
  insist(value.supervisor_after_days >= value.lead_after_days, 'invalid_supervisorAfterDays')
  const number = ((await chaseRule(env)).number as number) + 1
  await commit(env, [stmt(env, 'INSERT INTO gk_chase_rules (number, remind_before_days, response_within_days, lead_after_days, supervisor_after_days, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?)', number, value.remind_before_days, value.response_within_days, value.lead_after_days, value.supervisor_after_days, actor.id, now())],
    { actor: actor.id, action: 'chase.rule', subject: `rule-${number}`, detail: value })
  return { number }
}

const openOrder = async (env: Bindings, id: string) => {
  const order = await one(env, `SELECT * FROM gk_work_orders WHERE id = ? AND status IN ${OPEN}`, id)
  insist(order, 'work_order_not_open', 409)
  return order
}

/** The assignee's answer to a reminder: on it, or blocked (which raises the blocker). */
export async function respond(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.do')
  const order = await openOrder(env, input.text('workOrder', { max: 100 }))
  insist(order.assignee_id === actor.id, 'not_your_work', 403)
  const response = input.text('response', { max: 10 }), note = input.text('note', { optional: true, max: 500 }) || null
  insist(response === 'on_it' || response === 'blocked', 'invalid_response')
  const id = newId(), statements = [stmt(env, 'INSERT INTO gk_chase_responses (id, work_order_id, response, note, member_id, at) VALUES (?, ?, ?, ?, ?, ?)', id, order.id, response, note, actor.id, now())]
  const blocker = response === 'blocked' ? await blockerStatements(env, actor, order, input) : null
  await commit(env, [...statements, ...(blocker?.statements ?? [])], { actor: actor.id, action: 'workorder.respond', subject: order.id, detail: { response, note, blocker: blocker?.id ?? null } })
  return { id, blocker: blocker?.id ?? null }
}

export async function blockerStatements(env: Bindings, actor: Actor, order: Row, input: Input) {
  const kind = input.text('kind', { max: 20 }), nextAction = input.text('nextAction', { max: 500 }), promisedOn = input.text('promisedOn', { max: 10 })
  insist(KINDS.includes(kind), 'invalid_kind')
  insist(isDate(promisedOn) && promisedOn >= actor.today, 'invalid_promisedOn')
  const owner = input.text('owner', { optional: true, max: 100 }) || actor.id
  insist(await one(env, "SELECT 1 FROM gk_members WHERE id = ? AND status = 'active'", owner), 'owner_not_found', 404)
  const id = newId()
  return { id, statements: [stmt(env, 'INSERT INTO gk_blockers (id, work_order_id, kind, owner_id, next_action, promised_on, raised_by, raised_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, order.id, kind, owner, nextAction, promisedOn, actor.id, now())] }
}

/** A blocker raised by the assignee or a lead, with its owner, next action and promised date. */
export async function raiseBlocker(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.do')
  const order = await openOrder(env, input.text('workOrder', { max: 100 }))
  insist(order.assignee_id === actor.id || can(actor, 'work.assign'), 'not_your_work', 403)
  const blocker = await blockerStatements(env, actor, order, input)
  await commit(env, blocker.statements, { actor: actor.id, action: 'blocker.raise', subject: order.id, detail: { blocker: blocker.id } })
  return { id: blocker.id }
}

/** Its owner, the assignee or a lead clears a blocker with what was done. */
export async function resolveBlocker(env: Bindings, actor: Actor, input: Input) {
  const blocker = await one(env, 'SELECT b.*, w.assignee_id FROM gk_blockers b JOIN gk_work_orders w ON w.id = b.work_order_id WHERE b.id = ?', input.text('blocker', { max: 100 }))
  insist(blocker, 'blocker_not_found', 404)
  insist(!blocker.resolved_at, 'blocker_resolved', 409)
  insist([blocker.owner_id, blocker.assignee_id].includes(actor.id) || can(actor, 'work.assign'), 'forbidden', 403)
  const resolution = input.text('resolution', { max: 500 })
  await commit(env, [stmt(env, 'UPDATE gk_blockers SET resolved_at = ?, resolved_by = ?, resolution = ? WHERE id = ? AND resolved_at IS NULL', now(), actor.id, resolution, blocker.id)],
    { actor: actor.id, action: 'blocker.resolve', subject: blocker.work_order_id, detail: { blocker: blocker.id, resolution } })
  return { id: blocker.id }
}

/** One scheduler pass at the site's date `today`: overdue start days, reminders, escalations and missed promises. */
export async function chase(env: Bindings, today: string) {
  const rule = await chaseRule(env)
  const members = await all(env, "SELECT id, role FROM gk_members WHERE status = 'active'")
  const leads = members.filter(row => row.role === 'lead').map(row => row.id)
  const supervisors = members.filter(row => row.role === 'supervisor').map(row => row.id)
  const above = supervisors.length ? supervisors : members.filter(row => row.role === 'owner').map(row => row.id)
  const statements: D1PreparedStatement[] = []
  const authority = automationAuthority()
  const notify = (recipients: string[], order: Row, kind: string, occasion: string, text: string) => {
    for (const recipient of recipients) statements.push(stmt(env, 'INSERT OR IGNORE INTO gk_notices (id, recipient_id, work_order_id, kind, occasion, text, created_at, automation_job_id, automation_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), recipient, order.id, kind, `${order.id}:${occasion}`, text, now(), authority?.job ?? null, authority?.revision ?? null))
  }
  const orders = await all(env, `SELECT w.*, (SELECT MAX(r.at) FROM gk_chase_responses r WHERE r.work_order_id = w.id) AS responded_at FROM gk_work_orders w WHERE w.status IN ${OPEN}`)
  for (const order of orders) {
    const label = `WO-${String(order.number).padStart(4, '0')} ${order.title}`
    if (!order.overdue_since && order.due_date < today) { order.overdue_since = order.due_date; statements.push(stmt(env, 'UPDATE gk_work_orders SET overdue_since = ? WHERE id = ? AND overdue_since IS NULL', order.due_date, order.id)) }
    const assignee = order.assignee_id ? [order.assignee_id] : []
    if (!order.overdue_since && today >= addDays(order.due_date, -rule.remind_before_days)) notify(assignee, order, 'reminder', `reminder:${order.due_date}`, `${label} is due ${order.due_date}: start it or report what blocks it.`)
    if (!order.overdue_since) continue
    const age = daysBetween(order.overdue_since, today)
    notify(assignee, order, 'overdue', 'overdue', `${label} is overdue since ${order.overdue_since}: respond with on it or blocked.`)
    // The overdue notice asks for a response; none within the rule's days escalates as surely as age does.
    const unanswered = !order.responded_at && age >= rule.response_within_days + 1
    if (age >= rule.lead_after_days || unanswered) notify(leads, order, 'escalation_lead', 'escalation_lead', `${label} has been overdue for ${age} day${age === 1 ? '' : 's'}${order.responded_at ? '' : ' with no response from its assignee'}.`)
    if (age >= rule.supervisor_after_days) notify(above, order, 'escalation_supervisor', 'escalation_supervisor', `${label} has been overdue for ${age} days.`)
  }
  for (const blocker of await all(env, `SELECT b.*, w.number, w.title, w.id AS order_id FROM gk_blockers b JOIN gk_work_orders w ON w.id = b.work_order_id WHERE b.resolved_at IS NULL AND b.promised_on < ? AND w.status IN ${OPEN}`, today))
    notify([...new Set([blocker.owner_id, ...leads])], { id: blocker.order_id }, 'blocker_missed', `blocker:${blocker.id}`, `WO-${String(blocker.number).padStart(4, '0')} ${blocker.title}: the ${blocker.kind} blocker promised for ${blocker.promised_on} is not cleared (${blocker.next_action}).`)
  if (statements.length) await commit(env, statements, [])
}

/** My notices, newest first; a mention (PLAN-006) links to its comment and stays unread until I have read that comment. */
export const notices = async (env: Bindings, actor: Actor) => (await all(env, `SELECT n.id, n.kind, n.text, n.work_order_id, n.asset_id, n.comment_id, n.part_id, n.purchase_order_id, n.outcome_id, ${NOTICE_UNREAD} AS unread, n.created_at FROM gk_notices n WHERE n.recipient_id = ? ORDER BY n.created_at DESC, n.id LIMIT 100`, actor.id))
  .map(row => ({ ...row, unread: Boolean(row.unread), link: row.outcome_id ? `/api/gasket/outcomes/${row.outcome_id}` : row.purchase_order_id ? `/app/purchase-orders/${row.purchase_order_id}` : noticeLink(row) }))

/** One work order's chase: overdue start and age, responses, blockers and every notice sent about it. */
export async function chaseOf(env: Bindings, order: Row, today: string) {
  return {
    queries: await queriesOf(env, order.id),
    overdue_since: order.overdue_since ?? null, overdue_days: order.overdue_since ? daysBetween(order.overdue_since, today) : 0,
    responses: await all(env, 'SELECT r.response, r.note, r.at, m.name AS by FROM gk_chase_responses r LEFT JOIN gk_members m ON m.id = r.member_id WHERE r.work_order_id = ? ORDER BY r.at, r.id', order.id),
    blockers: await all(env, 'SELECT b.id, b.kind, b.next_action, b.promised_on, b.resolved_at, b.resolution, o.name AS owner, b.owner_id FROM gk_blockers b LEFT JOIN gk_members o ON o.id = b.owner_id WHERE b.work_order_id = ? ORDER BY b.raised_at, b.id', order.id),
    notices: await all(env, 'SELECT n.kind, n.text, n.created_at, m.name AS recipient FROM gk_notices n LEFT JOIN gk_members m ON m.id = n.recipient_id WHERE n.work_order_id = ? AND n.kind != \'mention\' ORDER BY n.created_at, n.kind, m.name', order.id),
  }
}
