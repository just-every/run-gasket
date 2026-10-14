// The first-release journey in a real browser at 1440 and 390 pixels, from a
// disposable fresh clone through `rer`: setup, preview of the production
// build, the owner's first run, a lead's register, a maintainer's work order
// and a supervisor's review on the screens, the board, the MaintainX dry run,
// then export and restore into a second fresh clone with the asset history
// unchanged. Every person and asset is invented.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative, resolve, isAbsolute } from 'node:path'
import { command, devKey, serving, signIn } from './cli.mjs'
import { assetsCsv, partsCsv, png, readingsCsv } from './fixtures.mjs'

assert.equal(process.env.GASKET_TEST_CHECKOUT, '1', 'Set GASKET_TEST_CHECKOUT=1 only in a disposable fresh git clone')
const root = process.cwd()
const evidence = resolve(process.env.GASKET_EVIDENCE_DIR ?? join(tmpdir(), 'gasket-evidence'))
const inside = relative(root, evidence)
if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) throw new Error('GASKET_EVIDENCE_DIR must be outside the checkout')
await mkdir(evidence, { recursive: true })
await access(join(root, '.dev.vars')).then(() => { throw new Error('The journey needs an unconfigured fresh clone') }, error => { if (error.code !== 'ENOENT') throw error })

