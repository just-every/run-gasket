import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const prepared = new Map()
const error = answer => answer.result?._meta?.['com.runeditrun/error']?.code ?? answer.body?.error?.data?.code
const data = answer => {
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
export async function beforeStep(ctx) {
  if (ctx.step.id !== 'amend-procedure' || !['autonomous', 'held'].includes(ctx.phase)) return
  const { api } = doors(ctx), source = await api(`checklists/${ctx.args.checklist}`)
  const template = await api('template.save', { name: `synthetic-gasket-${crypto.randomUUID()}`, title: 'Inspect the workshop pump', checklist: source.id })
  const work = await api('workorder.create', { location: 'Workshop', title: 'Issued before procedure amendment', due: '2030-01-10', template: template.id, unassigned: true })
  const pinned = await api(`work/${work.id}`)
  assert.equal(pinned.checklist_revision_id, source.revisions[0].id)
  prepared.set(ctx.args.idempotency_key, { source, work: pinned })
}

/** Both company policies execute this same native revision and replay journey. */
export async function afterStep(ctx) {
  if (ctx.step.id !== 'amend-procedure' || !['autonomous', 'held'].includes(ctx.phase)) return
  const { api, json } = doors(ctx), { source, work } = prepared.get(ctx.args.idempotency_key)
  const current = await api(`checklists/${source.id}`), revised = current.revisions[0]
  assert.deepEqual(ctx.result, { id: source.id, revision: revised.id, number: 2 })
  assert.equal(revised.items[0].text, ctx.args.amendments[0].text)
  assert.equal(revised.items[0].key, source.revisions[0].items[0].key)
  assert.deepEqual(current.revisions.slice(1), source.revisions)
  assert.deepEqual(await api(`work/${work.id}`), work)
  assert.equal(work.status, 'open')
  assert.deepEqual(work.signatures, [])
  const effects = async () => (await api('audit')).rows.filter(row => row.subject === source.id && row.action === 'checklist.revise')
  const audit = await effects()
  assert.equal(audit.length, 1)
  const detail = JSON.parse(audit[0].detail)
  assert.equal(detail.sourceRevision, source.revisions[0].id)
  assert.equal(detail.number, 2)
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

  if (ctx.phase === 'held') {
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
export default async function procedureRevisions(ctx) {
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
