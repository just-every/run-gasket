import assert from 'node:assert/strict'

/** Native proposal preparation uses a separate real member and ordinary confirmed mail. */
export default async function initialize({ request, origin, email, owner, mail }) {
  const post = (path, body, cookie) => request(new URL(path, origin).href, { method: 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
  const invited = await post('/api/gasket/access.give', { name: 'Synthetic interval preparer', email, role: 'agent' }, owner.cookie)
  assert.equal(invited.status, 200)
  await invited.body?.cancel()
  const sent = await post('/auth/magic-link', { email, returnTo: '/app' })
  assert.equal(sent.status, 202)
  await sent.body?.cancel()
  const messages = await mail.read({ limit: 20 })
  const link = messages.at(-1)?.text.match(/https:\/\/\S+/)?.[0]
  assert.ok(link, 'native preparer received its sign-in link')
  const token = new URL(link).searchParams.get('token')
  assert.ok(token)
  const confirmed = await post('/auth/confirm', { token })
  assert.equal(confirmed.status, 303)
  return confirmed
}
