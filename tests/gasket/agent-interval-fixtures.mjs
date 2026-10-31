import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

/** Fresh native proposals let every declared commitment conformance phase execute once. */
export default async function prepare({ request, origin, cookie, now }) {
  const api = async (path, body) => {
    const response = await request(new URL(`/api/gasket/${path}`, origin).href, { method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.equal(response.status, 200, `interval fixture ${path}`)
    return response.json()
  }
  const label = `synthetic-gasket-${randomUUID()}`, category = label
  const assets = []
  for (let index = 0; index < 2; index++) assets.push((await api('asset.create', { tag: `${label}-${index}`, name: 'Synthetic compressor', location: 'Workshop', category })).id)
  const checklist = (await api('checklist.create', { name: label, items: ['Inspect bearing'] })).id
  const day = n => new Date(now + n * 86400000).toISOString().slice(0,10)
  const schedule = (await api('schedule.create', { asset: assets[0], checklist, title: 'Synthetic constrained interval', everyDays: 30, firstDue: day(30) })).id
  for (const source of ['oem','legal','site']) await api('interval.limit', { schedule, source, revision: 0, minDays: 7, maxDays: 60, reference: 'Synthetic declared maintenance bound' })
  const proposal = await api('proposal.prepare', { kind: 'interval', reasoning: 'Shorten conservatively while exposure is unknown.', payload: {
    schedule, everyDays: '14', from: day(-2), to: day(-1), peers: assets[1], rollbackPlan: 'A human may restore after reviewing future failures.',
  } })
  const saved = (await api('proposals')).find(row => row.id === proposal.id)
  return { values: { interval: { proposal: proposal.id, hash: proposal.hash, source: saved.source, schedule } } }
}
