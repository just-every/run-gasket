// SAFE-003: completeness of the current primary site's work doors, not a
// qualification of the contract's million-order estate or native offline pack.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { readCsv } from '../../src/gasket/movein/csv.ts'
import { file, harness } from './harness.mjs'

const csv = rows => rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const address = number => [`synthetic-gasket-${number}`, 'example.test'].join(String.fromCharCode(64))
const query = (base, cursor) => base + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')

export async function workPaginationJourney() {
  const h = await harness({ clockInstant: Date.parse('2026-10-20T16:00:00Z') })
  try {
    const owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Synthetic work estate', timezone: 'UTC' })
    const techId = (await h.api('access.give', owner, { name: 'Synthetic technician', email: address(301), role: 'maintainer' })).id
    const tech = await h.signIn(address(301))
    const otherId = (await h.api('access.give', owner, { name: 'Synthetic colleague', email: address(302), role: 'maintainer' })).id
    const other = await h.signIn(address(302))
    const team = (await h.api('team.create', owner, { name: 'Synthetic crew', trade: 'Maintenance', member: [techId] })).id
    const asset = (await h.api('asset.create', owner, { tag: 'synthetic-gasket-301', name: 'Synthetic pump', location: 'Primary workshop' })).id
    // Import through the public preview, reviewed apply and resumable job doors.
    // All 1,205 due keys tie; sequence and identity must keep traversal stable.
    const source = [['Source ID', 'Status', 'Asset ID', 'Title', 'Created on', 'Due date', 'Assignee', 'Team'],
      ...Array.from({ length: 1205 }, (_, n) => [`synthetic-gasket-${n}`, 'open', asset, `Synthetic inspection ${n}`, '2026-10-19', '2026-10-20', techId, team])]
    const preview = await h.api('spreadsheet.preview', owner, { entity: 'work', dateFormat: 'MDY', spreadsheet: file('synthetic-gasket-301.csv', csv(source)) })
    assert.deepEqual(preview.rejected, []); assert.equal(preview.accepted.length, 1205)
    let imported = await h.api('spreadsheet.apply', owner, { ...preview.carry, fingerprint: preview.fingerprint })
    for (let n = 0; imported.state !== 'completed' && n < 30; n++) imported = await h.api('spreadsheet.job', owner, { job: imported.job, action: 'resume' })
    assert.equal(imported.state, 'completed')
    const expected = preview.accepted.map(row => row.targetId)
    const closed = []
    for (let n = 0; n < 9; n++) {
      const id = (await h.api('workorder.create', owner, { asset, title: `Synthetic closed ${n}`, due: '2026-10-20', assignee: techId })).id
      await h.api('workorder.cancel', owner, { workOrder: id, reason: 'Synthetic duplicate preserved in history' })
      closed.push(id)
    }
    const hidden = (await h.api('workorder.create', owner, { asset, title: 'Synthetic forbidden assignment', due: '2026-10-20', assignee: otherId })).id
    const collaboration = (await h.api('workorder.create', owner, { asset, title: 'Synthetic shared task', due: '2026-10-20', assignee: otherId })).id
    await h.api('workorder.collaborate', owner, { workOrder: collaboration, member: techId })
    const evidenceBytes = Buffer.from('%PDF-1.4 synthetic-gasket-301 retained evidence')
    const evidence = (await h.api('workorder.evidence', tech, { workOrder: expected[0], file: file('synthetic-gasket-301.pdf', evidenceBytes) })).evidence
    const before = await h.api(`work/${expected[0]}`, owner)
    const digest = async () => sha(Buffer.from(await (await h.raw(`/app/evidence/${evidence}`, { cookie: tech })).arrayBuffer()))
    assert.equal(await digest(), sha(evidenceBytes))

    async function traverse(base, cookie, ids) {
      const rows = [], seen = new Set(); let cursor = null
      do {
        const page = await h.api(query(base, cursor), cookie)
        assert.equal(page.total, ids.length)
        assert.ok(page.rows.length <= 200)
        for (const row of page.rows) { assert.ok(!seen.has(row.id), `duplicate ${row.id}`); seen.add(row.id); rows.push(row) }
        cursor = page.next
      } while (cursor)
      assert.deepEqual([...seen].sort(), [...ids].sort())
      return rows
    }
    const allOpen = [...expected, hidden, collaboration]
    const native = await traverse('work-page?state=open&limit=137', owner, allOpen)
    const own = await traverse('work-page?state=open&limit=137', tech, [...expected, collaboration])
    assert.ok(!own.some(row => row.id === hidden))
    await traverse(`work-page?team=${team}&limit=137`, owner, expected)
    await traverse('work-page?state=closed&limit=4', owner, closed)
    await traverse('work-page?state=closed&limit=4', tech, closed)
    const versioned = await traverse('v1/work?status=open&limit=200', owner, allOpen)
    for (const row of native) {
      const v1 = versioned.find(other => other.id === row.id)
      assert.deepEqual([v1.title, v1.status, v1.due], [row.title, row.status, row.due_date])
    }
    // Legacy clients keep an array and follow headers, with exactly the same fields.
    let path = '/api/gasket/work?state=open&limit=137', legacy = []
    do {
      const response = await h.raw(path, { cookie: owner })
      assert.equal(response.status, 200); assert.equal(+response.headers.get('x-total-count'), allOpen.length)
      const rows = await response.json(); assert.ok(Array.isArray(rows)); legacy.push(...rows)
      const link = response.headers.get('link'); path = link ? link.match(/^<([^>]+)>/)[1] : null
    } while (path)
    assert.deepEqual(legacy, native)

    async function exportRows(cookie, ids) {
      const response = await h.raw('/app/work.csv?state=open', { cookie })
      assert.equal(response.status, 200)
      assert.match(response.headers.get('content-disposition'), /attachment/)
      const table = readCsv(new Uint8Array(await response.arrayBuffer())).rows
      const fields = table.shift(), records = table.map(row => Object.fromEntries(fields.map((key, n) => [key, row[n]])))
      assert.equal(records.length, ids.length)
      assert.deepEqual(records.map(row => row.id).sort(), [...ids].sort())
      for (const row of records) {
        const original = native.find(item => item.id === row.id)
        for (const key of fields.filter(key => key !== 'my_part')) assert.equal(row[key], String(original[key] ?? ''), `${row.id} ${key}`)
      }
      return records
    }
    await exportRows(owner, allOpen)
    const ownCsv = await exportRows(tech, [...expected, collaboration])
    assert.equal(ownCsv.find(row => row.id === collaboration).my_part, 'collaborator')
    const closedCsv = readCsv(new Uint8Array(await (await h.raw('/app/work.csv?state=closed', { cookie: tech })).arrayBuffer())).rows
    assert.deepEqual(closedCsv.slice(1).map(row => row[0]), closed, 'equal close instants retain a deterministic total order')

    const first = await h.api('work-page?state=open&limit=137', tech)
    assert.equal((await h.api('work-page?state=open&limit=137', tech)).next, first.next, 'unchanged reads issue deterministic cursors')
    for (const base of ['work-page?state=closed&limit=137', `work-page?team=${team}&limit=137`]) await h.api(query(base, first.next), tech, undefined, 400)
    await h.api(query('work-page?state=open&limit=137', first.next), other, undefined, 400)
    const [encoded, mac] = first.next.split('.'), decoded = JSON.parse(Buffer.from(encoded, 'base64').toString())
    decoded.offset += 1
    await h.api(query('work-page?state=open&limit=137', Buffer.from(JSON.stringify(decoded)).toString('base64') + '.' + mac), tech, undefined, 400)
    for (const invalid of ['cursor=bad', 'limit=0', 'limit=201', 'limit=no']) await h.api(`work-page?${invalid}`, owner, undefined, 400)
    // Refusal must return no partial download and must not alter accepted data.
    const limited = await h.raw('/app/work.csv?exportLimit=1000', { cookie: tech })
    assert.equal(limited.status, 413); assert.equal(limited.headers.get('content-disposition'), null)
    assert.match(await limited.text(), /work export limit exceeded/)
    assert.deepEqual(await h.api(`work/${expected[0]}`, owner), before); assert.equal(await digest(), sha(evidenceBytes))
    await h.api('workorder.priority', owner, { workOrder: expected[1], priority: 'high', reason: 'Synthetic changed snapshot' })
    assert.equal((await h.api(query('work-page?state=open&limit=137', first.next), tech, undefined, 409)).error, 'work_snapshot_changed')
    const staleCsv = await h.raw('/app/work.csv?snapshot=' + encodeURIComponent(first.start), { cookie: tech })
    assert.equal(staleCsv.status, 409); assert.equal(staleCsv.headers.get('content-disposition'), null)
    assert.equal(await digest(), sha(evidenceBytes))
    assert.equal((await h.api('work-page', tech)).total, expected.length + 1)

    await browserProof(h, owner, { open: allOpen.length, today: allOpen.length, closed: closed.length })
    for (const path of ['/api/gasket/work', '/api/gasket/work-page', '/app/work.csv']) {
      assert.equal((await h.raw(path)).status, path.startsWith('/api/') ? 401 : 303)
    }
    const planned = (await h.api('site.create', owner, { name: 'Synthetic planned site', timezone: 'UTC' })).id
    for (const path of ['/api/gasket/work', '/api/gasket/work-page', '/app/work.csv', '/app']) {
      const refused = await h.raw(path, { cookie: owner, headers: { 'x-gasket-site': planned } })
      assert.equal(refused.status, 409); assert.doesNotMatch(await refused.text(), /Synthetic inspection/)
    }
    const liveCursor = (await h.api('work-page?limit=137', tech)).next
    await h.api('access.end', owner, { member: techId })
    for (const path of [query('/api/gasket/work-page?limit=137', liveCursor), '/api/gasket/work', '/app/work.csv', '/app']) {
      const refused = await h.raw(path, { cookie: tech })
      assert.ok([401, 403, 303].includes(refused.status)); assert.doesNotMatch(await refused.text(), /Synthetic inspection/)
    }
    assert.equal((await h.api('work-page', owner)).total, allOpen.length)
    assert.equal((await h.api(`work/${expected[0]}`, owner)).evidence[0].sha256, sha(evidenceBytes))
    console.log('Work completeness: 1205 imported orders, closed ties, authorized paging, JSON and CSV reconciliation, snapshot and limit refusals, current access and browser navigation passed')
  } finally { await h.close() }
}

