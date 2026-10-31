import assert from 'node:assert/strict'
import { randomUUID, webcrypto } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { serveHosted, HOSTED_ORIGIN } from '../../node_modules/@runeditrun/rer/cli/hosted-output.mjs'
import { accessToken, autonomousPolicy, heldPolicy, policyEnvelope, signJws } from '../../src/modules/agent-door/conformance/crypto.mjs'
import initialize from './initialize-agent-owner.mjs'
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

/** One public-door journey covers corrective policy execution and its refusal boundaries. */
export default async function proposalPolicyJourney() {
  const email = ['synthetic-gasket-50', 'example.test'].join('@'), leadEmail = ['synthetic-gasket-51', 'example.test'].join('@')
  const issuer = 'https://synthetic-gasket.invalid', installationId = randomUUID(), kid = randomUUID(), sub = randomUUID()
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publicKeys = { [kid]: await webcrypto.subtle.exportKey('jwk', pair.publicKey) }, mails = []
  const hosted = await serveHosted(fileURLToPath(new URL('../../', import.meta.url)), { bindings: {
    RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId,
    RER_OWNER_CLAIM_APP_ORIGIN: HOSTED_ORIGIN, RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(publicKeys),
    RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience: HOSTED_ORIGIN, subject: installationId, email, keys: publicKeys }),
    OWNER_EMAIL: email, SETUP_TOKEN: randomUUID(), SESSION_SECRET: randomUUID(), MAIL_PROVIDER: 'resend',
  }, outboundService: async request => { mails.push(await request.json()); return Response.json({ id: `synthetic-gasket-${mails.length}` }) } })
  const origin = hosted.origin, request = (url, init = {}) => hosted.fetch(new URL(url, origin).href.slice(origin.length + 1), init)
  const iat = Math.floor(Date.now() / 1000)
  const signer = { issuer, installationId, kid, privateKey: pair.privateKey }
  let cookie, seq = 0, revision = 0
  const context = { signer, origin, person: { sub, email }, agentId: 'synthetic-gasket-50', surface: { specialist: 'maintenance coordinator', tools: [{ scope: 'proposal.decide' }] }, business: 'synthetic-gasket-50', consent: randomUUID() }
  const person = async (path, body, who = cookie, status = 200, method) => {
    const response = await request(path, { method: method ?? (body === undefined ? 'GET' : 'POST'), redirect: 'manual', headers: { Origin: origin, Cookie: who ?? '', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const text = await response.text()
    assert.equal(response.status, status, `${path}: ${response.status} ${text.slice(0, 250)}`)
    return text ? JSON.parse(text) : null
  }
  const api = (path, body, who = cookie, status = 200) => person(`/api/gasket/${path}`, body, who, status)
  const policy = async (document, options = {}) => {
    const envelope = await policyEnvelope({ ...context, seq, revision }, document, { seq: ++seq, revision: ++revision, ...options })
    await person('/api/rer/agent-policy', { policy: envelope.policy }, '', 200)
  }
  const call = async (args, overrides = {}) => {
    const token = await accessToken(context, overrides)
    const response = await request('/mcp', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-11-25', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'gasket.proposals.apply_corrective' }, body: JSON.stringify({ jsonrpc: '2.0', id: 50, method: 'tools/call', params: { name: 'gasket.proposals.apply_corrective', arguments: args } }) })
    return { status: response.status, ...await response.json() }
  }
  const code = answer => answer.result?._meta?.['com.runeditrun/error']?.code ?? answer.error?.data?.code ?? (answer.status === 401 ? 'unauthenticated' : undefined)
  try {
    const claim = await signJws(pair.privateKey, kid, 'rer-owner-claim+jwt', { v: 1, iss: issuer, aud: origin, installationId, email, jti: randomUUID(), iat, exp: iat + 300 })
    const boot = await initialize({ request, origin, claim: { path: '/auth/owner-claim', token: claim }, displayName: 'Synthetic Gasket Owner', returnTo: '/app' })
    cookie = boot.headers.getSetCookie().map(line => line.split(';', 1)[0]).join('; ')
    await boot.body?.cancel()
    const settings = await signJws(pair.privateKey, kid, 'rer-business-settings+jwt', { v: 1, iss: issuer, aud: origin, sub: installationId, business: context.business, email, owner_id: sub, jti: randomUUID(), iat, exp: iat + 300, rev: 1, values: {}, logo: null, team: null })
    await person('/api/rer/business-settings', { settings }, '')
    const owner = await api('me')
    const leadSub = randomUUID()
    const teamSettings = await signJws(pair.privateKey, kid, 'rer-business-settings+jwt', { v: 1, iss: issuer, aud: origin, sub: installationId, business: context.business, email, owner_id: sub, jti: randomUUID(), iat, exp: iat + 300, rev: 2, values: {}, logo: null, team: [{ id: leadSub, email: leadEmail, name: 'Synthetic Gasket Lead', role: 'member', invite: 1 }] })
    await person('/api/rer/business-settings', { settings: teamSettings }, '')
    const leadClaims = { sub: leadSub, email: leadEmail, act: { sub: 'synthetic-gasket-51', name: 'Synthetic lead agent', specialist: 'maintenance coordinator' } }
    await person('/auth/magic-link', { email: leadEmail, returnTo: '/app' }, '', 202)
    const message = mails.findLast(mail => JSON.stringify(mail.to).includes(leadEmail))
    const link = [...String(message.text).matchAll(/https?:\/\/[^\s<>]+/g)].map(match => new URL(match[0])).find(url => url.searchParams.has('token'))
    assert.ok(link, 'native sign-in mail contains its one-time link')
    const signed = await request('/auth/confirm', { method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: link.searchParams.get('token') }) })
    assert.equal(signed.status, 303)
    const leadCookie = signed.headers.getSetCookie().map(line => line.split(';', 1)[0]).join('; ')
    await signed.body?.cancel()
    const lead = await api('me', undefined, leadCookie)
    await api('access.role', { member: lead.id, role: 'lead' })
    const asset = await api('asset.create', { tag: 'synthetic-gasket-50', name: 'Synthetic pump', location: 'Workshop' })
    let assetRevision = 1
    const prepare = async (title, who = cookie) => {
      const proposal = await api('proposal.prepare', { kind: 'corrective', reasoning: 'Inspect a reported vibration; no physical completion asserted.', payload: { asset: asset.id, title, description: 'Retain the exact proposed instructions.', due: '2030-01-11', assignee: lead.id } }, who)
      return { proposal: proposal.id, hash: proposal.hash, assetRevision, expected_revision: assetRevision, idempotency_key: randomUUID() }
    }
    const native = async () => ({ work: await api('work'), proposals: await api('proposals'), effects: (await api('audit?action=proposal.apply')).rows })
    const refuses = async (args, expected, overrides) => {
      const before = await native(), answer = await call(args, overrides)
      assert.equal(code(answer), expected, `${expected}: ${JSON.stringify(answer).slice(0, 350)}`)
      assert.deepEqual(await native(), before, `${expected} changes no native work, proposal or application receipt`)
    }
    await policy(autonomousPolicy())
    const allowed = await prepare('Synthetic allowed correction'), before = await native()
    const applied = await call(allowed)
    assert.equal(applied.result?.isError, false, JSON.stringify(applied))
    const result = applied.result.structuredContent
    assert.equal(result.status, 'applied')
    const work = await api(`work/${result.result}`)
    assert.deepEqual([work.asset_id, work.title, work.description, work.assignee_id, work.due_date], [asset.id, 'Synthetic allowed correction', 'Retain the exact proposed instructions.', lead.id, '2030-01-11'])
    const retained = (await api('proposals')).find(row => row.id === allowed.proposal)
    assert.equal(retained.decided_by, null, 'autonomous application invents no human approval')
    const effects = (await native()).effects.filter(row => row.subject === allowed.proposal)
    assert.equal(effects.length, 1)
    const receipt = JSON.parse(effects[0].detail)
    assert.deepEqual([receipt.hash, receipt.assetRevision, receipt.result, receipt.approvedBy], [allowed.hash, 1, work.id, []])
    assert.equal((await native()).work.length, before.work.length + 1)
    const after = await native(), replay = await call(allowed)
    assert.deepEqual(replay.result.structuredContent, result)
    assert.deepEqual(await native(), after)
    assert.equal((await api('audit?action=workorder.create')).rows.filter(row => JSON.parse(row.detail).proposal === allowed.proposal).length, 1)
    console.log('PROBE GAS-13 allowing and replay: MCP exact stored proposal -> one corrective order, one atomic application receipt, no invented approver')

    const changed = await prepare('Synthetic hash fence')
    await refuses({ ...changed, hash: '0'.repeat(64) }, 'proposal_changed')
    await refuses({ ...changed, assetRevision: 2 }, 'proposal_changed')
    const detail = await api(`assets/${asset.id}`)
    await api('asset.update', { asset: asset.id, revision: detail.revision, tag: detail.tag, name: 'Synthetic changed pump', location: detail.location })
    assetRevision++
    await refuses(changed, 'revision_conflict')
    await refuses({ ...changed, expected_revision: assetRevision }, 'proposal_stale')
    console.log('PROBE GAS-13 source binding: changed hash or source revision -> refusal with unchanged native records')

    const authority = await prepare('Synthetic current authority')
    // A retained Business grant never substitutes for the sponsor's current native role.
    await api('access.role', { member: lead.id, role: 'supervisor' })
    await refuses(authority, 'forbidden', leadClaims)
    await api('access.role', { member: lead.id, role: 'lead' })
    assert.equal((await call(authority, leadClaims)).result.structuredContent.status, 'applied')
    const directAgent = await api('access.give', { email: ['synthetic-gasket-52', 'example.test'].join('@'), name: 'Synthetic native agent', role: 'agent' })
    await refuses(await prepare('Synthetic native agent sponsor'), 'unauthenticated', { sub: directAgent.id, email: directAgent.email })
    console.log('PROBE GAS-13 current authority: retained scoped token with supervisor role -> refused; restored native lead -> one application')

    // Two application identities competing for one proposal cannot duplicate its business effect.
    const racing = await prepare('Synthetic concurrent application'), raceBefore = await native()
    const racers = await Promise.all([call(racing), call({ ...racing, idempotency_key: randomUUID() })])
    assert.equal(racers.filter(answer => answer.result?.structuredContent?.status === 'applied').length, 1)
    const raceAfter = await native()
    assert.equal(raceAfter.work.length, raceBefore.work.length + 1)
    assert.equal(raceAfter.effects.filter(row => row.subject === racing.proposal).length, 1)
    console.log('PROBE GAS-13 concurrency: two MCP applications of one proposal -> one work order and one application receipt')

    await policy(heldPolicy())
    const held = await prepare('Synthetic held correction'), heldBefore = await native(), review = await call(held)
    assert.equal(review.result.structuredContent.status, 'pending')
    assert.equal(review.result._meta['com.runeditrun/decision'].disposition, 'review')
    assert.deepEqual(await native(), heldBefore)
    const reviews = await person('/agents/api/reviews')
    assert.ok(reviews.reviews.some(row => row.tool === 'gasket.proposals.apply_corrective' && row.prepared_by.for === owner.name))
    await api('proposal.decide', { proposal: held.proposal, hash: held.hash, decision: 'approve' }, cookie, 403)
    const decided = await api('proposal.decide', { proposal: held.proposal, hash: held.hash, decision: 'approve' }, leadCookie)
    assert.equal((await api(`work/${decided.result}`)).title, 'Synthetic held correction')
    const decision = (await api('proposals')).find(row => row.id === held.proposal)
    assert.deepEqual([decision.decided_by, decision.payload_hash, decision.status], [lead.id, held.hash, 'approved'])
    const rejected = await prepare('Synthetic rejected correction'), rejectedBefore = (await native()).work
    await api('proposal.decide', { proposal: rejected.proposal, decision: 'reject', note: 'Duplicate inspection' }, leadCookie)
    await refuses(rejected, 'already_decided')
    assert.deepEqual((await native()).work, rejectedBefore)
    console.log('PROBE GAS-13 held decision and rejection: review -> pending; different lead decides exact hash; rejection creates no work')

    await policy({ ...autonomousPolicy(), rules: [{ id: 'hold', class: '*', do: 'approval', approver: ['sponsor'], wait: 'PT1H' }] })
    const pending = await prepare('Synthetic policy fencing'), pendingCall = await call(pending)
    const approval = pendingCall.result._meta['com.runeditrun/approval'] ?? pendingCall.result._meta['com.runeditrun/error']?.approval
    assert.ok(approval?.id, JSON.stringify(pendingCall))
    const approve = async (handle, status = 200) => {
      const { approval: view } = await person(`/agents/api/approvals/${handle.id}`)
      return person(`/agents/api/approvals/${handle.id}/approve`, { revision: view.revision, summary_sha256: view.summary_sha256 }, cookie, status)
    }
    const selfBefore = await native()
    assert.equal((await approve(approval)).approval.code, 'independent_decision_required')
    assert.deepEqual(await native(), selfBefore, 'policy approval cannot invent an independent human')
    const independent = await prepare('Synthetic genuine policy approval', leadCookie)
    const independentCall = await call(independent)
    const independentHandle = independentCall.result._meta['com.runeditrun/error'].approval
    assert.equal((await approve(independentHandle)).approval.state, 'executed')
    const independentRow = (await api('proposals')).find(row => row.id === independent.proposal)
    assert.deepEqual([independentRow.status, independentRow.decided_by], ['approved', owner.id])
    assert.equal((await api(`work/${independentRow.result_id}`)).title, 'Synthetic genuine policy approval')
    const waiting = await prepare('Synthetic changed policy')
    const waitingCall = await call(waiting)
    const waitingHandle = waitingCall.result._meta['com.runeditrun/error'].approval
    const pendingBefore = await native()
    await policy(autonomousPolicy())
    assert.equal((await approve(waitingHandle)).approval.code, 'approval_evidence_changed')
    assert.deepEqual(await native(), pendingBefore)
    console.log('PROBE GAS-13 policy fencing: policy changes after held admission -> approval refused without native effects')

    await policy({ ...autonomousPolicy(), rules: [{ id: 'hold', class: '*', do: 'approval', approver: ['sponsor'], wait: 'PT1H' }] })
    const lostRole = await prepare('Synthetic approval role removed')
    const lostRoleCall = await call(lostRole, leadClaims)
    const lostRoleHandle = lostRoleCall.result._meta['com.runeditrun/error'].approval
    const roleBefore = await native()
    await api('access.role', { member: lead.id, role: 'supervisor' })
    const { approval: roleView } = await person(`/agents/api/approvals/${lostRoleHandle.id}`, undefined, leadCookie)
    const endedApproval = await person(`/agents/api/approvals/${lostRoleHandle.id}/approve`, { revision: roleView.revision, summary_sha256: roleView.summary_sha256 }, leadCookie)
    assert.equal(endedApproval.approval.state, 'refused')
    assert.deepEqual(await native(), roleBefore)
    await api('access.role', { member: lead.id, role: 'lead' })
    // These admitted actions would otherwise have a genuine independent decision and a supported result.
    for (const boundary of ['pause', 'consent', 'agent']) {
      await policy({ ...autonomousPolicy(), rules: [{ id: 'hold', class: '*', do: 'approval', approver: ['sponsor'], wait: 'PT1H' }] })
      const waitingArgs = await prepare(`Synthetic pending ${boundary}`, leadCookie)
      const identity = { act: { sub: randomUUID(), name: 'Synthetic pending agent', specialist: 'maintenance coordinator' }, consent: randomUUID() }
      const waitingResult = await call(waitingArgs, identity)
      const handle = waitingResult.result._meta['com.runeditrun/error'].approval
      const beforeBoundary = await native()
      if (boundary === 'pause') {
        await person('/agents/api/pause', { paused: true })
        const outcome = await approve(handle)
        assert.deepEqual([outcome.approval.state, outcome.approval.code], ['refused', 'agents_paused'])
        await person('/agents/api/pause', { paused: false })
      } else if (boundary === 'consent') {
        await policy(autonomousPolicy(), { revoked: { agents: [], consents: [identity.consent] } })
        assert.equal((await approve(handle, 409)).code, 'approval_expired')
      } else {
        await person(`/agents/api/agents/${identity.act.sub}/revoke`, {})
        const outcome = await approve(handle)
        assert.deepEqual([outcome.approval.state, outcome.approval.code], ['refused', 'sponsor_unavailable'])
      }
      assert.deepEqual(await native(), beforeBoundary, `${boundary} fences a pending application without work or receipts`)
    }
    console.log('PROBE GAS-13 pending revocation: admitted independent approvals after Pause, consent or agent revocation -> no native effects')
    await policy(autonomousPolicy())
    const refused = await prepare('Synthetic authority refusal')
    await refuses(refused, 'insufficient_scope', { scope: 'assets:read' })
    await policy(autonomousPolicy(), { paused: true })
    await refuses(refused, 'agents_paused')
    await policy(autonomousPolicy(), { revoked: { agents: [], consents: [context.consent] } })
    await refuses(refused, 'unauthenticated')
    await policy(autonomousPolicy())
    await person(`/agents/api/agents/${context.agentId}/revoke`, {})
    const revokeBefore = await native()
    const revoked = await call(refused)
    assert.equal(revoked.status, 401)
    assert.equal(code(revoked), 'unauthenticated')
    assert.deepEqual(await native(), revokeBefore)
    await api('access.end', { member: lead.id })
    await refuses({ ...refused, idempotency_key: randomUUID() }, 'unauthenticated', leadClaims)

    // The native agent role still has preparation only; policy cannot make a direct person command legal.
    await person('/auth/magic-link', { email: directAgent.email, returnTo: '/app' }, '', 202)
    const agentMessage = mails.findLast(mail => JSON.stringify(mail.to).includes(directAgent.email))
    const agentLink = [...String(agentMessage.text).matchAll(/https?:\/\/[^\s<>]+/g)].map(match => new URL(match[0])).find(url => url.searchParams.has('token'))
    const agentSignIn = await request('/auth/confirm', { method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: agentLink.searchParams.get('token') }) })
    const agentCookie = agentSignIn.headers.getSetCookie().map(line => line.split(';', 1)[0]).join('; ')
    await agentSignIn.body?.cancel()
    await api('service.create', { name: 'Synthetic forbidden proposal scope', scopes: ['proposal.decide'], expiresAt: Date.now() + 3600000, consent: true }, cookie, 400)
    const directBefore = await native()
    await api('workorder.create', { asset: asset.id, title: 'Must refuse', due: '2030-01-11' }, agentCookie, 403)
    await api('proposal.decide', { proposal: refused.proposal, hash: refused.hash, decision: 'approve' }, agentCookie, 403)
    assert.deepEqual(await native(), directBefore)
    // Screens use real authenticated native pages; the intercepted network is the built Worker's public door.
    const directory = process.env.GASKET_PROPOSAL_SCREENSHOTS ?? '/tmp/gasket-proposal-policy'
    await mkdir(directory, { recursive: true })
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
    try {
      const browserContext = await browser.newContext()
      await browserContext.addCookies(cookie.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: origin } }))
      const page = await browserContext.newPage()
      await page.route(`${origin}/**`, async route => {
        const req = route.request(), response = await request(req.url(), { method: req.method(), headers: req.headers(), ...(req.postDataBuffer() ? { body: req.postDataBuffer() } : {}) })
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
      })
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1100 })
        await page.goto(`${origin}/app/proposals`)
        if (width === 1440) {
          assert.equal(await page.getByText('Applied by company policy; no human approval recorded', { exact: false }).count() > 0, true)
          assert.equal(await page.getByRole('link', { name: 'Open the work order it raised' }).count() > 0, true)
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
          assert.deepEqual(await page.locator('button,a[role="button"]').evaluateAll(controls => controls.filter(el => !el.textContent.trim() && !el.getAttribute('aria-label')).map(el => el.outerHTML)), [], 'every action has a visible or accessible label')
        }
        await page.screenshot({ path: `${directory}/proposals-${width}.png`, fullPage: true })
      }
      await browserContext.close()
    } finally { await browser.close() }
    console.log('PROBE GAS-13 native screens: proposals page at 1440 and 390 -> policy application and genuine human decisions visible')
    console.log('PROBE GAS-13 revocation: missing scope, Pause, revoked consent and revoked agent -> no work')
  } finally { await hosted.close() }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await proposalPolicyJourney()
