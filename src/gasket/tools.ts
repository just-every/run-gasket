// ASSET-008 / ASSET-010: the tools a route or schedule says its work needs. Each work order
// it issues lists them, and the person doing the work records which one they
// used (a serial or asset number), so a calibration's reference standard is
// traceable; submission waits until every listed tool is recorded. A tool
// register with calibration due dates is PLAN-004's.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, commit, guard, insist, now, stmt } from './core'
import type { Input } from './input'
import { workable } from './work'

/** Tool names from repeated `tool` fields, stored `|`-joined (null when none). */
export function toolNames(input: Input) {
  const tools = input.list('tool')
  insist(tools.length <= 20 && tools.every(tool => tool.length <= 120 && !tool.includes('|')), 'invalid_tool')
  return tools.length ? tools.join('|') : null
}

export const toolList = (tools: string | null | undefined) => tools ? String(tools).split('|') : []

/** One row per tool on a work order being issued; `exists` keeps them off an insert that a guard skipped. */
export const toolStatements = (env: Bindings, workOrderId: string, tools: string | null | undefined) =>
  toolList(tools).map((name, position) => stmt(env, 'INSERT INTO gk_work_tools (work_order_id, position, name) SELECT ?, ?, ? WHERE EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ?)', workOrderId, position, name, workOrderId))

export const toolsOf = (env: Bindings, workOrderId: string) =>
  all(env, 'SELECT t.position, t.name, t.identifier, m.name AS recorded_by, t.recorded_at FROM gk_work_tools t LEFT JOIN gk_members m ON m.id = t.recorded_by WHERE t.work_order_id = ? ORDER BY t.position', workOrderId)

/** The person doing the work records which tool they used for one listed tool; a later record replaces it and the audit keeps both. */
export async function recordTool(env: Bindings, actor: Actor, input: Input) {
  const order = await workable(env, actor, input)
  const position = input.integer('tool', { max: 19 })!
  const tool = (await toolsOf(env, order.id)).find(row => row.position === position)
  insist(tool, 'tool_not_found', 404)
  const identifier = input.text('identifier', { max: 120 })
  await commit(env, [guard(env, 'stale', "EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND version = ? AND status IN ('open', 'in_progress', 'returned'))", order.id, order.version),
    stmt(env, "UPDATE gk_work_orders SET version = version + 1, status = 'in_progress' WHERE id = ?", order.id),
    stmt(env, 'UPDATE gk_work_tools SET identifier = ?, recorded_by = ?, recorded_at = ? WHERE work_order_id = ? AND position = ?', identifier, actor.id, now(), order.id, position)],
  { actor: actor.id, action: 'workorder.tool', subject: order.id, detail: { tool: tool.name, identifier } })
  return { id: order.id }
}
