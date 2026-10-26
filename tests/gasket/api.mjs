// Public API retries and pagination run against the built Worker and persisted D1.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { harness } from './harness.mjs'

export async function apiJourney() {
  const h = await harness({ clockInstant: Date.UTC(2026, 9, 26, 16) })
  let resumed
  try {
    const owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Synthetic API estate', timezone: 'UTC' })
    const member = (await h.api('access.give', owner, { name: 'Synthetic API lead', email: 'synthetic-gasket-api@example.test', role: 'lead' })).id
    const lead = await h.signIn('synthetic-gasket-api@example.test')
    const write = async (action, body, key, cookie = owner, status = 200, legacy = false) => {
      const response = await h.raw(`/api/gasket/${legacy ? '' : 'v1/'}${action}`, { cookie, body, headers: { 'idempotency-key': key } })
      const result = await response.json()
      assert.equal(response.status, status, JSON.stringify(result))
      return { result, replayed: response.headers.get('idempotency-replayed') }
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
    const audit = (await h.api('audit?action=asset.create', owner)).rows.filter(row => row.subject === asset)
    assert.equal(audit.length, 1)
    const history = await h.api(`/v1/assets/${asset}/history`, owner)
    assert.ok(JSON.stringify(history).includes('Synthetic API'))
    await h.api('access.role', owner, { member, role: 'maintainer' })
    await write('asset.create', { ...assetBody, tag: 'synthetic-gasket-other-actor' }, 'synthetic-gasket-1', lead, 403)
    assert.deepEqual((await h.api('/v1/work?limit=2', lead)).rows.map(row => row.id), [work])
    await h.api('workorder.review', lead, { workOrder: work, decision: 'approve' }, 403)
    await h.api('site.configure', lead, { name: 'Forbidden', timezone: 'UTC' }, 403)
    await h.api('site.technicianWork', owner, { allowed: false })
    await write('workorder.create', workBody, 'synthetic-gasket-work', lead, 403)
    await h.api('service.create', lead, { name: 'Forbidden service', scopes: ['assets:read'], expiresAt: Date.UTC(2026, 9, 27), consent: true }, 403)
    await h.api('service.create', owner, { name: 'Consent required', scopes: ['assets:read'], expiresAt: Date.UTC(2026, 9, 27) }, 400)
    await h.api('service.create', owner, { name: 'Forbidden approval scope', scopes: ['workorder.review'], expiresAt: Date.UTC(2026, 9, 27), consent: true }, 400)
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
    for (const action of ['site.configure', 'workorder.review', 'service.create', 'service.revoke']) await service(action, {}, 403)
    assert.equal((await h.raw('/app/assets', { headers: { authorization: `Bearer ${issued.token}` } })).status, 403)
    const credentialList = await h.api('service-credentials', owner)
    assert.ok(credentialList.some(row => row.id === issued.id))
    assert.ok(!JSON.stringify(credentialList).includes(issued.token), 'a credential secret is shown once')
    assert.ok(!JSON.stringify(await h.api('audit?action=service.create', owner)).includes(issued.token), 'audit never stores a bearer secret')
    await h.api('service.revoke', owner, { credential: issued.id })
    await service(`assets/${asset}`, undefined, 401)
    await service('asset.create', { ...assetBody, tag: 'synthetic-gasket-scoped' }, 401, 'synthetic-gasket-1')
    const expiring = await h.api('service.create', owner, { name: 'Synthetic expiring service', scopes: ['parts:read'], expiresAt: Date.UTC(2026, 9, 26, 16, 1), consent: true })
    if (process.env.API_SCREENSHOTS) await browserProof(h, owner, asset, work, part)
    // Receipt and stock survive a complete Worker restart, without replaying writes.
    await h.stop()
    resumed = await harness({ vars: h.vars, installation: h.installation, clockInstant: Date.UTC(2026, 9, 26, 16) })
    const persisted = await resumed.raw('/api/gasket/v1/part.receive', { cookie: owner, body: { part, quantity: '3', unitPrice: '2.00' }, headers: { 'idempotency-key': 'synthetic-gasket-stock' } })
    assert.equal(persisted.status, 200); assert.equal(persisted.headers.get('idempotency-replayed'), 'true')
    assert.deepEqual(await persisted.json(), received.result)
    assert.equal((await resumed.api(`parts/${part}`, owner)).on_hand, 3000)
    await resumed.stop()
    const expired = await harness({ vars: h.vars, installation: h.installation, clockInstant: Date.UTC(2026, 9, 26, 16, 2) })
    try {
      assert.equal((await expired.raw('/api/gasket/v1/parts', { headers: { authorization: `Bearer ${expiring.token}` } })).status, 401)
    } finally { await expired.close() }
    console.log('Versioned API: paged estate, retained write receipts, overlap, restart, mismatch and authorization passed')
  } finally { await resumed?.close(); await h.close() }
}

async function browserProof(h, owner, asset, work, part) {
  const { chromium } = await import('@playwright/test'), { mkdir } = await import('node:fs/promises')
  await mkdir(process.env.API_SCREENSHOTS, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(owner.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
    const page = await context.newPage()
    for (const [path, expected] of [[`assets/${asset}`, 'Synthetic updated pump'], [`parts/${part}`, 'Synthetic API bearing'], [`work/${work}`, 'Synthetic API inspection']]) for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 })
      assert.equal((await page.goto(h.origin + '/app/' + path)).status(), 200)
      await page.getByText(expected, { exact: true }).first().waitFor()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: `${process.env.API_SCREENSHOTS}/${path.split('/')[0]}-${width}.png`, fullPage: true })
    }
    await context.close()
  } finally { await browser.close() }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await apiJourney()
