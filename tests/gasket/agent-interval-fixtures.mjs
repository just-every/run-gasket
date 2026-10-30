import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

/** Disposable native records, built through the same authenticated maintenance doors. */
export default async function prepare({ request, origin, cookie, now }) {
  const api = async (path, body) => {
    const response = await request(new URL(`/api/gasket/${path}`, origin).href, {
      method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: { Cookie: cookie, Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    assert.equal(response.status, 200, `Native interval fixture ${path}`)
    return response.json()
  }
  const shift = n => new Date(now + n * 86400000).toISOString().slice(0, 10)
  const assets = []
  for (let i = 0; i < 2; i++) assets.push((await api('asset.create', {
    tag: `synthetic-gasket-${randomUUID()}`, name: 'Synthetic interval comparison asset', location: 'Workshop', category: 'Compressor',
  })).id)
  const checklist = (await api('checklist.create', { name: `Synthetic inspection ${randomUUID()}`, items: ['Inspect bearing'] })).id
  const schedule = (await api('schedule.create', { asset: assets[0], checklist, title: 'Synthetic bearing maintenance', everyDays: 30, firstDue: shift(30) })).id
  for (const source of ['oem', 'legal', 'site']) await api('interval.limit', {
    schedule, source, revision: 0, minDays: 7, maxDays: 60, reference: 'Synthetic declared maintenance bound',
  })
  return { values: { interval: { schedule, everyDays: '14', from: shift(-4), to: shift(-2), peers: assets[1], rollbackPlan: 'Review the retained comparison and restore the prior cadence if outcomes worsen.' } } }
}
