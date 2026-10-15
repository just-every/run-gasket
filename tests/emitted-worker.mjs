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

export async function emittedWorker(vars) {
  const directory = await mkdtemp(join(tmpdir(), 'gasket-worker-'))
  const config = JSON.parse(await readFile(join(root, 'dist/server/wrangler.json'), 'utf8'))
  const port = await freePort(), origin = `https://127.0.0.1:${port}`
  const mails = []
  const bindings = { AUTH_ORIGIN: origin, AUTH_LOCAL: 'false', MAIL_PROVIDER: 'resend', MAIL_FROM: 'Gasket <auth@example.test>', MAIL_API_KEY: 'test-only-key', ...vars }
  const modules = [config.main, ...(await readdir(join(root, 'dist/server/assets'))).filter(file => file.endsWith('.js')).map(file => `assets/${file}`)]
  const mf = new Miniflare({
    ...convertV4MiniflareOptions({
      host: '127.0.0.1', port, https: true, modulesRoot: join(root, 'dist/server'),
      modules: modules.map(file => ({ type: 'ESModule', path: join(root, 'dist/server', file) })),
      compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      assets: { directory: join(root, 'dist/client'), routerConfig: { has_user_worker: true } },
      d1Databases: { DB: 'gasket-test' },
      bindings,
      outboundService: async request => {
        if (request.url !== 'https://api.resend.com/emails') throw new Error(`Unexpected test network destination ${new URL(request.url).origin}`)
        mails.push(await request.json())
        return Response.json({ id: `test-receipt-${mails.length}` })
      },
    }),
    log: new Log(LogLevel.WARN),
    resourcePersistencePath: join(directory, 'state'),
  })
  const close = async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }) }
  try {
    await mf.ready
    const db = await mf.getD1Database('DB')
    for (const file of (await readdir(join(root, 'migrations/core'))).filter(file => file.endsWith('.sql')).sort()) {
      for (const statement of splitSql(await readFile(join(root, 'migrations/core', file), 'utf8'))) await db.prepare(statement).run()
    }
  } catch (error) { await close(); throw error }

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

  return { origin, mails, request, signInToken, close }
}
