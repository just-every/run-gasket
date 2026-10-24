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
  assert.equal(retention.held, true); assert.equal(retention.files.count, 1)
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
  await h.api('request.erase', owner, { request, version: requestBefore.version, confirm: true })
  assert.equal((await h.api(`retention-preview?request=${request}`, owner)).files.count, 0)
  assert.equal((await h.raw(`/app/request-files/${requestBefore.files[0].id}`, { cookie: owner })).status, 404)
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
