// PART-008: original IDs remain durable evidence; stock operates on the canonical group.
import type { Bindings } from '../auth.server'
import { all, insist, one } from './core'

export const canonicalSql = (id: string) => `COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=${id}),${id})`
export const UNMERGED = 'NOT EXISTS(SELECT 1 FROM gk_part_canonical c WHERE c.part_id=p.id)'
export async function canonicalId(env: Bindings, id: string): Promise<string> {
  return (await one(env, 'SELECT canonical_id FROM gk_part_canonical WHERE part_id=?', id))?.canonical_id ?? id
}
export async function canonicalPart(env: Bindings, id: string) {
  const canonical = await canonicalId(env, id)
  const row = await one(env, 'SELECT * FROM gk_parts WHERE id=?', canonical)
  insist(row, 'part_not_found', 404)
  return row
}
export async function groupIds(env: Bindings, id: string): Promise<string[]> {
  return [id, ...(await all(env, 'SELECT part_id FROM gk_part_canonical WHERE canonical_id=? ORDER BY part_id', id)).map(row => row.part_id)]
}
