// REPORT-001: source-linked USD costs and separate financial comparisons.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { cell } from './audit'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from './core'
import { isDate, today } from './dates'
import type { Input } from './input'
import { COSTING_METRICS } from './costing-metrics'

export const COSTING_CATEGORIES = ['parts', 'labor', 'contractor', 'tools', 'other'] as const
export const COMPARISON_KINDS = ['estimate', 'commitment', 'posted'] as const
export type CostCategory = typeof COSTING_CATEGORIES[number]
type CostKind = 'actual' | typeof COMPARISON_KINDS[number]
type CostSource = { id: string; workOrderId: string | null; historyId: string | null; assetId: string | null; costCenterId: string | null; kind: CostKind; category: CostCategory; cents: number | null; source: string; note: string; reference: string; recordedAt: number | null; eventDay: string; sourceDoor: string; personId?: string; rateId?: string | null; approvedMinutes?: number; approvedByCategory?: Record<string, number>; contractorMinutes?: number }
const kinds = ['actual', ...COMPARISON_KINDS] as const
const sumKnown = (rows: { cents: number | null }[]) => rows.some(row => row.cents !== null) ? rows.reduce((sum, row) => sum + (row.cents ?? 0), 0) : null

/** Internal aggregate used by the existing lifecycle and failure reports. */
export async function reconciledWorkCostTotals(env: Bindings) {
  return all(env, `SELECT work_order_id, COUNT(*) AS entries, COUNT(cents) AS priced, SUM(cents) AS cents,
    SUM(source IN ('stock_issue','stock_return') AND cents IS NULL) AS unpriced FROM gk_work_actual_costs GROUP BY work_order_id`)
}

/** Work amounts retain the old entries, totalCents and byCategory shape. */
export async function reconciledWorkCosts(env: Bindings, workOrder: string, actor?: Actor) {
  const rows = await all(env, `SELECT c.*, m.name AS by FROM gk_work_actual_costs c LEFT JOIN gk_members m ON m.id=c.recorded_by WHERE c.work_order_id=? ORDER BY c.recorded_at,c.source,c.id`, workOrder)
  const labor = rows.filter(row => row.source === 'approved_labor')
  let entries = rows
  if (actor?.role !== 'owner') entries = [...rows.filter(row => row.source !== 'approved_labor'), ...(labor.length ? [{ id: `approved-labor:${workOrder}`, work_order_id: workOrder, category: 'labor', cents: sumKnown(labor), note: 'Approved labor total', recorded_at: Math.max(...labor.map(row => row.recorded_at)), source: 'approved_labor_total', by: null }] : [])]
  const [recordedComparisons, purchases, time, contractor] = await Promise.all([
    all(env, 'SELECT * FROM gk_cost_comparisons WHERE work_order_id=? ORDER BY recorded_at,id', workOrder),
    all(env, `SELECT c.*,r.order_id,p.number FROM gk_live_purchase_commitments c JOIN gk_purchase_revisions r ON r.id=c.revision_id JOIN gk_purchase_orders p ON p.id=r.order_id WHERE json_extract(r.snapshot,'$.work.id')=? ORDER BY c.booked_on,c.revision_id`, workOrder),
    all(env, "SELECT category,SUM((ended_at-started_at)/60000.0) AS minutes FROM gk_labor_entries WHERE work_order_id=? AND state='approved' GROUP BY category", workOrder),
    one(env, 'SELECT COALESCE(SUM(minutes),0) AS minutes FROM gk_contractor_invoices WHERE work_order_id=?', workOrder),
  ])
  const comparisons = [...recordedComparisons, ...purchases.map(row => ({ id: row.revision_id, work_order_id: workOrder, kind: 'commitment', category: 'other', cents: row.amount_cents, note: `Approved purchase order ${row.number}`, source_reference: row.revision_id, source: 'purchase_commitment', sourceDoor: `/api/gasket/purchase-orders/${row.order_id}`, recorded_at: row.recorded_at }))]
  return { entries, totalCents: sumKnown(rows), byCategory: Object.fromEntries(COSTING_CATEGORIES.map(category => [category, rows.filter(row => row.category === category).reduce((sum, row) => sum + (row.cents ?? 0), 0)])),
    approvedMinutes: time.reduce((sum, row) => sum + row.minutes, 0), approvedByCategory: Object.fromEntries(['wrench', 'travel', 'wait', 'admin'].map(category => [category, time.find(row => row.category === category)?.minutes ?? 0])), contractorMinutes: contractor.minutes,
    unpricedMovements: rows.filter(row => row.cents === null && row.source.startsWith('stock_')).length, approvedLaborEntries: labor.length,
    comparisons: actor?.role === 'owner' ? comparisons : comparisons.map(({ recorded_by, ...row }) => row),
    comparisonTotals: Object.fromEntries(COMPARISON_KINDS.map(kind => [kind, sumKnown(comparisons.filter(row => row.kind === kind))])) }
}

