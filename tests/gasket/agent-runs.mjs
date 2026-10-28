// AGENT-009: owner grants, exact previews, one-call model runs, revocation in
// flight, provider failures and the cost and decision export. Only the provider's
// network edge is faked; the key is a synthetic fixture and must never surface.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { harness, exerciseKeyedActions } from './harness.mjs'
import { offset, zone } from './clock.mjs'

const KEY = 'synthetic-gasket-1', BASE = 'https://models.example.test/v1'

export async function agentRunJourney() {
  const calls = []
  let script = async () => { throw new Error('no provider script') }
  const outbound = async request => {
    assert.equal(request.url, `${BASE}/chat/completions`, 'only the configured provider is called')
    const body = await request.json()
    calls.push({ body, authorization: request.headers.get('authorization') })
    return await script(body, calls.length)
  }
  const secret = () => randomBytes(32).toString('base64url')
  const vars = { OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: secret(), SETUP_TOKEN: secret(), AI_ENABLED: 'true', AI_API_KEY: KEY, AI_BASE_URL: BASE, AI_DEADLINE_MS: '8000' }
  const initial = await harness({ vars, outbound })
  let h = initial
  const answer = (proposals, usage = { prompt_tokens: 1200, completion_tokens: 150 }) => Response.json({ choices: [{ message: { content: JSON.stringify({ summary: 'Repeated seal trips on the compressor.', proposals }) } }], usage })
  const pick = (refs, kind) => refs.filter(ref => ref.type === kind)
  try {
    const cookie = { owner: await h.owner() }, ids = {}
    exerciseKeyedActions(h, cookie.owner, ['agentrun.grant', 'agentrun.revoke', 'agentrun.start'], { once: true })
    await h.api('site.configure', cookie.owner, { name: 'Lake Erie Compressor Works', timezone: zone })
    for (const [key, role, name] of [['lead', 'lead', 'Mara Chen'], ['max', 'maintainer', 'Luis Ortega'], ['agent', 'agent', 'Reliability agent']]) {
      ids[key] = (await h.api('access.give', cookie.owner, { name, email: `${key}@example.test`, role })).id
      cookie[key] = await h.signIn(`${key}@example.test`)
    }
    const today = (await h.api('me', cookie.owner)).today
    const asset = (await h.api('asset.create', cookie.lead, { tag: 'CMP-1', name: 'Packaging hall compressor', location: 'Lake Erie plant', category: 'Air compressor' })).id
    const other = (await h.api('asset.create', cookie.lead, { tag: 'CMP-2', name: 'Boiler feed pump', location: 'Lake Erie plant', category: 'Pump' })).id
    const trip = (await h.api('workorder.create', cookie.lead, { asset, title: 'Seal trip on compressor', due: today, assignee: ids.max })).id
    await h.api('downtime.start', cookie.max, { workOrder: trip, startedOn: `${today}T03:00`, reason: 'Oil seal trip' })
    await h.api('downtime.end', cookie.max, { workOrder: trip, endedOn: `${today}T03:30` })
    await h.api('work.cost', cookie.lead, { workOrder: trip, category: 'parts', amount: '412.50', note: 'Seal kit' })
    const grantBody = { agent: ids.agent, provider: 'models.example.test', model: 'cheap-model-1', assets: [asset], actions: ['corrective'], budget: '0.01', inputPrice: '0.10', outputPrice: '0.40', maxProposals: 2, maxOutputTokens: 800 }

    // Owner-only, scoped and bounded: nobody else grants, and nothing unbounded or unexplained is accepted.
    for (const who of ['lead', 'max', 'agent']) await h.api('agentrun.grant', cookie[who], grantBody, 403)
    await h.api('agentrun.grant', cookie.owner, { ...grantBody, provider: 'api.elsewhere.test' }, 409)
    await h.api('agentrun.grant', cookie.owner, { ...grantBody, assets: [] }, 400)
    await h.api('agentrun.grant', cookie.owner, { ...grantBody, assets: [asset, 'missing-asset'] }, 404)
    await h.api('agentrun.grant', cookie.owner, { ...grantBody, assets: [asset, other, 'a', 'b'] }, 400)
    await h.api('agentrun.grant', cookie.owner, { ...grantBody, actions: ['count'] }, 400)
    await h.api('agentrun.grant', cookie.owner, { ...grantBody, budget: '-1' }, 400)
    await h.api('agentrun.grant', cookie.owner, { ...grantBody, agent: ids.lead }, 404)
    await h.api('agentrun.grant', cookie.owner, { ...grantBody, costs: 'yes' }, 400)
    assert.equal(calls.length, 0)
    const { id: grant } = await h.api('agentrun.grant', cookie.owner, grantBody)
    const page = await (await h.raw('/app/agent-runs', { cookie: cookie.owner })).text()
    assert.ok(page.includes('cheap-model-1') && page.includes('Preview data and actions'))
    for (const who of ['lead', 'agent']) assert.equal((await h.raw('/app/agent-runs', { cookie: cookie[who] })).status, 403)
    assert.equal((await h.raw('/api/gasket/agent-runs', { cookie: cookie.lead })).status, 403)
    assert.equal((await h.raw('/api/gasket/agent-runs')).status, 401)

    // The preview is exactly the request that is sent: scoped facts, no people, no costs, no other asset.
    const preview = await h.api(`agent-grants/${grant}/preview`, cookie.owner)
    const sent = JSON.stringify(preview.request)
    assert.ok(sent.includes('CMP-1') && sent.includes('Oil seal trip') && sent.includes('Seal trip on compressor'))
    for (const text of ['CMP-2', 'Boiler feed pump', 'Mara Chen', 'Luis Ortega', 'owner@example.test', '412', 'Seal kit', KEY]) assert.ok(!sent.includes(text), `${text} stays out of the request`)
    assert.deepEqual(pick(preview.inputs, 'asset').map(ref => ref.ref), ['CMP-1'])
    assert.ok(preview.withheld.includes('posted work costs') && preview.wouldFit && preview.reserveMicro > 0)
    await h.api(`agent-grants/${grant}/preview`, cookie.lead, undefined, 403)
    await h.api('agentrun.start', cookie.owner, { grant, previewHash: 'stale' }, 409)
    assert.equal(calls.length, 0, 'a refused start never reaches the provider')

    // Posted costs reach the provider only on a grant that carries them and the owner's recorded terms.
    const costly = (await h.api('agentrun.grant', cookie.owner, { ...grantBody, costs: 'yes', termsAck: 'Provider terms: no retention and no training on inputs.' })).id
    const costPreview = await h.api(`agent-grants/${costly}/preview`, cookie.owner)
    assert.ok(costPreview.request.messages[1].content.includes('"postedCostUsd":412.5'))
    assert.notEqual(costPreview.previewHash, preview.previewHash)
    await h.api('agentrun.revoke', cookie.owner, { grant: costly, reason: 'Preview only; not used.' })

    // One run: one provider call with the previewed body, priced from reported usage, proposals pending as the agent.
    const evidence = pick(preview.inputs, 'work_order').map(ref => ref.ref).concat(pick(preview.inputs, 'downtime').map(ref => ref.ref))
    const proposals = [1, 2].map(n => ({ kind: 'corrective', asset: 'CMP-1', title: `Inspect compressor oil seal ${n}`, description: 'Seal trips repeat.', dueInDays: 5, reasoning: 'Two trips within a day.', evidence }))
    script = async () => answer(proposals)
    const beforeWork = (await h.api('work', cookie.owner)).length
    const first = await h.api('agentrun.start', cookie.owner, { grant, previewHash: preview.previewHash })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].body, preview.request, 'the provider received exactly the previewed request')
    assert.equal(calls[0].authorization, `Bearer ${KEY}`)
    assert.deepEqual([first.status, first.costMicro, first.costUsd, first.costBasis, first.promptTokens, first.completionTokens, first.discarded], ['completed', 180, '0.000180', 'reported', 1200, 150, false])
    assert.equal(first.proposals.length, 2)
    assert.ok(first.proposals.every(item => item.status === 'pending' && item.outcome.status === 'not_measured' && item.evidence.length === evidence.length))
    assert.equal((await h.api('work', cookie.owner)).length, beforeWork, 'a run changes no work by itself')
    const listed = (await h.api('proposals', cookie.lead)).filter(row => row.id === first.proposals[0].id)[0]
    assert.deepEqual([listed.prepared_by, listed.prepared_by_name, listed.status], [ids.agent, 'Reliability agent', 'pending'])
    assert.ok(listed.reasoning.includes('Evidence:') && listed.reasoning.includes('cheap-model-1'))
    await h.api('proposal.decide', cookie.agent, { proposal: listed.id, decision: 'approve', hash: listed.payload_hash }, 403)
    await h.api('agentrun.start', cookie.agent, { grant, previewHash: preview.previewHash }, 403)

    // A person approves one proposal; the normal command runs as them and the run shows the decision.
    const approved = await h.api('proposal.decide', cookie.lead, { proposal: first.proposals[0].id, decision: 'approve', hash: first.proposals[0].hash })
    assert.equal((await h.api('work', cookie.owner)).length, beforeWork + 1)
    const afterApproval = await h.api(`agent-runs/${first.id}`, cookie.owner)
    assert.deepEqual([afterApproval.proposals[0].status, afterApproval.proposals[0].decidedBy, afterApproval.proposals[0].applied], ['approved', 'Mara Chen', approved.result])
    assert.equal(afterApproval.proposals[1].status, 'pending')

    // Budget: the reserve is charged before the call and the difference returned after it.
    const view = await h.api('agent-runs', cookie.owner)
    assert.equal(view.grants.find(row => row.id === grant).spentMicro, 180)
    const tight = (await h.api('agentrun.grant', cookie.owner, { ...grantBody, budget: String((preview.reserveMicro - 1) / 1_000_000) })).id
    const tightPreview = await h.api(`agent-grants/${tight}/preview`, cookie.owner)
    assert.equal(tightPreview.wouldFit, false)
    await h.api('agentrun.start', cookie.owner, { grant: tight, previewHash: tightPreview.previewHash }, 409)
    assert.equal(calls.length, 1, 'a run that cannot fit its budget never reaches the provider')
    await h.api('agentrun.revoke', cookie.owner, { grant: tight, reason: 'Budget probe finished.' })

    // Revocation in flight: the answer arrives after the revoke and none of it is written.
    let release
    const gate = new Promise(resolve => { release = resolve })
    script = async () => { await gate; return answer(proposals) }
    const inFlight = h.api('agentrun.start', cookie.owner, { grant, previewHash: (await h.api(`agent-grants/${grant}/preview`, cookie.owner)).previewHash })
    for (let i = 0; i < 100 && calls.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(calls.length, 2, 'the second run is waiting on the provider')
    const running = (await h.api('agent-runs', cookie.owner)).runs.find(run => run.status === 'running')
    assert.ok(running, 'the run is visible while it waits')
    const proposalsBefore = (await h.api('proposals', cookie.lead)).length, auditBefore = (await h.api('audit?limit=500', cookie.owner)).rows.length
    assert.deepEqual(await h.api('agentrun.revoke', cookie.owner, { grant, reason: 'Stop the run: wrong asset scope.' }), { id: grant, rejected: 1 })
    await h.api('agentrun.revoke', cookie.owner, { grant, reason: 'again' }, 409)
    release()
    const revoked = await inFlight
    assert.deepEqual([revoked.id, revoked.status, revoked.discarded, revoked.proposals.length, revoked.summary, revoked.costBasis], [running.id, 'revoked', true, 0, null, 'reported'])
    assert.equal(revoked.providerOutcome, 'answered', 'the provider did answer; the answer was dropped')
    assert.equal((await h.api('proposals', cookie.lead)).length, proposalsBefore, 'no proposal is written after revocation')
    const entries = (await h.api('audit?limit=500', cookie.owner)).rows
    assert.ok(entries.slice(0, entries.length - auditBefore).every(row => !['proposal.prepare', 'workorder.create'].includes(row.action)), 'no write follows the revoke')
    const pending = (await h.api('proposals', cookie.lead)).find(row => row.id === first.proposals[1].id)
    assert.deepEqual([pending.status, pending.decision_note], ['rejected', 'Run grant revoked: Stop the run: wrong asset scope.'], 'revoking cancels pending authority')
    await h.api('proposal.decide', cookie.lead, { proposal: pending.id, decision: 'approve', hash: pending.payload_hash }, 409)
    await h.api('agentrun.start', cookie.owner, { grant, previewHash: preview.previewHash }, 409)
    const approvedKept = await h.api(`agent-runs/${first.id}`, cookie.owner)
    assert.equal(approvedKept.proposals[0].status, 'approved', 'a human decision already made stays')
    assert.equal(calls.length, 2)

    // Provider failure stays visible and never becomes a result; cost follows what may have been billed.
    const fresh = async extra => { const id = (await h.api('agentrun.grant', cookie.owner, { ...grantBody, ...extra })).id; return { id, hash: (await h.api(`agent-grants/${id}/preview`, cookie.owner)).previewHash } }
    const run = async (plan, failure) => { script = failure; const { id, hash } = plan; return await h.api('agentrun.start', cookie.owner, { grant: id, previewHash: hash }) }
    const refused = await run(await fresh(), async () => Response.json({ error: { message: `model not found, key ${KEY}` } }, { status: 404 }))
    assert.deepEqual([refused.status, refused.providerOutcome, refused.costMicro, refused.costBasis, refused.proposals.length, refused.discarded], ['failed', 'upstream_error', 0, 'none', 0, true])
    const down = await fresh()
    const unavailable = await run(down, async () => new Response('upstream busy', { status: 503 }))
    assert.deepEqual([unavailable.status, unavailable.providerOutcome, unavailable.costBasis, unavailable.costMicro > 0], ['failed', 'upstream_unavailable', 'reserved', true])
    const dropped = await run(await fresh(), () => new Promise(() => {}))
    assert.deepEqual([dropped.status, dropped.providerOutcome, dropped.costBasis, dropped.proposals.length], ['uncertain', 'upstream_uncertain', 'reserved', 0])
    const wrongAsset = await run(await fresh(), async () => answer([{ ...proposals[0], asset: 'CMP-2' }]))
    assert.deepEqual([wrongAsset.status, wrongAsset.providerOutcome, wrongAsset.costBasis, wrongAsset.proposals.length, wrongAsset.summary], ['failed', 'output_invalid:asset_out_of_scope', 'reported', 0, null])
    const uncited = await run(await fresh(), async () => answer([{ ...proposals[0], evidence: ['WO-9999'] }]))
    assert.equal(uncited.providerOutcome, 'output_invalid:invalid_evidence')
    const unpriced = await run(await fresh(), async () => answer([], {}))
    assert.deepEqual([unpriced.status, unpriced.costBasis, unpriced.costMicro > 0, unpriced.proposals.length], ['completed', 'reserved', true, 0])
    assert.equal((await h.api('work', cookie.owner)).length, beforeWork + 1, 'no failed run created work')

    // Measured outcome: the approved repair is worked, independently reviewed and followed by AGENT-004's window and assessment.
    const peer = (await h.api('asset.create', cookie.lead, { tag: 'CMP-3', name: 'Second packaging compressor', location: 'Lake Erie plant', category: 'Air compressor' })).id
    const repair = approved.result, version = async who => (await h.api(`work/${repair}`, cookie[who])).version
    await h.api('workorder.assign', cookie.lead, { workOrder: repair, assignee: ids.max })
    await h.api('workorder.submit', cookie.max, { workOrder: repair, version: await version('max') })
    await h.api('workorder.review', cookie.owner, { workOrder: repair, version: await version('owner'), decision: 'approve' })
    const day = n => { const date = new Date(`${today}T12:00Z`); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10) }
    const window = (await h.api('outcome.window', cookie.lead, { workOrder: repair, baselineFrom: day(-10), baselineTo: day(-1), postFrom: day(0), postTo: day(1), peers: peer })).id
    const waiting = (await h.api(`agent-runs/${first.id}`, cookie.owner)).proposals[0].outcome
    assert.deepEqual([waiting.status, waiting.window], ['awaiting_assessment', window])
    await h.stop()
    h = await harness({ installation: initial.installation, vars, outbound, clockOffset: offset + 3 * 86_400_000 })
    for (const key of ['owner', 'lead', 'max', 'agent']) cookie[key] = await h.signIn(key === 'owner' ? vars.OWNER_EMAIL : `${key}@example.test`)
    const assessment = await h.api('outcome.assess', cookie.agent, { window })
    const measured = (await h.api(`agent-runs/${first.id}`, cookie.owner)).proposals[0].outcome
    assert.deepEqual([measured.status, measured.assessment, measured.window], [assessment.status, assessment.id, window], 'the run carries the retained measured outcome, unproven where the evidence is missing')

    // Export: decisions, cost and outcome history, with no secret and no provider text.
    const csv = await (await h.raw('/app/agent-runs.csv', { cookie: cookie.owner })).text()
    const rows = csv.trim().split('\r\n')
    assert.ok(rows[0].startsWith('run,grant,grant_revision') && rows.length > 8)
    const approvedRow = rows.find(row => row.includes(first.proposals[0].id))
    assert.ok(approvedRow.includes('approved') && approvedRow.includes('Mara Chen') && approvedRow.includes('0.000180') && approvedRow.includes(assessment.status))
    assert.ok(rows.some(row => row.includes('Run grant revoked') && row.includes('rejected')))
    const json = JSON.stringify(await h.api('agent-runs', cookie.owner))
    const surfaces = [csv, json, page, await (await h.raw('/app/agent-runs', { cookie: cookie.owner })).text(), await (await h.raw('/app/audit.csv', { cookie: cookie.owner })).text(), JSON.stringify(await h.api('proposals', cookie.lead)), JSON.stringify(await h.api('audit?limit=500', cookie.owner))]
    for (const text of surfaces) assert.ok(!text.includes(KEY) && !text.includes('model not found') && !text.includes('upstream busy'), 'no key or provider text in any surface')
    const grantsAfter = (await h.api('agent-runs', cookie.owner)).grants
    for (const row of grantsAfter) assert.ok(row.spentMicro <= row.budgetMicro, 'no grant passed its budget')
    for (const run of (await h.api('agent-runs', cookie.owner)).runs) assert.notEqual(run.status, 'running', 'every run settled')
    assert.equal(calls.length, 8, 'one call per started run: no loop, no retry')
    if (process.env.AGENT_SCREENSHOTS) {
      const open = (await h.api('agentrun.grant', cookie.owner, grantBody)).id
      const { agentRunsBrowser } = await import('./agent-runs-browser.mjs')
      await agentRunsBrowser(h, cookie, open)
    }
  } finally { await h.stop(); await initial.close() }
}
