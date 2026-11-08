// Bounded reads share one database snapshot. A continuation is a position,
// never authority; every HTTP request still resolves current access.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { insist, sha256Hex, stmt, type Row } from './core'

export type PageSource = { sql: string; args: unknown[]; order: string; filters: unknown }
export const WORK_EXPORT_LIMIT = 2000

async function signature(env: Bindings, value: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function pageRows(env: Bindings, actor: Actor, url: URL, source: PageSource) {
  const text = url.searchParams.get('limit') ?? '100'
  insist(/^\d{1,3}$/.test(text) && +text >= 1 && +text <= 200, 'invalid_limit')
  const limit = +text
  const query = await sha256Hex(JSON.stringify({ filters: source.filters, actor: actor.id, role: actor.role, session: actor.sessionId, service: actor.service?.id, zone: actor.zone, day: actor.today }))
  let offset = 0, expected: string | undefined
  const token = url.searchParams.get('cursor')
  if (token !== null) {
    try {
      insist(token.length <= 2000, 'invalid_cursor')
      const [encoded, mac, extra] = token.split('.')
      insist(!extra && mac === await signature(env, encoded), 'invalid_cursor')
      const cursor = JSON.parse(atob(encoded))
      insist(cursor.query === query && Number.isSafeInteger(cursor.offset) && cursor.offset >= 0 && typeof cursor.snapshot === 'string', 'invalid_cursor')
      offset = cursor.offset; expected = cursor.snapshot
    } catch { insist(false, 'invalid_cursor') }
  }
  const prefix = `WITH items AS (${source.sql})`
  const result = await env.DB.batch<Row>([
    stmt(env, `${prefix} SELECT COUNT(*) AS total, (SELECT COALESCE(MAX(seq),0) FROM gk_audit) AS revision FROM items`, ...source.args),
    stmt(env, `${prefix} SELECT * FROM items ORDER BY ${source.order} LIMIT ? OFFSET ?`, ...source.args, limit, offset),
  ])
  const { total, revision } = result[0].results[0]
  const snapshot = await sha256Hex(`${revision}:${total}`)
  insist(expected === undefined || expected === snapshot, 'work_snapshot_changed', 409, { message: 'Work changed. Restart the list or download; no partial export was returned.' })
  insist(offset <= total, 'invalid_cursor')
  const encode = async (at: number) => {
    const encoded = btoa(JSON.stringify({ query, snapshot, offset: at }))
    return encoded + '.' + await signature(env, encoded)
  }
  const rows = result[1].results
  return { rows, total: total as number, offset, next: offset + rows.length < total ? await encode(offset + rows.length) : null, start: await encode(0) }
}
