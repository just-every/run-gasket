// Receiver-side verification for the byte protocol documented in API.md.
// A receiver supplies its own durable transaction for acceptOnce. Do not use an
// in-memory Set in production: restart must preserve applied event identities.
import { createHmac, timingSafeEqual } from 'node:crypto'

export async function receiveWebhook(request, { secret, keyVersion, acceptOnce, now = Date.now() }) {
  const id=request.headers.get('gasket-id'), timestamp=request.headers.get('gasket-timestamp'), signature=request.headers.get('gasket-signature')
  if (!id || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(Math.floor(now/1000)-Number(timestamp))>300) return Response.json({error:'expired_replay'}, {status:401})
  if (request.headers.get('gasket-key-version')!==String(keyVersion)) return Response.json({error:'unknown_signing_key'}, {status:401})
  if (!signature || !/^v1=[a-f0-9]{64}$/.test(signature)) return Response.json({error:'invalid_signature'}, {status:401})
  const body=await request.text(), expected=createHmac('sha256',secret).update(`${timestamp}.${id}.${body}`).digest()
  if (!timingSafeEqual(expected,Buffer.from(signature.slice(3),'hex'))) return Response.json({error:'invalid_signature'}, {status:401})
  let event
  try { event=JSON.parse(body) } catch { return Response.json({error:'invalid_event'}, {status:400}) }
  if (!event || typeof event.id!=='string' || typeof event.sourceId!=='string' || !['work.changed','receipt.created'].includes(event.type)) return Response.json({error:'invalid_event'}, {status:400})
  // Atomically insert event.id and apply its effects, or return the existing
  // receipt. A thrown transaction must not mark the event applied.
  const result=await acceptOnce(event.id,event)
  return Response.json({eventId:event.id,duplicate:Boolean(result.duplicate)})
}
