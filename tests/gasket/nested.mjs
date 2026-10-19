// PM-009: nested programs through the same authenticated form/JSON/page doors.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { harness } from './harness.mjs'

export async function nestedJourney(onReady) {
  const h = await harness()
  try {
    const cookie = { owner: await h.owner() }, people = {}
    await h.api('site.configure', cookie.owner, { name: 'Great Lakes compressor and cooling plant', timezone: 'America/New_York' })
    for (const [key, role] of [['lead', 'lead'], ['tech', 'maintainer'], ['reviewer', 'supervisor'], ['agent', 'agent']]) {
      people[key] = (await h.api('access.give', cookie.owner, { name: key, email: `nested-${key}@example.test`, role })).id
      cookie[key] = await h.signIn(`nested-${key}@example.test`)
    }
    const today = (await h.api('me', cookie.owner)).today
    const asset = (await h.api('asset.create', cookie.lead, { tag: 'CMP-LONG-104', name: 'Production air compressor with dryer and recovery-loop isolation equipment', location: 'North building compressor room' })).id
    const linkedAsset = (await h.api('asset.create', cookie.lead, { tag: 'DRY-105', name: 'Linked air dryer', location: 'North building compressor room' })).id
    const checklist = async (name, items) => (await h.api('checklist.create', cookie.lead, { name, items })).id
    const weeklyProcedure = await checklist('Weekly compressor service', ['Inspect belt'])
    const monthlyProcedure = await checklist('Monthly dryer and compressor service', ['Inspect belt', 'Inspect dryer'])
    const annualProcedure = await checklist('Annual coordinated service', ['Inspect belt', 'Change oil', 'Inspect dryer'])
    const schedule = async (title, days, procedure, equipment = asset) => (await h.api('schedule.create', cookie.lead, { title, asset: equipment, checklist: procedure, everyDays: days, firstDue: today, assignee: people.tech })).id
    const weekly = await schedule('Weekly belt inspection', 7, weeklyProcedure)
    const monthly = await schedule('Monthly linked dryer service', 30, monthlyProcedure, linkedAsset)
    const annual = await schedule('Annual compressor shutdown package', 365, annualProcedure)
    const mapping = { higher: annual, lower: monthly, tasks: ['1 = 1', '2 = 3'], reason: 'Coordinate compressor and linked dryer in one shutdown' }
    await h.api('nested.map', cookie.tech, mapping, 403)
    await h.api('nested.map', cookie.agent, mapping, 403)
    await h.api('nested.map', cookie.lead, { ...mapping, tasks: ['1 = 1'] }, 400)
    await h.api('nested.map', cookie.lead, mapping)
    await h.submit('nested.map', cookie.lead, { higher: annual, lower: weekly, tasks: ['1 = 1'], reason: 'The annual belt inspection is equivalent to the weekly check' }, '/app/programs')
    await h.api('nested.map', cookie.lead, { higher: monthly, lower: annual, tasks: ['1 = 1', '2 = 1', '3 = 2'], reason: 'Invalid reverse package' }, 409)
    const generated = await h.api('workorders.generate', cookie.lead, {})
    const find = s => generated.created.find(row => row.schedule === s).id
    const high = find(annual), low = find(weekly), month = find(monthly)
    await h.api('nested.satisfy', cookie.lead, { higherWork: high, lowerWork: low }, 409)
    await h.api('workorder.acknowledge', cookie.tech, { workOrder: high })
    await h.api('workorder.results', cookie.tech, { workOrder: high, outcome: ['pass', 'pass', ''], note: ['Belt service performed', 'Oil changed', ''] })
    await h.api('step.except', cookie.reviewer, { workOrder: high, item: 2, reason: 'Dryer access unavailable; its monthly obligation remains open' })
    const submit = async id => { const w = await h.api(`work/${id}`, cookie.tech); await h.api('workorder.submit', cookie.tech, { workOrder: id, version: w.version }); const s = await h.api(`work/${id}`, cookie.reviewer); await h.api('workorder.review', cookie.reviewer, { workOrder: id, version: s.version, decision: 'approve' }) }
    await submit(high)
    const before = await h.api('programs', cookie.owner), oldSchedule = (await h.api('schedules', cookie.owner)).find(row => row.id === monthly)
    const incomplete = await h.api('nested.satisfy', cookie.lead, { higherWork: high, lowerWork: month, preview: true })
    assert.equal(incomplete.eligible, false); assert.deepEqual(incomplete.missing, [2])
    assert.deepEqual((await h.api('nested.satisfy', cookie.lead, { higherWork: high, lowerWork: month }, 409)).detail.missing, [2])
    assert.equal((await h.api(`work/${month}`, cookie.owner)).status, 'open')
    assert.deepEqual((await h.api('schedules', cookie.owner)).find(row => row.id === monthly), oldSchedule)
    const preview = await h.api('nested.satisfy', cookie.lead, { higherWork: high, lowerWork: low, preview: true })
    assert.equal(preview.eligible, true); assert.equal(preview.evidence[0].result.outcome, 'pass')
    assert.deepEqual(await h.api('programs', cookie.owner), before, 'preview writes no satisfaction')
    await h.api('nested.satisfy', cookie.agent, { higherWork: high, lowerWork: low }, 403)
    await h.submit('nested.satisfy', cookie.lead, { higherWork: high, lowerWork: low }, '/app/programs')
    const proof = (await h.api('programs', cookie.owner)).satisfied[0]
    assert.equal(proof.higher_work, high); assert.equal(proof.lower_work, low)
    assert.equal(proof.evidence.higherProcedure, (await h.api(`work/${high}`, cookie.owner)).checklist_revision_id)
    assert.ok(proof.evidence.review); assert.equal(proof.evidence.tasks[0].result.note, 'Belt service performed')
    assert.equal((await h.api(`work/${low}`, cookie.owner)).status, 'cancelled')
    assert.ok((await h.api('schedules', cookie.owner)).find(row => row.id === weekly).next_due_date > today)
    await h.api('nested.satisfy', cookie.lead, { higherWork: high, lowerWork: low }, 409)
    await h.api('workorder.reopen', cookie.lead, { workOrder: low, reason: 'Cannot undo an evidenced equivalent' }, 409)
    // A complete new annual package can satisfy the remaining linked-asset occurrence.
    const completeAnnual = await schedule('Annual package with dryer access restored', 365, annualProcedure)
    await h.api('nested.map', cookie.lead, { ...mapping, higher: completeAnnual })
    const issued = await h.api('workorders.generate', cookie.lead, {})
    const complete = issued.created.find(row => row.schedule === completeAnnual).id
    await h.api('workorder.acknowledge', cookie.tech, { workOrder: complete })
    await h.api('workorder.results', cookie.tech, { workOrder: complete, outcome: ['pass', 'pass', 'pass'], note: ['', '', 'Dryer inspected'] })
    await submit(complete)
    // New procedure revisions never silently reuse old equivalence approval.
    await h.api('checklist.revise', cookie.lead, { checklist: monthlyProcedure, items: ['Inspect belt', 'Inspect dryer', 'New safety inspection'], note: 'Revised OEM requirement' })
    await h.api('nested.map', cookie.lead, { ...mapping, higher: completeAnnual, tasks: ['1 = 1', '2 = 3', '3 = 2'] })
    await h.api('nested.satisfy', cookie.lead, { higherWork: complete, lowerWork: month }, 409)
    // The retained prior mapping is readable; republish a matching procedure and issue a fresh lower package.
    const freshLower = await schedule('Monthly fully evidenced service', 30, weeklyProcedure)
    await h.api('nested.map', cookie.lead, { higher: completeAnnual, lower: freshLower, tasks: ['1 = 3'], reason: 'Matching check, explicitly approved for the linked dryer' })
    const fresh = (await h.api('workorders.generate', cookie.lead, {})).created.find(row => row.schedule === freshLower).id
    await h.api('nested.satisfy', cookie.lead, { higherWork: complete, lowerWork: fresh })
    assert.equal((await h.api('programs', cookie.owner)).satisfied.length, 2)
    const startedLower = await schedule('Monthly job already costed', 30, weeklyProcedure)
    await h.api('nested.map', cookie.lead, { higher: completeAnnual, lower: startedLower, tasks: ['1 = 1'], reason: 'Same inspection, but existing work must be preserved' })
    const started = (await h.api('workorders.generate', cookie.lead, {})).created.find(row => row.schedule === startedLower).id
    await h.api('work.cost', cookie.lead, { workOrder: started, category: 'labor', amount: '25', note: 'Technician already worked on this occurrence' })
    await h.api('nested.satisfy', cookie.lead, { higherWork: complete, lowerWork: started }, 409)
    assert.equal((await h.api(`work/${started}`, cookie.owner)).status, 'open')
    assert.equal((await h.api(`work/${month}`, cookie.owner)).status, 'open', 'missed monthly obligation remains due')
    const screen = await (await h.raw('/app/programs', { cookie: cookie.owner })).text()
    assert.ok(screen.includes('Annual compressor shutdown package')); assert.ok(screen.includes(`/app/work/${high}`)); assert.ok(screen.includes(`/app/work/${low}`))
    assert.ok((await (await h.raw(`/app/work/${low}`, { cookie: cookie.owner })).text()).includes('Satisfied by approved equivalent'))
    assert.equal((await h.raw('/api/gasket/programs')).status, 401)
    assert.equal((await h.raw('/app/programs')).status, 303)
    assert.ok((await h.api('audit?action=nested.satisfy', cookie.owner)).rows.some(row => row.subject === low))
    await onReady?.({ h, cookie, paths: ['/app/programs', `/app/programs?higherWork=${high}&lowerWork=${month}`, `/app/work/${low}`, '/app/schedules'] })
  } finally { await h.close() }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { await nestedJourney(); console.log('PM-009 nested services and evidenced occurrence satisfaction passed') }
