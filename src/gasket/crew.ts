// PLAN-002: teams, trades, shifts and accountable assignments. A team is a
// named group of assignable people (owner, leads, maintainers) with one trade,
// kept by leads. A work order may name a team, a trade (the team's by default)
// and a shift; when it names a team, every assignment door (assign, overdue
// plan, bulk) gives it only to a member of that team. Each reassignment keeps a
// handoff (from and to person and shift, a note, who and when) and asks the new
// assignee to acknowledge again. The assignee acknowledges, or declines with a
// blocker, which returns the work unassigned and gives each lead an in-app
// notice. Collaborators a lead adds record alongside the assignee; anyone else
// is refused, and the work order lists everyone who recorded on it.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { blockerStatements } from './chasing'
import type { Input } from './input'

const OPEN = "('open', 'in_progress', 'returned')"
/** Every table that records work on a work order, with the column naming who recorded it. */
export const RECORDERS = [['gk_result_log', 'recorded_by'], ['gk_readings', 'entered_by'], ['gk_part_moves', 'actor'], ['gk_downtime', 'recorded_by'], ['gk_findings', 'recorded_by'], ['gk_evidence', 'uploaded_by']]
const ASSIGNABLE = "status = 'active' AND role IN ('owner', 'lead', 'maintainer')"

async function team(env: Bindings, id: string) {
  const row = await one(env, 'SELECT * FROM gk_teams WHERE id = ?', id)
  insist(row, 'team_not_found', 404)
  return row
}

async function memberIds(env: Bindings, input: Input) {
  const ids = input.has('member') ? input.list('member') : []
  for (const id of ids) insist(await one(env, `SELECT 1 FROM gk_members WHERE id = ? AND ${ASSIGNABLE}`, id), 'member_not_assignable', 409)
  return [...new Set(ids)]
}

/** A lead names a team with its trade and, optionally, its first members. */
export async function createTeam(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const name = input.text('name', { max: 80 }), trade = input.text('trade', { max: 60 })
  insist(!await one(env, 'SELECT 1 FROM gk_teams WHERE name = ? COLLATE NOCASE', name), 'team_exists', 409)
  const id = newId(), members = await memberIds(env, input)
  await commit(env, [stmt(env, 'INSERT INTO gk_teams (id, name, trade, created_by, created_at) VALUES (?, ?, ?, ?, ?)', id, name, trade, actor.id, now()),
    ...members.map(member => stmt(env, 'INSERT INTO gk_team_members (team_id, member_id, added_by, added_at) VALUES (?, ?, ?, ?)', id, member, actor.id, now()))],
  { actor: actor.id, action: 'team.create', subject: id, detail: { name, trade, members } })
  return { id }
}

/** A lead adds a person to a team, or removes them (`remove`); work already assigned stays with them. */
export async function teamMember(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const found = await team(env, input.text('team', { max: 100 })), member = input.text('member', { max: 100 }), remove = input.flag('remove')
  if (remove) insist(await one(env, 'SELECT 1 FROM gk_team_members WHERE team_id = ? AND member_id = ?', found.id, member), 'not_in_team', 409)
  else {
    insist(await one(env, `SELECT 1 FROM gk_members WHERE id = ? AND ${ASSIGNABLE}`, member), 'member_not_assignable', 409)
    insist(!await one(env, 'SELECT 1 FROM gk_team_members WHERE team_id = ? AND member_id = ?', found.id, member), 'already_in_team', 409)
  }
  await commit(env, [remove ? stmt(env, 'DELETE FROM gk_team_members WHERE team_id = ? AND member_id = ?', found.id, member)
    : stmt(env, 'INSERT INTO gk_team_members (team_id, member_id, added_by, added_at) VALUES (?, ?, ?, ?)', found.id, member, actor.id, now())],
  { actor: actor.id, action: remove ? 'team.leave' : 'team.join', subject: found.id, detail: { member } })
  return { id: found.id }
}

/** Every team with its trade, members and its queue: open work naming the team, soonest due first. */
export async function teamList(env: Bindings) {
  const teams = await all(env, 'SELECT id, name, trade FROM gk_teams ORDER BY name')
  const members = await all(env, 'SELECT tm.team_id, m.id, m.name, m.role, m.status FROM gk_team_members tm JOIN gk_members m ON m.id = tm.member_id ORDER BY m.name')
  const work = await all(env, `SELECT w.team_id, w.id, w.number, w.title, w.status, w.due_date, w.shift, w.assignee_id, m.name AS assignee FROM gk_work_orders w LEFT JOIN gk_members m ON m.id = w.assignee_id
    WHERE w.team_id IS NOT NULL AND w.status IN ${OPEN} ORDER BY w.due_date, w.number`)
  const strip = <T extends Row>(rows: T[]) => rows.map(({ team_id: _team, ...row }) => row)
  return teams.map(row => ({ ...row, members: strip(members.filter(member => member.team_id === row.id)), work: strip(work.filter(order => order.team_id === row.id)) }))
}

