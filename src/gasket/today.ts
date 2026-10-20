// The Work screen's read model. Today holds every work order on today's plate:
// overdue, due today, in progress and done today; the other three tabs are
// those parts of it. Also the overdue work order that needs a decision with
// its costed plans (or the decision already taken today), the agent's pending
// proposals, the next day with work and the latest changes. Every row is a
// real work order the person may see.
import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { all, one, type Row } from './core'
import { today, zonedInstant } from './dates'
import { woDigits } from './quantity'
import { OPEN } from './work'

export const TABS = ['today', 'overdue', 'progress', 'done'] as const
export type Tab = typeof TABS[number]
type Part = 'overdue' | 'due' | 'progress' | 'done'

/** Where a work order sits on today's plate, or null when it is later work or older history. */
export function partOf(row: Row, actor: Actor): Part | null {
  const open = ['open', 'in_progress', 'returned'].includes(row.status)
  if (open && row.due_date < actor.today) return 'overdue'
  if (row.status === 'in_progress') return 'progress'
  if (open && row.due_date === actor.today) return 'due'
  const finished = row.status === 'submitted' ? row.submitted_at : row.status === 'closed' ? row.closed_at : null
  return finished && today(actor.zone, finished) === actor.today ? 'done' : null
}

/** Maintainers see their own work; leads, reviewers and agents see the site's. */
export const ownOnly = (actor: Actor, url: URL) => url.searchParams.get('mine') === '1' || (!can(actor, 'work.assign') && !can(actor, 'work.review') && actor.role !== 'agent')

const ROWS = `SELECT w.id, w.number, w.title, w.kind, w.status, w.due_date, w.submitted_at, w.closed_at, w.version, w.assignee_id, m.name AS assignee,
  w.asset_id, a.tag AS asset_tag, COALESCE(a.name, w.location) AS asset_name, COALESCE(a.location, w.location) AS asset_location, a.category AS asset_category, w.location
  FROM gk_work_orders w LEFT JOIN gk_assets a ON a.id = w.asset_id LEFT JOIN gk_members m ON m.id = w.assignee_id`

const ORDER: Record<Part, number> = { overdue: 0, progress: 1, due: 2, done: 3 }

/** Today's plate in the order a manager reads it: overdue, in progress, due, done. */
async function plate(env: Bindings, actor: Actor, mine: boolean) {
  // Finished work counts only on the day it finished; two days back covers every site zone.
  const rows = await all(env, `${ROWS} WHERE (w.status IN ${OPEN} OR (w.status IN ('submitted', 'closed') AND COALESCE(w.closed_at, w.submitted_at) >= ?))${mine ? ' AND w.assignee_id = ?' : ''} ORDER BY w.due_date, w.number LIMIT 1000`, Date.now() - 2 * 86400000, ...(mine ? [actor.id] : []))
  const placed = rows.flatMap(row => { const part = partOf(row, actor); return part ? [{ ...row, part }] : [] }).sort((a, b) => ORDER[a.part as Part] - ORDER[b.part as Part])
  return { rows, placed }
}

/** Whether this person only ever sees their own work, whatever the page asks for. */
const ownAlways = (actor: Actor) => ownOnly(actor, new URL('http://gasket.invalid/app'))

/**
 * Today's tabs and next day follow the page's filter. The decision panel follows the site for anyone who reads the
 * site's work: "Assigned to me" narrows the table, not the manager's overdue decision.
 */
export async function workToday(env: Bindings, actor: Actor, url: URL) {
  const mine = ownOnly(actor, url), own = ownAlways(actor)
  const scope = mine ? ' AND w.assignee_id = ?' : '', who = mine ? [actor.id] : []
  const { rows, placed } = await plate(env, actor, mine)
  const tabs: Record<Tab, Row[]> = { today: placed, overdue: placed.filter(row => row.part === 'overdue'), progress: placed.filter(row => row.part === 'progress'), done: placed.filter(row => row.part === 'done') }
  const next = await all(env, `${ROWS} WHERE w.status IN ${OPEN} AND w.due_date = (SELECT MIN(due_date) FROM gk_work_orders x WHERE x.status IN ${OPEN} AND x.due_date > ?${mine ? ' AND x.assignee_id = ?' : ''})${scope} ORDER BY w.number LIMIT 4`, actor.today, ...who, ...who)
  const site = mine && !own ? await plate(env, actor, false) : { rows, placed }
  return { tabs, next, own, exception: await exceptionOf(env, actor, site.placed.filter(row => row.part === 'overdue'), site.rows) }
}

export type Plan = { value: string; label: string; cost: string }
export type Decision = { plan: 'keep' | 'as_is' | 'reassign'; at: number; by: string | null; holder: string | null; to: string | null }

/** Today's plan decisions on these work orders, the latest per order. */
async function decisionsToday(env: Bindings, actor: Actor, ids: string[]) {
  const since = zonedInstant(actor.zone, `${actor.today}T00:00`)
  const rows = ids.length ? await all(env, `SELECT a.subject, a.at, a.detail, m.name AS by, h.name AS holder, t.name AS too FROM gk_audit a LEFT JOIN gk_members m ON m.id = a.actor
    LEFT JOIN gk_members h ON h.id = json_extract(a.detail, '$.holder') LEFT JOIN gk_members t ON t.id = json_extract(a.detail, '$.to')
    WHERE a.action = 'workorder.plan' AND a.at >= ? AND a.subject IN (${ids.map(() => '?').join(', ')}) ORDER BY a.at, a.seq`, since, ...ids) : []
  return new Map(rows.map(row => [row.subject as string, { plan: JSON.parse(row.detail).plan, at: row.at, by: row.by, holder: row.holder, to: row.too } as Decision]))
}

