// ASSET-008: multi-asset inspection routes. A lead writes a route as ordered
// stops (an asset and its checklist) and issues it; each stop becomes its own
// work order pinned to the checklist's current revision, so a failed reading
// (FIELD-004) raises its follow-up on that stop alone. A missed stop keeps its
// reason and stays open; signing a run never closes missing work. A route may
// repeat every N days from its first due date (fixed cadence): the scheduler
// issues one run per occurrence within the site's lead time, whatever state
// earlier runs are in, and the tools the route names go on every stop.
import type { Bindings } from '../auth.server'
import { can, requireCapability, type Actor } from './actor'
import { NEXT_NUMBER, all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { addDays, isDate } from './dates'
import type { Input } from './input'
import { CURRENT_REVISION } from './checklists'
import { leadDays } from './site'
import { toolList, toolNames, toolStatements } from './tools'
import { workOrder } from './work'

export async function createRoute(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const name = input.text('name', { max: 160 })
  const assets = input.list('asset', { keepEmpty: true }), checklists = input.list('checklist', { keepEmpty: true })
  const stops = assets.map((asset, index) => ({ asset, checklist: checklists[index] ?? '' })).filter(stop => stop.asset || stop.checklist)
  insist(assets.length === checklists.length && stops.length >= 2 && stops.length <= 50 && stops.every(stop => stop.asset && stop.checklist), 'invalid_stops')
  for (const stop of stops) {
    insist(await one(env, 'SELECT 1 FROM gk_assets WHERE id = ? AND retired_at IS NULL', stop.asset), 'asset_not_found', 404)
    insist(await one(env, 'SELECT 1 FROM gk_checklists WHERE id = ?', stop.checklist), 'checklist_not_found', 404)
  }
  insist(!await one(env, 'SELECT 1 FROM gk_routes WHERE name = ?', name), 'route_name_taken', 409)
  // A scheduled route: every N days from its first due date, to its default person.
  const everyDays = input.integer('everyDays', { min: 1, max: 3660, optional: true })
  const firstDue = everyDays ? input.text('firstDue', { max: 10 }) : null
  if (everyDays) insist(isDate(firstDue!), 'invalid_firstDue')
  const assignee = input.text('assignee', { optional: true, max: 100 }) || null
  if (assignee) insist(await one(env, "SELECT 1 FROM gk_members WHERE id = ? AND status = 'active'", assignee), 'assignee_not_found', 404)
  const tools = toolNames(input), id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_routes (id, name, every_days, next_due_date, assignee_id, tools, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, name, everyDays, firstDue, assignee, tools, actor.id, now()),
    ...stops.map((stop, position) => stmt(env, 'INSERT INTO gk_route_stops (route_id, position, asset_id, checklist_id) VALUES (?, ?, ?, ?)', id, position, stop.asset, stop.checklist))],
  { actor: actor.id, action: 'route.create', subject: id, detail: { name, stops: stops.length, everyDays, firstDue, assignee, tools } })
  return { id }
}

const routeStops = (env: Bindings, routeId: string) => all(env, 'SELECT s.position, s.asset_id, s.checklist_id, a.retired_at FROM gk_route_stops s JOIN gk_assets a ON a.id = s.asset_id WHERE s.route_id = ? ORDER BY s.position', routeId)

