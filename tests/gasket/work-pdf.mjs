// Read the real downloaded PDFs with an independent reader, including original attachments.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { png } from './fixtures.mjs'
import { file, harness } from './harness.mjs'
import { zone } from './clock.mjs'

const mime = (type, subtype) => [type, subtype].join('/')

async function read(bytes) {
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true })
  const pdf = await task.promise
  try {
    let text = '', images = 0
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      text += (await page.getTextContent()).items.map(item => item.str ?? '').join(' ') + '\n'
      images += (await page.getOperatorList()).fnArray.filter(op => [OPS.paintImageXObject, OPS.paintInlineImageXObject].includes(op)).length
    }
    return { text: text.replace(/\s+/g, ' '), images, pages: pdf.numPages, attachments: await pdf.getAttachments() }
  } finally { await task.destroy() }
}

export async function workPdfJourney() {
  const h = await harness()
  try {
    const cookie = { owner: await h.owner() }, ids = {}
    await h.api('site.configure', cookie.owner, { name: 'Report test plant', timezone: zone })
    for (const [key, role] of [['lead', 'lead'], ['tech', 'maintainer'], ['supervisor', 'supervisor'], ['agent', 'agent']]) {
      ids[key] = (await h.api('access.give', cookie.owner, { name: key, email: `${key}@example.test`, role })).id
      cookie[key] = await h.signIn(`${key}@example.test`)
    }
    const today = (await h.api('me', cookie.owner)).today
    const asset = (await h.api('asset.create', cookie.lead, { tag: 'REPORT-1', name: 'Chiller', location: 'Cold room' })).id
    const checklist = (await h.api('checklist.create', cookie.lead, { name: 'Chiller inspection', items: ['Inspect door seal', 'Inspect fan'] })).id
    const schedule = (await h.api('schedule.create', cookie.lead, { asset, checklist, title: 'Chiller inspection', everyDays: 30, firstDue: today, assignee: ids.tech })).id
    const work = (await h.api('workorders.generate', cookie.lead, {})).created.find(row => row.schedule === schedule).id
    const path = `/app/work/${work}/report.pdf`
    const detail = () => h.api(`work/${work}`, cookie.supervisor)
    const report = async who => {
      const response = await h.raw(path, { cookie: cookie[who] })
      assert.equal(response.status, 200, (await response.clone().text()).slice(0, 200))
      assert.equal(response.headers.get('content-type'), mime('application', 'pdf'))
      assert.match(response.headers.get('cache-control'), /no-store/)
      assert.match(response.headers.get('content-disposition'), /attachment; filename="WO-\d+\.pdf"/)
      return read(await response.arrayBuffer())
    }
    await h.api('workorder.acknowledge', cookie.tech, { workOrder: work })
    assert.match((await report('tech')).text, /Status: open|Status: in_progress/)
    await h.api('workorder.results', cookie.tech, { workOrder: work, outcome: ['fail', 'pass'], note: ['Seal torn; replaced', 'Fan clear'] })
    await h.api('finding.record', cookie.tech, { workOrder: work, item: 0, severity: 'low', text: 'Replacement seal fitted and inspected' })
    const meter = []
    for (const [name, unit] of [['Cabinet temperature', '°C'], ['Supply pressure', 'bar']]) meter.push((await h.api('meter.create', cookie.lead, { asset, name, unit, kind: 'gauge' })).id)
    await h.api('workorder.readings', cookie.tech, { workOrder: work, takenOn: `${today}T09:00`, meter, value: ['-18', '2'] })
    const part = (await h.api('part.create', cookie.lead, { number: 'SEAL-1', name: 'Door gasket', unit: 'each', minimum: '0' })).id
    await h.api('part.receive', cookie.lead, { part, quantity: '4', unitPrice: '12.34' })
    await h.api('workorder.issue', cookie.tech, { workOrder: work, part, quantity: '2' })
    await h.api('workorder.return', cookie.tech, { workOrder: work, part, quantity: '1' })
    await h.api('work.cost', cookie.lead, { workOrder: work, category: 'labor', amount: '123.45', note: 'Private labor rate marker' })
    await h.api('work.cost', cookie.lead, { workOrder: work, category: 'contractor', amount: '67.89', note: 'Private contractor charge marker' })
    await h.api('comment.post', cookie.tech, { workOrder: work, body: 'Replaced gasket; verified cabinet temperature.\n' + 'Inspection note repeated for pagination.\n'.repeat(30) })
    await h.api('workorder.sign', cookie.tech, { workOrder: work, version: (await detail()).version, role: 'customer', name: 'Customer Morgan' })
    const photos = []
    for (const filename of ['seal-before.png', 'seal-after.png']) photos.push((await h.api('workorder.evidence', cookie.tech, { workOrder: work, file: file(filename, png, mime('image', 'png')) })).evidence)
    assert.match((await report('supervisor')).text, /Customer Morgan.*STALE/)
    await h.api('workorder.sign', cookie.tech, { workOrder: work, version: (await detail()).version, role: 'customer', name: 'Customer Morgan' })
    await h.api('workorder.submit', cookie.tech, { workOrder: work, version: (await detail()).version })
    await h.api('workorder.review', cookie.supervisor, { workOrder: work, version: (await detail()).version, decision: 'approve', reason: 'Inspection and evidence accepted' })
    const full = await report('supervisor'), restricted = await report('tech'), source = await detail()
    for (const text of ['Chiller', 'Cold room', 'Procedure: Chiller inspection; revision 1', 'Inspect door seal', 'fail', 'Seal torn; replaced', 'Inspect fan', 'Fan clear', 'Cabinet temperature: -18 °C', 'Supply pressure: 2 bar', 'issued 2, returned 1, used 1 each', 'USD 12.34', 'Customer Morgan', 'CURRENT', 'approved', 'Inspection and evidence accepted', 'Private labor rate marker', 'USD 123.45', 'USD 67.89', 'workorder.approve']) assert.ok(full.text.includes(text), text)
    for (const text of ['123.45', '67.89', '12.34', 'Private labor rate marker', 'Private contractor charge marker', '"cents"']) assert.equal(restricted.text.includes(text), false, `restricted PDF withholds ${text}`)
    const audit = (await h.api('audit?limit=500', cookie.supervisor)).rows.filter(row => row.subject === work)
    for (const entry of audit) {
      assert.ok(full.text.includes(`Entry ${entry.seq};`), `audit entry ${entry.seq}`)
      assert.ok(full.text.includes(entry.action))
      assert.ok(full.text.replace(/\s/g, '').includes(entry.detail.replace(/\s/g, '')), `audit payload ${entry.seq}`)
    }
    for (const step of source.items) assert.ok(full.text.includes(step.text) && full.text.includes(step.result.outcome))
    for (const entry of source.reviews) assert.ok(full.text.includes(entry.decision))
    assert.ok(full.pages >= 2 && full.images === 2, 'pagination and two embedded photos')
    for (const photo of source.evidence) {
      assert.ok(full.text.includes(photo.sha256))
      const attached = Object.values(full.attachments).find(item => item.filename === `${photo.id}-${photo.filename}`)
      assert.ok(attached)
      assert.equal(createHash('sha256').update(attached.content).digest('hex'), photo.sha256)
    }
    assert.equal((await h.raw(path)).status, 303)
    assert.equal((await h.raw(path, { cookie: cookie.agent })).status, 403)
    assert.equal((await h.raw('/app/work/missing/report.pdf', { cookie: cookie.lead })).status, 404)
    const unnumbered = await h.raw('/app/work-reports.zip?numbers=abc', { cookie: cookie.lead })
    assert.equal(unnumbered.status, 400)
    assert.equal((await h.raw('/app/work-reports.zip?numbers=999999', { cookie: cookie.lead })).status, 404)
    assert.equal((await h.raw('/app/work-reports.zip?' + Array.from({length: 21}, (_, i) => `work=synthetic-gasket-${i}`).join('&'), { cookie: cookie.lead })).status, 400)
    const others = []
    for (const title of ['Open inspection 2', 'Open inspection 3']) others.push((await h.api('workorder.create', cookie.lead, { asset, title, due: today, assignee: ids.tech })).id)
    const bundle = '/app/work-reports.zip?' + [work, ...others].map(id => `work=${id}`).join('&')
    assert.equal((await h.raw(bundle, { cookie: cookie.tech })).status, 403)
    assert.equal((await h.raw('/app/work-reports.zip', { cookie: cookie.lead })).status, 400)
    const response = await h.raw(bundle, { cookie: cookie.lead })
    assert.equal(response.status, 200)
    const bytes = Buffer.from(await response.arrayBuffer()), entries = []
    for (let at = 0; bytes.readUInt32LE(at) === 0x04034b50;) {
      const size = bytes.readUInt32LE(at + 18), length = bytes.readUInt16LE(at + 26), start = at + 30 + length
      entries.push([bytes.subarray(at + 30, start).toString(), await read(bytes.subarray(start, start + size))]); at = start + size
    }
    assert.equal(entries.length, 3)
    assert.equal(new Set(entries.map(([name]) => name)).size, 3)
    assert.ok(entries.every(([name, pdf]) => /^WO-\d+\.pdf$/.test(name) && pdf.pages > 0))
    if (process.env.REPORT_SCREENSHOTS) {
      await mkdir(process.env.REPORT_SCREENSHOTS, { recursive: true })
      const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
      try {
        const context = await browser.newContext({ ignoreHTTPSErrors: true })
        await context.addCookies(cookie.lead.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
        const page = await context.newPage()
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 })
          assert.equal((await page.goto(h.origin + `/app/work/${work}`)).status(), 200)
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
          const icons = await page.locator('a, button, summary').evaluateAll(elements => elements.filter(el => el.getBoundingClientRect().width && !el.textContent.trim()).map(el => el.outerHTML))
          assert.deepEqual(icons, [], 'work detail has no icon-only controls needing tooltips')
          const download = page.waitForEvent('download')
          await page.getByRole('link', { name: 'Download work PDF', exact: true }).click()
          assert.match((await download).suggestedFilename(), /^WO-\d+\.pdf$/)
          await page.getByText('Download several work PDFs', { exact: true }).click()
          const numbers = [source.number, ...(await Promise.all(others.map(id => h.api(`work/${id}`, cookie.lead)))).map(row => row.number)].join(', ')
          await page.getByLabel('Work order numbers').fill(numbers)
          const bundleDownload = page.waitForEvent('download')
          await page.getByRole('button', { name: 'Download PDFs as ZIP', exact: true }).click()
          assert.equal((await bundleDownload).suggestedFilename(), 'work-orders.zip')
          await page.screenshot({ path: `${process.env.REPORT_SCREENSHOTS}/work-report-${width}.png`, fullPage: true })
        }
      } finally { await browser.close() }
    }
  } finally { await h.close() }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { await workPdfJourney(); console.log('Work PDF completeness, financial privacy, evidence and bulk ZIP passed') }
