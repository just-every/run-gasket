// The Work screen's read model. Today holds every work order on today's plate:
// overdue, due today, in progress and done today; the other three tabs are
// those parts of it. Also the overdue work order that needs a decision, the
// agent's pending proposals, the next day with work and the latest changes.
// Every row is a real work order the person may see.
import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { all, one, type Row } from './core'
import { today } from './dates'
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
  a.id AS asset_id, a.tag AS asset_tag, a.name AS asset_name, a.location AS asset_location, a.category AS asset_category
  FROM gk_work_orders w JOIN gk_assets a ON a.id = w.asset_id LEFT JOIN gk_members m ON m.id = w.assignee_id`

const ORDER: Record<Part, number> = { overdue: 0, progress: 1, due: 2, done: 3 }

/** Today's plate in the order a manager reads it: overdue, in progress, due, done. */
async function plate(env: Bindings, actor: Actor, mine: boolean) {
  // Finished work counts only on the day it finished; two days back covers every site zone.
  const rows = await all(env, `${ROWS} WHERE (w.status IN ${OPEN} OR (w.status IN ('submitted', 'closed') AND COALESCE(w.closed_at, w.submitted_at) >= ?))${mine ? ' AND w.assignee_id = ?' : ''} ORDER BY w.due_date, w.number LIMIT 1000`, Date.now() - 2 * 86400000, ...(mine ? [actor.id] : []))
  const placed = rows.flatMap(row => { const part = partOf(row, actor); return part ? [{ ...row, part }] : [] }).sort((a, b) => ORDER[a.part as Part] - ORDER[b.part as Part])
  return { rows, placed }
}

export async function workToday(env: Bindings, actor: Actor, url: URL) {
  const mine = ownOnly(actor, url)
  const scope = mine ? ' AND w.assignee_id = ?' : '', who = mine ? [actor.id] : []
  const { rows, placed } = await plate(env, actor, mine)
  const tabs: Record<Tab, Row[]> = { today: placed, overdue: placed.filter(row => row.part === 'overdue'), progress: placed.filter(row => row.part === 'progress'), done: placed.filter(row => row.part === 'done') }
  const next = await all(env, `${ROWS} WHERE w.status IN ${OPEN} AND w.due_date = (SELECT MIN(due_date) FROM gk_work_orders x WHERE x.status IN ${OPEN} AND x.due_date > ?${mine ? ' AND x.assignee_id = ?' : ''})${scope} ORDER BY w.number LIMIT 4`, actor.today, ...who, ...who)
  return { tabs, next, exception: tabs.overdue[0] ? await exceptionOf(env, actor, tabs.overdue[0], rows) : null }
}

/** The overdue work order the manager decides on: who holds it, what else they are on, and who could take it. */
async function exceptionOf(env: Bindings, actor: Actor, order: Row, rows: Row[]) {
  const busy = rows.filter(row => row.assignee_id && row.assignee_id === order.assignee_id && row.status === 'in_progress' && row.id !== order.id)
  const load = can(actor, 'work.assign') ? await all<{ id: string; name: string; due: number }>(env, `SELECT m.id, m.name, (SELECT COUNT(*) FROM gk_work_orders w WHERE w.assignee_id = m.id AND w.status IN ${OPEN} AND w.due_date <= ?) AS due
    FROM gk_members m WHERE m.status = 'active' AND m.role IN ('owner', 'lead', 'maintainer') AND m.id IS NOT ? ORDER BY due, m.name LIMIT 3`, actor.today, order.assignee_id) : []
  return { order, busy, load }
}

/** The agent strip: proposals waiting for a decision, the newest first. */
export async function pendingProposals(env: Bindings) {
  const latest = await one<{ reasoning: string; kind: string; prepared_by: string; prepared_at: number }>(env, "SELECT p.reasoning, p.kind, m.name AS prepared_by, p.prepared_at FROM gk_proposals p LEFT JOIN gk_members m ON m.id = p.prepared_by WHERE p.status = 'pending' ORDER BY p.prepared_at DESC LIMIT 1")
  const count = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM gk_proposals WHERE status = 'pending'"))!.n
  return { count, latest }
}

/** The rail's counts: today's plate for this person (the Today tab) and proposals waiting for a decision. */
export async function railCounts(env: Bindings, actor: Actor) {
  const [{ placed }, pending] = await Promise.all([plate(env, actor, ownOnly(actor, new URL('http://gasket.invalid/app'))), pendingProposals(env)])
  return { work: placed.length, proposals: pending.count }
}

/** The latest changes for people who may read the audit trail. */
export async function recentActivity(env: Bindings, actor: Actor) {
  if (!can(actor, 'audit.read')) return null
  return await all(env, 'SELECT a.at, a.action, a.subject, m.name AS actor_name FROM gk_audit a LEFT JOIN gk_members m ON m.id = a.actor ORDER BY a.at DESC, a.seq DESC LIMIT 5')
}
