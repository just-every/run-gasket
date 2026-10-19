import { queuedEntrypoint } from '@runeditrun/rer/queued-entry'
const queued = await queuedEntrypoint(import.meta.url, 'test:flows'); if (queued !== null) process.exit(queued)
// Gasket's first-release clauses (ACCEPTANCE.md GAS-01 to GAS-13), each through
// public doors (JSON door, form door, pages and downloads) against the built
// Worker with real local D1. No provider is involved; all people are invented.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { API_DOORS, PAGE_DOORS } from '../../src/gasket/doors.ts'
import { assetsCsv, historyAssetsCsv, laterWorkCsv, partsCsv, png, readingsCsv, workCsv } from './fixtures.mjs'
import { file, harness } from './harness.mjs'
import { installation } from './installation.mjs'

const h = await harness()
const check = async (id, run) => { await run(); console.log(`${id} passed`) }
const zone = 'Australia/Sydney'
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(Date.now()).map(part => [part.type, part.value]))
const today = `${parts.year}-${parts.month}-${parts.day}`
const addDays = (date, days) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10) }
/** The site's wall clock N minutes ago, as a person would type it. */
const localAt = instant => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(part => [part.type, part.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` }
const ago = minutes => localAt(Date.now() - minutes * 60_000)
const ids = {}, cookie = {}
const wo = async (who, id) => await h.api(`work/${id}`, cookie[who])

try {
  await check('GAS-01 site and access', async () => {
    // Signed out: every GET door refuses, no data served.
    for (const [pattern] of API_DOORS) {
      const path = pattern.replace(/^\^|\$$/g, '').replace('([\\w-]+)', 'x').replace(/\\\./g, '.')
      assert.equal((await h.raw(`/api/gasket/${path}`)).status, 401, path)
    }
    for (const [pattern] of PAGE_DOORS) {
      const path = pattern.replace(/^\^|\$$/g, '').replace(/\(\[\\w-\]\+\)/g, 'x').replace(/\\\./g, '.')
      const response = await h.raw(path)
      assert.equal(response.status, 303, path)
      assert.match(response.headers.get('location'), /^\/signin/)
    }
    cookie.owner = await h.owner()
    assert.equal((await h.raw('/app', { cookie: cookie.owner })).headers.get('location'), '/app/site')
    await h.api('site.configure', cookie.owner, { name: 'Harbour Kitchen Co', timezone: 'Mars/Olympus' }, 400)
    assert.equal((await h.submit('site.configure', cookie.owner, { name: 'Harbour Kitchen Co', timezone: zone }, '/app/assets')).searchParams.get('notice'), 'Saved.')
    for (const [key, name, role] of [['lead', 'Lena Park', 'lead'], ['max', 'Max Ortiz', 'maintainer'], ['mo', 'Mo Haddad', 'maintainer'], ['sam', 'Sam Ito', 'supervisor'], ['agent', 'Gasket agent', 'agent'], ['temp', 'Tia Brooks', 'maintainer']]) {
      ids[key] = (await h.api('access.give', cookie.owner, { name, email: `${key}@example.test`, role })).id
      cookie[key] = await h.signIn(`${key}@example.test`)
      assert.equal((await h.api('me', cookie[key])).role, role)
    }
    await h.api('access.give', cookie.owner, { name: 'Again', email: 'max@example.test', role: 'lead' }, 409)
    // Roles are checked in every handler: the JSON door and the form door both refuse.
    await h.api('site.configure', cookie.max, { name: 'Taken over', timezone: zone }, 403)
    await h.api('access.give', cookie.lead, { name: 'X', email: 'x@example.test', role: 'lead' }, 403)
    assert.equal((await h.submit('asset.create', cookie.max, { tag: 'X-1', name: 'Rogue', location: 'Nowhere' }, '/app/assets')).searchParams.get('error'), 'forbidden')
    assert.equal((await h.raw('/app/access', { cookie: cookie.max })).status, 403)
    await h.api('members', cookie.lead, undefined, 403)
    // Change a role, then end access: the old session stops working at once.
    await h.api('access.role', cookie.owner, { member: ids.temp, role: 'supervisor' })
    assert.equal((await h.api('board', cookie.temp)).overdue.length, 0)
    await h.api('access.end', cookie.owner, { member: ids.temp })
    const ended = await h.raw('/api/gasket/assets', { cookie: cookie.temp })
    assert.ok([401, 403].includes(ended.status), `ended access answers ${ended.status}`)
    assert.ok(!(await ended.text()).includes('Harbour'), 'no data after access ends')
    const people = await h.api('members', cookie.owner)
    assert.equal(people.find(person => person.id === ids.temp).status, 'ended')
  })

  await check('GAS-02 asset register', async () => {
    const created = await h.submit('asset.create', cookie.lead, { tag: 'HK-001', name: 'Walk-in cooler compressor', serial: 'CMP-20419', location: 'Kitchen plant room', custodian: 'Dana Reyes', category: 'Refrigeration', criticality: 'critical' }, '/app/assets/{id}')
    ids.compressor = created.pathname.split('/').pop()
    await h.api('asset.create', cookie.lead, { tag: 'HK-001', name: 'Duplicate', location: 'X' }, 409)
    ids.runHours = (await h.api('meter.create', cookie.lead, { asset: ids.compressor, name: 'Run hours', unit: 'h', kind: 'counter' })).id
    ids.discharge = (await h.api('meter.create', cookie.lead, { asset: ids.compressor, name: 'Discharge temperature', unit: '°C', kind: 'gauge' })).id
    ids.oil = (await h.api('meter.create', cookie.lead, { asset: ids.compressor, name: 'Oil condition', unit: 'condition', kind: 'condition' })).id
    await h.api('asset.update', cookie.lead, { asset: ids.compressor, revision: 1, tag: 'HK-001', name: 'Walk-in cooler compressor', serial: 'CMP-20419', location: 'Plant room A', custodian: 'Dana Reyes', category: 'Refrigeration', criticality: 'critical' })
    await h.api('asset.update', cookie.lead, { asset: ids.compressor, revision: 1, tag: 'HK-001', name: 'Stale edit', location: 'X' }, 409)
    const asset = await h.api(`assets/${ids.compressor}`, cookie.max)
    assert.equal(asset.location, 'Plant room A')
    assert.equal(asset.versions[0].value.location, 'Kitchen plant room', 'the earlier identity is kept')
    assert.equal(asset.meters.length, 3)
    await h.api('asset.sighting', cookie.lead, { asset: ids.compressor, outcome: 'found' })
    ids.fryer = (await h.api('asset.create', cookie.lead, { tag: 'HK-002', name: 'Twin fryer', serial: 'FRY-88', location: 'Hot line', criticality: 'normal' })).id
    await h.api('asset.sighting', cookie.lead, { asset: ids.fryer, outcome: 'elsewhere', seenLocation: 'Back dock' })
    ids.oldMixer = (await h.api('asset.create', cookie.lead, { tag: 'HK-009', name: 'Old planetary mixer', location: 'Bakery' })).id
    await h.api('asset.sighting', cookie.lead, { asset: ids.oldMixer, outcome: 'missing', note: 'Not on the floor' })
    await h.api('asset.retire', cookie.lead, { asset: ids.oldMixer, reason: 'Scrapped' })
    await h.api('asset.update', cookie.lead, { asset: ids.oldMixer, revision: 2, tag: 'HK-009', name: 'Back', location: 'X' }, 409)
    const list = await h.api('assets', cookie.max)
    assert.equal(list.find(row => row.id === ids.oldMixer).status, 'retired')
    assert.match(list.find(row => row.id === ids.fryer).last_sighting, /^elsewhere\|/)
    await h.api('asset.create', cookie.max, { tag: 'HK-777', name: 'Rogue', location: 'X' }, 403)
    await h.api('meter.create', cookie.sam, { asset: ids.compressor, name: 'X', unit: 'h', kind: 'counter' }, 403)
    assert.match(await (await h.raw(`/app/assets/${ids.compressor}`, { cookie: cookie.max })).text(), /Plant room A/)
  })

  await check('GAS-03 parts and physical counts', async () => {
    ids.drier = (await h.api('part.create', cookie.lead, { number: 'FD-164', name: 'Filter drier', unit: 'each', minimum: '4', location: 'Store room' })).id
    ids.oilPart = (await h.api('part.create', cookie.lead, { number: 'OIL-POE32', name: 'Compressor oil', unit: 'L', minimum: '1' })).id
    await h.api('part.create', cookie.lead, { number: 'FD-164', name: 'Dup', unit: 'each' }, 409)
    await h.api('part.receive', cookie.lead, { part: ids.drier, quantity: '5', note: 'Docket 4471' })
    await h.api('part.receive', cookie.lead, { part: ids.oilPart, quantity: '4.25' })
    await h.api('part.receive', cookie.lead, { part: ids.drier, quantity: '1.0005' }, 400)
    await h.api('part.receive', cookie.max, { part: ids.drier, quantity: '1' }, 403)
    const before = (await h.api(`parts/${ids.drier}`, cookie.lead))
    assert.equal(before.onHand, '5')
    const counted = await h.api('part.count', cookie.lead, { part: ids.drier, counted: '4', seen: before.seen, note: 'Shelf count' })
    assert.equal(counted.variance, '-1')
    await h.api('part.count', cookie.lead, { part: ids.drier, counted: '9', seen: before.seen }, 409)
    const after = await h.api(`parts/${ids.drier}`, cookie.max)
    assert.equal(after.onHand, '4')
    assert.deepEqual(after.moves.map(move => move.kind), ['count', 'receive'], 'the receipt stays; the count posts its own movement')
    assert.equal(after.moves[0].counted, '4')
    assert.match(await (await h.raw(`/app/parts/${ids.drier}`, { cookie: cookie.lead })).text(), /Physical count/)
  })

  await check('GAS-04 checklist revisions', async () => {
    const created = await h.submit('checklist.create', cookie.lead, { name: 'Monthly compressor check', items: 'Check for unusual noise or vibration\nInspect for refrigerant and oil leaks\nClean condenser coils\nCheck electrical connections' }, '/app/checklists/{id}')
    ids.checklist = created.pathname.split('/').pop()
    ids.schedule = (await h.api('schedule.create', cookie.lead, { asset: ids.compressor, checklist: ids.checklist, title: 'Monthly compressor check', everyDays: 30, firstDue: today, assignee: ids.max })).id
    ids.pm = (await h.api('workorders.generate', cookie.lead, {})).created[0].id
    await h.api('checklist.revise', cookie.lead, { checklist: ids.checklist, items: ['Check for unusual noise or vibration', 'Inspect for leaks', 'Clean condenser coils', 'Check electrical connections', 'Check door gasket seal'], note: 'Added door gasket' })
    const detail = await h.api(`checklists/${ids.checklist}`, cookie.max)
    assert.deepEqual(detail.revisions.map(revision => revision.number), [2, 1])
    const order = await wo('max', ids.pm)
    assert.equal(order.checklist_revision, 1, 'issued work keeps its revision')
    assert.equal(order.items.length, 4)
    await h.api('checklist.revise', cookie.max, { checklist: ids.checklist, items: ['X'], note: 'x' }, 403)
  })

  await check('GAS-05 schedules create due work once', async () => {
    assert.equal((await h.api('workorders.generate', cookie.lead, {})).created.length, 0, 'no second open work order for a schedule')
    ids.meterSchedule = (await h.api('schedule.create', cookie.lead, { asset: ids.compressor, checklist: ids.checklist, title: '500-hour service', meter: ids.runHours, everyUnits: '500', firstDueMeter: '12500', assignee: ids.max })).id
    ids.later = (await h.api('schedule.create', cookie.lead, { asset: ids.fryer, checklist: ids.checklist, title: 'Quarterly fryer check', everyDays: 90, firstDue: addDays(today, 40) })).id
    await h.api('schedule.create', cookie.lead, { asset: ids.fryer, checklist: ids.checklist, title: 'No cadence' }, 400)
    await h.api('schedule.create', cookie.lead, { asset: ids.compressor, checklist: ids.checklist, title: 'Gauge meter', meter: ids.discharge, everyUnits: '5' }, 400)
    assert.equal((await h.api('workorders.generate', cookie.lead, {})).created.length, 0, 'not due yet: meter below 12500 and the fryer 40 days out')
    await h.api('workorders.generate', cookie.max, {}, 403)
    const schedules = await h.api('schedules', cookie.max)
    assert.equal(schedules.find(row => row.id === ids.schedule).open_work, ids.pm)
    const page = await (await h.raw('/app', { cookie: cookie.max })).text()
    assert.match(page, /Monthly compressor check/)
  })

  await check('GAS-06 assign work', async () => {
    const mine = await h.api('work?mine=1', cookie.max)
    assert.deepEqual(mine.map(row => row.id), [ids.pm])
    assert.equal((await h.api('work?mine=1', cookie.mo)).length, 0)
    await h.api('workorder.assign', cookie.lead, { workOrder: ids.pm, assignee: ids.mo })
    assert.equal((await h.api('work?mine=1', cookie.mo))[0].id, ids.pm)
    await h.api('workorder.assign', cookie.lead, { workOrder: ids.pm, assignee: ids.agent }, 409)
    await h.api('workorder.assign', cookie.lead, { workOrder: ids.pm, assignee: ids.sam }, 409)
    await h.api('workorder.assign', cookie.max, { workOrder: ids.pm, assignee: ids.max }, 403)
    await h.submit('workorder.assign', cookie.lead, { workOrder: ids.pm, assignee: ids.max }, `/app/work/${ids.pm}`)
    assert.equal((await wo('max', ids.pm)).assignee_id, ids.max)
    ids.corrective = (await h.api('workorder.create', cookie.lead, { asset: ids.fryer, title: 'Replace fryer thermostat', due: addDays(today, -2), assignee: ids.mo })).id
    assert.equal((await wo('mo', ids.corrective)).kind, 'corrective')
    // The Work panel's decision on overdue work: keeping it with its holder is offered first and chosen, the person
    // deciding is never offered to take it, and once decided the panel shows the decision instead of the plans.
    const panel = await (await h.raw('/app', { cookie: cookie.lead })).text()
    assert.match(panel, /value="keep" checked><span><b>Keep with Mo Haddad/)
    assert.doesNotMatch(panel, new RegExp(`value="to:${ids.lead}"`))
    // "Assigned to me" narrows the table, not the site's overdue decision.
    assert.match(await (await h.raw('/app?mine=1', { cookie: cookie.lead })).text(), /value="keep" checked><span><b>Keep with Mo Haddad/)
    await h.api('workorder.plan', cookie.lead, { workOrder: ids.corrective, plan: `to:${ids.lead}` }, 409)
    await h.api('workorder.plan', cookie.max, { workOrder: ids.corrective, plan: 'keep' }, 403)
    await h.submit('workorder.plan', cookie.lead, { workOrder: ids.corrective, plan: 'keep' })
    assert.match(await (await h.raw('/app', { cookie: cookie.lead })).text(), /Kept with Mo Haddad/)
    await h.api('workorder.plan', cookie.owner, { workOrder: ids.corrective, plan: `to:${ids.max}` })
    assert.equal((await wo('max', ids.corrective)).assignee_id, ids.max)
    await h.api('workorder.plan', cookie.owner, { workOrder: ids.corrective, plan: `to:${ids.mo}` })
    assert.deepEqual((await wo('mo', ids.corrective)).decisions.map(row => [row.plan, row.to]), [['reassign', 'Mo Haddad'], ['reassign', 'Max Ortiz'], ['keep', null]])
  })

  await check('GAS-07 inspection, evidence and readings', async () => {
    const order = await wo('max', ids.pm)
    await h.api('workorder.results', cookie.mo, { workOrder: ids.pm, outcome: ['pass', '', '', ''], note: ['', '', '', ''] }, 403)
    // The form door: one outcome-N and note-N per item.
    await h.submit('workorder.results', cookie.max, { workOrder: ids.pm, version: String(order.version), 'outcome-0': 'pass', 'note-0': 'Running normally', 'outcome-1': 'pass', 'note-1': 'No leaks' }, `/app/work/${ids.pm}`)
    await h.api('workorder.results', cookie.max, { workOrder: ids.pm, version: order.version, outcome: ['fail', '', '', ''], note: ['', '', '', ''] }, 409)
    await h.api('workorder.evidence', cookie.max, { workOrder: ids.pm, file: file('condenser.png', png, 'image/png') })
    await h.api('workorder.evidence', cookie.max, { workOrder: ids.pm, file: file('notes.exe', 'MZ') }, 400)
    const takenOn = ago(150)
    await h.api('workorder.readings', cookie.max, { workOrder: ids.pm, takenOn, meter: [ids.runHours, ids.discharge, ids.oil], value: ['12408', '41', 'good'] })
    await h.api('workorder.readings', cookie.max, { workOrder: ids.pm, takenOn, meter: [ids.runHours], value: ['12000'] }, 409)
    await h.api('workorder.readings', cookie.max, { workOrder: ids.pm, takenOn: `${addDays(today, 2)}T08:00`, meter: [ids.discharge], value: ['40'] }, 400)
    await h.api('workorder.readings', cookie.max, { workOrder: ids.pm, takenOn, meter: [ids.oil], value: ['excellent'] }, 400)
    // Two people reading one counter at once on different work orders: one reading wins, the counter never goes back.
    const lead = { max: (await h.api('workorder.create', cookie.lead, { asset: ids.compressor, title: 'Check run hours A', due: addDays(today, 9), assignee: ids.max })).id,
      mo: (await h.api('workorder.create', cookie.lead, { asset: ids.compressor, title: 'Check run hours B', due: addDays(today, 9), assignee: ids.mo })).id }
    for (let trial = 0; trial < 12; trial++) {
      const base = 13000 + trial * 100
      const statuses = await Promise.all([
        h.raw('/api/gasket/workorder.readings', { cookie: cookie.max, body: { workOrder: lead.max, takenOn: ago(140 - 2 * trial), meter: [ids.runHours], value: [String(base + 50)] } }),
        h.raw('/api/gasket/workorder.readings', { cookie: cookie.mo, body: { workOrder: lead.mo, takenOn: ago(139 - 2 * trial), meter: [ids.runHours], value: [String(base + 10)] } }),
      ].map(async request => (await request).status))
      assert.deepEqual(statuses.toSorted(), [200, 409], `trial ${trial}: exactly one of two conflicting readings is kept`)
    }
    const counter = (await Promise.all([ids.pm, lead.max, lead.mo].map(id => wo('lead', id)))).flatMap(order => order.readings).filter(row => row.meter === 'Run hours')
      .toSorted((a, b) => a.taken_on.localeCompare(b.taken_on)).map(row => Number(row.value))
    assert.equal(counter.length, 13)
    assert.deepEqual(counter, counter.toSorted((a, b) => a - b), `run hours in date order: ${counter}`)
    for (const id of [lead.max, lead.mo]) await h.api('workorder.cancel', cookie.lead, { workOrder: id, reason: 'Reading check done' })
    const after = await wo('max', ids.pm)
    assert.equal(after.status, 'in_progress')
    assert.deepEqual(after.items.slice(0, 2).map(item => item.result.outcome), ['pass', 'pass'])
    assert.equal(after.readings.length, 3)
    const evidence = after.evidence[0]
    const download = await h.raw(`/app/evidence/${evidence.id}`, { cookie: cookie.sam })
    assert.equal(download.status, 200)
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), png)
    assert.equal((await h.raw(`/app/evidence/${evidence.id}`)).status, 303, 'evidence is never public')
  })

  await check('GAS-08 parts, downtime and findings', async () => {
    await h.api('workorder.issue', cookie.max, { workOrder: ids.pm, part: ids.drier, quantity: '2' })
    await h.api('workorder.issue', cookie.max, { workOrder: ids.pm, part: ids.drier, quantity: '10' }, 409)
    await h.api('workorder.return', cookie.max, { workOrder: ids.pm, part: ids.drier, quantity: '1' })
    await h.api('workorder.return', cookie.max, { workOrder: ids.pm, part: ids.drier, quantity: '5' }, 409)
    await h.api('workorder.issue', cookie.mo, { workOrder: ids.pm, part: ids.drier, quantity: '1' }, 403)
    assert.equal((await h.api(`parts/${ids.drier}`, cookie.lead)).onHand, '3')
    await h.api('downtime.start', cookie.max, { workOrder: ids.pm, startedOn: ago(110), reason: 'Isolated for coil cleaning' })
    await h.api('downtime.start', cookie.max, { workOrder: ids.pm, startedOn: ago(109), reason: 'Again' }, 409)
    await h.api('downtime.end', cookie.max, { workOrder: ids.pm, endedOn: ago(115) }, 400)
    assert.equal((await h.api('assets', cookie.sam)).find(row => row.id === ids.compressor).status, 'down')
    assert.equal((await h.api('downtime.end', cookie.max, { workOrder: ids.pm, endedOn: ago(79) })).minutes, 31)
    assert.equal((await h.api('downtime.start', cookie.max, { workOrder: ids.pm, startedOn: ago(100), reason: 'Back-dated into the outage' }, 409)).error, 'downtime_overlaps')
    const finding = await h.api('finding.record', cookie.max, { workOrder: ids.pm, severity: 'medium', item: 3, text: 'Loose terminal at contactor; tightened. Contactor shows arcing.', followUp: true, followUpDue: addDays(today, 3) })
    ids.followUp = finding.followUp
    const follow = await wo('lead', ids.followUp)
    assert.equal(follow.follow_up_of, ids.pm)
    assert.equal(follow.kind, 'corrective')
    const order = await wo('max', ids.pm)
    assert.deepEqual(order.parts.map(row => [row.number, row.issued, row.returned, row.used]), [['FD-164', '2', '1', '1']])
    assert.equal(order.downtime[0].minutes, 31)
  })

  await check('GAS-09 submit and review', async () => {
    let order = await wo('max', ids.pm)
    const early = await h.api('workorder.submit', cookie.max, { workOrder: ids.pm, version: order.version }, 409)
    assert.equal(early.error, 'not_ready_for_review')
    await h.api('workorder.results', cookie.max, { workOrder: ids.pm, outcome: ['pass', 'pass', 'attention', 'fail'], note: ['', '', 'Light dust, cleaned', 'Loose terminal, tightened'] })
    // Two non-passing steps and one finding (linked to step 4 in GAS-08): each step needs its own linked finding.
    order = await wo('max', ids.pm)
    assert.equal(order.missing.length, 1)
    assert.match(order.missing[0], /^step 3\b/)
    assert.equal((await h.api('workorder.submit', cookie.max, { workOrder: ids.pm, version: order.version }, 409)).error, 'not_ready_for_review')
    assert.equal((await h.api('finding.record', cookie.max, { workOrder: ids.pm, item: 4, severity: 'low', text: 'No such step' }, 400)).error, 'invalid_item')
    assert.match(await (await h.raw(`/app/work/${ids.pm}`, { cookie: cookie.max })).text(), /<option value="2" selected>/, 'the finding form offers the unanswered step')
    await h.submit('finding.record', cookie.max, { workOrder: ids.pm, item: '2', severity: 'low', text: 'Light dust on the condenser coils; cleaned.' }, `/app/work/${ids.pm}`)
    order = await wo('max', ids.pm)
    assert.deepEqual(order.findings.map(row => row.item), [3, 2])
    assert.deepEqual(order.missing, [])
    await h.api('workorder.submit', cookie.max, { workOrder: ids.pm, version: order.version })
    order = await wo('sam', ids.pm)
    assert.equal(order.status, 'submitted')
    await h.api('workorder.review', cookie.max, { workOrder: ids.pm, version: order.version, decision: 'approve' }, 403)
    await h.api('workorder.review', cookie.sam, { workOrder: ids.pm, version: order.version - 1, decision: 'approve' }, 409)
    await h.api('workorder.review', cookie.sam, { workOrder: ids.pm, version: order.version, decision: 'return' }, 400)
    await h.submit('workorder.review', cookie.sam, { workOrder: ids.pm, version: String(order.version), decision: 'return', reason: 'Add a photo of the contactor' }, `/app/work/${ids.pm}`)
    assert.equal((await wo('max', ids.pm)).status, 'returned')
    await h.api('workorder.evidence', cookie.max, { workOrder: ids.pm, file: file('contactor.png', png, 'image/png') })
    order = await wo('max', ids.pm)
    await h.submit('workorder.submit', cookie.max, { workOrder: ids.pm, version: String(order.version) }, `/app/work/${ids.pm}`)
    order = await wo('sam', ids.pm)
    // The lead did no work on it but is not a reviewer; the owner could review, the supervisor does.
    await h.api('workorder.review', cookie.lead, { workOrder: ids.pm, version: order.version, decision: 'approve' }, 403)
    await h.api('workorder.review', cookie.sam, { workOrder: ids.pm, version: order.version, decision: 'approve' })
    order = await wo('sam', ids.pm)
    assert.equal(order.status, 'closed')
    assert.deepEqual(order.reviews.map(review => review.decision), ['returned', 'approved'])
    await h.api('workorder.results', cookie.max, { workOrder: ids.pm, outcome: ['pass', 'pass', 'pass', 'pass'], note: ['', '', '', ''] }, 409)
    const schedule = (await h.api('schedules', cookie.lead)).find(row => row.id === ids.schedule)
    assert.equal(schedule.next_due_date, addDays(today, 30), 'the schedule moves on by its cadence')
    assert.equal(schedule.open_work, null)
    const page = await (await h.raw(`/app/work/${ids.pm}`, { cookie: cookie.sam })).text()
    assert.match(page, /Reviewed and closed/)
    // Nobody reviews work they did, even after it is reassigned: the owner holds both work.do and work.review.
    const owner = (await h.api('me', cookie.owner)).id
    const handed = (await h.api('workorder.create', cookie.lead, { asset: ids.fryer, title: 'Tighten fryer basket hanger', due: addDays(today, 4), assignee: owner })).id
    ids.handed = handed
    await h.api('finding.record', cookie.owner, { workOrder: handed, severity: 'low', text: 'Basket hanger loose; tightened.' })
    await h.api('workorder.assign', cookie.lead, { workOrder: handed, assignee: ids.max })
    await h.api('workorder.submit', cookie.max, { workOrder: handed, version: (await wo('max', handed)).version })
    const handedVersion = (await wo('sam', handed)).version
    assert.equal((await h.api('workorder.review', cookie.owner, { workOrder: handed, version: handedVersion, decision: 'approve' }, 403)).error, 'own_work')
    await h.api('workorder.review', cookie.sam, { workOrder: handed, version: handedVersion, decision: 'approve' })
  })

  await check('GAS-10 overdue and downtime board', async () => {
    await h.api('downtime.start', cookie.mo, { workOrder: ids.corrective, startedOn: ago(100), reason: 'Thermostat failed' })
    const board = await h.api('board', cookie.sam)
    assert.ok(board.overdue.some(row => row.id === ids.corrective), 'the corrective work due two days ago is overdue')
    assert.ok(board.followUps.some(row => row.id === ids.followUp))
    assert.ok(board.down.some(row => row.asset_id === ids.fryer))
    assert.equal(board.downtime.find(row => row.asset_id === ids.compressor).minutes, 31)
    assert.ok(board.lowParts.some(part => part.id === ids.drier), 'three filter driers are below the minimum of four')
    assert.ok(!board.lowParts.some(part => part.id === ids.oilPart))
    await h.api('board', cookie.max, undefined, 403)
    assert.match(await (await h.raw('/app/board', { cookie: cookie.lead })).text(), /Twin fryer/)
  })

  await check('GAS-11 asset history and CSV', async () => {
    const history = await h.api(`assets/${ids.compressor}/history`, cookie.max)
    const kinds = new Set(history.events.map(event => event.kind))
    for (const kind of ['asset', 'workorder', 'result', 'reading', 'part', 'downtime', 'finding']) assert.ok(kinds.has(kind), `history has ${kind}`)
    assert.ok(history.events.some(event => event.what === 'Reviewed and closed' && event.who === 'Sam Ito'))
    assert.ok(history.events.some(event => /Run hours: 12,408\sh, taken/.test(event.what) && event.who === 'Max Ortiz'))
    assert.equal(history.downtimeMinutes, 31)
    const csv = await h.raw(`/app/assets/${ids.compressor}/history.csv`, { cookie: cookie.sam })
    assert.equal(csv.status, 200)
    assert.match(csv.headers.get('content-type'), /text\/csv/)
    const text = await csv.text()
    assert.match(text, /^When,Asset tag,Asset,Work order,Kind,What,Who/)
    assert.match(text, /WO-0001/)
    assert.match(text, /Issued 2\seach of FD-164 Filter drier/)
    assert.equal((await h.raw(`/app/assets/${ids.compressor}/history.csv`, { cookie: cookie.max })).status, 403)
  })

  await check('GAS-12 MaintainX move-in', async () => {
    const files = { assets: file('maintainx-assets.csv', assetsCsv), parts: file('maintainx-parts.csv', partsCsv), readings: file('maintainx-meter-readings.csv', readingsCsv) }
    await h.api('import.preview', cookie.max, files, 403)
    const before = (await h.api('assets', cookie.lead)).length
    const preview = await h.api('import.preview', cookie.lead, files)
    assert.deepEqual(preview.create, { assets: 3, meters: 2, readings: 3, parts: 3, work: 0 })
    const reasons = preview.rejected.map(row => row.reason).join(' | ')
    for (const expected of ['duplicate of row 3', 'no location', 'criticality "Urgent"', 'quantity "lots"', 'lower than the earlier 8655', 'asset "Salamander grill" is not in this move-in', 'its meter (Core probe) was not moved in']) assert.ok(reasons.includes(expected), `rejected: ${expected}\n${reasons}`)
    assert.ok(preview.attention.some(row => /Offline in MaintainX/.test(row.reason)))
    assert.equal((await h.api('assets', cookie.lead)).length, before, 'the dry run wrote nothing')
    await h.api('import.apply', cookie.lead, { ...files, fingerprint: 'f'.repeat(64) }, 409)
    const applied = await h.api('import.apply', cookie.lead, { ...files, fingerprint: preview.fingerprint })
    assert.equal(applied.state, 'completed')
    const assets = await h.api('assets', cookie.lead)
    assert.equal(assets.length, before + 3)
    const chiller = assets.find(row => row.tag === 'HK-101')
    assert.ok(chiller, JSON.stringify(assets.map(row => [row.tag, row.name, row.origin])))
    assert.equal(chiller.origin, 'import')
    assert.ok(assets.some(row => row.tag === 'MX-81003' && row.location === 'Dish bay'))
    const chillerDetail = await h.api(`assets/${chiller.id}`, cookie.lead)
    assert.deepEqual(chillerDetail.meters.map(meter => [meter.name, meter.kind, meter.latest]), [['Cabinet temperature', 'gauge', '-18.5'], ['Compressor run hours', 'counter', '8655']])
    const seal = (await h.api('parts', cookie.lead)).find(row => row.number === 'RA-5L')
    assert.equal(seal.onHand, '3.5')
    // A dry run of the same files after the apply would create nothing, and says so.
    const repeat = await h.api('import.preview', cookie.lead, files)
    assert.deepEqual(repeat.create, { assets: 0, meters: 0, readings: 0, parts: 0, work: 0 })
    assert.equal(repeat.unchanged, 11)
    // Applying the same reviewed files again adds nothing.
    assert.equal((await h.api('import.apply', cookie.lead, { ...files, fingerprint: preview.fingerprint })).job, applied.job)
    assert.equal((await h.api('assets', cookie.lead)).length, before + 3)
    // Undo removes exactly the move-in; a new apply is a new journaled job.
    await h.api('import.job', cookie.lead, { job: applied.job, action: 'undo' })
    assert.equal((await h.api('assets', cookie.lead)).length, before)
    assert.ok(!(await h.api('parts', cookie.lead)).some(row => row.number === 'RA-5L'))
    const again = await h.api('import.apply', cookie.lead, { ...files, fingerprint: preview.fingerprint })
    assert.notEqual(again.job, applied.job)
    // Once Gasket records build on an imported asset, undo is refused.
    const moved = (await h.api('assets', cookie.lead)).find(row => row.tag === 'HK-101')
    await h.api('asset.sighting', cookie.lead, { asset: moved.id, outcome: 'found' })
    const blocked = await h.api('import.job', cookie.lead, { job: again.job, action: 'undo' }, 409)
    assert.equal(blocked.error, 'undo_blocked')
    const jobs = await h.api('imports', cookie.lead)
    assert.deepEqual(jobs.map(job => job.state), ['completed', 'undone'])
    assert.equal(jobs[0].blockers.length, 1)
  })

  await check('PM-003 cadence, seasonal windows and exceptions', async () => {
    // A seasonal Monday PM (March and April only) planned across the April 2027 daylight-saving change in Sydney.
    const season = { asset: ids.fryer, checklist: ids.checklist, title: 'Autumn fryer flue check', everyDays: 7, firstDue: '2027-03-22', months: ['3', '4'], weekdays: ['1'], assignee: ids.max }
    await h.api('schedule.create', cookie.lead, { ...season, weekdays: ['8'] }, 400)
    const seasonal = (await h.api('schedule.create', cookie.lead, season)).id
    const read = async () => (await h.api('schedules', cookie.lead)).find(row => row.id === seasonal)
    await h.api('closure.add', cookie.max, { kind: 'holiday', label: 'Easter Monday', startsOn: '2027-03-29' }, 403)
    await h.api('closure.add', cookie.lead, { kind: 'holiday', label: 'Easter Monday', startsOn: '2027-03-29' })
    const shutdown = (await h.api('closure.add', cookie.lead, { kind: 'shutdown', label: 'Autumn deep clean', startsOn: '2027-03-20', endsOn: '2027-03-24' })).id
    assert.equal((await read()).next_due_date, '2027-04-05', 'off the shutdown and the holiday, to the next allowed Monday')
    await h.api('closure.remove', cookie.lead, { closure: shutdown })
    let row = await read()
    assert.equal(row.next_due_date, '2027-03-22')
    // Editing previews the next dates before and after and writes nothing; then it applies.
    const change = { schedule: seasonal, revision: row.revision, everyDays: 14, months: ['3', '4'], weekdays: ['1'] }
    const preview = await h.api('schedule.edit', cookie.lead, { ...change, preview: true })
    assert.deepEqual([preview.before, preview.after, preview.issued], [['2027-03-22', '2027-04-05', '2027-04-12', '2027-04-19', '2027-04-26'], ['2027-03-22', '2027-04-05', '2027-04-19', '2028-03-06', '2028-03-20'], []])
    assert.equal((await read()).every_days, 7, 'a preview writes nothing')
    await h.api('schedule.edit', cookie.lead, change)
    assert.deepEqual([(row = await read()).every_days, row.next_due_date], [14, '2027-03-22'])
    // Issued work keeps its due date and checklist revision when its schedule changes; deferral is bounded and approved by someone else.
    const weekly = (await h.api('schedule.create', cookie.lead, { asset: ids.fryer, checklist: ids.checklist, title: 'Fryer oil change', everyDays: 7, firstDue: addDays(today, -4), assignee: ids.max, maxDeferDays: 10 })).id
    const issued = (await h.api('workorders.generate', cookie.lead, {})).created.find(item => item.schedule === weekly).id
    const before = await wo('lead', issued)
    let weeklyRow = (await h.api('schedules', cookie.lead)).find(item => item.id === weekly)
    const edit = await h.api('schedule.edit', cookie.lead, { schedule: weekly, revision: weeklyRow.revision, everyDays: 10, cadence: 'completion', preview: true })
    assert.deepEqual(edit.issued.map(item => [item.id, item.due_date, item.unchanged]), [[issued, addDays(today, -4), true]])
    await h.api('schedule.edit', cookie.lead, { schedule: weekly, revision: weeklyRow.revision, everyDays: 10, cadence: 'completion' })
    assert.deepEqual([(await wo('lead', issued)).due_date, (await wo('lead', issued)).checklist_revision_id], [addDays(today, -4), before.checklist_revision_id])
    assert.equal((await h.api('schedule.defer', cookie.lead, { schedule: weekly, until: addDays(today, 11), reason: 'Fryer out for a deep clean' }, 409)).error, 'deferral_too_long')
    const defer = await h.api('schedule.defer', cookie.lead, { schedule: weekly, until: addDays(today, 5), reason: 'Fryer out for a deep clean' })
    await h.api('schedule.defer', cookie.lead, { schedule: weekly, until: addDays(today, 4), reason: 'Again' }, 409)
    await h.api('schedule.exception', cookie.owner, { exception: defer.id, decision: 'reject', note: 'Clean it after the change' })
    assert.equal((await wo('lead', issued)).due_date, addDays(today, -4), 'a rejected deferral moves nothing')
    const again = await h.api('schedule.defer', cookie.owner, { schedule: weekly, until: addDays(today, 5), reason: 'Deep clean moved to this week' })
    await h.api('schedule.exception', cookie.owner, { exception: again.id, decision: 'approve' }, 403)
    await h.api('schedule.exception', cookie.sam, { exception: again.id, decision: 'approve' })
    const deferred = await wo('lead', issued)
    assert.deepEqual([deferred.due_date, deferred.checklist_revision_id], [addDays(today, 5), before.checklist_revision_id])
    weeklyRow = (await h.api('schedules', cookie.lead)).find(item => item.id === weekly)
    assert.deepEqual([weeklyRow.next_due_date, weeklyRow.exceptions.map(item => item.decision)], [addDays(today, 5), ['approved', 'rejected']])
    // Completion cadence counts from the day the work is approved (today + 10), not from its planned date (which would give today + 6).
    await h.api('workorder.results', cookie.max, { workOrder: issued, outcome: deferred.items.map(() => 'pass'), note: deferred.items.map(() => '') })
    await h.api('workorder.submit', cookie.max, { workOrder: issued, version: (await wo('max', issued)).version })
    await h.api('workorder.review', cookie.sam, { workOrder: issued, version: (await wo('sam', issued)).version, decision: 'approve' })
    assert.equal((await h.api('schedules', cookie.lead)).find(item => item.id === weekly).next_due_date, addDays(today, 10))
    assert.equal((await h.api('closures', cookie.max)).map(item => item.label).join(), 'Easter Monday')
    const page = await (await h.raw('/app/schedules', { cookie: cookie.lead })).text()
    for (const text of ['Easter Monday', 'Skips and deferrals', 'from completion', 'Deep clean moved to this week']) assert.ok(page.includes(text), text)
    // A site with one owner and no supervisor: the owner approves their own skip only with a second, labelled confirmation.
    const solo = await harness()
    try {
      const owner = await solo.owner()
      await solo.api('site.configure', owner, { name: 'Corner Cafe', timezone: zone })
      const grill = (await solo.api('asset.create', owner, { tag: 'CC-1', name: 'Flat grill', location: 'Kitchen' })).id
      const list = (await solo.api('checklist.create', owner, { name: 'Grill check', items: ['Burners light evenly'] })).id
      const lone = (await solo.api('schedule.create', owner, { asset: grill, checklist: list, title: 'Weekly grill check', everyDays: 7, firstDue: addDays(today, -2) })).id
      const ask = await solo.api('schedule.skip', owner, { schedule: lone, reason: 'Grill out for repair' })
      assert.equal((await solo.api('schedule.exception', owner, { exception: ask.id, decision: 'approve' }, 409)).error, 'confirm_single_approver')
      await solo.api('schedule.exception', owner, { exception: ask.id, decision: 'approve', singleApprover: 'yes' })
      const decided = (await solo.api('schedules', owner)).find(row => row.id === lone)
      assert.deepEqual([decided.overdue, decided.exceptions[0].decision, decided.exceptions[0].single_approver], [false, 'approved', 1])
    } finally { await solo.close() }
  })

  await check('MIG-002 MaintainX completed work history across date ranges', async () => {
    const first = { assets: file('maintainx-assets-2.csv', historyAssetsCsv), work: file('maintainx-work-orders-q1.csv', workCsv) }
    const preview = await h.api('import.preview', cookie.lead, first)
    assert.deepEqual(preview.create, { assets: 2, meters: 0, readings: 0, parts: 0, work: 2 })
    const reasons = preview.rejected.map(row => row.reason).join(' | ')
    for (const expected of ['work order 7003 is Open in MaintainX', 'duplicate of row 2', 'asset "Salamander grill" is not in this move-in', 'Total Parts Cost "lots"', 'completion is dated in the future']) assert.ok(reasons.includes(expected), `rejected: ${expected}\n${reasons}`)
    const one = await h.api('import.apply', cookie.lead, { ...first, fingerprint: preview.fingerprint })
    const freezer = (await h.api('assets', cookie.lead)).find(row => row.tag === 'HK-201')
    let events = (await h.api(`assets/${freezer.id}/history`, cookie.sam)).events
    const service = events.find(event => event.what.includes('#7001'))
    assert.deepEqual([service?.who, /preventive/.test(service?.what), /repeats Every 3 months/.test(service?.what), /parts \$86\.00, labor \$120\.00/.test(service?.what)], ['MaintainX: Dana Reyes', true, true, true], service?.what)
    // History only: no Gasket work order or schedule comes from it.
    assert.ok(events.every(event => !event.workOrder), 'moved-in history raises no work')
    assert.equal((await h.api(`assets/${freezer.id}`, cookie.lead)).schedules.length, 0)
    // The next date range: the overlapping completed order is recognised by its MaintainX ID; only the new one moves in.
    const second = { ...first, work: file('maintainx-work-orders-q2.csv', laterWorkCsv) }
    const later = await h.api('import.preview', cookie.lead, second)
    assert.deepEqual([later.create, later.unchanged, later.rejected.length], [{ assets: 0, meters: 0, readings: 0, parts: 0, work: 1 }, 3, 0])
    const two = await h.api('import.apply', cookie.lead, { ...second, fingerprint: later.fingerprint })
    events = (await h.api(`assets/${freezer.id}/history`, cookie.sam)).events
    assert.deepEqual(events.filter(event => event.kind === 'history').map(event => event.what.match(/#\d+/)[0]), ['#7001', '#7008'])
    assert.ok((await (await h.raw(`/app/assets/${freezer.id}/history.csv`, { cookie: cookie.sam })).text()).includes('Completed in MaintainX (#7008'))
    // The later range builds on the first range's asset: undo the later one first.
    assert.equal((await h.api('import.job', cookie.lead, { job: one.job, action: 'undo' }, 409)).error, 'undo_blocked')
    await h.api('import.job', cookie.lead, { job: two.job, action: 'undo' })
    assert.deepEqual((await h.api(`assets/${freezer.id}/history`, cookie.sam)).events.filter(event => event.kind === 'history').length, 1)
    await h.api('import.job', cookie.lead, { job: one.job, action: 'undo' })
    assert.ok(!(await h.api('assets', cookie.lead)).some(row => row.tag === 'HK-201'))
  })

  await check('GAS-13 agent prepares, a person approves', async () => {
    await h.api('asset.create', cookie.agent, { tag: 'AG-1', name: 'Agent asset', location: 'X' }, 403)
    await h.api('workorder.results', cookie.agent, { workOrder: ids.corrective, outcome: [], note: [] }, 403)
    const corrective = await h.api('proposal.prepare', cookie.agent, { kind: 'corrective', reasoning: 'Run hours rose 408 h since the last service and discharge temperature reached 41 °C; inspect the condenser fan.', payload: { asset: ids.compressor, title: 'Inspect condenser fan', due: addDays(today, 5), assignee: ids.max } })
    const schedule = await h.api('proposal.prepare', cookie.agent, { kind: 'schedule', reasoning: 'The fryer manual asks for a weekly oil filter check.', payload: { asset: ids.fryer, checklist: ids.checklist, title: 'Weekly fryer filter check', everyDays: '7', firstDue: addDays(today, 7) } })
    const count = await h.api('proposal.prepare', cookie.agent, { kind: 'count', reasoning: 'The last count was before two issues; the shelf photo shows two filter driers.', payload: { part: ids.drier, counted: '2' } })
    await h.api('proposal.prepare', cookie.agent, { kind: 'corrective', reasoning: 'x', payload: { asset: ids.compressor, title: 'Bad date', due: 'soon' } }, 400)
    await h.api('proposal.decide', cookie.agent, { proposal: corrective.id, decision: 'approve', hash: corrective.hash }, 403)
    await h.api('proposal.decide', cookie.max, { proposal: corrective.id, decision: 'approve', hash: corrective.hash }, 403)
    await h.api('proposal.decide', cookie.lead, { proposal: corrective.id, decision: 'approve', hash: 'a'.repeat(64) }, 409)
    const approved = await h.api('proposal.decide', cookie.lead, { proposal: corrective.id, decision: 'approve', hash: corrective.hash })
    assert.equal((await wo('max', approved.result)).title, 'Inspect condenser fan')
    await h.api('proposal.decide', cookie.owner, { proposal: corrective.id, decision: 'approve', hash: corrective.hash }, 409)
    // The part moved after the agent prepared the count: the proposal is stale.
    await h.api('part.receive', cookie.lead, { part: ids.drier, quantity: '1' })
    assert.equal((await h.api('proposal.decide', cookie.lead, { proposal: count.id, decision: 'approve', hash: count.hash }, 409)).error, 'proposal_stale')
    await h.submit('proposal.decide', cookie.lead, { proposal: schedule.id, decision: 'reject', note: 'Weekly is in the cleaning roster, not maintenance' }, '/app/proposals')
    // A lead's own proposal needs someone else.
    const own = await h.api('proposal.prepare', cookie.lead, { kind: 'count', reasoning: 'Recount', payload: { part: ids.oilPart, counted: '4' } })
    await h.api('proposal.decide', cookie.lead, { proposal: own.id, decision: 'approve', hash: own.hash }, 403)
    await h.api('proposal.decide', cookie.owner, { proposal: own.id, decision: 'approve', hash: own.hash })
    assert.equal((await h.api(`parts/${ids.oilPart}`, cookie.lead)).onHand, '4')
    const list = await h.api('proposals', cookie.agent)
    const status = Object.fromEntries(list.map(row => [row.id, row.status]))
    assert.deepEqual([status[corrective.id], status[schedule.id], status[count.id], status[own.id]], ['approved', 'rejected', 'pending', 'approved'])
    const audit = await h.api('audit', cookie.owner)
    assert.ok(audit.rows.some(row => row.action === 'proposal.approve' && row.subject === corrective.id && JSON.parse(row.detail).hash === corrective.hash), 'the approval records the exact payload hash')
    ids.proposal = corrective.id
  })

  await check('ADMIN-006 audit search, authority and download', async () => {
    // A stale write changes nothing and adds no audit entry.
    const counts = await h.api('audit?action=part.count', cookie.sam)
    await h.api('part.count', cookie.lead, { part: ids.drier, counted: '1', seen: '0' }, 409)
    assert.deepEqual(await h.api('audit?action=part.count', cookie.sam), counts)
    // Page by page, every entry once; the download holds every one of them.
    const entries = []
    for (let next = null, first = true; first || next; first = false) {
      const page = await h.api(`audit?limit=25${next ? `&before=${next}` : ''}`, cookie.owner)
      entries.push(...page.rows)
      next = page.next
    }
    assert.ok(entries.length > 50, `several pages (${entries.length})`)
    await h.api('audit?limit=501', cookie.owner, undefined, 400)
    assert.equal(new Set(entries.map(row => row.seq)).size, entries.length)
    const csv = await h.raw('/app/audit.csv', { cookie: cookie.sam })
    assert.equal(csv.status, 200)
    assert.match(csv.headers.get('content-type'), /text\/csv/)
    assert.equal((await csv.text()).trim().split('\r\n').length - 1, entries.length)
    // By action family, by site-local date and by site.
    const family = await h.api('audit?action=proposal', cookie.sam)
    assert.ok(family.rows.length >= 6 && family.rows.every(row => row.action.startsWith('proposal.')))
    assert.equal((await h.api(`audit?from=${addDays(today, -1)}&to=${addDays(today, 1)}`, cookie.sam)).rows.length, Math.min(entries.length, 100))
    assert.equal((await h.api(`audit?from=${addDays(today, 1)}`, cookie.sam)).rows.length, 0)
    assert.equal((await h.api(`audit?to=${addDays(today, -1)}`, cookie.sam)).rows.length, 0)
    const csvByAction = await (await h.raw('/app/audit.csv?action=proposal', { cookie: cookie.owner })).text()
    assert.equal(csvByAction.trim().split('\r\n').length - 1, family.rows.length)
    const site = (await h.api('site', cookie.owner)).name
    assert.deepEqual((await h.api(`audit?site=${encodeURIComponent(site)}`, cookie.sam)).rows, entries.slice(0, 100))
    await h.api('audit?site=Elsewhere', cookie.sam, undefined, 404)
    await h.api('audit?from=yesterday', cookie.sam, undefined, 400)
    // Agent and move-in decisions name their authority.
    assert.ok(family.rows.some(row => row.action === 'proposal.prepare' && row.actor === ids.agent && row.role === 'agent'))
    const approval = family.rows.find(row => row.action === 'proposal.approve' && row.subject === ids.proposal)
    assert.equal(approval.role, 'lead')
    assert.match(approval.authority, new RegExp(ids.proposal))
    const carried = entries.find(row => row.action === 'workorder.create' && JSON.parse(row.detail).proposal === ids.proposal)
    assert.equal(carried.actor, approval.actor)
    assert.match(carried.authority, new RegExp(ids.proposal))
    assert.ok(entries.some(row => row.action === 'import.apply' && row.role === 'lead' && row.authority.includes(row.subject)))
    // The role an entry acted under stays as it was when a person's role changes later.
    const before = entries.filter(row => row.actor === ids.mo).map(row => row.role)
    assert.ok(before.length && before.every(role => role === 'maintainer'))
    await h.api('access.role', cookie.owner, { member: ids.mo, role: 'lead' })
    const after = (await h.api('audit', cookie.owner)).rows
    assert.equal(after[0].action, 'access.role')
    assert.ok(after.filter(row => row.actor === ids.mo).every(row => row.role === 'maintainer'))
    // Maintainers cannot read or download it.
    await h.api('audit', cookie.max, undefined, 403)
    assert.equal((await h.raw('/app/audit.csv', { cookie: cookie.max })).status, 403)
    assert.equal((await h.raw('/app/audit?action=workorder', { cookie: cookie.sam })).status, 200)
  })
  await check('PLAN-007 bulk actions and controlled cancellation', async () => {
    const fan = (await h.api('workorder.create', cookie.lead, { asset: ids.compressor, title: 'Condenser fan noisy', due: addDays(today, 2), assignee: ids.max })).id
    const rattle = (await h.api('workorder.create', cookie.lead, { asset: ids.compressor, title: 'Fan rattles at start-up', due: addDays(today, 2), assignee: ids.max })).id
    await h.api('workorder.evidence', cookie.max, { workOrder: rattle, file: file('rattle.png', png, 'image/png') })
    const missed = (await h.api('schedule.create', cookie.lead, { asset: ids.fryer, checklist: ids.checklist, title: 'Fryer burner check', everyDays: 30, firstDue: addDays(today, -3), assignee: ids.max })).id
    const pm = (await h.api('workorders.generate', cookie.lead, {})).created.find(row => row.schedule === missed).id
    const version = async id => (await wo('lead', id)).version
    const stale = (await version(rattle)) - 1
    // A no-write preview of mixed rows: changeable, stale, closed and unknown work, with each one's consequences.
    const selection = { workOrder: [fan, rattle, pm, ids.pm, 'no-such-work'], version: [await version(fan), stale, await version(pm), await version(ids.pm), 1].map(String) }
    const preview = await h.api('workorders.bulk', cookie.lead, { ...selection, action: 'reschedule', due: addDays(today, 6), preview: true })
    assert.deepEqual(preview.rows.map(row => row.outcome), ['would_change', 'stale', 'would_change', 'work_order_not_open', 'work_order_not_found'])
    assert.ok(preview.rows[2].notes.length, 'the preventive row names its schedule consequence')
    assert.equal((await wo('lead', fan)).due_date, addDays(today, 2), 'a preview writes nothing')
    const applied = await h.api('workorders.bulk', cookie.lead, { ...selection, action: 'reschedule', due: addDays(today, 6) })
    assert.deepEqual(applied.rows.map(row => row.outcome), ['changed', 'stale', 'changed', 'work_order_not_open', 'work_order_not_found'])
    assert.deepEqual([(await wo('lead', fan)).due_date, (await wo('lead', rattle)).due_date], [addDays(today, 6), addDays(today, 2)])
    // Bulk never completes work; maintainers cannot use it.
    assert.equal((await h.api('workorders.bulk', cookie.lead, { workOrder: [fan], version: [String(await version(fan))], action: 'close' }, 400)).error, 'invalid_action')
    await h.api('workorders.bulk', cookie.max, { workOrder: [fan], version: [String(await version(fan))], action: 'cancel', reason: 'x' }, 403)
    // Cancel the PM (and try work whose asset is still down): per-row outcomes, and the missed occurrence stays owed.
    const cancelled = await h.api('workorders.bulk', cookie.lead, { workOrder: [pm, ids.corrective], version: [String(await version(pm)), String(await version(ids.corrective))], action: 'cancel', reason: 'Burner swapped under warranty' })
    assert.deepEqual(cancelled.rows.map(row => row.outcome), ['changed', 'downtime_open'])
    assert.equal((await wo('lead', pm)).status, 'cancelled')
    let schedule = (await h.api('schedules', cookie.lead)).find(row => row.id === missed)
    assert.deepEqual([schedule.overdue, schedule.open_work, schedule.next_due_date], [true, null, addDays(today, -3)])
    await h.api('schedule.skip', cookie.max, { schedule: missed, reason: 'x' }, 403)
    // PM-003: the skip is a request; the occurrence stays overdue until an owner or supervisor approves it.
    const skip = await h.api('schedule.skip', cookie.lead, { schedule: missed, reason: 'Burner replaced new this week; next check on cadence' })
    assert.equal((await h.api('schedules', cookie.lead)).find(row => row.id === missed).overdue, true)
    await h.api('schedule.exception', cookie.lead, { exception: skip.id, decision: 'approve' }, 403)
    await h.api('schedule.exception', cookie.sam, { exception: skip.id, decision: 'approve' })
    schedule = (await h.api('schedules', cookie.lead)).find(row => row.id === missed)
    assert.deepEqual([schedule.overdue, schedule.next_due_date, schedule.exceptions.map(row => [row.kind, row.occurrence, row.decision])], [false, addDays(today, 27), [['skip', addDays(today, -3), 'approved']]])
    // Merge a duplicate: it is cancelled into the work that carries on and keeps its own evidence.
    assert.equal((await h.api('workorder.merge', cookie.lead, { workOrder: pm, into: fan, reason: 'x' }, 409)).error, 'merge_preventive')
    await h.submit('workorder.merge', cookie.lead, { workOrder: rattle, into: fan, reason: 'Same fan, reported twice' }, `/app/work/${rattle}`)
    const duplicate = await wo('lead', rattle), carrier = await wo('lead', fan)
    assert.deepEqual([duplicate.status, duplicate.merged_into, duplicate.evidence.length], ['cancelled', fan, 1])
    assert.deepEqual(carrier.merged.map(row => row.id), [rattle])
    assert.equal((await h.raw(`/app/evidence/${duplicate.evidence[0].id}`, { cookie: cookie.sam })).status, 200)
    assert.equal((await h.api('workorder.reopen', cookie.lead, { workOrder: rattle, reason: 'x' }, 409)).error, 'merged')
    // Reopen a reviewed repair that came back: it returns for rework and keeps its review.
    await h.api('workorder.reopen', cookie.lead, { workOrder: ids.handed }, 400)
    await h.api('workorder.reopen', cookie.max, { workOrder: ids.handed, reason: 'x' }, 403)
    await h.api('workorder.reopen', cookie.lead, { workOrder: ids.handed, reason: 'Basket hanger loose again' })
    const reopened = await wo('sam', ids.handed)
    assert.deepEqual([reopened.status, reopened.reviews.map(row => row.decision), reopened.control.map(row => [row.action, row.reason])], ['returned', ['approved'], [['workorder.reopen', 'Basket hanger loose again']]])
    assert.equal((await h.raw(`/app/work/${rattle}`, { cookie: cookie.lead })).status, 200)
  })

  await check('PM-004 failed inspection raises an accountable correction', async () => {
    const checklist = (await h.api('checklist.create', cookie.lead, { name: 'Compressor safety check', items: ['Belt guard in place', 'Pressure relief valve lifts'] })).id
    await h.api('rule.set', cookie.max, { checklist, outcome: ['fail'], severity: 'high', dueDays: 1 }, 403)
    await h.api('rule.set', cookie.lead, { checklist, outcome: ['fail'], severity: 'high', dueDays: 1 })
    const schedule = (await h.api('schedule.create', cookie.lead, { asset: ids.compressor, checklist, title: 'Quarterly compressor safety check', everyDays: 90, firstDue: today, assignee: ids.max })).id
    const pm = (await h.api('workorders.generate', cookie.lead, {})).created.find(row => row.schedule === schedule).id
    await h.api('workorder.readings', cookie.max, { workOrder: pm, takenOn: ago(5), meter: [ids.discharge], value: ['44'] })
    await h.api('workorder.evidence', cookie.max, { workOrder: pm, file: file('valve.png', png, 'image/png') })
    // A failed step through the API, with no follow-up asked for: the rule raises the correction.
    await h.api('workorder.results', cookie.max, { workOrder: pm, outcome: ['pass', 'fail'], note: ['', 'Valve stuck shut at 150 psi'] })
    await h.api('workorder.results', cookie.max, { workOrder: pm, outcome: ['pass', 'fail'], note: ['', 'Still stuck'] })
    let inspection = await wo('max', pm)
    assert.equal(inspection.findings.length, 1, 'one correction per failed step, however often it is recorded')
    const [finding] = inspection.findings
    assert.deepEqual([finding.item, finding.severity, finding.obligation, Boolean(finding.rule_id)], [1, 'high', 'open', true])
    assert.deepEqual(inspection.missing, [])
    let correction = await wo('max', finding.follow_up_id)
    assert.deepEqual([correction.kind, correction.follow_up_of, correction.due_date, correction.assignee_id], ['corrective', pm, addDays(today, 1), ids.max])
    assert.equal(correction.origin.item, 1)
    assert.deepEqual(correction.origin.readings.map(row => [row.meter, row.value]), inspection.readings.map(row => [row.meter, row.value]))
    assert.equal(correction.origin.readings.length, 1)
    assert.equal(correction.origin.evidence[0].sha256, inspection.evidence[0].sha256)
    // The assignee's notice: the correction is on their own list and on the board.
    assert.ok((await h.api('work?mine=1', cookie.max)).some(row => row.id === correction.id))
    assert.ok((await h.api('board', cookie.sam)).followUps.some(row => row.id === correction.id))
    // Closing the inspection does not close the correction.
    await h.api('workorder.submit', cookie.max, { workOrder: pm, version: inspection.version })
    await h.api('workorder.review', cookie.sam, { workOrder: pm, version: (await wo('sam', pm)).version, decision: 'approve' })
    inspection = await wo('sam', pm)
    assert.deepEqual([inspection.status, inspection.findings[0].obligation], ['closed', 'open'])
    assert.ok((await h.api('board', cookie.sam)).followUps.some(row => row.id === correction.id))
    // Acknowledgement before submission, then only independent approval resolves the failure.
    assert.equal(correction.missing.length, 1)
    assert.equal((await h.api('workorder.submit', cookie.max, { workOrder: correction.id, version: correction.version }, 409)).error, 'not_ready_for_review')
    await h.api('workorder.acknowledge', cookie.lead, { workOrder: correction.id }, 403)
    await h.submit('workorder.acknowledge', cookie.max, { workOrder: correction.id }, `/app/work/${correction.id}`)
    assert.equal((await wo('sam', pm)).findings[0].obligation, 'acknowledged')
    correction = await wo('max', correction.id)
    await h.api('workorder.submit', cookie.max, { workOrder: correction.id, version: correction.version })
    const submitted = (await wo('sam', correction.id)).version
    await h.api('workorder.review', cookie.max, { workOrder: correction.id, version: submitted, decision: 'approve' }, 403)
    await h.api('workorder.review', cookie.sam, { workOrder: correction.id, version: submitted, decision: 'approve' })
    assert.equal((await wo('sam', pm)).findings[0].obligation, 'resolved')
    assert.ok(!(await h.api('board', cookie.sam)).followUps.some(row => row.id === correction.id))
    // The rule is revised by appending a numbered revision.
    await h.api('rule.set', cookie.lead, { checklist, outcome: ['fail', 'attention'], severity: 'medium', dueDays: 3 })
    assert.deepEqual((await h.api(`checklists/${checklist}`, cookie.lead)).rules.map(row => [row.number, row.outcomes]), [[2, ['fail', 'attention']], [1, ['fail']]])
    assert.equal((await h.raw(`/app/checklists/${checklist}`, { cookie: cookie.lead })).status, 200)
  })

  await check('ASSET-005 meters, units and counter corrections', async () => {
    // A sheeter's hour meter: manual readings, then a replacement counter and a late, flagged and corrected feed.
    const sheeter = (await h.api('asset.create', cookie.lead, { tag: 'HK-020', name: 'Dough sheeter', location: 'Bakery', criticality: 'important' })).id
    const hours = (await h.api('meter.create', cookie.lead, { asset: sheeter, name: 'Hour meter', unit: 'h', kind: 'counter' })).id
    const schedule = (await h.api('schedule.create', cookie.lead, { asset: sheeter, checklist: ids.checklist, title: '1000-hour sheeter service', meter: hours, everyUnits: '1000', firstDueMeter: '1000', assignee: ids.max })).id
    const visit = (await h.api('workorder.create', cookie.lead, { asset: sheeter, title: 'Read the hour meter', due: addDays(today, 3), assignee: ids.max })).id
    await h.api('workorder.readings', cookie.max, { workOrder: visit, takenOn: ago(300), meter: [hours], value: ['900'] })
    // An unexplained backwards reading is refused at the work door and the feed door; a feed in another unit is refused too.
    await h.api('workorder.readings', cookie.max, { workOrder: visit, takenOn: ago(280), meter: [hours], value: ['850'] }, 409)
    const feed = { meter: hours, source: 'Bakery PLC gateway', unit: 'h' }
    await h.api('meter.feed', cookie.lead, { ...feed, value: '850', takenOn: ago(270) }, 409)
    await h.api('meter.feed', cookie.lead, { ...feed, value: '905', takenOn: ago(270), unit: 'min' }, 400)
    await h.api('meter.feed', cookie.max, { ...feed, value: '905', takenOn: ago(270) }, 403)
    // The display failed and the meter was replaced: the change needs a reason and carries 950 hours forward.
    const replacement = { meter: hours, kind: 'replacement', effectiveOn: ago(240), lastValue: '950', startValue: '0' }
    await h.api('meter.adjust', cookie.lead, replacement, 400)
    await h.api('meter.adjust', cookie.max, { ...replacement, reason: 'Replaced' }, 403)
    await h.api('meter.adjust', cookie.lead, { ...replacement, effectiveOn: ago(400), reason: 'Before a kept reading' }, 409)
    await h.api('meter.adjust', cookie.lead, { ...replacement, lastValue: '890', reason: 'Below the last reading' }, 409)
    await h.api('meter.adjust', cookie.lead, { ...replacement, reason: 'Display failed; new hour meter fitted at zero' })
    const fresh = await h.api('meter.feed', cookie.lead, { ...feed, value: '30', takenOn: ago(120) })
    assert.deepEqual([fresh.quality, fresh.normalized], ['good', '980'])
    // A suspect reading and one that arrives a day late are kept and flagged; neither fires the service nor moves the counter.
    const suspect = await h.api('meter.feed', cookie.lead, { ...feed, value: '120', takenOn: ago(90), quality: 'suspect' })
    assert.deepEqual([suspect.quality, suspect.normalized], ['suspect', '1070'])
    assert.equal((await h.api('meter.feed', cookie.lead, { ...feed, value: '990', takenOn: ago(26 * 60) })).quality, 'stale')
    let generated = await h.api('workorders.generate', cookie.lead, {})
    assert.ok(!generated.created.some(row => row.schedule === schedule), 'flagged readings never fire the service')
    assert.deepEqual(generated.held.find(row => row.schedule === schedule), { schedule, readings: 1 })
    let meter = (await h.api(`assets/${sheeter}`, cookie.max)).meters[0]
    assert.deepEqual([meter.latest, meter.normalized, meter.held], ['30', '980', 1])
    const byValue = Object.fromEntries(meter.readings.map(row => [row.recorded_value, row]))
    assert.deepEqual(['900', '30', '120', '990'].map(value => [byValue[value].provenance, byValue[value].quality, byValue[value].unit, byValue[value].normalized]),
      [['manual', 'good', 'h', '900'], ['feed', 'good', 'h', '980'], ['feed', 'suspect', 'h', '1070'], ['feed', 'stale', 'h', '990']])
    assert.deepEqual([byValue['900'].entered_by, byValue['30'].source], ['Max Ortiz', 'Bakery PLC gateway'])
    assert.ok(byValue['990'].taken_on < byValue['900'].taken_on && byValue['990'].received_on >= byValue['30'].taken_on, 'source time and receipt time are both kept')
    // The gateway scaled the register: the lead corrects the suspect reading with a reason, and the recorded value stays.
    await h.api('meter.adjust', cookie.lead, { kind: 'correction', reading: suspect.id, value: '72' }, 400)
    await h.api('meter.adjust', cookie.lead, { kind: 'correction', reading: suspect.id, value: '20', reason: 'Would go backwards' }, 409)
    assert.equal((await h.api('meter.adjust', cookie.lead, { kind: 'correction', reading: suspect.id, value: '72', reason: 'Gateway scaled the register; 72 h on the display' })).normalized, '1022')
    generated = await h.api('workorders.generate', cookie.lead, {})
    const service = generated.created.find(row => row.schedule === schedule)
    assert.equal(service?.reason, 'meter')
    assert.equal((await wo('max', service.id)).due_meter, '1000')
    // A rollover, through the form door, carries the register's span forward the same way.
    assert.equal((await h.submit('meter.adjust', cookie.lead, { meter: hours, kind: 'rollover', effectiveOn: ago(20), lastValue: '100', startValue: '0', reason: 'Register rolled over at 100' }, `/app/assets/${sheeter}`)).searchParams.get('notice'), 'Saved.')
    assert.equal((await h.api('meter.feed', cookie.lead, { ...feed, value: '5', takenOn: ago(10) })).normalized, '1055')
    assert.equal((await h.api('schedules', cookie.max)).find(row => row.id === schedule).meter_now, '1055')
    meter = (await h.api(`assets/${sheeter}`, cookie.max)).meters[0]
    const kept = meter.readings.find(row => row.id === suspect.id)
    assert.deepEqual([kept.recorded_value, kept.value, kept.quality, kept.standing, kept.normalized, kept.correction.reason], ['120', '72', 'suspect', 'good', '1022', 'Gateway scaled the register; 72 h on the display'])
    assert.deepEqual([meter.normalized, meter.held], ['1055', 0])
    assert.deepEqual(meter.adjustments.map(row => [row.kind, row.reading]), [['rollover', null], ['correction', suspect.id], ['replacement', null]])
    assert.equal((await h.api('audit?action=meter.adjust', cookie.sam)).rows.length, 3)
    const page = await (await h.raw(`/app/assets/${sheeter}`, { cookie: cookie.lead })).text()
    for (const text of ['Stale (late)', 'Corrected', 'Replacement', 'Rollover', 'Feed: Bakery PLC gateway', 'Display failed; new hour meter fitted at zero']) assert.ok(page.includes(text), text)
    const history = (await h.api(`assets/${sheeter}/history`, cookie.sam)).events.map(event => event.what)
    assert.ok(history.some(what => /counter replacement/.test(what)) && history.some(what => /corrected to 72/.test(what)) && history.some(what => /feed: Bakery PLC gateway, stale/.test(what)), 'the history explains each change')
    // Staleness is per meter feed: a daily export declares 36 hours; a reading taken on a work order is attested and never aged.
    const bowl = { asset: sheeter, name: 'Mixer bowl temperature', unit: '°C', kind: 'gauge' }
    await h.api('meter.create', cookie.lead, { ...bowl, feedWindowHours: '200' }, 400)
    const temperature = (await h.api('meter.create', cookie.lead, { ...bowl, feedWindowHours: '36' })).id
    const daily = { meter: temperature, source: 'Nightly bakery export', unit: '°C' }
    assert.equal((await h.api('meter.feed', cookie.lead, { ...daily, value: '4', takenOn: ago(30 * 60) })).quality, 'good')
    assert.equal((await h.api('meter.feed', cookie.lead, { ...daily, value: '5', takenOn: ago(37 * 60) })).quality, 'stale')
    await h.api('workorder.readings', cookie.max, { workOrder: visit, takenOn: ago(40 * 60), meter: [temperature], value: ['6'] })
    await h.api('meter.window', cookie.max, { meter: temperature, feedWindowHours: '12' }, 403)
    await h.api('meter.window', cookie.lead, { meter: temperature, feedWindowHours: '0' }, 400)
    await h.api('meter.window', cookie.lead, { meter: temperature, feedWindowHours: '12' })
    assert.equal((await h.api('meter.feed', cookie.lead, { ...daily, value: '7', takenOn: ago(13 * 60) })).quality, 'stale')
    const gauge = (await h.api(`assets/${sheeter}`, cookie.max)).meters.find(row => row.id === temperature)
    assert.deepEqual(Object.fromEntries(gauge.readings.map(row => [row.value, [row.provenance, row.quality]])),
      { 4: ['feed', 'good'], 5: ['feed', 'stale'], 6: ['manual', 'good'], 7: ['feed', 'stale'] }, 'kept readings keep the quality they were received with')
    assert.deepEqual([gauge.feed_window_hours, (await h.api('audit?action=meter.window', cookie.sam)).rows.length], [12, 1])
    assert.equal((await h.api(`assets/${ids.compressor}`, cookie.max)).meters.find(row => row.id === ids.runHours).feed_window_hours, 24)
  })

  await check('PM-001 unattended calendar generation', async () => {
    // A monthly PM saved through the schedule door; nobody presses Create due work orders.
    const monthly = (await h.api('schedule.create', cookie.lead, { asset: ids.fryer, checklist: ids.checklist, title: 'Monthly fryer gas check', everyDays: 30, firstDue: addDays(today, 5), assignee: ids.max })).id
    const missed = (await h.api('schedule.create', cookie.lead, { asset: ids.fryer, checklist: ids.checklist, title: 'Fryer thermostat calibration', everyDays: 90, firstDue: addDays(today, -2), assignee: ids.max })).id
    const cron = '*/15 * * * *', minutes = n => Date.now() - n * 60_000
    const before = (await h.api('work', cookie.lead)).length
    // The site's lead time decides how far ahead calendar work is issued: three days leaves the monthly PM five days out.
    const place = { name: 'Harbour Kitchen Co', timezone: zone }
    await h.api('site.configure', cookie.owner, { ...place, leadDays: 91 }, 400)
    await h.submit('site.configure', cookie.owner, { ...place, leadDays: '3' }, '/app/site')
    assert.equal((await h.api('site', cookie.lead)).lead_days, 3)
    await h.scheduled(cron, minutes(200))
    const early = await h.api('work', cookie.lead)
    assert.deepEqual([early.filter(row => row.title === 'Monthly fryer gas check').length, early.filter(row => row.title === 'Fryer thermostat calibration').length], [0, 1], 'five days out is beyond a three-day lead time')
    await h.api('site.configure', cookie.owner, { ...place, leadDays: 5 })
    assert.match(await (await h.raw('/app/schedules', { cookie: cookie.lead })).text(), /created 5 days ahead of their due date/)
    // Restarted twice, the second run three hours later: still one order per occurrence.
    await h.scheduled(cron, minutes(15))
    await h.scheduled(cron, minutes(15))
    const work = await h.api('work', cookie.lead)
    const byTitle = title => work.filter(row => row.title === title)
    assert.deepEqual([byTitle('Monthly fryer gas check').length, byTitle('Fryer thermostat calibration').length], [1, 1], `one order each (${work.length - before} new)`)
    const order = await wo('max', byTitle('Monthly fryer gas check')[0].id)
    assert.deepEqual([order.occurrence, order.due_date, order.created_by, order.schedule_id], [`${monthly}@${addDays(today, 5)}`, addDays(today, 5), 'scheduler', monthly])
    // The scheduler's health: its runs, the three-hour gap, and the overdue calibration issued late.
    const health = await h.api('scheduler', cookie.sam)
    assert.ok(health.runs.length >= 3 && health.gaps.some(row => row.minutes >= 180), JSON.stringify(health.gaps))
    assert.ok(health.late.some(row => row.title === 'Fryer thermostat calibration' && row.due_date === addDays(today, -2)), 'issued after its due date')
    assert.ok(!health.late.some(row => row.title === 'Monthly fryer gas check'))
    await h.api('scheduler', cookie.max, undefined, 403)
    // A cancelled occurrence stays owed: the scheduler does not issue it again, and the schedule shows it overdue.
    const calibration = byTitle('Fryer thermostat calibration')[0].id
    await h.api('workorder.cancel', cookie.lead, { workOrder: calibration, reason: 'Thermostat being replaced' })
    await h.scheduled(cron)
    assert.equal((await h.api('work', cookie.lead)).filter(row => row.title === 'Fryer thermostat calibration').length, 0)
    assert.equal((await h.api('schedules', cookie.lead)).find(row => row.id === missed).overdue, true)
    const page = await (await h.raw('/app/schedules', { cookie: cookie.lead })).text()
    assert.ok(page.includes('Automatic scheduling'), 'the Schedules page shows the scheduler')
    await h.api('site.configure', cookie.owner, { name: 'Harbour Kitchen Co', timezone: zone, leadDays: 7 })
  })

  await check('PM-002 automatic meter and condition triggers', async () => {
    // A blast freezer: a sustained-temperature trigger with hysteresis, a condition trigger and a counter that must meet its calendar.
    const freezer = (await h.api('asset.create', cookie.lead, { tag: 'HK-040', name: 'Blast freezer', location: 'Cold prep', criticality: 'critical' })).id
    const cabinet = (await h.api('meter.create', cookie.lead, { asset: freezer, name: 'Cabinet temperature', unit: '°C', kind: 'gauge' })).id
    const warm = { asset: freezer, checklist: ids.checklist, title: 'Warm cabinet: check door and evaporator', meter: cabinet, when: 'above', threshold: '-15', sustainMinutes: '30', assignee: ids.max }
    await h.api('schedule.create', cookie.lead, { ...warm, resetAt: '-10' }, 400)
    const warmSchedule = (await h.api('schedule.create', cookie.lead, { ...warm, resetAt: '-17' })).id
    const feed = { meter: cabinet, source: 'Cold room logger', unit: '°C' }
    const send = async (value, minutes, extra = {}) => await h.api('meter.feed', cookie.lead, { ...feed, value, takenOn: ago(minutes), ...extra })
    assert.deepEqual((await send('-16', 300)).created, [])
    assert.deepEqual((await send('-14', 290)).created, [], 'above, but not yet for 30 minutes')
    const repeated = await send('-14', 290)
    assert.deepEqual([repeated.duplicate, repeated.created], [true, []], 'a repeated delivery is the reading already kept')
    assert.deepEqual((await send('-10', 280, { quality: 'suspect' })).created, [])
    assert.equal((await send('-12', 26 * 60)).quality, 'stale')
    const fired = await send('-13', 260)
    assert.equal(fired.created.length, 1, 'thirty minutes above the threshold raises one work order')
    const warmOrder = await wo('max', fired.created[0].id)
    assert.deepEqual([warmOrder.schedule_id, warmOrder.trigger.id, warmOrder.trigger.value, warmOrder.trigger.source], [warmSchedule, fired.id, '-13', 'Cold room logger'])
    assert.deepEqual((await send('-12', 250)).created, [], 'one open order per trigger')
    await h.api('workorder.cancel', cookie.lead, { workOrder: warmOrder.id, reason: 'Door was propped open during a delivery' })
    assert.deepEqual((await send('-12', 240)).created, [], 'not re-armed until it is back at -17')
    assert.deepEqual((await send('-18', 200)).created, [])
    assert.deepEqual((await send('-14', 190)).created, [])
    assert.deepEqual((await send('-13', 170)).created, [])
    assert.equal((await send('-13', 150)).created.length, 1, 'recovered, then warm again for 40 minutes: a second order')
    // A condition trigger fires from a reading taken on a work order, whoever takes it.
    const seal = (await h.api('meter.create', cookie.lead, { asset: freezer, name: 'Door seal condition', unit: 'condition', kind: 'condition' })).id
    await h.api('schedule.create', cookie.lead, { asset: freezer, checklist: ids.checklist, title: 'Replace door seal', meter: seal, conditions: ['good', 'fair', 'poor'] }, 400)
    const sealSchedule = (await h.api('schedule.create', cookie.lead, { asset: freezer, checklist: ids.checklist, title: 'Replace door seal', meter: seal, conditions: ['poor'], assignee: ids.max })).id
    const visit = (await h.api('workorder.create', cookie.lead, { asset: freezer, title: 'Weekly walk-round', due: addDays(today, 1), assignee: ids.max })).id
    assert.deepEqual((await h.api('workorder.readings', cookie.max, { workOrder: visit, takenOn: ago(30), meter: [seal], value: ['fair'] })).created, [])
    assert.deepEqual((await h.api('workorder.readings', cookie.max, { workOrder: visit, takenOn: ago(20), meter: [seal], value: ['poor'] })).created.map(row => row.schedule), [sealSchedule])
    // A calendar and counter schedule that waits for both.
    const hours = (await h.api('meter.create', cookie.lead, { asset: freezer, name: 'Compressor hours', unit: 'h', kind: 'counter' })).id
    const both = (await h.api('schedule.create', cookie.lead, { asset: freezer, checklist: ids.checklist, title: 'Compressor service', everyDays: 30, firstDue: today, meter: hours, everyUnits: '500', firstDueMeter: '500', combine: 'both', assignee: ids.max })).id
    assert.ok(!(await h.api('workorders.generate', cookie.lead, {})).created.some(row => row.schedule === both), 'the date alone is not enough')
    const counter = { meter: hours, source: 'Cold room logger', unit: 'h' }
    assert.deepEqual((await h.api('meter.feed', cookie.lead, { ...counter, value: '400', takenOn: ago(60) })).created, [])
    assert.deepEqual((await h.api('meter.feed', cookie.lead, { ...counter, value: '510', takenOn: ago(30) })).created.map(row => [row.schedule, row.reason]), [[both, 'both']])
    assert.ok((await h.api('schedules', cookie.lead)).some(row => row.id === warmSchedule && row.trigger_when === 'above' && row.sustain_minutes === 30))
    const page = await (await h.raw(`/app/work/${warmOrder.id}`, { cookie: cookie.max })).text()
    assert.ok(page.includes('Raised by reading'), 'the work order shows the reading that raised it')
  })

  await check('ASSET-004 status, criticality and failure taxonomy', async () => {
    // A critical pump is degraded, then down; the outage is reclassified without rewriting the original entry.
    const pump = (await h.api('asset.create', cookie.lead, { tag: 'HK-030', name: 'Glycol pump', location: 'Plant room A', criticality: 'critical' })).id
    const hours = (await h.api('meter.create', cookie.lead, { asset: pump, name: 'Pump hours', unit: 'h', kind: 'counter' })).id
    const feed = { meter: hours, source: 'Plant room BMS', unit: 'h' }
    await h.api('meter.feed', cookie.lead, { ...feed, value: '100', takenOn: ago(150) })
    const state = { asset: pump, state: 'degraded', effectiveOn: ago(180), reason: 'Seal weeping glycol' }
    await h.api('asset.state', cookie.lead, { ...state, reason: '' }, 400)
    await h.api('asset.state', cookie.max, state, 403)
    await h.api('asset.state', cookie.lead, { ...state, state: 'broken' }, 400)
    await h.api('asset.state', cookie.lead, { ...state, effectiveOn: `${addDays(today, 1)}T08:00` }, 400)
    await h.api('asset.state', cookie.lead, state)
    const down = (await h.api('asset.state', cookie.lead, { asset: pump, state: 'down', effectiveOn: ago(120), reason: 'Pump stopped: seal failed' })).id
    assert.equal((await h.api('assets', cookie.max)).find(row => row.id === pump).status, 'down')
    await h.api('asset.state', cookie.lead, { asset: ids.compressor, state: 'in_service', corrects: down, reason: 'Wrong asset' }, 404)
    await h.api('asset.state', cookie.lead, { asset: pump, state: 'out_of_service', corrects: down, reason: 'Locked out for a planned seal swap, not a breakdown' })
    let asset = await h.api(`assets/${pump}`, cookie.sam)
    assert.equal(asset.status, 'out_of_service')
    assert.deepEqual(asset.states.map(row => [row.state, row.effective_on === (row.state === 'degraded' ? state.effectiveOn : asset.states[0].effective_on), Boolean(row.corrected_by), Boolean(row.corrects)]),
      [['out_of_service', true, false, true], ['down', true, true, false], ['degraded', true, false, false]], 'the original outage stays, reclassified at its own effective time')
    assert.deepEqual(asset.conflicts, [])
    // The building feed shows the pump still running while it is declared out of service: the disagreement is visible.
    await h.api('meter.feed', cookie.lead, { ...feed, value: '112', takenOn: ago(30) })
    asset = await h.api(`assets/${pump}`, cookie.sam)
    assert.deepEqual(asset.conflicts.map(row => [row.kind, row.declared, row.from, row.to, row.source]), [['telemetry_running', 'out_of_service', '100', '112', 'Plant room BMS']])
    // Declared back in service while a work order's downtime is still open: open downtime wins, and the disagreement shows.
    const repair = (await h.api('workorder.create', cookie.lead, { asset: pump, title: 'Replace pump seal', due: addDays(today, 2), assignee: ids.max })).id
    await h.api('downtime.start', cookie.max, { workOrder: repair, startedOn: ago(25), reason: 'Seal replacement' })
    await h.api('asset.state', cookie.lead, { asset: pump, state: 'in_service', effectiveOn: ago(10), reason: 'Seal replaced' })
    const listed = (await h.api('assets', cookie.sam)).find(row => row.id === pump)
    assert.deepEqual([listed.status, listed.conflicts], ['down', 1])
    assert.deepEqual((await h.api(`assets/${pump}`, cookie.sam)).conflicts.map(row => [row.kind, row.declared]), [['open_downtime', 'in_service']])
    assert.deepEqual((await h.api('failures', cookie.sam)).conflicts.find(row => row.asset === pump)?.kinds, ['open_downtime'], 'the report shows the disagreement')
    const page = await (await h.raw(`/app/assets/${pump}`, { cookie: cookie.lead })).text()
    for (const text of ['Evidence disagrees', 'Reclassified later', 'Locked out for a planned seal swap, not a breakdown', 'Pump stopped: seal failed']) assert.ok(page.includes(text), text)
    assert.ok((await h.api(`assets/${pump}/history`, cookie.sam)).events.some(event => /Reclassified down as out of service/.test(event.what)))
    // One central catalog: leads add criticality levels, reorder, relabel and retire them; records keep their level.
    await h.api('code.set', cookie.max, { kind: 'criticality', key: 'life_safety', label: 'Life safety' }, 403)
    await h.api('code.set', cookie.lead, { kind: 'criticality', key: 'Life safety!', label: 'Life safety' }, 400)
    await h.api('code.set', cookie.lead, { kind: 'criticality', key: 'life_safety', label: 'Life safety', importNames: 'Safety critical' })
    await h.api('code.move', cookie.lead, { kind: 'criticality', key: 'life_safety', position: '1' })
    await h.api('code.set', cookie.lead, { kind: 'criticality', key: 'important', label: 'High' })
    assert.deepEqual((await h.api('codes', cookie.max)).filter(code => code.kind === 'criticality').map(code => [code.key, code.label, code.position]),
      [['life_safety', 'Life safety', 1], ['normal', 'Normal', 2], ['important', 'High', 3], ['critical', 'Critical', 4]])
    const valve = (await h.api('asset.create', cookie.lead, { tag: 'HK-031', name: 'Gas safety valve', location: 'Plant room A', criticality: 'life_safety' })).id
    await h.api('code.retire', cookie.lead, { kind: 'criticality', key: 'life_safety', reason: 'Folded into Critical' })
    await h.api('asset.create', cookie.lead, { tag: 'HK-032', name: 'Second valve', location: 'Plant room A', criticality: 'life_safety' }, 400)
    const kept = await h.api(`assets/${valve}`, cookie.lead)
    await h.api('asset.update', cookie.lead, { asset: valve, revision: kept.revision, tag: kept.tag, name: 'Main gas safety valve', location: kept.location, criticality: 'life_safety' })
    const updated = await h.api(`assets/${valve}`, cookie.max)
    assert.deepEqual([updated.name, updated.criticality, updated.criticality_label], ['Main gas safety valve', 'life_safety', 'Life safety'], 'a retired level stays on the asset and readable')
    assert.equal((await h.api('assets', cookie.max)).find(row => row.id === pump).criticality_label, 'Critical')
    // Failure mode, cause and remedy codes on a finding; an unknown code is refused.
    for (const [kind, key, label, importNames] of [['failure_mode', 'seal_leak', 'Seal leak', 'Leak'], ['failure_mode', 'electrical', 'Electrical fault', 'Electrical'], ['cause', 'wear', 'Wear', ''], ['remedy', 'replace', 'Replaced part', '']]) await h.api('code.set', cookie.lead, { kind, key, label, importNames })
    await h.api('finding.record', cookie.max, { workOrder: repair, severity: 'medium', text: 'Seal worn through', failureMode: 'corrosion' }, 400)
    await h.api('finding.record', cookie.max, { workOrder: repair, severity: 'medium', text: 'Seal worn through', failureMode: 'seal_leak', cause: 'wear', remedy: 'replace' })
    assert.equal((await wo('max', repair)).findings[0].codes.split(' · ').toSorted().join(', '), 'Replaced part, Seal leak, Wear')
    await h.api('downtime.end', cookie.max, { workOrder: repair, endedOn: ago(5) })
    assert.deepEqual((await h.api(`assets/${pump}`, cookie.sam)).conflicts, [])
    // An imported failure code: MaintainX work categories map onto failure modes by import name; the rest move in unclassified.
    const movein = { assets: file('maintainx-assets-2.csv', historyAssetsCsv), work: file('maintainx-work-orders-q1.csv', workCsv) }
    const preview = await h.api('import.preview', cookie.lead, movein)
    assert.ok(preview.attention.some(row => /#7001 Quarterly freezer service: no failure mode code matches its categories \(Refrigeration\)/.test(row.reason)), JSON.stringify(preview.attention))
    await h.api('import.apply', cookie.lead, { ...movein, fingerprint: preview.fingerprint })
    assert.equal((await h.api('assets', cookie.max)).find(row => row.tag === 'HK-202').criticality_label, 'High', 'MaintainX Important maps onto the relabelled level')
    const report = await h.api('failures', cookie.sam)
    const count = key => report.codes.find(code => code.key === key)
    assert.deepEqual([[count('seal_leak').findings, count('wear').findings, count('electrical').history], report.unclassified.history.map(row => row.sourceRef)], [[1, 1, 1], ['7001']])
    await h.api('failures', cookie.max, undefined, 403)
    const catalog = await (await h.raw('/app/codes', { cookie: cookie.lead })).text()
    for (const text of ['Life safety', 'Retired', 'Seal leak', 'Quarterly freezer service']) assert.ok(catalog.includes(text), text)
    assert.equal((await h.raw('/app/codes', { cookie: cookie.max })).status, 200)
  })

  await check('PM-006 overdue escalation and blocker chasing', async () => {
    const cron = '*/15 * * * *', days = n => Date.now() + n * 86_400_000
    await h.api('chase.rule', cookie.max, { remindBeforeDays: 1, responseWithinDays: 1, leadAfterDays: 3, supervisorAfterDays: 3 }, 403)
    await h.api('chase.rule', cookie.lead, { remindBeforeDays: 1, responseWithinDays: 1, leadAfterDays: 3, supervisorAfterDays: 2 }, 400)
    await h.api('chase.rule', cookie.lead, { remindBeforeDays: 1, responseWithinDays: 1, leadAfterDays: 3, supervisorAfterDays: 3 })
    const soon = (await h.api('workorder.create', cookie.lead, { asset: ids.fryer, title: 'Fryer gas hose inspection', due: addDays(today, 1), assignee: ids.max })).id
    const urgent = (await h.api('workorder.create', cookie.lead, { asset: ids.fryer, title: 'Fryer pilot keeps dropping out', due: addDays(today, -1), assignee: ids.max })).id
    const mine = async (who, id) => (await h.api('notices', cookie[who])).filter(row => row.work_order_id === id).map(row => row.kind)
    await h.scheduled(cron)
    assert.deepEqual([await mine('max', soon), await mine('max', urgent), await mine('lead', urgent)], [['reminder'], ['overdue'], []])
    // A day later with no answer: the lead hears of it, though the work is only two days overdue.
    await h.scheduled(cron, days(1))
    assert.deepEqual(await mine('lead', urgent), ['escalation_lead'])
    assert.match((await h.api('notices', cookie.lead)).find(row => row.work_order_id === urgent).text, /no response/)
    // The assignee reports a parts blocker with a promised date, then misses it; the supervisor hears of the age.
    await h.api('workorder.respond', cookie.max, { workOrder: urgent, response: 'blocked', kind: 'parts', nextAction: 'Thermocouple ordered from the supplier', promisedOn: today })
    await h.api('workorder.respond', cookie.mo, { workOrder: urgent, response: 'on_it' }, 403)
    await h.scheduled(cron, days(2))
    await h.scheduled(cron, days(2))
    assert.deepEqual([(await mine('max', urgent)).toSorted(), (await mine('lead', urgent)).toSorted(), await mine('sam', urgent)], [['blocker_missed', 'overdue'], ['blocker_missed', 'escalation_lead'], ['escalation_supervisor']], 'each notice once')
    // Reassigning is a lead's decision and keeps the overdue age.
    await h.api('workorder.plan', cookie.max, { workOrder: urgent, plan: `to:${ids.mo}` }, 403)
    await h.api('workorder.plan', cookie.lead, { workOrder: urgent, plan: `to:${ids.mo}` })
    const chased = await wo('lead', urgent)
    assert.deepEqual([chased.assignee_id, chased.chase.overdue_since, chased.chase.overdue_days, chased.chase.blockers.map(row => [row.kind, row.owner, Boolean(row.resolved_at)])], [ids.mo, addDays(today, -1), 1, [['parts', 'Max Ortiz', false]]])
    await h.api('blocker.resolve', cookie.lead, { blocker: chased.chase.blockers[0].id, resolution: 'Thermocouple fitted' })
    assert.ok((await wo('lead', urgent)).chase.blockers[0].resolved_at)
    const page = await (await h.raw(`/app/work/${urgent}`, { cookie: cookie.lead })).text()
    for (const text of ['Chasing', 'Thermocouple ordered from the supplier', 'Escalated to supervisors']) assert.ok(page.includes(text), text)
    assert.equal((await h.raw('/app/notices', { cookie: cookie.max })).status, 200)
  })

  await check('PLAN-002 teams, trades and accountable assignments', async () => {
    for (const [key, name] of [['nia', 'Nia Okafor'], ['uma', 'Uma Reyes']]) {
      ids[key] = (await h.api('access.give', cookie.owner, { name, email: `${key}@example.test`, role: 'maintainer' })).id
      cookie[key] = await h.signIn(`${key}@example.test`)
    }
    // A lead names an electrical team; only assignable people join it.
    await h.api('team.create', cookie.max, { name: 'Electrical', trade: 'Electrical' }, 403)
    await h.api('team.create', cookie.lead, { name: 'Electrical', trade: 'Electrical', member: [ids.max, ids.sam] }, 409)
    const team = (await h.api('team.create', cookie.lead, { name: 'Electrical', trade: 'Electrical', member: [ids.max, ids.nia] })).id
    await h.api('team.create', cookie.lead, { name: 'electrical', trade: 'HVAC' }, 409)
    // The job goes to the team and its lead technician on the day shift; someone off the team is refused.
    const job = { asset: ids.fryer, title: 'Rewire fryer control panel', due: addDays(today, 3), team, shift: 'Day' }
    await h.api('workorder.create', cookie.lead, { ...job, assignee: ids.mo }, 409)
    const id = (await h.api('workorder.create', cookie.lead, { ...job, assignee: ids.max })).id
    let order = await wo('lead', id)
    assert.deepEqual([order.crew.team.name, order.crew.trade, order.crew.shift, order.acknowledged_at], ['Electrical', 'Electrical', 'Day', null])
    // A collaborator joins through the form door; both queues and the team queue carry the job.
    await h.api('workorder.collaborate', cookie.max, { workOrder: id, member: ids.mo }, 403)
    await h.api('workorder.collaborate', cookie.lead, { workOrder: id, member: ids.max }, 409)
    await h.submit('workorder.collaborate', cookie.lead, { workOrder: id, member: ids.mo }, `/app/work/${id}`)
    const part = async (who, path = 'work?mine=1') => (await h.api(path, cookie[who])).find(row => row.id === id)?.my_part ?? null
    assert.deepEqual([await part('max'), await part('mo'), await part('nia'), (await h.api(`work?team=${team}`, cookie.lead)).map(row => row.id)], ['assignee', 'collaborator', null, [id]])
    // The accountable assignee acknowledges; the assignee and the collaborator record; an unrelated technician cannot write.
    await h.api('workorder.acknowledge', cookie.mo, { workOrder: id }, 403)
    await h.api('workorder.acknowledge', cookie.max, { workOrder: id })
    await h.api('workorder.acknowledge', cookie.max, { workOrder: id }, 409)
    await h.api('finding.record', cookie.max, { workOrder: id, severity: 'medium', text: 'Terminal block 4 scorched' })
    await h.api('finding.record', cookie.mo, { workOrder: id, severity: 'low', text: 'Cable tray cleared for the new run' })
    for (const [action, body] of [['finding.record', { severity: 'low', text: 'Not mine' }], ['workorder.acknowledge', {}], ['workorder.respond', { response: 'on_it' }]]) await h.api(action, cookie.uma, { workOrder: id, ...body }, 403)
    await h.api('workorder.decline', cookie.mo, { workOrder: id, kind: 'parts', nextAction: 'x', promisedOn: today }, 403)
    // Handover to the night shift stays inside the team, with a note, and asks for a fresh acknowledgement.
    await h.api('workorder.assign', cookie.lead, { workOrder: id, assignee: ids.mo, shift: 'Night' }, 409)
    await h.api('workorder.assign', cookie.lead, { workOrder: id, assignee: ids.nia, shift: 'Night', note: 'Panel isolated and tagged; terminals 4 to 6 still to land' })
    order = await wo('nia', id)
    assert.deepEqual([order.assignee_id, order.crew.shift, order.acknowledged_at, order.crew.collaborators.map(row => row.name)], [ids.nia, 'Night', null, ['Mo Haddad']])
    assert.deepEqual(order.crew.handoffs.at(-1), { ...order.crew.handoffs.at(-1), from: 'Max Ortiz', to: 'Nia Okafor', from_shift: 'Day', to_shift: 'Night', note: 'Panel isolated and tagged; terminals 4 to 6 still to land', by: 'Lena Park' })
    assert.deepEqual(order.crew.contributors.map(row => [row.name, row.part, row.records]), [['Max Ortiz', 'former', 1], ['Mo Haddad', 'collaborator', 1]])
    assert.deepEqual([await part('max'), await part('nia'), await part('mo')], [null, 'assignee', 'collaborator'])
    await h.api('finding.record', cookie.max, { workOrder: id, severity: 'low', text: 'After handover' }, 403)
    const preview = await h.api('workorders.bulk', cookie.lead, { workOrder: [id], version: [String(order.version)], action: 'assign', assignee: ids.mo, preview: true })
    assert.equal(preview.rows[0].outcome, 'assignee_not_in_team')
    // Declining needs a blocker; it returns the job unassigned and tells the lead.
    await h.api('workorder.decline', cookie.nia, { workOrder: id }, 400)
    await h.api('workorder.decline', cookie.nia, { workOrder: id, kind: 'skill', nextAction: 'Needs a licensed electrician for the 480 V panel', promisedOn: addDays(today, 1), note: 'Not licensed for 480 V' })
    order = await wo('lead', id)
    assert.deepEqual([order.assignee_id, order.crew.answers.map(row => [row.answer, row.by]), order.chase.blockers.map(row => [row.kind, row.owner])], [null, [['acknowledged', 'Max Ortiz'], ['declined', 'Nia Okafor']], [['skill', 'Nia Okafor']]])
    assert.ok((await h.api('notices', cookie.lead)).some(row => row.work_order_id === id && row.kind === 'declined'))
    const page = await (await h.raw(`/app/work/${id}`, { cookie: cookie.lead })).text()
    for (const text of ['Crew', 'Team Electrical', 'Night shift', 'terminals 4 to 6 still to land', 'Collaborator', 'Earlier on this work']) assert.ok(page.includes(text), text)
    const teams = await (await h.raw('/app/teams', { cookie: cookie.uma })).text()
    for (const text of ['Electrical · Electrical', 'Max Ortiz', 'Nia Okafor', 'Rewire fryer control panel']) assert.ok(teams.includes(text), text)
  })

  await check('REPORT-004 backlog, PM compliance and schedule performance', async () => {
    const team = (await h.api('team.create', cookie.lead, { name: 'Utilities', trade: 'Mechanical', member: [ids.max, ids.uma] })).id
    const list = (await h.api('checklist.create', cookie.lead, { name: 'Boiler blowdown', items: ['Blow down the boiler'] })).id
    const schedule = async (title, firstDue, estimateHours) => (await h.api('schedule.create', cookie.lead, { asset: ids.fryer, checklist: list, title, everyDays: 30, firstDue, assignee: ids.max, team, ...(estimateHours ? { estimateHours } : {}) })).id
    await h.api('schedule.create', cookie.lead, { asset: ids.fryer, checklist: list, title: 'Off team', everyDays: 30, firstDue: today, assignee: ids.mo, team }, 409)
    await h.api('schedule.create', cookie.lead, { asset: ids.fryer, checklist: list, title: 'Bad estimate', everyDays: 30, firstDue: today, team, estimateHours: '-1' }, 400)
    // Preventive obligations: done on time, done late, cancelled, left overdue with a blocker; then one skipped and one never generated.
    const pm = { onTime: await schedule('Blowdown A', today, '1'), late: await schedule('Blowdown B', addDays(today, -3), '2'), cancelled: await schedule('Blowdown C', addDays(today, -4), '0.5'), overdue: await schedule('Blowdown F', addDays(today, -1), '1') }
    const created = (await h.api('workorders.generate', cookie.lead, {})).created
    const work = Object.fromEntries(Object.entries(pm).map(([key, id]) => [key, created.find(row => row.schedule === id).id]))
    assert.deepEqual([(await wo('lead', work.late)).crew.team.name, (await wo('lead', work.late)).estimate_minutes], ['Utilities', 120])
    const complete = async (id, results = true) => {
      if (results) await h.api('workorder.results', cookie.max, { workOrder: id, outcome: ['pass'], note: [''] })
      await h.api('workorder.submit', cookie.max, { workOrder: id, version: (await wo('max', id)).version })
    }
    const approve = async id => await h.api('workorder.review', cookie.sam, { workOrder: id, version: (await wo('sam', id)).version, decision: 'approve' })
    for (const key of ['onTime', 'late']) { await complete(work[key]); await approve(work[key]) }
    await h.api('workorder.cancel', cookie.lead, { workOrder: work.cancelled, reason: 'Boiler drained for the inspector' })
    await h.api('blocker.raise', cookie.lead, { workOrder: work.overdue, kind: 'parts', nextAction: 'Gasket kit on order', promisedOn: addDays(today, 2) })
    const skipped = await schedule('Blowdown D', addDays(today, -5))
    await h.api('schedule.exception', cookie.sam, { exception: (await h.api('schedule.skip', cookie.lead, { schedule: skipped, reason: 'Boiler out of service' })).id, decision: 'approve' })
    await schedule('Blowdown E', addDays(today, -2), '3')
    // Reactive repairs: one closed, one overdue, one not started and unestimated, one waiting for review.
    const repair = async (title, due, estimateHours) => (await h.api('workorder.create', cookie.lead, { asset: ids.fryer, title, due, assignee: ids.max, team, ...(estimateHours ? { estimateHours } : {}) })).id
    const fixed = await repair('Replace blowdown valve', today, '1.5')
    await complete(fixed, false); await approve(fixed)
    await repair('Feed pump seal weeping', addDays(today, -1), '2')
    const unestimated = await repair('Trace low water alarm', addDays(today, 3))
    await complete(await repair('Relabel isolation valves', addDays(today, 20), '1'), false)
    // The team's report against those source occurrences and work orders.
    const period = `from=${addDays(today, -10)}&to=${today}`
    await h.api(`performance?${period}&team=${team}`, cookie.max, undefined, 403)
    await h.api(`performance?${period}&site=Elsewhere`, cookie.lead, undefined, 404)
    const report = await h.api(`performance?${period}&team=${team}&site=Harbour%20Kitchen%20Co`, cookie.lead)
    const c = report.compliance
    assert.deepEqual([c.denominator, c.onTime, c.onTimePercent, c.outcomes], [6, 1, 16.7, { on_time: 1, late: 1, overdue: 1, cancelled: 1, skipped: 1, ungenerated: 1, pending: 0 }])
    assert.deepEqual(c.occurrences.map(row => [row.title, row.outcome]), [['Blowdown D', 'skipped'], ['Blowdown C', 'cancelled'], ['Blowdown B', 'late'], ['Blowdown E', 'ungenerated'], ['Blowdown F', 'overdue'], ['Blowdown A', 'on_time']])
    const late = c.occurrences.find(row => row.outcome === 'overdue')
    assert.deepEqual([late.work.id, late.work.assignee, late.blockers.map(row => [row.kind, row.next_action])], [work.overdue, 'Max Ortiz', [['parts', 'Gasket kit on order']]])
    assert.deepEqual([report.mix.planned, report.mix.reactive, report.mix.plannedPercent], [{ count: 2, hours: 3, unestimated: 0 }, { count: 1, hours: 1.5, unestimated: 0 }, 66.7])
    assert.deepEqual([report.attainment.due, report.attainment.attained, report.attainment.percent], [6, 2, 33.3])
    const b = report.backlog
    assert.deepEqual([b.count, b.hours, b.unestimated.map(row => row.id), b.bands[0].count, b.overdue.count, b.overdue.hours, b.atRisk.count, b.atRisk.unestimated, b.awaitingReview.count, b.awaitingReview.hours], [3, 3, [unestimated], 3, 2, 3, 1, 1, 1, 1])
    assert.ok((await h.api(`performance?${period}`, cookie.sam)).compliance.denominator >= 6, 'the whole site includes the team')
    const page = await (await h.raw(`/app/performance?${period}&team=${team}`, { cookie: cookie.sam })).text()
    for (const text of ['PM compliance', 'Not generated', 'Skipped: Boiler out of service', 'Gasket kit on order', '16.7%', '33.3%', '66.7%']) assert.ok(page.includes(text), text)
    assert.equal((await h.raw('/app/performance', { cookie: cookie.max })).status, 403)
  })

  await check('REPORT-003 MTBF, MTTR, MTTA and failure analysis', async () => {
    // A brine pump with an hour meter whose readings start after the period does: three failures and one planned stop.
    const pump = (await h.api('asset.create', cookie.lead, { tag: 'HK-050', name: 'Brine chiller pump', location: 'Plant room B', criticality: 'critical' })).id
    const meter = (await h.api('meter.create', cookie.lead, { asset: pump, name: 'Run hours', unit: 'h', kind: 'counter', feedWindowHours: '168' })).id
    await h.api('code.set', cookie.lead, { kind: 'failure_mode', key: 'bearing', label: 'Bearing failure' })
    const moment = minutes => { const instant = Math.floor((Date.now() - minutes * 60_000) / 60_000) * 60_000; return { local: localAt(instant), instant } }
    const at = Object.fromEntries(Object.entries({ f1: 2700, f1End: 2640, r0: 2400, r1: 1500, f2: 1400, f2End: 1310, p: 1200, pEnd: 1080, f3: 600, f3End: 570, r2: 300 }).map(([key, minutes]) => [key, moment(minutes)]))
    for (const [key, value] of [['r0', '1000'], ['r1', '1020'], ['r2', '1045.5']]) await h.api('meter.feed', cookie.lead, { meter, source: 'Pump VFD', unit: 'h', value, takenOn: at[key].local })
    const repair = async title => (await h.api('workorder.create', cookie.lead, { asset: pump, title, due: today, assignee: ids.max })).id
    const w1 = await repair('Pump seized'), w2 = await repair('Pump tripped on vibration'), wp = await repair('Swap the impeller'), w3 = await repair('Pump leaking at the shaft')
    await h.api('downtime.start', cookie.max, { workOrder: w1, startedOn: at.f1.local, reason: 'Seized', planned: true, failureMode: 'bearing' }, 400)
    await h.api('downtime.start', cookie.max, { workOrder: w1, startedOn: at.f1.local, reason: 'Seized', failureMode: 'worn_out' }, 400)
    const stop = async (workOrder, start, end, fields) => { const { downtime } = await h.api('downtime.start', cookie.max, { workOrder, startedOn: at[start].local, ...fields }); await h.api('downtime.end', cookie.max, { workOrder, endedOn: at[end].local }); return downtime }
    const s1 = await stop(w1, 'f1', 'f1End', { reason: 'Bearing seized', failureMode: 'bearing' })
    const s2 = await stop(w2, 'f2', 'f2End', { reason: 'Bearing noise, tripped', failureMode: 'bearing' })
    // The planned stop goes through the work page's form door with its checkbox.
    assert.equal((await h.submit('downtime.start', cookie.max, { workOrder: wp, startedOn: at.p.local, reason: 'Impeller swap in the shutdown window', planned: 'yes' }, `/app/work/${wp}`)).searchParams.get('error'), null)
    await h.api('downtime.end', cookie.max, { workOrder: wp, endedOn: at.pEnd.local })
    const sp = (await wo('max', wp)).downtime[0]
    assert.deepEqual([sp.planned, sp.failure_mode, sp.minutes], [true, null, 120])
    const s3 = await stop(w3, 'f3', 'f3End', { reason: 'Leak at the shaft seal', failureMode: 'bearing' })
    for (const id of [w1, w2]) await h.api('workorder.acknowledge', cookie.max, { workOrder: id })

    const period = `from=${addDays(today, -2)}&to=${today}&asset=${pump}`
    await h.api(`reliability?${period}`, cookie.max, undefined, 403)
    await h.api(`reliability?${period}&site=Elsewhere`, cookie.lead, undefined, 404)
    await h.api(`reliability?from=${today}&to=${addDays(today, -1)}`, cookie.lead, undefined, 400)
    let report = await h.api(`reliability?${period}&site=Harbour%20Kitchen%20Co`, cookie.sam)
    // Hand calculation from the source events above.
    const minutes = (a, b) => (Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 60_000
    const round1 = value => Math.round(value * 10) / 10
    const unknown = round1((minutes(report.window.start, at.r0.local) + minutes(at.r2.local, report.window.end)) / 60)
    assert.equal(report.window.start, `${addDays(today, -2)}T00:00`)
    assert.deepEqual(report.assets.map(row => [row.id, row.meter, row.from, row.to, row.operatingHours, row.unknownHours, row.failures, row.coveredFailures, row.mtbfHours]), [[pump, 'Run hours', at.r0.local, at.r2.local, 45.5, unknown, 3, 2, 22.8]])
    assert.deepEqual(report.mtbf, { hours: 22.8, operatingHours: 45.5, failures: 2, excluded: 1, unknownHours: unknown }, '45.5 h over the two failures inside the covered time')
    assert.deepEqual(report.failures.map(row => [row.id, row.covered, row.minutes]), [[s1, false, 60], [s2, true, 90], [s3, true, 30]])
    assert.deepEqual(report.mttr, { minutes: 60, sample: 3, excluded: 0 }, '(60 + 90 + 30) / 3; the 120-minute planned stop is left out')
    assert.deepEqual(report.plannedStops.map(row => [row.id, row.minutes]), [[sp.id, 120]])
    const acknowledged = async (workOrder, start) => (((await wo('lead', workOrder)).crew.answers.find(row => row.answer === 'acknowledged').at) - at[start].instant) / 60_000
    const ackMinutes = [await acknowledged(w1, 'f1'), await acknowledged(w2, 'f2')]
    assert.deepEqual(report.mtta, { minutes: round1((ackMinutes[0] + ackMinutes[1]) / 2), sample: 2, excluded: 1 }, 'the unacknowledged leak is excluded')
    assert.deepEqual(report.failures.map(row => row.ackMinutes), [...ackMinutes, null])
    assert.deepEqual(report.pareto.map(row => [row.key, row.count, row.percent, row.cumulativePercent, row.work.map(item => item.id)]), [['bearing', 3, 100, 100, [w1, w2, w3]]])
    assert.deepEqual(report.repeats.map(row => [row.asset.id, row.failureMode.key, row.count]), [[pump, 'bearing', 3]])
    assert.deepEqual(report.definitions.map(row => row.term), ['Failure', 'Operating time', 'MTBF', 'MTTR', 'MTTA', 'Failure Pareto', 'Repeat failure', 'Rounding'])

    // The leak was a seal, not the bearing: a lead corrects the classification, and the original stays on record.
    const correction = { downtime: s3, failureMode: 'seal_leak', reason: 'Teardown found the shaft seal, bearing fine' }
    await h.api('downtime.classify', cookie.max, correction, 403)
    await h.api('downtime.classify', cookie.sam, correction, 403)
    await h.api('downtime.classify', cookie.lead, { ...correction, reason: '' }, 400)
    await h.api('downtime.classify', cookie.lead, { ...correction, failureMode: 'bearing' }, 409)
    await h.api('downtime.classify', cookie.lead, { ...correction, planned: true }, 400)
    await h.api('downtime.classify', cookie.lead, correction)
    report = await h.api(`reliability?${period}`, cookie.sam)
    assert.deepEqual(report.pareto.map(row => [row.key, row.count, row.percent, row.cumulativePercent]), [['bearing', 2, 66.7, 66.7], ['seal_leak', 1, 33.3, 100]])
    assert.deepEqual(report.repeats.map(row => [row.failureMode.key, row.count, row.failures.map(item => item.work.id)]), [['bearing', 2, [w1, w2]]])
    const leak = report.failures.find(row => row.id === s3)
    assert.deepEqual([leak.reclassified, leak.classifications.map(row => [row.original, row.planned, row.failureMode.key, row.reason, row.by])],
      [true, [[true, false, 'bearing', 'Leak at the shaft seal', 'Max Ortiz'], [false, false, 'seal_leak', correction.reason, 'Lena Park']]])
    assert.deepEqual([report.mtbf.hours, report.mttr.minutes], [22.8, 60], 'a failure mode correction keeps the measures')
    // Reclassifying the planned stop as a failure revises every measure from the same source events.
    await h.api('downtime.classify', cookie.lead, { downtime: sp.id, reason: 'The impeller broke; the swap was not planned' })
    report = await h.api(`reliability?${period}`, cookie.sam)
    assert.deepEqual([report.failures.length, report.plannedStops.length, report.mtbf.failures, report.mtbf.hours, report.mttr.minutes, report.mtta.excluded], [4, 0, 3, 15.2, 75, 2], '45.5 / 3 and (60 + 90 + 120 + 30) / 4')
    assert.deepEqual(report.pareto.map(row => [row.key, row.count]), [['bearing', 2], ['seal_leak', 1], [null, 1]])
    assert.ok((await h.api(`assets/${pump}/history`, cookie.sam)).events.some(event => event.what === `Stop reclassified from failure (bearing) to failure (seal_leak): ${correction.reason}`))
    assert.ok((await h.api('reliability', cookie.lead)).failures.some(row => row.id === s3), 'the site report over the last 30 days')
    const work = await (await h.raw(`/app/work/${w3}`, { cookie: cookie.sam })).text()
    for (const text of ['Counts as', 'Failure: Seal leak', 'Reclassified: Teardown found the shaft seal']) assert.ok(work.includes(text), text)
    const page = await (await h.raw(`/app/reliability?${period}`, { cookie: cookie.lead })).text()
    for (const text of ['MTBF', '15.2 h', '75.0 min', 'Bearing failure', 'Unclassified', 'Outside hour-meter coverage', 'Not acknowledged since', 'Reclassified as failure: seal leak', 'Correct a classification', 'Definitions', 'Run hours']) assert.ok(page.includes(text), text)
    assert.ok(!(await (await h.raw(`/app/reliability?${period}`, { cookie: cookie.sam })).text()).includes('Correct a classification'), 'only leads correct')
    assert.equal((await h.raw('/app/reliability', { cookie: cookie.max })).status, 403)
  })

  await check('PART-002 parts reservations, kits and approved substitution', async () => {
    const part = async (number, name) => (await h.api('part.create', cookie.lead, { number, name, unit: 'each' })).id
    const bearing = await part('BRG-6205', 'Deep groove bearing'), sealed = await part('BRG-6205-2RS', 'Sealed bearing'), seal = await part('SEAL-30', 'Shaft seal')
    for (const [id, quantity] of [[bearing, '3'], [sealed, '2'], [seal, '2']]) await h.api('part.receive', cookie.lead, { part: id, quantity })
    const kitLines = { name: 'Pump rebuild kit', part: [bearing, seal], quantity: ['2', '1'] }
    await h.api('kit.create', cookie.max, kitLines, 403)
    await h.api('kit.create', cookie.lead, { name: 'Empty kit', part: [''], quantity: [''] }, 400)
    const kit = (await h.api('kit.create', cookie.lead, kitLines)).id
    await h.api('kit.create', cookie.lead, { ...kitLines, name: 'pump REBUILD kit' }, 409)
    const stock = async () => Object.fromEntries((await h.api('parts', cookie.lead)).filter(row => [bearing, sealed, seal].includes(row.id)).map(row => [row.number, [row.onHand, row.reserved, row.available]]))
    const job = async title => (await h.api('workorder.create', cookie.lead, { asset: ids.compressor, title, due: addDays(today, 3), assignee: ids.max })).id
    const first = await job('Rebuild the condenser pump'), second = await job('Rebuild the standby pump'), third = await job('Check the spare seal')
    // Two competing work orders reserve the same kit: the second cannot take the last bearings.
    await h.api('workorder.reserve', cookie.max, { workOrder: first, kit }, 403)
    await h.api('workorder.reserve', cookie.lead, { workOrder: first, kit })
    assert.deepEqual(await stock(), { 'BRG-6205': ['3', '2', '1'], 'BRG-6205-2RS': ['2', '0', '2'], 'SEAL-30': ['2', '1', '1'] })
    await h.api('workorder.reserve', cookie.lead, { workOrder: second, kit }, 409)
    await h.api('workorder.reserve', cookie.lead, { workOrder: second, kit, swap: [`${bearing}:${sealed}`] }, 409)
    assert.deepEqual(await stock(), { 'BRG-6205': ['3', '2', '1'], 'BRG-6205-2RS': ['2', '0', '2'], 'SEAL-30': ['2', '1', '1'] }, 'a refused kit reserves nothing')
    // A lead approves the sealed bearing in place of the open one; the planner reserves the kit with it through the work page form.
    await h.api('part.substitute', cookie.max, { part: bearing, substitute: sealed }, 403)
    await h.api('part.substitute', cookie.lead, { part: bearing, substitute: sealed, reason: 'Same bore and width; sealed is fine for the pump' })
    assert.equal((await h.submit('workorder.reserve', cookie.lead, { workOrder: second, kit, swap: `${bearing}:${sealed}` }, `/app/work/${second}`)).searchParams.get('error'), null)
    assert.deepEqual((await wo('lead', second)).reservations.map(row => [row.part.number, row.insteadOf?.number ?? null, row.kit, row.quantity, row.state]), [['BRG-6205-2RS', 'BRG-6205', 'Pump rebuild kit', '2', 'open'], ['SEAL-30', null, 'Pump rebuild kit', '1', 'open']])
    assert.deepEqual(await stock(), { 'BRG-6205': ['3', '2', '1'], 'BRG-6205-2RS': ['2', '2', '0'], 'SEAL-30': ['2', '2', '0'] }, 'reserving moves no stock')
    await h.api('workorder.reserve', cookie.lead, { workOrder: third, part: seal, quantity: '1' }, 409)
    await h.api('workorder.reserve', cookie.lead, { workOrder: third, part: seal, quantity: '1', insteadOf: bearing }, 409)
    await h.api('workorder.reserve', cookie.lead, { workOrder: first, part: seal, quantity: '1' }, 409)
    // Issue stays a separate movement and never takes stock reserved for other work.
    await h.api('workorder.issue', cookie.max, { workOrder: third, part: bearing, quantity: '1' })
    await h.api('workorder.issue', cookie.max, { workOrder: third, part: bearing, quantity: '1' }, 409)
    await h.api('workorder.issue', cookie.max, { workOrder: first, part: bearing, quantity: '2' })
    assert.deepEqual((await wo('lead', first)).reservations.map(row => [row.part.number, row.stillNeeded, row.state]), [['BRG-6205', '0', 'issued'], ['SEAL-30', '1', 'open']])
    assert.deepEqual(await stock(), { 'BRG-6205': ['0', '0', '0'], 'BRG-6205-2RS': ['2', '2', '0'], 'SEAL-30': ['2', '2', '0'] })
    // Cancelling one order releases its reservations; closing the other releases what it never used.
    await h.api('workorder.cancel', cookie.lead, { workOrder: second, reason: 'Pump replaced under warranty' })
    assert.deepEqual((await wo('lead', second)).reservations.map(row => [row.state, row.releaseReason, row.releasedBy]), [['released', 'Work order cancelled: Pump replaced under warranty', 'Lena Park'], ['released', 'Work order cancelled: Pump replaced under warranty', 'Lena Park']])
    assert.deepEqual(await stock(), { 'BRG-6205': ['0', '0', '0'], 'BRG-6205-2RS': ['2', '0', '2'], 'SEAL-30': ['2', '1', '1'] })
    await h.api('workorder.submit', cookie.max, { workOrder: first, version: (await wo('max', first)).version })
    await h.api('workorder.review', cookie.sam, { workOrder: first, version: (await wo('sam', first)).version, decision: 'approve' })
    assert.deepEqual((await wo('lead', first)).reservations.map(row => [row.part.number, row.state, row.releaseReason]), [['BRG-6205', 'released', 'Work order approved and closed'], ['SEAL-30', 'released', 'Work order approved and closed']])
    assert.deepEqual(await stock(), { 'BRG-6205': ['0', '0', '0'], 'BRG-6205-2RS': ['2', '0', '2'], 'SEAL-30': ['2', '0', '2'] })
    // A planner releases a reservation with a reason; a maintainer cannot.
    const [held] = (await h.api('workorder.reserve', cookie.lead, { workOrder: third, part: seal, quantity: '1' })).reservations
    await h.api('reservation.release', cookie.max, { reservation: held, reason: 'Not needed' }, 403)
    await h.api('reservation.release', cookie.lead, { reservation: held, reason: '' }, 400)
    await h.api('reservation.release', cookie.lead, { reservation: held, reason: 'Seal was fine' })
    await h.api('reservation.release', cookie.lead, { reservation: held, reason: 'Again' }, 409)
    assert.deepEqual((await stock())['SEAL-30'], ['2', '0', '2'])
    const listed = await h.api('kits', cookie.max)
    assert.deepEqual([listed.kits.find(row => row.id === kit).lines.map(line => [line.number, line.quantity]), listed.substitutes.map(row => [row.part_number, row.substitute_number])], [[['BRG-6205', '2'], ['SEAL-30', '1']], [['BRG-6205', 'BRG-6205-2RS']]])
    await h.api('part.substitute', cookie.lead, { part: bearing, substitute: sealed, withdraw: true })
    assert.deepEqual((await h.api('kits', cookie.max)).substitutes, [])
    const partPage = await (await h.raw(`/app/parts/${seal}`, { cookie: cookie.lead })).text()
    for (const text of ['Reservations', 'Available', 'Released', 'Work order cancelled: Pump replaced under warranty', 'Seal was fine']) assert.ok(partPage.includes(text), text)
    const list = await (await h.raw('/app/parts', { cookie: cookie.lead })).text()
    for (const text of ['Available', 'Repair kits', 'Pump rebuild kit', 'Make kit']) assert.ok(list.includes(text), text)
    const work = await (await h.raw(`/app/work/${third}`, { cookie: cookie.lead })).text()
    for (const text of ['Reserve part', 'Reserve kit', 'Released']) assert.ok(work.includes(text), text)
  })

  await check('ASSET-006 bill of materials and interchangeable spares', async () => {
    const motor = (await h.api('asset.create', cookie.lead, { tag: 'HK-060', name: 'Conveyor drive motor', serial: 'M-1500', location: 'Dock' })).id
    const part = async (number, name, quantity) => { const id = (await h.api('part.create', cookie.lead, { number, name, unit: 'each' })).id; if (quantity) await h.api('part.receive', cookie.lead, { part: id, quantity }); return id }
    const open = await part('BRG-6306', 'Open bearing'), shielded = await part('BRG-6306-ZZ', 'Shielded bearing', '2'), c3 = await part('BRG-6306-C3', 'C3 clearance bearing', '2'), belt = await part('BELT-A42', 'Drive belt A42', '1'), other = await part('BRG-9999', 'Unrelated bearing', '1')
    const revision = { asset: motor, part: [open, belt], quantity: ['2', '1'], serialFrom: ['', 'M-1000'], serialTo: ['', 'M-1999'], alternateFor: [open, open], alternate: [shielded, c3], alternateFrom: ['', 'M-2000'], alternateTo: ['', 'M-2999'], tool: ['Bearing puller', 'Torque wrench'], note: 'From the OEM manual' }
    await h.api('bom.revise', cookie.max, revision, 403)
    await h.api('bom.revise', cookie.lead, { ...revision, alternateFor: [belt, other] }, 400)
    await h.api('bom.revise', cookie.lead, { ...revision, serialFrom: ['', 'M-2000'], serialTo: ['', 'M-1000'] }, 400)
    assert.equal((await h.api('bom.revise', cookie.lead, revision)).number, 1)
    await h.api('bom.revise', cookie.lead, { ...revision, revision: 0 }, 409)
    // A second revision through the asset page's form; the first stays on record.
    assert.equal((await h.submit('bom.revise', cookie.lead, { ...revision, quantity: ['2', '2'], note: 'Two belts per drive', revision: '1' }, `/app/assets/${motor}`)).searchParams.get('error'), null)
    const bom = (await h.api(`assets/${motor}`, cookie.max)).bom
    assert.deepEqual([bom.revision, bom.revisions.map(row => [row.number, row.note]), bom.tools], [2, [[2, 'Two belts per drive'], [1, 'From the OEM manual']], ['Bearing puller', 'Torque wrench']])
    assert.deepEqual(bom.lines.map(line => [line.part.number, line.quantity, line.available, line.fits, line.short, line.alternates.map(alt => [alt.part.number, alt.available, alt.fits])]),
      [['BRG-6306', '2', '0', true, true, [['BRG-6306-ZZ', '2', true], ['BRG-6306-C3', '2', false]]], ['BELT-A42', '2', '1', true, true, []]], 'the C3 bearing only fits serials M-2000 to M-2999')
    // Plan the repair: the listed bearing is out of stock, so the planner takes the approved alternate that fits.
    const repair = (await h.api('workorder.create', cookie.lead, { asset: motor, title: 'Replace drive-end bearings', due: addDays(today, 2), assignee: ids.max })).id
    assert.deepEqual((await wo('max', repair)).bom.lines[0].alternates.map(alt => alt.part.number), ['BRG-6306-ZZ', 'BRG-6306-C3'])
    await h.api('workorder.reserve', cookie.lead, { workOrder: repair, part: open, quantity: '2' }, 409)
    await h.api('workorder.reserve', cookie.lead, { workOrder: repair, part: c3, insteadOf: open, quantity: '2' }, 409)
    await h.api('workorder.reserve', cookie.lead, { workOrder: repair, part: other, insteadOf: open, quantity: '1' }, 409)
    await h.api('workorder.reserve', cookie.lead, { workOrder: repair, part: shielded, insteadOf: open, quantity: '2' })
    const planned = await wo('lead', repair)
    assert.deepEqual(planned.reservations.map(row => [row.part.number, row.insteadOf.number, row.quantity, row.state]), [['BRG-6306-ZZ', 'BRG-6306', '2', 'open']])
    assert.deepEqual(planned.bom.lines[0].alternates.map(alt => [alt.part.number, alt.available]), [['BRG-6306-ZZ', '0'], ['BRG-6306-C3', '2']])
    // A line restricted to other serials does not fit this motor's twin with a later serial.
    const twin = (await h.api('asset.create', cookie.lead, { tag: 'HK-061', name: 'Conveyor drive motor 2', serial: 'M-2500', location: 'Dock' })).id
    await h.api('bom.revise', cookie.lead, { asset: twin, part: [belt], quantity: ['1'], serialFrom: ['M-1000'], serialTo: ['M-1999'] })
    const twinJob = (await h.api('workorder.create', cookie.lead, { asset: twin, title: 'Change the belt', due: addDays(today, 2), assignee: ids.max })).id
    assert.equal((await wo('lead', twinJob)).bom.lines[0].fits, false)
    await h.api('workorder.reserve', cookie.lead, { workOrder: twinJob, part: belt, quantity: '1' }, 409)
    assert.ok((await h.api(`assets/${motor}/history`, cookie.sam)).events.some(event => event.what === 'Bill of materials revision 2 saved: Two belts per drive'))
    const page = await (await h.raw(`/app/assets/${motor}`, { cookie: cookie.lead })).text()
    for (const text of ['Bill of materials', 'Revision 2', 'Out of stock', 'does not fit this serial', 'Bearing puller', 'Save new revision', 'From the OEM manual']) assert.ok(page.includes(text), text)
    assert.ok(!(await (await h.raw(`/app/assets/${motor}`, { cookie: cookie.max })).text()).includes('Save new revision'))
    const work = (await (await h.raw(`/app/work/${twinJob}`, { cookie: cookie.lead })).text()).replace(/<[^>]+>/g, '')
    for (const text of ['Bill of materials', 'Does not fit', 'Fits serials M-1000 to M-1999; this asset is M-2500']) assert.ok(work.includes(text), text)
  })

  await check('PLAN-006 comments, mentions and shift handoff', async () => {
    // A returning job: the supervisor sends Max's repair back and the lead hands it to Uma on the night shift.
    const job = (await h.api('workorder.create', cookie.lead, { asset: ids.fryer, title: 'Replace fryer thermostat', due: addDays(today, 2), assignee: ids.max })).id
    await h.api('workorder.submit', cookie.max, { workOrder: job, version: (await wo('max', job)).version })
    await h.api('workorder.review', cookie.sam, { workOrder: job, version: (await wo('sam', job)).version, decision: 'return', reason: 'Oil still reads 12 °F high' })
    await h.api('workorder.assign', cookie.lead, { workOrder: job, assignee: ids.uma, shift: 'Night' })
    // Max leaves a shift handoff on the work order's form door: two photos, an internal cost note, Uma mentioned.
    const said = 'Swapped the probe; still 12 °F high on the bench check.\nInternal cost note: the OEM thermostat is $186 against $74 for the generic one, so I held off ordering.'
    const photos = ['probe-reading.png', 'thermostat-label.png'].map(name => new File([png], name, { type: 'image/png' }))
    await h.api('comment.post', cookie.agent, { workOrder: job, body: 'Agents prepare proposals; they do not comment' }, 403)
    await h.api('comment.post', cookie.max, { workOrder: job, body: 'x', mention: [ids.agent] }, 409)
    await h.api('comment.post', cookie.max, { workOrder: job, asset: ids.fryer, body: 'x' }, 400)
    await h.api('comment.post', cookie.max, { workOrder: job, body: 'x', photo: [file('quote.pdf', 'x', 'application/pdf')] }, 400)
    assert.equal((await h.submit('comment.post', cookie.max, { workOrder: job, body: said, handoff: 'yes', mention: [ids.uma], photo: photos }, `/app/work/${job}`)).searchParams.get('error'), null)
    const [note] = (await h.api(`work/${job}/comments`, cookie.uma)).comments
    assert.deepEqual([note.kind, note.author, note.body, note.unread, note.mentions.map(row => row.name), note.photos.map(row => [row.filename, row.sha256])],
      ['handoff', 'Max Ortiz', said, true, ['Uma Reyes'], photos.map(photo => [photo.name, createHash('sha256').update(png).digest('hex')])])
    // Uma signs in on a phone through the emailed link and follows the notice to the comment.
    const phone = await h.signIn('uma@example.test')
    const notice = (await h.api('notices', phone)).find(row => row.comment_id === note.id)
    assert.deepEqual([notice.kind, notice.unread, notice.link], ['mention', true, `/app/work/${job}#comment-${note.id}`])
    const notices = await (await h.raw('/app/notices', { cookie: phone })).text()
    for (const text of [`href="${notice.link}"`, 'Mentioned', 'Unread']) assert.ok(notices.includes(text), text)
    assert.ok(notices.replace(/<[^>]+>/g, '').includes('Max Ortiz mentioned you in a shift handoff on WO-'))
    const opened = await (await h.raw(notice.link.split('#')[0], { cookie: phone })).text()
    for (const text of [`id="comment-${note.id}"`, `/app/comment-photos/${note.photos[1].id}`]) assert.ok(opened.includes(text), text)
    for (const text of ['Shift handoff', 'Unread', 'Internal cost note: the OEM thermostat is $186']) assert.ok(opened.replace(/<[^>]+>/g, '').includes(text), text)
    const photo = await h.raw(`/app/comment-photos/${note.photos[0].id}`, { cookie: phone })
    assert.deepEqual([photo.status, photo.headers.get('content-type'), createHash('sha256').update(Buffer.from(await photo.arrayBuffer())).digest('hex')], [200, 'image/png', note.photos[0].sha256])
    // Opening the work order read the thread and the notice.
    assert.deepEqual([(await h.api(`work/${job}/comments`, phone)).unread, (await h.api('notices', phone)).find(row => row.comment_id === note.id).unread], [0, false])
    const reply = await h.api('comment.post', phone, { workOrder: job, body: 'Got it. Ordering the OEM part first thing.', mention: [ids.max] })
    let talk = await h.api(`work/${job}/comments`, cookie.max)
    assert.deepEqual([talk.unread, talk.comments.map(row => [row.author, row.unread])], [1, [['Max Ortiz', false], ['Uma Reyes', true]]])
    await h.api('comment.read', cookie.max, { workOrder: job })
    assert.equal((await h.api(`work/${job}/comments`, cookie.max)).unread, 0)
    // Only the author edits; every version stays readable and an edit does not reopen a read comment.
    const corrected = said.replace('$186', '$192 with freight')
    await h.api('comment.edit', phone, { comment: note.id, body: 'Rewritten by someone else' }, 403)
    await h.api('comment.edit', cookie.max, { comment: note.id, body: said }, 409)
    await h.api('comment.edit', cookie.max, { comment: note.id, body: corrected })
    const edited = (await h.api(`work/${job}/comments`, phone)).comments[0]
    assert.deepEqual([edited.body, edited.unread, edited.revisions.map(row => [row.number, row.body, row.by])], [corrected, false, [[1, said, 'Max Ortiz'], [2, corrected, 'Max Ortiz']]])
    assert.ok((await (await h.raw(`/app/work/${job}`, { cookie: cookie.sam })).text()).replace(/<[^>]+>/g, '').includes('Version 1 · Max Ortiz'))
    // Resolution keeps the conversation, which can go on.
    await h.api('workorder.submit', phone, { workOrder: job, version: (await wo('uma', job)).version })
    await h.api('workorder.review', cookie.sam, { workOrder: job, version: (await wo('sam', job)).version, decision: 'approve' })
    await h.api('comment.post', cookie.sam, { workOrder: job, body: 'Closed: thermostat within 2 °F after the swap.' })
    const closed = await wo('lead', job)
    assert.deepEqual([closed.status, closed.comments.comments.map(row => row.id).slice(0, 2)], ['closed', [note.id, reply.comment]])
    // Asset comments work the same way, with a durable link to the asset.
    const fleet = await h.api('comment.post', cookie.lead, { asset: ids.fryer, body: 'Second thermostat failure on this fryer this quarter', mention: [ids.sam] })
    assert.equal((await h.api('notices', cookie.sam)).find(row => row.comment_id === fleet.comment).link, `/app/assets/${ids.fryer}#comment-${fleet.comment}`)
    assert.equal((await h.api(`assets/${ids.fryer}`, cookie.sam)).comments.unread, 1)
    assert.ok((await (await h.raw(`/app/assets/${ids.fryer}`, { cookie: cookie.sam })).text()).includes(`id="comment-${fleet.comment}"`))
    assert.equal((await h.api(`assets/${ids.fryer}/comments`, cookie.sam)).unread, 0)
    // Internal notes: no requester or contractor identity can be given access, and signed-out or ended access reads nothing.
    for (const role of ['requester', 'contractor']) await h.api('access.give', cookie.owner, { name: 'Outside Person', email: `${role}@example.test`, role }, 400)
    for (const path of [`/api/gasket/work/${job}/comments`, `/api/gasket/assets/${ids.fryer}/comments`, `/app/comment-photos/${note.photos[0].id}`]) {
      for (const who of [undefined, cookie.temp]) {
        const response = await h.raw(path, { cookie: who })
        assert.ok([303, 401, 403].includes(response.status), `${path}: ${response.status}`)
        assert.ok(!(await response.text()).includes('$192'), path)
      }
    }
  })

  await check('ASSET-001 asset and location hierarchy', async () => {
    const add = async (tag, name, level, parent) => (await h.api('asset.create', cookie.lead, { tag, name, location: 'Plant 2', level, ...(parent ? { parent } : {}) })).id
    const plant = await add('BLD-2', 'Plant 2', 'building')
    const lineA = await add('LINE-A', 'Packing line A', 'line', plant), lineB = await add('LINE-B', 'Packing line B', 'line', plant)
    assert.equal((await h.api('asset.create', cookie.lead, { tag: 'BAD-1', name: 'Building under a line', location: 'Plant 2', level: 'building', parent: lineA }, 409)).error, 'parent_level')
    await h.api('asset.create', cookie.max, { tag: 'BAD-2', name: 'Not a lead', location: 'Plant 2', parent: lineA }, 403)
    // A compressor under line A through the register form, with its motor and the motor's bearing below it.
    const compressor = (await h.submit('asset.create', cookie.lead, { tag: 'CMP-7', name: 'Line A air compressor', location: 'Plant 2', criticality: 'normal', level: 'machine', parent: lineA }, '/app/assets/{id}')).pathname.split('/').pop()
    const motor = await add('CMP-7-M', 'Compressor motor', 'component', compressor), bearing = await add('CMP-7-MB', 'Motor bearing', 'component', motor)
    // The compressor and its motor were down at once for 30 of their 60 minutes each.
    const base = Date.now(), at = minutes => localAt(base - minutes * 60_000)
    for (const [asset, from, to] of [[compressor, 300, 240], [motor, 270, 210]]) {
      const job = (await h.api('workorder.create', cookie.lead, { asset, title: 'Trip investigation', due: today, assignee: ids.max })).id
      await h.api('downtime.start', cookie.max, { workOrder: job, startedOn: at(from), reason: 'Tripped' })
      await h.api('downtime.end', cookie.max, { workOrder: job, endedOn: at(to) })
    }
    const place = async id => (await h.api(`assets/${id}`, cookie.sam)).hierarchy
    const totals = row => [row.subtree.below, row.subtree.openWork, row.subtree.downtimeMinutes, row.subtree.downtimeOverlapMinutes]
    let line = await place(lineA)
    assert.deepEqual([line.level, line.parent.tag, line.children.map(row => row.tag), ...totals(line)], ['line', 'BLD-2', ['CMP-7'], ['CMP-7', 'CMP-7-M', 'CMP-7-MB'], 2, 90, 30])
    // Moving the motor's subtree: not by a maintainer, not under itself or below it, not under a lower level, not from a stale read.
    const spare = await add('CMP-8', 'Line B air compressor', 'machine', lineB)
    const { revision } = await h.api(`assets/${motor}`, cookie.lead)
    await h.api('asset.move', cookie.max, { asset: motor, parent: spare, revision }, 403)
    for (const parent of [motor, bearing]) assert.equal((await h.api('asset.move', cookie.lead, { asset: motor, parent, revision }, 409)).error, 'cycle')
    assert.equal((await h.api('asset.move', cookie.lead, { asset: compressor, parent: bearing, revision: (await h.api(`assets/${compressor}`, cookie.lead)).revision }, 409)).error, 'parent_level')
    assert.equal((await h.submit('asset.move', cookie.lead, { asset: motor, parent: spare, revision: String(revision) }, `/app/assets/${motor}`)).searchParams.get('error'), null)
    assert.equal((await h.api('asset.move', cookie.lead, { asset: motor, parent: compressor, revision }, 409)).error, 'stale')
    // The subtree moved whole and kept its records; each line now counts its own outage and the building counts the overlap once.
    assert.deepEqual(totals(await place(lineA)), [['CMP-7'], 1, 60, 0])
    assert.deepEqual(totals(await place(lineB)), [['CMP-7-M', 'CMP-7-MB', 'CMP-8'], 1, 60, 0])
    assert.deepEqual(totals(await place(plant)), [['CMP-7', 'CMP-7-M', 'CMP-7-MB', 'CMP-8', 'LINE-A', 'LINE-B'], 2, 90, 30])
    assert.deepEqual((await place(bearing)).path.map(row => row.tag), ['BLD-2', 'LINE-B', 'CMP-8', 'CMP-7-M'])
    assert.ok((await h.api('work', cookie.lead)).some(row => row.asset_id === motor && row.title === 'Trip investigation'))
    const said = async id => (await h.api(`assets/${id}/history`, cookie.sam)).events.map(event => event.what)
    assert.ok((await said(motor)).includes('Moved from CMP-7 to CMP-8'))
    assert.ok((await said(compressor)).includes('CMP-7-M moved to CMP-8'))
    assert.ok((await said(spare)).includes('CMP-7-M moved here from CMP-7'))
    // Moved-in work cost (MIG-002) rolls up with the asset that carries it.
    const costly = (await Promise.all((await h.api('assets', cookie.lead)).filter(row => row.status !== 'retired').map(row => h.api(`assets/${row.id}`, cookie.lead))))
      .find(row => Object.values(row.hierarchy.subtree.movedInCostCents).some(Boolean))
    await h.api('asset.move', cookie.lead, { asset: costly.id, parent: lineB, revision: costly.revision })
    assert.deepEqual((await place(lineB)).subtree.movedInCostCents, costly.hierarchy.subtree.movedInCostCents)
    assert.equal((await h.api('asset.retire', cookie.lead, { asset: lineA, reason: 'Line removed' }, 409)).error, 'active_children')
    const page = (await (await h.raw(`/app/assets/${plant}`, { cookie: cookie.lead })).text()).replace(/<[^>]+>/g, '')
    for (const text of ['Hierarchy', 'Downtime, this and below', '90 minutes', 'Ended outages, overlapping ones counted once (30 shared minutes)']) assert.ok(page.includes(text), text)
    assert.deepEqual(await Promise.all(['lead', 'max'].map(async who => (await (await h.raw(`/app/assets/${lineB}`, { cookie: cookie[who] })).text()).includes('Move with everything below'))), [true, false])
  })

  await check('REPORT-002 downtime and production availability', async () => {
    // A filling line: a filler with an hour meter and its pump below it, and a capper. Two days, 06:00 to 22:00 every day.
    const add = async (tag, name, level, parent) => (await h.api('asset.create', cookie.lead, { tag, name, location: 'Plant 3', level, ...(parent ? { parent } : {}) })).id
    const line = await add('LINE-R2', 'Filling line R2', 'line'), filler = await add('FIL-1', 'Filler', 'machine', line)
    const pump = await add('FIL-1-P', 'Filler pump', 'component', filler), capper = await add('CAP-1', 'Capper', 'machine', line)
    await h.api('production.hours.add', cookie.max, { weekdays: ['1'], starts: '06:00', ends: '22:00' }, 403)
    await h.api('production.hours.add', cookie.lead, { weekdays: ['1'], starts: '22:00', ends: '06:00' }, 400)
    assert.equal((await h.submit('production.hours.add', cookie.lead, { weekdays: ['1', '2', '3', '4', '5', '6', '7'], starts: '06:00', ends: '22:00' }, '/app/availability')).searchParams.get('error'), null)
    assert.equal((await h.api('production.hours.add', cookie.lead, { weekdays: ['3'], starts: '21:00', ends: '24:00' }, 409)).error, 'hours_overlap')
    const d0 = addDays(today, -3), d1 = addDays(today, -2)
    const meter = (await h.api('meter.create', cookie.lead, { asset: filler, name: 'Filler run hours', unit: 'h', kind: 'counter', feedWindowHours: '168' })).id
    for (const [value, takenOn] of [['100', `${d0}T06:00`], ['120', `${d1}T12:00`]]) await h.api('meter.feed', cookie.lead, { meter, source: 'Filler PLC', unit: 'h', value, takenOn })
    const job = async asset => (await h.api('workorder.create', cookie.lead, { asset, title: 'Line R2 stoppage', due: today, assignee: ids.max })).id
    const jobs = { filler: await job(filler), pump: await job(pump), capper: await job(capper) }
    const outage = async (workOrder, startedOn, endedOn, fields = {}) => {
      const { downtime } = await h.api('downtime.start', cookie.max, { workOrder, startedOn, reason: 'Stopped', ...fields })
      if (endedOn) await h.api('downtime.end', cookie.max, { workOrder, endedOn })
      return downtime
    }
    assert.equal((await h.api('downtime.start', cookie.max, { workOrder: jobs.capper, startedOn: `${d0}T12:00`, reason: 'Slow', planned: true, degraded: true }, 400)).error, 'degraded_is_not_a_planned_stop')
    // Across the reporting boundary, then the pump below it down at the same time for an hour.
    const boundary = await outage(jobs.filler, `${addDays(d0, -1)}T21:00`, `${d0}T08:00`, { reason: 'Filler jammed' })
    const overlap = await outage(jobs.pump, `${d0}T07:00`, `${d0}T09:00`, { reason: 'Pump seal' })
    const degraded = await outage(jobs.capper, `${d0}T12:00`, `${d0}T13:30`, { reason: 'Running at half speed', degraded: true })
    const shutdown = await outage(jobs.filler, `${d1}T10:00`, `${d1}T14:00`, { reason: 'Planned changeover shutdown', planned: true })
    const open = await outage(jobs.capper, `${d1}T21:00`, null, { reason: 'Capper head broke' })

    const period = `from=${d0}&to=${d1}`
    await h.api(`availability?${period}`, cookie.max, undefined, 403)
    await h.api(`availability?${period}&site=Elsewhere`, cookie.lead, undefined, 404)
    const report = await h.api(`availability?${period}&asset=${line}`, cookie.sam)
    assert.deepEqual([report.window, report.production.declared, report.production.minutes], [{ start: `${d0}T00:00`, end: `${addDays(d1, 1)}T00:00` }, true, 1920])
    // By hand: production 2 x 16 h = 1920 min. The filler's planned shutdown takes 240 out of its denominator; its failures cover
    // 06:00-08:00 and 07:00-09:00 of production (the 21:00-06:00 part is outside production or before the period), 180 min with
    // 60 shared. Its hour meter reported from d0 06:00 to d1 12:00, so d1 14:00-22:00 is unknown coverage.
    const row = id => { const entry = report.entries.find(item => item.id === id); return [entry.plannedMinutes, entry.denominatorMinutes, entry.downMinutes, entry.overlapMinutes, entry.degradedMinutes, entry.availabilityPercent, entry.unknownCoverageMinutes, entry.downNow] }
    assert.deepEqual(report.entries.map(item => item.tag), ['LINE-R2', 'CAP-1', 'FIL-1', 'FIL-1-P'])
    assert.deepEqual(row(line), [240, 1680, 240, 60, 90, 85.7, 480, ['CAP-1']], '(1680 - 240) / 1680; the capper is down now')
    assert.deepEqual(row(filler), [240, 1680, 180, 60, 0, 89.3, 480, []], '(1680 - 180) / 1680')
    assert.deepEqual(row(pump), [0, 1920, 120, 0, 0, 93.8, 1920, []], 'no hour meter on the pump: all of it unknown')
    assert.deepEqual(row(capper), [0, 1920, 60, 0, 90, 96.9, 1920, ['CAP-1']], 'degraded operation does not lower availability; the open outage counts to the period end')
    assert.deepEqual(report.outages.map(item => [item.id, item.kind, item.span.from, item.span.to, item.startsBefore, item.endsAfter, item.open, item.productionMinutes, item.outsideProductionMinutes]), [
      [boundary, 'failure', `${d0}T00:00`, `${d0}T08:00`, true, false, false, 120, 360],
      [overlap, 'failure', `${d0}T07:00`, `${d0}T09:00`, false, false, false, 120, 0],
      [degraded, 'degraded', `${d0}T12:00`, `${d0}T13:30`, false, false, false, 90, 0],
      [shutdown, 'planned', `${d1}T10:00`, `${d1}T14:00`, false, false, false, 240, 0],
      [open, 'failure', `${d1}T21:00`, `${addDays(d1, 1)}T00:00`, false, true, true, 60, 120]])
    assert.deepEqual([report.outages[0].line.tag, report.outages[0].reason, report.outages[0].work.id], ['LINE-R2', 'Filler jammed', jobs.filler])
    assert.ok((await h.api(`availability?${period}`, cookie.lead)).entries.some(item => item.id === line && item.availabilityPercent === 85.7), 'the site report lists every line')
    // Degraded operation is not a stop: the reliability report counts only the capper's failure.
    assert.deepEqual((await h.api(`reliability?${period}&asset=${capper}`, cookie.sam)).failures.map(item => item.id), [open])
    const page = (await (await h.raw(`/app/availability?${period}&asset=${line}`, { cookie: cookie.sam })).text()).replace(/<[^>]+>/g, '')
    for (const text of ['Availability by entry', '85.7%', '89.3%', '60 overlapping min counted once', 'Source timeline', 'began before the period', 'still open', 'Degraded operation', 'Production hours', '6:00 am to 10:00 pm', 'Unknown coverage']) assert.ok(page.includes(text), text)
    assert.equal((await h.raw('/app/availability', { cookie: cookie.max })).status, 403)
    assert.ok((await (await h.raw(`/app/work/${jobs.capper}`, { cookie: cookie.max })).text()).includes('Degraded operation'))
  })

  await check('REPORT-005 downtime Pareto and cost of bad actors', async () => {
    // A bakery building: an oven with its burner and a mixer on line R5, and a wrapper on no line. Production 06:00-22:00 (REPORT-002).
    const add = async (tag, name, level, parent) => (await h.api('asset.create', cookie.lead, { tag, name, location: 'Bakery', level, ...(parent ? { parent } : {}) })).id
    const bakery = await add('BLD-5', 'Bakery', 'building'), line = await add('LINE-R5', 'Bread line R5', 'line', bakery)
    const oven = await add('OVN-1', 'Tunnel oven', 'machine', line), burner = await add('OVN-1-B', 'Oven burner', 'component', oven)
    const mixer = await add('MIX-1', 'Dough mixer', 'machine', line), wrapper = await add('WRP-1', 'Wrapper', 'machine', bakery)
    for (const [key, label] of [['overheating', 'Overheating'], ['product_jam', 'Product jam']]) await h.api('code.set', cookie.lead, { kind: 'failure_mode', key, label })
    const day = addDays(today, -5), at = time => `${day}T${time}`
    const job = async asset => (await h.api('workorder.create', cookie.lead, { asset, title: 'Bakery stoppage', due: today, assignee: ids.max })).id
    const jobs = { oven: await job(oven), burner: await job(burner), mixer: await job(mixer), wrapper: await job(wrapper) }
    const outage = async (workOrder, from, to, fields) => { const { downtime } = await h.api('downtime.start', cookie.max, { workOrder, startedOn: at(from), ...fields }); await h.api('downtime.end', cookie.max, { workOrder, endedOn: at(to) }); return downtime }
    const a = await outage(jobs.oven, '08:00', '10:00', { reason: 'Overheated', failureMode: 'overheating' })
    const b = await outage(jobs.burner, '09:00', '11:00', { reason: ' overheated ', failureMode: 'overheating' })
    const c = await outage(jobs.mixer, '09:30', '10:30', { reason: 'Jammed', failureMode: 'product_jam' })
    await outage(jobs.oven, '12:00', '13:00', { reason: 'Belt change', planned: true })
    const d = await outage(jobs.mixer, '14:00', '14:45', { reason: 'jammed', failureMode: 'product_jam' })
    const e = await outage(jobs.wrapper, '05:00', '07:00', { reason: 'Film snapped' })
    await outage(jobs.wrapper, '15:00', '16:00', { reason: 'Running slow', degraded: true })
    // Repair costs on three of the four work orders, one corrected; the wrapper's stays unknown.
    await h.api('work.cost', cookie.max, { workOrder: jobs.oven, category: 'parts', amount: '350.00', note: 'Thermocouple' }, 403)
    await h.api('work.cost', cookie.lead, { workOrder: jobs.oven, category: 'parts', amount: 'abc', note: 'Thermocouple' }, 400)
    assert.equal((await h.api('work.cost', cookie.lead, { workOrder: jobs.wrapper, category: 'other', amount: '-10', note: 'Too low' }, 409)).error, 'cost_below_zero')
    for (const [workOrder, category, amount, note] of [[jobs.oven, 'parts', '350.00', 'Thermocouple'], [jobs.oven, 'labor', '200', 'Two hours'], [jobs.oven, 'labor', '-50.00', 'Half an hour was travel'], [jobs.burner, 'contractor', '$1,200.00', 'Burner service call'], [jobs.mixer, 'parts', '80', 'Shear pin']])
      await h.api('work.cost', cookie.lead, { workOrder, category, amount, note })
    assert.equal((await h.submit('work.cost', cookie.owner, { workOrder: jobs.mixer, category: 'labor', amount: '0', note: 'Nothing' }, `/app/work/${jobs.mixer}`)).searchParams.get('error'), 'invalid_amount')
    assert.deepEqual((await wo('lead', jobs.oven)).costs.totalCents, 50000)
    // Documented lost production: the line at $600 an hour (replacing $500); the burner's loss documented as unknown; none for the wrapper.
    await h.api('loss.rate', cookie.sam, { asset: line, rate: '500', basis: 'Guess' }, 403)
    await h.api('loss.rate', cookie.lead, { asset: line, rate: '500', basis: 'Lost loaves times margin, 2025' })
    assert.equal((await h.submit('loss.rate', cookie.lead, { asset: line, rate: '600.00', basis: 'Lost loaves times margin, 2026' }, '/app/bad-actors')).searchParams.get('error'), null)
    await h.api('loss.rate', cookie.lead, { asset: burner, rate: '', basis: 'Burner loss not yet measured' })

    const period = `from=${day}&to=${day}&asset=${bakery}`
    await h.api(`bad-actors?${period}`, cookie.max, undefined, 403)
    const r = await h.api(`bad-actors?${period}`, cookie.sam)
    // By hand: A 120, B 120 less the 60 it shares with the oven above it, C 60 and D 45 (the mixer is not on the oven's branch), E 60 of production.
    assert.deepEqual(r.failures.map(row => [row.id, row.minutes, row.duplicateMinutes, row.duplicateOf.map(other => other.asset), row.repairCents, row.lossCents]), [
      [e, 60, 0, [], null, null], [a, 120, 0, [], 50000, 120000], [b, 60, 60, ['OVN-1'], 120000, null], [c, 60, 0, [], 8000, 60000], [d, 45, 0, [], 8000, 45000]])
    assert.deepEqual(r.totals, { minutes: 345, failures: 5, duplicateMinutes: 60, repairCents: 178000, repairUnknown: 1, lossCents: 225000, lossUnknownMinutes: 120 })
    assert.deepEqual(r.excluded, { planned: 1, degraded: 1 })
    const ranked = rows => rows.map(row => [row.label, row.minutes, row.percent, row.cumulativePercent])
    assert.deepEqual(ranked(r.byAsset), [['OVN-1 Tunnel oven', 120, 34.8, 34.8], ['MIX-1 Dough mixer', 105, 30.4, 65.2], ['OVN-1-B Oven burner', 60, 17.4, 82.6], ['WRP-1 Wrapper', 60, 17.4, 100]])
    assert.deepEqual(ranked(r.byLine), [['LINE-R5 Bread line R5', 285, 82.6, 82.6], ['No line', 60, 17.4, 100]])
    assert.deepEqual(ranked(r.byFailureMode), [['Overheating', 180, 52.2, 52.2], ['Product jam', 105, 30.4, 82.6], ['Unclassified', 60, 17.4, 100]])
    assert.deepEqual(ranked(r.byReason), [['Overheated', 180, 52.2, 52.2], ['Jammed', 105, 30.4, 82.6], ['Film snapped', 60, 17.4, 100]])
    const money = rows => rows.map(row => [row.repeats, row.repairCents, row.repairUnknown, row.lossCents, row.lossUnknownMinutes])
    assert.deepEqual(money(r.byAsset), [[0, 50000, 0, 120000, 0], [1, 8000, 0, 105000, 0], [0, 120000, 0, null, 60], [0, null, 1, null, 60]], 'the mixer work order counts once; unknown losses stay unknown')
    assert.deepEqual(money(r.byFailureMode)[0], [0, 170000, 0, 120000, 60])
    assert.deepEqual(r.byAsset[2].contributors.map(row => [row.id, row.minutes, row.duplicateMinutes]), [[b, 60, 60]])
    assert.deepEqual(r.repeats.map(row => [row.asset.tag, row.failureMode.key, row.count]), [['MIX-1', 'product_jam', 2]])
    assert.deepEqual([r.failures[2].rate.entry.tag, r.failures[2].rate.centsPerHour, r.failures[3].rate.entry.tag, r.failures[3].rate.centsPerHour, r.failures[0].rate], ['OVN-1-B', null, 'LINE-R5', 60000, null])
    // The exported inputs carry every figure and say "unknown" where nothing was documented.
    const csv = await (await h.raw(`/app/bad-actors.csv?${period}`, { cookie: cookie.sam })).text()
    const cells = line => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map(([, value]) => value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value)
    const lines = csv.trim().split('\r\n').map(cells)
    const column = name => lines[0].indexOf(name)
    assert.equal(lines.length, 6)
    const of = id => lines.find(line => line[0] === id)
    assert.deepEqual([of(b)[column('Counted minutes')], of(b)[column('Duplicate of')], of(b)[column('Repair cost USD')], of(b)[column('Loss rate USD per hour')], of(b)[column('Lost production USD')]], ['60', 'OVN-1', '1200.00', 'unknown', 'unknown'])
    assert.deepEqual([of(e)[column('Repair cost USD')], of(e)[column('Loss rate USD per hour')], of(e)[column('Lost production USD')], of(e)[column('Line')]], ['unknown', 'unknown', 'unknown', ''])
    assert.deepEqual([of(a)[column('Loss rate USD per hour')], of(a)[column('Loss rate entry')], of(a)[column('Lost production USD')]], ['600.00', 'LINE-R5', '1200.00'])
    assert.equal((await h.raw(`/app/bad-actors.csv?${period}`, { cookie: cookie.max })).status, 403)
    const page = (await (await h.raw(`/app/bad-actors?${period}`, { cookie: cookie.lead })).text()).replace(/<[^>]+>/g, '')
    for (const text of ['Downtime Pareto', 'By asset', 'By line', 'By failure mode', 'By reason', '34.8%', '65.2%', '60 duplicate min not counted', '$1,780.00', '$2,250.00', '120 min have no documented loss rate', 'Burner loss not yet measured', 'Download inputs (CSV)']) assert.ok(page.includes(text), text)
    const work = (await (await h.raw(`/app/work/${jobs.oven}`, { cookie: cookie.lead })).text()).replace(/<[^>]+>/g, '')
    for (const text of ['Repair cost', 'Half an hour was travel', 'Total $500.00']) assert.ok(work.includes(text), text)
  })

  await check('PLAN-001 work priority and reusable templates', async () => {
    const dock = (await h.api('asset.create', cookie.lead, { tag: 'DOCK-3', name: 'Dock 3 door', location: 'Dock 3' })).id
    const fields = { name: 'Dock light out', title: 'Replace the dock light', instructions: 'Isolate at DB-4, swap the LED module, test the sensor.', priority: 'high', estimateHours: '1.5' }
    await h.api('template.save', cookie.max, fields, 403)
    await h.api('template.save', cookie.lead, { ...fields, name: 'Bad', priority: 'whenever' }, 400)
    const template = (await h.submit('template.save', cookie.lead, fields, '/app/templates')).searchParams.get('error') === null && (await h.api('templates', cookie.max)).find(row => row.name === fields.name)
    assert.deepEqual([template.title, template.priority, template.estimate_minutes, template.revision], [fields.title, 'high', 90, 1])
    assert.equal((await h.api('template.save', cookie.lead, { ...fields, name: 'dock LIGHT out' }, 409)).error, 'template_name_taken')
    // Work from the template takes its title, instructions, priority and estimate; given fields take precedence.
    const fromTemplate = (await h.submit('workorder.create', cookie.lead, { asset: dock, template: template.id, title: '', priority: '', due: today }, '/app/work/{id}')).pathname.split('/').pop()
    const urgent = (await h.api('workorder.create', cookie.lead, { asset: dock, template: template.id, priority: 'emergency', title: 'Dock light out, trailer waiting', due: today, assignee: ids.max })).id
    await h.api('workorder.create', cookie.lead, { asset: dock, title: 'Paint the door', due: today, priority: 'soon' }, 400)
    const plain = (await h.api('workorder.create', cookie.lead, { asset: dock, title: 'Paint the door', due: today })).id
    const read = async id => { const w = await wo('lead', id); return [w.title, w.description, w.priority, w.estimate_minutes, w.template_id, w.template_revision] }
    assert.deepEqual(await read(fromTemplate), [fields.title, fields.instructions, 'high', 90, template.id, 1])
    assert.deepEqual(await read(urgent), ['Dock light out, trailer waiting', fields.instructions, 'emergency', 90, template.id, 1])
    assert.deepEqual(await read(plain), ['Paint the door', null, 'normal', null, null, null])
    const numbers = await Promise.all([fromTemplate, urgent, plain].map(async id => (await wo('lead', id)).number))
    assert.deepEqual(numbers, [numbers[0], numbers[0] + 1, numbers[0] + 2], 'template work takes the next stable work numbers')
    // A new revision changes only work made after it; a stale revision is refused; a retired template makes no work.
    await h.api('template.save', cookie.lead, { ...fields, template: template.id, revision: 1, priority: 'normal', title: 'Replace the dock light and sensor' })
    assert.equal((await h.api('template.save', cookie.lead, { ...fields, template: template.id, revision: 1 }, 409)).error, 'stale')
    assert.deepEqual(await read(fromTemplate), [fields.title, fields.instructions, 'high', 90, template.id, 1])
    const second = (await h.api('workorder.create', cookie.lead, { asset: dock, template: template.id, due: today })).id
    assert.deepEqual((await read(second)).slice(0, 3).concat((await read(second)).slice(5)), ['Replace the dock light and sensor', fields.instructions, 'normal', 2])
    // Bulk creation from the template: a preview writes nothing; each asset reports its own outcome and keeps a stable number.
    const gate = (await h.api('asset.create', cookie.lead, { tag: 'DOCK-4', name: 'Dock 4 door', location: 'Dock 4' })).id
    const gone = (await h.api('asset.create', cookie.lead, { tag: 'DOCK-9', name: 'Old dock door', location: 'Dock 9' })).id
    await h.api('asset.retire', cookie.lead, { asset: gone, reason: 'Bricked up' })
    await h.api('workorders.fromTemplate', cookie.max, { template: template.id, asset: [dock, gate], due: today }, 403)
    const count = async () => (await h.api('work', cookie.lead)).length
    const before = await count()
    const preview = await h.api('workorders.fromTemplate', cookie.lead, { template: template.id, asset: [dock, gone, gate], due: today, preview: true })
    assert.deepEqual([preview.template.revision, preview.rows.map(row => [row.tag, row.outcome, row.id])], [2, [['DOCK-3', 'would_create', null], ['DOCK-9', 'asset_retired', null], ['DOCK-4', 'would_create', null]]])
    assert.equal(await count(), before, 'a preview raises nothing')
    const done = await h.submit('workorders.fromTemplate', cookie.lead, { template: template.id, asset: [dock, gone, gate], due: today }, '/app/templates')
    const next = (await wo('lead', second)).number
    assert.equal(done.searchParams.get('notice'), `DOCK-3: raised WO-${String(next + 1).padStart(4, '0')}; DOCK-9: asset retired; DOCK-4: raised WO-${String(next + 2).padStart(4, '0')}.`)
    const raisedWork = (await h.api('work', cookie.lead)).filter(row => row.number > next)
    assert.deepEqual(raisedWork.map(row => [row.number, row.asset_id, row.title, row.priority]).toSorted((x, y) => x[0] - y[0]), [[next + 1, dock, 'Replace the dock light and sensor', 'normal'], [next + 2, gate, 'Replace the dock light and sensor', 'normal']])
    await h.api('template.retire', cookie.lead, { template: template.id })
    assert.equal((await h.api('workorder.create', cookie.lead, { asset: dock, template: template.id, due: today }, 409)).error, 'template_retired')
    // A lead changes priority with a reason, kept in the audit; a maintainer cannot.
    await h.api('workorder.priority', cookie.max, { workOrder: plain, priority: 'low', reason: 'Cosmetic' }, 403)
    await h.api('workorder.priority', cookie.lead, { workOrder: plain, priority: 'normal', reason: 'Same' }, 409)
    await h.api('workorder.priority', cookie.lead, { workOrder: plain, priority: 'low', reason: 'Cosmetic only' })
    assert.equal((await wo('lead', plain)).priority, 'low')
    assert.ok((await h.api('audit?action=workorder.priority', cookie.owner)).rows.some(row => row.subject === plain && JSON.parse(row.detail).reason === 'Cosmetic only'))
    const page = (await (await h.raw(`/app/work/${urgent}`, { cookie: cookie.max })).text()).replace(/<[^>]+>/g, '')
    assert.ok(page.includes('Emergency priority') && page.includes(`from template ${fields.name} (revision 1)`))
    const templates = (await (await h.raw('/app/templates', { cookie: cookie.lead })).text()).replace(/<[^>]+>/g, '')
    for (const text of ['Work templates', fields.name, 'revision 2', 'Retired']) assert.ok(templates.includes(text), text)
  })

  await check('GAS-11 rer export and rer import keep every record', async () => {
    // Everything the people of this installation can read, through the same doors, plus every attachment's bytes.
    const read = async (h, cookie) => {
      const download = async (path, who) => { const response = await h.raw(path, { cookie: cookie[who] }); assert.equal(response.status, 200, path); return await response.text() }
      const assets = await h.api('assets', cookie.owner), work = [...await h.api('work', cookie.owner), ...await h.api('work?state=closed', cookie.owner)]
      const orders = await Promise.all(work.map(row => h.api(`work/${row.id}`, cookie.sam)))
      const files = []
      // PLAN-006: comment photos are attachments too.
      for (const evidence of [...orders.flatMap(order => order.evidence), ...orders.flatMap(order => order.comments.comments.flatMap(comment => comment.photos)).map(photo => ({ ...photo, path: 'comment-photos' }))]) {
        const download = await h.raw(`/app/${evidence.path ?? 'evidence'}/${evidence.id}`, { cookie: cookie.sam })
        assert.equal(download.status, 200)
        files.push({ id: evidence.id, recorded: evidence.sha256, downloaded: createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex') })
      }
      return { assets, orders, files, members: await h.api('members', cookie.owner), parts: await h.api('parts', cookie.owner), schedules: await h.api('schedules', cookie.owner), teams: await h.api('teams', cookie.owner), proposals: await h.api('proposals', cookie.owner), imports: await h.api('imports', cookie.owner), audit: await h.api('audit', cookie.owner),
        histories: await Promise.all(assets.map(asset => h.api(`assets/${asset.id}/history`, cookie.sam))), csv: await download(`/app/assets/${ids.compressor}/history.csv`, 'sam'), auditCsv: await download('/app/audit.csv', 'owner') }
    }
    const before = await read(h, cookie)
    assert.ok(before.assets.length && before.orders.length && before.audit.rows.length, 'a populated installation')
    assert.ok(before.files.length >= 2 && before.files.every(row => row.downloaded === row.recorded), 'evidence downloads match their recorded digests')
    await h.stop()
    const archive = join(h.installation.root, 'exports', 'gasket.rer')
    await h.installation.rer('export', '--output', archive)
    const empty = await installation()
    try {
      await empty.rer('import', '--input', archive, '--yes')
      const restored = await harness({ vars: h.vars, installation: empty })
      try {
        const signedIn = { owner: await restored.signIn(h.vars.OWNER_EMAIL), sam: await restored.signIn('sam@example.test') }
        // First-run confirmation belongs to an installation, not to its archive: the owner confirms the restored one.
        assert.equal((await restored.raw('/setup', { cookie: signedIn.owner, form: new URLSearchParams({ confirm: 'yes' }) })).status, 303)
        assert.deepEqual(await read(restored, signedIn), before, 'the restored installation reads exactly as the exported one')
      } finally { await restored.close() }
    } finally { await empty.remove() }
  })
  console.log('Gasket flows: 13 clauses passed')
} finally {
  await h.close()
}
