// BUY-002: quotes are kept as supplied; comparison never invents a price.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt } from './core'
import { isDate } from './dates'
import { Input } from './input'
import { fromMilli, toMilli } from './quantity'
import { buyer, ITEM_KINDS, supplierDetail } from './suppliers'
import { cents } from './valuation'

const safe = (amount: bigint) => { insist(amount <= BigInt(Number.MAX_SAFE_INTEGER), 'purchase_amount_too_large'); return Number(amount) }
export function purchaseFacts(input: Input) {
  insist(!input.has('currency') || input.text('currency') === 'USD', 'usd_only')
  const descriptions = input.list('description', { keepEmpty: true })
  const fields = ['kind', 'quantity', 'unit', 'unitPrice'].map(name => input.list(name, { keepEmpty: true }))
  insist(descriptions.length > 0 && descriptions.length <= 50 && fields.every(values => values.length === descriptions.length), 'invalid_lines')
  const lines = descriptions.flatMap((description, i) => {
    const [kinds, quantities, units, prices] = fields
    if (!description && !quantities[i] && !units[i] && !prices[i]) return []
    const row = Input.of({ description, kind: kinds[i], unit: units[i], unitPrice: prices[i] })
    const kind = row.text('kind'); insist(Object.hasOwn(ITEM_KINDS, kind), 'invalid_item_kind')
    const quantityMilli = toMilli(quantities[i]), unitPriceCents = cents(row, 'unitPrice')
    insist(unitPriceCents !== null, 'missing_unitPrice')
    const extendedCents = safe((BigInt(unitPriceCents) * BigInt(quantityMilli) + 500n) / 1000n)
    return [{ kind, description: row.text('description', { max: 500 }), quantityMilli, quantity: fromMilli(quantityMilli), unit: row.text('unit', { max: 40 }), unitPriceCents, extendedCents }]
  })
  insist(lines.length > 0, 'missing_lines')
  const subtotalCents = safe(lines.reduce((sum, line) => sum + BigInt(line.extendedCents), 0n))
  const freightCents = cents(input, 'freight') ?? 0, salesTaxCents = cents(input, 'salesTax') ?? 0, useTaxCents = cents(input, 'useTax') ?? 0
  const deliveryOn = input.text('deliveryOn', { max: 10 }); insist(isDate(deliveryOn), 'invalid_deliveryOn')
  const taxTreatment = input.text('taxTreatment'); insist(['sales_tax', 'use_tax', 'exempt'].includes(taxTreatment), 'invalid_tax_treatment')
  const taxNote = input.text('taxNote', { max: 1000, optional: taxTreatment !== 'exempt' })
  insist(taxTreatment !== 'exempt' || (!salesTaxCents && !useTaxCents), 'exempt_tax_amount')
  const totalCents = safe(BigInt(subtotalCents) + BigInt(freightCents) + BigInt(salesTaxCents))
  return { currency: 'USD', lines, subtotalCents, freightCents, salesTaxCents, useTaxCents, totalCents,
    commitmentCents: safe(BigInt(totalCents) + BigInt(useTaxCents)), deliveryOn, taxTreatment, taxNote }
}

export async function purchaseLinks(env: Bindings, input: Input) {
  const workOrder = input.text('workOrder', { optional: true }), selectedAsset = input.text('asset', { optional: true })
  const work = workOrder ? await one(env, 'SELECT id,number,title,asset_id FROM gk_work_orders WHERE id=?', workOrder) : null
  insist(!workOrder || work, 'work_order_not_found', 404)
  insist(!work?.asset_id || !selectedAsset || selectedAsset === work.asset_id, 'asset_work_mismatch')
  const assetId = selectedAsset || work?.asset_id || null
  const asset = assetId ? await one(env, 'SELECT id,tag,name FROM gk_assets WHERE id=? AND retired_at IS NULL', assetId) : null
  insist(!assetId || asset, 'asset_not_found', 404)
  const center = await one(env, 'SELECT id,code,name FROM gk_cost_centers WHERE id=? AND active=1', input.text('costCenter'))
  insist(center, 'cost_center_inactive', 409)
  return { work, asset, costCenter: center }
}

export async function purchaseFiles(env: Bindings, actor: Actor, input: Input, parent: { order?: string; quote?: string }) {
  const files = await input.files('attachments', { max: 5, maxBytes: 1_500_000 })
  const types: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain' }
  const records = await Promise.all(files.map(async file => {
    const mediaType = types[file.filename.split('.').pop()?.toLowerCase() ?? '']; insist(mediaType, 'unsupported_file_type')
    return { id: newId(), filename: file.filename, mediaType, size: file.bytes.length, sha256: await sha256Hex(file.bytes), bytes: file.bytes }
  }))
  return { metadata: records.map(({ bytes: _bytes, ...record }) => record), statements: records.map(file => stmt(env,
    'INSERT INTO gk_purchase_files(id,order_id,quote_id,filename,media_type,sha256,bytes,added_by,added_at) VALUES (?,?,?,?,?,?,?,?,?)',
    file.id, parent.order ?? null, parent.quote ?? null, file.filename, file.mediaType, file.sha256, file.bytes, actor.id, now())) }
}

export async function saveQuote(env: Bindings, actor: Actor, input: Input) {
  buyer(actor)
  const supplier = await supplierDetail(env, input.text('supplier')); insist(supplier.active, 'supplier_inactive', 409)
  const id = newId(), reference = input.text('reference'), files = await purchaseFiles(env, actor, input, { quote: id })
  const snapshot = { supplier, reference, ...purchaseFacts(input), ...await purchaseLinks(env, input), attachments: files.metadata }
  await commit(env, [guard(env, 'supplier_inactive', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id=? AND active=1 AND revision=?)', supplier.id, supplier.revision),
    stmt(env, 'INSERT INTO gk_quotes(id,supplier_id,reference,snapshot,created_by,created_at) VALUES (?,?,?,?,?,?)', id, supplier.id, reference, JSON.stringify(snapshot), actor.id, now()), ...files.statements],
  { actor: actor.id, action: 'quote.record', subject: id, detail: { reference, supplier: supplier.id, totalCents: snapshot.totalCents } })
  return { id }
}

export async function quoteList(env: Bindings, _actor: Actor) {
  return (await all(env, 'SELECT q.*,m.name AS created_by_name FROM gk_quotes q JOIN gk_members m ON m.id=q.created_by ORDER BY q.created_at DESC,q.id')).map(row => ({ ...row, snapshot: JSON.parse(row.snapshot) }))
}

export async function purchaseAttachment(env: Bindings, _actor: Actor, id: string) {
  const file = await one(env, 'SELECT * FROM gk_purchase_files WHERE id=?', id); insist(file, 'attachment_not_found', 404)
  return new Response(new Uint8Array(file.bytes), { headers: { 'content-type': file.media_type,
    'content-disposition': `attachment; filename="${file.filename.replace(/["\\]/g, '_')}"`, 'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } })
}