const listed = (rows: Row[]) => rows.map(row => `${woDigits(row.number)} ${row.asset_name}`).join(' and ')

/**
 * The overdue work order the manager decides on: the first one nobody has decided on today, with who holds it, what
 * else they are on and the plans with what each costs. When every overdue order has today's decision, the latest
 * decided one shows that decision instead.
 */
async function exceptionOf(env: Bindings, actor: Actor, overdue: Row[], rows: Row[]) {
  if (!overdue.length) return null
  const decided = await decisionsToday(env, actor, overdue.map(row => row.id))
  const order = overdue.find(row => !decided.has(row.id)) ?? [...overdue].sort((a, b) => decided.get(b.id)!.at - decided.get(a.id)!.at)[0]
  const busy = rows.filter(row => row.assignee_id && row.assignee_id === order.assignee_id && row.status === 'in_progress' && row.id !== order.id)
  const decision = decided.get(order.id) ?? null
  return { order, busy, decision, plans: decision || !can(actor, 'work.assign') ? [] : await plansFor(env, actor, order, busy) }
}

/**
 * The plans for an overdue order, each with its cost: keep it with the person who holds it (it waits for what they are
 * on), hand it to one of the three least-loaded maintainers or leads, or keep it as it is. The person deciding is
 * never offered as the one to take it; the work order page assigns anyone.
 */
async function plansFor(env: Bindings, actor: Actor, order: Row, busy: Row[]): Promise<Plan[]> {
  const load = `(SELECT COUNT(*) FROM gk_work_orders w WHERE w.assignee_id = m.id AND w.status IN ${OPEN} AND w.due_date <= ? AND w.id <> ?)`
  const doing = `(SELECT GROUP_CONCAT(printf('%04d', w.number) || ' ' || COALESCE(a.name, w.location), ' and ') FROM gk_work_orders w LEFT JOIN gk_assets a ON a.id = w.asset_id WHERE w.assignee_id = m.id AND w.status = 'in_progress')`
  const people = await all<{ id: string; name: string; due: number; doing: string | null }>(env, `SELECT m.id, m.name, ${load} AS due, ${doing} AS doing FROM gk_members m
    WHERE m.status = 'active' AND m.role IN ('lead', 'maintainer') AND m.id IS NOT ? AND m.id <> ? ORDER BY m.role <> 'maintainer', due, m.name LIMIT 3`, actor.today, order.id, order.assignee_id, actor.id)
  const due = (count: number, other = '') => count ? `${count}${other} due today or overdue` : `nothing${other ? ' else' : ''} due today`
  const sentence = (parts: string[]) => { const text = parts.filter(Boolean).join('; '); return text.charAt(0).toUpperCase() + text.slice(1) }
  const plans: Plan[] = []
  if (order.assignee_id) {
    const held = (await one<{ due: number }>(env, `SELECT ${load} AS due FROM gk_members m WHERE m.id = ?`, actor.today, order.id, order.assignee_id))?.due ?? 0
    plans.push({ value: 'keep', label: `Keep with ${order.assignee}`, cost: sentence(busy.length ? [`after ${listed(busy)}, in progress`, 'overdue until then'] : [due(held, ' more')]) })
  }
  for (const person of people) plans.push({ value: `to:${person.id}`, label: `Reassign to ${person.name}`, cost: sentence([person.doing ? `on ${person.doing} now` : '', due(person.due)]) })
  plans.push({ value: 'as_is', label: 'Keep as is', cost: 'No plan today; it stays overdue' })
  return plans
}

/** The agent strip: proposals waiting for a decision, the newest first. */
export async function pendingProposals(env: Bindings) {
  const latest = await one<{ reasoning: string; kind: string; prepared_by: string; prepared_at: number }>(env, "SELECT p.reasoning, p.kind, m.name AS prepared_by, p.prepared_at FROM gk_all_proposals p LEFT JOIN gk_members m ON m.id = p.prepared_by WHERE p.status = 'pending' ORDER BY p.prepared_at DESC LIMIT 1")
  const count = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM gk_all_proposals WHERE status = 'pending'"))!.n
  return { count, latest }
}

/** The rail's counts: today's plate for this person (the Today tab) and proposals waiting for a decision. */
export async function railCounts(env: Bindings, actor: Actor) {
  const [{ placed }, pending] = await Promise.all([plate(env, actor, ownAlways(actor)), pendingProposals(env)])
  return { work: placed.length, proposals: pending.count }
}

/** The latest changes for people who may read the audit trail. */
export async function recentActivity(env: Bindings, actor: Actor) {
  if (!can(actor, 'audit.read')) return null
  return await all(env, 'SELECT a.at, a.action, a.subject, m.name AS actor_name FROM gk_audit a LEFT JOIN gk_members m ON m.id = a.actor ORDER BY a.at DESC, a.seq DESC LIMIT 5')
}
