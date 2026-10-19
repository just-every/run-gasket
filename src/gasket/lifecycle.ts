// ASSET-007: an asset's lifecycle and the replacement decision. Leads record
// its purchase (date, cost, supplier), commissioning, warranty, replacement
// value with its basis and service agreements; retiring it records the
// disposal. Each change is a numbered revision kept in the asset's history.
// The replacement comparison sets the actual repair cost (REPORT-005 cost
// entries on the asset's own work orders: unknown, never zero, when none) and
// its failure downtime against the replacement value. Depreciation stays in
// the connected ledger: the handoff CSV carries the facts, never a book value.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { isDate } from './dates'
import type { Input } from './input'
import { classifiedStops } from './reliability'
import { cell } from './audit'

export const DISPOSAL_METHODS = ['sold', 'scrapped', 'returned', 'transferred', 'donated', 'other'] as const
const DOLLARS = /^\d{1,9}(\.\d{1,2})?$/

/** Optional US dollars ("$18,500.00", "18500") as whole cents; anything else is refused. */
function dollars(input: Input, name: string) {
  const text = input.text(name, { optional: true, max: 16 }).replace(/[$,]/g, '')
  if (!text) return null
  insist(DOLLARS.test(text), `invalid_${name}`)
  const [whole, part = ''] = text.split('.')
  return Number(whole) * 100 + Number(part.padEnd(2, '0'))
}

function date(input: Input, name: string, today: string) {
  const value = input.text(name, { optional: true, max: 10 }) || null
  if (value) insist(isDate(value), `invalid_${name}`)
  if (value && name !== 'warrantyUntil') insist(value <= today, `${name}_in_future`)
  return value
}

const asset = async (env: Bindings, id: string) => {
  const row = await one(env, 'SELECT id, tag, name, serial, category, retired_at FROM gk_assets WHERE id = ?', id)
  insist(row, 'asset_not_found', 404)
  return row
}

/** A lead records or revises the lifecycle facts, from the revision they read (none for the first). */
export async function setLifecycle(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const entry = await asset(env, input.text('asset', { max: 100 }))
  insist(!entry.retired_at, 'asset_retired', 409)
  const current = await one(env, 'SELECT * FROM gk_asset_lifecycle WHERE asset_id = ?', entry.id)
  const revision = input.integer('revision', { optional: true, min: 1, max: 1_000_000 })
  insist((revision ?? 0) === (current?.revision ?? 0), 'stale', 409)
  const value = {
    purchasedOn: date(input, 'purchasedOn', actor.today), purchaseCents: dollars(input, 'purchaseCost'), supplier: input.text('supplier', { optional: true, max: 160 }) || null,
    commissionedOn: date(input, 'commissionedOn', actor.today), warrantyUntil: date(input, 'warrantyUntil', actor.today), warrantyTerms: input.text('warrantyTerms', { optional: true, max: 500 }) || null,
    replacementCents: dollars(input, 'replacementValue'), replacementBasis: input.text('replacementBasis', { optional: true, max: 500 }) || null,
  }
  if (value.purchasedOn && value.commissionedOn) insist(value.commissionedOn >= value.purchasedOn, 'commissioned_before_purchase')
  insist(value.replacementCents !== 0, 'invalid_replacementValue')
  insist(!value.replacementCents || value.replacementBasis, 'missing_replacementBasis')
  const fields = [value.purchasedOn, value.purchaseCents, value.supplier, value.commissionedOn, value.warrantyUntil, value.warrantyTerms, value.replacementCents, value.replacementBasis]
  await commit(env, current
    ? [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_asset_lifecycle WHERE asset_id = ? AND revision = ?)', entry.id, current.revision),
      stmt(env, 'UPDATE gk_asset_lifecycle SET purchased_on = ?, purchase_cents = ?, supplier = ?, commissioned_on = ?, warranty_until = ?, warranty_terms = ?, replacement_cents = ?, replacement_basis = ?, revision = revision + 1, updated_by = ?, updated_at = ? WHERE asset_id = ?', ...fields, actor.id, now(), entry.id)]
    : [guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM gk_asset_lifecycle WHERE asset_id = ?)', entry.id),
      stmt(env, 'INSERT INTO gk_asset_lifecycle (asset_id, purchased_on, purchase_cents, supplier, commissioned_on, warranty_until, warranty_terms, replacement_cents, replacement_basis, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', entry.id, ...fields, actor.id, now())],
  { actor: actor.id, action: 'asset.lifecycle', subject: entry.id, detail: { ...value, revision: (current?.revision ?? 0) + 1 } })
  return { id: entry.id, revision: (current?.revision ?? 0) + 1 }
}

/** A lead records a service agreement: provider, optional reference, its term, optional annual cost and scope. */
export async function addAgreement(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const entry = await asset(env, input.text('asset', { max: 100 }))
  insist(!entry.retired_at, 'asset_retired', 409)
  const provider = input.text('provider', { max: 160 }), reference = input.text('reference', { optional: true, max: 80 }) || null, scope = input.text('scope', { max: 500 })
  const startsOn = input.text('startsOn', { max: 10 }), endsOn = input.text('endsOn', { max: 10 })
  insist(isDate(startsOn), 'invalid_startsOn')
  insist(isDate(endsOn), 'invalid_endsOn')
  insist(endsOn >= startsOn, 'agreement_ends_before_start')
  const annualCents = dollars(input, 'annualCost'), id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_service_agreements (id, asset_id, provider, reference, starts_on, ends_on, annual_cents, scope, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, entry.id, provider, reference, startsOn, endsOn, annualCents, scope, actor.id, now())],
    { actor: actor.id, action: 'asset.agreement', subject: entry.id, detail: { agreement: id, provider, reference, startsOn, endsOn, annualCents, scope } })
  return { id }
}

