// INT-002: a bounded leased outbox. Claims, quota and cursor moves are atomic;
// network calls happen after claiming, with a stable delivery/event identity.
import type { Bindings } from '../auth.server'
import { all, commit, GasketError, guard, newId, now, one, stmt } from './core'
import { automationAuthority } from './automation-context'
import { CONNECTOR_LIMITS as L, connectorInputs, eventEnvelope, matchesEvent } from './webhooks'
import { openSecret, signWebhook } from './webhook-signing'

const stillActive = (env: Bindings, sub: any) => guard(env,'stale','EXISTS(SELECT 1 FROM gk_connector_subscriptions WHERE id=? AND revision=? AND paused=0)',sub.id,sub.revision)
const audit = (sub: any, action: string, detail: unknown) => ({ actor: sub.created_by, action, subject: sub.id, detail })
const stale = (error: unknown) => error instanceof GasketError && ['stale','precondition_failed','automation_changed'].includes(error.code)
const retryAt = (header: string | null, attempt: number) => {
  const delay = header && /^\d+$/.test(header) ? Number(header)*1000 : header ? Date.parse(header)-now() : 0
  return now()+Math.min(86_400_000,Math.max(1000*2**(attempt-1),Number.isFinite(delay)?delay:0))
}

export async function runConnectors(env: Bindings, input: Awaited<ReturnType<typeof connectorInputs>>) {
  const results: { delivery: string; state: string; error: string | null }[] = []
  let remaining = L.deliveriesPerRun
  for (const source of input.subscriptions) {
    let sub = await one(env,'SELECT * FROM gk_connector_subscriptions WHERE id=? AND revision=? AND paused=0',source.id,source.revision)
    if (!sub) continue
    const scan = await all(env,'SELECT * FROM gk_connector_events WHERE seq>? AND seq<=? ORDER BY seq LIMIT ?',sub.cursor,input.highWater,L.eventsPerRun)
    try {
      if (scan.length) await commit(env,[stillActive(env,sub),guard(env,'stale','(SELECT cursor FROM gk_connector_subscriptions WHERE id=?)=?',sub.id,sub.cursor),
        ...scan.filter(event=>matchesEvent(sub,event)).map(event=>stmt(env,'INSERT INTO gk_connector_deliveries(id,subscription_id,event_seq,available_at) VALUES(?,?,?,?) ON CONFLICT(subscription_id,event_seq) DO NOTHING',newId(),sub.id,event.seq,now())),
        stmt(env,'UPDATE gk_connector_subscriptions SET cursor=? WHERE id=?',scan.at(-1)!.seq,sub.id)],audit(sub,'webhook.scan',{from:sub.cursor,to:scan.at(-1)!.seq}))
      // An interrupted process leaves its lease and started attempt visible. It
      // becomes retryable only when the lease expires, bounded by the same cap.
      const expired = await all(env,"SELECT * FROM gk_connector_deliveries WHERE subscription_id=? AND state='running' AND lease_until<=?",sub.id,now())
      for (const row of expired) await commit(env,[stillActive(env,sub),
        stmt(env,"UPDATE gk_connector_attempts SET finished_at=?,outcome='lease_expired' WHERE id=? AND outcome='running'",now(),row.claim),
        stmt(env,"UPDATE gk_connector_deliveries SET state=CASE WHEN attempts>=? THEN 'dead' ELSE 'retry' END,error='lease_expired',available_at=?,lease_until=NULL,claim=NULL WHERE id=? AND state='running' AND lease_until<=?",L.attempts,now(),row.id,now())],audit(sub,'webhook.recover',{delivery:row.id}))
    } catch (error) { if (stale(error)) continue; throw error }
    const due = await all(env,"SELECT d.*,e.id AS event_id FROM gk_connector_deliveries d JOIN gk_connector_events e ON e.seq=d.event_seq WHERE d.subscription_id=? AND d.state IN ('pending','retry') AND d.available_at<=? ORDER BY d.event_seq LIMIT ?",sub.id,now(),remaining)
    for (const delivery of due) {
      sub = await one(env,'SELECT * FROM gk_connector_subscriptions WHERE id=? AND revision=? AND paused=0',source.id,source.revision)
      if (!sub || remaining<=0) break
      const instant = now(), reset = instant-sub.quota_start>=L.quotaWindowMs
      if (!reset && sub.quota_used>=sub.quota) {
        await commit(env,[stillActive(env,sub),stmt(env,"UPDATE gk_connector_subscriptions SET last_error='quota_exhausted' WHERE id=?",sub.id)],audit(sub,'webhook.quota',{resetsAt:sub.quota_start+L.quotaWindowMs}))
        break
      }
      const claim = newId(), authority = automationAuthority()!
      try {
        await commit(env,[stillActive(env,sub),
          guard(env,'stale',"EXISTS(SELECT 1 FROM gk_connector_deliveries WHERE id=? AND state IN ('pending','retry') AND attempts=? AND available_at<=?)",delivery.id,delivery.attempts,instant),
          guard(env,'stale','EXISTS(SELECT 1 FROM gk_connector_subscriptions WHERE id=? AND quota_start=? AND quota_used=? AND (quota_used<quota OR ?-quota_start>=?))',sub.id,sub.quota_start,sub.quota_used,instant,L.quotaWindowMs),
          stmt(env,'UPDATE gk_connector_subscriptions SET quota_start=?,quota_used=? WHERE id=?',reset?instant:sub.quota_start,reset?1:sub.quota_used+1,sub.id),
          stmt(env,"UPDATE gk_connector_deliveries SET state='running',attempts=attempts+1,claim=?,lease_until=? WHERE id=?",claim,instant+L.leaseMs,delivery.id),
          stmt(env,"INSERT INTO gk_connector_attempts(id,delivery_id,attempt,subscription_revision,secret_version,automation_job_id,automation_revision,started_at,outcome) VALUES(?,?,(SELECT COALESCE(MAX(attempt),0)+1 FROM gk_connector_attempts WHERE delivery_id=?),?,?,?,?,?,'running')",claim,delivery.id,delivery.id,sub.revision,sub.secret_version,authority.job,authority.revision,instant)],audit(sub,'webhook.claim',{delivery:delivery.id,secretVersion:sub.secret_version}))
      } catch (error) { if (stale(error)) continue; throw error }
      remaining--
      let error: string | null = null, status: number | null = null, accepted = false, terminal = false, available = retryAt(null,delivery.attempts+1)
      let secret: string | null = null
      try { secret = await openSecret(env.SESSION_SECRET,sub.id,sub.secret_cipher) } catch { error='signing_key_unavailable';terminal=true }
      if (secret) {
        const event = await one(env,'SELECT * FROM gk_connector_events WHERE seq=?',delivery.event_seq)
        const body = JSON.stringify(eventEnvelope(event)), timestamp=String(Math.floor(now()/1000))
        const signature = await signWebhook(secret,timestamp,delivery.id,body)
        const abort = new AbortController(), timer = setTimeout(()=>abort.abort(),L.timeoutMs)
        try {
          const response=await fetch(sub.endpoint,{method:'POST',redirect:'manual',signal:abort.signal,headers:{'content-type':'application/json','gasket-id':delivery.id,'gasket-timestamp':timestamp,'gasket-key-version':String(sub.secret_version),'gasket-signature':`v1=${signature}`},body})
          status=response.status;accepted=status>=200&&status<300
          if (!accepted) {
            terminal=status>=300&&status<500&&![408,429].includes(status)
            error=status===429?'rate_limited':status>=300&&status<400?'redirect_refused':`receiver_http_${status}`
            available=retryAt(response.headers.get('retry-after'),delivery.attempts+1)
          }
          // Never persist receiver bodies (which may contain their credentials).
          await response.body?.cancel()
        } catch { error=abort.signal.aborted?'receiver_timeout':'network_failure' } finally { clearTimeout(timer) }
      }
      const state=accepted?'delivered':terminal||delivery.attempts+1>=L.attempts?'dead':'retry'
      // Record an already-attempted network outcome even if an owner paused the
      // grant during the request. The claim fences off late/duplicate writers.
      await env.DB.batch([
        stmt(env,`INSERT INTO gk_audit(at,actor,role,action,subject,detail)
          SELECT ?,?,(SELECT role FROM gk_members WHERE id=?),'webhook.outcome',?,?
          WHERE EXISTS(SELECT 1 FROM gk_connector_deliveries WHERE id=? AND claim=? AND state='running')`,now(),sub.created_by,sub.created_by,sub.id,JSON.stringify({delivery:delivery.id,state,error,status,automation:authority}),delivery.id,claim),
        stmt(env,"UPDATE gk_connector_attempts SET finished_at=?,outcome=?,http_status=? WHERE id=? AND outcome='running'",now(),accepted?'accepted':error,status,claim),
        stmt(env,'UPDATE gk_connector_deliveries SET state=?,error=?,http_status=?,available_at=?,delivered_at=?,lease_until=NULL WHERE id=? AND claim=? AND state=\'running\'',state,error,status,available,accepted?now():null,delivery.id,claim),
        stmt(env,'UPDATE gk_connector_subscriptions SET last_success=CASE WHEN ? THEN ? ELSE last_success END,last_error=? WHERE id=? AND EXISTS(SELECT 1 FROM gk_connector_deliveries WHERE id=? AND claim=? AND state=?)',Number(accepted),now(),error,sub.id,delivery.id,claim,state),
      ])
      results.push({delivery:delivery.id,state,error})
    }
  }
  return { created:[],runs:[],notices:[],deliveries:results }
}