async function browserProof(h, owner, totals) {
  const directory = process.env.WORK_SCREENSHOTS ?? `/tmp/gasket-work-${process.pid}`
  await mkdir(directory, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.GASKET_CHROMIUM ? { executablePath: process.env.GASKET_CHROMIUM } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 } })
    await context.addCookies(owner.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
    const page = await context.newPage()
    for (const [path, name, total] of [['/app', 'today', totals.today], ['/app?state=open', 'open', totals.open], ['/app?state=closed', 'closed', totals.closed]]) {
      assert.equal((await page.goto(h.origin + path)).status(), 200)
      assert.match(await page.getByRole('navigation', { name: 'Work pages' }).innerText(), new RegExp(`1–6 of ${total} work orders`))
      if (name === 'today') assert.match(await page.getByRole('navigation', { name: "Today's work" }).innerText(), new RegExp(`Today ${totals.today}`))
      const firstIds = await page.locator('.gk-work-table tbody .gk-wo').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))
      await Promise.all([page.waitForNavigation(), page.getByRole('link', { name: 'Next page', exact: true }).click()])
      assert.match(await page.getByRole('navigation', { name: 'Work pages' }).innerText(), new RegExp(`7–${Math.min(12, total)} of ${total} work orders`))
      const nextIds = await page.locator('.gk-work-table tbody .gk-wo').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))
      assert.ok(nextIds.every(id => !firstIds.includes(id)))
      await Promise.all([page.waitForNavigation(), page.getByRole('link', { name: 'First page', exact: true }).click()])
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1100 })
        await page.screenshot({ path: `${directory}/work-${name}-${width}.png`, fullPage: true })
      }
      await page.setViewportSize({ width: 1440, height: 1100 })
    }
    await context.close()
  } finally { await browser.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await workPaginationJourney()