/** A run's statements: the run, then one work order per stop pinned to its checklist's current revision, with the route's tools. */
function runStatements(env: Bindings, actor: Pick<Actor, 'id'>, route: Row, stops: Row[], due: string, assignee: string | null, occurrence: string | null) {
  const run = newId(), orders = stops.map(() => newId())
  const statements = [stmt(env, 'INSERT INTO gk_route_runs (id, route_id, due_date, occurrence, issued_by, issued_at) VALUES (?, ?, ?, ?, ?, ?)', run, route.id, due, occurrence, actor.id, now()),
    ...stops.flatMap((stop, index) => [stmt(env, `INSERT INTO gk_work_orders (id, number, asset_id, kind, title, checklist_revision_id, due_date, assignee_id, route_run_id, route_position, status, created_by, created_at) VALUES (?, ${NEXT_NUMBER}, ?, 'preventive', ?, ${CURRENT_REVISION}, ?, ?, ?, ?, 'open', ?, ?)`,
      orders[index], stop.asset_id, `${route.name}: stop ${index + 1} of ${stops.length}`, stop.checklist_id, due, assignee, run, stop.position, actor.id, now()), ...toolStatements(env, orders[index], route.tools)])]
  const audits = [{ actor: actor.id, action: 'route.issue', subject: route.id, detail: { run, due, assignee, stops: stops.length, ...(occurrence ? { occurrence } : {}) } }, ...orders.map(id => ({ actor: actor.id, action: 'workorder.create', subject: id, detail: { route: route.id, run } }))]
  return { run, orders, statements, audits }
}

/** One run of a route: a work order per stop, all due the same day, assigned to one person or left for a lead. */
export async function issueRoute(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const route = await one(env, 'SELECT id, name, tools FROM gk_routes WHERE id = ?', input.text('route', { max: 100 }))
  insist(route, 'route_not_found', 404)
  const due = input.text('due', { max: 10 })
  insist(isDate(due), 'invalid_due')
  const assignee = input.text('assignee', { optional: true, max: 100 }) || null
  if (assignee) insist(await one(env, "SELECT 1 FROM gk_members WHERE id = ? AND status = 'active'", assignee), 'assignee_not_found', 404)
  const stops = await routeStops(env, route.id)
  insist(stops.every(stop => !stop.retired_at), 'asset_retired', 409)
  const { run, orders, statements, audits } = runStatements(env, actor, route, stops, due, assignee, null)
  await commit(env, statements, audits)
  return { id: route.id, run, workOrders: orders }
}

/** Scheduled routes due within the site's lead time: one run per occurrence (`route@date`), then the next date. A route with a retired stop waits. */
export async function issueDueRoutes(env: Bindings, actor: Pick<Actor, 'id' | 'today'>) {
  const horizon = addDays(actor.today, await leadDays(env)), issued: { route: string; run: string; due: string; occurrence: string; workOrders: string[] }[] = []
  for (const route of await all(env, 'SELECT id, name, every_days, next_due_date, assignee_id, tools FROM gk_routes WHERE every_days IS NOT NULL AND next_due_date <= ? ORDER BY next_due_date, name', horizon)) {
    const stops = await routeStops(env, route.id)
    if (stops.some(stop => stop.retired_at)) continue
    const occurrence = `${route.id}@${route.next_due_date}`, next = addDays(route.next_due_date, route.every_days)
    const advance = stmt(env, 'UPDATE gk_routes SET next_due_date = ? WHERE id = ? AND next_due_date = ?', next, route.id, route.next_due_date)
    if (await one(env, 'SELECT 1 FROM gk_route_runs WHERE occurrence = ?', occurrence)) { await commit(env, [advance], []); continue }
    const { run, orders, statements, audits } = runStatements(env, actor, route, stops, route.next_due_date, route.assignee_id, occurrence)
    await commit(env, [...statements, advance], audits)
    issued.push({ route: route.id, run, due: route.next_due_date, occurrence, workOrders: orders })
  }
  return issued
}

