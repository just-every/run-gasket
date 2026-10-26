// PART-009: the stores report page.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { usd } from '../bad-actors'
import { showInstant } from '../dates'
import { storesReport } from '../stores'
import { amount, card, field, h, table, woNumber } from './html'
import { page } from './shell'

const share = (value: number | null) => value === null ? '—' : `${value}%`

export async function storesPage(env: Bindings, actor: Actor, url: URL) {
  const r = await storesReport(env, actor, url)
  const query = `from=${r.from}&to=${r.to}`
  const filter = h`<form method="get" action="/app/stores" class="gk-form"><div class="gk-grid">${field('From', 'from', { type: 'date', value: r.from })}${field('To', 'to', { type: 'date', value: r.to })}</div><div class="gk-actions"><button type="submit" class="gk-secondary">Show</button></div></form>`
  const partLink = (part: { id: string; number: string; name: string }) => h`<a href="/app/parts/${part.id}">${part.name}</a><span class="gk-sub">${part.number}</span>`
  const summary = card('Stock and turns', table(['Opening value', 'Closing value', 'Average value', 'Issued less returned', 'Turns'], [[usd(r.value.openingCents), usd(r.value.closingCents), usd(r.value.averageCents), usd(r.value.netIssuedCents), r.value.turns === null ? '—' : String(r.value.turns)]], 'Stock and turns'),
    { id: 'turns', extra: h`<a href="/app/parts/valuation.csv?${query}">Valuation download</a>` })
  const stockouts = card('Stockouts', h`<p>${r.stockouts.withStockout} of ${r.stockouts.stocked} stocked parts ran out (${share(r.stockouts.percent)}).</p>
    ${r.stockouts.events.length ? table(['Part', 'When', 'Last movement'], r.stockouts.events.map(event => [partLink(event.part), showInstant(event.at, actor.zone), event.workOrder ? woNumber(event.workOrder) : event.kind]), 'Stockouts', { wrap: [0] }) : ''}
    ${r.stockouts.outNow.length ? h`<p class="gk-muted">Out of stock at the end: ${r.stockouts.outNow.map(part => part.number).join(', ')}</p>` : ''}`, { id: 'stockouts' })
  const demand = card('Demand', h`${r.demand.byAsset.length ? table(['Asset', 'Parts', 'Value'], r.demand.byAsset.map(row => [h`<a href="/app/assets/${row.id}">${row.name}</a><span class="gk-sub">${row.tag}</span>`, row.parts.map(part => `${part.quantity} ${part.unit} ${part.number}`).join(' · '), usd(row.valueCents)]), 'Demand by asset', { wrap: [1] }) : h`<p class="gk-muted">No parts used in this period.</p>`}
    ${r.demand.byWorkOrder.length ? table(['Work order', 'Parts', 'Value'], r.demand.byWorkOrder.map(row => [h`<a href="/app/work/${row.id}">${woNumber(row.number)}</a>${row.asset ? h`<span class="gk-sub">${row.asset}</span>` : ''}`, row.parts.map(part => `${part.quantity} ${part.unit} ${part.number}`).join(' · '), usd(row.valueCents)]), 'Demand by work order', { wrap: [1] }) : ''}
    ${r.demand.committed.length ? h`<p class="gk-muted">Reserved for work now: ${r.demand.committed.map(part => `${amount(part.reserved, part.unit)} ${part.number}`).join(', ')}</p>` : ''}`, { id: 'demand' })
  const idle = (title: string, id: string, rows: typeof r.slow, empty: string) => card(title, rows.length ? table(['Part', 'On hand', 'Last issued'], rows.map(row => [partLink(row), amount(row.onHand, row.unit), row.lastIssueAt ? showInstant(row.lastIssueAt, actor.zone) : 'Never']), title, { wrap: [0] }) : h`<p class="gk-muted">${empty}</p>`, { id })
  const counts = card('Count accuracy', h`<p>${r.counts.hits} of ${r.counts.counted} counts matched the expected quantity (${share(r.counts.percent)}).</p>`, { id: 'count-accuracy' })
  const movedIn = r.movedIn.length ? card('Moved in from MaintainX', h`<p class="gk-muted">Opening stock moved in is part of today's balances and never of demand.</p>${table(['Part', 'Opening stock moved in'], r.movedIn.map(row => [partLink(row), amount(row.openingQuantity, row.unit)]), 'Moved in', { wrap: [0] })}`, { id: 'moved-in' }) : ''
  const replenishment = card('Open replenishment', h`<p><a href="/app/replenishment">Replenishment policies and follow-up</a>. Current open documents, independent of the movement date filter.</p>${r.replenishment.open.length ? table(['Part / location', 'Purchase order', 'Age', 'Outstanding / quarantine', 'Due'], r.replenishment.open.map(row => [h`<a href="/app/parts/${row.part_id}">${row.part_number} ${row.part_name}</a><span class="gk-sub">${row.location ?? 'Current storeroom'}</span>`, h`<a href="/app/purchase-orders/${row.order_id}">PO-${row.number}</a>`, `${row.ageDays} days`, `${row.outstanding} / ${row.quarantine} ${row.unit}`, `${row.due_on}${row.overdue ? ' · Follow up' : ''}${row.changed ? ' · Buyer revision review' : ''}`]), 'Open replenishment', { wrap: [0, 3, 4] }) : h`<p>No open replenishment documents.</p>`}`, { id: 'replenishment' })
  return page(env, 'Stores', actor, h`<div class="gk-head"><div><h1>Stores</h1><p class="gk-lede">${r.site ?? ''} · ${r.from} to ${r.to}, both days included. <a href="/app/stores/movements.csv?${query}">Download source movements</a></p></div></div>${filter}
    <div class="gk-columns"><div class="gk-col-main">${summary}${card('Expiring lots', h`<p>${r.expiryBasis}</p>${r.expiringLots.length ? table(['Part', 'Bin and lot', 'Serial', 'Expiry', 'Source stock'], r.expiringLots.map(row => [partLink({id:row.part_id,number:row.number,name:row.name}), h`<a href="/app/parts/${row.part_id}#stock-sources">${row.bin || 'Unspecified'} · ${row.lot || 'No lot'}</a>`, row.serial || '—', h`${row.expires_on}${row.expired ? ' · Expired' : ''}`, amount(row.onHand,row.unit)]), 'Expiring lots', {wrap:[0,1,2]}) : h`<p>No recorded lots expire in this window.</p>`}`, {id:'expiring-lots'})}${replenishment}${stockouts}${demand}</div><div class="gk-col-side">${counts}${idle('Slow stock', 'slow', r.slow, 'Everything on hand was issued in this period.')}${idle('Dead stock', 'dead', r.dead, 'Everything on hand was issued in the last 365 days.')}${movedIn}</div></div>`, { url })
}