/** The disposal a retirement records (asset.retire): a method, its date (today unless given) and optional proceeds. */
export function disposalStatements(env: Bindings, actor: Actor, assetId: string, input: Input) {
  const method = input.text('disposalMethod', { optional: true, max: 20 }) || null
  if (!method) return { statements: [], disposal: null }
  insist((DISPOSAL_METHODS as readonly string[]).includes(method), 'invalid_disposalMethod')
  const disposedOn = date(input, 'disposedOn', actor.today) ?? actor.today, proceedsCents = dollars(input, 'disposalProceeds')
  return { disposal: { method, disposedOn, proceedsCents }, statements: [stmt(env, `INSERT INTO gk_asset_lifecycle (asset_id, disposal_method, disposed_on, disposal_cents, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET disposal_method = excluded.disposal_method, disposed_on = excluded.disposed_on, disposal_cents = excluded.disposal_cents, revision = revision + 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at`, assetId, method, disposedOn, proceedsCents, actor.id, now())] }
}

/** The lifecycle facts, service agreements and replacement comparison for one asset. */
export async function lifecycleOf(env: Bindings, actor: Actor, assetId: string) {
  const facts = await one(env, 'SELECT l.*, m.name AS updated_by_name FROM gk_asset_lifecycle l LEFT JOIN gk_members m ON m.id = l.updated_by WHERE l.asset_id = ?', assetId)
  const agreements = (await all(env, 'SELECT a.*, m.name AS recorded_by_name FROM gk_service_agreements a LEFT JOIN gk_members m ON m.id = a.recorded_by WHERE a.asset_id = ? ORDER BY a.starts_on, a.recorded_at', assetId))
    .map(row => ({ ...row, active: row.starts_on <= actor.today && actor.today <= row.ends_on }))
  // Repair cost: every cost entry on the asset's own work orders (any status); failure downtime: its ended failure stops, by their latest classification.
  const costs = await one(env, 'SELECT COUNT(DISTINCT w.id) AS orders, COUNT(c.id) AS entries, SUM(c.cents) AS cents, COUNT(DISTINCT c.work_order_id) AS costed FROM gk_work_orders w LEFT JOIN gk_work_costs c ON c.work_order_id = w.id WHERE w.asset_id = ?', assetId)
  const failures = (await classifiedStops(env, 'd.asset_id = ? AND d.ended_on IS NOT NULL AND d.degraded = 0', assetId)).filter(stop => !stop.planned)
  const repairCents = costs?.entries ? costs.cents as number : null, replacementCents = (facts?.replacement_cents ?? null) as number | null
  const comparison = { repairCents, workOrders: costs?.orders ?? 0, costedWorkOrders: costs?.costed ?? 0, failures: failures.length, failureMinutes: failures.reduce((sum, stop) => sum + (stop.minutes as number), 0), replacementCents,
    repairPercentOfReplacement: repairCents !== null && replacementCents ? Math.round(repairCents / replacementCents * 1000) / 10 : null }
  return { facts: facts ?? null, agreements, comparison }
}

const money = (cents: number | null | undefined) => cents === null || cents === undefined ? '' : (cents / 100).toFixed(2)

/** The ledger handoff: one row of the asset's lifecycle facts and costs to date, in US dollars; no book value or depreciation. */
export async function ledgerCsv(env: Bindings, actor: Actor, assetId: string) {
  requireCapability(actor, 'history.export')
  const entry: Row = await asset(env, assetId), { facts: f, agreements, comparison: c } = await lifecycleOf(env, actor, assetId)
  const header = ['Tag', 'Name', 'Serial', 'Category', 'Purchased on', 'Purchase cost (USD)', 'Supplier', 'Commissioned on', 'Warranty until', 'Warranty terms', 'Replacement value (USD)', 'Replacement basis', 'Service agreements', 'Repair cost to date (USD)', 'Work orders', 'Failure downtime (minutes)', 'Retired', 'Disposal method', 'Disposed on', 'Disposal proceeds (USD)']
  const row = [entry.tag, entry.name, entry.serial, entry.category, f?.purchased_on, money(f?.purchase_cents), f?.supplier, f?.commissioned_on, f?.warranty_until, f?.warranty_terms, money(f?.replacement_cents), f?.replacement_basis,
    agreements.map(a => `${a.provider}${a.reference ? ` ${a.reference}` : ''} ${a.starts_on} to ${a.ends_on}${a.annual_cents !== null ? ` ${money(a.annual_cents)}/yr` : ''}`).join('; '), c.repairCents === null ? 'unknown' : money(c.repairCents), c.workOrders, c.failureMinutes,
    entry.retired_at ? 'yes' : 'no', f?.disposal_method, f?.disposed_on, money(f?.disposal_cents)]
  return [header, row].map(line => line.map(cell).join(',')).join('\r\n') + '\r\n'
}
