// BUY-001 uses the app's existing forms, cards and responsive tables.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { assetList } from '../assets'
import { workList } from '../work'
import { purchasing, requisitionDetail } from '../requisitions'
import { ITEM_KINDS, supplierDetail, TAX } from '../suppliers'
import { usd } from '../bad-actors'
import { showInstant } from '../dates'
import { backLink, card, checkbox, field, form, h, hidden, select, table, tag, area, woNumber } from './html'
import { page } from './shell'

const kinds = Object.entries(ITEM_KINDS).map(([value, label]) => ({ value, label }))
const options = (rows: any[]) => rows.map(row => ({ value: row.id, label: row.name }))
function supplierForm(supplier: any = null) {
  const address = supplier?.shipTo ?? {}
  return form('supplier.save', '/app/suppliers/{id}', h`${supplier ? h`${hidden('supplier', supplier.id)}${hidden('revision', supplier.revision)}` : ''}
    <div class="gk-grid">${field('Supplier name', 'name', { value: supplier?.name ?? '' })}${field('Contact person', 'contact', { value: supplier?.contact ?? '' })}${field('Email', 'email', { type: 'email', value: supplier?.email ?? '' })}${field('Phone', 'phone', { attrs: 'inputmode="tel" autocomplete="tel"', value: supplier?.phone ?? '' })}</div>
    <h3>US ship-to address</h3>${field('Street address', 'street', { value: address.street ?? '' })}<div class="gk-grid">${field('City', 'city', { value: address.city ?? '' })}${field('State or territory code', 'state', { value: address.state ?? '', attrs: 'maxlength="2"' })}${field('ZIP code', 'zip', { value: address.zip ?? '', attrs: 'inputmode="numeric"' })}</div>
    <div class="gk-grid">${select('Tax treatment', 'taxTreatment', Object.entries(TAX).map(([value, label]) => ({ value, label })), supplier?.tax_treatment ?? 'sales_tax')}${field('Tax basis or note', 'taxNote', { required: false, value: supplier?.tax_note ?? '', hint: 'Required for an exemption. Record the basis your accountant supplied.' })}${field('Payment terms', 'paymentTerms', { value: supplier?.payment_terms ?? '', hint: 'For example, Net 30.' })}${field('Lead time (calendar days)', 'leadDays', { type: 'number', value: supplier?.lead_days ?? 0, attrs: 'min="0" max="3650"' })}</div>${checkbox('Active for new requisitions', 'active', supplier ? Boolean(supplier.active) : true)}`, supplier ? 'Save supplier' : 'Add supplier')
}

export async function purchasingPage(env: Bindings, actor: Actor, url: URL) {
  const data = await purchasing(env), manage = can(actor, 'site.manage')
  const [assets, work] = await Promise.all([assetList(env, actor), workList(env, actor, new URL('https://local/app'))])
  const queue = card('Buyer queue', data.requests.length ? table(['Request', 'Supplier', 'For', 'Cost center', 'Purchaser', 'Approval'], data.requests.map(row => [
    h`<a href="/app/requisitions/${row.id}">REQ-${row.number}</a><span class="gk-sub">${row.requester}</span>`, h`${row.supplier_name}${!row.supplier_active ? h`<span class="gk-sub">Supplier inactive</span>` : ''}`,
    h`${row.work_order_id ? h`<a href="/app/work/${row.work_order_id}">${woNumber(row.work_number)}</a>` : ''}${row.asset_tag ? h`<span class="gk-sub"><a href="/app/assets/${row.asset_id}">${row.asset_tag}</a> ${row.asset_name}</span>` : ''}`,
    row.cost_center, row.purchaser, tag('Pending approval')]), 'Buyer queue', { wrap: [0, 1, 2, 4] }) : h`<p class="gk-muted">No requisitions yet.</p>`, { id: 'buyer-queue' })
  const suppliers = card('Suppliers', data.suppliers.length ? table(['Supplier', 'Contact', 'Lead time', 'Status'], data.suppliers.map(row => [h`<a href="/app/suppliers/${row.id}">${row.name}</a>`, h`${row.contact}<span class="gk-sub">${row.email}</span>`, `${row.lead_days} days`, tag(row.active ? 'Active' : 'Inactive')]), 'Suppliers', { wrap: [0, 1] }) : h`<p class="gk-muted">No suppliers yet.</p>`)
  const ready = data.suppliers.some(row => row.active) && data.costCenters.some(row => row.active) && data.purchasers.length
  const request = can(actor, 'work.do') ? card('Request a purchase', ready ? form('requisition.request', '/app/requisitions/{id}', h`
    ${select('Supplier', 'supplier', options(data.suppliers.filter(row => row.active)))}${select('Purchaser', 'purchaser', options(data.purchasers))}${select('Cost center', 'costCenter', data.costCenters.filter(row => row.active).map(row => ({ value: row.id, label: `${row.code} · ${row.name}` })))}
    ${select('Asset', 'asset', assets.filter(row => row.status !== 'retired').map(row => ({ value: row.id, label: `${row.tag} · ${row.name}` })), '', { required: false, blank: 'No asset' })}${select('Work order', 'workOrder', work.map(row => ({ value: row.id, label: `${woNumber(row.number)} · ${row.title}` })), '', { required: false, blank: 'No work order' })}
    ${area('Why is this needed?', 'reason')}<p class="gk-hint">Add up to four lines here. Quantities allow three decimal places. Requesting does not place an order or authorize spend.</p>
    ${[0, 1, 2, 3].map(index => h`<fieldset><legend>Line ${index + 1}</legend>${select('Kind', 'kind', kinds)}${field('Description', 'description', { required: index === 0 })}<div class="gk-grid">${field('Quantity', 'quantity', { required: index === 0, attrs: 'inputmode="decimal"' })}${field('Unit', 'unit', { required: index === 0, hint: 'each, hour, job…' })}</div></fieldset>`)}`, 'Submit requisition') : h`<p>The owner needs to add an active supplier and cost center before you can request a purchase.</p>`, { id: 'request-purchase' }) : ''
  const centers = card('Cost centers', h`${data.costCenters.length ? table(['Code', 'Name', 'Status'], data.costCenters.map(row => [row.code, row.name, row.active ? 'Active' : 'Inactive']), 'Cost centers', { wrap: [1] }) : h`<p>No cost centers yet.</p>`}${manage ? form('costcenter.save', '/app/purchasing', h`${field('Code', 'code')}${field('Name', 'name')}${checkbox('Active', 'active', true)}<p class="gk-hint">Use an existing code to update its name or active status. Earlier requests keep their link.</p>`, 'Save cost center', { secondary: true }) : ''}`)
  return page(env, 'Purchasing', actor, h`<div class="gk-head"><div><h1>Purchasing</h1><p class="gk-lede">Suppliers and maintenance needs awaiting purchasing approval.</p></div></div>${queue}<div class="gk-columns"><div class="gk-col-main">${suppliers}${manage ? card('Add a supplier', supplierForm()) : ''}${centers}</div><div class="gk-col-side">${request}</div></div>`, { url })
}

