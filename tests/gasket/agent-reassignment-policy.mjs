import assert from 'node:assert/strict'
import { randomBytes, randomUUID, webcrypto } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { harness } from './harness.mjs'
import { signJws, accessToken, policyEnvelope, autonomousPolicy, heldPolicy } from '../../src/modules/agent-door/conformance/crypto.mjs'
import { createProtocol, errorCode } from '../../src/modules/agent-door/conformance/protocol.mjs'

/** One sanity journey covers policy execution, retained evidence and unsafe refusals through real doors. */
export async function agentReassignmentPolicyJourney() {
  const instant = Date.parse('2030-01-15T02:00:00Z'), email = name => [name, ['example','test'].join('.')].join('@')
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify'])
  const kid = randomUUID(), issuer = 'https://synthetic-gasket.invalid', installationId = randomUUID()
  const keys = { [kid]: { ...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid, alg: 'ES256', use: 'sig' } }
  const vars = { OWNER_EMAIL: email('synthetic-gasket-owner'), SESSION_SECRET: randomBytes(32).toString('base64url'), SETUP_TOKEN: randomUUID(),
    RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId, RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(keys),
    RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience: 'self-host', subject: installationId, email: email('synthetic-gasket-owner'), keys }) }
  const initial = await harness({ vars, clockInstant: instant })
  let h = initial, tick = instant
  const ids = {}, cookie = {}, points = []
  const api = (...args) => h.api(...args)
  const person = async (path, who = 'owner', body, status = 200) => {
    const response = await h.raw(path, { cookie: cookie[who], body })
    assert.equal(response.status, status, `person ${path}`)
    return response.json()
  }
  const day = n => new Date(tick + n * 86400000).toISOString().slice(0,10)
  const work = id => api(`work/${id}`, cookie.owner)
  const queue = who => api('work', cookie[who])
  const retained = async id => ({ work: await work(id), max: await queue('max'), mo: await queue('mo') })
  try {
    cookie.owner = await h.owner()
    await api('site.configure', cookie.owner, { name: 'Synthetic gasket workshop', timezone: 'Australia/Sydney' })
    ids.owner = (await api('me', cookie.owner)).id
    const settings = await signJws(pair.privateKey, kid, 'rer-business-settings+jwt', {
      v: 1, iss: issuer, aud: 'self-host', sub: installationId, business: 'synthetic-gasket-business', email: vars.OWNER_EMAIL,
      owner_id: 'synthetic-gasket-owner', jti: randomUUID(), iat: instant / 1000, exp: instant / 1000 + 300, rev: 1, values: {}, logo: null,
      team: ['lead','max','mo'].map(key => ({ id: `synthetic-gasket-${key}`, email: email(`synthetic-gasket-${key}`), name: `Synthetic gasket ${key}`, role: key === 'lead' ? 'admin' : 'member', invite: 1 })),
    })
    const paired = await h.raw('/api/rer/business-settings', { body: { settings } })
    assert.equal(paired.status, 200, await paired.text())
    const members = await api('members', cookie.owner)
    for (const key of ['lead','max','mo']) {
      ids[key] = members.find(member => member.email === email(`synthetic-gasket-${key}`)).id
      cookie[key] = await h.signIn(email(`synthetic-gasket-${key}`))
    }
    for (const [key, role] of [['sam','supervisor'],['agent','agent']]) {
      ids[key] = (await api('access.give', cookie.owner, { name: `Synthetic gasket ${key}`, email: email(`synthetic-gasket-${key}`), role })).id
      cookie[key] = await h.signIn(email(`synthetic-gasket-${key}`))
    }
    const asset = (await api('asset.create', cookie.lead, { tag: 'synthetic-gasket-1', name: 'Synthetic compressor', location: 'Workshop' })).id
    const checklist = (await api('checklist.create', cookie.lead, { name: 'Synthetic inspection', items: ['Listen for bearing noise'] })).id
    const schedule = (await api('schedule.create', cookie.lead, { asset, checklist, title: 'Synthetic overdue inspection', everyDays: 30, firstDue: day(-4), assignee: ids.max })).id
    const pm = (await api('workorders.generate', cookie.lead, {})).created.find(row => row.schedule === schedule).id
    await api('workorder.acknowledge', cookie.max, { workOrder: pm })
    await api('workorder.results', cookie.max, { workOrder: pm, item: ['0'], outcome: ['fail'], note: ['Bearing needs repair'] })
    const repair = (await api('finding.record', cookie.max, { workOrder: pm, item: 0, severity: 'high', text: 'Repair the bearing', followUp: true })).followUp
    await api('workorder.assign', cookie.lead, { workOrder: repair, assignee: ids.mo })
    await api('finding.record', cookie.mo, { workOrder: repair, severity: 'low', text: 'Repair complete; physical observations retained' })
    await api('workorder.submit', cookie.mo, { workOrder: repair, version: (await work(repair)).version })
    const blocker = await api('blocker.raise', cookie.max, { workOrder: pm, kind: 'parts', nextAction: 'Collect the bearing', promisedOn: day(0) })
    await api('chase.rule', cookie.lead, { remindBeforeDays: 1, responseWithinDays: 1, leadAfterDays: 90, supervisorAfterDays: 180 })
    const query = await api('agent.query', cookie.agent, { workOrder: pm, version: (await work(pm)).version, question: 'When will parts and inspection be ready?' })
    await api('agent.answer', cookie.max, { query: query.id, nextAction: 'Collect the bearing and inspect', promisedOn: day(0) })
    await h.stop()
    tick += 2 * 86400000
    h = await harness({ vars, installation: initial.installation, clockInstant: tick })
    cookie.owner = await h.signIn(vars.OWNER_EMAIL)
    for (const key of ['lead','max','mo','sam','agent']) cookie[key] = await h.signIn(email(`synthetic-gasket-${key}`))
    const state = await api(`agent-follow-up/${pm}`, cookie.agent)
    assert.equal(state.missed[0].id, query.id)
    assert.equal(state.blockers[0].id, blocker.id)
    assert.equal(state.linked[0].status, 'submitted')
    assert.equal(state.escalationDue, true)
    const context = { origin: h.origin, signer: { issuer, installationId, kid, privateKey: pair.privateKey }, now: () => tick,
      person: { email: vars.OWNER_EMAIL, sub: 'synthetic-gasket-owner', cookie: cookie.owner }, business: 'synthetic-gasket-business',
      consent: randomUUID(), agentId: `synthetic-gasket-${randomUUID()}`, seq: 0, revision: 0,
      surface: { seed: 'gasket', specialist: 'maintenance coordinator', tools: [{ scope: 'proposal.decide' }] } }
    const adopt = async (document, options = {}) => {
      const signed = await policyEnvelope(context, document, options)
      const response = await h.raw('/api/rer/agent-policy', { body: { policy: signed.policy } })
      assert.equal(response.status, 200, await response.text())
      context.seq = signed.payload.seq; context.revision = signed.payload.revision
    }
    const protocol = createProtocol({ ...context, points })
    protocol.fetch = (url, init = {}) => h.raw(new URL(url).pathname + new URL(url).search, {
      method: init.method, headers: Object.fromEntries(new Headers(init.headers)), ...(init.body === undefined ? {} : { body: JSON.parse(init.body) }),
    })
    const call = (args, options) => protocol.tool('gasket.proposals.reassign', args, options)
    const draft = async (id = pm, assignee = ids.mo) => {
      const p = await api('proposal.prepare', cookie.agent, { kind: 'reassign', reasoning: 'Missed promise and retained repair evidence need reassignment.', payload: { workOrder: id, assignee, note: 'Coordinate the next inspection.' } })
      const saved = (await api('proposals', cookie.owner)).find(row => row.id === p.id)
      return { proposal: p.id, hash: p.hash, source: saved.source, idempotency_key: randomUUID() }
    }
    const savedProposal = async args => (await api('proposals', cookie.owner)).find(row => row.id === args.proposal)
    const refuse = async (args, codes, label, options) => {
      const before = await retained(pm), proposal = await savedProposal(args)
      const answer = await call(args, options)
      if (codes.includes('unauthenticated')) assert.equal(answer.status, 401, `${label} HTTP refusal`)
      assert.ok(codes.includes(errorCode(answer)) || codes.includes('unauthenticated') && errorCode(answer) === -32001, `${label}: ${errorCode(answer)} ${JSON.stringify(answer.body)}`)
      assert.deepEqual(await retained(pm), before, `${label} preserves work and both queues`)
      assert.deepEqual(await savedProposal(args), proposal, `${label} preserves proposal`)
      return answer
    }
    await adopt(autonomousPolicy())
    let args = await draft()
    const originalBasis = (await savedProposal(args)).basis
    assert.equal(originalBasis.queries[0].id, query.id)
    assert.equal(originalBasis.blockers[0].id, blocker.id)
    assert.equal(originalBasis.linked[0].id, repair)
    assert.equal(originalBasis.rule.number, state.rule.number)
    await refuse({ ...args, hash: 'a'.repeat(64) }, ['proposal_changed'], 'changed payload hash')
    await refuse({ ...args, source: 'a'.repeat(64) }, ['proposal_changed'], 'changed source hash')
    // Each mutation changes a distinct source class without applying the obsolete proposal.
    await api('blocker.resolve', cookie.max, { blocker: blocker.id, resolution: 'Bearing collected' })
    await refuse(args, ['proposal_stale'], 'changed blocker')
    args = await draft()
    const nextQuery = await api('agent.query', cookie.agent, { workOrder: pm, version: (await work(pm)).version, question: 'What remains to be inspected?' })
    await refuse(args, ['proposal_stale'], 'changed question')
    args = await draft()
    await api('chase.rule', cookie.lead, { remindBeforeDays: 2, responseWithinDays: 1, leadAfterDays: 90, supervisorAfterDays: 180 })
    await refuse(args, ['proposal_stale'], 'changed rule')
    args = await draft()
    await api('workorder.review', cookie.sam, { workOrder: repair, version: (await work(repair)).version, decision: 'approve' })
    await refuse(args, ['proposal_stale'], 'changed linked outcome')
    args = await draft()
    await api('workorder.results', cookie.max, { workOrder: pm, item: ['0'], outcome: ['fail'], note: ['Bearing still needs repair'] })
    await refuse(args, ['proposal_stale'], 'changed work revision')
    args = await draft()
    await api('access.role', cookie.owner, { member: ids.mo, role: 'supervisor' })
    await refuse(args, ['assignee_not_assignable'], 'changed assignee eligibility')
    await api('access.role', cookie.owner, { member: ids.mo, role: 'maintainer' })
    args = await draft()
    const before = await work(pm), basis = (await savedProposal(args)).basis
    assert.ok(before.acknowledged_at)
    assert.ok((await queue('max')).some(row => row.id === pm))
    assert.ok(!(await queue('mo')).some(row => row.id === pm))
    const allowed = await call(args)
    assert.equal(errorCode(allowed), null, JSON.stringify(allowed.body))
    assert.equal(allowed.decision.disposition, 'autonomous')
    assert.deepEqual(allowed.decision.classes.map(row => row.class), ['standard'])
    const after = await work(pm), applied = await savedProposal(args)
    assert.equal(after.assignee_id, ids.mo)
    assert.equal(after.version, before.version + 1)
    assert.equal(after.acknowledged_at, null)
    assert.equal(after.crew.handoffs.length, before.crew.handoffs.length + 1)
    assert.deepEqual(applied.basis, basis)
    assert.equal(applied.decided_by, null, 'autonomous policy invents no human decision')
    assert.ok(!(await queue('max')).some(row => row.id === pm))
    assert.ok((await queue('mo')).some(row => row.id === pm))
    const effect = (await api('audit?action=proposal.apply', cookie.owner)).rows.filter(row => row.subject === args.proposal)
    assert.equal(effect.length, 1)
    const receipt = JSON.parse(effect[0].detail)
    assert.deepEqual(receipt.basis, basis)
    assert.equal(receipt.decision, allowed.decision.id)
    assert.equal(receipt.preparedBy.for.id, ids.owner)
    assert.ok(receipt.preparedBy.label.includes(' for '))
    const replayBefore = await retained(pm)
    assert.deepEqual((await call(args)).result.structuredContent, allowed.result.structuredContent)
    assert.deepEqual(await retained(pm), replayBefore)
    assert.equal((await api('audit?action=proposal.apply', cookie.owner)).rows.filter(row => row.subject === args.proposal).length, 1)
    const completedArgs = { ...args }
    await person('/agents/api/pause', 'owner', { paused: true })
    await refuse(completedArgs, ['agents_paused'], 'completed replay during Pause')
    await person('/agents/api/pause', 'owner', { paused: false })
    await adopt(autonomousPolicy(), { revoked: { agents: [], consents: [context.consent] } })
    await refuse(completedArgs, ['unauthenticated'], 'completed replay after consent revocation')
    await adopt(autonomousPolicy())
    const parallelWork = (await api('workorder.create', cookie.owner, { location: 'Synthetic workshop', title: 'Synthetic concurrent handoff', due: day(-10), assignee: ids.max })).id
    const parallelQuery = await api('agent.query', cookie.agent, { workOrder: parallelWork, version: (await work(parallelWork)).version, question: 'Who can inspect next?' })
    await api('chase.rule', cookie.owner, { remindBeforeDays: 1, responseWithinDays: 0, leadAfterDays: 0, supervisorAfterDays: 1 })
    const concurrent = await draft(parallelWork), parallelBefore = await work(parallelWork)
    const racing = await Promise.all([call(concurrent), call({ ...concurrent, idempotency_key: randomUUID() })])
    assert.equal(racing.filter(answer => !errorCode(answer)).length, 1, 'only one concurrent proposal application succeeds')
    assert.equal((await work(parallelWork)).crew.handoffs.length, parallelBefore.crew.handoffs.length + 1)
    assert.equal((await savedProposal(concurrent)).status, 'approved')
    assert.equal((await api('audit?action=proposal.apply', cookie.owner)).rows.filter(row => row.subject === concurrent.proposal).length, 1)
    assert.ok(parallelQuery.id)
    console.log('PROBE AGENT-005 allowing: MCP existing missed-promise proposal -> standard, one attributed handoff, reset acknowledgment, both queues and retained source receipt; replay unchanged')
    // A held standard policy executes with a genuine review record, separately from human sign-off.
    await adopt(heldPolicy())
    args = await draft(pm, ids.max)
    const reviewed = await call(args)
    assert.equal(errorCode(reviewed), null, JSON.stringify(reviewed.body))
    assert.equal(reviewed.decision.disposition, 'review')
    const reviews = await person('/agents/api/reviews')
    const review = reviews.reviews.find(row => row.decision_id === reviewed.decision.id)
    assert.ok(review && review.state === 'open')
    const marked = await person(`/agents/api/reviews/${review.id}/reviewed`, 'owner', {})
    assert.equal(marked.review.marked_by, ids.owner)
    assert.equal(marked.review.state, 'reviewed')
    console.log('PROBE AGENT-005 review: held standard policy -> one reassignment and a genuine owner-marked review')
    const approvalPolicy = autonomousPolicy()
    approvalPolicy.rules.push({ id: 'independent', class: 'standard', do: 'approval', approver: ['person:synthetic-gasket-lead'], wait: 'PT1H' })
    await adopt(approvalPolicy)
    args = await draft()
    const pendingBefore = await retained(pm), pending = await call(args)
    assert.equal(pending.decision.disposition, 'approval')
    assert.deepEqual(await retained(pm), pendingBefore)
    const handle = pending.result._meta['com.runeditrun/approval']
    const view = (await person(`/agents/api/approvals/${handle.id}`)).approval
    assert.equal(view.summary.nativeTarget.id, pm)
    assert.ok(view.summary.items.includes(args.source))
    const decisionBody = { revision: view.revision, summary_sha256: view.summary_sha256 }
    await person(`/agents/api/approvals/${handle.id}/approve`, 'max', decisionBody, 403)
    const decided = await person(`/agents/api/approvals/${handle.id}/approve`, 'lead', decisionBody)
    assert.equal(decided.approval.state, 'executed', JSON.stringify(decided))
    assert.equal((await savedProposal(args)).decided_by, ids.lead)
    assert.equal((await work(pm)).assignee_id, ids.mo)
    const heldAfter = await retained(pm)
    assert.ok((await call(args)).result.structuredContent)
    assert.deepEqual(await retained(pm), heldAfter)
    console.log('PROBE AGENT-005 approval: held independent policy -> no handoff before exact lead decision; one handoff and replay retained')
    // Prepared approvals must fail against changed evidence and current policy or authority.
    args = await draft(pm, ids.max)
    const stalePending = await call(args), staleHandle = stalePending.result._meta['com.runeditrun/approval']
    const staleView = (await person(`/agents/api/approvals/${staleHandle.id}`)).approval
    await api('blocker.raise', cookie.mo, { workOrder: pm, kind: 'access', nextAction: 'Request platform access', promisedOn: day(1) })
    const snapshot = await retained(pm)
    const staleDecision = await person(`/agents/api/approvals/${staleHandle.id}/approve`, 'lead', { revision: staleView.revision, summary_sha256: staleView.summary_sha256 })
    assert.equal(staleDecision.approval.state, 'refused')
    assert.deepEqual(await retained(pm), snapshot)
    for (const change of ['policy','pause','consent','authority','agent']) {
      await adopt(approvalPolicy)
      const args = await draft(pm, ids.max), pending = await call(args), handle = pending.result._meta['com.runeditrun/approval']
      const view = (await person(`/agents/api/approvals/${handle.id}`)).approval
      if (change === 'policy') await adopt(autonomousPolicy())
      if (change === 'pause') await person('/agents/api/pause', 'owner', { paused: true })
      if (change === 'consent') await adopt(approvalPolicy, { revoked: { agents: [], consents: [context.consent] } })
      if (change === 'authority') await api('access.role', cookie.owner, { member: ids.lead, role: 'maintainer' })
      if (change === 'agent') await person(`/agents/api/agents/${context.agentId}/revoke`, 'owner', {})
      const before = await retained(pm)
      const response = await person(`/agents/api/approvals/${handle.id}/approve`, 'lead', { revision: view.revision, summary_sha256: view.summary_sha256 }, change === 'consent' ? 409 : 200)
      assert.notEqual(response.approval?.state, 'executed', `${change} cannot execute prepared approval`)
      assert.deepEqual(await retained(pm), before)
      if (change === 'pause') await person('/agents/api/pause', 'owner', { paused: false })
      if (change === 'authority') await api('access.role', cookie.owner, { member: ids.lead, role: 'lead' })
    }
    // A fresh agent identity permits independent unsafe-admission probes after revocation.
    context.agentId = `synthetic-gasket-${randomUUID()}`
    protocol.agentId = context.agentId
    await adopt(autonomousPolicy())
    args = await draft(pm, ids.max)
    const noScope = await accessToken(context, { scope: 'assets:read' })
    await refuse(args, ['insufficient_scope'], 'insufficient scope', { token: noScope })
    const maintainer = await accessToken(context, { sub: 'synthetic-gasket-max', email: email('synthetic-gasket-max'), act: { sub: randomUUID(), name: 'Synthetic forbidden agent', specialist: 'maintenance coordinator' } })
    await refuse(args, ['forbidden'], 'forbidden sponsor', { token: maintainer })
    await refuse(args, ['unauthenticated'], 'signed out', { token: null })
    const pendingToken = await accessToken(context, { sub: 'synthetic-gasket-lead', email: email('synthetic-gasket-lead'), act: { sub: randomUUID(), name: 'Synthetic lead agent', specialist: 'maintenance coordinator' } })
    const leadArgs = await draft(parallelWork, ids.max)
    const leadApplied = await call(leadArgs, { token: pendingToken })
    assert.equal(errorCode(leadApplied), null, JSON.stringify(leadApplied.body))
    await api('access.end', cookie.owner, { member: ids.lead })
    const leadWork = await work(parallelWork)
    await refuse(args, ['unauthenticated'], 'revoked sponsor', { token: pendingToken })
    await refuse(leadArgs, ['unauthenticated'], 'completed replay after sponsor revocation', { token: pendingToken })
    assert.deepEqual(await work(parallelWork), leadWork)
    await person('/agents/api/pause', 'owner', { paused: true })
    await refuse(args, ['agents_paused'], 'Pause')
    await person('/agents/api/pause', 'owner', { paused: false })
    await adopt(autonomousPolicy(), { revoked: { agents: [], consents: [context.consent] } })
    await refuse(args, ['unauthenticated'], 'revoked consent')
    console.log('PROBE AGENT-005 freshness: changed blocker, query, rule, linked outcome, work revision and assignee eligibility -> refusal with unchanged queues and proposal')
    console.log('PROBE AGENT-005 authority: insufficient scope, forbidden and revoked sponsor, Pause, consent and agent revocation -> no additional handoff; pending approvals fenced')
    for (const id of [pm, repair]) {
      await api('agent.closure', cookie.agent, { workOrder: id, reasoning: 'No physical certification may be invented' }, id === repair ? 200 : 409)
      await api('workorder.submit', cookie.agent, { workOrder: id, version: 1 }, 403)
      await api('workorder.review', cookie.agent, { workOrder: id, version: 1, decision: 'approve' }, 403)
    }
    if (process.env.AGENT_SCREENSHOTS) {
      const { chromium } = await import('@playwright/test')
      await mkdir(process.env.AGENT_SCREENSHOTS, { recursive: true })
      const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox','--use-mock-keychain','--password-store=basic'] })
      try {
        const context = await browser.newContext({ ignoreHTTPSErrors: true })
        await context.addCookies(cookie.owner.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0,at), value: pair.slice(at+1), url: h.origin } }))
        const page = await context.newPage()
        for (const width of [1440,390]) {
          await page.setViewportSize({ width, height: 1100 })
          assert.equal((await page.goto(`${h.origin}/app/work/${pm}`)).status(), 200)
          if (width === 1440) assert.ok((await page.locator('body').innerText()).includes('Synthetic gasket mo'))
          await page.screenshot({ path: `${process.env.AGENT_SCREENSHOTS}/reassignment-policy-${width}.png`, fullPage: true })
        }
        await context.close()
      } finally { await browser.close() }
    }
  } finally { if (h !== initial) await h.close(); await initial.close() }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await agentReassignmentPolicyJourney()
