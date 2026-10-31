// Runs the built Worker (dist/) on a local installation's D1 and drives it only
// through public HTTP doors: the JSON door, the form door, pages and downloads.
// Given an installation (a restored one) and its configuration, it runs on that.
// Every Worker runs on the flows' pinned clock (clock.mjs).
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { emittedWorker } from '../emitted-worker.mjs'
import { offset } from './clock.mjs'
import { installation as newInstallation } from './installation.mjs'

export async function harness({ vars, bindings = {}, installation, clockOffset = offset, clockInstant, outbound, generationGate, formSaveFault, pmGate, proposalGate, dependencyGate } = {}) {
  const secret = () => randomBytes(32).toString('base64url')
  vars ??= { OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: secret(), SETUP_TOKEN: secret() }
  vars = { ...vars, ...bindings }
  const owned = !installation
  if (owned) { installation = await newInstallation(); await installation.migrate() }
  const worker = await emittedWorker(vars, { installation: installation.root, offset: clockOffset, instant: clockInstant, outbound, generationGate, formSaveFault, pmGate, proposalGate, dependencyGate }), origin = worker.origin
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

  return { origin, scratch: worker.scratch, vars, installation, clockOffset, clockInstant, raw, api, submit, signIn, owner, stop, close, scheduled: worker.scheduled, setDependencyHook: worker.setDependencyHook, mails: worker.mails, setMailOutcome: worker.setMailOutcome, setGenerationHook: worker.setGenerationHook, setPMHook: worker.setPMHook, setProposalHook: worker.setProposalHook, setClockInstant: worker.setClockInstant, setSaveFault: worker.setSaveFault, getSaveCommits: worker.getSaveCommits }
}

export const file = (filename, content, type = 'application/octet-stream') => ({ filename, base64: Buffer.from(content).toString('base64'), type })
