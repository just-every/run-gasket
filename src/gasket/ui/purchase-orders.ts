import { receivingPanel } from './receiving'
// BUY-002's quote comparison and immutable order history, in the existing shell.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { assetList } from '../assets'
import { usd } from '../bad-actors'
import { showInstant } from '../dates'
import { purchaseOrderDetail, purchaseOrders } from '../purchase-orders'
import { quoteList } from '../quotes'
import { purchasing } from '../requisitions'
import { ITEM_KINDS, TAX } from '../suppliers'
import { workList } from '../work'
import { area, backLink, card, field, fileField, form, h, hidden, raw, select, table, tag, woNumber } from './html'
import { purchaseApprovalPanel, releaseCommitmentForm } from './purchase-approval'
import { page } from './shell'

export const SEND_LABELS: Record<string, string> = { unconfirmed: 'Submission unconfirmed — do not resend', accepted: 'Provider accepted — mailbox delivery unconfirmed', development: 'Local email suppressed — no vendor email sent', rejected: 'Provider rejected', rate_limited: 'Provider rate limited', uncertain: 'Submission uncertain — do not resend', failed: 'Submission failed' }
const options = (rows: any[]) => rows.map(row => ({ value: row.id, label: row.name }))
const dollars = (cents?: number) => cents === undefined ? '' : (cents / 100).toFixed(2)
const files = (rows: any[]) => h`<ul class="gk-plain-list">${rows.map(file => h`<li><a href="/app/purchase-files/${file.id}">${file.filename}</a><span class="gk-sub gk-cell">SHA-256 ${file.sha256}</span></li>`)}</ul>`
const lines = (rows: any[]) => table(['Kind', 'Description', 'Quantity', 'Unit', 'USD per unit', 'USD extended'], rows.map(line => [ITEM_KINDS[line.kind as keyof typeof ITEM_KINDS], line.description, line.quantity, line.unit, usd(line.unitPriceCents), usd(line.extendedCents)]), 'Purchase lines', { wrap: [1] })
const totals = (f: any) => h`<dl><dt>Subtotal</dt><dd>${usd(f.subtotalCents)}</dd><dt>Freight</dt><dd>${usd(f.freightCents)}</dd><dt>Sales tax</dt><dd>${usd(f.salesTaxCents)}</dd><dt>Vendor payable (USD)</dt><dd>${usd(f.totalCents)}</dd><dt>Buyer use tax</dt><dd>${usd(f.useTaxCents)} · excluded from vendor payable</dd><dt>Total commitment (USD)</dt><dd>${usd(f.commitmentCents)}</dd></dl>`

async function choices(env: Bindings, actor: Actor) {
  const [data, assets, work, quotes] = await Promise.all([purchasing(env), assetList(env, actor), workList(env, actor, new URL('https://local/app')), quoteList(env, actor)])
  return { ...data, assets, work, quotes }
}

