// Session-bound original manual revisions, exercised only through public doors.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { file, harness } from './harness.mjs'

const instant = Date.UTC(2026, 9, 28, 16)
const address = number => [`synthetic-gasket-${number}`, ['example', 'test'].join('.')].join('@')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const original = Buffer.from('synthetic-gasket-1 private manual original bytes\nInspect the drive with power isolated.\n')
const replacement = Buffer.from('synthetic-gasket-2 private manual revised bytes\nUse the revised isolation procedure.\n')

export async function privateFileLinksJourney() {
  const h = await harness({ clockInstant: instant })
  let expired
  try {
    const owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Synthetic maintenance workshop', timezone: 'UTC' })
    const member = (await h.api('access.give', owner, { name: 'Synthetic technician', email: address(1), role: 'maintainer' })).id
    const signed = await h.signIn(address(1)), anotherSession = await h.signIn(address(1))
    const asset = (await h.api('asset.create', owner, { tag: 'SYNTHETIC-1', name: 'Synthetic drive', location: 'Workshop' })).id
    const add = { asset, kind: 'manual', title: 'Drive maintenance manual', source: 'synthetic-gasket-1', file: file('synthetic-gasket-1.txt', original) }
    const first = await h.api('document.add', owner, add)
    const issue = cookie => h.api('document.privateLink', cookie, { revision: first.revisionId })
    const link = await issue(signed)
    assert.ok(link.expiresAt > instant, 'issuance returns a future expiry')
    assert.equal(link.revision, 1)
    assert.equal(link.filename, 'synthetic-gasket-1.txt')
    const downloaded = await h.raw(link.href, { cookie: signed })
    assert.equal(downloaded.status, 200)
    assert.equal(sha(Buffer.from(await downloaded.arrayBuffer())), sha(original), 'the private link preserves the original-byte digest')
    for (const [name, value] of Object.entries({ 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' })) assert.equal(downloaded.headers.get(name), value)
    assert.match(downloaded.headers.get('content-disposition'), /^attachment;/)
    assert.match(downloaded.headers.get('content-security-policy'), /sandbox/)
    assert.equal(sha(Buffer.from(await (await h.raw(`/app/documents/${first.revisionId}`, { cookie: signed })).arrayBuffer())), sha(original), 'the existing authenticated file door still serves the same bytes')

    const refuse = async (path, options, status, worker = h) => {
      const response = await worker.raw(path, options)
      assert.equal(response.status, status, `private manual refusal: ${path.split('?')[0]}`)
      const text = await response.text()
      assert.ok(!text.includes(original.toString()) && !text.includes(replacement.toString()), 'a refused download contains no private file bytes')
      return response
    }
    await refuse(link.href, {}, 303)
    await h.api('document.privateLink', undefined, { revision: first.revisionId }, 401)
    await refuse(`/app/manual-links/${first.revisionId}`, {}, 303)
    await refuse(link.href, { cookie: owner }, 403)
    await refuse(link.href, { cookie: anotherSession }, 403)
    // The other actor and the same actor's other session can issue their own link.
    for (const cookie of [owner, anotherSession]) assert.equal((await h.raw((await issue(cookie)).href, { cookie })).status, 200)
    const tampered = new URL(link.href, h.origin)
    tampered.searchParams.set('expires', String(link.expiresAt + 1))
    await refuse(tampered.pathname + tampered.search, { cookie: signed }, 403)
    tampered.searchParams.set('expires', String(instant + 86_400_000))
    await refuse(tampered.pathname + tampered.search, { cookie: signed }, 403)
    const forged = new URL(link.href, h.origin)
    forged.searchParams.set('proof', '0'.repeat(64))
    await refuse(forged.pathname + forged.search, { cookie: signed }, 403)
    await refuse(link.href.split('?')[0], { cookie: signed }, 403)

    const second = await h.api('document.revise', owner, { document: first.document, revision: 1, source: 'synthetic-gasket-2', file: file('synthetic-gasket-2.txt', replacement) })
    await refuse(link.href.replace(first.revisionId, second.revisionId), { cookie: signed }, 403)
    assert.equal(sha(Buffer.from(await (await h.raw(link.href, { cookie: signed })).arrayBuffer())), sha(original), 'a newer master never changes an issued revision link')
    const secondLink = await h.api('document.privateLink', signed, { revision: second.revisionId })
    assert.equal(sha(Buffer.from(await (await h.raw(secondLink.href, { cookie: signed })).arrayBuffer())), sha(replacement))
    const otherFile = await h.api('document.add', owner, { ...add, title: 'Separate manual' })
    await refuse(link.href.replace(first.revisionId, otherFile.revisionId), { cookie: signed }, 403)
    const warranty = await h.api('document.add', owner, { ...add, kind: 'warranty', title: 'Drive warranty' })
    assert.equal((await h.api('document.privateLink', signed, { revision: warranty.revisionId }, 409)).error, 'manual_required')
    await h.api('document.privateLink', signed, { revision: 'synthetic-gasket-missing' }, 404)

    const planned = await h.api('site.create', owner, { name: 'Synthetic planned workshop', timezone: 'UTC' })
    await refuse(link.href, { cookie: owner, headers: { 'x-gasket-site': planned.id } }, 409)
    const siteIssue = await h.raw('/api/gasket/document.privateLink', { cookie: owner, body: { revision: first.revisionId }, headers: { 'x-gasket-site': planned.id } })
    assert.equal(siteIssue.status, 409, 'issuance cannot fall back from a planned site to the primary estate')
    const service = await h.api('service.create', owner, { name: 'synthetic-gasket-1', consent: true, scopes: ['assets:read'], expiresAt: instant + 3_600_000 })
    assert.equal((await h.raw('/api/gasket/document.privateLink', { headers: { authorization: `Bearer ${service.token}` }, body: { revision: first.revisionId } })).status, 403)
    await refuse(link.href, { headers: { authorization: `Bearer ${service.token}` } }, 403)

    await browserProof(h, signed, asset, first.revisionId)
    // Sign-out invalidates the issuing session, including a captured URL and cookie.
    assert.equal((await h.raw('/auth/signout', { cookie: signed, body: {} })).status, 204)
    await refuse(link.href, { cookie: signed }, 303)
    await h.api('document.privateLink', signed, { revision: first.revisionId }, 401)
    const revived = await h.signIn(address(1))
    await refuse(link.href, { cookie: revived }, 403)
    const liveLink = await issue(revived)
    assert.equal((await h.raw(liveLink.href, { cookie: revived })).status, 200)
    // Ending record access fences both issuance and download in existing sessions.
    await h.api('access.end', owner, { member })
    await refuse(liveLink.href, { cookie: revived }, 303)
    await h.api('document.privateLink', revived, { revision: first.revisionId }, 401)
    assert.equal(sha(Buffer.from(await (await h.raw(`/app/documents/${first.revisionId}`, { cookie: owner })).arrayBuffer())), sha(original), 'refusals preserve the protected original')

    const expiring = await issue(owner)
    await h.stop()
    expired = await harness({ vars: h.vars, installation: h.installation, clockInstant: expiring.expiresAt })
    await refuse(expiring.href, { cookie: owner }, 410, expired)
    assert.equal((await expired.raw(`/app/documents/${first.revisionId}`, { cookie: owner })).status, 200, 'link expiry does not remove ordinary record access')
    const fresh = await expired.api('document.privateLink', owner, { revision: first.revisionId })
    assert.equal((await expired.raw(fresh.href, { cookie: owner })).status, 200, 'expiry requires deliberate fresh issuance')
    console.log('Private manual links: original digests, exact revisions, expiry, forgery, session and live authority refusals passed')
  } finally { await expired?.close(); await h.close() }
}

async function browserProof(h, cookie, asset, revision) {
  const directory = process.env.PRIVATE_FILE_SCREENSHOTS || `/tmp/gasket-private-files-${process.pid}`
  await mkdir(directory, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.GASKET_CHROMIUM ? { executablePath: process.env.GASKET_CHROMIUM } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true })
    await context.addCookies(cookie.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
    const page = await context.newPage()
    await page.setViewportSize({ width: 1440, height: 1100 })
    assert.equal((await page.goto(`${h.origin}/app/assets/${asset}#documents`)).status(), 200)
    await page.getByText('Earlier revisions', { exact: true }).click()
    await page.locator(`a[href="/app/manual-links/${revision}"]`).click()
    assert.equal(new URL(page.url()).pathname, `/app/manual-links/${revision}`)
    assert.match(await page.getByRole('main').innerText(), /only in this signed-in session/)
    const link = page.getByRole('link', { name: 'Download this revision', exact: true })
    const downloadEvent = page.waitForEvent('download')
    await link.click()
    const download = await downloadEvent
    assert.equal(download.suggestedFilename(), 'synthetic-gasket-1.txt')
    const chunks = []
    for await (const chunk of await download.createReadStream()) chunks.push(chunk)
    assert.equal(sha(Buffer.concat(chunks)), sha(original), 'the ordinary browser link downloads the original revision')
    // Assertions run once at 1440; both release widths are captured once per screen.
    for (const [path, name] of [[`/app/assets/${asset}#documents`, 'asset-documents'], [`/app/manual-links/${revision}`, 'private-revision-link']]) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1100 })
        await page.goto(h.origin + path)
        if (name === 'asset-documents') { await page.locator('#documents').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -100)) }
        if (width === 1440) {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
          assert.deepEqual(await page.locator('main button:visible, main a:visible').evaluateAll(elements => elements.filter(el => !el.textContent.trim()).map(el => el.outerHTML)), [], 'the changed screens have no unnamed icon-only controls')
        }
        if (name === 'asset-documents') await page.locator('#documents').screenshot({ path: `${directory}/${name}-${width}.png` })
        else await page.screenshot({ path: `${directory}/${name}-${width}.png`, fullPage: true })
      }
    }
    console.log(`Private manual browser proof at 1440 and 390: ${directory}`)
  } finally { await browser.close() }
}