/** Financial comparison corrections append and identify the retained original. */
export async function recordCostComparison(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const work = input.text('workOrder', { max: 100 }), kind = input.text('kind', { max: 20 }) as typeof COMPARISON_KINDS[number], category = input.text('category', { max: 20 }) as CostCategory
  insist(await one(env, 'SELECT id FROM gk_work_orders WHERE id=?', work), 'work_order_not_found', 404)
  insist(COMPARISON_KINDS.includes(kind), 'invalid_cost_kind')
  insist(COSTING_CATEGORIES.includes(category), 'invalid_category')
  const amount = input.text('amount', { max: 16 }).replace(/[$,]/g, '')
  insist(/^-?\d{1,9}(\.\d{1,2})?$/.test(amount), 'invalid_amount')
  const [whole, fraction = ''] = amount.replace('-', '').split('.'), cents = (Number(whole) * 100 + Number(fraction.padEnd(2, '0'))) * (amount.startsWith('-') ? -1 : 1)
  insist(cents !== 0, 'invalid_amount')
  const reference = input.text('reference', { optional: kind !== 'posted', max: 160 }), note = input.text('note', { max: 500 }), corrects = input.text('corrects', { optional: true, max: 100 }) || null
  insist(cents > 0 ? !corrects : !!corrects, 'invalid_cost_correction')
  if (kind === 'commitment') {
    insist(!reference.startsWith('PO:') && !await one(env, 'SELECT id FROM gk_purchase_revisions WHERE id=?', reference), 'use_purchase_commitment_source')
  }
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_cost_comparisons (id,work_order_id,kind,category,cents,source_reference,note,corrects_id,recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, work, kind, category, cents, reference, note, corrects, actor.id, now())],
    { actor: actor.id, action: 'work.cost_comparison', subject: work, detail: { id, kind, category, cents, reference, note, corrects } })
  return { id }
}

/** Work dimensions use stale-write protection and the ordinary audit history. */
export async function setWorkCostCenter(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const work = input.text('workOrder', { max: 100 }), center = input.text('costCenter', { optional: true, max: 100 }) || null, version = input.integer('version', { min: 1, max: 1_000_000 })!
  const previous = await one(env, 'SELECT cost_center_id FROM gk_work_orders WHERE id=?', work)
  insist(previous, 'work_order_not_found', 404)
  insist(!center || await one(env, 'SELECT id FROM gk_cost_centers WHERE id=? AND active=1', center), 'cost_center_not_found', 404)
  await commit(env, [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=?)', work, version),
    ...(center ? [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_cost_centers WHERE id=? AND active=1)', center)] : []),
    stmt(env, 'UPDATE gk_work_orders SET cost_center_id=?,version=version+1 WHERE id=?', center, work)],
  { actor: actor.id, action: 'work.cost_center', subject: work, detail: { from: previous.cost_center_id, to: center, version: version + 1 } })
  return { id: work, version: version + 1 }
}