function factsFields(data: any, actor: Actor, facts: any = null) {
  const rows = [...(facts?.lines ?? []), ...Array.from({ length: facts ? 1 : 3 }, () => ({}))]
  // Keep the authorized revision's current link when it is beyond the first work page.
  const work = facts?.work && !data.work.some((row: any) => row.id === facts.work.id) ? [facts.work, ...data.work] : data.work
  return h`${select('Supplier', 'supplier', options(data.suppliers.filter((row: any) => row.active)), facts?.supplier.id ?? '', { blank: 'Choose an active supplier' })}
    ${select('Cost center', 'costCenter', data.costCenters.filter((row: any) => row.active).map((row: any) => ({ value: row.id, label: `${row.code} · ${row.name}` })), facts?.costCenter.id ?? '', { blank: 'Choose an active cost center' })}
    ${select('Asset', 'asset', data.assets.filter((row: any) => row.status !== 'retired').map((row: any) => ({ value: row.id, label: `${row.tag} · ${row.name}` })), facts?.asset?.id ?? '', { required: false, blank: 'No asset' })}
    ${select('Work order', 'workOrder', work.map((row: any) => ({ value: row.id, label: `${woNumber(row.number)} · ${row.title}` })), facts?.work?.id ?? '', { required: false, blank: 'No work order' })}
    ${field('Promised delivery', 'deliveryOn', { type: 'date', value: facts?.deliveryOn ?? actor.today })}
    <p class="gk-hint">USD prices allow two decimals; quantities allow three. Each extended line rounds half up to one cent.</p>
    ${rows.map((line: any, index: number) => h`<fieldset><legend>Line ${index + 1}</legend>${select('Kind', 'kind', Object.entries(ITEM_KINDS).map(([value, label]) => ({ value, label })), line.kind ?? 'part')}${field('Description', 'description', { value: line.description ?? '', required: index === 0 })}<div class="gk-grid">${field('Quantity', 'quantity', { value: line.quantity ?? '', required: index === 0, attrs: 'inputmode="decimal"' })}${field('Unit', 'unit', { value: line.unit ?? '', required: index === 0 })}${field('USD per unit', 'unitPrice', { value: dollars(line.unitPriceCents), required: index === 0, attrs: 'inputmode="decimal"' })}</div></fieldset>`)}
    <div class="gk-grid">${field('Freight (USD)', 'freight', { value: dollars(facts?.freightCents), required: false, attrs: 'inputmode="decimal"' })}${field('US sales tax (USD)', 'salesTax', { value: dollars(facts?.salesTaxCents), required: false, attrs: 'inputmode="decimal"' })}${field('Buyer use tax (USD)', 'useTax', { value: dollars(facts?.useTaxCents), required: false, attrs: 'inputmode="decimal"' })}</div>
    ${select('Tax treatment', 'taxTreatment', Object.entries(TAX).map(([value, label]) => ({ value, label })), facts?.taxTreatment ?? 'sales_tax')}${field('Tax basis or note', 'taxNote', { value: facts?.taxNote ?? '', required: false, hint: 'An exemption requires its basis. Tax amounts are recorded, not determined by Gasket.' })}
    ${fileField('Attachments', 'attachments', { multiple: true, accept: '.pdf,.png,.jpg,.jpeg,.txt', hint: 'Up to five new files, each at most 1.5 MB. Files and existing revision attachments are retained.' })}`
}

function quoteChoices(quotes: any[], facts: any = null) {
  return h`${quotes.length ? h`<fieldset><legend>Quotes compared</legend>${quotes.map(quote => h`<label class="gk-check"><input type="checkbox" name="quote" value="${quote.id}"${(facts?.quotes ?? []).some((row: any) => row.id === quote.id) ? raw(' checked') : ''}>${quote.reference} · ${quote.snapshot.supplier.name} · ${usd(quote.snapshot.totalCents)}</label>`)}</fieldset>` : ''}
    ${select('Selected quote', 'selectedQuote', quotes.map(quote => ({ value: quote.id, label: `${quote.reference} · ${quote.snapshot.supplier.name}` })), facts?.selectedQuote ?? '', { required: false, blank: 'No quote selected' })}${area('Comparison and selection reason', 'comparisonNote', { value: facts?.comparisonNote ?? '', required: false })}`
}

