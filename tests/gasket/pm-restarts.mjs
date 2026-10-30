// PM-001 through the emitted Worker, with each restart retaining the same installation.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { harness } from './harness.mjs'

export async function pmRestartsJourney() {
  const cron = '*/15 * * * *', timezone = 'America/Los_Angeles'
  const before = Date.parse('2030-04-28T06:45:00Z') // April 27 locally, outside the three-day lead time.
  const resumed = Date.parse('2030-05-02T07:15:00Z'), restarted = Date.parse('2030-05-03T07:15:00Z')
  const due = '2030-05-01', title = 'Monthly compressor inspection'
  const instructions = ['Isolate the compressor', 'Inspect the drive belt']
  const initial = await harness({ clockInstant: before })
  let h = initial
  try {
    let cookie = await h.owner()
    await h.api('site.configure', cookie, { name: 'Restart plant', timezone, leadDays: 3 })
    const owner = (await h.api('me', cookie)).id
    const asset = (await h.api('asset.create', cookie, { tag: 'synthetic-gasket-1', name: 'Compressor', location: 'Plant room' })).id
    const checklist = await h.api('checklist.create', cookie, { name: 'Compressor inspection', items: instructions })
    const saved = await h.submit('schedule.create', cookie, { asset, checklist: checklist.id, title, everyDays: '30', firstDue: due, assignee: owner, cadence: 'fixed' }, '/app/schedules')
    assert.equal(saved.searchParams.get('notice'), 'Saved.')
    const schedules = await h.api('schedules', cookie)
    assert.equal(schedules.length, 1)
    const schedule = schedules[0].id, occurrence = `${schedule}@${due}`
    assert.deepEqual([schedules[0].next_due_date, schedules[0].every_days, schedules[0].cadence], [due, 30, 'fixed'])
    assert.equal((await h.api('me', cookie)).today, '2030-04-27', 'the site day, rather than UTC, controls the lead boundary')
    await h.scheduled(cron)
    assert.deepEqual(await h.api('work', cookie), [], 'a real scheduled event before the lead boundary issues nothing')
    assert.deepEqual((await h.api('scheduler', cookie)).gaps, [])

    // Dispose the actual Worker before crossing both the lead boundary and the due day.
    await h.stop()
    h = await harness({ installation: initial.installation, vars: initial.vars, clockInstant: resumed })
    cookie = await h.signIn(initial.vars.OWNER_EMAIL)
    assert.deepEqual(await h.api('work', cookie), [], 'restart itself has not manually generated work')
    assert.equal((await h.api('schedules', cookie))[0].next_due_date, due)
    await h.scheduled(cron)
    const work = await h.api('work', cookie)
    assert.equal(work.length, 1, 'the first scheduled event after downtime creates exactly one order')
    const order = await h.api(`work/${work[0].id}`, cookie)
    assert.deepEqual([order.schedule_id, order.occurrence, order.due_date, order.created_by, order.created_at, order.assignee_id],
      [schedule, occurrence, due, 'scheduler', resumed, owner])
    assert.deepEqual([order.checklist_revision_id, order.checklist_revision, order.items.map(item => item.text)],
      [checklist.revision, 1, instructions], 'the generated order retains the original checklist revision and instructions')
    const gap = { until: resumed, minutes: (resumed - before) / 60_000 }
    const health = await h.api('scheduler', cookie)
    assert.deepEqual(health.gaps, [gap], 'the missed interval is retained, rather than reset by restart')
    assert.equal(health.lastRun, resumed)
    assert.equal(health.runs[0].created, 1)
    assert.deepEqual(health.late.map(row => [row.id, row.occurrence, row.due_date, row.issued_on]),
      [[order.id, occurrence, due, '2030-05-02']], 'late issue retains the original due occurrence')
    const events = (await h.api('audit?action=workorder.schedule', cookie)).rows
    assert.equal(events.length, 1)
    assert.deepEqual([events[0].actor, events[0].subject, JSON.parse(events[0].detail).occurrence], ['scheduler', order.id, occurrence])
    const lineage = JSON.parse(events[0].detail)
    const job = await h.api(`automation/jobs?job=${lineage.automation.job}`, cookie)
    assert.deepEqual([job.source, job.rule_id, job.state, job.input.schedules[0].id, job.input.schedules[0].revision],
      ['cron', 'pm', 'completed', schedule, lineage.revision])

    // A later master revision must not change the already accepted order on another restart.
    await h.api('checklist.revise', cookie, { checklist: checklist.id, items: [...instructions, 'Inspect the new guard'], note: 'Future inspections only' })
    await h.stop()
    h = await harness({ installation: initial.installation, vars: initial.vars, clockInstant: restarted })
    cookie = await h.signIn(initial.vars.OWNER_EMAIL)
    await h.scheduled(cron)
    await h.scheduled(cron)
    assert.deepEqual((await h.api('work', cookie)).map(row => row.id), [order.id], 'two restarts and a scheduled retry never duplicate the occurrence')
    assert.deepEqual(await h.api(`work/${order.id}`, cookie), { ...order, chase: { ...order.chase, overdue_days: 2 } },
      'restart and newer checklist preserve accepted work; only elapsed overdue age advances')
    const retained = await h.api('scheduler', cookie)
    assert.ok(retained.gaps.some(row => row.until === gap.until && row.minutes === gap.minutes), 'the earlier missed-run debt remains visible after the second restart')
    assert.deepEqual(retained.late, health.late, 'the original late issue is retained, not dated to the latest restart')
    assert.equal(retained.runs.reduce((total, row) => total + row.created, 0), 1)
    assert.equal((await h.api('audit?action=workorder.schedule', cookie)).rows.length, 1)
    assert.deepEqual((await h.api('audit?action=workorder.generate', cookie)).rows, [], 'no manual generation door was invoked')
    await restartScreens(h, cookie, order, gap, instructions)
    console.log(`PROBE PM-001 1: schedule form, cron before lead boundary, Worker stop, restart across due day twice -> one order ${order.id}, occurrence ${occurrence}, due ${due}, checklist revision 1, scheduler attribution`)
    console.log(`PROBE PM-001 2: work and scheduler JSON plus schedules page -> retained ${gap.minutes}-minute gap and original late issue on 2030-05-02; no manual generation`)
  } finally {
    await h.stop()
    await initial.close()
  }
}

