import { queuedEntrypoint } from '@runeditrun/rer/queued-entry'
const queued = await queuedEntrypoint(import.meta.url, 'test:flows'); if (queued !== null) process.exit(queued)
// Gasket's first-release clauses (ACCEPTANCE.md GAS-01 to GAS-13), each through
// public doors (JSON door, form door, pages and downloads) against the built
// Worker with real local D1. No provider is involved; all people are invented.
import assert from 'node:assert/strict'
import { API_DOORS, PAGE_DOORS } from '../../src/gasket/doors.ts'
import { assetsCsv, partsCsv, png, readingsCsv } from './fixtures.mjs'
import { file, harness } from './harness.mjs'

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
    const finding = await h.api('finding.record', cookie.max, { workOrder: ids.pm, severity: 'medium', text: 'Loose terminal at contactor; tightened. Contactor shows arcing.', followUp: true, followUpDue: addDays(today, 3) })
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
    order = await wo('max', ids.pm)
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
    assert.deepEqual(preview.create, { assets: 3, meters: 2, readings: 3, parts: 3 })
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
    assert.deepEqual(repeat.create, { assets: 0, meters: 0, readings: 0, parts: 0 })
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
    assert.ok(audit.some(row => row.action === 'proposal.approve' && row.subject === corrective.id && JSON.parse(row.detail).hash === corrective.hash), 'the approval records the exact payload hash')
  })
  console.log('Gasket flows: 13 clauses passed')
} finally {
  await h.close()
}
