// BUY-004 uses the existing purchase-order page and shared form/table patterns.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { usd } from '../bad-actors'
import { showInstant } from '../dates'
import { partList } from '../parts'
import { purchaseReceiving } from '../receiving'
import { area, card, field, fileField, form, h, hidden, select, table } from './html'

export async function receivingPanel(env: Bindings, actor: Actor, order: any) {
  const data = await purchaseReceiving(env, actor, order.id)
  const manage = can(actor, 'register.manage')
  const parts = manage ? await partList(env, actor) : []
  const destination = `/app/purchase-orders/${order.id}`
  return h`${card('Receiving and backorders', h`<p>Receipts match an authorized PO revision. Quarantined goods are held apart from usable stock. Supplier returns stay in the receipt history; they do not claim a credit, bill or payment.</p>
    ${data.revisions.map((revision: any) => h`<details class="gk-details"${revision.receivable ? h` open` : ''}><summary>Revision ${revision.revision} · ${revision.receivable ? 'Authorized receiving' : 'Receiving unavailable'}</summary>
      ${table(['Line', 'Ordered', 'Received', 'Usable', 'Quarantine', 'Returned', 'Outstanding'], revision.lines.map((line: any) => [line.description, `${line.ordered} ${line.unit}`, line.received, line.usable, line.quarantine, line.returned, line.outstanding]), 'PO line receiving balances', { wrap: [0] })}
      ${manage && revision.receivable ? form('receipt.receive', destination, h`${hidden('order', order.id)}${hidden('revisionId', revision.id)}${field('Delivery receipt identity', 'externalId', { hint: 'Use the supplier delivery number. Replaying the same receipt leaves stock unchanged; a changed payload is refused.' })}
        ${revision.lines.map((line: any) => h`<fieldset><legend>Line ${line.line + 1} · ${line.description}</legend>${hidden('line', line.line)}
          ${select('Stock part', 'part', parts.filter(part => part.unit === line.unit).map(part => ({ value: part.id, label: `${part.number} · ${part.name} (${part.unit})` })), '', { required: false, blank: line.kind === 'part' ? 'Choose matching stock part' : 'No stock part (service or repair)' })}
          <div class="gk-grid">${field('Delivered quantity', 'quantity', { required: false, attrs: 'inputmode="decimal"', hint: `Outstanding: ${line.outstanding} ${line.unit}. Leave blank to omit this line.` })}${field('Quarantined quantity', 'quarantine', { required: false, value: '0', attrs: 'inputmode="decimal"' })}</div>
          ${field('Bin', 'bin', { required: false })}${field('Lot', 'lot', { required: false })}${field('Serial', 'serial', { required: false, hint: 'A serialized line contains exactly one whole unit. Use separate deliveries for distinct serials.' })}</fieldset>`)}
        <div class="gk-grid">${field('Delivery freight (USD)', 'freight', { value: '0.00', attrs: 'inputmode="decimal"' })}${field('Delivery sales tax (USD)', 'salesTax', { value: '0.00', attrs: 'inputmode="decimal"' })}</div>
        <p>Charges are allocated by delivered line value; whole-cent remainders follow line order. Quarantined value lands only when released.</p>
        ${area('Inspection or delivery note', 'note', { required: false })}${area('Backorder details', 'backorderNote', { required: false })}${fileField('Packing slip', 'packingSlip', { accept: '.pdf,.png,.jpg,.jpeg,.txt', hint: 'Original evidence is retained with its SHA-256 digest.' })}`, 'Record delivery', { multipart: true }) : ''}</details>`)}
  `)}${data.receipts.map((receipt: any) => card(`Receipt ${receipt.external_id}`, h`<p>PO revision ${receipt.revision} · ${receipt.created_by_name} · ${showInstant(receipt.created_at, actor.zone)}</p><p>${receipt.note} ${receipt.backorder_note}</p>
    <p>Freight ${usd(receipt.freight_cents)} · sales tax ${usd(receipt.sales_tax_cents)}</p>
    <ul class="gk-plain-list">${receipt.evidence.map((file: any) => h`<li><a href="/app/receipt-evidence/${file.id}">${file.filename}</a><span class="gk-sub gk-cell">SHA-256 ${file.sha256}</span></li>`)}</ul>
    ${receipt.lines.map((line: any) => h`<details class="gk-details" open><summary>Line ${line.line_index + 1} · ${line.bin || 'No bin'} · ${line.lot || 'No lot'} · ${line.serial || 'No serial'}</summary>
      <dl><dt>Delivered</dt><dd>${line.quantity}</dd><dt>Usable</dt><dd>${line.usable}</dd><dt>Quarantine</dt><dd>${line.quarantine}</dd><dt>Returned to supplier</dt><dd>${line.returned}</dd><dt>Landed delivery value</dt><dd>${usd(line.value_cents)}</dd></dl>
      ${line.events?.length ? table(['Event', 'From', 'Quantity', 'Reason', 'Who', 'When'], line.events.map((event: any) => [event.kind, event.source, event.quantity, event.reason, event.actor_name, showInstant(event.at, actor.zone)]), 'Inspection and supplier-return history', { wrap: [3, 4] }) : ''}
      ${manage ? form('receipt.inspect', destination, h`${hidden('receiptLine', line.id)}${select('Inspection action', 'kind', [{ value: 'release', label: 'Release quarantine to usable stock' }, { value: 'return', label: 'Return goods to supplier' }])}${select('Source stock', 'source', [{ value: 'quarantine', label: 'Quarantine' }, { value: 'usable', label: 'Usable' }])}${field('Quantity', 'quantity', { attrs: 'inputmode="decimal"' })}${area('Inspection or return reason', 'reason')}`, 'Record inspection', { secondary: true }) : ''}</details>`)}
  `))}`
}
