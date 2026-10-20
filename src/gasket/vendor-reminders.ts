// BUY-006's automatic job: one claimed vendor email per revision and occasion,
// claimed before submission so a crash, an uncertain result or a later run never
// sends it twice, and an in-app escalation to the planners when a late delivery
// holds open linked work. Every record keeps its job and grant revision.
import type { Bindings } from '../auth.server'
import { localDevelopment, operatorMail } from '../mail.server.mjs'
import { automationAuthority } from './automation-context'
import { all, AUDIT_INSERT, commit, GasketError, guard, insist, newId, now, stmt, type Row } from './core'
import { followUps, planners } from './vendor-follow-up'

const WORKER = 'scheduler'
const woLabel = (work: Row | null) => !work ? '' : `WO-${String(work.number).padStart(4, '0')} ${work.title}`
const outstanding = (row: Row) => row.lines.filter((line: Row) => line.outstanding !== '0').map((line: Row) => `${line.description}: ${line.outstanding} ${line.unit} outstanding of ${line.ordered} ordered`)

function message(row: Row, occasion: string, day: string) {
  const head = `PO-${row.number} revision ${row.revision}, sent ${row.sentOn}, delivery promised ${row.promisedOn}.`
  const body = occasion === 'late'
    ? [`As of ${day} this delivery is ${row.lateDays} day${row.lateDays === 1 ? '' : 's'} past its promised date. Still outstanding:`, ...outstanding(row), 'Please reply with the new delivery date.']
    : ['We have no acknowledgment of this order on record. Please reply to confirm the order and its delivery date.']
  return { subject: `PO-${row.number} revision ${row.revision}: ${occasion === 'late' ? 'delivery overdue' : 'please acknowledge'}`, text: [`Reminder about ${head}`, ...body].join('\n') }
}

async function remind(env: Bindings, row: Row, occasion: string, day: string, ruleNumber: number) {
  const job = automationAuthority()!, id = newId(), facts = { day, promisedOn: row.promisedOn, sentOn: row.sentOn, lateDays: row.lateDays, acknowledged: Boolean(row.acknowledgment), outstanding: outstanding(row) }
  try {
    await commit(env, [guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM gk_vendor_reminders WHERE revision_id=? AND occasion=?)', row.revisionId, occasion),
      stmt(env, "INSERT INTO gk_vendor_reminders(id,revision_id,occasion,rule_number,day,recipient,facts,state,claimed_at,automation_job_id,automation_revision) VALUES (?,?,?,?,?,?,?,'unconfirmed',?,?,?)", id, row.revisionId, occasion, ruleNumber, day, row.recipient, JSON.stringify(facts), now(), job.job, job.revision)],
    { actor: WORKER, action: 'vendor.remind.claim', subject: row.orderId, detail: { reminder: id, revisionId: row.revisionId, occasion, recipient: row.recipient, rule: ruleNumber } })
  } catch (error) {
    if (error instanceof GasketError && error.code === 'stale') return null
    throw error
  }
  let state = 'failed', provider: string | null = null, providerId: string | null = null, error: string | null = 'mail_not_configured'
  const sender = operatorMail(env), from = env.MAIL_FROM || (localDevelopment(env) || env.RER_DEMO === '1' ? 'Gasket <local@example.test>' : '')
  if (sender && from) {
    try {
      const { subject, text } = message(row, occasion, day)
      const escaped = text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))
      const result = await sender.send({ deliveryId: id, from, to: [row.recipient], subject, text, html: `<pre>${escaped}</pre>`, headers: {} })
      state = result.status; provider = result.provider; providerId = result.providerMessageId; error = result.code ?? null
    } catch { state = 'uncertain'; error = 'mail_submission_unconfirmed' }
  }
  // The outcome is recorded even if the grant changed meanwhile: the email may already be out.
  await env.DB.batch([stmt(env, 'UPDATE gk_vendor_reminders SET state=?,provider=?,provider_message_id=?,error=?,finished_at=? WHERE id=?', state, provider, providerId, error, now(), id),
    stmt(env, AUDIT_INSERT, now(), WORKER, WORKER, 'vendor.remind.result', row.orderId, JSON.stringify({ reminder: id, occasion, state, provider, providerMessageId: providerId, error, automation: job }))])
  return id
}

export async function runVendorFollowUp(env: Bindings, day: string) {
  const job = automationAuthority()
  insist(job?.rule === 'vendor', 'automation_required', 403)
  const data = await followUps(env, day), reminders: string[] = []
  if (!data.rule) return { created: [], runs: [], notices: [], reminders, rule: null }
  const recipients = await planners(env)
  for (const row of data.orders) for (const action of row.due) {
    if (action.kind === 'reminder') { const id = await remind(env, row, action.occasion, day, data.rule.number); if (id) reminders.push(id); continue }
    const text = `${woLabel(row.work)} is held by a late delivery: PO-${row.number} from ${row.supplier.name}, promised ${row.promisedOn}, is ${row.lateDays} days late. ${outstanding(row).join('; ')}. Vendor acknowledgment: ${row.acknowledgment ? 'recorded' : 'none recorded'}. Stored in-app; no external alert sent.`
    await commit(env, recipients.map(recipient => stmt(env, "INSERT OR IGNORE INTO gk_notices(id,recipient_id,work_order_id,purchase_order_id,kind,occasion,text,created_at,automation_job_id,automation_revision) VALUES (?,?,?,?,'escalation_lead',?,?,?,?,?)",
      newId(), recipient, row.work!.id, row.orderId, action.occasion, text, now(), job.job, job.revision)),
    { actor: WORKER, action: 'vendor.escalate', subject: row.orderId, detail: { revisionId: row.revisionId, workOrder: row.work!.id, lateDays: row.lateDays, recipients } })
  }
  return { created: [], runs: [], notices: await all(env, 'SELECT id,recipient_id,kind,work_order_id,purchase_order_id FROM gk_notices WHERE automation_job_id=?', job.job), reminders, rule: data.rule.number }
}
