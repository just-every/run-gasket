// One native sanity journey: genuine held-policy MCP changes and human review Undo.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID, webcrypto, createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { harness, file } from './harness.mjs'
import { signJws, policyEnvelope, heldPolicy } from '../../src/modules/agent-door/conformance/crypto.mjs'

export async function assetUndoJourney() {
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const kid = randomUUID(), issuer = 'https://synthetic-gasket.invalid', installationId = randomUUID()
  const publicKeys = { [kid]: { ...await webcrypto.subtle.exportKey('jwk', keys.publicKey), kid, alg: 'ES256', use: 'sig' } }
  const address = name => `${name}${'@'}example.test`
  const ownerEmail = address('synthetic-gasket-owner')
  const h = await harness({ clockOffset: 0, vars: { OWNER_EMAIL: ownerEmail, SESSION_SECRET: randomBytes(32).toString('hex'), SETUP_TOKEN: randomBytes(32).toString('hex'),
    RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId, RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(publicKeys),
    RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience: 'self-host', subject: installationId, email: ownerEmail, keys: publicKeys }) } })
  let browser
  try {
    const owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Synthetic gasket workshop', timezone: 'UTC' })
    const sub = 'synthetic-gasket-owner', business = 'synthetic-gasket', agentId = randomUUID(), consent = randomUUID()
    const sign = (typ, payload) => signJws(keys.privateKey, kid, typ, payload)
    const iat = Math.floor(Date.now() / 1000)
    const team = ['lead', 'forbidden', 'ended', 'revoked', 'site'].map(label => ({ id: `synthetic-gasket-${label}`, email: address(`synthetic-gasket-${label}`), name: `Synthetic ${label}`, role: label === 'forbidden' ? 'member' : 'admin', invite: 1 }))
    const settings = await sign('rer-business-settings+jwt', { v: 1, iss: issuer, aud: 'self-host', sub: installationId, business, email: ownerEmail, owner_id: sub, jti: randomUUID(), iat, exp: iat + 3600, rev: 1, values: {}, logo: null, team })
    assert.equal((await h.raw('/api/rer/business-settings', { body: { settings } })).status, 200)
    const cookie = {}, people = {}
    for (const member of team) {
      const label = member.id.replace('synthetic-gasket-', '')
      cookie[label] = await h.signIn(member.email)
      people[label] = await h.api('me', cookie[label])
    }
    const ownerPerson = await h.api('me', owner)
    const signer = { privateKey: keys.privateKey, kid, issuer, installationId }
    const policy = await policyEnvelope({ signer, origin: h.origin, business, seq: 0, revision: 0 }, { ...heldPolicy(), reviewers: ['sponsor', 'role:editor'] })
    assert.equal((await h.raw('/api/rer/agent-policy', { body: { policy: policy.policy } })).status, 200)
    const tool = async (name, args, sponsor = sub) => {
      const iat = Math.floor(Date.now() / 1000)
      const token = await sign('at+jwt', { iss: issuer, aud: h.origin + '/mcp', sub: sponsor, email: sponsor === sub ? ownerEmail : address(sponsor), act: { sub: agentId, name: 'Synthetic asset coordinator', specialist: 'maintenance coordinator' }, client_id: 'synthetic-gasket', scope: 'asset.update assets:read', business, consent, jti: randomUUID(), iat, exp: iat + 300 })
      const response = await h.raw('/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}`, origin: h.origin, 'content-type': 'application/json', 'MCP-Protocol-Version': '2025-11-25', 'Mcp-Method': 'tools/call', 'Mcp-Name': name }, body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } })
      assert.equal(response.status, 200)
      return response.json()
    }
    const read = id => h.api(`assets/${id}`, owner)
    const reviews = async () => (await (await h.raw('/agents/api/reviews', { cookie: owner })).json()).reviews
    const undo = async (id, actor = owner, status = 200, headers) => {
      const response = await h.raw(`/agents/api/reviews/${id}/undo`, { cookie: actor, body: {}, headers })
      const text = await response.text()
      assert.equal(response.status, status, `Undo: ${response.status} ${text.slice(0, 250)}`)
      return text ? JSON.parse(text) : null
    }
    const argsOf = asset => Object.fromEntries(['tag', 'name', 'location', 'serial', 'custodian', 'category', 'criticality', 'notes'].filter(key => asset[key] !== null).map(key => [key, asset[key]]))
    const change = async (id, changes = {}, sponsor = sub) => {
      const before = await read(id), args = { ...argsOf(before), asset: id, revision: before.revision, expected_revision: before.revision, name: `Agent display name ${before.revision}`, notes: 'Agent notes, no physical attestation.', ...changes, idempotency_key: randomUUID() }
      const answer = await tool('gasket.assets.update', args, sponsor)
      assert.ok(!answer.result?.isError, JSON.stringify(answer.result?._meta))
      assert.equal(answer.result._meta['com.runeditrun/decision'].disposition, 'review')
      const review = (await reviews()).find(row => row.decision_id === answer.result._meta['com.runeditrun/decision'].id)
      assert.ok(review, 'the held standard policy produced a genuine persisted review')
      assert.equal(review.summary.nativeTarget.id, id)
      return { before, after: await read(id), review, args, answer }
    }
    const create = async tag => (await h.api('asset.create', owner, { tag, name: 'Original display name', notes: 'Original notes', location: 'Workshop', serial: 'synthetic-gasket-serial', model: 'Synthetic pump model', custodian: 'Workshop crew', category: 'Pump', criticality: 'important' })).id
    const parent = (await h.api('asset.create', owner, { tag: 'synthetic-gasket-parent', name: 'Pump skid', location: 'Workshop', level: 'line' })).id
    const id = await create('synthetic-gasket-undo')
    // Preserve independently populated custom values, hierarchy and real work evidence.
    const custom = (await h.api('customfield.save', owner, { name: 'Synthetic rating', entityType: 'asset', type: 'text', scope: 'site' })).id
    await h.api('customvalue.set', owner, { entityType: 'asset', entityId: id, customValues: { [custom]: 'Original custom value' } })
    await h.api('asset.move', owner, { asset: id, revision: (await read(id)).revision, parent, level: 'machine' })
    const work = (await h.api('workorder.create', owner, { asset: id, title: 'Retained inspection', due: '2030-01-10', assignee: ownerPerson.id })).id
    await h.api('workorder.evidence', owner, { workOrder: work, file: file('synthetic-gasket-original.pdf', '%PDF-1.4 Retained maintenance original', 'application/pdf') })
    const part = (await h.api('part.create', owner, { number: 'synthetic-gasket-stock', name: 'Retained bearing', unit: 'each', location: 'Stores', minimum: '1' })).id
    await h.api('part.receive', owner, { part, quantity: '5', unitPrice: '12.00', note: 'Retained native stock receipt' })
    const stockBefore = await h.api(`parts/${part}`, owner), workBefore = await h.api(`work/${work}`, owner)
    const original = await read(id), first = await change(id)
    assert.equal(first.review.undo.available, true)
    assert.equal(first.after.revision, original.revision + 1)
    assert.deepEqual(first.after.versions[0].value, Object.fromEntries(['tag','name','serial','model','location','custodian','category','criticality','notes'].map(key => [key, original[key]])))
    assert.equal((await tool('gasket.assets.update', first.args)).result.structuredContent.revision, first.after.revision)
    assert.equal((await read(id)).revision, first.after.revision, 'MCP replay has one applied revision')
    // Browser assertions at one width. The same changed screen is captured at both widths.
    const { chromium } = await import('@playwright/test')
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
    await context.addCookies(cookie.lead.split('; ').map(pair => { const index = pair.indexOf('='); return { name: pair.slice(0, index), value: pair.slice(index + 1), url: h.origin } }))
    const page = await context.newPage()
    await page.goto(h.origin + '/agents')
    const row = page.locator(`[data-review-id="${first.review.id}"]`)
    await row.getByRole('button', { name: 'Undo', exact: true }).waitFor()
    assert.equal(await row.getByRole('button', { name: 'Undo', exact: true }).isVisible(), true)
    if (process.env.GASKET_UNDO_SCREENSHOTS) {
      await mkdir(process.env.GASKET_UNDO_SCREENSHOTS, { recursive: true })
      for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await page.screenshot({ path: `${process.env.GASKET_UNDO_SCREENSHOTS}/asset-review-${width}.png`, fullPage: true }) }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await row.getByRole('button', { name: 'Undo', exact: true }).click()
    await row.waitFor({ state: 'detached' })
    assert.equal((await reviews()).find(row => row.id === first.review.id).state, 'undone')
    const restored = await read(id)
    assert.equal(restored.id, original.id)
    assert.equal(restored.name, original.name); assert.equal(restored.notes, original.notes)
    assert.equal(restored.revision, first.after.revision + 1)
    assert.deepEqual(restored.customFields, original.customFields)
    assert.deepEqual(restored.hierarchy, original.hierarchy)
    assert.deepEqual(restored.versions.slice(1), first.after.versions, 'original and intervening identity history survives')
    assert.equal(restored.versions[0].value.name, first.after.name)
    assert.equal(restored.versions[0].changed_by, people.lead.id)
    assert.deepEqual(await h.api(`work/${work}`, owner), workBefore)
    assert.deepEqual(await h.api(`parts/${part}`, owner), stockBefore)
    const evidence = workBefore.evidence[0]
    const bytes = await (await h.raw(`/app/evidence/${evidence.id}`, { cookie: owner })).arrayBuffer()
    assert.equal(createHash('sha256').update(Buffer.from(bytes)).digest('hex'), createHash('sha256').update('%PDF-1.4 Retained maintenance original').digest('hex'))
    const audit = (await h.api('audit', owner)).rows.filter(row => row.subject === id)
    const applied = audit.find(row => row.action === 'asset.update'), reversed = audit.find(row => row.action === 'asset.undo')
    assert.equal(applied.actor, ownerPerson.id)
    assert.equal(JSON.parse(applied.detail).preparedBy.agent.id, agentId)
    assert.equal(JSON.parse(applied.detail).preparedBy.for.id, ownerPerson.id)
    assert.equal(reversed.actor, people.lead.id)
    assert.equal(JSON.parse(reversed.detail).preparedBy, undefined)
    assert.equal(JSON.parse(reversed.detail).effect, JSON.parse(applied.detail).effect)
    const history = await h.api(`assets/${id}/history`, owner)
    assert.ok(history.events.some(event => event.who === 'Synthetic asset coordinator for ' + ownerPerson.name))
    assert.ok(history.events.some(event => event.who === people.lead.name && event.what.includes('restored')))
    await undo(first.review.id, cookie.lead)
    assert.deepEqual(await read(id), restored, 'lost-response retry does not add a compensation')
    assert.equal((await h.api('audit', owner)).rows.filter(row => row.action === 'asset.undo' && row.subject === id).length, 1)
    if (process.env.GASKET_UNDO_SCREENSHOTS) {
      for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await page.goto(h.origin + `/app/assets/${id}`); await page.screenshot({ path: `${process.env.GASKET_UNDO_SCREENSHOTS}/asset-restored-${width}.png`, fullPage: true }) }
    }
    await context.close(); await browser.close(); browser = null
    console.log('PROBE SURFACE-006 compensation: held-policy MCP asset name and notes -> genuine review, human browser Undo, original values at the next revision, separate identities and one retry receipt')
    const narrow = await change(id, { location: 'Another workshop' })
    assert.equal(narrow.review.undo.available, false, 'other identity fields never advertise Undo')
    await undo(narrow.review.id, owner, 409)
    const noChange = await change(id, { ...argsOf(await read(id)) })
    assert.equal(noChange.review.undo.available, false, 'a no-op never advertises Undo')
    const stale = await change(id)
    await h.api('asset.update', owner, { ...argsOf(stale.after), asset: id, revision: stale.after.revision, notes: 'Later human edit' })
    const staleBefore = await read(id)
    assert.equal((await undo(stale.review.id, owner, 409)).code, 'undo_evidence_changed')
    assert.deepEqual(await read(id), staleBefore)
    const retiredId = await create('synthetic-gasket-retired'), retired = await change(retiredId)
    await h.api('asset.retire', owner, { asset: retiredId, reason: 'Retired by a person' })
    const retiredBefore = await read(retiredId)
    assert.equal((await undo(retired.review.id, owner, 409)).code, 'undo_evidence_changed')
    assert.deepEqual(await read(retiredId), retiredBefore)
    console.log('PROBE SURFACE-006 boundaries: MCP wider edit and no-op -> no Undo; native later edit or retirement -> stale Undo refused with unchanged history')
    const guardedId = await create('synthetic-gasket-guarded'), guarded = await change(guardedId), unchanged = await read(guardedId)
    await undo(guarded.review.id, null, 401)
    await undo(guarded.review.id, cookie.forbidden, 403)
    await h.api('access.role', owner, { member: people.lead.id, role: 'maintainer' })
    await undo(guarded.review.id, cookie.lead, 409)
    await h.api('access.end', owner, { member: people.ended.id })
    const endedResponse = await h.raw(`/agents/api/reviews/${guarded.review.id}/undo`, { cookie: cookie.ended, body: {} })
    assert.ok([401,403].includes(endedResponse.status)); await endedResponse.body?.cancel()
    const session = await (await h.raw('/auth/session', { cookie: cookie.revoked })).json()
    assert.equal((await h.raw('/auth/session/revoke', { cookie: owner, body: { sessionId: session.id } })).status, 204)
    await undo(guarded.review.id, cookie.revoked, 401)
    const planned = (await h.api('site.create', owner, { name: 'Planned workshop', timezone: 'UTC' })).id
    await h.api('site.membership', owner, { site: planned, member: people.site.id, revision: 0, status: 'active', manager: true })
    await h.api('site.membership', owner, { site: planned, member: people.site.id, revision: 1, status: 'ended' })
    await undo(guarded.review.id, cookie.site, 409, { 'x-gasket-site': planned })
    const credential = await h.api('service.create', owner, { name: 'Synthetic read service', scopes: ['assets:read'], expiresAt: Date.now() + 3600000, consent: true })
    await undo(guarded.review.id, owner, 403, { authorization: `Bearer ${credential.token}` })
    assert.deepEqual(await read(guardedId), unchanged)
    assert.equal((await h.api('audit', owner)).rows.filter(row => row.subject === guardedId && row.action === 'asset.undo').length, 0)
    console.log('PROBE SURFACE-006 authority: signed-out, forbidden, role-removed, ended, revoked session, revoked site and service attempts -> refused; asset revision, values and audit unchanged')
    // Concurrent retries and an intentionally discarded response share one effect.
    const lost = await Promise.all([0, 1].map(() => h.raw(`/agents/api/reviews/${guarded.review.id}/undo`, { cookie: owner, body: {} })))
    assert.ok(lost.some(response => response.status === 200))
    assert.ok(lost.every(response => [200, 409].includes(response.status)))
    for (const response of lost) await response.body?.cancel()
    const compensated = await read(guardedId)
    await undo(guarded.review.id, owner)
    assert.deepEqual(await read(guardedId), compensated)
    assert.equal(compensated.revision, guarded.after.revision + 1)
    assert.equal((await h.api('audit?action=asset.undo', owner)).rows.filter(row => row.subject === guardedId).length, 1)
    for (const fields of [{ name: 'Only display name', notes: 'Original notes' }, { name: 'Original display name', notes: 'Only notes' }]) {
      const singleId = await create('synthetic-gasket-' + randomUUID()), single = await change(singleId, fields)
      assert.equal(single.review.undo.available, true)
      await undo(single.review.id, owner)
      const restored = await read(singleId)
      assert.equal(restored.name, single.before.name); assert.equal(restored.notes, single.before.notes)
      assert.equal(restored.revision, single.after.revision + 1)
    }
    const nullId = (await h.api('asset.create', owner, { tag: 'synthetic-gasket-null', name: 'Original null notes', location: 'Workshop' })).id
    const nullChange = await change(nullId)
    await undo(nullChange.review.id, owner)
    assert.equal((await read(nullId)).notes, null, 'an absent before-value stays absent')
    console.log('PROBE SURFACE-006 retries: concurrent native Undo and discarded accepted response -> one compensating revision and audit effect; single-field and null before-values restored')
  } finally { await browser?.close(); await h.close() }
}

if (process.argv[1]?.endsWith('/agent-asset-undo.mjs')) await assetUndoJourney()
