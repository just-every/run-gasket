// The only sessionless purchasing authority: a retained replenishment job with
// transaction guards supplied by its evaluator. Ordinary purchase doors use sessions.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Bindings } from '../auth.server'
import { capabilitySql, type Actor } from './actor'
import { automationAuthority } from './automation-context'
import { guard, insist, type Row } from './core'
import { activeOwnerSql } from './replenishment-policy'
interface ScopedPurchase {
  operation: 'draft'|'send'
  actor: string
  before: D1PreparedStatement[]
  after: (order: string, revision: string, facts: Row) => D1PreparedStatement[]
}
const context = new AsyncLocalStorage<ScopedPurchase>()
export const withReplenishmentPurchase = <T>(authority: ScopedPurchase, work: () => Promise<T>) => context.run(authority, work)
export function purchaseWriteAuthority(env: Bindings, actor: Actor, operation: 'draft'|'send', order: string, revision: string, facts: Row, editing = false) {
  const scoped = context.getStore()
  if (!scoped) {
    const authority = capabilitySql(actor.sessionId, 'site.manage')
    return { before: [guard(env, 'stale', authority.sql, ...authority.params)], after: [] as D1PreparedStatement[] }
  }
  const job = automationAuthority()
  insist(job?.rule === 'replenishment' && scoped.operation === operation && scoped.actor === actor.id && !editing, 'forbidden', 403)
  return { before: [guard(env, 'stale', activeOwnerSql, actor.id), ...scoped.before], after: scoped.after(order, revision, facts) }
}
