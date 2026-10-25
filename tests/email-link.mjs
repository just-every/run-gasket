import {queuedEntrypoint} from '@runeditrun/rer/queued-entry';
const queued=await queuedEntrypoint(import.meta.url,'verify:email-link');if(queued!==null)process.exit(queued);
// The foundation's one end-to-end email-link test: the emitted Worker claims
// the owner, mails a sign-in link through its real mail provider adapter
// (captured at the network edge), and the link signs in through confirmation.
// Dev identity never replaces this path.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { emittedWorker } from './emitted-worker.mjs'
import { harness } from './gasket/harness.mjs'

const secret = () => randomBytes(32).toString('base64url'), owner = 'owner@example.test'
// As deployed: wrangler.jsonc ships MAIL_RELAY_URL empty, which an Assisted provider must ignore.
const vars = { OWNER_EMAIL: owner, SESSION_SECRET: secret(), SETUP_TOKEN: secret(), MAIL_RELAY_URL: '' }
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

// Sign-in email changes preserve membership authority.
const h = await harness()
try {
  const ownerCookie = await h.owner()
  await h.api('site.configure', ownerCookie, { name: 'Synthetic plant', timezone: 'UTC' })
  const originalOwner = await h.api('me', ownerCookie)
  const member = await h.api('access.give', ownerCookie, { name: 'Technician', email: 'synthetic-gasket-1@example.test', role: 'maintainer' })
  const memberCookie = await h.signIn(member.email)
  const originalSession = await (await h.raw('/auth/session', { cookie: memberCookie })).json()
  for (const [cookie, email] of [[ownerCookie, 'synthetic-gasket-2@example.test'], [memberCookie, owner]]) {
    assert.equal((await h.raw('/auth/email', { cookie, body: { email } })).status, 200)
  }
  await h.api('site.configure', memberCookie, { name: 'Changed plant', timezone: 'UTC' }, 403)
  assert.equal((await h.api('site', ownerCookie)).name, 'Synthetic plant')
  const currentMember = await h.api('me', memberCookie)
  assert.equal(currentMember.id, member.id)
  assert.equal(currentMember.role, 'maintainer')
  assert.equal(currentMember.email, owner)
  const currentSession = await (await h.raw('/auth/session', { cookie: memberCookie })).json()
  assert.equal(currentSession.id, originalSession.id)
  assert.equal(currentSession.operator.id, originalSession.operator.id)
  assert.equal(currentSession.operator.role, 'member')
  assert.equal((await h.api('me', ownerCookie)).id, originalOwner.id)
  await h.api('site.configure', ownerCookie, { name: 'Owner plant', timezone: 'UTC' })
  await h.api('access.role', ownerCookie, { member: member.id, role: 'lead' })
  assert.equal((await h.api('me', memberCookie)).role, 'lead')
  const people = await h.api('members', ownerCookie)
  assert.equal(people.find(person => person.id === member.id).email, owner)
  assert.equal(people.find(person => person.id === originalOwner.id).email, 'synthetic-gasket-2@example.test')
  await h.api('access.end', ownerCookie, { member: member.id })
  assert.ok([401, 403].includes((await h.raw('/api/gasket/assets', { cookie: memberCookie })).status))
  assert.equal((await h.raw('/auth/invite', { cookie: ownerCookie, body: { email: 'synthetic-gasket-3@example.test', displayName: 'Other owner', role: 'owner' } })).status, 202)
  const otherOwner = await h.signIn('synthetic-gasket-3@example.test')
  assert.equal((await h.api('me', otherOwner)).role, 'owner')
  const ownerSession = await (await h.raw('/auth/session', { cookie: ownerCookie })).json()
  assert.equal((await h.raw('/auth/operator/role', { cookie: otherOwner, body: { operatorId: ownerSession.operator.id, role: 'member' } })).status, 200)
  const formerOwner = await h.signIn('synthetic-gasket-2@example.test')
  await h.api('me', formerOwner, undefined, 403)
  await h.api('site.configure', formerOwner, { name: 'Former owner plant', timezone: 'UTC' }, 403)
  console.log('Sign-in email changes preserve membership authority passed')
} finally {
  await h.close()
}
