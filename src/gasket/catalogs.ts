// PART-008: canonical catalog identity and exact pack-to-stocking conversions.
import type { Bindings } from '../auth.server'
import { capabilitySql, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { Input } from './input'
import { fromMilli, toMilli } from './quantity'
import { cents } from './valuation'
export { catalogPreview, importCatalog, undoCatalog } from './catalog-import'

const canonical = (id: string) => `COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=${id}),${id})`
const authority = (env: Bindings, actor: Actor, capability: 'site.manage'|'register.manage') => {
  const check = capabilitySql(actor.sessionId, capability)
  return guard(env, 'stale', check.sql, ...check.params)
}

/** Include source catalog and alias evidence after those identities have merged. */
export async function catalogView(env: Bindings, _actor: Actor, partId: string) {
  const found = await one(env, `SELECT ${canonical('p.id')} AS id FROM gk_parts p WHERE p.id=?`, partId)
  insist(found, 'part_not_found', 404)
  const [items, aliases, imports] = await Promise.all([
    all(env, `SELECT i.*,s.name AS supplier_name,s.active AS supplier_active,p.number AS part_number,p.unit AS stocking_unit FROM gk_supplier_items i
      JOIN gk_suppliers s ON s.id=i.supplier_id JOIN gk_parts p ON p.id=i.part_id WHERE ${canonical('i.part_id')}=? ORDER BY i.preferred DESC,s.name,i.sku`, found.id),
    all(env, `SELECT a.*,s.name AS supplier_name FROM gk_part_aliases a LEFT JOIN gk_suppliers s ON s.id=a.supplier_id WHERE ${canonical('a.part_id')}=? ORDER BY a.kind,a.number,a.part_id,COALESCE(a.supplier_id,'')`, found.id),
    all(env, `SELECT g.id AS job,g.filename,g.digest,g.applied_at,g.undone_at FROM gk_catalog_imports g
      WHERE EXISTS(SELECT 1 FROM json_each(g.scope_json,'$.parts') e WHERE ${canonical('e.value')}=?) ORDER BY g.applied_at,g.id`, found.id),
  ])
  return { id: found.id, items: items.map(item => ({ ...item, packQuantity: fromMilli(item.pack_milli) })), aliases, imports }
}

/** A repeated manufacturer number is evidence for review, never automatic equivalence. */
export async function lookupPart(env: Bindings, _actor: Actor, url: URL) {
  const number = url.searchParams.get('number')?.trim()
  insist(number && number.length <= 100, 'missing_number')
  const candidates = await all(env, `SELECT DISTINCT p.id,p.number,p.name,p.unit FROM gk_parts p WHERE p.id IN (
    SELECT ${canonical('a.part_id')} FROM gk_part_aliases a WHERE a.number=? COLLATE NOCASE
    UNION SELECT ${canonical('q.id')} FROM gk_parts q WHERE q.number=? COLLATE NOCASE) ORDER BY p.number`, number, number)
  insist(candidates.length, 'part_not_found', 404)
  insist(candidates.length === 1, 'ambiguous_part_number', 409, { candidates })
  return candidates[0]
}

/** Receive a supplier pack at its quoted total, without rounding its converted unit price. */
export async function receiveCatalogPack(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const item = await one<Row>(env, `SELECT i.*,s.active,${canonical('i.part_id')} AS canonical_id FROM gk_supplier_items i JOIN gk_suppliers s ON s.id=i.supplier_id WHERE i.id=?`, input.text('item'))
  insist(item?.part_id && item.active, 'catalog_item_unavailable', 409)
  const packs = toMilli(input.text('quantity')), product = BigInt(packs) * BigInt(item.pack_milli)
  insist(product % 1000n === 0n && product / 1000n <= 999999999999n, 'invalid_converted_quantity')
  const quantity = Number(product / 1000n)
  insist(quantity > 0, 'invalid_converted_quantity')
  insist(item.price_cents !== null, 'catalog_price_required')
  const extended = (BigInt(item.price_cents)*BigInt(packs)+500n)/1000n
  const freight = cents(input, 'freight') ?? 0, tax = cents(input, 'tax') ?? 0
  const value = extended+BigInt(freight)+BigInt(tax)
  insist(value <= BigInt(Number.MAX_SAFE_INTEGER), 'purchase_amount_too_large')
  const unitNumerator = BigInt(item.price_cents)*1000n
  const unitPrice = unitNumerator % BigInt(item.pack_milli) === 0n ? Number(unitNumerator/BigInt(item.pack_milli)) : null
  const note = input.text('note', { optional: true, max: 300 })
  const id = newId()
  await commit(env, [authority(env, actor, 'register.manage'),
    guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_supplier_items i JOIN gk_suppliers s ON s.id=i.supplier_id WHERE i.id=? AND i.part_id=? AND i.pack_milli=? AND i.price_cents=? AND s.active=1 AND ${canonical('i.part_id')}=?)`, item.id, item.part_id, item.pack_milli, item.price_cents, item.canonical_id),
    stmt(env, `INSERT INTO gk_part_moves(id,part_id,kind,quantity_milli,value_cents,unit_price_cents,freight_cents,tax_cents,note,actor,at,catalog_item_id)
      VALUES (?,?,'receive',?,?,?,?,?,?,?,?,?)`, id,item.canonical_id,quantity,Number(value),unitPrice,freight,tax,`${fromMilli(packs)} ${item.unit} of ${item.sku} at $${(item.price_cents/100).toFixed(2)} per pack${note ? ` · ${note}` : ''}`,actor.id,now(),item.id),
  ], { actor: actor.id, action: 'catalog.receive', subject: item.canonical_id, detail: { item: item.id, packs: fromMilli(packs), packMilli: item.pack_milli, packPriceCents: item.price_cents, quantity: fromMilli(quantity), valueCents: Number(value), freightCents: freight, taxCents: tax } })
  return { id, part: item.canonical_id, quantity: fromMilli(quantity), valueCents: Number(value) }
}

/** A lead explicitly selects one preferred supplier pack for the canonical item. */
export async function preferCatalogItem(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor,'register.manage')
  const item=await one(env,`SELECT i.*,${canonical('i.part_id')} AS canonical_id FROM gk_supplier_items i JOIN gk_suppliers s ON s.id=i.supplier_id WHERE i.id=? AND i.part_id IS NOT NULL AND s.active=1`,input.text('item'))
  insist(item,'catalog_item_unavailable',409)
  await commit(env,[authority(env,actor,'register.manage'),
    guard(env,'stale',`EXISTS(SELECT 1 FROM gk_supplier_items i WHERE i.id=? AND ${canonical('i.part_id')}=?)`,item.id,item.canonical_id),
    stmt(env,`UPDATE gk_supplier_items SET preferred=0 WHERE ${canonical('gk_supplier_items.part_id')}=?`,item.canonical_id),
    stmt(env,'UPDATE gk_supplier_items SET preferred=1 WHERE id=?',item.id)],
    {actor:actor.id,action:'catalog.prefer',subject:item.canonical_id,detail:{item:item.id}})
  return {id:item.canonical_id}
}