export async function purchaseOrdersPage(env: Bindings, actor: Actor, url: URL) {
  const [data, orders] = await Promise.all([choices(env, actor), purchaseOrders(env, actor)])
  const manage = can(actor, 'site.manage'), ready = data.suppliers.some((row: any) => row.active) && data.costCenters.some((row: any) => row.active)
  const comparison = data.quotes.length ? h`${table(['Quote', 'Supplier', 'Delivery', 'Vendor payable', 'Buyer use tax', 'Commitment'], data.quotes.map(quote => [h`<a href="#quote-${quote.id}">${quote.reference}</a>`, quote.snapshot.supplier.name, quote.snapshot.deliveryOn, usd(quote.snapshot.totalCents), usd(quote.snapshot.useTaxCents), usd(quote.snapshot.commitmentCents)]), 'Quote comparison', { wrap: [0, 1] })}
    ${data.quotes.map(quote => h`<details class="gk-details" id="quote-${quote.id}"><summary>${quote.reference} · ${quote.snapshot.supplier.name}</summary>${lines(quote.snapshot.lines)}${totals(quote.snapshot)}${files(quote.snapshot.attachments)}</details>`)}` : h`<p>No quotations recorded.</p>`
  return page(env, 'Purchase orders', actor, h`${backLink('/app/purchasing', 'Purchasing')}<h1>Purchase orders</h1><p><a href="/app/vendor-follow-up">Vendor delivery follow-up</a></p>${manage?h`<p><a href="/app/spend-policy">Spend policy and emergency report</a></p>`:can(actor,'work.review')?h`<p><a href="/api/gasket/spend-report">Download budget and emergency report</a></p>`:''}
    ${card('Orders', orders.length ? table(['Order', 'Supplier', 'Revision', 'Vendor payable', 'Approval', 'Email'], orders.map(order => [h`<a href="/app/purchase-orders/${order.id}">PO-${order.number}</a>`, order.snapshot.supplier.name, order.current_revision, usd(order.snapshot.totalCents), order.routeComplete ? (order.routeBlocked ? 'Authority complete · budget blocked' : order.authorityLabel) : 'Awaiting independent approval', order.send_state ? SEND_LABELS[order.send_state] : 'No submission']), 'Purchase orders', { wrap: [1, 4, 5] }) : h`<p>No orders yet.</p>`)}
    ${card('Compare vendor quotations', comparison)}${manage && ready ? h`<div class="gk-columns"><div class="gk-col-main">${card('Draft a purchase order', form('purchase.save', '/app/purchase-orders/{id}', h`${factsFields(data, actor)}${area('Reason for purchase', 'reason')}${quoteChoices(data.quotes)}`, 'Save draft', { multipart: true }))}</div><div class="gk-col-side">${card('Record a vendor quotation', form('quote.save', '/app/purchase-orders', h`${field('Vendor quote reference', 'reference')}${factsFields(data, actor)}`, 'Record quote', { multipart: true }))}</div></div>` : ''}`, { url })
}

