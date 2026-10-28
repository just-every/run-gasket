// Runs the built Worker (dist/) on a local installation's D1 and drives it only
// through public HTTP doors: the JSON door, the form door, pages and downloads.
// Given an installation (a restored one) and its configuration, it runs on that.
// Every Worker runs on the flows' pinned clock (clock.mjs).
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { emittedWorker } from '../emitted-worker.mjs'
import { offset } from './clock.mjs'
import { installation as newInstallation } from './installation.mjs'

export async function harness({ vars, installation, clockOffset = offset, clockInstant, outbound, generationGate, formSaveFault } = {}) {
  const secret = () => randomBytes(32).toString('base64url')
  vars ??= { OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: secret(), SETUP_TOKEN: secret() }
  const owned = !installation
  if (owned) { installation = await newInstallation(); await installation.migrate() }
  const worker = await emittedWorker(vars, { installation: installation.root, offset: clockOffset, instant: clockInstant, outbound, generationGate, formSaveFault }), origin = worker.origin
  /** Stops the Worker and keeps the installation's data; close also removes an installation made here. */
  let stopped = false
  const stop = async () => { if (!stopped) { stopped = true; await worker.close() } }
  const close = async () => { await stop(); if (owned) await installation.remove() }

  const raw = (path, { cookie, body, form, method, headers = {} } = {}) => worker.request(path, {
    method: method ?? (body !== undefined || form ? 'POST' : 'GET'), redirect: 'manual',
    headers: { ...headers, 'CF-Connecting-IP': '127.0.0.1', ...(cookie ? { cookie } : {}), ...(body !== undefined || form ? { origin } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : form,
  })

  /** The JSON door: GET reads a view, a body POSTs an action. Asserts the status and returns the JSON. */
  async function api(path, cookie, body, status = 200) {
    const response = await raw(`/api/gasket/${path.replace(/^\//, '')}`, { cookie, body })
    const text = await response.text()
    assert.equal(response.status, status, `${path}: ${response.status} ${text.slice(0, 400)}`)
    return text ? JSON.parse(text) : null
  }

  /** The HTML form door: returns the redirect target after a 303. */
  async function submit(action, cookie, fields, returnTo = '/app') {
    const form = new FormData()
    form.set('returnTo', returnTo)
    for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) form.append(name, item)
    const response = await raw(`/app/do/${action}`, { cookie, form })
    assert.equal(response.status, 303, `${action}: ${response.status}`)
    return new URL(response.headers.get('location'), origin)
  }

  /** Signs in through the ordinary emailed link, read from the captured provider request. */
  async function signIn(email) {
    assert.equal((await raw('/auth/magic-link', { body: { email, returnTo: '/app' } })).status, 202)
    const token = worker.signInToken(email)
    assert.ok(token, `a sign-in message for ${email}`)
    const confirmed = await raw('/auth/confirm', { body: { token } })
    assert.equal(confirmed.status, 303)
    return confirmed.headers.getSetCookie().map(line => line.split(';')[0]).join('; ')
  }

  /** The owner claims the installation, signs in and confirms first run. */
  async function owner() {
    assert.equal((await raw('/auth/bootstrap', { body: { token: vars.SETUP_TOKEN, displayName: 'Olive Owner' } })).status, 303)
    const cookie = await signIn(vars.OWNER_EMAIL)
    assert.equal((await raw('/setup', { cookie, form: new URLSearchParams({ confirm: 'yes' }) })).status, 303)
    return cookie
  }

  return { origin, scratch: worker.scratch, vars, installation, raw, api, submit, signIn, owner, stop, close, scheduled: worker.scheduled, mails: worker.mails, setMailOutcome: worker.setMailOutcome, setGenerationHook: worker.setGenerationHook, setSaveFault: worker.setSaveFault, getSaveCommits: worker.getSaveCommits }
}

export const file = (filename, content, type = 'application/octet-stream') => ({ filename, base64: Buffer.from(content).toString('base64'), type })

/** Exercise existing business journeys through documented keyed JSON doors. */
export function exerciseKeyedActions(h, owner, actions, { once = false } = {}) {
  const ordinary = h.api, selected = new Set(actions)
  const exercised = new Set()
  let sequence = 0
  const namespace = randomBytes(8).toString('hex')
  const receipts = []
  h.api = async (path, cookie, body, status = 200) => {
    if (!selected.has(path) || body === undefined || body.preview) return ordinary(path, cookie, body, status)
    // The shared core journey keeps one replay sanity check per action and
    // person. Its remaining business assertions use their original HTTP door.
    const identity = path + ':' + cookie
    if (once && exercised.has(identity)) return ordinary(path, cookie, body, status)
    const headers = { 'idempotency-key': 'synthetic-gasket-journey-' + namespace + '-' + (++sequence) }
    const request = () => h.raw('/api/gasket/v1/' + path, { cookie, body, headers })
    const first = await request(), result = await first.json()
    assert.equal(first.status, status, path + ': ' + JSON.stringify(result))
    if (status === 200) {
      assertOperation(path, result)
      receipts.push({ path, cookie, body, headers, result })
      assert.equal(first.headers.get('idempotency-replayed'), 'false', path)
      const auditor = typeof owner === 'function' ? owner() : owner
      const audit = await ordinary('audit', auditor)
      const replay = await request()
      assert.equal(replay.status, 200, path)
      assert.equal(replay.headers.get('idempotency-replayed'), 'true', path)
      if (['service.create', 'webhook.subscribe', 'webhook.rotate'].includes(path)) {
        const { token: _token, secret: _secret, ...metadata } = result
        assert.deepEqual(await replay.json(), { ...metadata, secretAvailable: false }, path + ' confirms issuance without retaining its one-time secret')
      } else assert.deepEqual(await replay.json(), result, path + ' retains its original result')
      assert.deepEqual(await ordinary('audit', auditor), audit, path + ' replay adds no business or audit effect')
      exercised.add(identity)
    }
    return result
  }
  return receipts
}

const specification = JSON.parse(readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'))
function validate(schema, actual, path) {
  if (schema.$ref) return validate(specification.components.schemas[schema.$ref.split('/').at(-1)], actual, path)
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(choice => { try { validate(choice, actual, path); return true } catch { return false } })
    assert.equal(matches.length, 1, path + ' matches exactly one documented response')
  }
  if (Object.hasOwn(schema, 'const')) assert.deepEqual(actual, schema.const, path + ' matches its documented value')
  if (schema.type) {
    const types = [schema.type].flat()
    assert.ok(types.some(type => type === 'null' ? actual === null : type === 'array' ? Array.isArray(actual) : type === 'integer' ? Number.isSafeInteger(actual) : type === 'object' ? actual !== null && typeof actual === 'object' && !Array.isArray(actual) : typeof actual === type), path + ' matches its published type')
  }
  if (schema.enum) assert.ok(schema.enum.includes(actual), path + ' matches its published choices')
  if (actual && !Array.isArray(actual) && typeof actual === 'object') {
    for (const key of schema.required ?? []) assert.ok(Object.hasOwn(actual, key), path + '.' + key + ' is present')
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (Object.hasOwn(actual, key)) validate(child, actual[key], path + '.' + key)
  }
  if (Array.isArray(actual) && schema.items) for (const [index, child] of actual.entries()) validate(schema.items, child, path + '[' + index + ']')
}

export function assertDocumented(name, value) {
  validate(specification.components.schemas[name], value, name)
}

export function assertOperation(action, value) {
  const schema = specification.paths['/' + action]?.post.responses['200'].content[['application', 'json'].join('/')].schema
  assert.ok(schema, action + ' publishes its successful response')
  validate(schema, value, action)
}