function summary(rows: CostSource[]) {
  const totals = (entries: CostSource[]) => Object.fromEntries(kinds.map(kind => {
    const selected = entries.filter(row => row.kind === kind)
    return [kind, { cents: sumKnown(selected), sources: selected.length, unknown: selected.filter(row => row.cents === null).length }]
  })) as Record<CostKind, { cents: number | null; sources: number; unknown: number }>
  return { approvedMinutes: rows.reduce((sum, row) => sum + (row.approvedMinutes ?? 0), 0), contractorMinutes: rows.reduce((sum, row) => sum + (row.contractorMinutes ?? 0), 0), approvedByCategory: Object.fromEntries(['wrench', 'travel', 'wait', 'admin'].map(category => [category, rows.reduce((sum, row) => sum + (row.approvedByCategory?.[category] ?? 0), 0)])), amounts: totals(rows), byCategory: Object.fromEntries(COSTING_CATEGORIES.map(category => [category, totals(rows.filter(row => row.category === category))])), sourceIds: rows.map(row => row.id) }
}

/** Retained inputs, scope totals and coverage; summary groups are not additive. */
export async function costingReport(env: Bindings, actor: Actor, url: URL) {
  requireCapability(actor, 'board.read')
  const from = url.searchParams.get('from') || null, to = url.searchParams.get('to') || null
  insist((!from || isDate(from)) && (!to || isDate(to)) && (!from || !to || from <= to), 'invalid_period')
  const selectedAsset = url.searchParams.get('asset') || null, selectedWork = url.searchParams.get('workOrder') || null, selectedCenter = url.searchParams.get('costCenter') || null
  const [assets, works, actuals, comparisons, history, centers, commitments, excludedCommitments, labor, audit, site] = await Promise.all([
    all(env, 'SELECT id,parent_id,tag,name,level FROM gk_assets ORDER BY tag'),
    all(env, 'SELECT id,number,title,status,asset_id,location,cost_center_id,version FROM gk_work_orders ORDER BY number'),
    all(env, `SELECT c.*,l.person_id,l.rate_id,l.category AS labor_category,(l.ended_at-l.started_at)/60000.0 AS approved_minutes,i.minutes AS contractor_minutes FROM gk_work_actual_costs c LEFT JOIN gk_labor_entries l ON c.source='approved_labor' AND l.id=c.id LEFT JOIN gk_contractor_invoices i ON c.source='contractor_invoice' AND i.id=c.id ORDER BY c.recorded_at,c.source,c.id`),
    all(env, 'SELECT * FROM gk_cost_comparisons ORDER BY recorded_at,id'),
    all(env, 'SELECT id,asset_id,source_ref,title,completed_on,created_at,parts_cents,labor_cents,other_cents FROM gk_work_history ORDER BY id'),
    all(env, 'SELECT id,code,name,active FROM gk_cost_centers ORDER BY code'),
    all(env, `SELECT c.*,r.order_id,r.snapshot,p.number FROM gk_live_purchase_commitments c JOIN gk_purchase_revisions r ON r.id=c.revision_id JOIN gk_purchase_orders p ON p.id=r.order_id ORDER BY c.booked_on,c.revision_id`),
    all(env, `SELECT c.revision_id,c.amount_cents,c.booked_on,r.order_id,r.snapshot,CASE WHEN x.id IS NOT NULL THEN 'released' ELSE 'superseded_unsent' END AS exclusion FROM gk_purchase_commitments c JOIN gk_purchase_revisions r ON r.id=c.revision_id LEFT JOIN gk_purchase_commitment_releases x ON x.revision_id=c.revision_id WHERE NOT EXISTS(SELECT 1 FROM gk_live_purchase_commitments live WHERE live.revision_id=c.revision_id) ORDER BY c.revision_id`),
    all(env, 'SELECT id,work_order_id,state FROM gk_labor_entries ORDER BY id'),
    one(env, 'SELECT COALESCE(MAX(seq),0) AS sequence,MAX(at) AS latestAt FROM gk_audit'),
    one(env, 'SELECT name,timezone FROM gk_site WHERE singleton=1'),
  ])
  insist(!selectedAsset || assets.some(row => row.id === selectedAsset), 'asset_not_found', 404)
  insist(!selectedWork || works.some(row => row.id === selectedWork), 'work_order_not_found', 404)
  insist(!selectedCenter || selectedCenter === 'unassigned' || centers.some(row => row.id === selectedCenter), 'cost_center_not_found', 404)
  const descendants = (id: string) => {
    const ids = new Set([id])
    let size = 0
    while (size !== ids.size) { size = ids.size; for (const row of assets) if (ids.has(row.parent_id)) ids.add(row.id) }
    return ids
  }
  const scope = selectedAsset ? descendants(selectedAsset) : null, workMap = new Map(works.map(row => [row.id, row]))
  const scopeWork = (id: string) => { const row = workMap.get(id); return !!row && (!scope || scope.has(row.asset_id)) && (!selectedWork || id === selectedWork) }
  const inPeriod = (day: string) => (!from || day >= from) && (!to || day <= to)
  const inCenter = (center: string | null) => !selectedCenter || (selectedCenter === 'unassigned' ? center === null : center === selectedCenter)
  const sources: CostSource[] = []
  const add = (row: CostSource) => { if (inPeriod(row.eventDay) && inCenter(row.costCenterId)) sources.push(row) }
  for (const row of actuals) {
    if (!scopeWork(row.work_order_id)) continue
    const w = workMap.get(row.work_order_id)!
    add({ id: `${row.source}:${row.id}`, workOrderId: w.id, historyId: null, assetId: w.asset_id, costCenterId: w.cost_center_id, kind: 'actual', category: row.category, cents: row.cents, source: row.source, note: row.note, reference: row.id, recordedAt: row.recorded_at, eventDay: today(actor.zone, row.recorded_at), sourceDoor: `/api/gasket/work/${w.id}`,
      ...(row.source === 'approved_labor' ? { approvedMinutes: row.approved_minutes, approvedByCategory: { [row.labor_category]: row.approved_minutes } } : {}),
      ...(row.source === 'contractor_invoice' ? { contractorMinutes: row.contractor_minutes } : {}),
      ...(actor.role === 'owner' && row.source === 'approved_labor' ? { personId: row.person_id, rateId: row.rate_id } : {}) })
  }
  for (const row of comparisons) {
    if (!scopeWork(row.work_order_id)) continue
    const w = workMap.get(row.work_order_id)!
    add({ id: `comparison:${row.id}`, workOrderId: w.id, historyId: null, assetId: w.asset_id, costCenterId: w.cost_center_id, kind: row.kind, category: row.category, cents: row.cents, source: 'comparison', note: row.note, reference: row.source_reference, recordedAt: row.recorded_at, eventDay: today(actor.zone, row.recorded_at), sourceDoor: `/api/gasket/work/${w.id}` })
  }
  for (const row of history) {
    if (selectedWork || (scope && !scope.has(row.asset_id))) continue
    for (const category of ['parts', 'labor', 'other'] as const) add({ id: `history:${row.id}:${category}`, workOrderId: null, historyId: row.id, assetId: row.asset_id, costCenterId: null, kind: 'actual', category, cents: row[`${category}_cents`], source: 'moved_in_history', note: row.title, reference: row.source_ref, recordedAt: row.created_at, eventDay: row.completed_on.slice(0, 10), sourceDoor: `/api/gasket/assets/${row.asset_id}/history` })
  }
  const scopedPurchase = (row: Row) => {
    const snapshot = JSON.parse(row.snapshot), workId = snapshot.work?.id ?? null, assetId = workId ? workMap.get(workId)?.asset_id ?? null : snapshot.asset?.id ?? null
    return { workId, assetId, included: (!selectedWork || selectedWork === workId) && (!scope || scope.has(assetId)) && inCenter(row.cost_center_id) && inPeriod(row.booked_on) }
  }
  for (const row of commitments) {
    const p = scopedPurchase(row)
    if (!p.included) continue
    add({ id: `purchase:${row.revision_id}`, workOrderId: p.workId, historyId: null, assetId: p.assetId, costCenterId: row.cost_center_id, kind: 'commitment', category: 'other', cents: row.amount_cents, source: 'purchase_commitment', note: `Approved purchase order ${row.number}`, reference: row.revision_id, recordedAt: row.recorded_at, eventDay: row.booked_on, sourceDoor: `/api/gasket/purchase-orders/${row.order_id}` })
  }
  // Existing aggregate cost access does not grant individual labor amounts.
  let visible = sources
  if (actor.role !== 'owner') {
    const grouped = new Map<string, CostSource[]>()
    for (const row of sources.filter(row => row.source === 'approved_labor')) { const key = row.workOrderId!; grouped.set(key, [...(grouped.get(key) ?? []), row]) }
    visible = [...sources.filter(row => row.source !== 'approved_labor'), ...[...grouped].map(([work, rows]) => ({ ...rows[0], id: `approved-labor:${work}`, cents: sumKnown(rows), reference: '', note: 'Approved labor total', source: 'approved_labor_total', recordedAt: null, eventDay: '', approvedMinutes: rows.reduce((sum, row) => sum + row.approvedMinutes!, 0), approvedByCategory: summary(rows).approvedByCategory }))]
  }
  const scopedWorks = works.filter(row => scopeWork(row.id) && (!selectedCenter || inCenter(row.cost_center_id) || visible.some(source => source.workOrderId === row.id)))
  const byWork = scopedWorks.map(row => ({ ...row, ...summary(visible.filter(source => source.workOrderId === row.id)) }))
  const byAsset = assets.filter(row => !scope || scope.has(row.id)).map(row => ({ ...row, ...summary(visible.filter(source => source.assetId === row.id)) }))
  const bySubtree = assets.filter(row => !scope || scope.has(row.id)).map(row => { const ids = descendants(row.id); return { ...row, ...summary(visible.filter(source => source.assetId && ids.has(source.assetId))) } })
  const byCostCenter = [...centers, { id: null, code: 'Unassigned', name: 'No recorded cost center' }].filter(row => inCenter(row.id)).map(row => ({ ...row, ...summary(visible.filter(source => source.costCenterId === row.id)) }))
  const excluded = excludedCommitments.filter(row => scopedPurchase(row).included).map(({ snapshot, ...row }) => ({ ...row, sourceDoor: `/api/gasket/purchase-orders/${row.order_id}` }))
  const laborStates = labor.filter(row => scopeWork(row.work_order_id) && inCenter(workMap.get(row.work_order_id)!.cost_center_id))
  const coverage = { workOrders: byWork.length, workWithoutActuals: byWork.filter(row => row.amounts.actual.cents === null).map(row => ({ id: row.id, number: row.number, sourceDoor: `/api/gasket/work/${row.id}` })),
    unpricedMovements: sources.filter(row => row.source.startsWith('stock_') && row.cents === null).map(row => ({ id: row.id, workOrderId: row.workOrderId, sourceDoor: row.sourceDoor })),
    importedMissingAmounts: sources.filter(row => row.source === 'moved_in_history' && row.cents === null).map(row => ({ historyId: row.historyId, category: row.category, sourceDoor: row.sourceDoor })),
    laborStates: Object.fromEntries(['pending', 'approved', 'rejected', 'superseded'].map(state => [state, laborStates.filter(row => row.state === state).length])),
    ...(actor.role === 'owner' ? { excludedLabor: laborStates.filter(row => row.state !== 'approved') } : {}) }
  const inputFingerprint = await sha256Hex(JSON.stringify({ from, to, selectedAsset, selectedWork, selectedCenter, visible, coverage, audit, works: scopedWorks, assets, excluded }))
  return { currency: 'USD', site, from, to, today: actor.today, asset: selectedAsset, workOrder: selectedWork, costCenter: selectedCenter, assets, costCenters: centers,
    computedAt: now(), sourceRevision: audit.sequence, latestChangeAt: audit.latestAt, inputFingerprint, definitions: COSTING_METRICS,
    totals: summary(visible), byWork, byAsset, bySubtree, byCostCenter, sources: visible, excludedCommitments: excluded, coverage,
    policy: 'Known amounts are partial when sources are unpriced or missing. Actual, estimate, commitment and posted are separate measures and must never be added. Each source counts once per scope. Asset rows are direct costs; subtree rows overlap and must not be summed. Current hierarchy and work cost centers apply; purchase commitments keep their own cost center. Imported history has no cost center. Purchase commitments never assert actual bills or payment. Posted amounts are attributed owner records with references, without ledger verification. Labor outside approved state contributes no actual cost; labor-state coverage is current, independent of the event period. Individual labor details require the owner.' }
}

