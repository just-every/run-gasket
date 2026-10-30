import { printPackFixture, paperPayload } from './print-packs.mjs'
import { erasureFixture, eraseFixture } from './record-erasure.mjs'
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
    const asset = (await h.api('asset.create', owner, { tag: 'synthetic-gasket-recovery', name: 'Recovery pump', serial: 'R-150', model: 'P-150', location: 'Plant' })).id
    await h.submit('asset.update', lead, { asset, revision: 1, tag: 'synthetic-gasket-recovery', name: 'Recovery pump', serial: 'R-150', model: 'P-175', location: 'Plant' }, `/app/assets/${asset}`)
    const bearing = (await h.api('part.create', lead, { number: 'synthetic-gasket-bearing', name: 'Recovery bearing', unit: 'each' })).id
    const alternate = (await h.api('part.create', lead, { number: 'synthetic-gasket-alternate', name: 'Recovery substitute', unit: 'each' })).id
    await h.api('part.receive', lead, { part: alternate, quantity: '3' })
    const applicability = { asset, part: [bearing], quantity: ['1'], serialFrom: ['R-100'], serialTo: ['R-199'], modelFrom: ['P-100'], modelTo: ['P-199'], alternateFor: [bearing], alternate: [alternate], alternateFrom: ['R-100'], alternateTo: ['R-199'], alternateModelFrom: ['P-100'], alternateModelTo: ['P-199'], tool: ['Bearing puller'] }
    await h.api('bom.revise', lead, { ...applicability, note: 'Original model approval' })
    await h.api('bom.revise', lead, { ...applicability, revision: 1, quantity: ['2'], note: 'Two bearings per repair' })
    const modelFacts = async (client, signed) => {
      const row = await client.api(`assets/${asset}`, signed)
      return { model: row.model, serial: row.serial, versions: row.versions, bom: row.bom }
    }
    const checklist = (await h.api('checklist.create', owner, { name: 'Recovery inspection', items: ['Listen for noise'] })).id
    const today = (await h.api('me', owner)).today
    const member=(await h.api('me',owner)).id
    const qualification={member,name:'Recovery training',expires:today,reference:'synthetic-gasket-retired-reference',remind:true,remindDays:1}
    await h.api('planning.qualification',owner,qualification)
    const expiryGrant=(await h.api('automation',owner)).rules.find(r=>r.id==='expiry')
    const expiryJob=await h.api('automation.catchup',owner,{rule:'expiry',revision:expiryGrant.revision})
    const reminderEvidence=(await h.api(`/automation/jobs?job=${expiryJob.job}`,owner)).input.qualificationReminders
    assert.equal(reminderEvidence.qualifications[0].expires_on,today)
    assert.equal(reminderEvidence.qualifications[0].remind_days,1)
    assert.equal(reminderEvidence.qualifications[0].consent,1)
    assert.equal(expiryJob.output.notices.filter(n=>n.kind==='qualification_expiry').length,1)
    await h.api('planning.retire',owner,{kind:'qualification',member,name:qualification.name,reason:'Reference withdrawn before backup',revision:(await h.api('planning',owner)).revision})
    const resourceTool=(await h.api('planning.tool',owner,{name:'Recovery gauge',identifier:'synthetic-gasket-retired-tool',calibrationDue:'2099-12-31',revision:(await h.api('planning',owner)).revision})).id
    await h.api('planning.retire',owner,{kind:'tool',id:resourceTool,reason:'Gauge withdrawn before backup',revision:(await h.api('planning',owner)).revision})
    const retiredResources=(await h.api('planning',owner)).retired
    const recoveryLead=(await h.api('members',owner)).find(m=>m.role==='lead').id
    const direct=(await h.api('conversation.start',owner,{member:recoveryLead})).id
    const directSubmission={conversation:direct,submissionKey:randomUUID(),body:'synthetic-gasket-recovery-message'}
    const directMessage=(await h.api('message.send',owner,directSubmission)).message
    await h.api('conversation.read',lead,{conversation:direct,through:directMessage.seq})
    await h.api('message.send',lead,{conversation:direct,submissionKey:randomUUID(),body:'synthetic-gasket-recovery-reply'})
    const directOwner=await h.api(`conversations/${direct}`,owner)
    const directLead=await h.api(`conversations/${direct}`,lead)
    assert.equal(directOwner.unread,1)
    assert.equal(directLead.unread,0)
    const stewardship=(await h.api('planning.grant',owner,{grantee:recoveryLead,site:'primary',kind:'tool',target:'',name:'Recovery gauge',revision:0,enabled:true,consent:true,reason:'Maintain the recovery gauge'})).id
    await h.api('schedule.create', owner, { asset, checklist, title: 'Recovery PM', everyDays: 30, firstDue: today })
    const credential = await h.api('service.create', owner, { name: 'Synthetic recovery service', scopes: ['assets:read'], expiresAt: Date.now() + 30 * 86400_000, consent: true })
    const subscription = await h.api('webhook.subscribe', owner, { name: 'Recovery receiver', endpoint: 'https://receiver.example.test/recovery', events: ['work.changed'] })
    await h.api('webhook.control', owner, { subscription: subscription.id, revision: 1, paused: false, reason: 'Receiver confirmed' })
    const accepted = await h.api('workorder.create', owner, { asset, title: 'Accepted before backup', due: today, assignee: (await h.api('me', owner)).id })
    await h.api('workorder.reserve', lead, { workOrder: accepted.id, part: alternate, insteadOf: bearing, quantity: '2' })
    const retainedModels = await modelFacts(h, owner)
    const retainedReservations = (await h.api(`work/${accepted.id}`, owner)).reservations
    assert.deepEqual([retainedModels.model, retainedModels.versions[0].value.model], ['P-175', 'P-150'])
    assert.deepEqual(retainedModels.bom.revisions.map(row => [row.number, row.createdBy, row.lines[0].model_from, row.alternates[0].model_to]), [[2, 'Recovery lead', 'P-100', 'P-199'], [1, 'Recovery lead', 'P-100', 'P-199']])
    const workPhoto = (await h.api('workorder.evidence', owner, { workOrder: accepted.id, version: 1, file: file('synthetic-gasket-private-photo.png', png, 'image/png') })).evidence
    const portal = (await h.api('request.portal', owner, { name: 'Recovery intake', fields: [] })).id
    const intakeTarget = (await h.api('request.target', owner, { portal, kind: 'asset', asset, name: 'Recovery pump', publishConsent: true })).id
    assert.equal((await h.raw(`/request/${portal}`, { cookie: owner, body: { target: intakeTarget, submissionKey: randomUUID(), description: 'synthetic-gasket-private-fault', urgency: 'normal', contact: 'synthetic-gasket-private-contact', photo: file('request.png', png, 'image/png') } })).status, 303)
    const request = (await h.api('search?kind=request&q=synthetic-gasket-private-fault', owner)).rows[0].id
    const photo = (await h.api(`requests/${request}`, owner)).files[0].id
    const sourceSchedule = await h.api('schedules', owner)
    const sourceRules = (await h.api('automation' + '/jobs', owner)).rules
    const paperWork=await printPackFixture(h,owner,member)
    const paperPack=(await h.api('printpack.issue',owner,{workOrder:paperWork.work,version:1})).id
    const paperPdf=Buffer.from(await (await h.raw(`/app/print-packs/${paperPack}/pack.pdf`,{cookie:owner})).arrayBuffer())
    const paperPreview=(await h.api('printpack.preview',owner,paperPayload(paperWork,paperPack,`${today}T00:00`))).id
    const paperDraft=await h.api(`print-previews/${paperPreview}`,owner)
    const paperAccept={preview:paperPreview,digest:paperDraft.digest,confirm:true}
    const paperReceipt=(await h.api('printpack.accept',owner,paperAccept)).receipt
    const erasedRecords=await erasureFixture(h,owner,asset)
    const paperSnapshot=await h.api(`work/${paperWork.work}`,owner)
    await h.stop()
    const archive = join(h.installation.root, 'exports', 'recovery.rer')
    await h.installation.rer('export', '--output', archive)
    const bytes = await readFile(archive)
    assert.ok(!bytes.includes(Buffer.from(subscription.secret)), 'the one-time signing key is absent')
    assert.ok(!bytes.includes(Buffer.from(credential.token)), 'service bearer secrets are absent from exports')
    const records = bytes.toString().trim().split('\n').map(line => JSON.parse(line))
    for(const table of ['gk_print_packs','gk_print_previews','gk_print_entries','gk_conversations','gk_messages','gk_message_reads']) assert.ok(records[0].tables.some(row=>row.name===table),'the archive inventories direct messaging records')
    const archivedMessages=records.flatMap(record=>record.items??[]).filter(item=>item.kind==='row'&&item.table==='gk_messages')
    assert.deepEqual(archivedMessages.map(item=>item.row.body).sort(),['synthetic-gasket-recovery-message','synthetic-gasket-recovery-reply'])
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
      assert.equal((await restored.raw('/api/gasket/v1/assets', { headers: { authorization: `Bearer ${credential.token}` } })).status, 401, 'restore never reactivates a source service credential')
      const signed = await restored.signIn(h.vars.OWNER_EMAIL)
      assert.equal((await restored.raw('/setup', { cookie: signed, form: new URLSearchParams({ confirm: 'yes' }) })).status, 303)
      assert.deepEqual(Buffer.from(await (await restored.raw(`/app/request-files/${photo}`, { cookie: signed })).arrayBuffer()), png, 'restored original attachment bytes reconcile')
      assert.equal((await restored.api('service-credentials', signed)).find(row => row.id === credential.id).revoked_at, 0)
      assert.deepEqual(await modelFacts(restored, signed), retainedModels, 'inactive restore preserves model identity history and both BOM restriction revisions with attribution')
      assert.deepEqual((await restored.api(`work/${accepted.id}`, signed)).reservations, retainedReservations, 'inactive restore preserves approved substitute commitments')
      const mismatched = (await restored.api('asset.create', signed, { tag: 'synthetic-gasket-mismatch', name: 'Different recovery model', serial: 'R-150', model: 'P-250', location: 'Plant' })).id
      await restored.api('bom.revise', signed, { ...applicability, asset: mismatched })
      const refusedWork = (await restored.api('workorder.create', signed, { asset: mismatched, title: 'Restored model refusal', due: today, assignee: member })).id
      const beforeRefusal = { parts: await restored.api('parts', signed), work: await restored.api(`work/${refusedWork}`, signed) }
      assert.equal((await restored.api('workorder.reserve', signed, { workOrder: refusedWork, part: alternate, insteadOf: bearing, quantity: '1' }, 409)).error, 'substitute_not_compatible')
      assert.deepEqual({ parts: await restored.api('parts', signed), work: await restored.api(`work/${refusedWork}`, signed) }, beforeRefusal)
      console.log('PROBE ASSET-006 inactive restore: rer export and import then authenticated JSON -> model history, BOM restrictions and substitute reservations reconcile; mismatched reservation remains refused without effects')

      assert.equal((await restored.raw(`/app/print-packs/${paperPack}/pack.pdf`,{cookie:owner})).status,303,'source sessions cannot open restored packs')
      assert.deepEqual(Buffer.from(await (await restored.raw(`/app/print-packs/${paperPack}/pack.pdf`,{cookie:signed})).arrayBuffer()),paperPdf,'immutable pack bytes reconcile after inactive restore')
      assert.deepEqual(Buffer.from(await (await restored.raw(`/app/print-previews/${paperPreview}/original`,{cookie:signed})).arrayBuffer()),png,'the original paper bytes and digest reconcile')
      assert.deepEqual((await restored.api('printpack.accept',signed,paperAccept)).receipt,paperReceipt,'durable receipt survives restore and makes a replay inert')
      assert.deepEqual(await restored.api(`work/${paperWork.work}`,signed),paperSnapshot,'restore and replay duplicate no result or original')
      const restoredPlanning=await restored.api('planning',signed)
      const restoredGrant=(await restored.api('resource-records',signed)).grants.find(g=>g.id===stewardship)
      assert.equal(restoredGrant.active,0,'restoring an archive never reactivates stewardship')
      assert.equal(restoredGrant.effective,0)
      const restoredLead=await restored.signIn((await restored.api('members',signed)).find(m=>m.id===recoveryLead).email)
      assert.equal((await restored.raw(`/api/gasket/conversations/${direct}`,{cookie:owner})).status,401,'a source session cannot read restored messages')
      assert.deepEqual(await restored.api(`conversations/${direct}`,signed),directOwner,'restored originals and owner unread state reconcile')
      assert.deepEqual(await restored.api(`conversations/${direct}`,restoredLead),directLead,'each participant keeps their independent read marker')
      const restoredReplay=await restored.api('message.send',signed,directSubmission)
      assert.equal(restoredReplay.replayed,true)
      assert.deepEqual(restoredReplay.message,directMessage,'restoration preserves durable submission identity without a second message')
      assert.equal((await restored.api('audit?action=message.send',signed)).rows.length,2)
      await restored.api('planning.tool',restoredLead,{name:'Recovery gauge',identifier:'synthetic-gasket-restore-denied',calibrationDue:'2099-12-31',revision:restoredPlanning.revision},403)
      assert.deepEqual(restoredPlanning.retired,retiredResources,'retired evidence and attribution reconcile after empty restore')
      assert.deepEqual((await restored.api(`/automation/jobs?job=${expiryJob.job}`,signed)).input.qualificationReminders,reminderEvidence,'qualification reminder inputs survive retirement and inactive empty restore')
      assert.deepEqual(restoredPlanning.qualifications,[],'retired qualification is not restored into eligibility')
      assert.deepEqual(restoredPlanning.tools,[],'retired tool is not restored into eligibility')
      assert.equal((await restored.api('audit?action=planning.retire',signed)).rows.length,2)
      await restored.api('planning.tool',signed,{id:resourceTool,name:'Recovery gauge',identifier:'synthetic-gasket-retired-tool',calibrationDue:'2099-12-31',revision:restoredPlanning.revision},404)
      const recovery = await restored.api('recovery', signed)
      assert.equal(recovery.restore.kind, 'restore')
      assert.equal(recovery.restore.recovery_point, records[0].exportedAt)
      assert.equal(recovery.restore.content_hash, records.at(-1).contentHash)
      assert.equal(recovery.restore.archive_hash, records.at(-1).archiveHash)
      assert.equal(recovery.drill, null, 'an import does not claim a verified drill')
      await restored.api('recovery.drill', signed, { receipt: recovery.restore.id }, 400)
      await restored.submit('recovery.drill', signed, { receipt: recovery.restore.id, confirm: 'yes' }, '/app/automation')
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
        assert.deepEqual((await unchanged.api('printpack.accept',stillOwner,paperAccept)).receipt,paperReceipt,'paper receipt remains durable after restored Worker restart')
        assert.deepEqual(await unchanged.api(`conversations/${direct}`,stillOwner),directOwner,'restored messaging remains durable after another Worker restart')
        assert.deepEqual(await unchanged.api('work?state=open', stillOwner), before, 'nonempty refusal writes no work')
        assert.deepEqual(await unchanged.api('schedules', stillOwner), schedules, 'nonempty refusal changes no PMs')
      } finally { await unchanged.close() }
    } finally { await restored.close() }
    let source = await harness({ vars: h.vars, installation: h.installation })
    try {
      const signed = await source.signIn(h.vars.OWNER_EMAIL)
      assert.deepEqual(await source.api(`conversations/${direct}`,signed),directOwner,'export leaves source messages and read state unchanged')
      const backup = await source.api('recovery', signed)
      assert.equal(backup.backup.kind, 'backup')
      assert.equal(backup.backup.recovery_point, records[0].exportedAt)
      assert.equal(backup.backup.content_hash, records.at(-1).contentHash)
      assert.equal(backup.restore, null)
      assert.equal(backup.drill, null)
      assert.ok(Number.isFinite(backup.backupAgeMinutes))
      if (process.env.GASKET_RECOVERY_SCREENSHOTS) await backupBrowser(source, signed)
      assert.deepEqual(await source.api('schedules', signed), sourceSchedule, 'export leaves source schedules active')
      assert.deepEqual((await source.api('automation' + '/jobs', signed)).rules, sourceRules)
      const retiredQualification=(await source.api('planning',signed)).retired.find(r=>r.kind==='qualification')
      const qualificationPreview=await source.api(`retention-preview?kind=qualification&id=${retiredQualification.id}`,signed)
      assert.equal(qualificationPreview.eligible,true)
      assert.equal(qualificationPreview.dependencies.reminders,1)
      const qualificationErased=await source.api('qualification.erase',signed,{id:retiredQualification.id,revision:qualificationPreview.revision,confirm:true})
      await source.stop()
      const qualificationArchive=join(h.installation.root,'exports','qualification-erased.rer')
      await h.installation.rer('export','--output',qualificationArchive)
      const qualificationBytes=await readFile(qualificationArchive)
      assert.ok(!qualificationBytes.includes(Buffer.from(qualification.reference)),'qualification erasure alone removes reference bytes')
      assert.ok(!qualificationBytes.includes(Buffer.from(qualification.name)),'qualification erasure removes stored reminder text and correction copies')
      const qualificationFence=await installation()
      try {
        await copyFile(qualificationArchive,join(qualificationFence.root,'qualification-journal.rer'))
        await chmod(join(qualificationFence.root,'qualification-journal.rer'),0o600)
        await assert.rejects(qualificationFence.rer('import','--input',archive,'--journal','qualification-journal.rer','--yes'),/erasure_epoch/,'qualification erasure alone fences an older archive')
      } finally {await qualificationFence.remove()}
      source=await harness({vars:h.vars,installation:h.installation})
      const continued=await source.signIn(h.vars.OWNER_EMAIL)
      const retainedBackup=(await source.api('recovery',continued)).backup
      await eraseFixture(source,continued,erasedRecords)
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
        assert.deepEqual((await reopened.api('recovery', checkOwner)).backup, retainedBackup, 'refused export does not advance backup freshness')
      } finally { await reopened.close() }
      const later = join(h.installation.root, 'exports', 'after-erasure.rer')
      await h.installation.rer('export', '--output', later)
      const afterBytes = await readFile(later)
      for (const text of ['synthetic-gasket-erased-person','synthetic-gasket-erased@example.test','synthetic-gasket-erased-work','synthetic-gasket-erased-description','synthetic-gasket-erased-original.png','synthetic-gasket-erased-second.png','synthetic-gasket-erased-comment']) assert.ok(!afterBytes.includes(Buffer.from(text)),`archive removes ${text}`)
      assert.ok(!afterBytes.includes(Buffer.from(qualification.reference)), 'erased qualification references are absent from archive bytes')
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
          await clean.api(`work/${erasedRecords.work}`,cleanOwner,undefined,404)
          assert.equal((await clean.raw(`/app/evidence/${erasedRecords.photo}`,{cookie:cleanOwner})).status,404)
          const person=(await clean.api('members',cleanOwner)).find(row=>row.id===erasedRecords.person)
          assert.deepEqual([person.name,person.status],['Erased user','ended'])
          assert.equal((await clean.api(`record-erasure-preview?kind=user&id=${erasedRecords.person}`,cleanOwner)).erased,true)
          assert.deepEqual((await clean.api(`retention-preview?kind=qualification&id=${retiredQualification.id}`,cleanOwner)).result,qualificationErased.result,'restored erasure result is durable')
          const planning=await clean.api('planning',cleanOwner)
          assert.deepEqual(planning.qualifications,[],'erased references never regain eligibility')
          assert.deepEqual(planning.retired.map(r=>r.kind),['tool'],'erased personal reference does not return; tool history remains')
          assert.ok(!JSON.stringify((await clean.api('audit',cleanOwner)).rows).includes(qualification.reference),'restored audit remains anonymized')
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


export async function backupBrowser(h, cookie) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain','--password-store=basic'] })
  try {
    for (const width of [1440,390]) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 1000 } })
      await context.addCookies(cookie.split('; ').map(pair => { const at=pair.indexOf('='); return { name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin } }))
      const page = await context.newPage()
      await page.goto(h.origin + '/app/automation')
      await page.getByRole('heading', { name: 'Backup and recovery', exact: true }).waitFor()
      const recovery = await h.api('recovery', cookie)
      assert.ok(recovery.backup)
      assert.ok(!(await page.locator('main').innerText()).includes('No completed backup recorded'))
      await page.evaluate(async () => { await document.fonts.ready })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `backup reporting fits ${width}`)
      await page.screenshot({ path: `${process.env.GASKET_RECOVERY_SCREENSHOTS}/backup-${width}.png`, fullPage: true })
      await context.close()
    }
  } finally { await browser.close() }
}
