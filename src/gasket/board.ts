// Clause 10: the supervisor's view of overdue work, work waiting for review,
// open follow-ups, assets down now, recent downtime and low parts.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all } from './core'
import { addDays, localNow, minutesBetween } from './dates'
import { partList } from './parts'

const ORDER = `SELECT w.id, w.number, w.title, w.kind, w.status, w.due_date, w.follow_up_of, w.asset_id, a.tag AS asset_tag, COALESCE(a.name, w.location) AS asset_name, w.location, m.name AS assignee
  FROM gk_work_orders w LEFT JOIN gk_assets a ON a.id = w.asset_id LEFT JOIN gk_members m ON m.id = w.assignee_id`

export async function board(env: Bindings, actor: Actor) {
  requireCapability(actor, 'board.read')
  const since = addDays(actor.today, -30), clock = localNow(actor.zone)
  const overdue = await all(env, `${ORDER} WHERE w.status NOT IN ('closed', 'cancelled', 'submitted') AND w.due_date < ? ORDER BY w.due_date, w.number`, actor.today)
  const awaitingReview = await all(env, `${ORDER} WHERE w.status = 'submitted' ORDER BY w.submitted_at`)
  const followUps = await all(env, `${ORDER} WHERE w.follow_up_of IS NOT NULL AND w.status NOT IN ('closed', 'cancelled') ORDER BY w.due_date`)
  const down = (await all(env, 'SELECT d.started_on, d.reason, a.id AS asset_id, a.tag AS asset_tag, a.name AS asset_name, w.number FROM gk_downtime d JOIN gk_assets a ON a.id = d.asset_id LEFT JOIN gk_work_orders w ON w.id = d.work_order_id WHERE d.ended_on IS NULL AND d.degraded = 0 ORDER BY d.started_on'))
    .map(row => ({ ...row, minutesSoFar: Math.max(0, minutesBetween(row.started_on, clock)) }))
  // Downtime overlapping the last 30 days, clipped to the window; open downtime counts to now. Degraded operation (REPORT-002) is not downtime.
  const windowStart = `${since}T00:00`
  const downtime = (await all(env, `SELECT a.id AS asset_id, a.tag AS asset_tag, a.name AS asset_name, d.started_on, COALESCE(d.ended_on, ?) AS ended_on
    FROM gk_downtime d JOIN gk_assets a ON a.id = d.asset_id WHERE COALESCE(d.ended_on, ?) >= ? AND d.degraded = 0`, clock, clock, windowStart))
  const perAsset = new Map<string, { asset_id: string; asset_tag: string; asset_name: string; minutes: number; events: number }>()
  for (const row of downtime) {
    const start = row.started_on < windowStart ? windowStart : row.started_on
    const entry = perAsset.get(row.asset_id) ?? { asset_id: row.asset_id, asset_tag: row.asset_tag, asset_name: row.asset_name, minutes: 0, events: 0 }
    entry.minutes += Math.max(0, minutesBetween(start, row.ended_on)); entry.events++
    perAsset.set(row.asset_id, entry)
  }
  const lowParts = (await partList(env, actor)).filter(part => part.below)
  return { today: actor.today, since, overdue, awaitingReview, followUps, down, downtime: [...perAsset.values()].sort((a, b) => b.minutes - a.minutes), lowParts }
}