/** A stop that could not be done: its reason is kept and its work order stays open, so the run stays incomplete. */
export async function missStop(env: Bindings, actor: Actor, input: Input) {
  const order = await workOrder(env, input.text('workOrder', { max: 100 }))
  insist(order.route_run_id, 'not_a_route_stop', 409)
  insist(order.assignee_id === actor.id ? can(actor, 'work.do') : can(actor, 'work.assign'), 'forbidden', 403)
  insist(['open', 'in_progress', 'returned'].includes(order.status), 'work_order_not_open', 409)
  const reason = input.text('reason', { max: 500 })
  await commit(env, [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ?)', order.id, order.version),
    stmt(env, 'UPDATE gk_work_orders SET missed_reason = ?, missed_by = ?, missed_at = ?, version = version + 1 WHERE id = ?', reason, actor.id, now(), order.id)],
  { actor: actor.id, action: 'route.miss', subject: order.id, detail: { run: order.route_run_id, reason } })
  return { id: order.id }
}

/** A supervisor signs a run off only when every stop is closed; a missed or open stop keeps the run incomplete. */
export async function signRun(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.review')
  const run = await one(env, 'SELECT * FROM gk_route_runs WHERE id = ?', input.text('run', { max: 100 }))
  insist(run, 'route_run_not_found', 404)
  insist(!run.signed_at, 'already_signed', 409)
  const open = await all(env, "SELECT number FROM gk_work_orders WHERE route_run_id = ? AND status <> 'closed' ORDER BY route_position", run.id)
  insist(!open.length, 'route_incomplete', 409, { open: open.map(row => row.number) })
  await commit(env, [guard(env, 'route_incomplete', "NOT EXISTS(SELECT 1 FROM gk_work_orders WHERE route_run_id = ? AND status <> 'closed')", run.id),
    stmt(env, 'UPDATE gk_route_runs SET signed_by = ?, signed_at = ? WHERE id = ? AND signed_at IS NULL', actor.id, now(), run.id)],
  { actor: actor.id, action: 'route.sign', subject: run.route_id, detail: { run: run.id } })
  return { id: run.id }
}

/** Every route with its stops and runs; each run lists its stops' work and says whether it is complete. */
export async function routeList(env: Bindings) {
  const routes = (await all(env, 'SELECT r.id, r.name, r.every_days, r.next_due_date, r.assignee_id, m.name AS assignee, r.tools FROM gk_routes r LEFT JOIN gk_members m ON m.id = r.assignee_id ORDER BY r.name')).map(route => ({ ...route, tools: toolList(route.tools) }))
  const stops = await all(env, 'SELECT s.route_id, s.position, s.asset_id, a.tag AS asset_tag, a.name AS asset_name, c.id AS checklist_id, c.name AS checklist_name FROM gk_route_stops s JOIN gk_assets a ON a.id = s.asset_id JOIN gk_checklists c ON c.id = s.checklist_id ORDER BY s.position')
  const runs = await all(env, 'SELECT r.id, r.route_id, r.due_date, r.occurrence, r.signed_at, m.name AS signed_by FROM gk_route_runs r LEFT JOIN gk_members m ON m.id = r.signed_by ORDER BY r.due_date DESC, r.issued_at DESC')
  const work = await all(env, `SELECT w.id, w.number, w.route_run_id, w.route_position, w.status, w.missed_reason, a.name AS asset_name, (SELECT COUNT(*) FROM gk_findings f WHERE f.work_order_id = w.id AND f.follow_up_id IS NOT NULL) AS follow_ups
    FROM gk_work_orders w JOIN gk_assets a ON a.id = w.asset_id WHERE w.route_run_id IS NOT NULL ORDER BY w.route_position`)
  return routes.map(route => ({ ...route, stops: stops.filter(stop => stop.route_id === route.id).map(({ route_id: _, ...stop }) => stop),
    runs: runs.filter(run => run.route_id === route.id).map(({ route_id: _, ...run }) => {
      const stopWork = work.filter(row => row.route_run_id === run.id).map(({ route_run_id: _, ...row }) => ({ ...row, state: row.status === 'closed' ? 'done' : row.status === 'cancelled' ? 'cancelled' : row.missed_reason ? 'missed' : 'open' }))
      return { ...run, stops: stopWork, complete: stopWork.every(row => row.state === 'done') }
    }) }))
}
