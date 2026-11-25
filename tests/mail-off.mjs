import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { emittedWorker } from './emitted-worker.mjs'

const instant = Date.UTC(2027, 2, 7, 14)
const secret = () => randomBytes(32).toString('base64url')
const email = 'owner@example.test'
const setupToken = secret()
const worker = await emittedWorker({
  OWNER_EMAIL: email, SESSION_SECRET: secret(), SETUP_TOKEN: setupToken,
  MAIL_PROVIDER: 'none', MAIL_FROM: '', MAIL_API_KEY: '',
}, { instant })

let cookie
function request(path, body) {
  return worker.request(path, {
    method: body ? 'POST' : 'GET', redirect: 'manual',
    headers: { origin: worker.origin, ...(cookie ? { cookie } : {}), ...(body && !(body instanceof URLSearchParams) ? { 'content-type': 'application/json' } : {}) },
    body: body instanceof URLSearchParams ? body : body ? JSON.stringify(body) : undefined,
  })
}
async function api(path, input) {
  const response = await request(`/api/gasket/${path}`, input)
  const body = await response.json()
  assert.equal(response.status, 200, `${path}: ${body.error}`)
  return body
}

try {
  assert.equal((await request('/health')).status, 200)
  assert.equal((await request('/auth/bootstrap', { token: setupToken, displayName: 'Plant owner' })).status, 303)
  const emailAttempt = await request('/auth/magic-link', { email })
  assert.equal(emailAttempt.status, 503)
  assert.deepEqual(await emailAttempt.json(), { error: 'mail_off' })

  // Model the grant rer signin writes to the deployment's D1, then use the
  // rendered confirmation link and the real native sign-in endpoint.
  const token = secret()
  const digest = createHash('sha256').update(`owner-signin\0${token}`).digest('hex')
  const db = await worker.database()
  await db.prepare(`INSERT INTO oa_owner_signins (id,token_hash,operator_id,operator_version,created_at,expires_at)
    SELECT ?,?,id,version,?,? FROM oa_operators WHERE email=? AND status='active' AND role='owner'`)
    .bind(randomUUID(), digest, instant, instant + 900_000, email).run()
  assert.equal((await request(`/auth/owner-signin?token=${token}`)).status, 200)
  const signedIn = await request('/auth/owner-signin', { token })
  assert.equal(signedIn.status, 303)
  cookie = signedIn.headers.getSetCookie().map(line => line.split(';', 1)[0]).join('; ')
  assert.ok(cookie)
  assert.equal((await request('/auth/owner-signin', { token })).status, 400)
  assert.equal((await request('/setup', new URLSearchParams({ confirm: 'yes' }))).status, 303)
  await api('site.configure', { name: 'Riverside Pump Station', timezone: 'UTC' })
  const owner = await api('me')
  assert.equal(owner.role, 'owner')
  const schedule = await api('report.schedule', {
    name: 'Weekly plant report', report: 'performance', revision: 0,
    weekday: 0, clock: '14:00', firstDay: '2027-03-07', recipients: [owner.id], consent: true,
  })
  await worker.scheduled('*/15 * * * *', instant)
  const { deliveries } = await api('report-schedules')
  const delivery = deliveries.find(row => row.schedule_id === schedule.id)
  assert.deepEqual([delivery?.state, delivery?.error, delivery?.provider], ['rejected', 'mail_off', 'none'])
  assert.equal(worker.mails.length, 0)
  console.log('Mail-off owner sign-in and scheduled email refusal passed')
} finally {
  await worker.close()
}