export async function supplierPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const supplier = await supplierDetail(env, id), manage = can(actor, 'site.manage'), address = supplier.shipTo
  const facts = card('Supplier details', h`<p>${tag(supplier.active ? 'Active' : 'Inactive')}</p><dl><dt>Contact</dt><dd>${supplier.contact} · ${supplier.email} · ${supplier.phone}</dd><dt>Ship to</dt><dd>${address.street}, ${address.city}, ${address.state} ${address.zip}, US</dd><dt>Tax treatment</dt><dd>${TAX[supplier.tax_treatment as keyof typeof TAX]} ${supplier.tax_note}</dd><dt>Payment terms</dt><dd>${supplier.payment_terms}</dd><dt>Lead time</dt><dd>${supplier.lead_days} calendar days</dd></dl>`)
  const catalog = card('Catalog', h`${supplier.items.length ? table(['SKU', 'Description', 'Kind', 'Unit', 'USD per unit'], supplier.items.map((row: any) => [row.sku, row.description, ITEM_KINDS[row.kind as keyof typeof ITEM_KINDS], row.unit, row.price_cents === null ? 'Unknown' : usd(row.price_cents)]), 'Supplier catalog', { wrap: [0, 1] }) : h`<p>No catalog items yet.</p>`}
    ${manage ? form('supplier.catalog', `/app/suppliers/${id}`, h`${hidden('supplier', id)}${hidden('revision', supplier.revision)}${field('Supplier SKU', 'sku')}${field('Description', 'description')}<div class="gk-grid">${select('Kind', 'kind', kinds)}${field('Unit', 'unit')}${field('Price per unit (USD)', 'price', { required: false, attrs: 'inputmode="decimal"', hint: 'Leave blank if unknown. This is a quoted catalog price, not an order.' })}</div><p class="gk-hint">Save an existing SKU to update its catalog entry.</p>`, 'Save catalog item', { secondary: true }) : ''}`)
  return page(env, supplier.name, actor, h`${backLink('/app/purchasing', 'Purchasing')}<h1>${supplier.name}</h1><div class="gk-columns"><div class="gk-col-main">${facts}${catalog}</div><div class="gk-col-side">${manage ? card('Edit supplier', supplierForm(supplier)) : ''}</div></div>`, { url })
}

export async function requisitionPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const request = await requisitionDetail(env, id)
  return page(env, `REQ-${request.number}`, actor, h`${backLink('/app/purchasing', 'Purchasing')}<h1>REQ-${request.number}</h1>${card('Pending approval', h`<p>This requisition requests a purchase. No spend has been authorized and no order has been sent.</p><dl><dt>Supplier</dt><dd><a href="/app/suppliers/${request.supplier_id}">${request.supplierSnapshot.name}</a>${!request.supplier_active ? ' · currently inactive' : ''}</dd><dt>Requested by</dt><dd>${request.requester} · ${showInstant(request.requested_at, actor.zone)}</dd><dt>Purchaser</dt><dd>${request.purchaser}</dd><dt>Cost center</dt><dd>${request.cost_center} · ${request.cost_center_name}</dd><dt>Work order</dt><dd>${request.work_order_id ? h`<a href="/app/work/${request.work_order_id}">${woNumber(request.work_number)}</a>` : 'None'}</dd><dt>Asset</dt><dd>${request.asset_id ? h`<a href="/app/assets/${request.asset_id}">${request.asset_tag} · ${request.asset_name}</a>` : 'None'}</dd><dt>Reason</dt><dd>${request.reason}</dd></dl>`)}${card('Requested items', table(['Kind', 'Description', 'Quantity', 'Unit'], request.lines.map((row: any) => [ITEM_KINDS[row.kind as keyof typeof ITEM_KINDS], row.description, row.quantity, row.unit]), 'Requisition lines', { wrap: [1] }))}`, { url })
}
