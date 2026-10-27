// Public API retries and pagination run against the built Worker and persisted D1.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { harness, file } from './harness.mjs'
import { png } from './fixtures.mjs'

export async function apiJourney() {
  const h = await harness({ clockInstant: Date.UTC(2026, 9, 26, 16) })
  let resumed
  try {
    let owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Synthetic API estate', timezone: 'UTC' })
    const member = (await h.api('access.give', owner, { name: 'Synthetic API lead', email: 'synthetic-gasket-api@example.test', role: 'lead' })).id
    const lead = await h.signIn('synthetic-gasket-api@example.test')
    const write = async (action, body, key, cookie = owner, status = 200, legacy = false) => {
      const response = await h.raw(`/api/gasket/${legacy ? '' : 'v1/'}${action}`, { cookie, body, headers: { 'idempotency-key': key } })
      const result = await response.json()
      assert.equal(response.status, status, JSON.stringify(result))
      return { result, replayed: response.headers.get('idempotency-replayed') }
    }
    const specification = JSON.parse(readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'))
    const example = action => structuredClone(specification.paths['/' + action].post.requestBody.content[['application', 'json'].join('/')].example)
    const repeat = async (action, body, key, cookie = owner) => {
      const first = await write(action, body, key, cookie)
      const again = await write(action, body, key, cookie)
      assert.equal(first.replayed, 'false')
      assert.equal(again.replayed, 'true')
      assert.deepEqual(again.result, first.result)
      return first.result
    }
    const assetBody = { tag: 'synthetic-gasket-api-0', name: 'Synthetic API pump', location: 'Synthetic plant' }
    const original = await write('asset.create', assetBody, 'synthetic-gasket-1')
    // Deliberately discard the response as a buyer would after a network timeout.
    const replay = await write('asset.create', assetBody, 'synthetic-gasket-1', owner, 200, true)
    assert.deepEqual(replay.result, original.result); assert.equal(replay.replayed, 'true'); assert.equal(original.replayed, 'false')
    await write('asset.create', { ...assetBody, name: 'Different payload' }, 'synthetic-gasket-1', owner, 409)
    const asset = original.result.id
    const changed = await write('asset.update', { ...assetBody, asset, revision: 1, name: 'Synthetic updated pump' }, 'synthetic-gasket-update')
    assert.equal(changed.result.revision, 2)
    assert.deepEqual((await write('asset.update', { ...assetBody, asset, revision: 1, name: 'Synthetic updated pump' }, 'synthetic-gasket-update')).result, changed.result)
    const detail = await h.api(`/v1/assets/${asset}`, owner)
    assert.equal(detail.name, 'Synthetic updated pump'); assert.equal(detail.versions.length, 1)
    assert.equal(detail.versions[0].revision, 1)
    assert.deepEqual(await h.api(`assets/${asset}`, owner), detail)
    await write('asset.create', { ...assetBody, tag: 'synthetic-gasket-other-actor' }, 'synthetic-gasket-1', lead)
    const concurrentBody = { number: 'synthetic-gasket-api-0', name: 'Synthetic API bearing', unit: 'each' }
    const race = await Promise.all([0, 1].map(() => h.raw('/api/gasket/v1/part.create', { cookie: owner, body: concurrentBody, headers: { 'idempotency-key': 'synthetic-gasket-race' } })))
    assert.ok(race.every(response => [200, 409].includes(response.status)))
    const outcomes = await Promise.all(race.map(response => response.json()))
    assert.ok(outcomes.some(result => result.id))
    const part = (await write('part.create', concurrentBody, 'synthetic-gasket-race')).result.id
    assert.ok(outcomes.every(result => result.id === part || result.error === 'idempotency_pending'))
    const received = await write('part.receive', { part, quantity: '3', unitPrice: '2.00' }, 'synthetic-gasket-stock')
    assert.deepEqual((await write('part.receive', { part, quantity: '3', unitPrice: '2.00' }, 'synthetic-gasket-stock')).result, received.result)
    assert.equal((await h.api(`/v1/parts/${part}`, owner)).on_hand, 3000)
    await write('asset.create', { name: 'Missing identity' }, 'synthetic-gasket-invalid', owner, 400)
    assert.equal((await write('asset.create', { name: 'Missing identity' }, 'synthetic-gasket-invalid', owner, 409)).result.error, 'idempotency_failed')
    await write('site.configure', { name: 'Do not change', timezone: 'UTC' }, 'synthetic-gasket-unsupported', owner, 400)
    assert.equal((await h.api('site', owner)).name, 'Synthetic API estate')
    await write('part.receive', { part, quantity: '3' }, 'not a key', owner, 400)
    await write('part.receive', { part, quantity: '3' }, 'synthetic-gasket-1', owner, 409)
    const workBody = { asset, title: 'Synthetic API inspection', due: '2026-10-27', assignee: member }
    const work = (await write('workorder.create', workBody, 'synthetic-gasket-work', lead)).result.id
    assert.equal((await write('workorder.create', workBody, 'synthetic-gasket-work', lead)).result.id, work)
    for (let n = 1; n <= 5; n++) {
      await h.api('/v1/asset.create', owner, { ...assetBody, tag: `synthetic-gasket-api-${n}`, name: `Synthetic API pump ${n}` })
      await h.api('/v1/part.create', owner, { ...concurrentBody, number: `synthetic-gasket-api-${n}` })
      await h.api('/v1/workorder.create', owner, { ...workBody, title: `Synthetic API work ${n}`, assignee: (await h.api('me', owner)).id })
    }
    const pages = {}
    for (const path of ['assets', 'work', 'parts']) {
      const ids = [], seen = new Set()
      let cursor = null, total = 0
      do {
        const result = await h.api(`/v1/${path}?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, owner)
        assert.ok(result.rows.length <= 2)
        total = result.total
        for (const row of result.rows) { assert.ok(!seen.has(row.id)); seen.add(row.id); ids.push(row.id) }
        if (!cursor && result.next) {
          await h.api(`/v1/${path}?limit=2&q=changed&cursor=${encodeURIComponent(result.next)}`, owner, undefined, 400)
          await h.api(`/v1/${path}?limit=2&cursor=${encodeURIComponent(result.next)}`, lead, undefined, 400)
        }
        cursor = result.next
      } while (cursor)
      assert.equal(ids.length, total)
      pages[path] = ids
    }
    assert.equal(pages.assets.length, 7); assert.equal(pages.work.length, 6); assert.equal(pages.parts.length, 6)
    const stockPage = await h.api('/v1/parts?tag=synthetic-gasket-api-0&limit=2', owner)
    assert.equal(stockPage.rows.find(row => row.id === part).onHand, '3')
    assert.equal(stockPage.rows.find(row => row.id === part).sourceDoor, `/api/gasket/v1/parts/${part}`)
    assert.ok(pages.work.includes(work)); assert.ok(pages.parts.includes(part)); assert.ok(pages.assets.includes(asset))
    await h.api('/v1/assets?limit=201', owner, undefined, 400)
    await h.api('/v1/work?cursor=invalid', owner, undefined, 400)
    assert.equal((await h.api('/v1/assets?site=Forbidden%20site', owner)).total, 0)
    assert.equal((await h.raw('/api/gasket/v1/assets')).status, 401)
    await h.api('/v2/assets', owner, undefined, 404)
    // Operate a complete procedure-bound job using the published request examples.
    const checklist = await repeat('checklist.create', example('checklist.create'), 'synthetic-gasket-procedure', lead)
    const revised = await repeat('checklist.revise', { ...example('checklist.revise'), checklist: checklist.id }, 'synthetic-gasket-procedure-revision', lead)
    const procedure = await h.api(`/v1/checklists/${checklist.id}`, owner)
    assert.deepEqual(procedure.revisions.map(row => row.number), [2, 1])
    assert.equal(revised.number, 2)
    const template = await repeat('template.save', { ...example('template.save'), checklist: checklist.id }, 'synthetic-gasket-template', lead)
    const templateUpdate = { ...example('template.save'), template: template.id, revision: 1, checklist: checklist.id, title: 'Synthetic revised procedure job' }
    assert.equal((await repeat('template.save', templateUpdate, 'synthetic-gasket-template-revision', lead)).revision, 2)
    const job = (await write('workorder.create', { asset, template: template.id, due: '2026-10-27', unassigned: true }, 'synthetic-gasket-procedure-job', lead)).result.id
    const order = cookie => h.api(`/v1/work/${job}`, cookie)
    await repeat('workorder.assign', { ...example('workorder.assign'), workOrder: job, assignee: member }, 'synthetic-gasket-assignment', lead)
    let current = await order(lead)
    assert.equal(current.assignee_id, member)
    assert.equal(current.checklist_revision, 2)
    assert.equal(current.title, 'Synthetic revised procedure job')
    assert.deepEqual(current.items.map(row => row.text), ['Inspect guard', 'Inspect seal'])
    const answers = { ...example('workorder.results'), workOrder: job }
    await write('workorder.results', answers, 'synthetic-gasket-wrong-assignee', owner, 403)
    await write('workorder.submit', { workOrder: job, version: current.version }, 'synthetic-gasket-incomplete-submit', lead, 409)
    await repeat('workorder.results', answers, 'synthetic-gasket-results', lead)
    assert.deepEqual((await order(lead)).items.map(row => row.result.outcome), ['pass', 'pass'])
    await repeat('workorder.issue', { ...example('workorder.issue'), workOrder: job, part }, 'synthetic-gasket-issue', lead)
    assert.equal((await h.api(`/v1/parts/${part}`, owner)).onHand, '1')
    await repeat('workorder.return', { ...example('workorder.return'), workOrder: job, part }, 'synthetic-gasket-return', lead)
    assert.equal((await h.api(`/v1/parts/${part}`, owner)).onHand, '2')
    assert.deepEqual((await order(lead)).parts.map(row => [row.issued, row.returned, row.used]), [['2', '1', '1']])
    // The documented execution doors retain one effect when their response is lost.
    const meter = await repeat('meter.create', { ...example('meter.create'), asset }, 'synthetic-gasket-meter', lead)
    assert.deepEqual((await h.api(`/v1/assets/${asset}`, owner)).meters.map(row => [row.id, row.name, row.unit]), [[meter.id, 'Run hours', 'h']])
    const photoBody = { ...example('workorder.evidence'), workOrder: job, file: file('synthetic-gasket-photo.png', png, ['image', 'png'].join('/')) }
    await write('workorder.evidence', photoBody, 'synthetic-gasket-foreign-evidence', owner, 403)
    const photo = await repeat('workorder.evidence', photoBody, 'synthetic-gasket-evidence', lead)
    const annotation = await repeat('workorder.annotate', { ...example('workorder.annotate'), workOrder: job, evidence: photo.evidence }, 'synthetic-gasket-annotation', lead)
    const timeBody = { ...example('workorder.time'), workOrder: job, version: (await order(lead)).version }
    const time = await repeat('workorder.time', timeBody, 'synthetic-gasket-time', lead)
    const readingsBody = { ...example('workorder.readings'), workOrder: job, meter: [meter.id] }
    await repeat('workorder.readings', readingsBody, 'synthetic-gasket-reading', lead)
    await write('workorder.readings', { ...readingsBody, value: ['41'] }, 'synthetic-gasket-backwards-reading', lead, 409)
    const finding = await repeat('finding.record', { ...example('finding.record'), workOrder: job }, 'synthetic-gasket-finding', lead)
    await repeat('downtime.start', { ...example('downtime.start'), workOrder: job }, 'synthetic-gasket-stop', lead)
    const stopped = await order(owner)
    assert.equal(stopped.downtime.length, 1)
    assert.equal(stopped.downtime[0].ended_on, null)
    await write('workorder.submit', { workOrder: job, version: stopped.version }, 'synthetic-gasket-open-stop-submit', lead, 409)
    assert.equal((await repeat('downtime.end', { ...example('downtime.end'), workOrder: job }, 'synthetic-gasket-stop-end', lead)).minutes, 30)
    current = await order(owner)
    assert.deepEqual(current.evidence.map(row => [row.id, row.sha256, row.phase, row.annotations.map(note => note.id)]), [[photo.evidence, (await import('node:crypto')).createHash('sha256').update(png).digest('hex'), 'before', [annotation.annotation]]])
    assert.deepEqual(Buffer.from(await (await h.raw(`/app/evidence/${photo.evidence}`, { cookie: lead })).arrayBuffer()), png)
    assert.deepEqual(current.timeEntries.map(row => [row.id, row.minutes, row.worked_on]), [[time.timeEntry, 25, '2026-10-26']])
    assert.deepEqual(current.readings.map(row => [row.meter, row.value, row.unit]), [['Run hours', '42', 'h']])
    assert.deepEqual(current.findings.map(row => [row.id, row.severity, row.follow_up_id]), [[finding.finding, 'low', null]])
    assert.deepEqual(current.downtime.map(row => [row.started_on, row.ended_on, row.minutes]), [['2026-10-26T14:00', '2026-10-26T14:30', 30]])
    const signBody = { ...example('workorder.sign'), workOrder: job, version: current.version }
    await write('workorder.sign', signBody, 'synthetic-gasket-foreign-signature', owner, 403)
    const signature = await repeat('workorder.sign', signBody, 'synthetic-gasket-signature', lead)
    assert.deepEqual((await order(lead)).signatures.map(row => [row.id, row.role, row.state]), [[signature.signature, 'technician', 'current']])
    // Required tools survive schedule creation and reject submission until recorded.
    const schedule = await repeat('schedule.create', { ...example('schedule.create'), asset, checklist: checklist.id, assignee: member }, 'synthetic-gasket-schedule', lead)
    assert.equal((await h.api('/v1/schedules', owner)).filter(row => row.id === schedule.id).length, 1)
    await h.api('/v1/workorders.generate', owner, {})
    const toolJob = (await h.api('/v1/work', owner)).rows.find(row => row.title === 'Synthetic tool inspection')
    assert.ok(toolJob)
    const toolOrder = () => h.api(`/v1/work/${toolJob.id}`, lead)
    assert.deepEqual((await toolOrder()).tools.map(row => [row.name, row.identifier]), [['Synthetic torque wrench', null]])
    const toolBody = { ...example('workorder.tool'), workOrder: toolJob.id }
    await write('workorder.tool', toolBody, 'synthetic-gasket-foreign-tool', owner, 403)
    await repeat('workorder.tool', toolBody, 'synthetic-gasket-tool', lead)
    assert.deepEqual((await toolOrder()).tools.map(row => [row.name, row.identifier]), [['Synthetic torque wrench', 'synthetic-gasket-tool-1']])
    const cancelled = (await h.api('/v1/workorder.create', owner, { asset, title: 'Synthetic retry control', due: '2026-10-27', assignee: member })).id
    await repeat('workorder.cancel', { ...example('workorder.cancel'), workOrder: cancelled }, 'synthetic-gasket-cancel', lead)
    assert.equal((await h.api(`/v1/work/${cancelled}`, owner)).status, 'cancelled')
    await write('workorder.cancel', { workOrder: cancelled, reason: 'Already cancelled' }, 'synthetic-gasket-cancel-again', lead, 409)
    await repeat('workorder.reopen', { ...example('workorder.reopen'), workOrder: cancelled }, 'synthetic-gasket-reopen', lead)
    assert.equal((await h.api(`/v1/work/${cancelled}`, owner)).status, 'open')
    assert.deepEqual((await h.api(`/v1/work/${cancelled}`, owner)).control.map(row => row.action), ['workorder.cancel', 'workorder.reopen'])
    const reviewBody = { ...example('workorder.review'), workOrder: job, version: (await order(owner)).version }
    await write('workorder.review', reviewBody, 'synthetic-gasket-unsubmitted', owner, 409)
    await repeat('workorder.submit', { ...example('workorder.submit'), workOrder: job, version: reviewBody.version }, 'synthetic-gasket-submit', lead)
    current = await order(owner)
    assert.equal(current.status, 'submitted')
    await write('workorder.review', { ...reviewBody, version: current.version }, 'synthetic-gasket-unauthorized-review', lead, 403)
    await write('workorder.review', reviewBody, 'synthetic-gasket-stale-review', owner, 409)
    const supervisorSign = { ...example('workorder.sign'), workOrder: job, version: current.version, role: 'supervisor' }
    await write('workorder.sign', supervisorSign, 'synthetic-gasket-self-supervisor', lead, 403)
    await repeat('workorder.sign', supervisorSign, 'synthetic-gasket-supervisor-sign', owner)
    assert.equal((await order(owner)).signatures.filter(row => row.role === 'supervisor').length, 1)
    await repeat('workorder.review', { ...reviewBody, version: current.version }, 'synthetic-gasket-review', owner)
    current = await order(owner)
    assert.equal(current.status, 'closed')
    assert.deepEqual(current.reviews.map(row => [row.decision, row.reviewer]), [['approved', 'Olive Owner']])
    for (const action of ['workorder.evidence', 'workorder.annotate', 'workorder.time', 'workorder.readings', 'workorder.sign', 'finding.record', 'downtime.start', 'downtime.end']) {
      const entries = (await h.api(`audit?action=${action}`, owner)).rows
      assert.equal(entries.filter(row => row.subject === (action.startsWith('downtime.') ? asset : job)).length, action === 'workorder.sign' ? 2 : 1, action + ' retains only original audit effects')
    }
    for (const action of ['checklist.create', 'checklist.revise', 'template.save', 'workorder.assign', 'workorder.results', 'part.issue', 'part.return', 'workorder.submit', 'workorder.approve']) {
      const entries = (await h.api(`audit?action=${action}`, owner)).rows
      const subject = action.startsWith('checklist.') ? checklist.id : action === 'template.save' ? template.id : job
      assert.equal(entries.filter(row => row.subject === subject).length, action === 'template.save' ? 2 : 1, action + ' must retain exactly its original effects')
    }
    const handedOff = (await h.api('/v1/workorder.create', owner, { asset, title: 'Synthetic receipt authority', due: '2026-10-27', assignee: member })).id
    await repeat('workorder.issue', { workOrder: handedOff, part, quantity: '1' }, 'synthetic-gasket-former-assignee', lead)
    await h.api('/v1/workorder.assign', owner, { workOrder: handedOff, assignee: (await h.api('me', owner)).id })
    await write('workorder.issue', { workOrder: handedOff, part, quantity: '1' }, 'synthetic-gasket-former-assignee', lead, 403)
    assert.equal((await h.api(`/v1/parts/${part}`, owner)).onHand, '1')
    const former = { ...example('finding.record'), workOrder: handedOff }
    await write('finding.record', former, 'synthetic-gasket-former-finding', lead, 403)
    const self = (await h.api('/v1/workorder.create', owner, { asset, title: 'Synthetic independent review', due: '2026-10-27', assignee: (await h.api('me', owner)).id })).id
    await h.api('/v1/workorder.submit', owner, { workOrder: self, version: (await h.api(`/v1/work/${self}`, owner)).version })
    await write('workorder.review', { workOrder: self, version: (await h.api(`/v1/work/${self}`, owner)).version, decision: 'approve' }, 'synthetic-gasket-own-review', owner, 403)
    assert.equal((await h.api(`/v1/work/${self}`, owner)).status, 'submitted')
    const audit = (await h.api('audit?action=asset.create', owner)).rows.filter(row => row.subject === asset)
    assert.equal(audit.length, 1)
    const history = await h.api(`/v1/assets/${asset}/history`, owner)
    assert.ok(JSON.stringify(history).includes('Synthetic API'))
    await h.api('access.role', owner, { member, role: 'maintainer' })
    await write('asset.create', { ...assetBody, tag: 'synthetic-gasket-other-actor' }, 'synthetic-gasket-1', lead, 403)
    assert.deepEqual((await h.api('/v1/work?limit=200', lead)).rows.map(row => row.id).sort(), [cancelled, toolJob.id, job, work].sort())
    await h.api('workorder.review', lead, { workOrder: work, decision: 'approve' }, 403)
    await h.api('site.configure', lead, { name: 'Forbidden', timezone: 'UTC' }, 403)
    await h.api('site.technicianWork', owner, { allowed: false })
    await write('workorder.create', workBody, 'synthetic-gasket-work', lead, 403)
    await h.api('service.create', lead, { name: 'Forbidden service', scopes: ['assets:read'], expiresAt: Date.UTC(2026, 9, 27), consent: true }, 403)
    await h.api('service.create', owner, { name: 'Consent required', scopes: ['assets:read'], expiresAt: Date.UTC(2026, 9, 27) }, 400)
    await h.api('service.create', owner, { name: 'Forbidden approval scope', scopes: ['workorder.review'], expiresAt: Date.UTC(2026, 9, 27), consent: true }, 400)
    for (const expiresAt of [Date.UTC(2026, 9, 26, 16, 0, 59), Date.UTC(2027, 0, 24, 16, 0, 1)]) {
      await h.api('service.create', owner, { name: 'Synthetic invalid expiry', scopes: ['assets:read'], expiresAt, consent: true }, 400)
    }
    await h.api('service.create', owner, { name: 'Synthetic empty scopes', scopes: [], expiresAt: Date.UTC(2026, 9, 27), consent: true }, 400)
    const complete = await h.api('service.create', owner, { name: 'Synthetic complete estate scope', scopes: ['assets:read', 'parts:read', 'work:read', 'asset.create', 'asset.update', 'part.create', 'part.receive', 'part.count', 'workorder.create'], expiresAt: Date.UTC(2026, 9, 27), consent: true })
    const scoped = async (token, path, body, key, status = 200) => {
      const response = await h.raw('/api/gasket/v1/' + path, { body, headers: { authorization: `Bearer ${token}`, ...(key ? { 'idempotency-key': key } : {}) } })
      assert.equal(response.status, status, path + ' scope status')
      return response.json()
    }
    const serviceAsset = await scoped(complete.token, 'asset.create', { ...assetBody, tag: 'synthetic-gasket-complete' }, 'synthetic-gasket-complete-asset')
    const serviceUpdate = { ...assetBody, tag: 'synthetic-gasket-complete', name: 'Synthetic service update', asset: serviceAsset.id, revision: 1 }
    const serviceUpdated = await scoped(complete.token, 'asset.update', serviceUpdate, 'synthetic-gasket-complete-update')
    assert.equal(serviceUpdated.revision, 2)
    const servicePart = await scoped(complete.token, 'part.create', { ...concurrentBody, number: 'synthetic-gasket-complete' }, 'synthetic-gasket-complete-part')
    const serviceReceipt = { part: servicePart.id, quantity: '5', unitPrice: '2.00' }
    await scoped(complete.token, 'part.receive', serviceReceipt, 'synthetic-gasket-complete-receipt')
    await scoped(complete.token, 'part.receive', serviceReceipt, 'synthetic-gasket-complete-receipt')
    const serviceCount = { part: servicePart.id, counted: '4', seen: (await scoped(complete.token, `parts/${servicePart.id}`)).seen }
    assert.equal((await scoped(complete.token, 'part.count', serviceCount, 'synthetic-gasket-complete-count')).variance, '-1')
    await scoped(complete.token, 'part.count', serviceCount, 'synthetic-gasket-complete-count')
    assert.equal((await scoped(complete.token, `parts/${servicePart.id}`)).onHand, '4')
    const serviceWork = await scoped(complete.token, 'workorder.create', { ...workBody, asset: serviceAsset.id }, 'synthetic-gasket-complete-work')
    assert.equal((await scoped(complete.token, `work/${serviceWork.id}`)).asset_id, serviceAsset.id)
    assert.equal((await scoped(complete.token, `assets/${serviceAsset.id}`)).name, 'Synthetic service update')
    for (const path of ['assets', 'parts', 'work']) assert.ok((await scoped(complete.token, path + '?limit=2')).rows.length > 0)
    assert.ok((await scoped(complete.token, `assets/${serviceAsset.id}/history`)).events.length > 0)
    for (const [action, subject] of [['asset.create', serviceAsset.id], ['asset.update', serviceAsset.id], ['part.create', servicePart.id], ['part.receive', servicePart.id], ['part.count', servicePart.id], ['workorder.create', serviceWork.id]]) {
      const entries = (await h.api(`audit?action=${action}`, owner)).rows.filter(row => row.subject === subject)
      assert.equal(entries.length, 1, action + ' service effect')
      assert.equal(JSON.parse(entries[0].detail).serviceCredential, complete.id)
    }
    const readOnly = await h.api('service.create', owner, { name: 'Synthetic read only', scopes: ['assets:read'], expiresAt: Date.UTC(2026, 9, 27), consent: true })
    await scoped(readOnly.token, `assets/${asset}`)
    await scoped(readOnly.token, 'asset.create', { ...assetBody, tag: 'synthetic-gasket-refused' }, undefined, 403)
    assert.equal((await h.api('/v1/assets?tag=synthetic-gasket-refused', owner)).total, 0)
    const writeOnly = await h.api('service.create', owner, { name: 'Synthetic write only', scopes: ['asset.update'], expiresAt: Date.UTC(2026, 9, 27), consent: true })
    await scoped(writeOnly.token, 'assets', undefined, undefined, 403)
    await scoped(writeOnly.token, `assets/${asset}`, undefined, undefined, 403)
    await h.api('service.revoke', owner, { credential: complete.id })
    await scoped(complete.token, 'part.receive', serviceReceipt, 'synthetic-gasket-complete-receipt', 401)
    const issued = await h.api('service.create', owner, { name: 'Synthetic scoped service', scopes: ['assets:read', 'asset.create'], expiresAt: Date.UTC(2026, 9, 27), consent: true })
    const service = async (path, body, status = 200, key) => {
      const response = await h.raw(`/api/gasket/v1/${path}`, { body, headers: { authorization: `Bearer ${issued.token}`, ...(key ? { 'idempotency-key': key } : {}) } })
      assert.equal(response.status, status, 'scoped service response status')
      return response.json()
    }
    const serviceCreated = await service('asset.create', { ...assetBody, tag: 'synthetic-gasket-scoped' }, 200, 'synthetic-gasket-1')
    assert.notEqual(serviceCreated.id, asset, 'credential retry keys are isolated from member-session keys')
    assert.deepEqual(await service('asset.create', { ...assetBody, tag: 'synthetic-gasket-scoped' }, 200, 'synthetic-gasket-1'), serviceCreated)
    assert.equal((await service(`assets/${asset}`)).id, asset)
    assert.ok((await service('assets?limit=2')).next)
    for (const path of ['parts', `work/${work}`, 'service-credentials']) await service(path, undefined, 403)
    for (const action of ['site.configure', 'meter.create', 'schedule.create', 'workorder.evidence', 'workorder.annotate', 'workorder.time', 'workorder.readings', 'workorder.tool', 'workorder.sign', 'finding.record', 'downtime.start', 'downtime.end', 'workorder.cancel', 'workorder.reopen', 'checklist.create', 'checklist.revise', 'template.save', 'workorder.assign', 'workorder.results', 'workorder.issue', 'workorder.return', 'workorder.submit', 'workorder.review', 'service.create', 'service.revoke']) await service(action, {}, 403)
    assert.equal((await h.raw('/app/assets', { headers: { authorization: `Bearer ${issued.token}` } })).status, 403)
    const serviceEvents = (await h.api('audit?action=asset.create', owner)).rows.filter(row => row.subject === serviceCreated.id)
    assert.equal(serviceEvents.length, 1)
    assert.equal(serviceEvents[0].actor, (await h.api('me', owner)).id)
    assert.equal(serviceEvents[0].authority, `Owner, service credential ${issued.id}`)
    assert.equal(JSON.parse(serviceEvents[0].detail).serviceCredential, issued.id)
    const interactiveEvent = (await h.api('audit?action=asset.create', owner)).rows.find(row => row.subject === asset)
    assert.equal(interactiveEvent.authority, 'Owner')
    assert.equal(JSON.parse(interactiveEvent.detail).serviceCredential, undefined)
    const auditDownload = await h.raw('/app/audit.csv', { cookie: owner })
    assert.equal(auditDownload.status, 200)
    const auditCsv = await auditDownload.text()
    assert.ok(auditCsv.includes(`Owner, service credential ${issued.id}`))
    assert.ok(!auditCsv.includes(issued.token))
    const credentialList = await h.api('service-credentials', owner)
    assert.ok(credentialList.some(row => row.id === issued.id))
    assert.ok(!JSON.stringify(credentialList).includes(issued.token), 'a credential secret is shown once')
    assert.ok(!JSON.stringify(credentialList).includes('token_hash'), 'metadata never includes bearer verifiers')
    assert.ok(!JSON.stringify(await h.api('audit?action=service.create', owner)).includes(issued.token), 'audit never stores a bearer secret')
    await h.api('service.revoke', owner, { credential: issued.id })
    await service(`assets/${asset}`, undefined, 401)
    await service('asset.create', { ...assetBody, tag: 'synthetic-gasket-scoped' }, 401, 'synthetic-gasket-1')
    const expiring = await h.api('service.create', owner, { name: 'Synthetic expiring service', scopes: ['parts:read'], expiresAt: Date.UTC(2026, 9, 26, 16, 1), consent: true })
    if (process.env.API_SCREENSHOTS) await browserProof(h, owner, asset, job, part, issued.id)
    // Losing owner authority is permanent for a bearer, even after reinstatement.
    const ownerSession = await (await h.raw('/auth/session', { cookie: owner })).json()
    assert.equal((await h.raw('/auth/invite', { cookie: owner, body: { email: 'synthetic-gasket-owner@example.test', displayName: 'Synthetic second owner', role: 'owner' } })).status, 202)
    const otherOwner = await h.signIn('synthetic-gasket-owner@example.test')
    await h.api('me', otherOwner)
    assert.ok(!(await h.api('service-credentials', otherOwner)).some(row => row.id === issued.id), 'ownership does not transfer another owner credential')
    const memberSession = await (await h.raw('/auth/session', { cookie: lead })).json()
    assert.equal((await h.raw('/auth/operator/role', { cookie: otherOwner, body: { operatorId: memberSession.operator.id, role: 'owner' } })).status, 200)
    const promotedOwner = await h.signIn('synthetic-gasket-api@example.test')
    const promoted = await h.api('service.create', promotedOwner, { name: 'Synthetic promoted owner service', scopes: ['assets:read', 'asset.create'], expiresAt: Date.UTC(2026, 9, 27), consent: true })
    assert.equal((await scoped(promoted.token, `assets/${asset}`)).id, asset)
    const promotedAsset = await scoped(promoted.token, 'asset.create', { ...assetBody, tag: 'synthetic-gasket-promoted-owner' }, 'synthetic-gasket-promoted-owner')
    assert.equal((await h.api(`/v1/assets/${promotedAsset.id}`, owner)).tag, 'synthetic-gasket-promoted-owner')
    const promotedAudit = (await h.api('audit?action=asset.create', owner)).rows.find(row => row.subject === promotedAsset.id)
    assert.equal(promotedAudit.role, 'owner')
    assert.equal(promotedAudit.authority, `Owner, service credential ${promoted.id}`)
    assert.equal((await h.raw('/auth/operator/role', { cookie: otherOwner, body: { operatorId: memberSession.operator.id, role: 'member' } })).status, 200)
    await scoped(promoted.token, 'assets', undefined, undefined, 401)
    const credential = () => h.api('service.create', owner, { name: 'Synthetic owner lifecycle', scopes: ['assets:read', 'asset.create'], expiresAt: Date.UTC(2026, 9, 27), consent: true })
    const lifecycle = await credential()
    const otherOwnerId = (await h.api('me', otherOwner)).id
    const lifecycleEvents = async id => (await h.api('audit?action=service.invalidate', otherOwner)).rows.filter(row => row.subject === id)
    assert.deepEqual(await lifecycleEvents(lifecycle.id), [])
    assert.equal((await h.raw('/auth/operator/role', { cookie: lead, body: { operatorId: ownerSession.operator.id, role: 'member' } })).status, 403)
    assert.deepEqual(await lifecycleEvents(lifecycle.id), [], 'a refused account change has no credential lifecycle effect')
    const lifecycleBody = { ...assetBody, tag: 'synthetic-gasket-lifecycle' }
    const lifecycleRequest = (token, body) => h.raw('/api/gasket/v1/' + (body ? 'asset.create' : 'assets'), { body, headers: { authorization: `Bearer ${token}`, ...(body ? { 'idempotency-key': 'synthetic-gasket-lifecycle' } : {}) } })
    assert.equal((await lifecycleRequest(lifecycle.token, lifecycleBody)).status, 200)
    for (const role of ['member', 'owner']) assert.equal((await h.raw('/auth/operator/role', { cookie: otherOwner, body: { operatorId: ownerSession.operator.id, role } })).status, 200)
    owner = await h.signIn(h.vars.OWNER_EMAIL)
    assert.equal((await lifecycleRequest(lifecycle.token)).status, 401)
    assert.equal((await lifecycleRequest(lifecycle.token, lifecycleBody)).status, 401)
    assert.ok((await h.api('service-credentials', owner)).find(row => row.id === lifecycle.id).revoked_at)
    const invalidated = await lifecycleEvents(lifecycle.id)
    assert.equal(invalidated.length, 1, 'restoring owner authority never duplicates the original invalidation')
    assert.equal(invalidated[0].actor, otherOwnerId)
    assert.equal(invalidated[0].role, 'owner')
    assert.equal(invalidated[0].site, 'Synthetic API estate')
    assert.ok(Number.isSafeInteger(invalidated[0].at))
    assert.deepEqual(JSON.parse(invalidated[0].detail), { credential: lifecycle.id, issuingOwner: (await h.api('me', owner)).id, cause: 'operator.role' })
    assert.ok(!JSON.stringify(invalidated).includes(lifecycle.token))
    const replacement = await credential()
    assert.equal((await lifecycleRequest(replacement.token)).status, 200)
    for (const status of ['inactive', 'active']) assert.equal((await h.raw('/auth/operator/status', { cookie: otherOwner, body: { operatorId: ownerSession.operator.id, status } })).status, 200)
    owner = await h.signIn(h.vars.OWNER_EMAIL)
    assert.equal((await lifecycleRequest(replacement.token)).status, 401)
    const deactivated = await lifecycleEvents(replacement.id)
    assert.equal(deactivated.length, 1)
    assert.equal(deactivated[0].actor, otherOwnerId)
    assert.equal(JSON.parse(deactivated[0].detail).cause, 'operator.status')
    const lifecycleCsv = await (await h.raw('/app/audit.csv', { cookie: otherOwner })).text()
    assert.ok(lifecycleCsv.includes(lifecycle.id) && lifecycleCsv.includes(replacement.id))
    assert.ok(!lifecycleCsv.includes(lifecycle.token) && !lifecycleCsv.includes(replacement.token))
    const fresh = await credential()
    assert.equal((await lifecycleRequest(fresh.token)).status, 200)
    // Signing out alone does not revoke separately consented service authority.
    assert.equal((await h.raw('/auth/signout', { cookie: owner, body: {} })).status, 204)
    assert.equal((await lifecycleRequest(fresh.token)).status, 200)
    owner = await h.signIn(h.vars.OWNER_EMAIL)
    assert.equal((await h.api(`/v1/assets/${asset}`, owner)).name, 'Synthetic updated pump')
    assert.equal((await h.api(`/v1/work/${job}`, owner)).status, 'closed')
    // Receipt and stock survive a complete Worker restart, without replaying writes.
    await h.stop()
    resumed = await harness({ vars: h.vars, installation: h.installation, clockInstant: Date.UTC(2026, 9, 26, 16) })
    const persisted = await resumed.raw('/api/gasket/v1/part.receive', { cookie: owner, body: { part, quantity: '3', unitPrice: '2.00' }, headers: { 'idempotency-key': 'synthetic-gasket-stock' } })
    assert.equal(persisted.status, 200); assert.equal(persisted.headers.get('idempotency-replayed'), 'true')
    assert.deepEqual(await persisted.json(), received.result)
    assert.equal((await resumed.api(`parts/${part}`, owner)).on_hand, 1000)
    await resumed.stop()
    const expired = await harness({ vars: h.vars, installation: h.installation, clockInstant: Date.UTC(2026, 9, 26, 16, 2) })
    try {
      assert.equal((await expired.raw('/api/gasket/v1/parts', { headers: { authorization: `Bearer ${expiring.token}` } })).status, 401)
    } finally { await expired.close() }
    console.log('Versioned API: paged estate, retained write receipts, overlap, restart, mismatch and authorization passed')
  } finally { await resumed?.close(); await h.close() }
}

async function browserProof(h, owner, asset, work, part, credential) {
  const { chromium } = await import('@playwright/test'), { mkdir } = await import('node:fs/promises')
  await mkdir(process.env.API_SCREENSHOTS, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(owner.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
    const page = await context.newPage()
    for (const [path, expected] of [[`assets/${asset}`, 'Synthetic updated pump'], [`parts/${part}`, 'Synthetic API bearing'], [`work/${work}`, 'Synthetic revised procedure job'], ['audit?action=asset.create', `Owner, service credential ${credential}`]]) for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 })
      const response = await page.goto(h.origin + '/app/' + path)
      await page.getByText(expected, { exact: true }).first().waitFor()
      await page.evaluate(() => document.fonts.ready)
      if (width === (path.startsWith('audit') ? 390 : 1440)) {
        assert.equal(response.status(), 200)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        if (path.startsWith('audit')) {
          const overflow = await page.locator('.gk-audit-authority').evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth).map(node => ({ width: node.clientWidth, scroll: node.scrollWidth, display: getComputedStyle(node).display, wrap: getComputedStyle(node).overflowWrap, whitespace: getComputedStyle(node).whiteSpace })))
          assert.deepEqual(overflow, [], 'service authority fits the phone audit rows')
        }
      }
      await page.screenshot({ path: `${process.env.API_SCREENSHOTS}/${path.split(/[/?]/)[0]}-${width}.png`, fullPage: true })
    }
    await context.close()
  } finally { await browser.close() }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await apiJourney()