export async function purchaseOrderPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const order = await purchaseOrderDetail(env, actor, id), current = order.current, manage = can(actor, 'site.manage')
  const data = manage ? await choices(env, actor) : null
  const history = order.revisions.map((revision: any) => {
    const f = revision.snapshot
    return card(`Revision ${revision.revision}`, h`<p>${revision.revision === order.current_revision ? tag('Current') : tag('Historic')} · ${revision.author} · ${showInstant(revision.created_at, actor.zone)}</p>
      <dl><dt>Supplier</dt><dd><a href="/app/suppliers/${f.supplier.id}">${f.supplier.name}</a> · ${f.supplier.email}</dd><dt>Promised delivery</dt><dd>${f.deliveryOn}</dd><dt>Payment terms</dt><dd>${f.supplier.payment_terms}</dd><dt>Ship to</dt><dd>${f.supplier.shipTo.street}, ${f.supplier.shipTo.city}, ${f.supplier.shipTo.state} ${f.supplier.shipTo.zip}, US</dd><dt>Cost center</dt><dd>${f.costCenter.code} · ${f.costCenter.name}</dd><dt>Asset</dt><dd>${f.asset ? h`<a href="/app/assets/${f.asset.id}">${f.asset.tag} · ${f.asset.name}</a>` : 'None'}</dd><dt>Work</dt><dd>${f.work ? h`<a href="/app/work/${f.work.id}">${woNumber(f.work.number)} · ${f.work.title}</a>` : 'None'}</dd><dt>Reason</dt><dd>${f.reason}</dd><dt>Tax basis</dt><dd>${TAX[f.taxTreatment as keyof typeof TAX]} · ${f.taxNote}</dd></dl>
      ${lines(f.lines)}${totals(f)}${files(f.attachments)}<p>Compared ${f.quotes.map((quote: any) => `${quote.reference} (${quote.supplier.name})`).join(', ') || 'no quotes'}. ${f.comparisonNote}</p>
      ${revision.approval ? h`<p>${revision.approval.authority_kind==='threshold'?'Policy threshold authorization recorded by':revision.approval.authority_kind==='emergency'?'Emergency authority recorded by':'Independent approval recorded by'} ${revision.approval.approver} at ${showInstant(revision.approval.approved_at, actor.zone)} for this exact revision. ${revision.approval.note}</p>` : revision.revision===order.current_revision&&!order.route.legacy&&!order.route.required.length&&order.route.complete?h`<p>The current policy authorizes this exact revision below its manual thresholds. No manual approval is claimed; sending still enforces every budget.</p>`:h`<p>Awaiting required independent decisions. Earlier approvals do not authorize this revision.</p>`}
      ${revision.stepApprovals.length?table(['Named approver','Acting approver','When','Decision'],revision.stepApprovals.map((step:any)=>[step.principal,step.approver,showInstant(step.approved_at,actor.zone),step.note]),'Retained step approvals',{wrap:[0,1,3]}):''}
      ${revision.emergencies.map((override:any)=>h`<p>Emergency override by ${override.approver} at ${showInstant(override.confirmed_at,actor.zone)}: ${override.reason}</p>`)}
      ${revision.release?h`<p>Commitment released: ${revision.release.reason} · ${showInstant(revision.release.released_at,actor.zone)}.</p>`:''}
      ${releaseCommitmentForm(actor,order,revision)}
      ${revision.send ? h`<p>${SEND_LABELS[revision.send.state]} · ${revision.send.recipient}<span class="gk-sub">${revision.send.provider ?? ''} ${revision.send.provider_message_id ?? ''} · submitted by ${revision.send.sender}</span></p>` : h`<p>No email submission for this revision.</p>`}
      ${revision.acknowledgments.map((ack: any) => h`<p>Buyer-recorded vendor acknowledgment: ${ack.contact} · ${ack.reference} · ${ack.note}<span class="gk-sub">Recorded by ${ack.recorder} at ${showInstant(ack.recorded_at, actor.zone)}. Vendor identity is not independently verified.</span></p>`)}
      ${manage && revision.send && ['accepted', 'uncertain', 'unconfirmed'].includes(revision.send.state) ? form('purchase.acknowledge', `/app/purchase-orders/${id}`, h`${hidden('send', revision.send.id)}${field('Vendor contact', 'contact')}${field('Acknowledgment reference', 'reference')}${area('Acknowledgment details', 'note')}`, 'Record vendor acknowledgment', { secondary: true }) : ''}`)
  })
  return page(env, `PO-${order.number}`, actor, h`${backLink('/app/purchase-orders', 'Purchase orders')}<h1>PO-${order.number}</h1><p>Initiated by ${order.initiator}. Each change creates a numbered revision and needs independent approval again.</p>
    ${purchaseApprovalPanel(actor,order)}
    ${manage && order.route.complete && !order.route.blocked && !order.route.release && !current.send ? card('Email authorized revision', form('purchase.send', `/app/purchase-orders/${id}`, h`${hidden('order', id)}${hidden('revision', order.current_revision)}<p>Submit this exact approved revision to ${current.snapshot.supplier.email}. Provider acceptance is separate from vendor acknowledgment.</p>`, 'Submit vendor email')) : ''}
    ${await receivingPanel(env, actor, order)}
    ${[...history].reverse()}${manage && data ? card('Create next revision', form('purchase.save', '/app/purchase-orders/{id}', h`${hidden('order', id)}${hidden('revision', order.current_revision)}${factsFields(data, actor, current.snapshot)}${area('Reason for purchase', 'reason', { value: current.snapshot.reason })}${quoteChoices(data.quotes, current.snapshot)}<p>Saving changes requires approval again, including after an earlier email submission.</p>`, 'Save next revision', { multipart: true })) : ''}`, { url })
}
