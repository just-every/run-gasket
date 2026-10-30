import assert from 'node:assert/strict'
import { randomUUID, randomBytes, webcrypto } from 'node:crypto'
import { harness } from './harness.mjs'
import { accessToken, autonomousPolicy, heldPolicy, policyEnvelope, signJws } from '../../src/modules/agent-door/conformance/crypto.mjs'
import { errorCode } from '../../src/modules/agent-door/conformance/protocol.mjs'

const name = 'gasket.fields.retire'
const fixtures = new Map()
const headers = (origin, cookie) => ({ Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' })
function native({ request, origin, cookie }) {
  return async (path, body) => {
    const response = await request(new URL(`/api/gasket/${path}`, origin).href, { method: body === undefined ? 'GET' : 'POST', headers: headers(origin, cookie), ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.equal(response.status, 200, `native ${path}`)
    return response.json()
  }
}
async function populated(api) {
  const field = await api('customfield.save', { name: `Synthetic retained field ${randomUUID()}`, entityType: 'asset', type: 'text', scope: 'site' })
  const asset = await api('asset.create', { tag: `synthetic-gasket-${randomUUID()}`, name: 'Synthetic retained asset', location: 'Workshop', customValues: { [field.id]: 'Original maintenance value' } })
  await api('customvalue.set', { entityType: 'asset', entityId: asset.id, customValues: { [field.id]: 'Current maintenance value' } })
  return { ...field, asset: asset.id, before: (await api(`assets/${asset.id}`)).customFields.find(item => item.id === field.id) }
}
async function retained(api, fixture) {
  const archived = (await api(`assets/${fixture.asset}`)).customFields.find(item => item.id === fixture.id)
  assert.equal(archived.retired, 1)
  assert.equal(archived.archived, true)
  assert.equal(archived.revision, fixture.revision + 1)
  assert.equal(archived.value, 'Current maintenance value')
  assert.deepEqual(archived.history, fixture.before.history)
  assert.equal(archived.history.length, 2)
  assert.deepEqual(archived.history.map(item => item.value), ['Current maintenance value', 'Original maintenance value'])
  assert.ok(archived.history.every(item => item.actor && item.changed_at))
}

/** Fresh populated identities for every required Core policy phase. */
export default async function prepare(context) {
  const fixture = await populated(native(context))
  fixtures.set(fixture.id, fixture)
  return { values: { retirement: fixture } }
}

/** Core performs the actual allowing call or genuine held-policy approval. */
export async function afterStep(context) {
  if (context.step.id !== 'retire-field') return
  const api = native(context), fixture = fixtures.get(context.args.id)
  assert.ok(fixture)
  assert.equal(context.result.id, fixture.id)
  await retained(api, fixture)
  const audit = () => api(`audit?action=customfield.retire`)
  const before = await audit()
  const repeated = await context.tool(name, context.args)
  assert.ok(repeated.result?.structuredContent && !repeated.result.isError)
  assert.deepEqual(repeated.result.structuredContent, context.result)
  assert.equal(repeated.decision.classes[0].class, 'destructive')
  assert.equal(repeated.decision.classes[0].facts.measure, 1)
  assert.deepEqual(await audit(), before)
  await retained(api, fixture)
  assert.equal(errorCode(await context.tool(name, { ...context.args, revision: 2 })), 'idempotency_conflict')
  console.log(`PROBE SURFACE-004 retirement-${context.phase}: MCP -> one retired identity, two retained value revisions, attributed policy decision and no second native effect`)
}

/** One public-door safety journey covers stale approvals, native authority and completed replay. */
export async function fieldRetirementJourney() {
  const instant = Date.parse('2030-01-10T12:00:00Z'), pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const kid = 'synthetic-gasket', issuer = 'https://synthetic-gasket.invalid', installationId = 'synthetic-gasket-installation'
  const email = ['synthetic-gasket-owner', 'example.test'].join(String.fromCharCode(64))
  const h = await harness({ clockInstant: instant, vars: { OWNER_EMAIL: email, SESSION_SECRET: randomBytes(32).toString('base64url'), SETUP_TOKEN: randomBytes(32).toString('base64url'), RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId, RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify({ [kid]: await webcrypto.subtle.exportKey('jwk', pair.publicKey) }) } })
  try {
    const owner = await h.owner()
    const api = (path, body, status) => h.api(path, owner, body, status)
    await api('site.configure', { name: 'Synthetic workshop', timezone: 'UTC' })
    const techEmail = ['synthetic-gasket-maintainer', 'example.test'].join(String.fromCharCode(64))
    const tech = await api('access.give', { name: 'Synthetic maintainer', email: techEmail, role: 'maintainer' })
    const techCookie = await h.signIn(techEmail)
    const c = { origin: h.origin, signer: { issuer, installationId, kid, privateKey: pair.privateKey }, person: { sub: 'synthetic-gasket-owner', email }, agentId: `synthetic-gasket-${randomUUID()}`, business: 'synthetic-gasket-business', consent: randomUUID(), now: instant, seq: 0, revision: 0, surface: { specialist: 'maintenance coordinator', tools: [{ scope: 'customfield.retire' }] } }
    const settings = await signJws(pair.privateKey, kid, 'rer-business-settings+jwt', { v: 1, iss: issuer, aud: h.origin, sub: installationId, business: c.business, email, owner_id: c.person.sub, jti: randomUUID(), iat: instant / 1000, exp: instant / 1000 + 300, rev: 1, values: {}, logo: null, team: [{ id: 'synthetic-gasket-maintainer', email: techEmail, name: 'Synthetic maintainer', role: 'member', invite: 1 }] })
    const paired = await h.raw('/api/rer/business-settings', { body: { settings } })
    assert.equal(paired.status, 200, 'signed Business pairing')
    await paired.body?.cancel()
    async function adopt(document, extra = {}) {
      const signed = await policyEnvelope(c, document, extra)
      const response = await h.raw('/api/rer/agent-policy', { body: { policy: signed.policy } })
      assert.equal(response.status, 200, 'signed company policy')
      await response.body?.cancel()
      c.seq = signed.payload.seq; c.revision = signed.payload.revision
    }
    async function mcp(method, params, overrides) {
      const response = await h.raw('/mcp', { body: { jsonrpc: '2.0', id: 1, method, params }, headers: { Authorization: `Bearer ${await accessToken(c, overrides)}`, 'MCP-Protocol-Version': '2025-11-25', 'Mcp-Method': method, ...(params.name ? { 'Mcp-Name': params.name } : {}) } })
      const body = await response.json()
      return { status: response.status, body, message: body, result: body.result, decision: body.result?._meta?.['com.runeditrun/decision'] }
    }
    const call = (args, overrides) => mcp('tools/call', { name, arguments: args }, overrides)
    const args = field => ({ id: field.id, revision: field.revision, expected_revision: field.revision, idempotency_key: randomUUID() })
    const person = async (path, body, status = 200, cookie = owner) => {
      const response = await h.raw(path, { cookie, body })
      const value = await response.json()
      assert.equal(response.status, status, `${path}: ${JSON.stringify(value)}`)
      return value
    }
    const approvalFor = async answer => {
      const id = answer.result?._meta?.['com.runeditrun/approval']?.id
      assert.ok(id, 'held call returns genuine approval')
      return (await person(`/agents/api/approvals/${id}`)).approval
    }
    const decide = approval => person(`/agents/api/approvals/${approval.id}/approve`, { revision: approval.revision, summary_sha256: approval.summary_sha256 })
    const unchanged = async (fixture, run) => {
      const before = { field: (await api('custom-fields')).find(f => f.id === fixture.id), asset: await api(`assets/${fixture.asset}`), audit: await api('audit?action=customfield.retire') }
      await run()
      assert.deepEqual({ field: (await api('custom-fields')).find(f => f.id === fixture.id), asset: await api(`assets/${fixture.asset}`), audit: await api('audit?action=customfield.retire') }, before)
    }
    for (const held of [false, true]) {
      await adopt(held ? heldPolicy() : autonomousPolicy())
      const fixture = await populated(api), input = args(fixture)
      const answer = await call({ ...input, classes: ['standard'], measure: 0, role: 'owner', grant: 'admin' })
      assert.equal(answer.decision.disposition, held ? 'approval' : 'autonomous')
      assert.deepEqual(answer.decision.classes.map(({ class: cls, facts }) => ({ class: cls, facts })), [{ class: 'destructive', facts: { measure: 1 } }])
      if (held) {
        const approval = await approvalFor(answer)
        assert.deepEqual(approval.summary.nativeTarget, { kind: 'custom-field', id: fixture.id })
        assert.deepEqual(approval.summary.target, { id: fixture.id, name: fixture.before.name })
        assert.deepEqual(approval.summary.items, ['Irreversibly retire 1 custom-field identity', 'Revision: 1', 'Entity: asset', 'Type: text', 'Scope: site', 'Retain all values and history'])
        assert.equal((await api('custom-fields')).find(f => f.id === fixture.id).retired, 0)
        await person(`/agents/api/approvals/${approval.id}/approve`, { revision: approval.revision, summary_sha256: 'changed-summary' }, 409)
        await person(`/agents/api/approvals/${approval.id}/approve`, { revision: approval.revision, summary_sha256: approval.summary_sha256 }, 403, techCookie)
        const approved = await decide(approval)
        assert.equal(approved.approval.state, 'executed')
        const done = await call(input)
        assert.equal(done.result?._meta?.['com.runeditrun/receipt']?.approved_by[0], (await api('me')).id)
        if (process.env.GASKET_FIELD_SCREENSHOTS) await browserProof(h, owner, fixture, approval)
      } else assert.equal(answer.result.structuredContent.id, fixture.id)
      await retained(api, fixture)
      const nativeAudit = (await api('audit?action=customfield.retire')).rows.filter(row => row.subject === fixture.id && row.action === 'customfield.retire')
      assert.equal(nativeAudit.length, 1)
      const detail = JSON.parse(nativeAudit[0].detail)
      assert.equal(detail.preparedBy.agent.id, c.agentId)
      assert.equal(detail.preparedBy.for.id, (await api('me')).id)
      assert.equal(detail.approvers.length, held ? 1 : 0)
      await unchanged(fixture, async () => {
        const replay = await call(input)
        assert.equal(replay.result.structuredContent.id, fixture.id)
        assert.equal(replay.decision.classes[0].facts.measure, 1)
        assert.equal(errorCode(await call({ ...input, revision: 2 })), 'idempotency_conflict')
        assert.equal(errorCode(await call({ ...input, idempotency_key: randomUUID() })), 'revision_conflict')
      })
      // Authority remains native under either company policy, including after completed replay.
      const untouched = await populated(api)
      await unchanged(untouched, async () => {
        const beforeAuthority = { me: await api('me'), team: await api('members'), credentials: await api('service-credentials'), state: await person('/agents/api/state') }
        for (const proposed of ['gasket.memberships.change', 'gasket.grants.create', 'gasket.policy.change', 'gasket.fields.save']) {
          assert.equal(errorCode(await mcp('tools/call', { name: proposed, arguments: { subject: c.person.sub, role: 'owner', scope: '*', idempotency_key: randomUUID() } })), 'tool_not_found')
        }
        assert.deepEqual({ me: await api('me'), team: await api('members'), credentials: await api('service-credentials'), state: await person('/agents/api/state') }, beforeAuthority)
        assert.equal(errorCode(await call(args(untouched), { scope: 'assets:read' })), 'insufficient_scope')
        assert.equal(errorCode(await call(args(untouched), { sub: 'synthetic-gasket-maintainer', email: techEmail, act: { sub: `synthetic-gasket-${randomUUID()}`, name: 'Synthetic maintainer agent', specialist: c.surface.specialist } })), 'forbidden')
        await person('/agents/api/pause', { paused: true })
        assert.equal(errorCode(await call(args(untouched))), 'agents_paused')
        await person('/agents/api/pause', { paused: false })
        await adopt(held ? heldPolicy() : autonomousPolicy(), { revoked: { agents: [], consents: [c.consent] } })
        assert.equal((await call(args(untouched))).status, 401)
        await adopt(held ? heldPolicy() : autonomousPolicy())
        const revokedAgent = `synthetic-gasket-${randomUUID()}`
        await mcp('tools/list', {}, { act: { sub: revokedAgent, name: 'Synthetic revocable agent', specialist: c.surface.specialist } })
        await person(`/agents/api/agents/${revokedAgent}/revoke`, {})
        assert.equal((await call(args(untouched), { act: { sub: revokedAgent, name: 'Synthetic revocable agent', specialist: c.surface.specialist } })).status, 401)
      })
      console.log(`PROBE SURFACE-004 policy-${held ? 'held' : 'allowing'}: populated native field -> exact destructive facts, retained values and history, one attributed retirement; scope, authority, Pause, consent and revocation refusals change nothing`)
    }
    await adopt(heldPolicy())
    const stale = await populated(api), staleInput = args(stale), pending = await call(staleInput), approval = await approvalFor(pending)
    await api('customfield.save', { id: stale.id, revision: 1, name: 'Renamed native field', entityType: 'asset', type: 'text', scope: 'site' })
    await unchanged(stale, async () => {
      const refused = await decide(approval)
      assert.equal(refused.approval.state, 'refused')
      assert.equal(refused.approval.code, 'revision_conflict')
      assert.equal(errorCode(await call(staleInput)), 'revision_conflict')
      assert.equal(errorCode(await call({ ...staleInput, revision: 2 })), 'idempotency_conflict')
    })
    await adopt(autonomousPolicy())
    await unchanged(stale, async () => {
      assert.equal(errorCode(await call({ ...staleInput, idempotency_key: randomUUID() })), 'revision_conflict')
      // Omitting the generic expected revision cannot bypass the native source revision.
      const { expected_revision, ...nativeRevision } = staleInput
      assert.equal(errorCode(await call({ ...nativeRevision, idempotency_key: randomUUID() })), 'revision_conflict')
    })
    const service = await api('service.create', { name: 'Synthetic limited reader', scopes: ['assets:read'], expiresAt: instant + 3600000, consent: true })
    await unchanged(stale, async () => {
      const response = await h.raw('/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args(stale) } }, headers: { Authorization: `Bearer ${service.token}`, 'MCP-Protocol-Version': '2025-11-25', 'Mcp-Method': 'tools/call', 'Mcp-Name': name } })
      assert.equal(response.status, 403)
      await response.body?.cancel()
      await api('service.create', { name: 'Synthetic forbidden administration', scopes: ['customfield.retire'], expiresAt: instant + 3600000, consent: true }, 400)
    })
    console.log('PROBE SURFACE-004 stale-request: held approval after native rename and altered retry -> revision_conflict and idempotency_conflict; no retirement or authority change')
  } finally { await h.close() }
}

async function browserProof(h, cookie, fixture, approval) {
  const { chromium } = await import('@playwright/test')
  const { mkdir } = await import('node:fs/promises')
  await mkdir(process.env.GASKET_FIELD_SCREENSHOTS, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext()
    await context.addCookies(cookie.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
    const page = await context.newPage()
    for (const [screen, path] of [['field-retirement', `/agents/approvals/${approval.id}`], ['retained-values', `/app/assets/${fixture.asset}`]]) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        assert.equal((await page.goto(h.origin + path)).status(), 200)
        if (screen === 'retained-values') { await page.getByText('Value history', { exact: true }).click(); await page.locator('#custom-fields').scrollIntoViewIfNeeded() }
        if (width === 1440) {
          assert.ok((await page.locator('body').innerText()).includes(screen === 'retained-values' ? 'Current maintenance value' : fixture.before.name))
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        }
        await page.screenshot({ path: `${process.env.GASKET_FIELD_SCREENSHOTS}/${screen}-${width}.png` })
      }
    }
    await context.close()
  } finally { await browser.close() }
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await fieldRetirementJourney()
