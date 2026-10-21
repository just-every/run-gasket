// INT-002: owner-controlled event subscriptions and durable reconciliation.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { generateSecret, sealSecret } from './webhook-signing'

export const CONNECTOR_LIMITS = { eventsPerRun: 100, deliveriesPerRun: 20, attempts: 3, timeoutMs: 5000, leaseMs: 30_000, replaySeconds: 300, quotaWindowMs: 3_600_000 }
export const EVENT_TYPES = ['work.changed', 'receipt.created'] as const
export const SUBSCRIPTION_COLUMNS = 'id,name,endpoint,event_types,asset_id,secret_version,revision,paused,cursor,quota,quota_start,quota_used,last_success,last_error,created_at'
export async function eventCursor(env: Bindings) { return (await one(env, 'SELECT COALESCE(MAX(seq),0) AS cursor FROM gk_connector_events')).cursor as number }
const eventTypes = (row: any) => JSON.parse(row.event_types) as string[]
export const matchesEvent = (subscription: any, event: any) => eventTypes(subscription).includes(event.type) && (!subscription.asset_id || subscription.asset_id === event.asset_id)
export const eventEnvelope = (event: any) => ({ id: event.id, cursor: event.seq, type: event.type, sourceId: event.source_id, sourceVersion: event.source_version, assetId: event.asset_id, occurredAt: event.occurred_at, data: JSON.parse(event.data) })

function endpointUrl(text: string) {
  let url: URL
  try { url = new URL(text) } catch { insist(false, 'invalid_endpoint') }
  // HTTPS DNS names only. Redirects are never followed and credentials never go in URLs.
  insist(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search && (!url.port || url.port === '443'), 'invalid_endpoint')
  insist(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/i.test(url.hostname) && !/(^|\.)(localhost|local|internal|home|lan)$/i.test(url.hostname), 'invalid_endpoint')
  return url.href
}

export async function subscribeWebhook(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const name = input.text('name', { max: 100 }), endpoint = endpointUrl(input.text('endpoint', { max: 1000 }))
  const types = input.list('events'), asset = input.text('asset', { optional: true, max: 100 }) || null
  insist(types.length > 0 && new Set(types).size === types.length && types.every(type => EVENT_TYPES.includes(type as typeof EVENT_TYPES[number])), 'invalid_events')
  if (asset) insist(await one(env, 'SELECT 1 FROM gk_assets WHERE id=? AND retired_at IS NULL', asset), 'asset_not_found', 404)
  const high = await eventCursor(env), cursor = input.integer('cursor', { optional: true, max: high }) ?? high
  const quota = input.integer('quota', { min: 1, max: 1000, optional: true }) ?? 100
  const id = newId(), secret = generateSecret(), cipher = await sealSecret(env.SESSION_SECRET, id, secret)
  await commit(env, [stmt(env, 'INSERT INTO gk_connector_subscriptions(id,name,endpoint,event_types,asset_id,secret_cipher,cursor,quota,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', id,name,endpoint,JSON.stringify(types),asset,cipher,cursor,quota,actor.id,now())], { actor: actor.id, action: 'webhook.subscribe', subject: id, detail: { events: types, asset, cursor, quota, paused: true } })
  // Returned once, only to the authenticated owner. Never appears in a GET, audit or job.
  return { id, secret, secretVersion: 1, paused: true, cursor }
}

