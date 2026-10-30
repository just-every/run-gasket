import assert from 'node:assert/strict'
import { randomUUID, webcrypto } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { outcomeJourney } from './outcomes.mjs'
import { accessToken, autonomousPolicy, heldPolicy, policyEnvelope, signJws } from '../../src/modules/agent-door/conformance/crypto.mjs'
import { zonedInstant } from '../../src/gasket/dates.ts'
import { zone } from './clock.mjs'

/** A real worsening comparison authorizes only an exact, current maintenance commitment. */
export async function agentOutcomeReversalJourney() {
  for (const mode of ['stale', 'held', 'autonomous']) {
    const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const kid = randomUUID(), installationId = randomUUID(), issuer = 'https://synthetic-gasket-policy.invalid'
    const publicKey = await webcrypto.subtle.exportKey('jwk', pair.publicKey), audience = 'self-host'
    const bindings = {
      RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId,
      RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience, subject: installationId, keys: { [kid]: publicKey } }),
      RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify({ [kid]: { ...publicKey, kid, alg: 'ES256', use: 'sig' } }),
    }
    await outcomeJourney({ bindings, proposalGate: true, reverse: async ({ h, cookie, ids, assets, plans, day, reading, assess, schedule, baselineJobs, reversal, worse }) => {
    const currentDay = (await h.api('me', cookie.owner)).today
    const clock = zonedInstant(zone, `${currentDay}T12:00`)
    const signer = { issuer, installationId, kid, privateKey: pair.privateKey }
    const ownerSub = 'synthetic-gasket-owner', leadSub = 'synthetic-gasket-lead', maintainerSub = 'synthetic-gasket-maintainer'
    const members = await h.api('members', cookie.owner)
    const member = key => members.find(row => row.id === ids[key])
    const iat = Math.floor(clock / 1000), business = 'synthetic-gasket'
    const decisionSub = 'synthetic-gasket-decision-lead'
    const decisionEmail = ['synthetic-gasket-decision', h.vars.OWNER_EMAIL.split('@')[1]].join('@')
    const settings = await signJws(pair.privateKey, kid, 'rer-business-settings+jwt', {
      v: 1, iss: issuer, aud: audience, sub: installationId, business, email: h.vars.OWNER_EMAIL, owner_id: ownerSub,
      jti: randomUUID(), iat, exp: iat + 300, rev: 1, values: {}, logo: null,
      team: [
        ...[['lead', leadSub], ['max', maintainerSub]].map(([key, id]) => ({ id, email: member(key).email, name: member(key).name, role: key === 'lead' ? 'admin' : 'member', invite: 1 })),
        { id: decisionSub, email: decisionEmail, name: 'Synthetic independent company lead', role: 'admin', invite: 1 },
      ],
    })
    const paired = await h.raw('/api/rer/business-settings', { body: { settings } })
    assert.equal(paired.status, 200)
    await paired.body?.cancel()
    const decisionCookie = await h.signIn(decisionEmail)
    const decisionLead = await h.api('me', decisionCookie)
    assert.equal(decisionLead.role, 'lead')
    const context = {
      origin: h.origin, signer, business, consent: randomUUID(), agentId: `synthetic-gasket-${randomUUID()}`,
      person: { sub: ownerSub, email: h.vars.OWNER_EMAIL }, surface: { specialist: 'maintenance coordinator', tools: [{ scope: 'proposal.decide' }] },
      revision: 0, seq: 0, now: () => clock,
    }
    const code = answer => answer.body.result?._meta?.['com.runeditrun/error']?.code ?? answer.body.error?.data?.code
    const decision = answer => answer.body.result?._meta?.['com.runeditrun/decision']
    const result = answer => answer.body.result?.structuredContent
    const person = async (path, body, who = cookie.owner) => {
      const response = await h.raw(path, { cookie: who, ...(body === undefined ? {} : { body }) })
      const text = await response.text()
      assert.equal(response.status, 200, `person ${path}: ${response.status} ${text.slice(0, 300)}`)
      return JSON.parse(text)
    }
    const adopt = async (document, extra = {}) => {
      const signed = await policyEnvelope(context, document, extra)
      const response = await h.raw('/api/rer/agent-policy', { body: { policy: signed.policy } })
      const body = await response.json()
      assert.equal(response.status, 200, 'company policy adopted')
      context.revision = signed.payload.revision
      context.seq = signed.payload.seq
      return body
    }
    const call = async (args, overrides = {}) => {
      const token = overrides.token === null ? null : await accessToken(context, overrides)
      const response = await h.raw('/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'gasket.intervals.apply', arguments: args } },
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'MCP-Protocol-Version': '2025-11-25', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'gasket.intervals.apply' } })
      return { status: response.status, body: await response.json() }
    }
    const readSchedule = async () => (await h.api('schedules', cookie.owner)).find(row => row.id === schedule)
    const proposals = () => h.api('proposals', cookie.owner)
    const audit = () => h.api('audit', cookie.owner)
    const state = async () => ({ schedule: await readSchedule(), work: await h.api('work', cookie.owner) })
    const fresh = async () => {
      const report = await assess(plans.worsening)
      assert.equal(report.status, 'worsening')
      const prepared = await h.api('outcome.reversal', cookie.agent, { outcome: report.id, rollbackPlan: 'Restore the original 30-day cadence; retain the worsening comparison and continue independent investigation.' })
      const proposal = (await proposals()).find(row => row.id === prepared.id)
      assert.deepEqual(proposal.basis.outcome, { id: report.id, sourceHash: report.source.sourceHash, window: plans.worsening })
      assert.equal(proposal.payload.rollbackOf, report.proposal)
      assert.equal(proposal.basis.schedule.id, schedule)
      return { report, proposal, args: { proposal: prepared.id, hash: prepared.hash, idempotency_key: randomUUID() } }
    }
    const pending = async candidate => {
      const before = await state(), answer = await call(candidate.args)
      assert.equal(code(answer), 'approval_required')
      assert.equal(decision(answer).disposition, 'approval')
      assert.deepEqual(decision(answer).classes.map(row => row.class), ['commitment'])
      assert.deepEqual(await state(), before, 'a held commitment has no maintenance effect')
      const handle = answer.body.result?._meta?.['com.runeditrun/error']?.approval
      assert.ok(handle?.id)
      const path = `/agents/api/approvals/${handle.id}`
      const { approval } = await person(path)
      assert.deepEqual(approval.summary.nativeTarget, { kind: 'schedule', id: schedule })
      assert.ok(approval.summary.items.some(item => item.includes(candidate.report.source.sourceHash)))
      assert.ok(approval.summary.items.some(item => item.includes(candidate.report.id)))
      assert.ok(approval.summary.items.some(item => item.includes(String(candidate.proposal.basis.schedule.revision))))
      return { path, approval, exact: { revision: approval.revision, summary_sha256: approval.summary_sha256 } }
    }
    const held = () => ({ ...heldPolicy(), rules: [{ id: 'independent', class: '*', do: 'approval', approver: [`person:${decisionSub}`], wait: 'PT1H' }] })
    if (mode === 'stale') {
      await adopt(held())
      const first = await fresh(), before = await state(), approval = await pending(first)
      const changed = await h.raw(`${approval.path}/approve`, { cookie: decisionCookie, body: { ...approval.exact, summary_sha256: '0'.repeat(64) } })
      assert.equal(changed.status, 409, 'a different decision summary cannot authorize a maintenance standard')
      await changed.body?.cancel()
      const sponsor = await h.raw(`${approval.path}/approve`, { cookie: cookie.owner, body: approval.exact })
      assert.equal(sponsor.status, 403, 'the sponsor cannot substitute for the named independent lead')
      await sponsor.body?.cancel()
      await person(`${approval.path}/reject`, approval.exact, decisionCookie)
      assert.equal(code(await call(first.args)), 'approval_rejected')
      assert.deepEqual(await state(), before)
      console.log('PROBE AGENT-004 reversal held decision: exact source summary -> commitment approval; changed summary, sponsor and rejected approval -> no cadence or work effect')

      await adopt(autonomousPolicy())
      const wrongKind = await h.api('outcome.investigate', cookie.agent, { outcome: first.report.id })
      assert.equal(code(await call({ proposal: wrongKind.id, hash: wrongKind.hash, idempotency_key: randomUUID() })), 'unsupported_proposal_kind')
      let sample = 51
      for (const source of ['reading', 'work', 'cost', 'comparison']) {
        const stale = await fresh()
        if (source === 'reading') await reading(0, `${day(9)}T09:00`, sample++)
        if (source === 'work') {
          const order = await h.api(`work/${baselineJobs[1]}`, cookie.owner)
          await h.api('workorder.assign', cookie.lead, { workOrder: order.id, version: order.version, assignee: ids.max, note: 'Reconfirm comparison maintenance responsibility' })
        }
        if (source === 'cost') await h.api('work.cost', cookie.lead, { workOrder: baselineJobs[1], category: 'labor', amount: '1.00', note: 'Late source cost correction' })
        if (source === 'comparison') {
          const current = await readSchedule()
          await h.api('schedule.edit', cookie.lead, { schedule, revision: current.revision, everyDays: current.every_days })
        }
        const snapshot = await state()
        assert.equal(code(await call(stale.args)), 'outcome_stale', `changed ${source} refuses obsolete reversal`)
        await h.api('proposal.decide', cookie.lead, { proposal: stale.proposal.id, hash: stale.args.hash, decision: 'approve' }, 409)
        assert.deepEqual(await state(), snapshot)
        assert.deepEqual(await h.api(`outcomes/${stale.report.id}`, cookie.owner), stale.report)
        console.log(`PROBE AGENT-004 reversal ${source}: changed contributing source -> MCP and native refusal with unchanged cadence, work and retained assessment`)
      }
      // A schedule revision change invalidates the original rollback revision. It is
      // deliberately last: the native stale proposal must not become executable.
      // Start the remaining exact-original-revision cases in the next fixture.
      await h.api('proposal.decide', cookie.lead, { proposal: reversal.id, hash: reversal.hash, decision: 'approve' }, 409)
      const current = await readSchedule()
      await h.api('schedule.edit', cookie.lead, { schedule, revision: current.revision, everyDays: 30 })
      return
    }
    await adopt(autonomousPolicy())
    if (mode === 'autonomous') {
      const allowed = await fresh(), before = await state(), answer = await call(allowed.args)
      assert.equal(code(answer), undefined)
      assert.equal(decision(answer).disposition, 'autonomous')
      assert.deepEqual(decision(answer).classes.map(row => row.class), ['commitment'])
      assert.equal(result(answer).result, schedule)
      const after = await state()
      assert.deepEqual(after, { schedule: { ...before.schedule, every_days: 30, revision: before.schedule.revision + 1 }, work: before.work })
      const retained = (await proposals()).find(row => row.id === allowed.proposal.id)
      assert.equal(retained.decided_by, null, 'allowing policy invents no human approval')
      const next = await assess(plans.worsening)
      const change = next.source.records.intervention.later.find(row => row.proposal_id === allowed.proposal.id)
      assert.deepEqual([change.approved_by, change.executed_by, change.execution_kind], [null, (await h.api('me', cookie.owner)).id, 'company_policy'])
      assert.deepEqual(result(await call(allowed.args)), result(answer))
      assert.deepEqual(await state(), after)
      assert.deepEqual(await h.api(`outcomes/${allowed.report.id}`, cookie.owner), allowed.report)
      assert.equal((await audit()).rows.filter(row => row.action === 'proposal.apply' && row.subject === allowed.proposal.id).length, 1)
      console.log('PROBE AGENT-004 autonomous reversal: explicitly allowing policy -> one commitment execution, original cadence restored, executor retained and no invented human approval')
      return
    }
    await adopt(held())
    const obsolete = await fresh(), obsoleteApproval = await pending(obsolete)
    await h.api('work.cost', cookie.owner, { workOrder: baselineJobs[2], category: 'labor', amount: '1.00', note: 'Evidence changed after company decision was requested' })
    const obsoleteBefore = await state()
    const staleDecision = await person(`${obsoleteApproval.path}/approve`, obsoleteApproval.exact, decisionCookie)
    assert.equal(staleDecision.approval.state, 'refused')
    assert.equal(staleDecision.approval.code, 'execution_failed')
    assert.deepEqual(await state(), obsoleteBefore)
    const removed = await fresh(), removedApproval = await pending(removed)
    await h.api('access.role', cookie.owner, { member: decisionLead.id, role: 'maintainer' })
    const removedBefore = await state()
    const lostRole = await person(`${removedApproval.path}/approve`, removedApproval.exact, decisionCookie)
    assert.equal(lostRole.approval.state, 'refused')
    assert.equal(lostRole.approval.code, 'independent_decision_required')
    assert.deepEqual(await state(), removedBefore)
    await h.api('access.role', cookie.owner, { member: decisionLead.id, role: 'lead' })
    console.log('PROBE AGENT-004 pending reversal: source change or loss of lead authority before decision -> failed approval with unchanged cadence and work')
    await adopt(autonomousPolicy())
    for (const changed of ['source', 'policy']) {
      const fenced = await fresh(), snapshot = await state()
      let reached, release
      const arrived = new Promise(resolve => { reached = resolve }), resume = new Promise(resolve => { release = resolve })
      h.setProposalHook(async () => { reached(); await resume })
      const running = call(fenced.args)
      let timer
      try {
        await Promise.race([arrived, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Interval application batch was not reached')), 10000) })])
        clearTimeout(timer)
        if (changed === 'source') await h.api('work.cost', cookie.owner, { workOrder: baselineJobs[2], category: 'labor', amount: '1.00', note: 'Comparison changed before interval persistence' })
        else await adopt({ ...autonomousPolicy(), rules: [{ id: 'block', class: '*', do: 'blocked' }] })
      } finally { clearTimeout(timer); release(); h.setProposalHook(undefined) }
      assert.equal(code(await running), changed === 'source' ? 'stale' : 'precondition_failed')
      assert.deepEqual(await state(), snapshot)
      assert.equal((await proposals()).find(row => row.id === fenced.proposal.id).status, 'pending')
      assert.equal((await audit()).rows.filter(row => row.action === 'proposal.apply' && row.subject === fenced.proposal.id).length, 0)
      await adopt(autonomousPolicy())
      console.log(`PROBE AGENT-004 reversal atomic ${changed}: changed at emitted Worker D1 boundary -> schedule, interval history, receipt and audit rolled back`)
    }
    const guarded = await fresh(), guardedBefore = await state()
    assert.equal(code(await call({ ...guarded.args, hash: '0'.repeat(64) })), 'proposal_changed')
    assert.equal((await call(guarded.args, { token: null })).status, 401)
    assert.equal((await call(guarded.args, { scope: 'assets:read' })).status, 403)
    const maintainer = await call(guarded.args, { sub: maintainerSub, email: member('max').email, act: { sub: randomUUID(), name: 'Synthetic maintainer coordinator', specialist: 'maintenance coordinator' } })
    assert.ok([401, 403].includes(maintainer.status))
    assert.equal(result(maintainer), undefined)
    await person('/agents/api/pause', { paused: true })
    assert.equal(code(await call(guarded.args)), 'agents_paused')
    await person('/agents/api/pause', { paused: false })
    await adopt(autonomousPolicy(), { revoked: { agents: [], consents: [context.consent] } })
    assert.equal((await call(guarded.args)).status, 401)
    await adopt(autonomousPolicy())
    const oldAgent = context.agentId
    await person(`/agents/api/agents/${encodeURIComponent(oldAgent)}/revoke`, {})
    assert.equal((await call(guarded.args)).status, 401)
    context.agentId = `synthetic-gasket-${randomUUID()}`
    assert.deepEqual(await state(), guardedBefore)
    console.log('PROBE AGENT-004 reversal authority: changed hash, signed-out, scope, forbidden sponsor, Pause, consent and revoked agent -> refused with unchanged cadence and work')

    // Genuine held-policy execution of the worsening reversal on its exact source.
    await adopt(held())
    const heldCase = await fresh(), beforeHeld = await state(), approval = await pending(heldCase)
    const approved = await person(`${approval.path}/approve`, approval.exact, decisionCookie)
    assert.equal(approved.approval.state, 'executed')
    const answer = await call(heldCase.args)
    assert.equal(code(answer), undefined)
    assert.equal(result(answer).result, schedule)
    const afterHeld = await readSchedule()
    assert.deepEqual(afterHeld, { ...beforeHeld.schedule, every_days: 30, revision: beforeHeld.schedule.revision + 1 })
    assert.deepEqual(await h.api('work', cookie.owner), beforeHeld.work, 'issued work stays pinned and no physical result is asserted')
    assert.equal((await proposals()).find(row => row.id === heldCase.proposal.id).decided_by, decisionLead.id)
    const reportAfter = await assess(plans.worsening)
    const change = reportAfter.source.records.intervention.later.find(row => row.proposal_id === heldCase.proposal.id)
    assert.deepEqual([change.approved_by, change.executed_by, change.execution_kind, change.rollback_of], [decisionLead.id, (await h.api('me', cookie.owner)).id, 'company_policy', heldCase.report.proposal])
    assert.deepEqual(await h.api(`outcomes/${heldCase.report.id}`, cookie.owner), heldCase.report)
    const accepted = await state()
    assert.deepEqual(result(await call(heldCase.args)), result(answer))
    assert.equal(code(await call({ ...heldCase.args, hash: '0'.repeat(64) })), 'idempotency_conflict')
    assert.deepEqual(await state(), accepted)
    assert.equal((await audit()).rows.filter(row => row.action === 'proposal.apply' && row.subject === heldCase.proposal.id).length, 1)
    console.log('PROBE AGENT-004 worsening reversal: held commitment and genuine independent lead approval -> original cadence restored once, exact source and immutable assessment retained, issued work unchanged')
    if (process.env.OUTCOME_REVERSAL_SCREENSHOTS) await reversalScreens(h, cookie, approval.path.replace('/api/', '/'), schedule)
    } })
  }
}

async function reversalScreens(h, cookie, approvalPath) {
  const { chromium } = await import('@playwright/test')
  const { mkdir } = await import('node:fs/promises')
  await mkdir(process.env.OUTCOME_REVERSAL_SCREENSHOTS, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: process.env.GASKET_CHROMIUM_PATH, args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(cookie.owner.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
    const page = await context.newPage()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 })
      for (const [name, path] of [['reversal-decision', approvalPath], ['reversal-schedule', '/app/schedules']]) {
        assert.equal((await page.goto(h.origin + path)).status(), 200)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        await page.screenshot({ path: `${process.env.OUTCOME_REVERSAL_SCREENSHOTS}/${name}-${width}.png`, fullPage: true })
      }
    }
    await context.close()
  } finally { await browser.close() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await agentOutcomeReversalJourney()
