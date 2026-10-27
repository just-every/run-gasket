// Replay the same public form against isolated copies of its idle pre-save D1.
// Copies are fixture setup only: effects and receipts are read through HTTP.
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { harness } from './harness.mjs'
import { offset } from './clock.mjs'

export async function saveSnapshot(h) {
  const root = await mkdtemp(join(tmpdir(), 'gasket-save-snapshot-'))
  await cp(join(h.installation.root, '.wrangler/state'), join(root, 'state'), { recursive: true })
  return {
    close: () => rm(root, { recursive: true, force: true }),
    async interrupt({ action, fields, cookie, view, steps }) {
      for (let step = 1; step <= steps; step++) {
        const copy = await mkdtemp(join(tmpdir(), 'gasket-save-interruption-'))
        let replica
        try {
          await mkdir(join(copy, '.wrangler'), { recursive: true })
          await cp(join(root, 'state'), join(copy, '.wrangler/state'), { recursive: true })
          replica = await harness({ installation: { root: copy }, vars: h.vars, clockOffset: offset + 86_400_000, formSaveFault: true })
          const id = randomUUID(), form = new FormData()
          for (const [name, value] of fields) if (name !== '__gk_save') form.append(name, typeof value === 'string' ? value : new File([new Uint8Array(value.bytes)], value.name, { type: value.type }))
          form.set('__gk_save', id)
          replica.setSaveFault('after', step)
          const response = await replica.raw(action, { cookie, form, headers: { accept: ['application', 'json'].join('/') } })
          assert.equal(response.status, 500, `${action} interruption after step ${step} reaches the public error door`)
          const failure = await response.json()
          assert.equal(failure.saved, false)
          assert.equal(failure.retry, false, `${action} persisted steps prohibit a blind retry`)
          const committed = replica.getSaveCommits()
          assert.ok(committed >= step, `${action} the requested boundary really committed`)
          assert.match(failure.error, new RegExp(`${committed} save steps persisted before the failure`))
          const receipt = await (await replica.raw(failure.receipt, { cookie, headers: { accept: ['application', 'json'].join('/') } })).json()
          assert.deepEqual([receipt.id, receipt.state, receipt.batches], [id, 'failed', committed], `${action} reports the exact durable boundary`)
          const persisted = await replica.api(view, cookie)
          const replay = await replica.raw(action, { cookie, form, headers: { accept: ['application', 'json'].join('/') } })
          assert.equal(replay.status, 409, `${action} cannot replay a partly saved form`)
          assert.equal((await replay.json()).retry, false)
          assert.deepEqual(await replica.api(view, cookie), persisted, `${action} replay changes no confirmed records`)
          const retained = await (await replica.raw(failure.receipt, { cookie, headers: { accept: ['application', 'json'].join('/') } })).json()
          assert.deepEqual(retained, receipt, `${action} replay preserves its original receipt`)
          console.log(`workspace interruption proof ${action} step=${step} of=${steps} persisted=${receipt.batches} cleanup=${committed-step} replay=refused`)
        } finally {
          await replica?.close()
          await rm(copy, { recursive: true, force: true })
        }
      }
    },
  }
}