export async function changeWebhook(env: Bindings, actor: Actor, input: Input, operation: 'control' | 'rotate' | 'resume') {
  requireCapability(actor, 'site.manage')
  const id = input.text('subscription'), revision = input.integer('revision', { min: 1 })!, reason = input.text('reason', { max: 500 })
  const current = await one(env, 'SELECT * FROM gk_connector_subscriptions WHERE id=?', id)
  insist(current, 'subscription_not_found', 404)
  const unchanged = guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_connector_subscriptions WHERE id=? AND revision=?)', id, revision)
  if (operation === 'rotate') {
    const secret = generateSecret(), cipher = await sealSecret(env.SESSION_SECRET, id, secret)
    await commit(env, [unchanged,stmt(env, 'UPDATE gk_connector_subscriptions SET secret_cipher=?,secret_version=secret_version+1,revision=revision+1 WHERE id=?', cipher,id)], { actor: actor.id, action: 'webhook.rotate', subject: id, detail: { reason, secretVersion: current.secret_version+1 } })
    return { id, secret, secretVersion: current.secret_version+1 }
  }
  if (operation === 'control') {
    const paused = input.flag('paused')
    await commit(env, [unchanged,stmt(env, 'UPDATE gk_connector_subscriptions SET paused=?,revision=revision+1 WHERE id=?', Number(paused),id)], { actor: actor.id, action: 'webhook.control', subject: id, detail: { reason, paused } })
  } else {
    const cursor = input.integer('cursor', { max: current.cursor })!
    await commit(env, [unchanged,stmt(env, 'UPDATE gk_connector_subscriptions SET cursor=?,revision=revision+1 WHERE id=?', cursor,id)], { actor: actor.id, action: 'webhook.resume', subject: id, detail: { reason, cursor } })
  }
  return { id }
}
export const controlWebhook = (env: Bindings, actor: Actor, input: Input) => changeWebhook(env,actor,input,'control')
export const rotateWebhook = (env: Bindings, actor: Actor, input: Input) => changeWebhook(env,actor,input,'rotate')
export const resumeWebhook = (env: Bindings, actor: Actor, input: Input) => changeWebhook(env,actor,input,'resume')

export async function retryWebhook(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const id = input.text('delivery'), reason = input.text('reason', { max: 500 })
  // A dead letter opens another bounded cycle; the stable event/delivery IDs never change.
  const row = await one(env, "SELECT * FROM gk_connector_deliveries WHERE id=? AND state='dead'", id)
  insist(row, 'dead_letter_not_found', 409)
  await commit(env, [guard(env,'stale',"EXISTS(SELECT 1 FROM gk_connector_deliveries WHERE id=? AND state='dead' AND attempts=?)", id,row.attempts),
    stmt(env,"UPDATE gk_connector_deliveries SET state='retry',attempts=0,available_at=?,lease_until=NULL,claim=NULL,error=NULL WHERE id=?",now(),id)], { actor: actor.id, action: 'webhook.retry', subject: id, detail: { reason } })
  return { id }
}

export async function connectorInputs(env: Bindings) {
  return { highWater: await eventCursor(env), subscriptions: await all(env, 'SELECT id,revision,paused,cursor FROM gk_connector_subscriptions ORDER BY id'), limits: CONNECTOR_LIMITS }
}
export async function connectors(env: Bindings, actor: Actor, url?: URL) {
  requireCapability(actor, 'site.manage')
  const after = Number(url?.searchParams.get('after') ?? 0)
  insist(Number.isSafeInteger(after) && after >= 0, 'invalid_after')
  const subscriptions = await all(env, `SELECT ${SUBSCRIPTION_COLUMNS} FROM gk_connector_subscriptions ORDER BY name,id`)
  const events = await all(env, 'SELECT * FROM gk_connector_events WHERE seq>? ORDER BY seq LIMIT 101', after)
  const deliveries = await all(env, `SELECT d.*,e.id AS event_id,e.type,e.source_id,e.source_version,e.asset_id FROM gk_connector_deliveries d JOIN gk_connector_events e ON e.seq=d.event_seq ORDER BY d.event_seq,d.id`)
  const attempts = await all(env, 'SELECT * FROM gk_connector_attempts ORDER BY started_at,id')
  const preview = await Promise.all(subscriptions.map(async sub => {
    const scan = await all(env,'SELECT * FROM gk_connector_events WHERE seq>? ORDER BY seq LIMIT 100',sub.cursor)
    return { subscription: sub.id, paused: Boolean(sub.paused), cursor: sub.cursor, nextCursor: scan.at(-1)?.seq ?? sub.cursor, events: scan.filter(event=>matchesEvent(sub,event)).map(eventEnvelope) }
  }))
  return { highWater: await eventCursor(env), limits: CONNECTOR_LIMITS,
    subscriptions: subscriptions.map(sub=>({...sub,events:eventTypes(sub),paused:Boolean(sub.paused),quotaRemaining:now()-sub.quota_start>=CONNECTOR_LIMITS.quotaWindowMs?sub.quota:Math.max(0,sub.quota-sub.quota_used)})),
    events: events.slice(0,100).map(eventEnvelope), next: events.length>100?events[99].seq:null,
    deliveries, attempts, preview,
    coverage: 'Events begin with the connector migration; earlier maintenance is not an event history. Delivery is at least once. Receivers must atomically deduplicate by event id before applying work, stock, bills or notices.' }
}
