import { strict as assert } from 'node:assert'
import { API_DOORS, PAGE_DOORS } from '../../src/gasket/doors.ts'

// Extends GAS-01's access journey; the planned estate is deliberately inaccessible.
export async function siteAccessJourney(h, owner, lead) {
  const primary = await h.api('/sites/primary', owner)
  assert.equal(primary.state, 'active')
  const first = await h.api('site.create', owner, { name: 'synthetic-gasket-1', timezone: ['America', 'Phoenix'].join('/') })
  const second = await h.api('site.create', owner, { name: 'synthetic-gasket-2', timezone: ['America', 'New_York'].join('/') })
  assert.notEqual(first.id, second.id)
  assert.deepEqual((await h.api('sites', owner)).map(row => row.id).sort(), ['primary', first.id, second.id].sort())
  const manager = (await h.api('access.give', owner, { name: 'Synthetic site manager', email: 'synthetic-gasket-1@example.test', role: 'lead' })).id
  const other = (await h.api('access.give', owner, { name: 'Synthetic other manager', email: 'synthetic-gasket-2@example.test', role: 'lead' })).id
  const signed = await h.signIn('synthetic-gasket-1@example.test')
  await h.api('site.membership', owner, { site: first.id, member: manager, status: 'active', manager: true, revision: 0 })
  await h.api('site.membership', owner, { site: second.id, member: other, status: 'active', manager: true, revision: 0 })
  await h.api('site.membership', owner, { site: 'primary', member: manager, status: 'ended', revision: 1 }, 409)
  assert.deepEqual((await h.api('sites', signed)).map(row => row.id).sort(), ['primary', first.id].sort())
  assert.equal((await h.api(`sites/${first.id}`, signed)).manager, 1)
  const visible = await h.api(`sites/${first.id}`, signed)
  assert.equal(visible.name, 'synthetic-gasket-1')
  assert.equal(visible.members, undefined, 'a recorded manager gains no personnel browsing')
  await h.api(`sites/${second.id}`, signed, undefined, 404)
  assert.equal((await h.api('/sites/primary', signed)).state, 'active')
  assert.deepEqual((await h.api(`sites/${first.id}`, owner)).members.map(row => row.member_id), [manager])
  assert.deepEqual((await h.api(`sites/${second.id}`, owner)).members.map(row => row.member_id), [other])
  await h.api('site.create', signed, { name: 'Forbidden', timezone: 'UTC' }, 403)
  await h.api('site.membership', signed, { site: second.id, member: manager, status: 'active', manager: true, revision: 0 }, 403)
  assert.equal((await h.submit('site.create', lead, { name: 'Forbidden', timezone: 'UTC' })).searchParams.get('error'), 'forbidden')
  await h.api('site.create', owner, { name: 'Invalid', timezone: ['Mars', 'Olympus'].join('/') }, 400)
  await h.api('site.create', owner, { name: 'Unsafe activation', timezone: 'UTC', state: 'active' }, 400)
  await h.api('site.update', owner, { site: first.id, revision: 1, name: 'synthetic-gasket-3', timezone: ['America', 'Denver'].join('/') })
  await h.api('site.update', owner, { site: first.id, revision: 1, name: 'Stale', timezone: 'UTC' }, 409)
  assert.deepEqual(Object.fromEntries(Object.entries(await h.api(`sites/${first.id}`, signed)).filter(([key]) => ['name', 'timezone', 'revision', 'state'].includes(key))),
    { name: 'synthetic-gasket-3', timezone: ['America', 'Denver'].join('/'), state: 'planned', revision: 2 })
  // Every enumerated private read, including original files and report downloads,
  // must refuse an authorized planned selection without serving the primary estate.
  for (const [pattern, name] of API_DOORS) {
    if (name === 'sites') continue
    const path = pattern.replace(/^\^|\$$/g, '').replace('([\\w-]+)', 'x').replace(/\\\./g, '.')
    const response = await h.raw(`/api/gasket/${path}`, { cookie: signed, headers: { 'x-gasket-site': first.id } })
    assert.equal(response.status, 409, path)
    assert.equal((await response.json()).error, 'site_not_operational', path)
  }
  for (const [pattern] of PAGE_DOORS) {
    const path = pattern.includes('/move-in/templates/') ? '/app/move-in/templates/assets.csv' : pattern.replace(/^\^|\$$/g, '').replace(/\(\[\\w-\]\+\)/g, 'x').replace(/\\\./g, '.')
    const response = await h.raw(path, { cookie: signed, headers: { 'x-gasket-site': first.id } })
    assert.equal(response.status, 409, path)
    assert.doesNotMatch(await response.text(), /synthetic-gasket-3|Harbour Kitchen/, path)
  }
  for (const action of ['asset.create', 'workorder.create', 'planning.qualification', 'site.technicianWork']) {
    const refused = await h.raw(`/api/gasket/${action}`, { cookie: signed, body: {}, headers: { 'x-gasket-site': first.id } })
    assert.equal(refused.status, 409)
    assert.equal((await refused.json()).error, 'site_not_operational')
    assert.equal((await h.raw(`/app/do/${action}`, { cookie: signed, form: new URLSearchParams(), headers: { 'x-gasket-site': first.id } })).status, 409)
  }
  for (const who of [owner, signed]) {
    const refused = await h.raw('/api/gasket/assets', { cookie: who, headers: { 'x-gasket-site': first.id } })
    assert.equal(refused.status, 409)
    assert.equal((await refused.json()).error, 'site_not_operational')
  }
  assert.equal((await h.raw('/api/gasket/assets', { cookie: lead, headers: { 'x-gasket-site': first.id } })).status, 404)
  assert.equal((await h.raw('/api/gasket/assets', { cookie: owner, headers: { 'x-gasket-site': 'unknown' } })).status, 404)
  // Planned membership revocation takes effect on the next directory read.
  await h.api('site.membership', owner, { site: first.id, member: manager, status: 'ended', revision: 1 })
  assert.deepEqual((await h.api('sites', signed)).map(row => row.id), ['primary'])
  await h.api(`sites/${first.id}`, signed, undefined, 404)
  assert.equal((await h.raw('/api/gasket/assets', { cookie: signed, headers: { 'x-gasket-site': first.id } })).status, 404)
  await h.api('site.membership', owner, { site: first.id, member: manager, status: 'active', revision: 1 }, 409)
  await h.api('site.membership', owner, { site: first.id, member: manager, status: 'active', manager: true, revision: 2 })
  assert.equal((await h.api(`sites/${first.id}`, signed)).state, 'planned')
  assert.deepEqual((await h.api('assets', signed)), [], 'existing primary authority remains independent of planned membership')
  const racing = await Promise.all(['active', 'ended'].map(status => h.raw('/api/gasket/site.membership', {
    cookie: owner, body: { site: first.id, member: manager, status, manager: false, revision: 3 },
  })))
  assert.deepEqual(racing.map(response => response.status).sort(), [200, 409])
  const raced = (await h.api(`sites/${first.id}`, owner)).members[0]
  assert.equal(raced.revision, 4)
  assert.equal(raced.manager, 0)
  await h.api('access.end', owner, { member: manager })
  assert.ok([401, 403].includes((await h.raw('/api/gasket/sites', { cookie: signed })).status))
  assert.equal((await h.api(`sites/${first.id}`, owner)).members[0].status, 'ended')
  const auditMember = await h.api('access.give', owner, { name: 'Synthetic auditor', email: 'synthetic-gasket-4@example.test', role: 'supervisor' })
  const auditor = await h.signIn('synthetic-gasket-4@example.test')
  const restrictedAudit = await h.api('audit', auditor)
  assert.equal(restrictedAudit.rows.filter(row => [first.id, second.id].includes(JSON.parse(row.detail).siteId)).length, 0)
  assert.doesNotMatch(await (await h.raw('/app/audit.csv', { cookie: auditor })).text(), /synthetic-gasket-3/)
  assert.doesNotMatch(await (await h.raw('/app', { cookie: auditor })).text(), new RegExp(`${first.id}|${second.id}`))
  assert.match(await (await h.raw('/app/audit', { cookie: owner })).text(), /synthetic-gasket-3/)
  const audit = await h.api('audit?action=site.membership', owner)
  assert.ok(audit.rows.some(row => row.site === 'synthetic-gasket-3' && row.subject === manager && JSON.parse(row.detail).siteId === first.id && JSON.parse(row.detail).manager === true))
  await h.signIn('synthetic-gasket-2@example.test')
  await h.api('access.end', owner, { member: other })
  await h.api('access.end', owner, { member: auditMember.id })
}
