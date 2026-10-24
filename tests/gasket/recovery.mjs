import { fileURLToPath } from 'node:url'
// Portable inactive recovery through supported commands and authenticated HTTP.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { harness } from './harness.mjs'
import { installation } from './installation.mjs'

export async function recoveryJourney() {
  const h = await harness(), target = await installation(), corruptTarget = await installation()
  try {
    const owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Recovery estate', timezone: 'UTC' })
    const asset = (await h.api('asset.create', owner, { tag: 'synthetic-gasket-recovery', name: 'Recovery pump', location: 'Plant' })).id
    const checklist = (await h.api('checklist.create', owner, { name: 'Recovery inspection', items: ['Listen for noise'] })).id
    const today = (await h.api('me', owner)).today
    await h.api('schedule.create', owner, { asset, checklist, title: 'Recovery PM', everyDays: 30, firstDue: today })
    const subscription = await h.api('webhook.subscribe', owner, { name: 'Recovery receiver', endpoint: 'https://receiver.example.test/recovery', events: ['work.changed'] })
    await h.api('webhook.control', owner, { subscription: subscription.id, revision: 1, paused: false, reason: 'Receiver confirmed' })
    const accepted = await h.api('workorder.create', owner, { asset, title: 'Accepted before backup', due: today })
    const sourceSchedule = await h.api('schedules', owner)
    const sourceRules = (await h.api('automation' + '/jobs', owner)).rules
    await h.stop()
    const archive = join(h.installation.root, 'exports', 'recovery.rer')
    await h.installation.rer('export', '--output', archive)
    const bytes = await readFile(archive)
    assert.ok(!bytes.includes(Buffer.from(subscription.secret)), 'the one-time signing key is absent')
    const records = bytes.toString().trim().split('\n').map(line => JSON.parse(line))
    const subscriptions = records.flatMap(record => record.items ?? []).filter(item => item.kind === 'row' && item.table === 'gk_connector_subscriptions')
    assert.equal(subscriptions.length, 1)
    assert.equal(subscriptions[0].row.secret_cipher, '', 'encrypted signing keys are also excluded')
    assert.ok(!records[0].tables.some(table => ['oa_sessions','oa_tokens','oa_credentials'].includes(table.name)))
    const damaged = join(h.installation.root, 'damaged.rer')
    await writeFile(damaged, bytes.subarray(0, Math.floor(bytes.length / 2)))
    await assert.rejects(corruptTarget.rer('import', '--input', damaged, '--yes'))
    // A clean import succeeds after the rejected corrupt attempt.
    await corruptTarget.rer('import', '--input', archive, '--yes')
    await target.rer('import', '--input', archive, '--yes')
    const restored = await harness({ vars: h.vars, installation: target })
    try {
      assert.equal((await restored.raw('/api/gasket/me', { cookie: owner })).status, 401, 'source sessions are excluded')
      const signed = await restored.signIn(h.vars.OWNER_EMAIL)
      assert.equal((await restored.raw('/setup', { cookie: signed, form: new URLSearchParams({ confirm: 'yes' }) })).status, 303)
      const schedules = await restored.api('schedules', signed)
      assert.ok(schedules.length); assert.ok(schedules.every(row => !row.active))
      assert.ok((await restored.api('automation' + '/jobs', signed)).rules.every(row => row.paused))
      const connector = (await restored.api('connectors', signed)).subscriptions.find(row => row.id === subscription.id)
      assert.equal(connector.paused, true)
      const before = await restored.api('work?state=open', signed)
      assert.ok(before.some(row => row.id === accepted.id))
      const mailCount = restored.mails.length
      await restored.scheduled('*/15 * * * *')
      assert.deepEqual(await restored.api('work?state=open', signed), before, 'restored PMs create no work')
      assert.equal(restored.mails.length, mailCount, 'restored jobs send no mail')
      if (process.env.GASKET_RECOVERY_SCREENSHOTS) {
        const { chromium } = await import('@playwright/test')
        const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain','--password-store=basic'] })
        try {
          for (const width of [1440,390]) {
            const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 1000 } })
            await context.addCookies(signed.split('; ').map(pair => { const at=pair.indexOf('='); return { name:pair.slice(0,at),value:pair.slice(at+1),url:restored.origin } }))
            const page = await context.newPage()
            for (const [name,path] of [['automation','/app/automation'],['schedules','/app/schedules']]) {
              await page.goto(restored.origin + path)
              await page.getByRole('heading', { name: name === 'automation' ? 'Automation' : 'Schedules', exact: true, level: 1 }).waitFor()
              await page.evaluate(async () => { await document.fonts.ready })
              assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} fits ${width}`)
              await page.screenshot({ path: `${process.env.GASKET_RECOVERY_SCREENSHOTS}/${name}-${width}.png`, fullPage: true })
            }
            await context.close()
          }
        } finally { await browser.close() }
      }
      await restored.stop()
      await assert.rejects(target.rer('import', '--input', archive, '--yes'), /empty|occupied|not_empty/)
      const unchanged = await harness({ vars: h.vars, installation: target })
      try {
        const stillOwner = await unchanged.signIn(h.vars.OWNER_EMAIL)
        assert.deepEqual(await unchanged.api('work?state=open', stillOwner), before, 'nonempty refusal writes no work')
        assert.deepEqual(await unchanged.api('schedules', stillOwner), schedules, 'nonempty refusal changes no PMs')
      } finally { await unchanged.close() }
    } finally { await restored.close() }
    const source = await harness({ vars: h.vars, installation: h.installation })
    try {
      const signed = await source.signIn(h.vars.OWNER_EMAIL)
      assert.deepEqual(await source.api('schedules', signed), sourceSchedule, 'export leaves source schedules active')
      assert.deepEqual((await source.api('automation' + '/jobs', signed)).rules, sourceRules)
    } finally { await source.close() }
    console.log('Inactive recovery: corrupt refusal, clean restore, excluded sessions, preserved work, paused PMs and connectors, and nonempty refusal passed')
  } finally { await h.close(); await target.remove(); await corruptTarget.remove() }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await recoveryJourney()
