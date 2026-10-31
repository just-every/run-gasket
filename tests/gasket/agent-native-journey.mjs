import { agentOutcomePolicyJourney } from './agent-outcome-policy.mjs'
import assert from 'node:assert/strict'
import procedureRevisions from './agent-procedure-revisions.mjs'
export { beforeStep, afterStep } from './agent-procedure-revisions.mjs'

/** Additional Core proof uses native sessions and issued credentials; no fixture authority enters production. */
export default async function journey({ request, origin, cookie, tool }) {
  const api = async (path, body) => {
    const response = await request(new URL(`/api/gasket/${path}`, origin).href, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.equal(response.status, 200, `native ${path}`)
    return response.json()
  }
  const mcp = async (credential, name, args) => {
    const response = await request(new URL('/mcp', origin).href, { method: 'POST', headers: { Authorization: `Bearer ${credential}`, Origin: origin, 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-11-25', 'Mcp-Method': 'tools/call', 'Mcp-Name': name }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })
    return { status: response.status, body: await response.json() }
  }
  const person = async (path, body) => {
    const response = await request(new URL(path, origin).href, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(response.status, 200, `native person door ${path}`)
    return response.json()
  }
  const scoped = await api('service.create', { name: 'Synthetic read-only stock coordinator', scopes: ['assets:read'], expiresAt: Date.now() + 3600000, consent: true })
  console.log('Native Core journey: credential issued')
  const before = await api('assets')
  const read = await mcp(scoped.token, 'gasket.assets.list', {})
  assert.equal(read.status, 200)
  assert.ok(read.body.result?.structuredContent && !read.body.result.isError)
  console.log('Native Core journey: scoped read passed')
  const denied = await mcp(scoped.token, 'gasket.assets.create', { tag: 'scope-must-refuse', name: 'Refused', location: 'Workshop', idempotency_key: crypto.randomUUID() })
  assert.equal(denied.status, 403)
  assert.equal(denied.body.error?.data?.code ?? denied.body.result?._meta?.['com.runeditrun/error']?.code, 'insufficient_scope')
  assert.deepEqual(await api('assets'), before)
  console.log('Native Core journey: scope refusal preserved native records')
  await person('/agents/api/pause', { paused: true })
  try {
    const paused = await tool('gasket.assets.create', { tag: 'pause-must-refuse', name: 'Paused action', location: 'Workshop', idempotency_key: crypto.randomUUID() })
    assert.equal(paused.result?._meta?.['com.runeditrun/error']?.code, 'agents_paused')
    assert.equal((await mcp(scoped.token, 'gasket.assets.list', {})).body.result?._meta?.['com.runeditrun/error']?.code, 'agents_paused')
    assert.deepEqual(await api('assets'), before)
  } finally {
    await person('/agents/api/pause', { paused: false })
  }
  console.log('Native Core journey: local Pause refused Business and service calls; native person access remained available')
  await person(`/agents/api/agents/${encodeURIComponent(`gasket-service:${scoped.id}`)}/revoke`, {})
  assert.equal((await mcp(scoped.token, 'gasket.assets.list', {})).status, 401)
  console.log('Native Core journey: agent revocation stopped the next scoped call')
  await api('service.revoke', { credential: scoped.id })
  assert.equal((await mcp(scoped.token, 'gasket.assets.list', {})).status, 401)
  const malformed = await mcp('eyJhbGciOiJFUzI1NiIsInR5cCI6ImF0K2p3dCJ9.e30.invalid', 'gasket.assets.list', {})
  assert.equal(malformed.status, 401)

  console.log('Native Core journey: revocation and malformed token refused')
  const first = await tool('gasket.workspace.snapshot', {})
  const listed = first.result?.structuredContent?.assets?.[0]
  assert.ok(listed)
  const asset = await api(`assets/${listed.id}`)
  const key = crypto.randomUUID(), args = { asset: asset.id, revision: asset.revision, expected_revision: asset.revision, tag: asset.tag, name: asset.name, location: asset.location, idempotency_key: key }
  const changed = await tool('gasket.assets.update', args)
  assert.ok(changed.result?.structuredContent && !changed.result.isError)
  const after = await api(`assets/${asset.id}`)
  const conflict = await tool('gasket.assets.update', { ...args, name: 'Changed arguments on the same key' })
  assert.equal(conflict.result?._meta?.['com.runeditrun/error']?.code, 'idempotency_conflict')
  const stale = await tool('gasket.assets.update', { ...args, idempotency_key: crypto.randomUUID() })
  assert.equal(stale.result?._meta?.['com.runeditrun/error']?.code, 'revision_conflict')
  assert.deepEqual(await api(`assets/${asset.id}`), after)
  console.log('Native Core journey: changed-key and stale-revision refusals preserved native records')
  const work = first.result.structuredContent.work.find(work => work.title === 'Synthetic inspect the pump')
  assert.ok(work, 'the MCP-created work remains visible among native issued-work fixtures')
  assert.ok((await api(`work/${work.id}`)).created_by_name.includes(' for '))
  const procedures = await api('checklists')
  assert.ok((await api(`checklists/${procedures[0].id}`)).revisions[0].publishedBy.includes(' for '))
  assert.ok((await api('proposals')).some(proposal => proposal.prepared_by_name.includes(' for ')))
  assert.ok((await api(`assets/${asset.id}/history`)).events.some(event => event.who?.includes(' for ')))
  const audit = await api('audit')
  assert.ok(audit.rows.some(row => JSON.parse(row.detail).preparedBy?.label?.includes(' for ') && row.actor_name.includes(' for ')))
  console.log('Native Core journey: native audit attribution passed')
  await procedureRevisions({ request, origin, cookie, tool })
  await agentOutcomePolicyJourney()
}
