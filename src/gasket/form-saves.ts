// Submission receipts contain outcomes, never submitted fields or authentication material.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { insist, newId, now, one, stmt } from './core'

export const SAVE_FIELD = '__gk_save'
export const saveId = (value: string) => /^[a-f0-9-]{36}$/i.test(value) ? value : newId()
export async function beginSave(env: Bindings, actor: Actor, id: string, action: string) {
  const claimed = await stmt(env, "INSERT INTO gk_form_saves(id,member_id,action,started_at,state) VALUES(?,?,?,?,'running') ON CONFLICT DO NOTHING", id, actor.id, action, now()).run()
  return claimed.meta.changes > 0
}
export async function finishSave(env: Bindings, id: string, state: 'saved' | 'failed', destination = '') {
  await stmt(env, 'UPDATE gk_form_saves SET state=?,finished_at=?,destination=? WHERE id=?', state, now(), destination, id).run()
}
export async function readSave(env: Bindings, actor: Actor, id: string) {
  const row = await one(env, 'SELECT id,action,state,batches,destination FROM gk_form_saves WHERE id=? AND member_id=?', id, actor.id)
  insist(row, 'save_receipt_not_found', 404)
  return row as { id: string; action: string; state: string; batches: number; destination: string }
}
export function saveMessage(receipt: { state: string; batches: number }) {
  if (receipt.state === 'saved') return 'Saved. The server confirmed this submission.'
  if (receipt.state === 'running') return `${receipt.batches} save steps have persisted. This submission is still running; do not retry it.`
  return receipt.batches ? `${receipt.batches} save steps persisted before the failure. Inspect the saved record before making another change.` : 'Nothing was saved by this submission.'
}

/** Include a receipt marker in the same transaction as every successful write.
 * A later failed batch cannot erase proof of an earlier step. Reads are unchanged. */
export function saveBindings(env: Bindings, id: string): Bindings {
  const db = env.DB
  const statements = new WeakMap<object, D1PreparedStatement>()
  const marker = () => db.prepare('UPDATE gk_form_saves SET batches=batches+1 WHERE id=?').bind(id)
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(statement, { get(target, key) {
      if (key === 'bind') return (...values: unknown[]) => wrap(target.bind(...values))
      if (key === 'run' || key === 'all' || key === 'first') return async (...args: unknown[]) => {
        const [result] = await db.batch([target, marker()])
        if (key === 'first') return args[0] ? (result.results[0] as Record<string, unknown> | undefined)?.[String(args[0])] ?? null : result.results[0] ?? null
        return result
      }
      const value = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    statements.set(proxy, statement)
    return proxy
  }
  const tracked = new Proxy(db, { get(target, key) {
    if (key === 'prepare') return (sql: string) => {
      const statement = target.prepare(sql)
      return readOnly(sql) ? statement : wrap(statement)
    }
    if (key === 'batch') return async (items: D1PreparedStatement[]) => {
      const writes = items.some(item => statements.has(item))
      const results = await target.batch([...items.map(item => statements.get(item) ?? item), ...(writes ? [marker()] : [])])
      return writes ? results.slice(0, -1) : results
    }
    const value = Reflect.get(target, key)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  return { ...env, DB: tracked }
}

// CTE reads are still reads; inspect the outer verb rather than words inside a query.
function readOnly(sql: string) {
  const tokens = sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"/g, ' ').match(/[a-z_]+|[()]/gi) ?? []
  const first = tokens[0]?.toUpperCase() ?? ''
  if (['SELECT', 'PRAGMA', 'EXPLAIN'].includes(first)) return true
  if (first !== 'WITH') return false
  let depth = 0
  for (const token of tokens.slice(1)) {
    if (token === '(') { depth++; continue }
    if (token === ')') { depth--; continue }
    if (depth !== 0) continue
    const verb = token.toUpperCase()
    if (verb === 'SELECT') return true
    if (['INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(verb)) return false
  }
  return false
}
