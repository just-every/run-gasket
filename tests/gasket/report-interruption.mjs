import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { harness } from './harness.mjs'

// Kill the actual Worker process group while generation is suspended after its durable claim.
export async function interruptClaim(h, cookie, store, instant, schedule) {
  const vars = h.vars
  await h.stop()
  const child = fork(fileURLToPath(import.meta.url), ['--child'], { detached: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  let scratch
  const exited = new Promise(resolve => child.once('exit', resolve))
  try {
    const claimed = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('interruption barrier timed out')), 60_000)
      child.once('error', reject)
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`claim process exited ${code}`)) })
      child.on('message', message => {
        if (message.scratch) scratch = message.scratch
        if (message.claimed) { clearTimeout(timer); resolve(message.claimed) }
      })
      child.send({ vars, root: store.root, instant, schedule, cookie })
    })
    assert.deepEqual(claimed.map(d => [d.state, d.finished_at, d.provider_message_id]), [['unconfirmed', null, null]])
  } finally {
    try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    await exited
    if (scratch) await rm(scratch, { recursive: true, force: true })
  }
  const restarted = await harness({ installation: store, vars, clockInstant: instant, generationGate: true })
  try {
    await restarted.scheduled('*/15 * * * *', instant)
    await restarted.scheduled('*/15 * * * *', instant + 60_000)
    const rows = (await restarted.api('report-schedules', cookie)).deliveries.filter(d => d.schedule_id === schedule)
    assert.deepEqual(rows.map(d => [d.state, d.finished_at, d.provider_message_id]), [['unconfirmed', null, null]], 'interrupted claims stay visible after restart')
    assert.equal(restarted.mails.filter(m => m.subject === 'Gasket report: Interrupted pack').length, 0, 'restart never resubmits an unconfirmed claim')
    assert.match(await (await restarted.raw('/app/settings/reports', { cookie })).text(), /Reconcile this attempt before authorizing another submission/)
    return restarted
  } catch (error) { await restarted.close(); throw error }
}

if (process.argv.includes('--child')) process.once('message', async ({ vars, root, instant, schedule, cookie }) => {
  const worker = await harness({ installation: { root }, vars, clockInstant: instant, generationGate: true })
  process.send({ scratch: worker.scratch })
  worker.setGenerationHook(async () => {
    const claimed = (await worker.api('report-schedules', cookie)).deliveries.filter(d => d.schedule_id === schedule)
    if (!claimed.length) return
    process.send({ claimed })
    await new Promise(() => {})
  })
  await worker.scheduled('*/15 * * * *', instant)
  throw new Error('interrupted report unexpectedly completed')
})