const freePort = async () => { const socket = createServer(); await new Promise(done => socket.listen(0, '127.0.0.1', done)); const { port } = socket.address(); await new Promise(done => socket.close(done)); return port }
const port = await freePort()
const origin = `http://127.0.0.1:${port}`
const zone = 'Australia/Sydney'
const clock = minutes => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(Date.now() - minutes * 60_000).map(part => [part.type, part.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` }
const today = clock(0).slice(0, 10)
const addDays = (date, days) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10) }
const scratch = await mkdtemp(join(tmpdir(), 'gasket-journey-'))
const shots = []
let server, browser

async function setUp(checkout) {
  await mkdir(join(checkout, 'exports'), { recursive: true })
  await writeFile(join(checkout, 'exports/answers.json'), JSON.stringify({ OWNER_EMAIL: 'owner@example.test' }), { mode: 0o600 })
  await command(checkout, ['setup', '--answers', 'exports/answers.json', '--non-interactive', '--port', String(port)])
  await rm(join(checkout, 'exports/answers.json'))
}

function api(cookie) {
  return async (path, body, status = 200) => {
    const response = await fetch(`${origin}/api/gasket/${path}`, { method: body ? 'POST' : 'GET', headers: { cookie, ...(body ? { origin, 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const text = await response.text()
    assert.equal(response.status, status, `${path}: ${text.slice(0, 300)}`)
    return JSON.parse(text)
  }
}

async function contextFor(cookie, width) {
  const context = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 } })
  if (cookie) await context.addCookies(cookie.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: origin } }))
  return context
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const width = page.viewportSize().width
  assert.ok(overflow <= 0, `${name} scrolls sideways by ${overflow}px at ${width}`)
  const path = join(evidence, `${width}-${name}.png`)
  // Grow the viewport to the whole page so the sticky action bar is drawn where it rests, at the end.
  const viewport = page.viewportSize(), height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.setViewportSize({ width, height: Math.max(viewport.height, height) })
  await page.screenshot({ path })
  await page.setViewportSize(viewport)
  shots.push({ name, width, path: new URL(page.url()).pathname })
}

const saved = page => page.waitForURL(/notice=/)

try {
  await setUp(root)
  server = await serving(root, 'preview', port)
  const key = await devKey(root)
  const owner = await signIn(origin, key, 'owner@example.test')
  browser = await chromium.launch()
  // Finish setup as the owner sees it, then confirm it.
  for (const width of [1440, 390]) {
    const context = await contextFor(owner, width), page = await context.newPage()
    await page.goto(`${origin}/setup`)
    await page.getByRole('heading', { name: 'Finish setup' }).waitFor()
    await shot(page, 'setup')
    await context.close()
  }
  assert.equal((await fetch(`${origin}/setup`, { method: 'POST', redirect: 'manual', headers: { cookie: owner, origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'confirm=yes' })).status, 303)

  // Signed out: the installed Lobby and the sign-in page.
  for (const width of [1440, 390]) {
    const context = await contextFor('', width), page = await context.newPage()
    await page.goto(`${origin}/`); await shot(page, 'lobby')
    await page.goto(`${origin}/signin`); await shot(page, 'sign-in')
    await context.close()
  }

  // The owner's first run: name the site on the screen.
  {
    const context = await contextFor(owner, 390), page = await context.newPage()
    await page.goto(`${origin}/app`)
    assert.equal(new URL(page.url()).pathname, '/app/site')
    await shot(page, 'site-first-run')
    await context.close()
  }
  {
    const context = await contextFor(owner, 1440), page = await context.newPage()
    await page.goto(`${origin}/app`)
    assert.equal(new URL(page.url()).pathname, '/app/site')
    await shot(page, 'site-first-run')
    await page.getByLabel('Site name').fill('Harbour Kitchen Co')
    await page.getByLabel('Time zone').selectOption(zone)
    await page.getByRole('button', { name: 'Save and register equipment' }).click(); await saved(page)
    assert.equal(new URL(page.url()).pathname, '/app/assets')
    await shot(page, 'assets-empty')
    await context.close()
    const phone = await contextFor(owner, 390), small = await phone.newPage()
    await small.goto(`${origin}/app/assets`)
    await shot(small, 'assets-empty')
    await phone.close()
  }
  const as = { owner: api(owner) }
  const ids = {}
  for (const [name, email, role] of [['Lena Park', 'lead@example.test', 'lead'], ['Max Ortiz', 'max@example.test', 'maintainer'], ['Sam Ito', 'sam@example.test', 'supervisor'], ['Upkeep agent', 'agent@example.test', 'agent']]) {
    await as.owner('access.give', { name, email, role })
  }
  const cookie = { owner }
  for (const who of ['lead', 'max', 'sam', 'agent']) { cookie[who] = await signIn(origin, key, `${who}@example.test`); as[who] = api(cookie[who]) }
  const members = Object.fromEntries((await as.owner('members')).map(member => [member.email.split('@')[0], member.id]))

  // The lead registers the compressor on the screen; the rest of the register through the shared API.
  {
    const context = await contextFor(cookie.lead, 1440), page = await context.newPage()
    await page.goto(`${origin}/app/assets`)
    const form = page.locator('form[action="/app/do/asset.create"]')
    await form.getByLabel('Asset tag').fill('HK-001')
    await form.getByLabel('Name').fill('Walk-in cooler compressor')
    await form.getByLabel('Serial').fill('CMP-20419')
    await form.getByLabel('Location').fill('Kitchen plant room')
    await form.getByLabel('Custodian').fill('Dana Reyes')
    await form.getByLabel('Category').fill('Refrigeration')
    await form.getByLabel('Criticality').selectOption('critical')
    await form.getByRole('button', { name: 'Register asset' }).click(); await saved(page)
    ids.compressor = new URL(page.url()).pathname.split('/').pop()
    await context.close()
  }
  ids.runHours = (await as.lead('meter.create', { asset: ids.compressor, name: 'Run hours', unit: 'h', kind: 'counter' })).id
  ids.discharge = (await as.lead('meter.create', { asset: ids.compressor, name: 'Discharge temperature', unit: '°C', kind: 'gauge' })).id
  ids.oil = (await as.lead('meter.create', { asset: ids.compressor, name: 'Oil condition', unit: 'condition', kind: 'condition' })).id
  ids.fryer = (await as.lead('asset.create', { tag: 'HK-002', name: 'Twin fryer', serial: 'FRY-88', location: 'Hot line', custodian: 'Dana Reyes', category: 'Cooking' })).id
  await as.lead('asset.sighting', { asset: ids.compressor, outcome: 'found' })
  ids.drier = (await as.lead('part.create', { number: 'FD-164', name: 'Filter drier', unit: 'each', minimum: '4', location: 'Store room' })).id
  ids.oilPart = (await as.lead('part.create', { number: 'OIL-POE32', name: 'Compressor oil', unit: 'L', minimum: '1', location: 'Store room' })).id
  await as.lead('part.receive', { part: ids.drier, quantity: '5', note: 'Docket 4471' })
  await as.lead('part.receive', { part: ids.oilPart, quantity: '4' })
  const drier = await as.lead(`parts/${ids.drier}`)
  await as.lead('part.count', { part: ids.drier, counted: '4', seen: drier.seen, note: 'Shelf count' })
  ids.checklist = (await as.lead('checklist.create', { name: 'Monthly compressor check', items: ['Check for unusual noise or vibration', 'Inspect for refrigerant and oil leaks', 'Clean condenser coils', 'Check electrical connections'] })).id
  await as.lead('schedule.create', { asset: ids.compressor, checklist: ids.checklist, title: 'Monthly compressor check', everyDays: 30, firstDue: today, assignee: members.max })
  await as.lead('schedule.create', { asset: ids.compressor, checklist: ids.checklist, title: '500-hour service', meter: ids.runHours, everyUnits: '500', firstDueMeter: '12500', assignee: members.max })
  await as.lead('schedule.create', { asset: ids.fryer, checklist: ids.checklist, title: 'Quarterly fryer check', everyDays: 90, firstDue: addDays(today, 40) })
  ids.pm = (await as.lead('workorders.generate', {})).created[0].id
  ids.overdue = (await as.lead('workorder.create', { asset: ids.fryer, title: 'Replace fryer thermostat', due: addDays(today, -2), assignee: members.max })).id
  await as.agent('proposal.prepare', { kind: 'corrective', reasoning: 'Run hours rose 408 h since the last service and discharge temperature reached 41 °C; inspect the condenser fan.', payload: { asset: ids.compressor, title: 'Inspect condenser fan', due: addDays(today, 5), assignee: members.max } })
  await as.agent('proposal.prepare', { kind: 'count', reasoning: 'Two filter driers were issued since the last count; the shelf photo shows three.', payload: { part: ids.drier, counted: '3' } })

  // The maintainer works the order on the screen: checklist results, then the rest of the record.
  {
    const context = await contextFor(cookie.max, 1440), page = await context.newPage()
    await page.goto(`${origin}/app?mine=1`); await shot(page, 'work-mine')
    await page.getByRole('link', { name: /Monthly compressor check/ }).click()
    const items = page.locator('.gk-checklist > li')
    for (const [index, outcome, note] of [[0, 'Pass', 'Running normally'], [1, 'Pass', 'No leaks'], [2, 'Needs attention', 'Light dust, cleaned'], [3, 'Fail', 'Loose terminal at contactor, tightened']]) {
      await items.nth(index).getByRole('radio', { name: outcome }).check()
      await items.nth(index).getByLabel('Note').fill(note)
    }
    await page.getByRole('button', { name: 'Save results' }).click(); await saved(page)
    await context.close()
  }
  await as.max('workorder.readings', { workOrder: ids.pm, takenOn: clock(150), meter: [ids.runHours, ids.discharge, ids.oil], value: ['12408', '41', 'good'] })
  await as.max('workorder.issue', { workOrder: ids.pm, part: ids.drier, quantity: '2' })
  await as.max('workorder.return', { workOrder: ids.pm, part: ids.drier, quantity: '1' })
  await as.max('workorder.issue', { workOrder: ids.pm, part: ids.oilPart, quantity: '0.5' })
  await as.max('downtime.start', { workOrder: ids.pm, startedOn: clock(110), reason: 'Isolated for coil cleaning' })
  await as.max('downtime.end', { workOrder: ids.pm, endedOn: clock(79) })
  await as.max('workorder.evidence', { workOrder: ids.pm, file: { filename: 'condenser-coils.png', base64: png.toString('base64') } })
  await as.max('finding.record', { workOrder: ids.pm, severity: 'medium', text: 'Loose terminal at the contactor; tightened. The contactor shows arcing and should be replaced.', followUp: true, followUpDue: addDays(today, 3) })
  for (const width of [1440, 390]) {
    const context = await contextFor(cookie.max, width), page = await context.newPage()
    await page.goto(`${origin}/app/work/${ids.pm}`); await shot(page, 'work-order-maintainer')
    if (width === 390) {
      await page.getByRole('button', { name: 'Submit for review' }).click(); await saved(page)
      assert.match(await page.locator('.gk-band').innerText(), /Waiting for review/)
    }
    await context.close()
  }

  // The supervisor reviews on the screen and approves the exact version.
  for (const width of [390, 1440]) {
    const context = await contextFor(cookie.sam, width), page = await context.newPage()
    await page.goto(`${origin}/app/work/${ids.pm}`); await shot(page, 'work-order-review')
    if (width === 1440) {
      await page.getByRole('button', { name: 'Approve and close' }).click(); await saved(page)
      assert.match(await page.locator('.gk-band').innerText(), /Reviewed and closed/)
      await shot(page, 'work-order-closed')
    }
    await page.goto(`${origin}/app/board`); await shot(page, 'board')
    await context.close()
  }
  await as.max('downtime.start', { workOrder: ids.overdue, startedOn: clock(60), reason: 'Thermostat failed, fryer off' })

  // Every main screen at both widths.
  const screens = [
    ['lead', '/app', 'work'], ['lead', '/app/assets', 'assets'], ['lead', `/app/assets/${ids.compressor}`, 'asset'], ['lead', '/app/schedules', 'schedules'],
    ['lead', `/app/checklists/${ids.checklist}`, 'checklist'], ['lead', '/app/parts', 'parts'], ['lead', `/app/parts/${ids.drier}`, 'part'], ['lead', '/app/proposals', 'proposals'],
    ['lead', '/app/move-in', 'move-in'], ['owner', '/app/access', 'access'], ['owner', '/app/site', 'site'], ['owner', '/app/audit', 'audit'], ['max', '/app/more', 'more'], ['max', `/app/work/${ids.overdue}`, 'work-order-corrective'],
  ]
  for (const width of [1440, 390]) for (const [who, path, name] of screens) {
    const context = await contextFor(cookie[who], width), page = await context.newPage()
    const response = await page.goto(`${origin}${path}`)
    assert.equal(response.status(), 200, path)
    await shot(page, name)
    await context.close()
  }

  // The lead's MaintainX dry run on the screen writes nothing.
  const files = join(scratch, 'maintainx')
  await mkdir(files, { recursive: true })
  await writeFile(join(files, 'assets.csv'), assetsCsv); await writeFile(join(files, 'parts.csv'), partsCsv); await writeFile(join(files, 'meter-readings.csv'), readingsCsv)
  const before = (await as.lead('assets')).length
  for (const width of [1440, 390]) {
    const context = await contextFor(cookie.lead, width), page = await context.newPage()
    await page.goto(`${origin}/app/move-in`)
    await page.getByLabel('Asset export (CSV)').setInputFiles(join(files, 'assets.csv'))
    await page.getByLabel('Part export (CSV)').setInputFiles(join(files, 'parts.csv'))
    await page.getByLabel('Meter reading export (CSV)').setInputFiles(join(files, 'meter-readings.csv'))
    await page.getByRole('button', { name: 'Dry run' }).click()
    await page.getByRole('heading', { name: /Dry run: nothing has been written/ }).waitFor()
    await shot(page, 'move-in-dry-run')
    if (width === 390) { await page.getByRole('button', { name: 'Apply this move-in' }).click(); await saved(page); await shot(page, 'move-in-journal') }
    await context.close()
  }
  assert.equal((await as.lead('assets')).length, before + 3, 'the applied move-in created three assets')

  // Export, then restore into a second fresh clone: the history is unchanged.
  const history = await as.lead(`assets/${ids.compressor}/history`)
  const strip = events => events.map(({ kind, workOrder, what, who, at }) => ({ kind, workOrder, what, who, at }))
  await server.stop(); server = null
  await mkdir(join(root, 'exports'), { recursive: true })
  await command(root, ['export', '--output', 'exports/journey.rer'])
  const target = join(scratch, 'restored')
  const clone = spawn('git', ['clone', '--quiet', '--no-local', root, target], { stdio: 'ignore' })
  assert.equal(await new Promise(done => clone.once('exit', done)), 0, 'fresh target clone')
  await command(target, ['install'])
  await mkdir(join(target, 'exports'), { recursive: true })
  await command(target, ['import', '--input', join(root, 'exports/journey.rer'), '--yes'])
  await setUp(target)
  server = await serving(target, 'preview', port)
  const restoredOwner = await signIn(origin, await devKey(target), 'owner@example.test')
  assert.equal((await fetch(`${origin}/setup`, { method: 'POST', redirect: 'manual', headers: { cookie: restoredOwner, origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'confirm=yes' })).status, 303)
  const restored = await api(restoredOwner)(`assets/${ids.compressor}/history`)
  assert.deepEqual(strip(restored.events), strip(history.events), 'the asset history is unchanged after restore')
  assert.equal(restored.downtimeMinutes, history.downtimeMinutes)
  const order = await api(restoredOwner)(`work/${ids.pm}`)
  assert.equal(order.status, 'closed')
  const evidenceFile = await fetch(`${origin}/app/evidence/${order.evidence[0].id}`, { headers: { cookie: restoredOwner } })
  assert.deepEqual(Buffer.from(await evidenceFile.arrayBuffer()), png, 'evidence bytes restored')
  assert.equal((await api(restoredOwner)('imports')).length, 1, 'the move-in journal restored')
  await server.stop(); server = null
  await writeFile(join(evidence, 'manifest.json'), JSON.stringify({ business: 'Harbour Kitchen Co (synthetic)', scenario: 'first-release journey', shots, restore: { events: history.events.length, downtimeMinutes: history.downtimeMinutes } }, null, 2))
  console.log(`Gasket journey passed: ${shots.length} screenshots at 1440 and 390, export and fresh-clone restore with ${history.events.length} history events unchanged`)
} finally {
  if (browser) await browser.close()
  if (server) await server.stop()
  await rm(scratch, { recursive: true, force: true })
}
