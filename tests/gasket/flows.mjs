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
const ago = minutes => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(Date.now() - minutes * 60_000).map(part => [part.type, part.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` }
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
    await h.scheduled(cron, minutes(200))
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

  await check('GAS-11 rer export and rer import keep every record', async () => {
    // Everything the people of this installation can read, through the same doors, plus every attachment's bytes.
    const read = async (h, cookie) => {
      const download = async (path, who) => { const response = await h.raw(path, { cookie: cookie[who] }); assert.equal(response.status, 200, path); return await response.text() }
      const assets = await h.api('assets', cookie.owner), work = [...await h.api('work', cookie.owner), ...await h.api('work?state=closed', cookie.owner)]
      const orders = await Promise.all(work.map(row => h.api(`work/${row.id}`, cookie.sam)))
      const files = []
      for (const evidence of orders.flatMap(order => order.evidence)) {
        const download = await h.raw(`/app/evidence/${evidence.id}`, { cookie: cookie.sam })
        assert.equal(download.status, 200)
        files.push({ id: evidence.id, recorded: evidence.sha256, downloaded: createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex') })
      }
      return { assets, orders, files, members: await h.api('members', cookie.owner), parts: await h.api('parts', cookie.owner), schedules: await h.api('schedules', cookie.owner), proposals: await h.api('proposals', cookie.owner), imports: await h.api('imports', cookie.owner), audit: await h.api('audit', cookie.owner),
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
