import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const prepared = new Map()
const error = answer => answer.result?._meta?.['com.runeditrun/error']?.code ?? answer.body?.error?.data?.code
const data = answer => {
  assert.equal(answer.status, 200, `procedure transport: ${JSON.stringify(answer.body)}`)
  assert.equal(answer.result?.isError, false, `procedure call: ${error(answer)}`)
  assert.ok(answer.result?.structuredContent)
  return answer.result.structuredContent
}
function doors({ request, origin, cookie }) {
  const raw = (path, body, session = cookie) => request(new URL(path, origin).href, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
    headers: { Cookie: session, Origin: origin, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = async (path, body, status = 200) => {
    const response = await raw(path, body), result = await response.json()
    assert.equal(response.status, status, `${path}: ${JSON.stringify(result)}`)
    return result
  }
  return { raw, json, api: (path, body, status) => json(`/api/gasket/${path}`, body, status) }
}

/** Work issued before an amendment must continue to use its original instructions. */
async function before(ctx) {
  if (ctx.step.id !== 'amend-procedure' || !['autonomous', 'held'].includes(ctx.phase)) return
  const { api } = doors(ctx), source = await api(`checklists/${ctx.args.checklist}`)
  const template = await api('template.save', { name: `synthetic-gasket-${crypto.randomUUID()}`, title: 'Inspect the workshop pump', checklist: source.id })
  const work = await api('workorder.create', { location: 'Workshop', title: 'Issued before procedure amendment', due: '2030-01-10', template: template.id, unassigned: true })
  const pinned = await api(`work/${work.id}`)
  assert.equal(pinned.checklist_revision_id, source.revisions[0].id)
  prepared.set(ctx.args.idempotency_key, { source, work: pinned, template: template.id })
}

/** Both company policies execute this same native revision and replay journey. */
async function after(ctx) {
  if (ctx.step.id !== 'amend-procedure' || !['autonomous', 'held'].includes(ctx.phase)) return
  const { api, json } = doors(ctx), { source, work, template } = prepared.get(ctx.args.idempotency_key)
  const current = await api(`checklists/${source.id}`), revised = current.revisions[0]
  assert.deepEqual(ctx.result, { id: source.id, revision: revised.id, number: 2 })
  assert.equal(revised.items[0].text, ctx.args.amendments[0].text)
  assert.equal(revised.items[0].key, source.revisions[0].items[0].key)
  assert.deepEqual(current.revisions.slice(1), source.revisions)
  assert.deepEqual(revised.items, source.revisions[0].items.map(item => ({ ...item, text: ctx.args.amendments.find(change => change.step === item.key)?.text ?? item.text })))
  const later = await api('workorder.create', { location: 'Workshop', title: 'Issued after procedure amendment', due: '2030-01-11', template, unassigned: true })
  const laterWork = await api(`work/${later.id}`)
  assert.equal(laterWork.checklist_revision_id, revised.id)
  assert.deepEqual(laterWork.items.map((item, index) => Object.fromEntries(Object.keys(revised.items[index]).map(key => [key, item[key]]))), revised.items)
  assert.deepEqual(await api(`work/${work.id}`), work)
  assert.equal(work.status, 'open')
  assert.deepEqual(work.signatures, [])
  const effects = async () => (await api('audit')).rows.filter(row => row.subject === source.id && row.action === 'checklist.revise')
  const audit = await effects()
  assert.equal(audit.length, 1)
  const detail = JSON.parse(audit[0].detail)
  assert.equal(detail.sourceRevision, source.revisions[0].id)
  assert.equal(detail.number, 2)
  const sponsor = await api('me')
  assert.equal(audit[0].actor, sponsor.id)
  assert.deepEqual(detail.preparedBy.for, { id: sponsor.id, name: sponsor.name })
  assert.ok(detail.preparedBy.label.includes(' for '))
  assert.equal(detail.approvers.length, ctx.phase === 'held' ? 1 : 0)

  const replay = await ctx.tool(ctx.step.tool, ctx.args)
  assert.deepEqual(data(replay), ctx.result)
  assert.equal(replay.decision.disposition, ctx.phase === 'held' ? 'approval' : 'autonomous')
  assert.deepEqual(replay.decision.classes.map(({ class: kind, facts }) => ({ class: kind, facts })), [{ class: 'commitment', facts: { measure: 0, currency: 'USD', counterparty: 'internal' } }])
  assert.deepEqual(await effects(), audit)
  assert.deepEqual(await api(`checklists/${source.id}`), current)
  const changed = await ctx.tool(ctx.step.tool, { ...ctx.args, amendments: [{ ...ctx.args.amendments[0], text: 'Changed instructions under an already used key' }] })
  assert.equal(error(changed), 'idempotency_conflict')
  const stale = await ctx.tool(ctx.step.tool, { ...ctx.args, idempotency_key: crypto.randomUUID() })
  assert.equal(error(stale), 'revision_conflict')
  const staleNative = await api('checklist.revise', { checklist: source.id, sourceRevision: source.revisions[0].id, items: ['Must not replace current instructions'], note: 'Stale native caller' }, 409)
  assert.equal(staleNative.error, 'revision_conflict')
  assert.deepEqual(await api(`checklists/${source.id}`), current)
  assert.deepEqual(await effects(), audit)
  console.log(`PROBE SURFACE-003 ${ctx.phase}: public MCP amendment and native reads -> commitment, exact source audit, immutable history, pinned issued instructions and replay without another native effect`)

  if (ctx.phase === 'held' && ctx.isolated) {
    const args = { ...ctx.args, sourceRevision: revised.id, expected_revision: revised.id, idempotency_key: crypto.randomUUID(), amendments: [{ step: revised.items[0].key, text: 'Inspect the guard before reporting the observation.' }], note: 'Exact held instruction amendment' }
    const pending = await ctx.tool(ctx.step.tool, args)
    assert.equal(pending.result?.resultType, 'input_required')
    assert.equal(pending.result.structuredContent, undefined)
    assert.deepEqual(await api(`checklists/${source.id}`), current)
    const handle = pending.result._meta['com.runeditrun/approval'], path = `/agents/api/approvals/${handle.id}`
    const { approval } = await json(path)
    assert.deepEqual(approval.summary.nativeTarget, { kind: 'procedure', id: source.id })
    assert.deepEqual(approval.summary.target, { id: source.id, name: source.name })
    assert.ok(approval.summary.items.some(item => item.includes(revised.id)))
    assert.ok(approval.summary.items.some(item => item.includes(revised.items[0].text)))
    assert.ok(approval.summary.items.some(item => item.includes(args.amendments[0].text)))
    assert.equal(error(await ctx.tool(ctx.step.tool, { ...args, note: 'Changed content after approval preparation' })), 'idempotency_conflict')
    assert.equal((await json(`${path}/approve`, { revision: approval.revision, summary_sha256: '0'.repeat(64) }, 409)).code, 'approval_summary_mismatch')
    assert.deepEqual(await api(`checklists/${source.id}`), current)
    // A genuine native publication consumes the source; an old approval cannot overwrite it.
    const native = await api('checklist.revise', { checklist: source.id, sourceRevision: revised.id, items: [`Native successor instruction | key ${revised.items[0].key}`], note: 'A newer native publication' })
    const superseding = await api(`checklists/${source.id}`), nativeAudit = await effects()
    const refused = await json(`${path}/approve`, { revision: approval.revision, summary_sha256: approval.summary_sha256 })
    assert.equal(refused.approval.state, 'refused')
    assert.equal(refused.approval.code, 'revision_conflict')
    assert.equal(error(await ctx.tool(ctx.step.tool, args)), 'revision_conflict')
    assert.equal(superseding.revisions[0].id, native.revision)
    assert.deepEqual(await api(`checklists/${source.id}`), superseding)
    assert.deepEqual(await effects(), nativeAudit)
    assert.deepEqual(await api(`work/${work.id}`), work)
    console.log('PROBE SURFACE-003 held source: native publication before approval -> revision_conflict, unchanged successor, issued work and audit effects')
  }
  prepared.delete(ctx.args.idempotency_key)
}

/** Additional public-door refusals and the amendment's existing native screens. */
async function procedureRevisions(ctx) {
  const { api, json, raw } = doors(ctx)
  const source = await api('checklist.create', { name: `synthetic-gasket-${crypto.randomUUID()}`, items: ['Inspect the guard | check', 'Record the gap | number mm 1..5 | when step 1 is pass'] })
  const original = await api(`checklists/${source.id}`), first = original.revisions[0]
  const args = { checklist: source.id, sourceRevision: first.id, expected_revision: first.id, amendments: [{ step: first.items[0].key, text: 'Inspect the guard and report damage' }], note: 'Clarify the observation', idempotency_key: crypto.randomUUID() }
  const missingSource = { ...args }; delete missingSource.sourceRevision
  assert.equal(error(await ctx.tool('gasket.procedures.amend', missingSource)), 'invalid_arguments')
  assert.equal(error(await ctx.tool('gasket.procedures.amend', { ...args, amendments: [{ step: crypto.randomUUID(), text: 'Foreign step' }] })), 'step_not_found')
  const noMetadata = { ...args, amendments: [{ step: first.items[0].key, text: 'Attempt to replace the step type | text' }] }
  assert.equal(error(await ctx.tool('gasket.procedures.amend', noMetadata)), 'invalid_items')
  assert.deepEqual(await api(`checklists/${source.id}`), original)
  const changed = data(await ctx.tool('gasket.procedures.amend', args))
  const amended = await api(`checklists/${source.id}`)
  assert.equal(amended.revisions[0].id, changed.revision)
  assert.deepEqual(amended.revisions[0].items, first.items.map((item, i) => i ? item : { ...item, text: args.amendments[0].text }))
  assert.deepEqual(amended.revisions[1], first)
  await json('/agents/api/pause', { paused: true })
  try {
    const paused = await ctx.tool('gasket.procedures.amend', args)
    assert.equal(error(paused), 'agents_paused')
    assert.equal(paused.result.structuredContent, undefined)
  } finally { await json('/agents/api/pause', { paused: false }) }
  const service = await api('service.create', { name: 'Synthetic bounded reader', scopes: ['assets:read'], expiresAt: Date.now() + 3600000, consent: true })
  const response = await ctx.request(new URL('/mcp', ctx.origin).href, { method: 'POST', headers: { Authorization: `Bearer ${service.token}`, Origin: ctx.origin, 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-11-25', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'gasket.procedures.amend' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'gasket.procedures.amend', arguments: args } }) })
  assert.equal(response.status, 403)
  assert.equal(error({ body: await response.json() }), 'insufficient_scope')
  await api('service.revoke', { credential: service.id })
  assert.deepEqual(await api(`checklists/${source.id}`), amended)
  const signedOut = await raw('/api/gasket/checklist.revise', { checklist: source.id, items: ['Unauthorized'], note: 'No identity' }, '')
  assert.equal(signedOut.status, 401)
  assert.deepEqual(await api(`checklists/${source.id}`), amended)
  console.log('PROBE SURFACE-003 guards: public MCP and native doors -> missing source, foreign step, changed type, Pause, insufficient scope and signed-out refusal; typed native instructions preserved')

  await isolatedRevisions()

  const directory = process.env.PROCEDURE_SCREENSHOTS || `/tmp/gasket-procedures-${process.pid}`
  mkdirSync(directory, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.GASKET_CHROMIUM ? { executablePath: process.env.GASKET_CHROMIUM } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext()
    await context.route('**/*', async route => {
      const target = new URL(route.request().url())
      if (target.origin !== ctx.origin) return route.abort()
      const request = route.request(), response = await ctx.request(target.href, { method: request.method(), headers: { ...request.headers(), Cookie: ctx.cookie }, ...(request.postDataBuffer() ? { body: request.postDataBuffer() } : {}) })
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
    })
    const page = await context.newPage()
    await page.setViewportSize({ width: 1440, height: 1100 })
    assert.equal((await page.goto(`${ctx.origin}/app/checklists/${source.id}`)).status(), 200)
    await page.getByRole('heading', { name: original.name, exact: true }).waitFor()
    assert.ok((await page.getByRole('main').innerText()).includes(args.amendments[0].text))
    assert.ok((await page.getByRole('main').innerText()).includes(first.items[0].text))
    const icons = await page.locator('button,a[href]').evaluateAll(elements => elements.filter(el => el.getClientRects().length && el.querySelector('svg') && !el.textContent.trim()).map(el => el.outerHTML))
    assert.deepEqual(icons, [], 'procedure screen has visible labels on its controls')
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 })
      await page.screenshot({ path: `${directory}/procedure-revisions-${width}.png`, fullPage: true })
    }
    await context.close()
  } finally { await browser.close() }
}

async function diagnose(fn, ctx) {
  try { await fn(ctx) } catch (error) { console.error(`Procedure proof failed in ${fn.name}: ${error.message}`); throw error }
}
export const beforeStep = ctx => diagnose(before, ctx)
export const afterStep = ctx => diagnose(after, ctx)
export default ctx => diagnose(procedureRevisions, ctx)

/** A separate real installation keeps deliberate stale approvals out of the Core harness's own call ledger. */
export async function isolatedRevisions() {
  const { webcrypto, randomBytes } = await import('node:crypto')
  const { harness } = await import('./harness.mjs')
  const { signJws, accessToken, policyEnvelope, autonomousPolicy, heldPolicy } = await import('../../src/modules/agent-door/conformance/crypto.mjs')
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const kid = crypto.randomUUID(), keys = { [kid]: { ...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid, alg: 'ES256', use: 'sig' } }
  const email = ['synthetic-gasket-owner', 'example.test'].join('@'), issuer = 'https://synthetic-gasket.invalid', installationId = crypto.randomUUID(), business = 'synthetic-gasket-company', sub = crypto.randomUUID()
  const h = await harness({ clockOffset: 0, vars: { OWNER_EMAIL: email, SESSION_SECRET: randomBytes(32).toString('hex'), SETUP_TOKEN: randomBytes(32).toString('hex'), RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId, RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(keys), RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience: 'self-host', subject: installationId, email, keys }) } })
  try {
    const cookie = await h.owner(), owner = await h.api('me', cookie)
    await h.api('site.configure', cookie, { name: 'Synthetic revision workshop', timezone: 'UTC' })
    const leadEmail = ['synthetic-gasket-lead', 'example.test'].join('@'), leadSub = crypto.randomUUID()
    const iat = Math.floor(Date.now() / 1000)
    const settings = await signJws(pair.privateKey, kid, 'rer-business-settings+jwt', { v: 1, iss: issuer, aud: 'self-host', sub: installationId, business, email, owner_id: sub, jti: crypto.randomUUID(), iat, exp: iat + 3600, rev: 1, values: {}, logo: null, team: [{ id: leadSub, email: leadEmail, name: 'Synthetic revision lead', role: 'admin', invite: 1 }] })
    const paired = await h.raw('/api/rer/business-settings', { body: { settings } })
    assert.equal(paired.status, 200)
    await paired.body?.cancel()
    const lead = (await h.api('members', cookie)).find(member => member.email === leadEmail)
    assert.equal(lead.role, 'lead')
    const leadCookie = await h.signIn(leadEmail)
    const c = { signer: { issuer, installationId, kid, privateKey: pair.privateKey }, person: { email, sub }, origin: h.origin, business, agentId: `synthetic-gasket-${crypto.randomUUID()}`, consent: crypto.randomUUID(), seq: 0, revision: 0, surface: { specialist: 'maintenance coordinator', tools: [{ scope: 'checklist.revise' }] } }
    const adopt = async (document, options) => {
      const signed = await policyEnvelope(c, document, options)
      const response = await h.raw('/api/rer/agent-policy', { body: { policy: signed.policy } })
      assert.equal(response.status, 200)
      await response.body?.cancel()
      c.seq = signed.payload.seq; c.revision = signed.payload.revision
    }
    const ctx = { request: (url, init = {}) => {
      const headers = new Headers(init.headers), cookie = headers.get('cookie')
      headers.delete('cookie'); headers.delete('origin'); headers.delete('content-type')
      return h.raw(new URL(url).pathname + new URL(url).search, { cookie, method: init.method, headers: Object.fromEntries(headers), ...(init.body ? { body: JSON.parse(init.body) } : {}) })
    }, origin: h.origin, cookie, isolated: true, step: { id: 'amend-procedure', tool: 'gasket.procedures.amend' } }
    // Use the current protocol to exercise a held input request and its native approval evidence.
    ctx.tool = async (name, args, identity = {}) => {
      const token = await accessToken(c, identity)
      const response = await h.raw('/mcp', { headers: { Authorization: `Bearer ${token}`, 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': name }, body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': { elicitation: { url: {} } }, 'io.modelcontextprotocol/clientInfo': { name: 'synthetic-gasket', version: '1' } } } } })
      const body = await response.json()
      return { body, result: body.result, status: response.status, decision: body.result?._meta?.['com.runeditrun/decision'] }
    }
    for (const phase of ['autonomous', 'held']) {
      await adopt(phase === 'held' ? heldPolicy() : autonomousPolicy())
      const source = await h.api('checklist.create', cookie, { name: `synthetic-gasket-${crypto.randomUUID()}`, items: ['Inspect original procedure | check', 'Record clearance | number mm 1..5 | when step 1 is pass', 'Choose condition | options sound, damaged | fail on damaged', 'Describe damage | text | when step 3 is damaged', 'Photograph the guard | photo'] })
      const native = await h.api(`checklists/${source.id}`, cookie), first = native.revisions[0]
      ctx.phase = phase
      ctx.args = { checklist: source.id, sourceRevision: first.id, expected_revision: first.id, amendments: [{ step: first.items[0].key, text: 'Inspect amended procedure' }], note: 'Clarify the inspection', idempotency_key: crypto.randomUUID() }
      await before(ctx)
      let answer = await ctx.tool(ctx.step.tool, ctx.args)
      if (phase === 'held') {
        assert.equal(answer.result.resultType, 'input_required')
        assert.deepEqual(await h.api(`checklists/${source.id}`, cookie), native)
        const path = `/agents/api/approvals/${answer.result._meta['com.runeditrun/approval'].id}`
        const { approval } = await doors(ctx).json(path)
        const approved = await doors(ctx).json(`${path}/approve`, { revision: approval.revision, summary_sha256: approval.summary_sha256 })
        assert.equal(approved.approval.state, 'executed')
        answer = await ctx.tool(ctx.step.tool, ctx.args)
      }
      ctx.result = data(answer)
      await after(ctx)
    }
    // A prepared approval grants no lasting authority to publish its instructions.
    for (const boundary of ['role', 'pause', 'consent']) {
      await adopt(heldPolicy())
      const source = await h.api('checklist.create', cookie, { name: `synthetic-gasket-${crypto.randomUUID()}`, items: ['Retained source instructions'] })
      const original = await h.api(`checklists/${source.id}`, cookie), first = original.revisions[0]
      const identity = boundary === 'role' ? { sub: leadSub, email: leadEmail, act: { sub: `synthetic-gasket-${crypto.randomUUID()}`, name: 'Synthetic held lead coordinator', specialist: 'maintenance coordinator' } } : {}
      const args = { checklist: source.id, sourceRevision: first.id, expected_revision: first.id, amendments: [{ step: first.items[0].key, text: 'Instructions requiring current authority' }], note: 'Held publication boundary', idempotency_key: crypto.randomUUID() }
      const pending = await ctx.tool('gasket.procedures.amend', args, identity)
      assert.equal(pending.result?.resultType, 'input_required', `${boundary}: ${JSON.stringify(pending.body)}`)
      assert.equal(pending.decision.disposition, 'approval')
      const reviewer = doors({ ...ctx, cookie: boundary === 'role' ? leadCookie : cookie })
      const path = `/agents/api/approvals/${pending.result._meta['com.runeditrun/approval'].id}`
      const { approval } = await reviewer.json(path)
      assert.deepEqual(approval.summary.nativeTarget, { kind: 'procedure', id: source.id })
      assert.ok(approval.summary.items.some(item => item.includes(first.id)))
      const audit = (await h.api('audit', cookie)).rows.filter(row => row.subject === source.id)
      if (boundary === 'role') await h.api('access.role', cookie, { member: lead.id, role: 'maintainer' })
      if (boundary === 'pause') await doors(ctx).json('/agents/api/pause', { paused: true })
      if (boundary === 'consent') await adopt(heldPolicy(), { revision: c.revision, revoked: { agents: [], consents: [c.consent] } })
      try {
        const approvalStatus = boundary === 'consent' ? 409 : 200
        const refused = await reviewer.json(`${path}/approve`, { revision: approval.revision, summary_sha256: approval.summary_sha256 }, approvalStatus)
        if (boundary === 'consent') {
          assert.equal(refused.code, 'approval_expired')
          assert.equal((await reviewer.json(path)).approval.state, 'expired')
        } else {
          assert.equal(refused.approval.state, 'refused', `${boundary} must stop an already prepared publication`)
          assert.ok(refused.approval.code)
        }
        const retry = await ctx.tool('gasket.procedures.amend', args, identity)
        assert.equal(retry.result?.structuredContent, undefined)
        assert.ok(error(retry), `${boundary} must also refuse the MCP retry`)
        assert.deepEqual(await h.api(`checklists/${source.id}`, cookie), original)
        assert.deepEqual((await h.api('audit', cookie)).rows.filter(row => row.subject === source.id), audit)
        const again = await reviewer.json(`${path}/approve`, { revision: approval.revision, summary_sha256: approval.summary_sha256 }, approvalStatus)
        assert.deepEqual(again, refused)
      } finally {
        if (boundary === 'role') await h.api('access.role', cookie, { member: lead.id, role: 'lead' })
        if (boundary === 'pause') await doors(ctx).json('/agents/api/pause', { paused: false })
        if (boundary === 'consent') c.consent = crypto.randomUUID()
      }
      assert.deepEqual(await h.api(`checklists/${source.id}`, cookie), original)
      assert.deepEqual((await h.api('audit', cookie)).rows.filter(row => row.subject === source.id), audit)
      console.log(`PROBE SURFACE-003 held ${boundary}: prepare amendment, change current authority, approve and retry -> refused, original revision and source audit unchanged`)
    }
    await adopt(autonomousPolicy())
    const source = await h.api('checklist.create', leadCookie, { name: `synthetic-gasket-${crypto.randomUUID()}`, items: ['Lead-managed instruction'] })
    const first = (await h.api(`checklists/${source.id}`, cookie)).revisions[0]
    const identity = { sub: leadSub, email: leadEmail, act: { sub: `synthetic-gasket-${crypto.randomUUID()}`, name: 'Synthetic lead coordinator', specialist: 'maintenance coordinator' } }
    const args = { checklist: source.id, sourceRevision: first.id, expected_revision: first.id, amendments: [{ step: first.items[0].key, text: 'Lead-authorized amendment' }], note: 'Current lead authority', idempotency_key: crypto.randomUUID() }
    data(await ctx.tool('gasket.procedures.amend', args, identity))
    const allowed = await h.api(`checklists/${source.id}`, cookie), audit = (await h.api('audit', cookie)).rows
    await h.api('access.role', cookie, { member: lead.id, role: 'maintainer' })
    const denied = await ctx.tool('gasket.procedures.amend', args, identity)
    assert.equal(error(denied), 'forbidden')
    assert.equal(denied.result.structuredContent, undefined)
    const nativeDenied = await h.api('checklist.revise', leadCookie, { checklist: source.id, items: ['Must not publish'], note: 'Removed authority' }, 403)
    assert.equal(nativeDenied.error, 'forbidden')
    assert.deepEqual(await h.api(`checklists/${source.id}`, cookie), allowed)
    assert.deepEqual((await h.api('audit', cookie)).rows.filter(row => row.action === 'checklist.revise'), audit.filter(row => row.action === 'checklist.revise'))
    await h.api('access.end', cookie, { member: lead.id })
    assert.equal((await ctx.tool('gasket.procedures.amend', args, identity)).status, 401)
    assert.equal((await h.raw('/api/gasket/checklist.revise', { cookie: leadCookie, body: { checklist: source.id, items: ['Revoked'], note: 'Ended' } })).status, 401)
    const race = await h.api('checklist.create', cookie, { name: `synthetic-gasket-${crypto.randomUUID()}`, items: ['Concurrent source instruction'] })
    const raceSource = (await h.api(`checklists/${race.id}`, cookie)).revisions[0]
    const publications = await Promise.all(['First competing instruction', 'Second competing instruction'].map(text => h.raw('/api/gasket/checklist.revise', { cookie, body: { checklist: race.id, sourceRevision: raceSource.id, items: [text], note: 'Concurrent exact-source publication' } })))
    assert.deepEqual(publications.map(response => response.status).sort(), [200, 409])
    for (const response of publications) await response.body?.cancel()
    const raced = await h.api(`checklists/${race.id}`, cookie)
    assert.equal(raced.revisions.length, 2)
    assert.deepEqual(raced.revisions[1], raceSource)
    assert.equal((await h.api('audit', cookie)).rows.filter(row => row.subject === race.id && row.action === 'checklist.revise').length, 1)
    console.log('PROBE SURFACE-003 concurrent source: two public native publications from one revision -> one success, one 409, one new revision and one audit effect')
    await adopt(autonomousPolicy(), { revoked: { agents: [], consents: [c.consent] } })
    const revoked = await ctx.tool('gasket.procedures.amend', ctx.args)
    assert.equal(revoked.status, 401)
    assert.equal(revoked.result?.structuredContent, undefined)
    assert.deepEqual(await h.api(`checklists/${source.id}`, cookie), allowed)
    console.log('PROBE SURFACE-003 authority: lead MCP amendment succeeds; role removal, ended membership and revoked consent refuse current and completed calls without instructions or new revision effects')
  } finally { await h.close() }
}
