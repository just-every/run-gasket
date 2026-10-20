// BUY-001 supplier master. Registry facts are human-entered, never tax advice.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { cents } from './valuation'

export const TAX = { sales_tax: 'Supplier charges sales tax', use_tax: 'Buyer accounts for use tax', exempt: 'Exempt (basis recorded below)' }
export const ITEM_KINDS = { part: 'Part', service: 'Service', repair: 'External repair' }
export const buyer = (actor: Actor) => requireCapability(actor, 'site.manage')

export async function supplierList(env: Bindings) {
  return await all(env, 'SELECT * FROM gk_suppliers ORDER BY name, id')
}
export async function supplierDetail(env: Bindings, id: string) {
  const supplier = await one(env, 'SELECT * FROM gk_suppliers WHERE id = ?', id)
  insist(supplier, 'supplier_not_found', 404)
  return { ...supplier, shipTo: JSON.parse(supplier.ship_to), items: await all(env, 'SELECT * FROM gk_supplier_items WHERE supplier_id = ? ORDER BY sku', id) }
}
export async function saveSupplier(env: Bindings, actor: Actor, input: Input) {
  buyer(actor)
  const id = input.text('supplier', { optional: true }) || newId()
  const previous = input.has('supplier') ? await supplierDetail(env, id) : null
  const revision = previous ? input.integer('revision', { min: 1 })! : 0
  const shipTo = { street: input.text('street'), city: input.text('city', { max: 100 }), state: input.text('state', { max: 2 }).toUpperCase(), zip: input.text('zip', { max: 10 }), country: 'US' }
  insist(/^[A-Z]{2}$/.test(shipTo.state) && /^\d{5}(-\d{4})?$/.test(shipTo.zip), 'invalid_us_address')
  const email = input.text('email', { max: 254 }), tax = input.text('taxTreatment')
  insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'invalid_email')
  insist(Object.hasOwn(TAX, tax), 'invalid_tax_treatment')
  const value = { name: input.text('name'), contact: input.text('contact'), email, phone: input.text('phone', { max: 60 }), shipTo, taxTreatment: tax, taxNote: input.text('taxNote', { max: 1000, optional: tax !== 'exempt' }), paymentTerms: input.text('paymentTerms'), leadDays: input.integer('leadDays', { max: 3650 })!, active: input.flag('active') }
  const values = [value.name, value.contact, email, value.phone, JSON.stringify(shipTo), tax, value.taxNote, value.paymentTerms, value.leadDays, Number(value.active), actor.id, now()]
  await commit(env, previous ? [
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id = ? AND revision = ?)', id, revision),
    stmt(env, 'UPDATE gk_suppliers SET name=?, contact=?, email=?, phone=?, ship_to=?, tax_treatment=?, tax_note=?, payment_terms=?, lead_days=?, active=?, updated_by=?, updated_at=?, revision=revision+1 WHERE id=?', ...values, id),
  ] : [stmt(env, 'INSERT INTO gk_suppliers (name,contact,email,phone,ship_to,tax_treatment,tax_note,payment_terms,lead_days,active,updated_by,updated_at,id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', ...values, id)],
  { actor: actor.id, action: previous ? 'supplier.update' : 'supplier.create', subject: id, detail: { revision: revision + 1, before: previous, value } })
  return { id, revision: revision + 1 }
}

export async function saveCatalogItem(env: Bindings, actor: Actor, input: Input) {
  buyer(actor)
  const supplier = await supplierDetail(env, input.text('supplier'))
  const sku = input.text('sku', { max: 100 }), kind = input.text('kind')
  insist(Object.hasOwn(ITEM_KINDS, kind), 'invalid_item_kind')
  const previous = await one(env, 'SELECT * FROM gk_supplier_items WHERE supplier_id = ? AND sku = ?', supplier.id, sku)
  const id = previous?.id ?? newId()
  const value = { sku, kind, description: input.text('description', { max: 500 }), unit: input.text('unit', { max: 40 }), priceCents: input.has('price') ? cents(input, 'price') : null }
  insist(!previous?.part_id || kind === 'part' && value.unit === previous.unit, 'catalog_identity_changed', 409)
  await commit(env, [
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id = ? AND revision = ?)', supplier.id, input.integer('revision', { min: 1 })),
    stmt(env, 'INSERT INTO gk_supplier_items (id,supplier_id,sku,description,kind,unit,price_cents) VALUES (?,?,?,?,?,?,?) ON CONFLICT(supplier_id,sku) DO UPDATE SET description=excluded.description,kind=excluded.kind,unit=excluded.unit,price_cents=excluded.price_cents', id, supplier.id, sku, value.description, kind, value.unit, value.priceCents),
    stmt(env, 'UPDATE gk_suppliers SET revision=revision+1, updated_by=?, updated_at=? WHERE id=?', actor.id, now(), supplier.id),
  ], { actor: actor.id, action: 'supplier.catalog', subject: supplier.id, detail: value })
  return { id: supplier.id }
}

export async function saveCostCenter(env: Bindings, actor: Actor, input: Input) {
  buyer(actor)
  const code = input.text('code', { max: 40 }), name = input.text('name')
  const existing = await one(env, 'SELECT id FROM gk_cost_centers WHERE code = ?', code), id = existing?.id ?? newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_cost_centers (id,code,name,active) VALUES (?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name, active=excluded.active', id, code, name, Number(input.flag('active')))], { actor: actor.id, action: 'costcenter.save', subject: id, detail: { code, name, active: input.flag('active') } })
  return { id }
}