/** The team, trade and shift an assignment gives: what the input names, else what the work order has. */
export async function crewChoice(env: Bindings, input: Input, order: Row | null) {
  const teamId = input.text('team', { optional: true, max: 100 }) || order?.team_id || null
  const chosen = teamId ? await team(env, teamId) : null
  const trade = input.text('trade', { optional: true, max: 60 }) || (chosen && chosen.id !== order?.team_id ? chosen.trade : order?.trade ?? chosen?.trade ?? null)
  const shift = input.text('shift', { optional: true, max: 40 }) || order?.shift || null
  return { team: chosen?.id ?? null, trade, shift }
}

/** An assignee must be an active owner, lead or maintainer, and on the work order's team when it names one. */
export async function assigneeFits(env: Bindings, member: string, teamId: string | null) {
  insist(await one(env, `SELECT 1 FROM gk_members WHERE id = ? AND ${ASSIGNABLE}`, member), 'assignee_not_assignable', 409)
  if (teamId) insist(await one(env, 'SELECT 1 FROM gk_team_members WHERE team_id = ? AND member_id = ?', teamId, member), 'assignee_not_in_team', 409)
}

/** The statements of a (re)assignment: the handoff record, the new crew, and a fresh acknowledgement owed. */
export function handoffStatements(env: Bindings, actor: Actor, order: Row, to: string | null, crew: { team: string | null; trade: string | null; shift: string | null }, note: string | null) {
  return [
    stmt(env, 'UPDATE gk_work_orders SET assignee_id = ?, team_id = ?, trade = ?, shift = ?, acknowledged_at = NULL, acknowledged_by = NULL, version = version + 1 WHERE id = ?', to, crew.team, crew.trade, crew.shift, order.id),
    // The accountable assignee is no longer also a collaborator.
    ...(to ? [stmt(env, 'UPDATE gk_collaborators SET removed_at = ?, removed_by = ? WHERE work_order_id = ? AND member_id = ? AND removed_at IS NULL', now(), actor.id, order.id, to)] : []),
    stmt(env, 'INSERT INTO gk_handoffs (id, work_order_id, from_id, to_id, from_shift, to_shift, note, by_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), order.id, order.assignee_id ?? null, to, order.shift ?? null, crew.shift, note, actor.id, now()),
  ]
}

export const isCollaborator = async (env: Bindings, workOrder: string, member: string) =>
  Boolean(await one(env, 'SELECT 1 FROM gk_collaborators WHERE work_order_id = ? AND member_id = ? AND removed_at IS NULL', workOrder, member))

/** A lead adds a collaborator to open work, or removes one (`remove`). */
export async function collaborate(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const order = await one(env, `SELECT * FROM gk_work_orders WHERE id = ? AND status IN ${OPEN}`, input.text('workOrder', { max: 100 }))
  insist(order, 'work_order_not_open', 409)
  const member = input.text('member', { max: 100 }), remove = input.flag('remove'), active = await isCollaborator(env, order.id, member)
  if (remove) insist(active, 'not_a_collaborator', 409)
  else {
    insist(await one(env, `SELECT 1 FROM gk_members WHERE id = ? AND ${ASSIGNABLE}`, member), 'member_not_assignable', 409)
    insist(member !== order.assignee_id, 'already_assignee', 409)
    insist(!active, 'already_collaborator', 409)
  }
  await commit(env, [
    guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status IN ${OPEN})`, order.id, order.version),
    remove ? stmt(env, 'UPDATE gk_collaborators SET removed_at = ?, removed_by = ? WHERE work_order_id = ? AND member_id = ? AND removed_at IS NULL', now(), actor.id, order.id, member)
      : stmt(env, 'INSERT INTO gk_collaborators (work_order_id, member_id, added_by, added_at) VALUES (?, ?, ?, ?) ON CONFLICT(work_order_id, member_id) DO UPDATE SET added_by = excluded.added_by, added_at = excluded.added_at, removed_by = NULL, removed_at = NULL', order.id, member, actor.id, now()),
    stmt(env, 'UPDATE gk_work_orders SET version = version + 1 WHERE id = ?', order.id),
  ], { actor: actor.id, action: remove ? 'workorder.uncollaborate' : 'workorder.collaborate', subject: order.id, detail: { member } })
  return { id: order.id }
}

/** The assignee declines with a blocker: the work goes back unassigned and every active lead (the owners when there is none) is told. */
export async function decline(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.do')
  const order = await one(env, `SELECT * FROM gk_work_orders WHERE id = ? AND status IN ${OPEN}`, input.text('workOrder', { max: 100 }))
  insist(order, 'work_order_not_open', 409)
  insist(order.assignee_id === actor.id, 'not_your_work', 403)
  const note = input.text('note', { optional: true, max: 500 }) || null
  const blocker = await blockerStatements(env, actor, order, input)
  const people = await all(env, "SELECT id, role FROM gk_members WHERE status = 'active' AND role IN ('lead', 'owner')")
  const leads = people.some(row => row.role === 'lead') ? people.filter(row => row.role === 'lead') : people
  const text = `WO-${String(order.number).padStart(4, '0')} ${order.title}: ${actor.name} declined it${note ? ` (${note})` : ''}; it needs a new assignee.`
  await commit(env, [
    guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND assignee_id = ? AND status IN ${OPEN})`, order.id, order.version, actor.id),
    ...handoffStatements(env, actor, order, null, { team: order.team_id, trade: order.trade, shift: order.shift }, note),
    ...blocker.statements,
    ...leads.map(row => stmt(env, 'INSERT OR IGNORE INTO gk_notices (id, recipient_id, work_order_id, kind, occasion, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), row.id, order.id, 'declined', `${order.id}:declined:${blocker.id}`, text, now())),
  ], { actor: actor.id, action: 'workorder.decline', subject: order.id, detail: { note, blocker: blocker.id } })
  return { id: order.id, blocker: blocker.id }
}

/** One work order's crew: team and trade, collaborators, handoffs, acknowledgements and everyone who recorded on it. */
export async function crewOf(env: Bindings, order: Row, actor: Actor) {
  const teamRow = order.team_id ? await one(env, 'SELECT id, name, trade FROM gk_teams WHERE id = ?', order.team_id) : null
  const collaborators = await all(env, 'SELECT m.id, m.name, c.added_at, a.name AS added_by FROM gk_collaborators c JOIN gk_members m ON m.id = c.member_id LEFT JOIN gk_members a ON a.id = c.added_by WHERE c.work_order_id = ? AND c.removed_at IS NULL ORDER BY c.added_at, m.name', order.id)
  const handoffs = await all(env, `SELECT f.name AS "from", t.name AS "to", h.from_shift, h.to_shift, h.note, b.name AS by, h.at FROM gk_handoffs h
    LEFT JOIN gk_members f ON f.id = h.from_id LEFT JOIN gk_members t ON t.id = h.to_id LEFT JOIN gk_members b ON b.id = h.by_id WHERE h.work_order_id = ? ORDER BY h.at, h.rowid`, order.id)
  const answers = (await all(env, "SELECT a.action, a.detail, a.at, m.name AS by FROM gk_audit a LEFT JOIN gk_members m ON m.id = a.actor WHERE a.subject = ? AND a.action IN ('workorder.acknowledge', 'workorder.decline') ORDER BY a.seq", order.id))
    .map(({ action, detail, ...row }) => ({ ...row, answer: action === 'workorder.acknowledge' ? 'acknowledged' : 'declined', note: JSON.parse(detail ?? '{}').note ?? null }))
  // One grouped count per recording table (D1 refuses a six-term compound SELECT).
  const counts = new Map<string, number>()
  for (const [table, column] of RECORDERS) for (const row of await all(env, `SELECT ${column} AS who, COUNT(*) AS n FROM ${table} WHERE work_order_id = ? GROUP BY ${column}`, order.id)) counts.set(row.who, (counts.get(row.who) ?? 0) + row.n)
  const recorded = counts.size ? (await all(env, `SELECT id, name FROM gk_members WHERE id IN (${[...counts.keys()].map(() => '?').join(', ')}) ORDER BY name`, ...counts.keys())).map(row => ({ ...row, records: counts.get(row.id) })) : []
  const contributors = recorded.map(row => ({ ...row, part: row.id === order.assignee_id ? 'assignee' : collaborators.some(person => person.id === row.id) ? 'collaborator' : 'former' }))
  return { team: teamRow, trade: order.trade ?? null, shift: order.shift ?? null, collaborators, handoffs, answers, contributors, collaborating: collaborators.some(person => person.id === actor.id) }
}
