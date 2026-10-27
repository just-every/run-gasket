// Runs the built Worker (dist/) in Miniflare with its own migrated D1, at a
// production HTTPS origin so sign-in mail goes through the real Resend adapter.
// The only fake is the network edge: outbound requests are captured here and
// can never reach a provider.
import { createRequire } from 'node:module'
import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formSaveGate } from './gasket/form-save-gate.mjs'
import { reportGenerationGate } from './gasket/report-generation-gate.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(await realpath(join(root, 'node_modules/wrangler/package.json')))
const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = require('miniflare')
const { unstable_splitSqlQuery: splitSql } = require('wrangler')

async function freePort() {
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const { port } = socket.address()
  await new Promise(resolve => socket.close(resolve))
  return port
}

/**
 * With `installation`, the Worker runs on that local installation's D1 (already migrated) and leaves it in place.
 * With `offset` (ms), the Worker's clock runs that far from the machine's: an entry module replaces Date before the
 * built Worker loads, so the test, not the hour it happens to run at, decides what day it is.
 */
export async function emittedWorker(vars, options = {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await startWorker(vars, options) }
    catch (error) {
      if (error.code !== 'ERR_ADDRESS_IN_USE' || attempt === 3) throw error
      console.log('Worker startup port was claimed; retrying with a fresh port.')
    }
  }
}

async function startWorker(vars, { installation, offset, instant, outbound, generationGate = false, formSaveFault = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'gasket-worker-'))
  const config = JSON.parse(await readFile(join(root, 'dist/server/wrangler.json'), 'utf8'))
  const port = await freePort(), origin = `https://127.0.0.1:${port}`
  const mails = []
  let mailOutcome = 'accepted'
  let saveFault = false
  let saveFaultStep = 1
  let saveCommits = 0
  let generationHook
  const bindings = { AUTH_ORIGIN: origin, AUTH_LOCAL: 'false', MAIL_PROVIDER: 'resend', MAIL_FROM: 'Gasket <auth@example.test>', MAIL_API_KEY: 'test-only-key', ...vars }
  const modules = [config.main, ...(await readdir(join(root, 'dist/server/assets'))).filter(file => file.endsWith('.js')).map(file => `assets/${file}`)]
    .map(file => ({ type: 'ESModule', path: join(root, 'dist/server', file) }))
  if (offset !== undefined || instant !== undefined) modules.unshift(
    { type: 'ESModule', path: join(root, 'dist/server/pinned-entry.mjs'), contents: `import './pinned-clock.mjs'\nexport * from './${config.main}'\n${formSaveFault?`import worker from './${config.main}'\n${formSaveGate}`:generationGate?`import worker from './${config.main}'\n${reportGenerationGate}`:`export { default } from './${config.main}'`}\n` },
    { type: 'ESModule', path: join(root, 'dist/server/pinned-clock.mjs'), contents: `const Real = Date, offset = ${offset ?? 0}, instant = ${instant ?? "undefined"}\nclass PinnedDate extends Real { constructor(...args) { super(...(args.length ? args : [instant ?? Real.now() + offset])) } static now() { return instant ?? Real.now() + offset } }\nglobalThis.Date = PinnedDate\n` })
  const mf = new Miniflare({
    ...convertV4MiniflareOptions({
      host: '127.0.0.1', port, https: true, unsafeTriggerHandlers: true, modulesRoot: join(root, 'dist/server'),
      modules,
      compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      assets: { directory: join(root, 'dist/client'), routerConfig: { has_user_worker: true } },
      d1Databases: { DB: installation ? config.d1_databases[0].database_id : 'gasket-test' },
      bindings,
      outboundService: async request => {
        if(formSaveFault&&request.url.startsWith('https://synthetic-gasket.invalid/form-save?phase=')){const phase=new URL(request.url).searchParams.get('phase');if(phase==='after')saveCommits++;const fail=saveFault===phase && --saveFaultStep===0;if(fail)saveFault=false;return new Response(null,{status:fail?503:204})}
        if(generationGate&&request.url==='https://synthetic-gasket.invalid/report-generation'){if(generationHook)await generationHook();return new Response(null,{status:204})}
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
  const close = async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }) }
  try {
    await mf.ready
    if (installation) return worker()
    const db = await mf.getD1Database('DB')
    for (const file of (await readdir(join(root, 'migrations/core'))).filter(file => file.endsWith('.sql')).sort()) {
      for (const statement of splitSql(await readFile(join(root, 'migrations/core', file), 'utf8'))) await db.prepare(statement).run()
    }
  } catch (error) { await close(); throw error }
  return worker()

  function worker() { return { origin, mails, setMailOutcome: value => { mailOutcome = value }, setGenerationHook: value => { generationHook=value }, setSaveFault: (phase='after', step=1) => { saveFault=phase; saveFaultStep=step; saveCommits=0 }, getSaveCommits: () => saveCommits, request, scheduled, signInToken, close } }

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
