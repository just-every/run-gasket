// REPORT-009: live, source-linked quality findings; a read never changes evidence.
import type { Bindings } from '../auth.server'
import { can, requireCapability, type Actor } from './actor'
import { all, insist, now, one, sha256Hex } from './core'
import { METRIC_DEFINITIONS, currentMetricDefinitions } from './metric-definitions'
import { meterState } from './meters'
import { reliability } from './reliability'

export async function metrics(env: Bindings, actor: Actor, url: URL) {
  requireCapability(actor, 'board.read')
  const requested = url.searchParams.get('version')
  insist(!requested || /^\d+$/.test(requested), 'metric_version_not_found', 404)
  const catalog = requested ? METRIC_DEFINITIONS.filter(row=>row.version===Number(requested)) : currentMetricDefinitions()
  insist(catalog.length, 'metric_version_not_found', 404)
  const id = url.searchParams.get('metric')
  const permitted = catalog.filter(row => !row.requiredCapability || can(actor,row.requiredCapability))
  const definitions = id ? permitted.filter(row => row.id === id) : permitted
  insist(definitions.length, 'metric_not_found', 404)
  const report = await reliability(env, actor, url)
  const [history, findings, meters, movements, imports, uncosted, audit] = await Promise.all([
    all(env, 'SELECT h.*,a.tag FROM gk_work_history h JOIN gk_assets a ON a.id=h.asset_id ORDER BY h.id'),
    all(env, 'SELECT f.id,f.work_order_id,w.number FROM gk_findings f JOIN gk_work_orders w ON w.id=f.work_order_id WHERE f.failure_mode IS NULL ORDER BY f.id'),
    all(env, "SELECT m.*,a.tag FROM gk_meters m JOIN gk_assets a ON a.id=m.asset_id WHERE m.kind='counter' ORDER BY m.id"),
    all(env, `SELECT mv.id,mv.part_id,mv.kind,mv.quantity_milli,mv.at,p.number,p.name,p.unit FROM gk_stock_moves mv JOIN gk_parts p ON p.id=mv.part_id WHERE mv.value_cents IS NULL OR (mv.kind='receive' AND mv.unit_price_cents IS NULL AND mv.catalog_item_id IS NULL) ORDER BY mv.id`),
    all(env, 'SELECT j.id,j.state,j.error,q.reviewed_json,q.recorded_at FROM ik_jobs j LEFT JOIN gk_import_quality q ON q.job_id=j.id WHERE j.destination=? AND j.state NOT IN (?,?) ORDER BY j.id', 'register', 'undone', 'rolled_back'),
    all(env, 'SELECT w.id,w.number,w.status FROM gk_work_orders w WHERE NOT EXISTS(SELECT 1 FROM gk_work_actual_costs c WHERE c.work_order_id=w.id) ORDER BY w.id'),
    one(env, 'SELECT COALESCE(MAX(seq),0) AS sequence,MAX(at) AS latestAt FROM gk_audit'),
  ])
  const counterGaps = []
  for (const meter of meters) {
    const state = await meterState(env, meter.id)
    const good = state.points.filter(point => point.at >= report.window.start && point.at <= report.window.end).toSorted((a,b) => a.at.localeCompare(b.at))
    const latest = state.readings.at(-1)
    const held = state.readings.filter(row => row.standing !== 'good')
    counterGaps.push({ id: meter.id, asset: meter.asset_id, tag: meter.tag, name: meter.name, unit: meter.unit, feedWindowHours: meter.feed_window_hours,
      goodPoints: good.length, from: good[0]?.at ?? null, to: good.at(-1)?.at ?? null,
      latestSourceAt: latest?.taken_on ?? null, latestReceivedAt: latest?.entered_at ?? null,
      held: held.map(row => ({ id: row.id, sourceAt: row.taken_on, receivedAt: row.entered_at, quality: row.quality, standing: row.standing, source: row.source })),
      sourceDoor: `/api/gasket/assets/${meter.asset_id}`, recordDoor: `/app/assets/${meter.asset_id}` })
  }
  const quality = {
    importAccess: can(actor, 'import.run'),
    unmatchedCosts: {
      workWithoutEntries: uncosted.map(row => ({ ...row, sourceDoor: `/api/gasket/work/${row.id}`, recordDoor: `/app/work/${row.id}` })),
      imported: history.filter(row => [row.parts_cents,row.labor_cents,row.other_cents].some(value => value === null)).map(row => ({ id: row.id, sourceRef: row.source_ref, title: row.title, partsCents: row.parts_cents, laborCents: row.labor_cents, otherCents: row.other_cents, sourceDoor: `/api/gasket/assets/${row.asset_id}/history`, recordDoor: `/app/assets/${row.asset_id}` })),
      unpricedMovements: movements.map(row => ({ ...row, title: `${row.number} ${row.name}: ${row.kind} ${(row.quantity_milli / 1000).toFixed(3)} ${row.unit}`, sourceDoor: `/api/gasket/parts/${row.part_id}`, recordDoor: `/app/parts/${row.part_id}` })),
    },
    missingFailureCodes: {
      stops: report.failures.filter(row => !row.failureMode).map(row => ({ ...row, title: `${row.asset.tag} · ${row.reason}`, sourceDoor: `/api/gasket/reliability${url.search}`, recordDoor: `/app/work/${row.work?.id}` })),
      findings: findings.map(row => ({ ...row, sourceDoor: `/api/gasket/work/${row.work_order_id}`, recordDoor: `/app/work/${row.work_order_id}` })),
      history: history.filter(row => !row.failure_mode).map(row => ({ id: row.id, sourceRef: row.source_ref, title: row.title, categories: row.categories, sourceDoor: `/api/gasket/assets/${row.asset_id}/history`, recordDoor: `/app/assets/${row.asset_id}` })),
    },
    counterGaps,
    unresolvedImports: (can(actor, 'import.run') ? imports : []).map(row => ({ id: row.id, state: row.state, error: row.error, reviewed: row.reviewed_json ? JSON.parse(row.reviewed_json) : null,
      coverage: row.reviewed_json ? 'Reviewed omissions retained; source gaps are not cleared by successful apply.' : 'Legacy import: reviewed omissions were not retained; completeness is unknown.',
      sourceDoor: '/api/gasket/imports', recordDoor: '/app/move-in' })),
  }
  // Content identity excludes the wall clock: refreshing unchanged inputs is reproducible.
  const inputFingerprint = await sha256Hex(JSON.stringify({ audit, quality, definitions }))
  return { version: 1, computedAt: now(), site: report.site, from: report.from, to: report.to, window: report.window,
    sourceRevision: audit.sequence, latestChangeAt: audit.latestAt, inputFingerprint, definitions, quality,
    coverage: { failures: report.failures.length, planned: report.plannedStops.length, mtbf: report.mtbf, mttr: report.mttr, mtta: report.mtta, assets: report.assets },
    sources: [...new Set(definitions.map(row => row.sourceDoor))],
    policy: 'Computed on read from retained source records. Missing inputs stay unknown; unresolved work and imports remain visible. Corrections append evidence; they never remove original history. Definitions are immutable numbered versions; a later formula must add a new version and retain earlier ones.' }
}
