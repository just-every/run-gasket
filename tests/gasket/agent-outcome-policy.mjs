import assert from 'node:assert/strict'
import { randomUUID, webcrypto } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { outcomeJourney } from './outcomes.mjs'
import { accessToken, autonomousPolicy, heldPolicy, policyEnvelope, signJws } from '../../src/modules/agent-door/conformance/crypto.mjs'
import { zonedInstant } from '../../src/gasket/dates.ts'
import { zone } from './clock.mjs'

/** Real outcome fixtures, real signed company policies and native independent decisions. */
export async function agentOutcomePolicyJourney() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const kid = randomUUID(), installationId = randomUUID(), issuer = 'https://synthetic-gasket-policy.invalid'
  const publicKey = await webcrypto.subtle.exportKey('jwk', pair.publicKey)
  const audience = 'self-host'
  const bindings = {
    RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId,
    RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience, subject: installationId, keys: { [kid]: publicKey } }),
    RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify({ [kid]: { ...publicKey, kid, alg: 'ES256', use: 'sig' } }),
  }
  await outcomeJourney({ bindings, proposalGate: true, investigate: async ({ h, cookie, ids, assets, plans, meters, day, reading, assess, schedule, baselineJobs }) => {
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
      const response = await h.raw('/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'gasket.proposals.apply', arguments: args } },
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'MCP-Protocol-Version': '2025-11-25', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'gasket.proposals.apply' } })
      return { status: response.status, body: await response.json() }
    }
    const freshProposal = async (window = plans.worsening) => {
      const report = await assess(window)
      const prepared = await h.api('outcome.investigate', cookie.agent, { outcome: report.id })
      const proposal = (await h.api('proposals', cookie.owner)).find(row => row.id === prepared.id)
      assert.deepEqual([proposal.basis.outcome, proposal.basis.sourceHash, proposal.basis.window], [report.id, report.source.sourceHash, window])
      return { report, proposal, args: { proposal: proposal.id, hash: prepared.hash, idempotency_key: randomUUID() } }
    }
    const works = () => h.api('work', cookie.owner)
    const audit = () => h.api('audit', cookie.owner)
    const assertNoWork = async (before, label) => assert.deepEqual(await works(), before, label)

    await adopt(autonomousPolicy())
    const allowed = await freshProposal(plans.gap)
    const before = await works()
    const applied = await call(allowed.args)
    assert.equal(code(applied), undefined)
    assert.equal(decision(applied).disposition, 'autonomous')
    assert.deepEqual(decision(applied).classes.map(row => row.class), ['standard'])
    const receipt = result(applied)
    assert.equal(receipt.status, 'approved')
    const work = await h.api(`work/${receipt.result}`, cookie.owner)
    assert.deepEqual([work.kind, work.asset_id, work.status, work.version], ['corrective', assets[0], 'open', 1])
    assert.equal(work.description, allowed.report.uncertainty.join(' '))
    assert.ok(work.created_by_name.includes(' for '))
    const retained = (await h.api('proposals', cookie.owner)).find(row => row.id === allowed.proposal.id)
    assert.equal(retained.decided_by, null, 'allowing policy invents no human approval')
    assert.equal(retained.result_id, work.id)
    assert.equal((await works()).length, before.length + 1)
    assert.deepEqual(await h.api(`outcomes/${allowed.report.id}`, cookie.owner), allowed.report)
    const nativeAudit = (await audit()).rows
    const effect = nativeAudit.filter(row => row.action === 'proposal.apply' && row.subject === allowed.proposal.id)
    assert.equal(effect.length, 1)
    assert.deepEqual(JSON.parse(effect[0].detail).basis, allowed.proposal.basis)
    const doorAudit = await person('/agents/api/audit')
    const execution = doorAudit.rows.find(row => row.tool === 'gasket.proposals.apply' && row.outcome === 'done')
    assert.deepEqual(execution.resource, { kind: 'proposal', id: allowed.proposal.id })
    assert.equal(execution.sponsor.id, retained.decided_by ?? work.created_by)
    assert.equal(execution.consent, context.consent)
    const commitment = (await h.api('proposals', cookie.owner)).find(row => row.id === allowed.report.proposal)
    assert.equal(code(await call({ proposal: commitment.id, hash: commitment.payload_hash, idempotency_key: randomUUID() })), 'unsupported_proposal_kind', 'corrective application cannot execute an interval commitment')
    const completedState = await works()
    const replay = await call(allowed.args)
    assert.deepEqual(result(replay), receipt)
    assert.equal(code(await call({ ...allowed.args, hash: '0'.repeat(64) })), 'idempotency_conflict')
    await assertNoWork(completedState, 'completed replay creates no second corrective order')
    assert.equal((await audit()).rows.filter(row => row.action === 'proposal.apply' && row.subject === allowed.proposal.id).length, 1)
    console.log('PROBE AGENT-004 allowing policy: MCP exact proposal and hash -> standard autonomous execution, retained assessment, one work and one application effect on replay')

    await adopt(heldPolicy())
    const held = await freshProposal()
    const heldBefore = await works()
    const reviewed = await call(held.args)
    assert.equal(code(reviewed), undefined)
    assert.equal(decision(reviewed).disposition, 'review')
    assert.equal(result(reviewed).status, 'pending')
    const reviewId = reviewed.body.result?._meta?.['com.runeditrun/review']?.id
    assert.ok(reviewId, 'held policy creates a genuine review')
    await assertNoWork(heldBefore, 'held review retains native decision without new work')
    const review = (await person('/agents/api/reviews')).reviews.find(row => row.id === reviewId)
    assert.deepEqual(review.summary.nativeTarget, { kind: 'proposal', id: held.proposal.id })
    assert.ok(review.summary.items.some(item => item.includes(held.report.source.sourceHash)))
    await h.api('proposal.decide', cookie.agent, { proposal: held.proposal.id, hash: held.args.hash, decision: 'approve' }, 403)
    const human = await h.api('proposal.decide', cookie.lead, { proposal: held.proposal.id, hash: held.args.hash, decision: 'approve' })
    const decided = (await h.api('proposals', cookie.owner)).find(row => row.id === held.proposal.id)
    assert.equal(decided.decided_by, ids.lead)
    assert.notEqual(decided.prepared_by, decided.decided_by)
    assert.equal((await h.api(`work/${human.result}`, cookie.owner)).status, 'open')
    assert.deepEqual(await h.api(`outcomes/${held.report.id}`, cookie.owner), held.report)
    await person(`/agents/api/reviews/${reviewId}/reviewed`, {})
    assert.deepEqual(result(await call(held.args)), result(reviewed), 'held replay retains review receipt after the independent native decision')
    if (process.env.OUTCOME_POLICY_SCREENSHOTS) {
      const { chromium } = await import('@playwright/test')
      const { mkdir } = await import('node:fs/promises')
      await mkdir(process.env.OUTCOME_POLICY_SCREENSHOTS, { recursive: true })
      const browser = await chromium.launch({ headless: true, executablePath: process.env.GASKET_CHROMIUM_PATH, args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
      try {
        const view = await browser.newContext({ ignoreHTTPSErrors: true })
        await view.addCookies(cookie.owner.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
        const page = await view.newPage()
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1100 })
          for (const [name, path] of [['investigation-proposals', '/app/proposals'], ['investigation-work', `/app/work/${human.result}`]]) {
            assert.equal((await page.goto(h.origin + path)).status(), 200)
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
            if (name === 'investigation-proposals') {
              const card = page.locator('section.gk-card').filter({ has: page.locator(`[href="/app/work/${human.result}"]`) })
              await card.scrollIntoViewIfNeeded()
            }
            await page.screenshot({ path: `${process.env.OUTCOME_POLICY_SCREENSHOTS}/${name}-${width}.png`, fullPage: name !== 'investigation-proposals' })
          }
        }
        await view.close()
      } finally { await browser.close() }
    }
    console.log('PROBE AGENT-004 held policy: MCP application -> genuine review and pending proposal; independent native lead decision -> one attributed corrective investigation')

    await adopt({ ...autonomousPolicy(), rules: [{ id: 'independent', class: '*', do: 'approval', approver: [`person:${decisionSub}`], wait: 'PT1H' }] })
    const approvalCase = await freshProposal()
    const approvalBefore = await works()
    const pending = await call(approvalCase.args)
    assert.equal(decision(pending).disposition, 'approval')
    const handle = pending.body.result?._meta?.['com.runeditrun/error']?.approval
    assert.ok(handle?.id)
    const approvalPath = `/agents/api/approvals/${handle.id}`
    const { approval } = await person(approvalPath)
    assert.deepEqual(approval.summary.nativeTarget, { kind: 'proposal', id: approvalCase.proposal.id })
    assert.ok(approval.summary.items.some(item => item.includes(approvalCase.report.source.sourceHash)))
    const exactDecision = { revision: approval.revision, summary_sha256: approval.summary_sha256 }
    const selfApproval = await h.raw(`${approvalPath}/approve`, { cookie: cookie.owner, body: exactDecision })
    assert.equal(selfApproval.status, 403, 'the sponsor cannot supply the independent company decision')
    await selfApproval.body?.cancel()
    await assertNoWork(approvalBefore, 'pending company approval and self-approval refusal preserve work')
    const approved = await person(`${approvalPath}/approve`, exactDecision, decisionCookie)
    assert.equal(approved.approval.state, 'executed')
    const accepted = await call(approvalCase.args)
    assert.equal(code(accepted), undefined)
    assert.equal(result(accepted).status, 'approved')
    assert.equal((await h.api('proposals', cookie.owner)).find(row => row.id === approvalCase.proposal.id).decided_by, decisionLead.id)
    const acceptedState = await works()
    assert.equal(acceptedState.length, approvalBefore.length + 1)
    assert.deepEqual(result(await call(approvalCase.args)), result(accepted))
    await assertNoWork(acceptedState, 'approved company execution replays one corrective result')
    console.log('PROBE AGENT-004 independent company approval: exact source summary, sponsor refusal and genuine lead decision -> one authorized corrective result and no duplicate on replay')

    await adopt(heldPolicy())
    const rejected = await freshProposal()
    await h.api('proposal.decide', cookie.lead, { proposal: rejected.proposal.id, decision: 'reject', note: 'Retain the assessment; investigate with the next agreed observation window.' })
    const rejectionBefore = await works()
    assert.equal(code(await call(rejected.args)), 'already_decided')
    await assertNoWork(rejectionBefore, 'rejected proposal cannot execute')

    await adopt(autonomousPolicy())
    for (const source of ['reading', 'work', 'cost', 'comparison']) {
      const stale = await freshProposal()
      if (source === 'reading') await reading(0, `${day(9)}T09:00`, 55)
      if (source === 'work') {
        const order = await h.api(`work/${baselineJobs[1]}`, cookie.owner)
        await h.api('workorder.assign', cookie.lead, { workOrder: order.id, version: order.version, assignee: ids.max, note: 'Reconfirm recorded maintenance responsibility' })
      }
      if (source === 'cost') await h.api('work.cost', cookie.lead, { workOrder: baselineJobs[1], category: 'labor', amount: '1.00', note: 'Late posted source cost correction' })
      if (source === 'comparison') {
        const current = (await h.api('schedules', cookie.lead)).find(row => row.id === schedule)
        await h.api('schedule.edit', cookie.lead, { schedule, revision: current.revision, everyDays: current.every_days })
      }
      const snapshot = await works()
      assert.equal(code(await call(stale.args)), 'outcome_stale', `changed ${source} refuses obsolete evidence`)
      await h.api('proposal.decide', cookie.lead, { proposal: stale.proposal.id, hash: stale.args.hash, decision: 'approve' }, 409)
      await assertNoWork(snapshot, `changed ${source} creates no work through either door`)
      assert.deepEqual(await h.api(`outcomes/${stale.report.id}`, cookie.owner), stale.report)
      assert.equal((await h.api('proposals', cookie.owner)).find(row => row.id === stale.proposal.id).status, 'pending')
      console.log(`PROBE AGENT-004 ${source} freshness: change contributing native source then MCP and native approval -> outcome_stale and unchanged work; immutable report retained`)
    }

    for (const changed of ['source', 'policy']) {
      const fenced = await freshProposal()
      const snapshot = await works()
      let reached, release
      const arrived = new Promise(resolve => { reached = resolve })
      const resume = new Promise(resolve => { release = resolve })
      h.setProposalHook(async () => { reached(); await resume })
      const running = call(fenced.args)
      let timer
      try {
        await Promise.race([arrived, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native application batch was not reached')), 10000) })])
        clearTimeout(timer)
        if (changed === 'source') await h.api('work.cost', cookie.owner, { workOrder: baselineJobs[2], category: 'labor', amount: '1.00', note: 'Source changed while application was prepared' })
        else await adopt({ ...autonomousPolicy(), rules: [{ id: 'block', class: '*', do: 'blocked' }] })
      } finally { clearTimeout(timer); release(); h.setProposalHook(undefined) }
      const refused = await running
      assert.equal(code(refused), changed === 'source' ? 'stale' : 'precondition_failed')
      await assertNoWork(snapshot, 'in-batch fence rolls back the corrective insert and receipt')
      assert.equal((await h.api('proposals', cookie.owner)).find(row => row.id === fenced.proposal.id).status, 'pending')
      assert.equal((await audit()).rows.filter(row => row.action === 'proposal.apply' && row.subject === fenced.proposal.id).length, 0)
      await adopt(autonomousPolicy())
      console.log(`PROBE AGENT-004 atomic ${changed} fence: change at emitted Worker D1 boundary -> refusal rolls back work, proposal result and application audit`)
    }

    const guarded = await freshProposal()
    const guardedBefore = await works()
    assert.equal(code(await call({ ...guarded.args, hash: '0'.repeat(64) })), 'proposal_changed')
    assert.equal((await call(guarded.args, { token: null })).status, 401)
    assert.equal((await call(guarded.args, { scope: 'assets:read' })).status, 403)
    const unauthorized = await call(guarded.args, { sub: maintainerSub, email: member('max').email, act: { sub: randomUUID(), name: 'Synthetic maintainer coordinator', specialist: 'maintenance coordinator' } })
    assert.ok([401, 403].includes(unauthorized.status), `unauthorized sponsor refused: HTTP ${unauthorized.status}, code ${code(unauthorized)}`)
    assert.equal(result(unauthorized), undefined)
    await h.api('proposal.decide', cookie.max, { proposal: guarded.proposal.id, hash: guarded.args.hash, decision: 'approve' }, 403)
    const leadToken = { sub: decisionSub, email: decisionEmail, act: { sub: randomUUID(), name: 'Synthetic lead coordinator', specialist: 'maintenance coordinator' } }
    await adopt(heldPolicy())
    assert.equal(result(await call(guarded.args, leadToken)).status, 'pending', 'a genuinely bound current lead reaches held review')
    await h.api('access.role', cookie.owner, { member: decisionLead.id, role: 'maintainer' })
    const demoted = await call(guarded.args, leadToken)
    assert.equal(code(demoted), 'forbidden', 'completed review replay rechecks the current native role')
    assert.equal(result(demoted), undefined)
    await h.api('proposal.decide', decisionCookie, { proposal: guarded.proposal.id, hash: guarded.args.hash, decision: 'approve' }, 403)
    await h.api('access.end', cookie.owner, { member: decisionLead.id })
    assert.equal((await call(guarded.args, leadToken)).status, 401, 'ended sponsor cannot reuse the original credential or receipt')
    await adopt(autonomousPolicy())
    await h.api('service.create', cookie.owner, { name: 'Refused authority expansion', scopes: ['proposal.decide'], expiresAt: clock + 3600000, consent: true }, 400)
    await h.api('workorder.create', cookie.agent, { asset: assets[0], title: 'Refused direct mutation', due: currentDay }, 403)
    await person('/agents/api/pause', { paused: true })
    assert.equal(code(await call(guarded.args)), 'agents_paused')
    await person('/agents/api/pause', { paused: false })
    await adopt(autonomousPolicy(), { revoked: { agents: [], consents: [context.consent] } })
    assert.equal((await call(guarded.args)).status, 401)
    await adopt(autonomousPolicy())
    await person(`/agents/api/agents/${encodeURIComponent(context.agentId)}/revoke`, {})
    assert.equal((await call(guarded.args)).status, 401)
    await assertNoWork(guardedBefore, 'hash, authority, Pause, consent and agent revocation refusals create no work')
    console.log('PROBE AGENT-004 authority: changed hash, signed-out, scope, forbidden sponsor, service expansion, direct native agent, Pause, consent and agent revocation -> refused with unchanged work')
  } })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await agentOutcomePolicyJourney()
