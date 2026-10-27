// Explicit held-key qualification of the built scheduled-report door. Auth mail
// stays at the test edge; exactly one synthetic report goes to the held sender.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { harness } from './harness.mjs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseAddress } from '../../src/modules/mail/src/core/validation.mjs'

assert.ok(process.env.REPORT_SENDGRID_API_KEY, 'inject the admitted SendGrid key')
assert.ok(process.env.REPORT_SENDGRID_FROM, 'inject the admitted verified sender')
const from = process.env.REPORT_SENDGRID_FROM
const recipient = parseAddress(from).email
const vars = {
  OWNER_EMAIL: recipient, MAIL_FROM: from, MAIL_PROVIDER: 'sendgrid', MAIL_API_KEY: process.env.REPORT_SENDGRID_API_KEY,
  SESSION_SECRET: 'synthetic-gasket-session-secret-123456789', SETUP_TOKEN: 'synthetic-gasket-setup-token-123456789',
}
let submissions = 0, providerId
const h = await harness({ vars, clockInstant: Date.parse('2027-03-07T14:00:00Z'), outbound: async request => {
  assert.equal(request.url, 'https://api.sendgrid.com/v3/mail/send')
  const message = await request.clone().json()
  if (!message.subject.startsWith('Gasket report:')) return new Response(null, { status: 202 })
  assert.equal(++submissions, 1, 'one external submission only')
  assert.equal(message.subject, 'Gasket report: Synthetic provider qualification')
  assert.deepEqual(message.personalizations, [{ to: [{ email: recipient }] }])
  assert.deepEqual(message.attachments.map(a => a.filename).sort(), ['dataset.csv', 'report.pdf'])
  const csv = Buffer.from(message.attachments.find(a => a.filename === 'dataset.csv').content, 'base64').toString()
  assert.ok(csv.includes('Synthetic qualification work'))
  assert.ok(csv.includes('2027-02-28')); assert.ok(csv.includes('2027-03-06'))
  const task = getDocument({ data: new Uint8Array(Buffer.from(message.attachments.find(a => a.filename === 'report.pdf').content, 'base64')), isEvalSupported: false, disableFontFace: true })
  const pdf = await task.promise
  let text = ''
  for (let page = 1; page <= pdf.numPages; page++) text += (await (await pdf.getPage(page)).getTextContent()).items.map(i => i.str ?? '').join(' ')
  await task.destroy()
  assert.ok(text.includes('Synthetic qualification work'))
  const response = await fetch(request.url, { method: request.method, headers: request.headers, body: await request.arrayBuffer(), signal: AbortSignal.timeout(30_000) })
  assert.equal(response.status, 202, 'SendGrid accepts the actual scheduled PDF and CSV request')
  providerId = response.headers.get('x-message-id')
  assert.ok(providerId, 'SendGrid returns a submission reference')
  return new Response(null, { status: response.status, headers: response.headers })
} })
try {
  const cookie = await h.owner()
  await h.api('site.configure', cookie, { name: 'Great Lakes report plant', timezone: 'America/New_York' })
  const asset = (await h.api('asset.create', cookie, { tag: 'QUAL-1', name: 'Synthetic provider motor', location: 'Line 1' })).id
  await h.api('workorder.create', cookie, { asset, title: 'Synthetic qualification work', due: '2027-03-06' })
  const owner = (await h.api('me', cookie)).id
  const schedule = await h.api('report.schedule', cookie, { name: 'Synthetic provider qualification', report: 'performance', revision: 0, weekday: 0, clock: '09:00', firstDay: '2027-03-07', recipients: [owner], consent: true })
  await h.scheduled('*/15 * * * *', Date.parse('2027-03-07T14:00:00Z'))
  await h.scheduled('*/15 * * * *', Date.parse('2027-03-07T14:01:00Z'))
  const results = (await h.api('report-schedules', cookie)).deliveries.filter(d => d.schedule_id === schedule.id)
  assert.deepEqual(results.map(d => [d.state, d.provider, d.provider_message_id]), [['accepted', 'sendgrid', providerId]])
  assert.equal(submissions, 1)
  console.log(JSON.stringify({ journey: 'report-provider', commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), provider: 'sendgrid', status: 'accepted', httpStatus: 202, providerMessageId: providerId, submissions, attachments: ['report.pdf', 'dataset.csv'], inboxDelivery: 'not claimed' }))
} finally { await h.close() }
