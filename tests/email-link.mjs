import {queuedEntrypoint} from '@runeditrun/rer/queued-entry';
const queued=await queuedEntrypoint(import.meta.url,'verify:email-link');if(queued!==null)process.exit(queued);
// The foundation's one end-to-end email-link test: the emitted Worker claims
// the owner, mails a sign-in link through its real mail provider adapter
// (captured at the network edge), and the link signs in through confirmation.
// Dev identity never replaces this path.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { emittedWorker } from './emitted-worker.mjs'

const secret = () => randomBytes(32).toString('base64url'), owner = 'owner@example.test'
const vars = { OWNER_EMAIL: owner, SESSION_SECRET: secret(), SETUP_TOKEN: secret() }
const worker = await emittedWorker(vars), origin = worker.origin
const post = (path, body, cookie) => worker.request(path, { method: 'POST', redirect: 'manual', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
try {
  assert.equal((await worker.request('/health')).status, 200, 'emitted Worker is healthy')
  assert.equal((await post('/auth/bootstrap', { token: vars.SETUP_TOKEN, displayName: 'Owner' })).status, 303, 'owner claimed')
  assert.equal((await post('/auth/magic-link', { email: owner })).status, 202, 'sign-in link mailed')
  assert.equal(worker.mails.length, 1, 'one message reached the provider')
  const token = worker.signInToken(owner)
  assert.ok(token, 'the message carries the sign-in link')
  assert.equal((await worker.request(`/auth/confirm?token=${encodeURIComponent(token)}`)).status, 200, 'confirmation page')
  const confirmed = await post('/auth/confirm', { token })
  assert.equal(confirmed.status, 303)
  const cookie = confirmed.headers.getSetCookie().map(line => line.split(';')[0]).join('; ')
  const session = await worker.request('/auth/session', { headers: { cookie } })
  assert.equal(session.status, 200)
  assert.equal((await session.json()).operator.email, owner)
  console.log('Email-link sign-in passed against the emitted Worker: claim, provider-edge mail, confirmation, session')
} finally {
  await worker.close()
}