async function restartScreens(h, cookie, order, gap, instructions) {
  const directory = process.env.PM_RESTART_SCREENSHOTS
  if (directory) await mkdir(directory, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.GASKET_CHROMIUM ? { executablePath: process.env.GASKET_CHROMIUM } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 } })
    await context.addCookies(cookie.split('; ').map(pair => {
      const at = pair.indexOf('=')
      return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin }
    }))
    const page = await context.newPage()
    assert.equal((await page.goto(h.origin + '/app/schedules')).status(), 200)
    const scheduler = page.locator('#scheduler')
    assert.match(await scheduler.innerText(), new RegExp(`Not running for ${gap.minutes} minutes`))
    assert.match(await scheduler.innerText(), /Issued late/)
    assert.equal(await scheduler.getByRole('link', { name: order.title, exact: true }).getAttribute('href'), `/app/work/${order.id}`)
    if (directory) {
      await page.screenshot({ path: join(directory, 'schedules-1440.png'), fullPage: true })
      await page.setViewportSize({ width: 390, height: 1100 })
      await page.screenshot({ path: join(directory, 'schedules-390.png'), fullPage: true })
    }
    await page.setViewportSize({ width: 1440, height: 1100 })
    await scheduler.getByRole('link', { name: order.title, exact: true }).click()
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), order.asset_name)
    assert.equal(await page.locator('#task p').first().innerText(), order.title)
    for (const instruction of instructions) assert.ok((await page.getByRole('main').innerText()).includes(instruction))
    assert.match(await page.getByRole('main').innerText(), /Revision 1/i)
    if (directory) {
      await page.screenshot({ path: join(directory, 'work-1440.png'), fullPage: true })
      await page.setViewportSize({ width: 390, height: 1100 })
      await page.screenshot({ path: join(directory, 'work-390.png'), fullPage: true })
    }
    await context.close()
  } finally { await browser.close() }
}
