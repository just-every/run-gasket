// BUY-001: maintenance needs go to an accountable buyer without authorizing spend.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import { Input } from './input'
import { fromMilli, toMilli } from './quantity'
import { ITEM_KINDS, supplierDetail, supplierList } from './suppliers'

export async function purchasing(env: Bindings) {
  const [suppliers, costCenters, purchasers, requests] = await Promise.all([
    supplierList(env), all(env, 'SELECT * FROM gk_cost_centers ORDER BY code'),
    all(env, "SELECT id, name FROM gk_members WHERE role = 'owner' AND status = 'active' ORDER BY name, id"),
    all(env, `SELECT r.*, s.name AS supplier_name, s.active AS supplier_active, a.tag AS asset_tag, a.name AS asset_name,
      w.number AS work_number, c.code AS cost_center, c.name AS cost_center_name, p.name AS purchaser, m.name AS requester
      FROM gk_requisitions r JOIN gk_suppliers s ON s.id=r.supplier_id
      LEFT JOIN gk_assets a ON a.id=r.asset_id LEFT JOIN gk_work_orders w ON w.id=r.work_order_id
      JOIN gk_cost_centers c ON c.id=r.cost_center_id JOIN gk_members p ON p.id=r.purchaser_id JOIN gk_members m ON m.id=r.requested_by
      ORDER BY r.number DESC`),
  ])
  return { suppliers, costCenters, purchasers, requests }
}
export async function requisitionDetail(env: Bindings, id: string) {
  const request = (await purchasing(env)).requests.find(row => row.id === id)
  insist(request, 'requisition_not_found', 404)
  return { ...request, supplierSnapshot: JSON.parse(request.supplier_snapshot), lines: (await all(env, 'SELECT * FROM gk_requisition_lines WHERE requisition_id = ? ORDER BY position', id)).map(line => ({ ...line, quantity: fromMilli(line.quantity_milli) })) }
}

export async function requestPurchase(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.do')
  const supplier = await supplierDetail(env, input.text('supplier'))
  insist(supplier.active, 'supplier_inactive', 409)
  const workId = input.text('workOrder', { optional: true }), assetId = input.text('asset', { optional: true })
  const work = workId ? await one(env, 'SELECT id, asset_id FROM gk_work_orders WHERE id = ?', workId) : null
  insist(!workId || work, 'work_order_not_found', 404)
  const asset = assetId || work?.asset_id || null
  insist(!work?.asset_id || !assetId || assetId === work.asset_id, 'asset_work_mismatch')
  if (asset) insist(await one(env, "SELECT id FROM gk_assets WHERE id = ? AND retired_at IS NULL", asset), 'asset_not_found', 404)
  const costCenter = input.text('costCenter'), purchaser = input.text('purchaser')
  insist(await one(env, 'SELECT id FROM gk_cost_centers WHERE id = ? AND active=1', costCenter), 'cost_center_inactive', 409)
  insist(await one(env, "SELECT id FROM gk_members WHERE id = ? AND role='owner' AND status='active'", purchaser), 'purchaser_unavailable', 409)
  // Both doors use the same parallel line fields; empty form rows are ignored.
  const descriptions = input.list('description', { keepEmpty: true }), kinds = input.list('kind', { keepEmpty: true }), quantities = input.list('quantity', { keepEmpty: true }), units = input.list('unit', { keepEmpty: true })
  insist(descriptions.length >= 1 && descriptions.length <= 50 && [kinds, quantities, units].every(values => values.length === descriptions.length), 'invalid_lines')
  const lines = descriptions.map((description, index) => {
    if (!description && !quantities[index] && !units[index]) return null
    const row = Input.of({ description, kind: kinds[index], unit: units[index] })
    const kind = row.text('kind'); insist(Object.hasOwn(ITEM_KINDS, kind), 'invalid_item_kind')
    return { id: newId(), description: row.text('description', { max: 500 }), kind, unit: row.text('unit', { max: 40 }), quantityMilli: toMilli(quantities[index]) }
  }).filter(line => line !== null)
  insist(lines.length, 'missing_lines')
  const id = newId(), reason = input.text('reason', { max: 2000 })
  await commit(env, [
    guard(env, 'supplier_inactive', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id=? AND active=1)', supplier.id),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id=? AND revision=?)', supplier.id, supplier.revision),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_cost_centers WHERE id=? AND active=1) AND EXISTS(SELECT 1 FROM gk_members WHERE id=? AND status=\'active\' AND role=\'owner\')', costCenter, purchaser),
    stmt(env, `INSERT INTO gk_requisitions (id,number,supplier_id,supplier_revision,supplier_snapshot,asset_id,work_order_id,cost_center_id,purchaser_id,requested_by,requested_at,reason)
      VALUES (?,(SELECT COALESCE(MAX(number),0)+1 FROM gk_requisitions),?,?,?,?,?,?,?,?,?,?)`, id, supplier.id, supplier.revision, JSON.stringify(supplier), asset, workId || null, costCenter, purchaser, actor.id, now(), reason),
    ...lines.map((line, position) => stmt(env, 'INSERT INTO gk_requisition_lines (id,requisition_id,position,kind,description,quantity_milli,unit) VALUES (?,?,?,?,?,?,?)', line.id, id, position, line.kind, line.description, line.quantityMilli, line.unit)),
  ], { actor: actor.id, action: 'requisition.request', subject: id, detail: { supplier: supplier.id, supplierRevision: supplier.revision, purchaser, asset, workOrder: workId, costCenter, reason, lines, status: 'pending' } })
  return { id }
}
