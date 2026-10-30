import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from '@playwright/test'

/** One corrective-work sanity journey, using only the hosted Worker's public doors. */
export default async function workParity({ request, origin, cookie }) {
  const send = (path, { session = cookie, body, form, headers = {}, ...init } = {}) => request(new URL(path, origin).href, {
    redirect: 'manual', method: body === undefined && !form ? 'GET' : 'POST',
    ...init, headers: { ...(session ? { Cookie: session } : {}), Origin: origin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined && !form ? {} : { body: form ?? JSON.stringify(body) }),
  })
  const api = async (path, body) => {
    const response = await send(`/api/gasket/${path}`, { body })
    assert.equal(response.status, 200, `parity native ${path}`)
    return response.json()
  }
  const failure = body => body.error?.data?.code ?? body.result?._meta?.['com.runeditrun/error']?.code ?? body.code
  const mcp = async (token, args) => {
    const response = await send('/mcp', { session: '', body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'gasket.work.create', arguments: args } },
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'MCP-Protocol-Version': '2025-11-25', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'gasket.work.create' } })
    return { status: response.status, body: await response.json() }
  }
  const owner = await api('me')
  const asset = await api('asset.create', { tag: `synthetic-gasket-${randomUUID()}`, name: 'Synthetic parity pump', location: 'Workshop' })
  const input = { asset: asset.id, title: `Synthetic corrective inspection ${randomUUID()}`, description: 'Inspect vibration and record the physical observation.', due: '2030-01-10', assignee: owner.id }
  const state = async () => {
    const { rows, total } = await api('work-page?limit=200')
    return { work: { rows, total }, audit: await api('audit?action=workorder.create&limit=500') }
  }
  const writer = await api('service.create', { name: 'Synthetic parity writer', scopes: ['workorder.create'], expiresAt: Date.now() + 3600000, consent: true })
  const initial = await state()
  const accepted = []
  const maintenance = row => Object.fromEntries(['asset_id', 'location', 'kind', 'title', 'description', 'due_date', 'assignee_id', 'status', 'version', 'priority', 'template_id', 'checklist_revision_id'].map(key => [key, row[key]]))
  const expected = { asset_id: input.asset, location: null, kind: 'corrective', title: input.title, description: input.description, due_date: input.due, assignee_id: input.assignee, status: 'open', version: 1, priority: 'normal', template_id: null, checklist_revision_id: null }
  async function inspect(id, door, started, ended) {
    const row = await api(`work/${id}`)
    assert.deepEqual(maintenance(row), expected, `${door} keeps every submitted maintenance fact`)
    assert.equal(row.id, id)
    assert.ok(Number.isSafeInteger(row.number) && row.number > 0)
    assert.ok(row.created_at >= started && row.created_at <= ended, `${door} retains its genuine acceptance time`)
    assert.equal(row.created_by, owner.id)
    assert.equal(row.created_via, door)
    const snapshot = await state()
    assert.equal(snapshot.work.total, initial.work.total + accepted.length + 1, `${door} accepts exactly one work record`)
    assert.equal(snapshot.audit.rows.length, initial.audit.rows.length + accepted.length + 1, `${door} creates exactly one native source audit effect`)
    const events = snapshot.audit.rows.filter(event => event.subject === id)
    assert.equal(events.length, 1)
    const event = events[0], detail = JSON.parse(event.detail)
    assert.deepEqual({ asset: detail.asset, title: detail.title, due: detail.due, assignee: detail.assignee, priority: detail.priority, door: detail.door },
      { asset: input.asset, title: input.title, due: input.due, assignee: input.assignee, priority: 'normal', door })
    assert.equal(event.actor, owner.id)
    assert.ok(event.at >= started && event.at <= ended, `${door} retains the source audit's genuine time`)
    if (door === 'mcp') {
      assert.equal(detail.preparedBy.for.id, owner.id)
      assert.ok(detail.preparedBy.agent.id)
      assert.equal(event.actor_name, detail.preparedBy.label)
      assert.equal(row.created_by_name, detail.preparedBy.label)
      assert.ok(detail.operationId)
    } else {
      assert.equal(detail.preparedBy, undefined)
      assert.equal(event.actor_name, owner.name)
      assert.equal(row.created_by_name, owner.name)
    }
    accepted.push(row)
  }

  // Bridge the virtual deployed origin to its emitted Worker, without replacing any page or action.
  const directory = process.env.GASKET_PARITY_SCREENSHOTS ?? join(tmpdir(), `gasket-work-parity-${process.pid}`)
  await mkdir(directory, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.GASKET_CHROMIUM ? { executablePath: process.env.GASKET_CHROMIUM } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', viewport: { width: 1440, height: 1100 } })
    await context.addCookies(cookie.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: origin } }))
    await context.route('**/*', async route => {
      const browserRequest = route.request()
      if (new URL(browserRequest.url()).origin !== origin) return route.abort()
      const response = await request(browserRequest.url(), { method: browserRequest.method(), headers: await browserRequest.allHeaders(), body: browserRequest.postDataBuffer() ?? undefined, redirect: 'manual' })
      const headers = Object.fromEntries(response.headers)
      for (const name of ['content-encoding', 'content-length', 'transfer-encoding']) delete headers[name]
      await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) })
    })
    const page = await context.newPage()
    assert.equal((await page.goto(`${origin}/app/assets/${asset.id}`)).status(), 200)
    const form = page.locator('form[action="/app/do/workorder.create"]')
    await form.locator('[name=title]').fill(input.title)
    await form.locator('[name=description]').fill(input.description)
    await form.locator('[name=due]').fill(input.due)
    await form.locator('[name=assignee]').selectOption(input.assignee)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 })
      await form.screenshot({ path: join(directory, `corrective-form-${width}.png`) })
    }
    await page.setViewportSize({ width: 1440, height: 1100 })
    const started = Date.now()
    await Promise.all([page.waitForURL(/\/app\/work\/[\w-]+/), form.getByRole('button', { name: 'Raise work order', exact: true }).click()])
    const id = new URL(page.url()).pathname.split('/').pop()
    await inspect(id, 'web', started, Date.now())
    assert.ok((await page.locator('main').innerText()).includes(input.description))
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 })
      await page.screenshot({ path: join(directory, `corrective-result-${width}.png`), fullPage: true })
    }
  } finally { await browser.close() }
  console.log('PROBE SURFACE-001 browser: asset corrective form at 1440 and 390 -> one work record and one web source audit')

  let started = Date.now()
  const json = await api('workorder.create', input)
  await inspect(json.id, 'api', started, Date.now())
  console.log('PROBE SURFACE-001 JSON: workorder.create with equivalent inputs -> equal maintenance facts and one API source audit')
  const args = { ...input, idempotency_key: randomUUID() }
  started = Date.now()
  const reply = await mcp(writer.token, args)
  const created = { status: reply.status, ...reply.body }
  assert.equal(created.status, 200)
  assert.ok(created.result?.structuredContent && !created.result.isError, 'MCP creation succeeds')
  await inspect(created.result.structuredContent.id, 'mcp', started, Date.now())
  assert.equal(new Set(accepted.map(row => row.id)).size, 3, 'doors retain distinct genuine work identities')
  assert.equal(new Set(accepted.map(row => row.number)).size, 3, 'doors retain distinct genuine work numbers')
  assert.deepEqual(accepted.map(maintenance), [expected, expected, expected])
  const beforeRetry = await state()
  const retryReply = await mcp(writer.token, args)
  const retry = { status: retryReply.status, ...retryReply.body }
  assert.ok(!retry.result?.isError)
  assert.deepEqual(retry.result.structuredContent, created.result.structuredContent)
  assert.deepEqual(await api(`work/${created.result.structuredContent.id}`), accepted[2])
  assert.deepEqual(await state(), beforeRetry, 'completed MCP retry adds no work or native source audit')
  console.log('PROBE SURFACE-001 MCP: equivalent inputs and completed retry -> equal maintenance facts, genuine agent attribution, no duplicate work or source audit')

  const unchanged = await state()
  const refused = { ...input, title: 'Synthetic refused corrective work' }
  const signedOut = await send('/api/gasket/workorder.create', { session: '', body: refused })
  assert.equal(signedOut.status, 401)
  await signedOut.body?.cancel()
  const form = new URLSearchParams({ ...refused, returnTo: '/app/work/{id}' })
  const signedOutForm = await send('/app/do/workorder.create', { session: '', form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  assert.equal(signedOutForm.status, 401)
  await signedOutForm.body?.cancel()
  assert.equal((await mcp(null, { ...refused, idempotency_key: randomUUID() })).status, 401)
  assert.deepEqual(await state(), unchanged, 'signed-out attempts create no work or native source audit')

  const narrow = await api('service.create', { name: 'Synthetic parity reader', scopes: ['assets:read'], expiresAt: Date.now() + 3600000, consent: true })
  const forbidden = await mcp(narrow.token, { ...refused, idempotency_key: randomUUID() })
  assert.equal(forbidden.status, 403)
  assert.equal(failure(forbidden.body), 'insufficient_scope')
  const forbiddenJson = await send('/api/gasket/workorder.create', { session: '', headers: { Authorization: `Bearer ${narrow.token}` }, body: refused })
  assert.equal(forbiddenJson.status, 403)
  assert.equal((await forbiddenJson.json()).error, 'service_scope_forbidden')
  assert.deepEqual(await state(), unchanged, 'forbidden attempts create no work or native source audit')

  const forbiddenForm = await send('/app/do/workorder.create', { session: '', form, headers: { Authorization: `Bearer ${narrow.token}`, 'Content-Type': 'application/x-www-form-urlencoded' } })
  assert.equal(forbiddenForm.status, 403)
  await forbiddenForm.body?.cancel()
  assert.deepEqual(await state(), unchanged)

  await api('service.revoke', { credential: writer.id })
  assert.equal((await mcp(writer.token, { ...refused, idempotency_key: randomUUID() })).status, 401)
  assert.equal((await mcp(writer.token, args)).status, 401, 'revocation also refuses a previously completed capture')
  const revokedForm = await send('/app/do/workorder.create', { session: '', form, headers: { Authorization: `Bearer ${writer.token}`, 'Content-Type': 'application/x-www-form-urlencoded' } })
  assert.equal(revokedForm.status, 401)
  await revokedForm.body?.cancel()
  const revoked = await send('/api/gasket/workorder.create', { session: '', headers: { Authorization: `Bearer ${writer.token}` }, body: refused })
  assert.equal(revoked.status, 401)
  await revoked.body?.cancel()
  await api('service.revoke', { credential: narrow.id })
  assert.deepEqual(await state(), unchanged, 'revoked authority creates no work or native source audit')
  console.log('PROBE SURFACE-001 refusal: signed-out, forbidden and revoked public creation attempts -> no new work or source audit')
}
