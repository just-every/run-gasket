// Native predecessor completion is planning evidence, never physical authorization.
import type { Bindings } from '../auth.server'
import { capabilitySql, humanSessionSql, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'

const OPEN = "('open','in_progress','returned')"
// Only the current independently approved native revision satisfies a link.
const COMPLETE = `p.status='closed' AND p.merged_into IS NULL AND p.closed_at IS NOT NULL
  AND EXISTS(SELECT 1 FROM gk_reviews r WHERE r.work_order_id=p.id AND r.decision='approved'
    AND r.version=p.version-1 AND r.reviewer=p.closed_by AND r.reviewer<>p.assignee_id)`
const SATISFIED = `NOT EXISTS(SELECT 1 FROM gk_work_dependencies d LEFT JOIN gk_work_orders p ON p.id=d.predecessor_id
  WHERE d.work_order_id=? AND d.active=1 AND NOT COALESCE((${COMPLETE}),0))`

/** Evaluated in the same atomic batch as submission or approval. */
export const dependencyGuard = (env: Bindings, work: string) => guard(env, 'dependencies_blocked', SATISFIED, work)

export async function workDependencies(env: Bindings, work: string) {
  const links = await all(env, `SELECT d.id,d.predecessor_id,d.revision,d.active,p.number,p.title,p.status,p.version,
    CASE WHEN ${COMPLETE} THEN 1 ELSE 0 END AS satisfied
    FROM gk_work_dependencies d JOIN gk_work_orders p ON p.id=d.predecessor_id WHERE d.work_order_id=? ORDER BY p.number`, work)
  const history = await all(env, `SELECT h.dependency_id,h.revision,h.active,h.reason,h.work_version,h.source_version,h.changed_at,
    h.changed_by,m.name AS by,p.id AS predecessor_id,p.number FROM gk_work_dependency_history h
    JOIN gk_work_dependencies d ON d.id=h.dependency_id JOIN gk_work_orders p ON p.id=d.predecessor_id
    LEFT JOIN gk_members m ON m.id=h.changed_by WHERE d.work_order_id=? ORDER BY h.work_version,h.dependency_id`, work)
  const dependents = await all(env, `SELECT w.id,w.number,w.title,w.status FROM gk_work_dependencies d
    JOIN gk_work_orders w ON w.id=d.work_order_id WHERE d.predecessor_id=? AND d.active=1 ORDER BY w.number`, work)
  return { ready: links.every(row => !row.active || row.satisfied === 1), links, history, dependents }
}

/** Owners and leads change one link against both work revisions they inspected. */
export async function changeWorkDependency(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  insist(!actor.service && ['owner','lead'].includes(actor.role), 'forbidden', 403)
  const human = humanSessionSql(actor), capability = capabilitySql(actor.sessionId, 'work.assign')
  insist(await one(env, `SELECT 1 WHERE ${human.sql}`, ...human.params), 'access_ended', 403)
  const work = input.text('workOrder', { max: 100 }), predecessor = input.text('predecessor', { max: 100 })
  insist(work !== predecessor, 'dependency_self', 409)
  const version = input.integer('version', { min: 1, max: 1_000_000 })!
  const predecessorVersion = input.integer('predecessorVersion', { min: 1, max: 1_000_000 })!
  const revision = input.integer('revision', { min: 0, max: 1_000_000 })!
  const active = input.flag('active'), reason = input.text('reason', { max: 500 })
  const order = await one(env, 'SELECT version,status FROM gk_work_orders WHERE id=?', work)
  const source = await one(env, 'SELECT version FROM gk_work_orders WHERE id=?', predecessor)
  insist(order && source, 'work_order_not_found', 404)
  insist(['open','in_progress','returned'].includes(order.status), 'work_order_not_open', 409)
  insist(order.version === version && source.version === predecessorVersion, 'stale', 409)
  const previous = await one(env, 'SELECT id,revision,active FROM gk_work_dependencies WHERE work_order_id=? AND predecessor_id=?', work, predecessor)
  insist((previous?.revision ?? 0) === revision, 'stale', 409)
  insist(previous ? previous.active !== Number(active) : active, 'dependency_unchanged', 409)
  const id = previous?.id ?? newId(), stamp = now()
  await commit(env, [
    guard(env, 'access_ended', human.sql, ...human.params),
    guard(env, 'forbidden', capability.sql, ...capability.params),
    guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=? AND status IN ${OPEN})`, work, version),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=?)', predecessor, predecessorVersion),
    guard(env, 'stale', '(SELECT COALESCE(MAX(revision),0) FROM gk_work_dependencies WHERE work_order_id=? AND predecessor_id=?)=?', work, predecessor, revision),
    // UNION terminates even if an older damaged graph already contains a cycle.
    ...(active ? [guard(env, 'dependency_cycle', `NOT EXISTS(WITH RECURSIVE ancestors(id) AS (
      SELECT ? UNION SELECT d.predecessor_id FROM gk_work_dependencies d JOIN ancestors a ON d.work_order_id=a.id WHERE d.active=1)
      SELECT 1 FROM ancestors WHERE id=?)`, predecessor, work)] : []),
    stmt(env, `INSERT INTO gk_work_dependencies(id,work_order_id,predecessor_id,revision,active) VALUES(?,?,?,?,?)
      ON CONFLICT(work_order_id,predecessor_id) DO UPDATE SET revision=excluded.revision,active=excluded.active`, id, work, predecessor, revision+1, Number(active)),
    stmt(env, `INSERT INTO gk_work_dependency_history(dependency_id,revision,active,reason,work_version,source_version,changed_by,changed_at)
      VALUES(?,?,?,?,?,?,?,?)`, id, revision+1, Number(active), reason, version, predecessorVersion, actor.id, stamp),
    stmt(env, 'UPDATE gk_work_orders SET version=version+1 WHERE id=?', work),
  ], { actor: actor.id, action: 'workorder.dependency', subject: work, detail: { dependency: id, predecessor, revision: revision+1, active, reason, sourceVersion: predecessorVersion } })
  return { id: work, dependency: id, revision: revision+1, version: version+1 }
}
