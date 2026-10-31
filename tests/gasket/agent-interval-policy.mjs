import assert from 'node:assert/strict'
import { randomBytes, randomUUID, webcrypto } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { harness } from './harness.mjs'
import { intervalCohort } from './intervals.mjs'
import { signJws, accessToken, policyEnvelope, autonomousPolicy, heldPolicy } from '../../src/modules/agent-door/conformance/crypto.mjs'
import { createProtocol, errorCode } from '../../src/modules/agent-door/conformance/protocol.mjs'

/** Stored cohort facts and genuine people drive both policy paths through the emitted Worker. */
export async function agentIntervalPolicyJourney() {
  let tick = Date.parse('2030-01-15T12:00:00Z')
  const email = name => [name, ['example','test'].join('.')].join('@')
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify'])
  const kid = randomUUID(), issuer = 'https://synthetic-gasket.invalid', installationId = randomUUID()
  const keys = { [kid]: { ...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid, alg: 'ES256', use: 'sig' } }
  const vars = { OWNER_EMAIL: email('synthetic-gasket-owner'), SESSION_SECRET: randomBytes(32).toString('base64url'), SETUP_TOKEN: randomUUID(),
    RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId, RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(keys),
    RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience: 'self-host', subject: installationId, email: email('synthetic-gasket-owner'), keys }) }
  const initial = await harness({ vars, clockInstant: tick }); let h = initial
  const ids = {}, cookie = {}, points = []
  const api = (...args) => h.api(...args)
  const person = async (path, who = 'owner', body, status = 200) => {
    const response = await h.raw(path, { cookie: cookie[who], body })
    assert.equal(response.status, status, `person ${path}: ${status}`)
    return response.json()
  }
  try {
    cookie.owner = await h.owner()
    await api('site.configure', cookie.owner, { name: 'Synthetic gasket workshop', timezone: 'UTC' })
    ids.owner = (await api('me', cookie.owner)).id
    const settings = await signJws(pair.privateKey, kid, 'rer-business-settings+jwt', {
      v: 1, iss: issuer, aud: 'self-host', sub: installationId, business: 'synthetic-gasket-business', email: vars.OWNER_EMAIL,
      owner_id: 'synthetic-gasket-owner', jti: randomUUID(), iat: tick / 1000, exp: tick / 1000 + 300, rev: 1, values: {}, logo: null,
      team: ['lead','max'].map(key => ({ id: `synthetic-gasket-${key}`, email: email(`synthetic-gasket-${key}`), name: `Synthetic gasket ${key}`, role: key === 'lead' ? 'admin' : 'member', invite: 1 })),
    })
    const paired = await h.raw('/api/rer/business-settings', { body: { settings } })
    assert.equal(paired.status, 200, await paired.text())
    const members = await api('members', cookie.owner)
    for (const key of ['lead','max']) {
      ids[key] = members.find(member => member.email === email(`synthetic-gasket-${key}`)).id
      cookie[key] = await h.signIn(email(`synthetic-gasket-${key}`))
    }
    for (const [key, role] of [['sam','supervisor'],['agent','agent']]) {
      ids[key] = (await api('access.give', cookie.owner, { name: `Synthetic gasket ${key}`, email: email(`synthetic-gasket-${key}`), role })).id
      cookie[key] = await h.signIn(email(`synthetic-gasket-${key}`))
    }
    const cohort = await intervalCohort(h, cookie, ids, 'synthetic-gasket-policy')
    tick += 86400000
    await h.stop()
    h = await harness({ vars, installation: initial.installation, clockInstant: tick })
    cookie.owner = await h.signIn(vars.OWNER_EMAIL)
    for (const key of ['lead','max','sam','agent']) cookie[key] = await h.signIn(email(`synthetic-gasket-${key}`))
    const { assets, schedules, jobs, from, to, issued, issuedBefore, limit } = cohort
    const issuedPolicyBefore = await Promise.all(issued.created.map(w => api(`work/${w.id}`, cookie.max)))
    const payload = { schedule: schedules[0], everyDays: '14', everyUnits: '50', from, to, peers: assets.slice(1).join(','),
      rollbackPlan: 'Pause rollout if failures worsen; a human may restore the original cadence after reviewing all retained uncertainty.' }
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
    const call = (args, options) => protocol.tool('gasket.proposals.interval', args, options)
    const saved = async args => (await api('proposals', cookie.owner)).find(row => row.id === args.proposal)
    const draft = async (extra = {}, who = 'agent') => {
      const p = await api('proposal.prepare', cookie[who], { kind: 'interval', reasoning: 'Shorten the interval after the recorded bearing failure; uncertainty remains.', payload: { ...payload, ...extra } })
      return { proposal: p.id, hash: p.hash, source: (await saved({ proposal: p.id })).source, idempotency_key: randomUUID() }
    }
    const schedule = async id => (await api('schedules', cookie.owner)).find(row => row.id === id)
    const retained = async args => ({ schedule: await schedule((await saved(args)).payload.schedule), proposal: await saved(args),
      work: await Promise.all(issued.created.map(w => api(`work/${w.id}`, cookie.owner))),
      effects: (await api('audit?action=schedule.interval', cookie.owner)).rows })
    const refuse = async (args, codes, label, options) => {
      const before = await retained(args), answer = await call(args, options)
      assert.ok(codes.includes(errorCode(answer)) || codes.includes('unauthenticated') && answer.status === 401, `${label}: ${errorCode(answer)} ${JSON.stringify(answer.body)}`)
      assert.deepEqual(await retained(args), before, `${label} changes no native state`)
      return answer
    }
    const approve = async (answer, who = 'lead', status = 200) => {
      const handle = answer.result._meta['com.runeditrun/approval']
      const view = (await person(`/agents/api/approvals/${handle.id}`)).approval
      return person(`/agents/api/approvals/${handle.id}/approve`, who, { revision: view.revision, summary_sha256: view.summary_sha256 }, status)
    }
    await adopt(autonomousPolicy())
    let args = await draft()
    const basis = (await saved(args)).basis
    assert.equal(basis.assets.length, 3)
    assert.deepEqual([basis.assets[0].failures,basis.assets[0].operatingHours,basis.assets[0].actualCostCents], [1,20,10000])
    assert.ok(basis.uncertainty.length && basis.expectedEffect)
    assert.equal(basis.limits.length, 3)
    await refuse({ ...args, hash: 'a'.repeat(64) }, ['proposal_changed'], 'changed payload hash')
    await refuse({ ...args, source: 'a'.repeat(64) }, ['proposal_changed'], 'changed evidence fingerprint')
    await api('work.cost', cookie.lead, { workOrder: jobs[0], category: 'other', amount: '25', note: 'Retained correction to repair cost' })
    await refuse(args, ['proposal_stale'], 'changed cohort source')
    args = await draft()
    const current = await schedule(schedules[0])
    await api('schedule.edit', cookie.lead, { schedule: schedules[0], revision: current.revision, everyDays: 28 })
    await refuse(args, ['proposal_stale'], 'changed schedule revision')
    args = await draft()
    await api('interval.limit', cookie.lead, limit(schedules[0], 'site', { revision: 1 }))
    await refuse(args, ['proposal_stale'], 'changed limit revision')
    const unsupportedBefore = await schedule(schedules[0])
    const unsupported = await api('proposal.prepare', cookie.agent, { kind: 'interval', reasoning: 'Unsupported extension', payload: { ...payload, everyDays: '45', everyUnits: '150' } }, 409)
    assert.equal(unsupported.error, 'unsupported_interval_extension')
    assert.deepEqual(await schedule(schedules[0]), unsupportedBefore)
    const extension = await draft({ schedule: schedules[1], everyDays: '45', everyUnits: '150', peers: assets[2] })
    await refuse(extension, ['interval_policy_shortening_only'], 'policy extension is outside this adapter')
    assert.equal((await api('proposal.prepare', cookie.agent, { kind: 'interval', reasoning: 'Too short for the OEM bound', payload: { ...payload, everyDays: '7' } }, 409)).error, 'interval_outside_limits')
    args = await draft()
    const before = await schedule(schedules[0]), retainedBasis = (await saved(args)).basis
    const allowed = await call({ ...args, classes: ['standard'], target: { kind: 'asset', id: assets[2] } })
    assert.equal(errorCode(allowed), null, JSON.stringify(allowed.body))
    assert.equal(allowed.decision.disposition, 'autonomous')
    assert.deepEqual(allowed.decision.classes.map(row => ({ class: row.class, facts: row.facts })), [{ class: 'commitment', facts: { measure: 0, currency: 'USD', counterparty: 'internal' } }])
    const after = await schedule(schedules[0]), applied = await saved(args)
    assert.deepEqual([after.every_days,after.every_units,after.revision], [14,'50',before.revision+1])
    for (const key of ['next_due_date','next_due_meter','nominal_date','checklist_id']) assert.equal(after[key], before[key], `${key} promise stays pinned`)
    assert.deepEqual(applied.basis, retainedBasis)
    assert.equal(applied.decided_by, null)
    assert.equal(applied.application.approver_id, null, 'policy execution invents no human approval')
    assert.equal(applied.application.sponsor_id, ids.owner)
    assert.equal(applied.application.evidence_hash, args.source)
    assert.equal(applied.application.payload_hash, args.hash)
    assert.equal(applied.application.decision_id, allowed.decision.id)
    const effect = (await api('audit?action=proposal.apply', cookie.owner)).rows.filter(row => row.subject === args.proposal)
    assert.equal(effect.length, 1)
    const receipt = JSON.parse(effect[0].detail)
    assert.deepEqual(receipt.basis, retainedBasis)
    assert.equal(receipt.preparedBy.for.id, ids.owner)
    assert.ok(receipt.preparedBy.label.includes(' for '))
    const snapshot = await retained(args)
    assert.deepEqual((await call(args)).result.structuredContent, allowed.result.structuredContent)
    assert.deepEqual(await retained(args), snapshot)
    assert.equal((await api('audit?action=proposal.apply', cookie.owner)).rows.filter(row => row.subject === args.proposal).length, 1)
    await refuse({ ...args, hash: 'b'.repeat(64) }, ['idempotency_conflict'], 'changed completed request')
    const completed = { ...args }
    const rollback = await draft({ everyDays: String(before.every_days), everyUnits: before.every_units, rollbackOf: completed.proposal })
    await refuse(rollback, ['interval_policy_shortening_only'], 'policy rollback is outside this adapter')
    await person('/agents/api/pause', 'owner', { paused: true })
    await refuse(args, ['agents_paused'], 'completed replay during Pause')
    await person('/agents/api/pause', 'owner', { paused: false })
    await adopt(autonomousPolicy(), { revoked: { agents: [], consents: [context.consent] } })
    await refuse(args, ['unauthenticated'], 'completed replay after consent revocation')
    console.log('PROBE AGENT-003 allowing: MCP existing constrained proposal -> computed commitment, one cadence revision and policy receipt without human approval; completed replay unchanged')
    console.log('PROBE AGENT-003 preservation: native schedules, proposals and issued work -> original due promises, revisions, cohort uncertainty and agent-for-sponsor attribution retained')
    // Held commitment policy requires a real different current maintenance lead.
    await adopt(heldPolicy())
    args = await draft({ schedule: schedules[1], everyDays: '21', everyUnits: '75', peers: assets[2] }, 'owner')
    const heldBefore = await retained(args), pending = await call(args)
    assert.equal(pending.decision.disposition, 'approval')
    assert.deepEqual(await retained(args), heldBefore)
    const handle = pending.result._meta['com.runeditrun/approval']
    const view = (await person(`/agents/api/approvals/${handle.id}`)).approval
    assert.deepEqual(view.summary.nativeTarget, { kind: 'schedule', id: schedules[1] })
    assert.ok(view.summary.items.some(item => item.includes('30 days to 21 days')))
    assert.ok(view.summary.items.includes((await saved(args)).basis.expectedEffect))
    await approve(pending, 'max', 403)
    // The held policy names the sponsor; even that human cannot invent independent approval.
    const self = await approve(pending, 'owner')
    assert.equal(self.approval.state, 'refused')
    assert.deepEqual(await retained(args), heldBefore)
    const independentPolicy = heldPolicy()
    independentPolicy.rules[0].approver = ['person:synthetic-gasket-lead']
    await adopt(independentPolicy)
    args = await draft({ schedule: schedules[1], everyDays: '21', everyUnits: '75', peers: assets[2] })
    const genuine = await call(args)
    await screens(h, cookie.lead, genuine, 'pending')
    const decided = await approve(genuine)
    assert.equal(decided.approval.state, 'executed', JSON.stringify(decided))
    assert.equal((await saved(args)).decided_by, ids.lead)
    assert.equal((await saved(args)).application.approver_id, ids.lead)
    assert.equal((await saved(args)).application.disposition, 'approval')
    const heldAfter = await retained(args)
    assert.ok((await call(args)).result.structuredContent)
    assert.deepEqual(await retained(args), heldAfter)
    await screens(h, cookie.lead, genuine, 'applied')
    console.log('PROBE AGENT-003 held: MCP constrained proposal -> no cadence change before genuine different current lead decision on exact proposal, hash, evidence and schedule; one application')
    // A prepared decision must not survive stale sources or revoked admission.
    for (const change of ['source','schedule','limit','policy','pause','consent','authority','agent']) {
      context.agentId = `synthetic-gasket-${randomUUID()}`; protocol.agentId = context.agentId
      await adopt(independentPolicy)
      args = await draft({ schedule: schedules[2], everyDays: '21', everyUnits: '75', peers: assets[1] })
      const pending = await call(args)
      assert.equal(pending.decision.disposition, 'approval', JSON.stringify(pending.body))
      if (change === 'source') await api('work.cost', cookie.lead, { workOrder: jobs[2], category: 'other', amount: '1', note: 'New source evidence' })
      if (change === 'schedule') {
        const row = await schedule(schedules[2]); await api('schedule.edit', cookie.lead, { schedule: row.id, revision: row.revision, everyDays: 29 })
      }
      if (change === 'limit') await api('interval.limit', cookie.lead, limit(schedules[2], 'oem', { revision: 1 }))
      if (change === 'policy') await adopt(autonomousPolicy())
      if (change === 'pause') await person('/agents/api/pause', 'owner', { paused: true })
      if (change === 'consent') await adopt(independentPolicy, { revoked: { agents: [], consents: [context.consent] } })
      if (change === 'authority') await api('access.role', cookie.owner, { member: ids.lead, role: 'maintainer' })
      if (change === 'agent') await person(`/agents/api/agents/${context.agentId}/revoke`, 'owner', {})
      const before = await retained(args)
      const result = await approve(pending, 'lead', change === 'consent' ? 409 : 200)
      assert.notEqual(result.approval?.state, 'executed', `${change} cannot execute prepared approval`)
      assert.deepEqual(await retained(args), before)
      if (change === 'pause') await person('/agents/api/pause', 'owner', { paused: false })
      if (change === 'authority') await api('access.role', cookie.owner, { member: ids.lead, role: 'lead' })
    }
    context.agentId = `synthetic-gasket-${randomUUID()}`; protocol.agentId = context.agentId
    await adopt(autonomousPolicy())
    args = await draft({ schedule: schedules[2], everyDays: '21', everyUnits: '75', peers: assets[1] })
    const noScope = await accessToken(context, { scope: 'assets:read' })
    await refuse(args, ['insufficient_scope'], 'insufficient scope', { token: noScope })
    const maintainer = await accessToken(context, { sub: 'synthetic-gasket-max', email: email('synthetic-gasket-max'), act: { sub: randomUUID(), name: 'Synthetic forbidden agent', specialist: 'maintenance coordinator' } })
    await refuse(args, ['forbidden'], 'forbidden sponsor', { token: maintainer })
    await refuse(args, ['unauthenticated'], 'signed out', { token: null })
    await api('proposal.decide', cookie.agent, { proposal: args.proposal, hash: args.hash, decision: 'approve' }, 403)
    const own = await draft({ schedule: schedules[2], everyDays: '21', everyUnits: '75', peers: assets[1] }, 'lead')
    await api('proposal.decide', cookie.lead, { proposal: own.proposal, hash: own.hash, decision: 'approve' }, 403)
    const leadToken = await accessToken(context, { sub: 'synthetic-gasket-lead', email: email('synthetic-gasket-lead'), act: { sub: randomUUID(), name: 'Synthetic lead agent', specialist: 'maintenance coordinator' } })
    const ownerApprovalPolicy = heldPolicy()
    ownerApprovalPolicy.rules[0].approver = ['role:owner']
    await adopt(ownerApprovalPolicy)
    const leadPending = await call(args, { token: leadToken })
    assert.equal(leadPending.decision.disposition, 'approval')
    await api('access.role', cookie.owner, { member: ids.lead, role: 'maintainer' })
    const sponsorBefore = await retained(args)
    assert.equal((await approve(leadPending, 'owner')).approval.state, 'refused')
    assert.deepEqual(await retained(args), sponsorBefore)
    await api('access.role', cookie.owner, { member: ids.lead, role: 'lead' })
    await adopt(autonomousPolicy())
    args = await draft({ schedule: schedules[2], everyDays: '21', everyUnits: '75', peers: assets[1] })
    const leadAllowed = await call(args, { token: leadToken })
    assert.equal(errorCode(leadAllowed), null, JSON.stringify(leadAllowed.body))
    const racingArgs = await draft({ schedule: schedules[1], everyDays: '14', everyUnits: '50', peers: assets[2] })
    const racingBefore = await schedule(schedules[1])
    const racing = await Promise.all([call(racingArgs), call({ ...racingArgs, idempotency_key: randomUUID() })])
    assert.equal(racing.filter(answer => !errorCode(answer)).length, 1)
    assert.equal((await schedule(schedules[1])).revision, racingBefore.revision + 1)
    assert.equal((await api('audit?action=proposal.apply', cookie.owner)).rows.filter(row => row.subject === racingArgs.proposal).length, 1)
    const restored = await draft({ everyDays: String(before.every_days), everyUnits: before.every_units, rollbackOf: completed.proposal })
    const rollbackRecord = await saved(restored)
    assert.ok(rollbackRecord.basis.expectedEffect.includes('earlier authorized maintenance interval'))
    await api('proposal.decide', cookie.owner, { proposal: restored.proposal, hash: restored.hash, decision: 'approve' })
    assert.deepEqual(((row) => [row.every_days,row.every_units])(await schedule(schedules[0])), [before.every_days,before.every_units])
    assert.equal((await saved(restored)).decided_by, ids.owner, 'ordinary rollback retains its actual human approval')
    assert.equal((await saved(completed)).application.approver_id, null, 'later human rollback does not invent an earlier human approval')
    await api('access.end', cookie.owner, { member: ids.lead })
    const erasure = await api(`record-erasure-preview?kind=user&id=${ids.lead}`, cookie.owner)
    assert.equal(erasure.eligible, false)
    assert.ok(erasure.dependencies.gk_interval_policy_changes > 0, 'retained interval provenance blocks contributor erasure')
    const receiptBefore = (await saved(args)).application
    await api('record.erase', cookie.owner, { kind: 'user', id: ids.lead, token: erasure.token, confirm: true }, 409)
    assert.deepEqual((await saved(args)).application, receiptBefore)
    await refuse(args, ['unauthenticated'], 'completed replay after sponsor revocation', { token: leadToken })
    for (let i = 0; i < issued.created.length; i++) assert.deepEqual(await api(`work/${issued.created[i].id}`, cookie.max), issuedPolicyBefore[i])
    console.log('PROBE AGENT-003 freshness: changed source, payload hash, evidence hash, schedule and limit revisions or unsupported extension -> refusal with no cadence or receipt effect')
    console.log('PROBE AGENT-003 authority: forbidden, native agent, self approval, insufficient scope, revoked sponsor, Pause, consent and agent revocation -> no unauthorized application; concurrent callers produce one revision')
    const { intervalPolicyRecovery } = await import('./recovery.mjs')
    await intervalPolicyRecovery(h, cookie.owner, [completed, args, racingArgs], issued.created.map(row => row.id))
  } finally { if (h !== initial) await h.close(); await initial.close() }
}

async function screens(h, cookie, answer, state) {
  const { chromium } = await import('@playwright/test')
  if (process.env.AGENT_SCREENSHOTS) await mkdir(process.env.AGENT_SCREENSHOTS, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox','--use-mock-keychain','--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(cookie.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0,at), value: pair.slice(at+1), url: h.origin } }))
    const page = await context.newPage(), id = answer.result._meta['com.runeditrun/approval'].id
    for (const width of process.env.AGENT_SCREENSHOTS ? [1440,390] : [1440]) {
      await page.setViewportSize({ width, height: 1100 })
      for (const [name,path] of [['approval',`/agents/approvals/${id}`],['native','/app/proposals']]) {
        assert.equal((await page.goto(h.origin + path)).status(), 200)
        if (width === 1440) assert.ok((await page.locator('body').innerText()).includes(name === 'native' ? 'PM interval change' : 'Inspect compressor 2'))
        if (process.env.AGENT_SCREENSHOTS) await page.screenshot({ path: `${process.env.AGENT_SCREENSHOTS}/interval-${state}-${name}-${width}.png`, fullPage: true })
      }
    }
    await context.close()
  } finally { await browser.close() }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await agentIntervalPolicyJourney()
