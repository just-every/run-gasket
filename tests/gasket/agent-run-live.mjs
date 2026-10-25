// AGENT-009 sandbox receipt: the same doors as agent-runs.mjs, with the provider
// edge forwarding to the real provider. Run it only through the secret injector:
//   python3 briefs/_od08-env.py AI_API_KEY=OPENAI_API_KEY -- node tests/gasket/agent-run-live.mjs RECEIPT_PATH
// Fictitious fixtures, the cheapest adequate model, one call per run and a dollar
// cap per grant. The receipt keeps ids, statuses, token counts and cost, never a key.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { harness } from './harness.mjs'
import { zone } from './clock.mjs'

const key = process.env.AI_API_KEY
assert.ok(key, 'AI_API_KEY comes from the injector')
const BASE = 'https://api.openai.com/v1', MODEL = 'gpt-5.4-nano', HOST = new URL(BASE).host
const secret = () => randomBytes(32).toString('base64url')
const forwarded = []
let hold = null
const outbound = async request => {
  assert.equal(new URL(request.url).host, HOST, 'only the granted provider is called')
  const body = await request.text()
  const response = await fetch(request.url, { method: 'POST', headers: { authorization: request.headers.get('authorization'), 'content-type': 'application/json' }, body })
  const text = await response.text()
  forwarded.push({ model: JSON.parse(body).model, status: response.status })
  if (process.env.LIVE_SHOW_ANSWER) console.log('ANSWER', response.status, text.slice(0, 1500))
  if (hold) await hold
  return new Response(text, { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' } })
}
const h = await harness({ vars: { OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: secret(), SETUP_TOKEN: secret(), AI_ENABLED: 'true', AI_API_KEY: key, AI_BASE_URL: BASE, AI_DEADLINE_MS: '15000' }, outbound })
const receipt = { provider: HOST, model: MODEL, runs: [] }
try {
  const cookie = { owner: await h.owner() }, ids = {}
  await h.api('site.configure', cookie.owner, { name: 'Lake Erie Compressor Works', timezone: zone })
  for (const [name, role, label] of [['lead', 'lead', 'Mara Chen'], ['max', 'maintainer', 'Luis Ortega'], ['agent', 'agent', 'Reliability agent']]) {
    ids[name] = (await h.api('access.give', cookie.owner, { name: label, email: `${name}@example.test`, role })).id
    cookie[name] = await h.signIn(`${name}@example.test`)
  }
  const today = (await h.api('me', cookie.owner)).today
  const asset = (await h.api('asset.create', cookie.lead, { tag: 'CMP-1', name: 'Packaging hall compressor', location: 'Lake Erie plant', category: 'Air compressor' })).id
  for (const [n, reason] of [[1, 'Oil seal trip'], [2, 'Oil seal trip, second this week'], [3, 'Oil seal trip, third this week']]) {
    const work = (await h.api('workorder.create', cookie.lead, { asset, title: `Seal trip ${n} on compressor`, due: today, assignee: ids.max })).id
    await h.api('downtime.start', cookie.max, { workOrder: work, startedOn: `${today}T0${n + 2}:00`, reason })
    await h.api('downtime.end', cookie.max, { workOrder: work, endedOn: `${today}T0${n + 2}:40` })
  }
  const body = { agent: ids.agent, provider: HOST, model: MODEL, assets: [asset], actions: ['corrective'], budget: '0.01', inputPrice: '0.20', outputPrice: '1.25', maxProposals: 2, maxOutputTokens: 500 }
  const open = async extra => { const id = (await h.api('agentrun.grant', cookie.owner, { ...body, ...extra })).id; return { id, preview: await h.api(`agent-grants/${id}/preview`, cookie.owner) } }
  const note = (label, run) => receipt.runs.push({ label, run: run.id, status: run.status, providerOutcome: run.providerOutcome, tokens: [run.promptTokens, run.completionTokens], costUsd: run.costUsd, costBasis: run.costBasis, proposals: run.proposals.length, discarded: run.discarded })

  // 1. A real run, then a human approves one proposal.
  const good = await open({})
  receipt.reserveUsd = (good.preview.reserveMicro / 1e6).toFixed(6)
  const first = await h.api('agentrun.start', cookie.owner, { grant: good.id, previewHash: good.preview.previewHash })
  note('live run', first)
  assert.equal(first.status, 'completed', `live run: ${first.providerOutcome}`)
  assert.ok(first.proposals.length >= 1 && first.proposals.every(item => item.status === 'pending'))
  const worksBefore = (await h.api('work', cookie.owner)).length
  await h.api('proposal.decide', cookie.lead, { proposal: first.proposals[0].id, decision: 'approve', hash: first.proposals[0].hash })
  assert.equal((await h.api('work', cookie.owner)).length, worksBefore + 1)

  // 2. Revocation while a real call is in flight: the answer is billed and dropped.
  let release
  hold = new Promise(resolve => { release = resolve })
  const proposalsBefore = (await h.api('proposals', cookie.lead)).length
  const flying = h.api('agentrun.start', cookie.owner, { grant: good.id, previewHash: (await h.api(`agent-grants/${good.id}/preview`, cookie.owner)).previewHash })
  for (let i = 0; i < 400 && forwarded.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(forwarded.length, 2)
  const revoked = await h.api('agentrun.revoke', cookie.owner, { grant: good.id, reason: 'Stop this run: revoke mid-run receipt.' })
  hold = null; release()
  const dropped = await flying
  note('revoked mid-run', dropped)
  receipt.rejectedPendingOnRevoke = revoked.rejected
  assert.deepEqual([dropped.status, dropped.discarded, dropped.proposals.length], ['revoked', true, 0])
  assert.equal((await h.api('proposals', cookie.lead)).length, proposalsBefore, 'nothing written after revocation')

  // 3. A real provider failure: an unknown model id is refused by the provider.
  const bad = await open({ model: `${MODEL}-no-such-model` })
  const failed = await h.api('agentrun.start', cookie.owner, { grant: bad.id, previewHash: bad.preview.previewHash })
  note('provider refusal', failed)
  assert.deepEqual([failed.status, failed.proposals.length, failed.costBasis], ['failed', 0, 'none'])

  // 4. A real call whose answer comes back after the deadline: it may have been billed, so the whole reserve stays charged.
  const slow = await open({})
  hold = new Promise(resolve => setTimeout(resolve, 20_000))
  const lost = await h.api('agentrun.start', cookie.owner, { grant: slow.id, previewHash: slow.preview.previewHash })
  hold = null
  note('answer after the deadline', lost)
  assert.deepEqual([lost.status, lost.providerOutcome, lost.costBasis, lost.proposals.length], ['uncertain', 'upstream_uncertain', 'reserved', 0])

  // 5. No secret in any surface; every run settled; spend within every cap.
  const csv = await (await h.raw('/app/agent-runs.csv', { cookie: cookie.owner })).text(), json = JSON.stringify(await h.api('agent-runs', cookie.owner))
  const surfaces = [csv, json, await (await h.raw('/app/agent-runs', { cookie: cookie.owner })).text(), await (await h.raw('/app/audit.csv', { cookie: cookie.owner })).text(), JSON.stringify(await h.api('proposals', cookie.lead))]
  assert.ok(surfaces.every(text => !text.includes(key)), 'the provider key appears nowhere')
  const view = await h.api('agent-runs', cookie.owner)
  assert.ok(view.runs.every(run => run.status !== 'running') && view.grants.every(grant => grant.spentMicro <= grant.budgetMicro))
  receipt.providerCalls = forwarded.length
  receipt.totalCostUsd = (view.runs.reduce((sum, run) => sum + (run.costMicro ?? 0), 0) / 1e6).toFixed(6)
  receipt.exportRows = csv.trim().split('\r\n').length - 1
  receipt.noKeyInSurfaces = surfaces.length
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(receipt, null, 2) + '\n')
  console.log(JSON.stringify(receipt, null, 2))
} finally { await h.close() }
