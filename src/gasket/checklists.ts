// Clause 4: checklists and their immutable revisions. A work order points at
// the revision current when it was created.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'

export interface ChecklistItem { text: string }

function items(input: Input): ChecklistItem[] {
  const lines = input.list('items').flatMap(item => item.split(/\r?\n/)).map(item => item.trim()).filter(Boolean)
  insist(lines.length >= 1 && lines.length <= 60, 'invalid_items')
  insist(lines.every(line => line.length <= 300), 'invalid_items')
  return lines.map(text => ({ text }))
}

export async function createChecklist(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const name = input.text('name', { max: 160 }), list = items(input), id = newId(), revision = newId()
  await commit(env, [
    stmt(env, 'INSERT INTO gk_checklists (id, name, created_by, created_at) VALUES (?, ?, ?, ?)', id, name, actor.id, now()),
    stmt(env, 'INSERT INTO gk_checklist_revisions (id, checklist_id, number, items_json, note, published_by, published_at) VALUES (?, ?, 1, ?, ?, ?, ?)', revision, id, JSON.stringify(list), 'First revision', actor.id, now()),
  ], { actor: actor.id, action: 'checklist.create', subject: id, detail: { name, items: list.length } })
  return { id, revision, number: 1 }
}

export async function reviseChecklist(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const checklist = await one(env, 'SELECT id FROM gk_checklists WHERE id = ?', input.text('checklist', { max: 100 }))
  insist(checklist, 'checklist_not_found', 404)
  const list = items(input), note = input.text('note', { max: 300 }), revision = newId()
  const number = (await one<{ n: number }>(env, 'SELECT MAX(number) AS n FROM gk_checklist_revisions WHERE checklist_id = ?', checklist.id))!.n + 1
  await commit(env, [stmt(env, 'INSERT INTO gk_checklist_revisions (id, checklist_id, number, items_json, note, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)', revision, checklist.id, number, JSON.stringify(list), note, actor.id, now())],
    { actor: actor.id, action: 'checklist.revise', subject: checklist.id, detail: { number, items: list.length, note } })
  return { id: checklist.id, revision, number }
}

export const CURRENT_REVISION = '(SELECT r.id FROM gk_checklist_revisions r WHERE r.checklist_id = ? ORDER BY r.number DESC LIMIT 1)'

export async function checklistList(env: Bindings, _actor: Actor) {
  const rows = await all(env, `SELECT c.id, c.name, r.id AS revision_id, r.number, r.items_json, r.note, r.published_at
    FROM gk_checklists c JOIN gk_checklist_revisions r ON r.checklist_id = c.id AND r.number = (SELECT MAX(number) FROM gk_checklist_revisions WHERE checklist_id = c.id) ORDER BY c.name`)
  return rows.map(row => ({ id: row.id, name: row.name, revision: { id: row.revision_id, number: row.number, note: row.note, publishedAt: row.published_at, items: JSON.parse(row.items_json) as ChecklistItem[] } }))
}

export async function checklistDetail(env: Bindings, _actor: Actor, id: string): Promise<{ id: string; name: string; revisions: { id: string; number: number; note: string | null; publishedAt: number; publishedBy: string | null; items: ChecklistItem[] }[] }> {
  const checklist = await one(env, 'SELECT id, name FROM gk_checklists WHERE id = ?', id)
  insist(checklist, 'checklist_not_found', 404)
  const revisions = await all(env, 'SELECT r.id, r.number, r.items_json, r.note, r.published_at, m.name AS published_by FROM gk_checklist_revisions r LEFT JOIN gk_members m ON m.id = r.published_by WHERE r.checklist_id = ? ORDER BY r.number DESC', id)
  return { ...checklist, revisions: revisions.map(row => ({ id: row.id, number: row.number, note: row.note, publishedAt: row.published_at, publishedBy: row.published_by, items: JSON.parse(row.items_json) as ChecklistItem[] })) }
}
