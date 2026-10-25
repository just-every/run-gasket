import { fileURLToPath } from 'node:url'
// Portable inactive recovery through supported commands and authenticated HTTP.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFile, writeFile, copyFile, chmod } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { harness, file } from './harness.mjs'
import { png } from './fixtures.mjs'
import { installation } from './installation.mjs'

export async function recoveryJourney() {
  const h = await harness(), target = await installation(), corruptTarget = await installation()
  try {
    const owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Recovery estate', timezone: 'UTC' })
    assert.deepEqual(await h.api('recovery', owner), { backup: null, restore: null, drill: null, backupAgeMinutes: null })
    assert.equal((await h.raw('/api/gasket/recovery')).status, 401)
    await h.api('access.give', owner, { name: 'Recovery lead', email: 'synthetic-gasket-recovery@example.test', role: 'lead' })
    const lead = await h.signIn('synthetic-gasket-recovery@example.test')
    await h.api('recovery', lead, undefined, 403)
    await h.api('recovery.drill', lead, { receipt: 'synthetic-gasket-1', confirm: true }, 403)
    const asset = (await h.api('asset.create', owner, { tag: 'synthetic-gasket-recovery', name: 'Recovery pump', location: 'Plant' })).id
    const checklist = (await h.api('checklist.create', owner, { name: 'Recovery inspection', items: ['Listen for noise'] })).id
    const today = (await h.api('me', owner)).today
    await h.api('schedule.create', owner, { asset, checklist, title: 'Recovery PM', everyDays: 30, firstDue: today })
    const subscription = await h.api('webhook.subscribe', owner, { name: 'Recovery receiver', endpoint: 'https://receiver.example.test/recovery', events: ['work.changed'] })
    await h.api('webhook.control', owner, { subscription: subscription.id, revision: 1, paused: false, reason: 'Receiver confirmed' })
    const accepted = await h.api('workorder.create', owner, { asset, title: 'Accepted before backup', due: today, assignee: (await h.api('me', owner)).id })
    const workPhoto = (await h.api('workorder.evidence', owner, { workOrder: accepted.id, version: 1, file: file('synthetic-gasket-private-photo.png', png, 'image/png') })).evidence
    const portal = (await h.api('request.portal', owner, { name: 'Recovery intake', fields: [] })).id
    const intakeTarget = (await h.api('request.target', owner, { portal, kind: 'asset', asset, name: 'Recovery pump', publishConsent: true })).id
    assert.equal((await h.raw(`/request/${portal}`, { cookie: owner, body: { target: intakeTarget, submissionKey: randomUUID(), description: 'synthetic-gasket-private-fault', urgency: 'normal', contact: 'synthetic-gasket-private-contact', photo: file('request.png', png, 'image/png') } })).status, 303)
    const request = (await h.api('search?kind=request&q=synthetic-gasket-private-fault', owner)).rows[0].id
    const photo = (await h.api(`requests/${request}`, owner)).files[0].id
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
      assert.deepEqual(Buffer.from(await (await restored.raw(`/app/request-files/${photo}`, { cookie: signed })).arrayBuffer()), png, 'restored original attachment bytes reconcile')
      const recovery = await restored.api('recovery', signed)
      assert.equal(recovery.restore.kind, 'restore')
      assert.equal(recovery.restore.recovery_point, records[0].exportedAt)
      assert.equal(recovery.restore.content_hash, records.at(-1).contentHash)
      assert.equal(recovery.restore.archive_hash, records.at(-1).archiveHash)
      assert.equal(recovery.drill, null, 'an import does not claim a verified drill')
      await restored.api('recovery.drill', signed, { receipt: recovery.restore.id }, 400)
      await restored.api('recovery.drill', signed, { receipt: recovery.restore.id, confirm: true })
      const drill = (await restored.api('recovery', signed)).drill
      assert.equal(drill.drill_by, (await restored.api('me', signed)).id)
      assert.ok(drill.drill_at)
      await restored.api('recovery.drill', signed, { receipt: recovery.restore.id, confirm: true })
      assert.equal((await restored.api('audit?action=recovery.drill', signed)).rows.length, 1, 'drill confirmation is idempotent')
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
              if (name === 'automation') {
                await page.getByRole('heading', { name: 'Backup and recovery', exact: true }).waitFor()
                assert.match(await page.locator('main').innerText(), /Last owner-confirmed restore drill/)
              }
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
      const backup = await source.api('recovery', signed)
      assert.equal(backup.backup.kind, 'backup')
      assert.equal(backup.backup.recovery_point, records[0].exportedAt)
      assert.equal(backup.backup.content_hash, records.at(-1).contentHash)
      assert.equal(backup.restore, null)
      assert.equal(backup.drill, null)
      assert.ok(Number.isFinite(backup.backupAgeMinutes))
      assert.deepEqual(await source.api('schedules', signed), sourceSchedule, 'export leaves source schedules active')
      assert.deepEqual((await source.api('automation' + '/jobs', signed)).rules, sourceRules)
      const current = await source.api(`requests/${request}`, signed)
      await source.api('request.erase', signed, { request, version: current.version, confirm: true })
      const erased = await source.api(`requests/${request}`, signed)
      assert.equal(erased.description, '', 'erasure removes private fault text')
      assert.equal(erased.contact, '', 'erasure removes contact text')
      assert.deepEqual(erased.files, [], 'erasure removes file records')
      assert.equal((await source.raw(`/app/request-files/${photo}`, { cookie: signed })).status, 404, 'erasure removes photo bytes')
      const attachment = await source.api(`retention-preview?kind=attachment&id=${workPhoto}`, signed)
      assert.equal(attachment.eligible, true)
      await source.api('attachment.erase', signed, { evidence: workPhoto, version: attachment.version, confirm: true })
      assert.equal((await source.raw(`/app/evidence/${workPhoto}`, { cookie: signed })).status, 404)
      await source.stop()
      await assert.rejects(h.installation.rer('export', '--output', archive))
      const reopened = await harness({ vars: h.vars, installation: h.installation })
      try {
        const checkOwner = await reopened.signIn(h.vars.OWNER_EMAIL)
        assert.deepEqual((await reopened.api('recovery', checkOwner)).backup, backup.backup, 'refused export does not advance backup freshness')
      } finally { await reopened.close() }
      const later = join(h.installation.root, 'exports', 'after-erasure.rer')
      await h.installation.rer('export', '--output', later)
      const afterBytes = await readFile(later)
      assert.ok(!afterBytes.includes(Buffer.from('synthetic-gasket-private-fault')), 'anonymous archive contains no erased fault')
      assert.ok(!afterBytes.includes(Buffer.from('synthetic-gasket-private-photo.png')), 'work attachment filename is absent from the later archive')
      assert.ok(!afterBytes.includes(Buffer.from('synthetic-gasket-private-contact')), 'anonymous archive contains no erased contact')
      const fenced = await installation()
      try {
        const journal = join(fenced.root, 'later-erasure.rer')
        await copyFile(later, journal)
        await chmod(journal, 0o600)
        await assert.rejects(fenced.rer('import', '--input', archive, '--journal', 'later-erasure.rer', '--yes'), /erasure_epoch/, 'a later erasure journal blocks an older archive before publication')
        await fenced.rer('import', '--input', later, '--yes')
        const clean = await harness({ vars: h.vars, installation: fenced })
        try {
          const cleanOwner = await clean.signIn(h.vars.OWNER_EMAIL)
          assert.equal((await clean.raw('/setup', { cookie: cleanOwner, form: new URLSearchParams({ confirm: 'yes' }) })).status, 303)
          const retained = await clean.api(`requests/${request}`, cleanOwner)
          assert.equal((await clean.raw(`/app/evidence/${workPhoto}`, { cookie: cleanOwner })).status, 404, 'erased work attachment never reappears after restore')
          assert.equal((await clean.api(`retention-preview?kind=attachment&id=${workPhoto}`, cleanOwner)).erased, true)
          assert.equal(retained.description, '', 'erased fault never reappears after restore')
          assert.equal(retained.contact, '', 'erased contact never reappears after restore')
          assert.deepEqual(retained.files, [], 'erased photo never reappears after restore')
        } finally { await clean.close() }
      } finally { await fenced.remove() }

    } finally { await source.close() }
    console.log('Inactive recovery: corrupt refusal, clean restore, excluded sessions, preserved work, paused PMs and connectors, and nonempty refusal passed')
  } finally { await h.close(); await target.remove(); await corruptTarget.remove() }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await recoveryJourney()
