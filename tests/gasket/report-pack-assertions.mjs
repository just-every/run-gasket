import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

// Compare exported metadata with independent public reads and retained audit events.
export async function assertPack(h, cookie, pack, expected, pdfText) {
  const { kind, filters, recipient, role, at, from, to, revision, latestChangeAt = at } = expected
  const query = new URLSearchParams({ ...filters, from, to })
  const metrics = await h.api(`metrics?${new URLSearchParams({from,to})}`, cookie)
  const definitions = metrics.definitions.filter(d => kind === 'history' ? d.id === 'history.events' : d.sourceDoor === `/api/gasket/${kind}`)
  assert.ok(definitions.length > 0, `${kind} has source definitions`)
  assert.deepEqual(pack.metadata.definitions, definitions, 'every versioned definition and its formula, exclusions and freshness survive export')
  assert.deepEqual(pack.metadata.period, { from, to })
  assert.equal(pack.metadata.report, kind)
  assert.equal(pack.metadata.generatedAt, at)
  assert.equal(pack.metadata.zone, 'America/New_York')
  if (!Object.keys(filters).length) assert.deepEqual(pack.metadata.scope.filters, {}, 'unfiltered packs preserve the explicit empty filter object')
  assert.deepEqual(pack.metadata.scope, {
    site: 'Great Lakes report plant', filters, role, recipient,
    policy: 'Current report access only. No original files or individual labor rates.',
  })
  assert.equal(pack.metadata.sourceRevision, revision)
  assert.equal(pack.metadata.latestChangeAt, latestChangeAt)
  assert.match(pack.metadata.freshness, /retained records/)
  assert.match(pack.metadata.freshness, /external source completeness is not implied/)
  assert.equal(pack.metadata.sourceDoor, `/api/gasket/${kind}?${query}`)
  const dashboard = `${kind === 'history' ? `/app/assets/${filters.asset}` : `/app/${kind === 'valuation' ? 'parts' : kind}`}?${query}`
  assert.equal(pack.metadata.dashboard, dashboard)
  assert.equal((await h.raw(dashboard, { cookie })).status, 200, 'the exported dashboard link opens the saved period and scope')
  assert.deepEqual(pack.sourceQuality.quality, metrics.quality, 'site-wide context retains every authorized finding')
  assert.equal(pack.sourceQuality.policy, metrics.policy)
  assert.match(pack.sourceQuality.scope, /Site-wide/)
  assert.equal(pack.sourceQuality.quality.importAccess, role === 'owner')
  if (role !== 'owner') assert.deepEqual(pack.sourceQuality.quality.unresolvedImports, [], 'restricted import details are absent')
  const fingerprint = createHash('sha256').update(JSON.stringify({
    data: pack.data, filters, zone: 'America/New_York', definitions,
    sourceQuality: pack.sourceQuality, sourceRevision: revision,
  })).digest('hex')
  assert.equal(pack.fingerprint, fingerprint, 'the source fingerprint covers data, filters, clock, definitions, quality and revision')
  if (pdfText) {
    const readable = pdfText.replace(/\s/g, '')
    for (const value of [kind, from, to, new Date(at).toISOString(), role, dashboard, String(revision), fingerprint, pack.metadata.freshness, pack.sourceQuality.scope]) {
      assert.ok(readable.includes(value.replace(/\s/g, '')), `readable PDF retains metadata ${value}`)
    }
    for (const [key, value] of Object.entries({report:kind,generatedAt:at,zone:'America/New_York',sourceRevision:revision,latestChangeAt,freshness:pack.metadata.freshness,dashboard,sourceDoor:pack.metadata.sourceDoor})) {
      assert.ok(readable.includes(`$["metadata"][${JSON.stringify(key)}]:${value}`.replace(/\s/g,'')), `PDF metadata ${key} retains its own value`)
    }
    for (const [key,value] of Object.entries({from,to})) assert.ok(readable.includes(`$["metadata"]["period"]["${key}"]:${value}`),'PDF retains the reporting boundary at its own path')
    for (const [key,value] of Object.entries(pack.metadata.scope).filter(([key])=>key!=='filters')) assert.ok(readable.includes(`$["metadata"]["scope"]["${key}"]:${value}`.replace(/\s/g,'')),`PDF scope ${key} matches the independently reconciled CSV`)
    if(Object.keys(filters).length)for(const [key,value]of Object.entries(filters))assert.ok(readable.includes(`$["metadata"]["scope"]["filters"]["${key}"]:${value}`),'PDF retains each saved filter at its own scope path')
    else assert.ok(readable.includes('$["metadata"]["scope"]["filters"]:emptyobject'),'PDF explicitly retains an unfiltered scope')
    assert.ok(readable.includes(`$["fingerprint"]:${fingerprint}`),'PDF fingerprint retains its own value')
    for (const [index, definition] of definitions.entries()) for (const key of ['id', 'name', 'version', 'formula', 'eventTime', 'exclusions', 'freshness', 'sourceDoor']) {
      assert.ok(readable.includes(`$["metadata"]["definitions"]["${index}"][${JSON.stringify(key)}]:${definition[key]}`.replace(/\s/g,'')), `readable PDF retains ${definition.id} ${key} at its own path`)
    }
  }
}
