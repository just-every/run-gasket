// Complete search exports go through the authenticated HTTP door, including
// fixtures. Scale mode runs separately on the committed landing candidate.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { png } from './fixtures.mjs'
import { file, harness } from './harness.mjs'

export async function searchJourney(h, cookie, count = 12) {
  const owner = cookie.owner
  const member = (await h.api('access.give', owner, { name: 'Search technician', email: 'synthetic-gasket-search@example.test', role: 'maintainer' })).id
  const tech = await h.signIn('synthetic-gasket-search@example.test')
  // Every serial is unique, including the one beyond the old list's 500-row cap.
  const ids = []
  for (let n = 0; n < count; n++) ids.push((await h.api('asset.create', owner, { tag: `synthetic-gasket-search-${n}`, name: `Search pump ${n}`, serial: `synthetic-gasket-serial-${n}`, location: 'Search plant', custodian: 'Search custodian' })).id)
  const last = count - 1
  const match = await h.api(`search?kind=asset&serial=synthetic-gasket-serial-${last}`, owner)
  assert.equal(match.total, 1); assert.equal(match.rows[0].id, ids[last]); assert.equal(match.next, null)
  const work = (await h.api('workorder.create', owner, { asset: ids[last], title: 'Search pump inspection', assignee: member, due: '2026-11-01' })).id
  const forbidden = (await h.api('workorder.create', owner, { asset: ids[0], title: 'Search private assignment', due: '2026-11-02' })).id
  const field = (await h.api('workfield.save', owner, { label: 'Search classification', kind: 'text' })).id
  await h.api('workorder.field', owner, { workOrder: work, version: String((await h.api(`work/${work}`, owner)).version), field, value: 'inspection' })
  const filtered = await h.api(`search?kind=work&field=${field}&value=inspection&owner=${member}&from=2026-11-01&to=2026-11-01&status=open`, owner)
  assert.deepEqual(filtered.rows.map(row => row.id), [work])
  const own = await h.api('search?kind=work&q=Search', tech)
  assert.deepEqual(own.rows.map(row => row.id), [work]); assert.equal(own.total, 1)
  assert.ok(!(await h.api('search?kind=request', tech)).rows.length)
  const bulk = { workOrder: [work, forbidden], version: [String((await h.api(`work/${work}`, owner)).version), String((await h.api(`work/${forbidden}`, owner)).version)], action: 'assign', assignee: member }
  await h.api('workorders.bulk', tech, { ...bulk, preview: true }, 403)
  const preview = await h.api('workorders.bulk', owner, { ...bulk, preview: true })
  assert.deepEqual(preview.rows.map(row => row.id), [work, forbidden])
  assert.equal((await h.api(`work/${forbidden}`, owner)).assignee_id, null)
  await h.api('workorders.bulk', owner, bulk)
  assert.equal((await h.api(`work/${forbidden}`, owner)).assignee_id, member)
  const procedure = (await h.api('checklist.create', owner, { name: 'Search procedure', items: ['Inspect pump'] })).id
  const part = (await h.api('part.create', owner, { number: 'synthetic-gasket-search-part', name: 'Search spare', unit: 'each', minimum: '0', location: 'Stores' })).id
  const vendor = (await h.api('supplier.save', owner, { name: 'Search vendor', contact: 'Synthetic contact', email: 'synthetic-gasket-vendor@example.test', phone: '5550100', street: '1 Test Street', city: 'Test City', state: 'NY', zip: '10001', taxTreatment: 'sales_tax', paymentTerms: 'Net 30', leadDays: 1, active: true })).id
  for (const [kind,id] of [['procedure',procedure],['part',part],['vendor',vendor]]) assert.ok((await h.api(`search?kind=${kind}&q=Search`, owner)).rows.some(row => row.id === id))
  const filters = { kind: 'asset', q: 'Search pump', owner: 'Search custodian', status: 'in_service' }
  const view = await h.api('search.save', owner, { name: 'Search pumps', filters, shared: true })
  const privateView = await h.api('search.save', tech, { name: 'My pumps', filters })
  assert.ok((await h.api('search-views', tech)).some(row => row.id === view.id))
  assert.ok(!(await h.api('search-views', owner)).some(row => row.id === privateView.id))
  await h.api(`search?view=${privateView.id}`, owner, undefined, 404)
  await h.api('search.save', tech, { id: view.id, revision: view.revision, name: 'Changed', filters }, 403)
  await h.api('search.save', tech, { name: 'Shared', filters, shared: true }, 403)
  const sharedWork = await h.api('search.save', owner, { name: 'Shared inspection', filters: { kind: 'work', q: 'Search pump inspection' }, shared: true })
  assert.deepEqual((await h.api(`search?view=${sharedWork.id}`, tech)).rows.map(row => row.id), [work], 'shared filter respects current record access')
  await h.api('workorder.assign', owner, { workOrder: work, assignee: (await h.api('me', owner)).id })
  const revoked = await h.api(`search?view=${sharedWork.id}`, tech)
  assert.equal(revoked.total, 0, 'a shared filter shows nothing on the next read after record access is lost')
  assert.deepEqual(revoked.rows, [], 'saved filters never preserve revoked record access')
  assert.equal((await h.api('search?kind=work&q=Search pump inspection', tech)).total, 0, 'saved filter matches the current ordinary search boundary')
  await h.api('search.delete', owner, { id: sharedWork.id, revision: sharedWork.revision })
  // Request detail and search both lose permission when the lead role is revoked.
  await h.api('access.role', owner, { member, role: 'lead' })
  const portal = (await h.api('request.portal', owner, { name: 'Shared search intake', fields: [] })).id
  const target = (await h.api('request.target', owner, { portal, kind: 'asset', asset: ids[last], name: 'Search pump', publishConsent: true })).id
  assert.equal((await h.raw(`/request/${portal}`, { cookie: owner, body: { target, submissionKey: randomUUID(), description: 'synthetic-gasket-shared-request', urgency: 'normal', contact: 'Synthetic requester' } })).status, 303)
  const request = (await h.api('search?kind=request&q=synthetic-gasket-shared-request', owner)).rows[0].id
  const sharedRequests = await h.api('search.save', owner, { name: 'Shared requests', filters: { kind: 'request', q: 'synthetic-gasket-shared-request' }, shared: true })
  assert.equal((await h.api(`requests/${request}`, tech)).id, request)
  assert.deepEqual((await h.api(`search?view=${sharedRequests.id}`, tech)).rows.map(row => row.id), [request])
  await h.api('access.role', owner, { member, role: 'maintainer' })
  const revokedRequests = await h.api(`search?view=${sharedRequests.id}`, tech)
  assert.equal(revokedRequests.total, 0, 'a shared filter shows nothing on the next read after record permission is revoked')
  assert.deepEqual(revokedRequests.rows, [], 'revoked request records never remain in shared filters')
  await h.api(`requests/${request}`, tech, undefined, 403)
  await h.api('search.delete', owner, { id: sharedRequests.id, revision: sharedRequests.revision })
  const updated = await h.api('search.save', owner, { id: view.id, revision: view.revision, name: 'Search pumps updated', filters, shared: true })
  await h.api('search.save', owner, { id: view.id, revision: view.revision, name: 'Stale', filters }, 409)
  const exported = [], seen = new Set(); let cursor = null, pages = 0
  do {
    const result = await h.api(`search?view=${view.id}&limit=7${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, tech)
    assert.equal(result.total, count)
    for (const row of result.rows) { assert.ok(!seen.has(row.id)); seen.add(row.id); exported.push(row.id) }
    if (result.next && !cursor) {
      await h.api(`search?kind=work&cursor=${encodeURIComponent(result.next)}`, tech, undefined, 400)
      await h.api(`search?view=${view.id}&cursor=${encodeURIComponent(result.next)}`, owner, undefined, 400)
    }
    cursor = result.next; pages++
  } while (cursor)
  assert.deepEqual(exported.sort(), ids.sort()); assert.equal(pages, Math.ceil(count / 7))
  await h.api(`search?view=${view.id}&kind=work`, tech, undefined, 400)
  for (const query of ['limit=0', 'limit=201', 'cursor=bad', 'from=2026-02-30', 'from=2026-11-02&to=2026-11-01', 'field=x']) await h.api(`search?${query}`, owner, undefined, 400)
  assert.equal((await h.raw('/api/gasket/search')).status, 401)
  assert.equal((await h.raw('/api/gasket/search-views')).status, 401)
  await h.api('search.delete', tech, { id: view.id, revision: updated.revision }, 403)
  await h.api('search.delete', owner, { id: view.id, revision: updated.revision })
  await h.api(`search?view=${view.id}`, tech, undefined, 404)
  await h.api('search.delete', tech, { id: privateView.id, revision: privateView.revision })
  console.log(`Search journey: ${count} assets, ${pages} complete export pages, scoped work, saved filters and bulk preview passed`)
}

export async function retentionJourney() {
  const h = await harness()
  try {
    const owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Held estate', timezone: 'America/New_York' })
    await h.api('access.give', owner, { name: 'Retention technician', email: 'synthetic-gasket-hold@example.test', role: 'maintainer' })
    const tech = await h.signIn('synthetic-gasket-hold@example.test')
    const ids = [(await h.api('asset.create', owner, { tag: 'synthetic-gasket-hold', name: 'Held pump', location: 'Plant' })).id]
  const portal = (await h.api('request.portal', owner, { name: 'Search intake', fields: [] })).id
  const target = (await h.api('request.target', owner, { portal, kind: 'asset', asset: ids[0], name: 'Search pump', publishConsent: true })).id
  const receipt = await h.raw(`/request/${portal}`, { cookie: tech, body: { target, submissionKey: randomUUID(), description: 'Search request fault', urgency: 'normal', contact: 'Synthetic requester', photo: file('request.png', png, 'image/png') } })
  assert.equal(receipt.status, 303)
  const request = (await h.api('search?kind=request&q=Search request fault', owner)).rows[0].id
  assert.ok((await h.api('search?kind=request&q=Search', owner)).rows.some(row => row.id === request))
  assert.equal((await h.api('search?kind=request', tech)).total, 0)
  await h.api(`retention-preview?request=${request}`, tech, undefined, 403)
  let version = (await h.api(`requests/${request}`, owner)).version
  await h.api('request.triage', owner, { request, version, decision: 'approve', reason: 'Confirmed fault' })
  version = (await h.api(`requests/${request}`, owner)).version
  const linkedWork = (await h.api('request.convert', owner, { request, version })).id
  const workHold = await h.api('retention.hold', owner, { kind: 'work', id: linkedWork, revision: 0, held: true, reason: 'Preserve fault evidence' })
  version = (await h.api(`requests/${request}`, owner)).version
  await h.api('request.erase', owner, { request, version, confirm: true }, 409)
  assert.equal((await h.api(`work/${linkedWork}`, owner)).title, 'Search request fault')
  await h.api('retention.hold', owner, { kind: 'work', id: linkedWork, revision: workHold.revision, held: false, reason: 'Work review complete' })
  const hold = await h.api('retention.hold', owner, { kind: 'request', id: request, revision: 0, held: true, reason: 'Legal review' })
  const retention = await h.api(`retention-preview?request=${request}`, owner)
  assert.equal(retention.dependencies.attachments, 1)
  assert.ok(retention.dependencies.events > 0)
  assert.equal(retention.result, null)
  assert.equal(retention.held, true); assert.equal(retention.files.count, 1)
  await h.api('retention-settings', tech, undefined, 403)
  await h.api('retention.policy', tech, { kind: 'attachments', minimumDays: 1, revision: 0, reason: 'No authority' }, 403)
  const contactPolicy = await h.api('retention.policy', owner, { kind: 'request_contacts', minimumDays: 1, revision: 0, reason: 'Preserve recent request contacts' })
  await h.api('retention.policy', owner, { kind: 'request_contacts', minimumDays: 0, revision: 0, reason: 'Stale policy' }, 409)
  await h.api('retention.policy', owner, { kind: 'attachments', minimumDays: -1, revision: 0, reason: 'Invalid retention' }, 400)
  assert.equal((await h.api('retention-settings', owner)).automaticErasure, false)
  const requestBefore = await h.api(`requests/${request}`, owner)
  const photoBefore = await h.raw(`/app/request-files/${requestBefore.files[0].id}`, { cookie: owner })
  const photoBytes = Buffer.from(await photoBefore.arrayBuffer())
  await h.api('retention.hold', tech, { kind: 'request', id: request, revision: hold.revision, held: false, reason: 'No authority' }, 403)
  assert.equal((await h.api('request.erase', owner, { request, version: requestBefore.version, confirm: true }, 409)).error, 'retention_hold', 'a hold blocks request erasure')
  assert.deepEqual(await h.api(`requests/${request}`, owner), requestBefore, 'hold refusal changes no request data')
  assert.deepEqual(Buffer.from(await (await h.raw(`/app/request-files/${requestBefore.files[0].id}`, { cookie: owner })).arrayBuffer()), photoBytes)
  await h.api('retention.hold', owner, { kind: 'request', id: request, revision: hold.revision, held: false, reason: 'Review complete' })
  await h.api('retention.hold', owner, { kind: 'request', id: request, revision: hold.revision, held: true, reason: 'Stale edit' }, 409)
  assert.equal((await h.api('request.erase', owner, { request, version: requestBefore.version }, 400)).error, 'erasure_confirmation_required', 'erasure needs explicit confirmation')
  await h.api('request.erase', owner, { request, version: requestBefore.version, confirm: true }, 409)
  await h.api('retention.policy', owner, { kind: 'request_contacts', minimumDays: 0, revision: contactPolicy.revision, reason: 'Explicit release of minimum retention' })
  for (const [kind, id] of [['attachment', requestBefore.files[0].id], ['user', (await h.api('me', tech)).id]]) {
    const protectedRecord = await h.api('retention.hold', owner, { kind, id, revision: 0, held: true, reason: 'Preserve original requester evidence' })
    assert.equal((await h.api(`retention-preview?request=${request}`, owner)).held, true)
    await h.api('request.erase', owner, { request, version: requestBefore.version, confirm: true }, 409)
    await h.api('retention.hold', owner, { kind, id, revision: protectedRecord.revision, held: false, reason: 'Owner released evidence hold' })
  }
  const preview = await h.api(`retention-preview?request=${request}`, owner)
  const erased = await h.api('request.erase', owner, { request, version: requestBefore.version, confirm: true })
  assert.deepEqual(erased.result.removed, preview.dependencies)
  assert.deepEqual(erased.result.anonymized, { requests: 1, linkedWork: 1 })
  assert.deepEqual(erased.result.retained, { maintenanceWork: 1, audit: true })
  assert.deepEqual((await h.api(`retention-preview?request=${request}`, owner)).result, erased.result)
  assert.deepEqual((await h.api('request.erase', owner, { request, version: requestBefore.version, confirm: true })).result, erased.result, 'retry retains the original per-type result')
  assert.equal((await h.api(`retention-preview?request=${request}`, owner)).files.count, 0)
  assert.equal((await h.raw(`/app/request-files/${requestBefore.files[0].id}`, { cookie: owner })).status, 404)
  const ownId = (await h.api('me', owner)).id
  const work = (await h.api('workorder.create', owner, { asset: ids[0], title: 'Optional evidence erasure', due: (await h.api('me', owner)).today, assignee: ownId })).id
  const attached = await h.api('workorder.evidence', owner, { workOrder: work, version: 1, file: file('synthetic-gasket-1.png', png, 'image/png') })
  const evidence = attached.evidence
  const attachmentPreview = () => h.api(`retention-preview?kind=attachment&id=${evidence}`, owner)
  await h.api(`retention-preview?kind=attachment&id=${evidence}`, tech, undefined, 403)
  await h.api('attachment.erase', tech, { evidence, version: 2, confirm: true }, 403)
  const evidenceHold = await h.api('retention.hold', owner, { kind: 'work', id: work, revision: 0, held: true, reason: 'Preserve original evidence' })
  assert.equal((await attachmentPreview()).eligible, false)
  await h.api('attachment.erase', owner, { evidence, version: 2, confirm: true }, 409)
  assert.deepEqual(Buffer.from(await (await h.raw(`/app/evidence/${evidence}`, { cookie: owner })).arrayBuffer()), png)
  await h.api('retention.hold', owner, { kind: 'work', id: work, revision: evidenceHold.revision, held: false, reason: 'Original evidence released' })
  const attachmentPolicy = await h.api('retention.policy', owner, { kind: 'attachments', minimumDays: 1, revision: 0, reason: 'Retain new original files' })
  assert.equal((await attachmentPreview()).eligible, false)
  await h.api('attachment.erase', owner, { evidence, version: 2, confirm: true }, 409)
  await h.api('retention.policy', owner, { kind: 'attachments', minimumDays: 0, revision: attachmentPolicy.revision, reason: 'Owner released minimum age' })
  for (const [kind, id] of [['attachment', evidence], ['user', ownId]]) {
    const held = await h.api('retention.hold', owner, { kind, id, revision: 0, held: true, reason: 'Preserve work original' })
    assert.equal((await attachmentPreview()).eligible, false)
    await h.api('attachment.erase', owner, { evidence, version: 2, confirm: true }, 409)
    await h.api('retention.hold', owner, { kind, id, revision: held.revision, held: false, reason: 'Owner released work original' })
  }
  const attachment = await attachmentPreview()
  assert.equal(attachment.eligible, true)
  assert.deepEqual(attachment.dependencies, { attachments: 1, bytes: png.length, annotations: 0 })
  await h.api('attachment.erase', owner, { evidence, version: attachment.version }, 400)
  await h.api('attachment.erase', owner, { evidence, version: 1, confirm: true }, 409)
  const result = await h.api('attachment.erase', owner, { evidence, version: attachment.version, confirm: true })
  assert.deepEqual(result.result.removed, attachment.dependencies)
  assert.equal((await h.raw(`/app/evidence/${evidence}`, { cookie: owner })).status, 404)
  assert.equal((await h.api(`work/${work}`, owner)).title, 'Optional evidence erasure')
  assert.deepEqual((await attachmentPreview()).result, result.result)
  assert.deepEqual(await h.api('attachment.erase', owner, { evidence, confirm: true }), result)
  const audit = (await h.api('audit?action=workorder.evidence', owner)).rows.filter(row => row.subject === work)
  assert.ok(audit.length)
  assert.ok(audit.every(row => row.detail === '{}'), 'original filename is removed from retained attachment audit')
  // Signed and required originals remain obligations even without a legal hold.
  const signedPhoto = (await h.api('workorder.evidence', owner, { workOrder: work, version: (await h.api(`work/${work}`, owner)).version, file: file('signed.png', png, 'image/png') })).evidence
  await h.api('workorder.sign', owner, { workOrder: work, version: (await h.api(`work/${work}`, owner)).version, role: 'technician' })
  assert.equal((await h.api(`retention-preview?kind=attachment&id=${signedPhoto}`, owner)).eligible, false)
  await h.api('attachment.erase', owner, { evidence: signedPhoto, version: (await h.api(`work/${work}`, owner)).version, confirm: true }, 409)
  const template = (await h.api('template.save', owner, { name: 'Required original', title: 'Required evidence', requiresEvidence: true })).id
  const requiredWork = (await h.api('workorder.create', owner, { asset: ids[0], template, due: (await h.api('me', owner)).today, assignee: ownId })).id
  const requiredPhoto = (await h.api('workorder.evidence', owner, { workOrder: requiredWork, file: file('required.png', png, 'image/png') })).evidence
  assert.equal((await h.api(`retention-preview?kind=attachment&id=${requiredPhoto}`, owner)).eligible, false)
  await h.api('attachment.erase', owner, { evidence: requiredPhoto, version: (await h.api(`work/${requiredWork}`, owner)).version, confirm: true }, 409)
  assert.deepEqual(Buffer.from(await (await h.raw(`/app/evidence/${requiredPhoto}`, { cookie: owner })).arrayBuffer()), png)
    console.log('Retention journey: request and linked work holds, preserved bytes, denied access, release and confirmed erasure passed')
  } finally { await h.close() }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const h = await harness()
  try {
    const owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Search estate', timezone: 'America/New_York' })
    await searchJourney(h, { owner }, process.env.GASKET_SEARCH_SCALE === '1' ? 2101 : 12)
    await retentionJourney()
  } finally { await h.close() }
}
