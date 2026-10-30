// Runs the built Worker (dist/) in Miniflare with its own migrated D1, at a
// production HTTPS origin so sign-in mail goes through the real Resend adapter.
// The only fake is the network edge. An explicit outbound callback can qualify
// a real provider; ordinary journeys capture requests without external effects.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formSaveGate } from './gasket/form-save-gate.mjs'
import { reportGenerationGate } from './gasket/report-generation-gate.mjs'
import { pmAttemptGate } from './gasket/pm-attempt-gate.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(await realpath(join(root, 'node_modules/wrangler/package.json')))
const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = require('miniflare')
const { unstable_splitSqlQuery: splitSql } = require('wrangler')

/**
 * With `installation`, the Worker runs on that local installation's D1 (already migrated) and leaves it in place.
 * With `offset` (ms), the Worker's clock runs that far from the machine's: an entry module replaces Date before the
 * built Worker loads, so the test, not the hour it happens to run at, decides what day it is.
 */
export async function emittedWorker(vars, { installation, offset, instant, outbound, generationGate = false, formSaveFault = false, pmGate = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'gasket-worker-'))
  const config = JSON.parse(await readFile(join(root, 'dist/server/wrangler.json'), 'utf8'))
  let origin = 'https://127.0.0.1'
  const mails = []
  let mailOutcome = 'accepted'
  let saveFault = false
  let saveFaultStep = 1
  let saveCommits = 0
  let generationHook
  let pmHook
  const bindings = { AUTH_ORIGIN: origin, AUTH_LOCAL: 'false', MAIL_PROVIDER: 'resend', MAIL_FROM: 'Gasket <auth@example.test>', MAIL_API_KEY: 'test-only-key', ...vars }
  const modules = [config.main, ...(await readdir(join(root, 'dist/server/assets'))).filter(file => file.endsWith('.js')).map(file => `assets/${file}`)]
    .map(file => ({ type: 'ESModule', path: join(root, 'dist/server', file) }))
  if (offset !== undefined || instant !== undefined) modules.unshift(
    { type: 'ESModule', path: join(root, 'dist/server/pinned-entry.mjs'), contents: `import './pinned-clock.mjs'\nexport * from './${config.main}'\n${pmGate?`import worker from './${config.main}'\n${pmAttemptGate}`:formSaveFault?`import worker from './${config.main}'\n${formSaveGate}`:generationGate?`import worker from './${config.main}'\n${reportGenerationGate}`:`export { default } from './${config.main}'`}\n` },
    { type: 'ESModule', path: join(root, 'dist/server/pinned-clock.mjs'), contents: `const Real = Date, offset = ${offset ?? 0}\nglobalThis.__gasketInstant = ${instant ?? "undefined"}\nclass PinnedDate extends Real { constructor(...args) { super(...(args.length ? args : [globalThis.__gasketInstant ?? Real.now() + offset])) } static now() { return globalThis.__gasketInstant ?? Real.now() + offset } }\nglobalThis.Date = PinnedDate\n` })
  const options = () => ({
    ...convertV4MiniflareOptions({
      host: '127.0.0.1', port: 0, https: true, unsafeTriggerHandlers: true, modulesRoot: join(root, 'dist/server'),
      modules,
      compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      assets: { directory: join(root, 'dist/client'), routerConfig: { has_user_worker: true } },
      d1Databases: { DB: installation ? config.d1_databases[0].database_id : 'gasket-test' },
      bindings,
      outboundService: async request => {
        if(pmGate&&request.url.startsWith('https://synthetic-gasket.invalid/pm-attempt?phase=')){if(pmHook)await pmHook(new URL(request.url).searchParams.get('phase'));return new Response(null,{status:204})}
        if(formSaveFault&&request.url.startsWith('https://synthetic-gasket.invalid/form-save?phase=')){const phase=new URL(request.url).searchParams.get('phase');if(phase==='after')saveCommits++;const fail=saveFault===phase && --saveFaultStep===0;if(fail)saveFault=false;return new Response(null,{status:fail?503:204})}
        if(generationGate&&request.url==='https://synthetic-gasket.invalid/report-generation'){if(generationHook)await generationHook();return new Response(null,{status:204})}
        if (request.url === 'https://api.sendgrid.com/v3/mail/send') {
          const body = await request.clone().json()
          mails.push({ ...body, to: body.personalizations[0].to.map(r => r.email), text: body.content.find(c => c.type === ['text','plain'].join('/'))?.value })
          if (outbound) return await outbound(request)
          return new Response(null, { status: 202, headers: { 'x-message-id': `synthetic-gasket-${mails.length}` } })
        }
        if (outbound && request.url !== 'https://api.resend.com/emails') return await outbound(request)
        if (request.url !== 'https://api.resend.com/emails') throw new Error(`Unexpected test network destination ${new URL(request.url).origin}`)
        mails.push(await request.json())
        if (mailOutcome === 'rejected') return Response.json({ message: 'Test provider refused the request' }, { status: 400 })
        if (mailOutcome === 'uncertain') return new Response('Test upstream unavailable', { status: 503 })
        return Response.json({ id: `test-receipt-${mails.length}` })
      },
    }),
    log: new Log(LogLevel.WARN),
    resourcePersistencePath: installation ? join(installation, '.wrangler/state/v3') : join(directory, 'state'),
  })
  const mf = new Miniflare(options())
  const close = async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }) }
  try {
    // Bind atomically: a probe that closes a free socket cannot reserve its port.
    // Miniflare retains this live port across setOptions({ port: 0 }); configure
    // auth from that address before making requests or exposing the harness.
    origin = (await mf.ready).origin
    bindings.AUTH_ORIGIN = vars.AUTH_ORIGIN ?? origin
    await mf.setOptions(options())
    assert.equal((await mf.ready).origin, origin, 'auth configuration retains the live Worker listener')
    if (installation) return worker()
    const db = await mf.getD1Database('DB')
    for (const file of (await readdir(join(root, 'migrations/core'))).filter(file => file.endsWith('.sql')).sort()) {
      for (const statement of splitSql(await readFile(join(root, 'migrations/core', file), 'utf8'))) await db.prepare(statement).run()
    }
  } catch (error) { await close(); throw error }
  return worker()

  function worker() { return { origin, scratch: directory, mails, setMailOutcome: value => { mailOutcome = value }, setGenerationHook: value => { generationHook=value }, setPMHook: value => { pmHook=value }, setClockInstant: value => mf.dispatchFetch(`${origin}/cdn-cgi/gasket-test-clock?instant=${value}`), setSaveFault: (phase='after', step=1) => { saveFault=phase; saveFaultStep=step; saveCommits=0 }, getSaveCommits: () => saveCommits, request, scheduled, signInToken, close } }

  /** One Cron Trigger event, as Cloudflare delivers it, at `at` (ms; default the Worker's now). */
  async function scheduled(cron, at = instant ?? Date.now() + (offset ?? 0)) {
    // Dispatch a real scheduled event without the synchronous proxy bridge,
    // which can deadlock when the receiver is a Node network-edge callback.
    const query = new URLSearchParams({ cron, time: String(at), format: 'json' })
    const response = await mf.dispatchFetch(`${origin}/cdn-cgi/local/scheduled?${query}`)
    const result = await response.json()
    if (!response.ok || result.outcome !== 'ok') throw new Error(`Scheduled event failed: ${result.outcome}`)
    return result
  }

  /** One request to the Worker. Form bodies are encoded here, so every body reaches it as bytes. */
  async function request(path, init = {}) {
    let { body, headers = {} } = init
    if (body instanceof FormData || body instanceof URLSearchParams) {
      const encoded = new Request(origin, { method: 'POST', body })
      headers = { ...headers, 'content-type': encoded.headers.get('content-type') }
      body = await encoded.arrayBuffer()
    }
    return mf.dispatchFetch(origin + path, { ...init, headers, body })
  }

  /** The sign-in link in the newest mail to this address. */
  function signInToken(email) {
    const mail = mails.findLast(message => [message.to].flat().some(to => to.includes(email)))
    const link = mail?.text?.match(/https:\/\/\S+/)?.[0]
    return link ? new URL(link).searchParams.get('token') : null
  }
}
