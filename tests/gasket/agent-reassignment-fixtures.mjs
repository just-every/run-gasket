import prepareRetirement from './agent-field-retirement.mjs'
import assert from 'node:assert/strict'

/** Conformance preparation uses only current native doors; each phase receives fresh work. */
export default async function prepare(context) {
  const { request, origin, cookie, now } = context
  const retirement = await prepareRetirement(context)
  const api = async (path, body) => {
    const response = await request(new URL(`/api/gasket/${path}`, origin).href, { method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.equal(response.status, 200, `reassignment fixture ${path}`)
    return response.json()
  }
  const owner = await api('me')
  const due = new Date(now - 10 * 86400000).toISOString().slice(0, 10)
  const work = await api('workorder.create', { location: 'Synthetic workshop', title: 'Synthetic overdue reassignment', due, unassigned: true })
  const proposal = await api('proposal.prepare', { kind: 'reassign', reasoning: 'Overdue inspection needs an accountable assignee.', payload: { workOrder: work.id, assignee: owner.id, note: 'Owner coordinates the next inspection.' } })
  const saved = (await api('proposals')).find(row => row.id === proposal.id)
  return { values: { ...retirement.values, reassignment: { proposal: proposal.id, hash: proposal.hash, source: saved.source, workOrder: work.id } } }
}
