import assert from 'node:assert/strict'

const cron = '*/15 * * * *'
const instant = value => Date.parse(value)

// Continue the public scheduled-delivery journey, including contention at the real D1 claim.
export async function scheduleRiders(h, cookie, ids, body, readDataset) {
  const ownerId = (await h.api('me', cookie.owner)).id
  const base = { ...body, team: '', recipients: [ownerId], firstDay: '2027-03-07', revision: 0 }
  const create = fields => h.api('report.schedule', cookie.owner, { ...base, ...fields })
  const messages = name => h.mails.filter(m => m.subject === `Gasket report: ${name}`)
  const csv = message => Buffer.from(message.attachments.find(a => a.filename === 'dataset.csv').content, 'base64').toString()
  const rows = async id => (await h.api('report-schedules', cookie.owner)).deliveries.filter(d => d.schedule_id === id)
  await create({ name: 'Active delegated control', editor: ids.delegate, paused: true })

  const zone = await create({ name: 'Retained zone' })
  await h.api('site.configure', cookie.owner, { name: 'Great Lakes report plant', timezone: ['Pacific','Auckland'].join('/') })
  const savedPreview=await h.raw(`/app/report-packs/${zone.id}.csv`,{cookie:cookie.owner})
  assert.equal(savedPreview.status,200)
  assert.equal(readDataset(await savedPreview.text()).metadata.zone,'America/New_York','preview retains the saved clock after the site changes')
  await h.api('report.schedule',cookie.owner,{...base,schedule:zone.id,revision:1,name:'Retained zone'})
  await h.scheduled(cron, instant('2027-03-07T13:59:00Z'))
  assert.equal(messages('Retained zone').length, 0)
  await h.scheduled(cron, instant('2027-03-07T14:00:00Z'))
  assert.equal(messages('Retained zone').length, 1)
  assert.equal(readDataset(csv(messages('Retained zone')[0])).metadata.zone, 'America/New_York')
  assert.equal((await h.api('report-schedules', cookie.owner)).schedules.find(s => s.id === zone.id).zone, 'America/New_York')
  await h.api('site.configure', cookie.owner, { name: 'Great Lakes report plant', timezone: 'America/New_York' })

  const backlog = await create({ name: 'Delayed backlog' })
  for (const [index, period] of [
    ['2027-02-28', '2027-03-06'], ['2027-03-07', '2027-03-13'], ['2027-03-14', '2027-03-20'],
  ].entries()) {
    await h.scheduled(cron, instant('2027-03-28T13:00:00Z'))
    assert.equal(messages('Delayed backlog').length, index + 1, 'one oldest outstanding occurrence per tick')
    assert.deepEqual(readDataset(csv(messages('Delayed backlog')[index])).metadata.period, { from: period[0], to: period[1] })
  }
  assert.deepEqual((await rows(backlog.id)).map(d => d.occasion).sort(), ['2027-03-07', '2027-03-14', '2027-03-21'])

  const concurrent = await create({ name: 'Concurrent claims' })
  await Promise.all(Array.from({ length: 3 }, () => h.scheduled(cron, instant('2027-03-07T14:00:00Z'))))
  assert.equal(messages('Concurrent claims').length, 1)
  assert.deepEqual((await rows(concurrent.id)).map(d => [d.occasion, d.state]), [['2027-03-07', 'accepted']])

  const rendering = await create({ name: 'Changed during generation' })
  h.setGenerationHook(async()=>{
    // Other schedules can generate first; wait for this occurrence's claim.
    if(!(await rows(rendering.id)).some(d=>d.state==='unconfirmed'))return
    h.setGenerationHook(undefined)
    await h.api('report.schedule', cookie.owner, { ...base, schedule: rendering.id, name: 'Changed during generation', revision: 1, paused: true })
  })
  try {await h.scheduled(cron, instant('2027-03-07T14:00:00Z'))}finally{h.setGenerationHook(undefined)}
  assert.equal(messages('Changed during generation').length, 0)
  assert.deepEqual((await rows(rendering.id)).map(d => [d.state, d.error]), [['excluded', 'authority_changed']])

  const permission = await create({ name:'Permission changed during generation',recipients:[ids.other] })
  h.setGenerationHook(async()=>{
    if(!(await rows(permission.id)).some(d=>d.state==='unconfirmed'))return
    h.setGenerationHook(undefined)
    await h.api('access.role',cookie.owner,{member:ids.other,role:'maintainer'})
  })
  try{await h.scheduled(cron,instant('2027-03-07T14:00:00Z'))}finally{h.setGenerationHook(undefined)}
  assert.equal(messages('Permission changed during generation').length,0)
  assert.deepEqual((await rows(permission.id)).map(d=>[d.state,d.error]),[['excluded','authority_changed']])
  await h.api('access.role',cookie.owner,{member:ids.other,role:'supervisor'})

  // This is a real account authority transition, through Base's public administration door.
  const operators = await (await h.raw('/auth/operators', { cookie: cookie.owner })).json()
  const operator = operators.find(o => o.email === 'other@example.test')
  assert.ok(operator)
  assert.equal((await h.raw('/auth/operator/role', { cookie: cookie.owner, body: { operatorId: operator.id, role: 'owner' } })).status, 200)
  cookie.other = await h.signIn('other@example.test')
  const second = (await h.api('me', cookie.other)).id
  const owning = { ...base, name: 'Revoked owning principal', editor: ids.delegate, recipients: [ownerId] }
  const revoked = await h.api('report.schedule', cookie.other, owning)
  await h.scheduled(cron, instant('2027-03-07T14:00:00Z'))
  assert.equal(messages('Revoked owning principal').length, 1, 'an active promoted human owner can authorize delivery')
  assert.equal((await h.raw(`/app/report-packs/${revoked.id}.csv`, { cookie: cookie.delegate })).status, 200)
  const inFlightOwner=await h.api('report.schedule',cookie.other,{...owning,name:'Owner changed during generation'})
  h.setGenerationHook(async()=>{
    if(!(await rows(inFlightOwner.id)).some(d=>d.state==='unconfirmed'))return
    h.setGenerationHook(undefined)
    assert.equal((await h.raw('/auth/operator/status', { cookie: cookie.owner, body: { operatorId: operator.id, status: 'inactive' } })).status, 200)
  })
  try{await h.scheduled(cron,instant('2027-03-07T14:00:00Z'))}finally{h.setGenerationHook(undefined)}
  assert.equal(messages('Owner changed during generation').length,0)
  assert.deepEqual((await rows(inFlightOwner.id)).map(d=>[d.state,d.error]),[['excluded','authority_changed']])
  await h.scheduled(cron, instant('2027-03-14T13:00:00Z'))
  assert.equal(messages('Revoked owning principal').length, 1)
  assert.deepEqual((await rows(revoked.id)).filter(d => d.occasion === '2027-03-14').map(d => [d.state, d.error]), [['excluded', 'access_ended']])
  for (const ext of ['csv', 'pdf']) assert.equal((await h.raw(`/app/report-packs/${revoked.id}.${ext}`, { cookie: cookie.delegate })).status, 403)
  await h.api('report.schedule', cookie.delegate, { ...owning, schedule: revoked.id, revision: 1 }, 403)
  assert.equal((await h.api('report-schedules', cookie.delegate)).schedules.some(s => s.id === revoked.id), false)
  assert.equal(second, ids.other)
  // Leave the existing delegated browser journey's active account intact.
  assert.equal((await h.raw('/auth/operator/status', { cookie: cookie.owner, body: { operatorId: operator.id, status: 'active' } })).status, 200)
  assert.equal((await h.raw('/auth/operator/role', { cookie: cookie.owner, body: { operatorId: operator.id, role: 'member' } })).status, 200)
  cookie.other = await h.signIn('other@example.test')
}
