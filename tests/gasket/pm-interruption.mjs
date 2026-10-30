// Real emitted Worker interruption and recovery through the maintenance doors.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { harness } from './harness.mjs'

const cron = '*/15 * * * *'
const initial = Date.UTC(2026, 9, 30, 12)
const hour = 60 * 60_000

function barrier(h, target) {
  let reached, release, armed = true
  const ready = new Promise(resolve => { reached = resolve })
  const held = new Promise(resolve => { release = resolve })
  h.setPMHook(async phase => {
    if (phase !== target || !armed) return
    armed = false; reached(); await held
  })
  return { ready: () => Promise.race([ready, new Promise((_, reject) => { const timer = setTimeout(() => reject(Error(`PM boundary not reached: ${target}`)), 15_000); timer.unref() })]), release }
}

export async function pmInterruptionJourney() {
  for (const phase of ['started', 'occurrence']) {
    const original = await harness({ clockInstant: initial, pmGate: true })
    const { installation, vars } = original
    let h = original, held
    try {
      const owner = await h.owner()
      await h.api('site.configure', owner, { name: 'Recovery plant', timezone: 'UTC' })
      await h.scheduled(cron, initial - hour)
      const day = (await h.api('me', owner)).today
      const asset = (await h.api('asset.create', owner, { tag: 'PM-RECOVERY', name: 'Recovery pump', location: 'Workshop' })).id
      const checklist = (await h.api('checklist.create', owner, { name: 'Recovery inspection', items: ['Inspect original seal'] })).id
      const schedule = (await h.api('schedule.create', owner, { asset, checklist, title: 'Recover interrupted PM', everyDays: 30, firstDue: day })).id
      const health = () => h.api('automation', owner)
      const grant = async () => (await health()).rules.find(row => row.id === 'pm')
      const jobs = () => h.api('automation/jobs', owner)
      const work = () => h.api('work', owner)
      const details = async () => Promise.all((await work()).map(row => h.api(`work/${row.id}`, owner)))
      const snapshot = async () => ({ work: await details(), jobs: await jobs(), audit: await h.api('audit', owner), purchases: await h.api('purchasing', owner), notices: await h.api('notices', owner) })
      await h.api('automation.control', owner, { rule: 'pm', revision: (await grant()).revision, paused: true, reason: 'Preview before activation' })
      const beforePreview = await snapshot(), mailCount = h.mails.length
      assert.equal((await h.api(`automation/preview?schedule=${schedule}`, owner)).created.length, 1)
      assert.deepEqual(await snapshot(), beforePreview, 'preview has no accepted or execution effects')
      assert.equal(h.mails.length, mailCount, 'preview sends no notification')
      await h.api('automation.control', owner, { rule: 'pm', revision: (await grant()).revision, paused: false, reason: 'Enable tested PM' })
      const originalGrant = (await grant()).revision
      held = barrier(h, phase)
      const trigger = h.scheduled(cron).then(() => 'completed', () => 'terminated')
      await held.ready()
      const interrupted = (await jobs()).jobs.find(row => row.rule_id === 'pm' && row.state === 'running')
      assert.ok(interrupted, 'a real scheduled event durably started the attempt')
      assert.equal(interrupted.source, 'cron')
      assert.equal(interrupted.rule_revision, originalGrant)
      assert.equal(interrupted.input.schedules.find(row => row.id === schedule).revision, 1)
      const originalInput = interrupted.input
      const accepted = await details()
      assert.equal(accepted.length, phase === 'occurrence' ? 1 : 0)
      // No callback reply or failure is delivered before the real Worker stops.
      await h.stop(); held.release(); held = null
      assert.equal(await trigger, 'terminated')
      h = await harness({ vars, installation, clockInstant: initial + hour, pmGate: true })
      let record = await h.api(`automation/jobs?job=${interrupted.id}`, owner)
      assert.equal(record.state, 'running', 'termination did not execute the callback failure handler')
      assert.equal(record.interrupted, true)
      assert.deepEqual(record.input, originalInput)
      let status = await health()
      assert.equal(status.jobs.find(row => row.id === interrupted.id).interrupted, true)
      assert.ok((await grant()).missed && (await grant()).uncoveredMinutes >= 120, 'missed coverage survives the restart and due slot')
      assert.equal(status.coverage.find(row => row.id === schedule).status, accepted.length ? 'work_issued' : 'due')
      const page = await (await h.raw('/app/automation', { cookie: owner })).text()
      assert.ok(page.includes('Missed runs') && page.includes('Interrupted') && page.includes('Attempt expired.'))
      if (phase === 'occurrence') await browserProof(h, owner, 'interrupted')
      console.log(`PROBE PM-008 interruption-${phase}: real scheduled event, Worker terminated and restarted after 60 minutes -> interrupted attempt and missed coverage visible; accepted occurrences=${accepted.length}`)
      // Recovery reconciles old effects, then evaluates only the current grant
      // and schedule. A later procedure never rewrites accepted work.
      await h.api('automation.control', owner, { rule: 'pm', revision: originalGrant, paused: true, reason: 'Review recovery' })
      await h.api('automation.control', owner, { rule: 'pm', revision: (await grant()).revision, paused: false, reason: 'Resume current revision' })
      await h.api('automation.schedule', owner, { schedule, revision: 1, active: false, reason: 'Review schedule' })
      await h.api('automation.schedule', owner, { schedule, revision: 2, active: true, reason: 'Resume schedule' })
      await h.api('checklist.revise', owner, { checklist, items: ['Inspect revised seal'], note: 'Later procedure' })
      assert.equal((await h.api('automation.catchup', owner, { rule: 'pm', revision: originalGrant }, 409)).error, 'automation_changed')
      assert.equal((await h.api(`automation/jobs?job=${interrupted.id}`, owner)).recovered_by, null, 'stale authority cannot claim recovery')
      const revision = (await grant()).revision
      const recovery = await h.api('automation.catchup', owner, { rule: 'pm', revision })
      assert.equal(recovery.state, 'completed')
      assert.equal(recovery.output.created.length, accepted.length ? 0 : 1)
      const recoveryRecord = await h.api(`automation/jobs?job=${recovery.job}`, owner)
      assert.equal(recoveryRecord.rule_revision, revision)
      assert.deepEqual(recoveryRecord.recovers, [interrupted.id])
      if (!accepted.length) assert.equal(recoveryRecord.input.schedules.find(row => row.id === schedule).revision, 3)
      record = await h.api(`automation/jobs?job=${interrupted.id}`, owner)
      assert.equal(record.state, 'failed'); assert.equal(record.error, 'pm_interrupted')
      assert.equal(record.recovered_by, recovery.job)
      assert.equal(record.output.recovery.recoveredBy, recovery.job)
      assert.equal(record.output.recovery.reconciledAt, initial + hour)
      assert.deepEqual(record.input, originalInput)
      assert.equal(record.rule_revision, originalGrant)
      assert.equal(record.output.created.length, accepted.length)
      status = await health()
      assert.equal(status.lastTrigger.state, 'failed')
      assert.equal(status.lastTrigger.error, 'pm_interrupted', 'the interrupted scheduler is not left reporting a live run')
      const scheduler = (await h.api('scheduler', owner)).runs.find(row => row.id === originalInput.schedulerRun)
      assert.equal(scheduler.state, 'failed'); assert.equal(scheduler.error, 'pm_interrupted')
      assert.equal(scheduler.finished_at, initial + hour)
      assert.equal(scheduler.created, accepted.length, 'failed scheduler retains its already committed work count')
      const issued = (await details()).filter(row => row.schedule_id === schedule)
      assert.equal(issued.length, 1, 'one original occurrence after recovery')
      const order = await h.api(`work/${issued[0].id}`, owner)
      assert.equal(order.occurrence, `${schedule}@${day}`)
      assert.equal(order.due_date, day)
      assert.equal(order.checklist_revision, accepted.length ? 1 : 2)
      assert.equal(order.created_by, 'scheduler')
      if (accepted.length) {
        assert.deepEqual(await details(), accepted, 'already accepted work is byte-for-byte unchanged')
        assert.equal(record.output.created[0].id, order.id)
        assert.equal(record.output.created[0].revision, 1)
      }
      const audit = (await h.api('audit?action=workorder.schedule', owner)).rows.filter(row => row.subject === order.id)
      assert.equal(audit.length, 1)
      assert.deepEqual(JSON.parse(audit[0].detail).automation, { job: accepted.length ? interrupted.id : recovery.job, rule: 'pm', revision: accepted.length ? originalGrant : revision })
      const recoveredWork = await details(), recoveredRecord = record
      assert.equal((await h.api('automation.catchup', owner, { rule: 'pm', revision })).output.created.length, 0)
      assert.deepEqual(await details(), recoveredWork)
      assert.deepEqual(await h.api(`automation/jobs?job=${interrupted.id}`, owner), recoveredRecord)
      console.log(`PROBE PM-008 recovery-${phase}: current-revision catch-up twice -> one occurrence, original input retained, recovery=${recovery.job}, reconciled effects=${record.output.created.length}`)
      if (phase === 'occurrence') await browserProof(h, owner, 'recovered')
      // A live but superseded callback is also fenced at its actual write.
      if (phase === 'started') {
        const next = (await h.api('schedule.create', owner, { asset, checklist, title: 'Fence old attempt', everyDays: 30, firstDue: day })).id
        held = barrier(h, 'before_occurrence')
        const oldRequest = h.raw('/api/gasket/automation.catchup', { cookie: owner, body: { rule: 'pm', revision } })
        await held.ready()
        const old = (await jobs()).jobs.find(row => row.rule_id === 'pm' && row.state === 'running')
        assert.ok(old)
        assert.equal((await h.setClockInstant(initial + 2 * hour)).status, 204)
        const replacement = await h.api('automation.catchup', owner, { rule: 'pm', revision })
        assert.equal(replacement.output.created.filter(row => row.schedule === next).length, 1)
        const fencedRecord = await h.api(`automation/jobs?job=${old.id}`, owner), fencedWork = await details()
        held.release(); held = null
        const refused = await oldRequest
        assert.equal(refused.status, 409); assert.equal((await refused.json()).error, 'automation_changed')
        assert.deepEqual(await details(), fencedWork, 'superseded callback cannot add or change accepted work')
        assert.deepEqual(await h.api(`automation/jobs?job=${old.id}`, owner), fencedRecord, 'superseded completion cannot overwrite recovery lineage')
        assert.equal((await details()).filter(row => row.schedule_id === next).length, 1)
        console.log('PROBE PM-008 fencing: expired callback released after recovery -> HTTP 409 automation_changed, unchanged work and recovery ledger')
      }
      const beforeRestart = await details()
      await h.stop()
      h = await harness({ vars, installation, clockInstant: initial + 3 * hour, pmGate: true })
      await h.scheduled(cron)
      assert.deepEqual(await details(), beforeRestart, 'another Worker restart and Cron event keep accepted work')
      assert.deepEqual(await h.api(`automation/jobs?job=${interrupted.id}`, owner), recoveredRecord)
    } finally {
      held?.release()
      await h.stop()
      await original.close()
    }
  }
}

async function browserProof(h, cookie, label) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ headless: true, ...(process.env.GASKET_CHROMIUM ? { executablePath: process.env.GASKET_CHROMIUM } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(cookie.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
    const page = await context.newPage()
    const directory = process.env.PM_INTERRUPTION_SCREENSHOTS
    if (directory) await mkdir(directory, { recursive: true })
    for (const width of directory ? [1440, 390] : [1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(h.origin + '/app/automation')
      if (width === 1440) {
        assert.ok(await page.getByRole('heading', { name: 'Automation', exact: true }).isVisible())
        assert.ok(await page.getByText(label === 'interrupted' ? 'Attempt expired. Catch-up reconciles committed work before issuing due work.' : 'pm interrupted', { exact: true }).isVisible())
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        if (label === 'recovered') assert.ok(await page.getByRole('link', { name: 'Recovery attempt', exact: true }).isVisible())
      }
      if (directory) await page.screenshot({ path: `${directory}/pm-${label}-${width}.png`, fullPage: true })
    }
    await context.close()
  } finally { await browser.close() }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await pmInterruptionJourney()
  console.log('PM-008 interrupted attempts, durable reconciliation and superseded write fencing passed')
}
