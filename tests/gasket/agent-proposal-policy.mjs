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
    assert.deepEqual(applied.result._meta['com.runeditrun/decision'].classes.map(({ class: name, facts }) => ({ class: name, facts })), [{ class: 'standard', facts: { measure: 1 } }])
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
    const admission = (await person('/agents/api/audit')).rows.find(row => row.id === receipt.admission)
    assert.deepEqual(admission.resource, { kind: 'proposal', id: allowed.proposal })
    assert.deepEqual([receipt.admission, receipt.policyRevision, receipt.operationId, receipt.agent.agent.id, receipt.agent.for.id],
      [applied.result._meta['com.runeditrun/decision'].id, revision, admission.operation_id, context.agentId, owner.id])
    assert.equal((await native()).work.length, before.work.length + 1)
    const after = await native(), replay = await call(allowed)
    assert.deepEqual(replay.result.structuredContent, result)
    assert.deepEqual(await native(), after)
    assert.equal((await api('audit?action=workorder.create')).rows.filter(row => JSON.parse(row.detail).proposal === allowed.proposal).length, 1)
    console.log('PROBE GAS-13 allowing and replay: MCP exact stored proposal -> one corrective order, one atomic application receipt, no invented approver')

    const changed = await prepare('Synthetic hash fence')
    await refuses({ ...changed, hash: '0'.repeat(64) }, 'proposal_changed')
    await refuses({ ...changed, hash: allowed.hash }, 'proposal_changed')
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

    // Native decisions and policy execution share the same pending proposal,
    // even when both doors have already resolved its exact stored payload.
    for (const decision of ['approve', 'reject']) {
      const competing = await prepare(`Synthetic competing ${decision}`), beforeCompetition = await native()
      const [agentAnswer, humanAnswer] = await Promise.all([
        call(competing),
        request('/api/gasket/proposal.decide', { method: 'POST', headers: { Origin: origin, Cookie: leadCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ proposal: competing.proposal, hash: competing.hash, decision, note: 'Independent native decision' }) })
          .then(async response => ({ httpStatus: response.status, ...await response.json() })),
      ])
      const agentWon = agentAnswer.result?.structuredContent?.status === 'applied', humanWon = humanAnswer.httpStatus === 200
      assert.equal(Number(agentWon) + Number(humanWon), 1, `exactly one door decides the proposal: ${JSON.stringify({ decision, agentAnswer, humanAnswer })}`)
      if (!agentWon) assert.ok(['already_decided', 'proposal_changed'].includes(code(agentAnswer)), JSON.stringify(agentAnswer))
      if (!humanWon) {
        assert.equal(humanAnswer.httpStatus, 409)
        assert.ok(['already_decided', 'proposal_changed'].includes(humanAnswer.error), JSON.stringify(humanAnswer))
      }
      const row = (await api('proposals')).find(row => row.id === competing.proposal)
      const created = (await api('audit?action=workorder.create')).rows.filter(event => JSON.parse(event.detail).proposal === competing.proposal)
      const decisions = (await Promise.all(['proposal.apply', 'proposal.approve', 'proposal.reject'].map(action => api(`audit?action=${action}`))))
        .flatMap(page => page.rows).filter(event => event.subject === competing.proposal)
      assert.equal(decisions.length, 1, 'the losing transaction leaves no decision receipt')
      const acceptedWork = agentWon || decision === 'approve'
      assert.equal((await native()).work.length, beforeCompetition.work.length + Number(acceptedWork))
      assert.equal(created.length, Number(acceptedWork), 'the losing application leaves no work or work audit')
      assert.deepEqual([row.status, row.decided_by], [agentWon ? 'applied' : decision === 'approve' ? 'approved' : 'rejected', agentWon ? null : lead.id])
      assert.equal(decisions[0].action, agentWon ? 'proposal.apply' : `proposal.${decision}`)
      if (acceptedWork) {
        const resultId = agentWon ? agentAnswer.result.structuredContent.result : humanAnswer.result
        assert.equal(row.result_id, resultId)
        assert.equal(created[0].subject, resultId)
        assert.equal(JSON.parse(decisions[0].detail).result, resultId)
        assert.equal((await api(`work/${resultId}`)).title, `Synthetic competing ${decision}`)
        if (agentWon) {
          const committed = await native()
          assert.deepEqual((await call(competing)).result.structuredContent, agentAnswer.result.structuredContent)
          assert.deepEqual(await native(), committed)
        }
      } else assert.equal(row.result_id, null)
    }
    console.log('PROBE GAS-13 competing doors: MCP application racing native approval or rejection -> one decision, matching work and atomic receipt, no losing effects')

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
    const rejectionAttempts = await Promise.all(['Duplicate inspection', 'Already covered'].map(async note => {
      const response = await request('/api/gasket/proposal.decide', { method: 'POST', headers: { Origin: origin, Cookie: leadCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ proposal: rejected.proposal, decision: 'reject', note }) })
      return { status: response.status, body: await response.json() }
    }))
    assert.deepEqual(rejectionAttempts.map(answer => answer.status).sort(), [200, 409], 'one independent rejection wins; the competing decision is refused')
    assert.equal(rejectionAttempts.find(answer => answer.status === 409).body.error, 'already_decided')
    const rejections = (await api('audit?action=proposal.reject')).rows.filter(row => row.subject === rejected.proposal)
    assert.equal(rejections.length, 1, 'a losing rejection adds no decision audit effect')
    const rejectedRow = (await api('proposals')).find(row => row.id === rejected.proposal)
    assert.deepEqual([rejectedRow.status, rejectedRow.decided_by, rejectedRow.result_id], ['rejected', lead.id, null])
    assert.equal(JSON.parse(rejections[0].detail).note, rejectedRow.decision_note)
    await refuses(rejected, 'already_decided')
    assert.deepEqual((await native()).work, rejectedBefore)
    console.log('PROBE GAS-13 independent rejection: concurrent native decisions -> one rejection, one attributed audit effect, no corrective work')
    console.log('PROBE GAS-13 held decision and rejection: review -> pending; different lead decides exact hash; rejection creates no work')

    await policy({ ...autonomousPolicy(), rules: [{ id: 'refuse', class: '*', do: 'blocked' }] })
    await refuses(await prepare('Synthetic blocked correction'), 'policy_blocked')
    await refuses(allowed, 'policy_blocked')
    console.log('PROBE GAS-13 refused policy: new application and completed replay -> refused without native effects')

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
    const { approval: independentView } = await person(`/agents/api/approvals/${independentHandle.id}`)
    assert.deepEqual(independentView.summary.nativeTarget, { kind: 'proposal', id: independent.proposal })
    assert.ok(independentView.summary.items.includes(`Payload hash: ${independent.hash}`))
    assert.ok(independentView.summary.items.includes(`Asset: ${asset.id}; revision: ${assetRevision}`))
    assert.equal((await approve(independentHandle)).approval.state, 'executed')
    const independentRow = (await api('proposals')).find(row => row.id === independent.proposal)
    assert.deepEqual([independentRow.status, independentRow.decided_by], ['approved', owner.id])
    assert.equal((await api(`work/${independentRow.result_id}`)).title, 'Synthetic genuine policy approval')
    const approvedState = await native(), approvedReplay = await call(independent)
    assert.deepEqual(approvedReplay.result.structuredContent, { id: independent.proposal, status: 'approved', result: independentRow.result_id })
    assert.deepEqual(approvedReplay.result._meta['com.runeditrun/receipt'].approved_by, [owner.id])
    assert.equal((await approve(independentHandle)).approval.state, 'executed')
    assert.deepEqual((await call(independent)).result.structuredContent, approvedReplay.result.structuredContent)
    assert.deepEqual(await native(), approvedState, 'completed approval and application replays change no native records')
    assert.equal((await api('audit?action=proposal.approve')).rows.filter(row => row.subject === independent.proposal).length, 1)
    assert.equal((await api('audit?action=workorder.create')).rows.filter(row => JSON.parse(row.detail).proposal === independent.proposal).length, 1)
    console.log('PROBE GAS-13 approved replay: genuine independent policy approval and repeated MCP calls -> original corrective result and one attributed application effect')
    const waiting = await prepare('Synthetic changed policy')
    const waitingCall = await call(waiting)
    const waitingHandle = waitingCall.result._meta['com.runeditrun/error'].approval
    const pendingBefore = await native()
    await policy(autonomousPolicy())
    assert.equal((await approve(waitingHandle)).approval.code, 'approval_evidence_changed')
    assert.deepEqual(await native(), pendingBefore)
    console.log('PROBE GAS-13 policy fencing: policy changes after held admission -> approval refused without native effects')

    await policy({ ...autonomousPolicy(), rules: [{ id: 'hold', class: '*', do: 'approval', approver: ['sponsor'], wait: 'PT1H' }] })
    const staleApproval = await prepare('Synthetic stale pending correction', leadCookie)
    const staleCall = await call(staleApproval)
    const staleHandle = staleCall.result._meta['com.runeditrun/error'].approval
    const beforeAssetChange = await api(`assets/${asset.id}`)
    await api('asset.update', { asset: asset.id, revision: beforeAssetChange.revision, tag: beforeAssetChange.tag, name: 'Synthetic revised pending pump', location: beforeAssetChange.location })
    assetRevision++
    const staleBefore = await native()
    const staleOutcome = (await approve(staleHandle)).approval
    assert.deepEqual([staleOutcome.state, staleOutcome.code], ['refused', 'revision_conflict'], 'a held approval cannot execute against changed asset facts')
    assert.deepEqual(await native(), staleBefore)
    await policy(autonomousPolicy())
    assert.deepEqual((await call(allowed)).result.structuredContent, result, 'completed replay retains the original result after a later asset revision')
    assert.deepEqual(await native(), staleBefore, 'replay after a source edit creates no new order or application receipt')
    await api('access.role', { member: lead.id, role: 'supervisor' })
    await refuses(authority, 'forbidden', leadClaims)
    await api('access.role', { member: lead.id, role: 'lead' })
    console.log('PROBE GAS-13 pending source and completed replay: changed asset -> held execution refused; original completed result replays once within current authority')

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
