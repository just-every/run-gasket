// Test-host operator observation. Retain only Base's admission diagnostics,
// never request headers, cookies, bodies or the tail's private WebSocket URL.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const account = process.env.CLOUDFLARE_ACCOUNT_ID
if (account !== 'b20c0ca9cab0c2b70e13d7cf724b89bd') throw Error('wrong-account')
const out = process.argv[2]
mkdirSync(out, { recursive: true })
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/gasket-demo-test--demo/tails`
const headers = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' }
const response = await fetch(endpoint, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(15000) })
const created = await response.json()
if (!response.ok || !created.success) throw Error(`tail-create-failed-${response.status}`)
const tail = created.result
let socket, connected = false, interrupted = false
const admissions = []
const startedAt = new Date().toISOString()
try {
  socket = new WebSocket(tail.url, 'trace-v1')
  socket.binaryType = 'arraybuffer'
  socket.addEventListener('message', message => {
    try {
      const event = JSON.parse(typeof message.data === 'string' ? message.data : new TextDecoder().decode(message.data))
      for (const log of event.logs ?? []) for (const part of log.message ?? []) {
        let row
        try { row = JSON.parse(part) } catch { continue }
        if (row.event !== 'demo_admitted') continue
        const admission = { at: row.at, correlation: row.correlation, agent: row.agent, network: row.network }
        admissions.push(admission)
        appendFileSync(join(out, 'admissions.jsonl'), JSON.stringify(admission) + '\n')
      }
    } catch { interrupted = true }
  })
  socket.addEventListener('close', () => { interrupted = true })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('tail-connect-timeout')), 15000)
    socket.addEventListener('open', () => { clearTimeout(timer); connected = true; resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('tail-connect-failed')) }, { once: true })
  })
  console.log('Observing the test host for 15 minutes; no harness visitors are running.')
  await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000))
  const summary = { startedAt, endedAt: new Date().toISOString(), connected, interrupted, admissions, quiet: !interrupted && admissions.length === 0 }
  writeFileSync(join(out, 'window.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify(summary))
  if (!summary.quiet) process.exitCode = 1
} finally {
  socket?.close()
  const removed = await fetch(`${endpoint}/${tail.id}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(15000) })
  if (!removed.ok) throw Error(`tail-remove-failed-${removed.status}`)
  await removed.arrayBuffer()
}
// Node's native WebSocket can retain a provider socket after close; the tail
// has been removed and all evidence is synchronous, so release that handle now.
process.exit(process.exitCode ?? 0)
