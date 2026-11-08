import {queuedEntrypoint} from '@runeditrun/rer/queued-entry';
const queued=await queuedEntrypoint(import.meta.url,'verify:runtime');if(queued!==null)process.exit(queued);
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
// The installed homepage reads the claim state from D1: run the emitted Worker
// on its own migrated store, never the checkout's local data.
const persist = await mkdtemp(join(tmpdir(), 'foundation-runtime-'))
// Migration progress grows with the schema; stream it rather than exceeding
// execFileSync's default 1 MiB capture buffer before any runtime assertion runs.
execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'foundation', '--local', '--persist-to', persist, '--config', 'dist/server/wrangler.json'], { stdio: 'inherit', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } })
const origin = `http://127.0.0.1:${port}`
// Private routes use the same configured native auth as an installed origin.
const envFile = join(persist, '.env')
await writeFile(envFile, Object.entries({
  AUTH_ORIGIN: origin, AUTH_LOCAL: 'true',
  OWNER_EMAIL: ['synthetic-gasket-1', 'example.test'].join('@'),
  SESSION_SECRET: randomBytes(32).toString('base64url'),
}).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n'), { mode: 0o600 })
const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--env-file', envFile, '--inspector-port', '0', '--local', '--persist-to', persist, '--ip', '127.0.0.1', '--config', 'dist/server/wrangler.json', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
worker.stdout.on('data', chunk => { output += chunk })
worker.stderr.on('data', chunk => { output += chunk })
try {
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (worker.exitCode !== null) throw new Error(output)
    try { ready = (await fetch(`${origin}/health`)).ok } catch {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(ready, output)
  const health = await (await fetch(`${origin}/health`)).json()
  assert.equal(health.status, 'ok')
  assert.equal(health.ok, true)
  assert.deepEqual(Object.keys(health.deployment ?? {}).sort(), ['fingerprint', 'sourceSha', 'versionId'])
  const document = await fetch(origin)
  assert.equal(document.status, 200)
  const branding = JSON.parse(await readFile(new URL('../src/branding.json', import.meta.url)))
  assert.ok((await document.text()).includes(branding.name))
  for (const path of ['/missing', '/health/extra', '/api', '/api/missing']) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404, path)
  }
  const signedOut = await fetch(`${origin}/app`, { redirect: 'manual', credentials: 'omit' })
  assert.equal(signedOut.status, 303)
  assert.equal(signedOut.headers.get('location'), '/signin?returnTo=%2Fapp')
  assert.equal(new URL(signedOut.headers.get('location'), origin).origin, origin)
  assert.equal(signedOut.headers.get('cache-control'), 'no-store')
  assert.equal(await signedOut.text(), '', 'A signed-out redirect must expose no private workspace content')
  console.log('HTTP-001 passed against emitted local Worker: health, the installed homepage, HTTP and document 404s, signed-out private-page redirect')
} finally {
  worker.kill('SIGTERM')
  await new Promise(resolve => worker.exitCode !== null ? resolve() : worker.once('exit', resolve))
  await rm(persist, { recursive: true, force: true })
  // wrangler dev keeps its scratch (.wrangler/tmp) beside the config it runs, which here is the emitted Worker; the artifact producer refuses that folder in dist/server, so leave the build output as rer build wrote it.
  await rm('dist/server/.wrangler', { recursive: true, force: true })
}