/** Each download contains just one grouping, so subtotals cannot inflate sources. */
export async function costingCsv(env: Bindings, actor: Actor, url: URL) {
  const r = await costingReport(env, actor, url), group = url.searchParams.get('groupBy') || 'sources'
  const money = (value: number | null) => value === null ? 'unknown' : (value / 100).toFixed(2)
  const metadata = ['USD', r.from ?? 'lifetime', r.to ?? 'present', r.sourceRevision, r.inputFingerprint]
  let lines: unknown[][]
  if (group === 'sources') {
    lines = [['Source ID', 'Work ID', 'History ID', 'Asset ID', 'Cost center ID', 'Measure', 'Category', 'USD', 'Source', 'Reference', 'Event day', 'Note', 'Source door', 'Approved labor hours', 'Contractor hours', 'Currency', 'From', 'To', 'Audit revision', 'Input fingerprint'],
      ...r.sources.map(row => [row.id, row.workOrderId, row.historyId, row.assetId, row.costCenterId, row.kind, row.category, money(row.cents), row.source, row.reference, row.eventDay, row.note, row.sourceDoor, row.approvedMinutes === undefined ? '' : (row.approvedMinutes / 60).toFixed(4), row.contractorMinutes === undefined ? '' : (row.contractorMinutes / 60).toFixed(4), ...metadata])]
  } else {
    insist(['work', 'asset', 'subtree', 'costCenter', 'site'].includes(group), 'invalid_cost_group')
    const rows: Row[] = group === 'work' ? r.byWork : group === 'asset' ? r.byAsset : group === 'subtree' ? r.bySubtree : group === 'costCenter' ? r.byCostCenter : [{ id: 'site', name: r.site?.name, ...r.totals }]
    lines = [['Grouping', 'ID', 'Label', 'Measure', 'Category', 'USD', 'Sources', 'Unknown amounts', 'Scope policy', 'Approved labor hours', 'Contractor hours', 'Wrench hours', 'Travel hours', 'Wait hours', 'Admin hours', 'Currency', 'From', 'To', 'Audit revision', 'Input fingerprint'],
      ...rows.flatMap(row => COSTING_CATEGORIES.flatMap(category => kinds.map(kind => { const amount = row.byCategory[category][kind]; return [group, row.id, row.tag ?? row.code ?? row.number ?? row.name, kind, category, money(amount.cents), amount.sources, amount.unknown, group === 'subtree' ? 'Overlapping subtrees; do not sum rows' : 'Each source once per grouping', kind === 'actual' && category === 'labor' ? (row.approvedMinutes / 60).toFixed(4) : '', kind === 'actual' && category === 'contractor' ? (row.contractorMinutes / 60).toFixed(4) : '', ...['wrench', 'travel', 'wait', 'admin'].map(key => kind === 'actual' && category === 'labor' ? (row.approvedByCategory[key] / 60).toFixed(4) : ''), ...metadata] })))]
  }
  return lines.map(line => line.map(cell).join(',')).join('\r\n') + '\r\n'
}
