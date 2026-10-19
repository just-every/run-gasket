// ADMIN-006: the attributed, append-only audit trail. Owners and supervisors
// search it by site, action and site-local date, page through every match and
// download all of it; each entry names the role it acted under and, for agent
// proposals and move-ins, the authority it acted on.
import type { Bindings } from '../auth.server'
import { ROLE_LABELS, requireCapability, type Actor, type Role } from './actor'
import { all, insist, type Row } from './core'
import { addDays, isDate, localNow, zonedInstant } from './dates'
import { site } from './site'

const PAGE = 100, MAX_PAGE = 500

/** What an entry acted on: its role, plus the proposal or move-in that carried it. */
function authority(row: Row) {
  const detail = JSON.parse(row.detail), role = ROLE_LABELS[row.role as Role] ?? 'Former member'
  if (row.role === 'agent') return `${role}, its own sign-in`
  if (row.action.startsWith('proposal.')) return `${role}, deciding proposal ${row.subject}`
  if (detail.proposal) return `${role}, carrying out approved proposal ${detail.proposal}`
  if (row.action.startsWith('import.')) return `${role}, MaintainX move-in job ${row.subject}`
  return role
}

/** Matching entries, newest first: a page of `limit` (`before` continues from `next`), or with `every` all of them. */
export async function audit(env: Bindings, actor: Actor, url: URL, { every = false } = {}) {
  requireCapability(actor, 'audit.read')
  const params = url.searchParams, where: string[] = [], args: unknown[] = []
  const place = await site(env)
  // One site per installation today: entries belong to it, and naming any other site finds nothing to search.
  const named = params.get('site')
  if (named) insist(place && named === place.name, 'site_not_found', 404)
  const action = params.get('action')
  if (action) {
    insist(/^[a-z]+(\.[a-z]+)?$/.test(action), 'invalid_action')
    where.push(action.includes('.') ? 'a.action = ?' : "a.action LIKE ? || '.%'")
    args.push(action)
  }
  for (const [key, after] of [['from', 0], ['to', 1]] as const) {
    const date = params.get(key)
    if (!date) continue
    insist(isDate(date), `invalid_${key}`)
    where.push(`a.at ${after ? '<' : '>='} ?`)
    args.push(zonedInstant(actor.zone, `${addDays(date, after)}T00:00`))
  }
  const before = params.get('before')
  if (before && !every) {
    insist(/^\d{1,15}$/.test(before), 'invalid_before')
    where.push('a.seq < ?')
    args.push(Number(before))
  }
  const size = params.get('limit') ? Number(params.get('limit')) : PAGE
  insist(Number.isSafeInteger(size) && size >= 1 && size <= MAX_PAGE, 'invalid_limit')
  const rows = (await all(env, `SELECT a.seq, a.at, a.actor, m.name AS actor_name, COALESCE(a.role, m.role) AS role, a.action, a.subject, a.detail FROM gk_audit a LEFT JOIN gk_members m ON m.id = a.actor
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.seq DESC LIMIT ?`, ...args, every ? -1 : size + 1))
    .map(row => ({ ...row, site: place?.name ?? null, authority: authority(row) }))
  if (every) return { rows, next: null }
  return { rows: rows.slice(0, size), next: rows.length > size ? rows[size - 1].seq : null }
}

export const cell = (value: unknown) => { const text = String(value ?? ''); return /[",\n\r]/.test(text) || /^[=+\-@\t]/.test(text) ? `"${(/^[=+\-@\t]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"` : text }

/** Every matching entry as CSV, in the site's clock. */
export async function auditCsv(env: Bindings, actor: Actor, url: URL) {
  const { rows } = await audit(env, actor, url, { every: true })
  const lines = [['When', 'Site', 'Who', 'Authority', 'Action', 'Record', 'Detail'], ...rows.map(row => [localNow(actor.zone, row.at).replace('T', ' '), row.site, row.actor_name ?? row.actor, row.authority, row.action, row.subject, row.detail])]
  return lines.map(line => line.map(cell).join(',')).join('\r\n') + '\r\n'
}
