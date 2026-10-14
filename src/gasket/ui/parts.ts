// Parts: on-hand, receiving and physical counts, and each part's movements.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { showInstant } from '../dates'
import { partDetail, partList } from '../parts'
import { showNumber } from '../quantity'
import { amount, backLink, band as headerBand, card, field, form, h, hidden, page, table, tag, woNumber } from './html'

const KIND: Record<string, string> = { opening: 'Opening stock', receive: 'Received', issue: 'Issued', return: 'Returned', count: 'Physical count' }

export async function partsPage(env: Bindings, actor: Actor, url: URL) {
  const parts = await partList(env, actor)
  const manage = can(actor, 'register.manage')
  const list = parts.length ? table(['Part', 'On hand', 'Minimum', 'Location', ''], parts.map(part => [
    h`<a href="/app/parts/${part.id}">${part.name}</a><span class="gk-sub">${part.number}${part.origin === 'import' ? ' · moved in' : ''}</span>`, amount(part.onHand, part.unit), amount(part.minimum, part.unit), part.location ?? '—', part.below ? tag('Below minimum') : '']), 'Parts', { wrap: [0, 3] })
    : h`<div class="gk-empty"><h2>No parts yet</h2><p>${manage ? 'Add the spares you keep below, or move in your MaintainX part export.' : 'A maintenance lead keeps the parts list.'}</p></div>`
  const create = manage ? card('Add a part', form('part.create', '/app/parts/{id}', h`<div class="gk-grid">${field('Part number', 'number')}${field('Name', 'name')}${field('Unit', 'unit', { value: 'each', hint: 'each, L, m, kg…' })}${field('Minimum on hand', 'minimum', { required: false, value: '0', attrs: 'inputmode="decimal"' })}${field('Location', 'location', { required: false })}</div>`, 'Add part'), { id: 'add-part' }) : ''
  return page('Parts', actor, h`<div class="gk-columns"><div class="gk-col-main"><div class="gk-head"><div><h1>Parts</h1><p class="gk-lede">Spares on the shelf, what work used them, and physical counts.</p></div></div>${list}</div><div class="gk-col-side">${create}</div></div>`, { url })
}

export async function partPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const part = await partDetail(env, actor, id)
  const back = `/app/parts/${part.id}`
  const manage = can(actor, 'register.manage')
  const band = headerBand({ id: 'part-name', eyebrow: part.number, title: part.name, facts: [part.location ?? 'No shelf location'], status: part.on_hand < part.minimum_milli ? tag('Below minimum') : '',
    meta: [{ label: 'On hand', value: h`<span class="gk-big">${amount(part.onHand, part.unit)}</span>` }, { label: 'Minimum', value: amount(part.minimum, part.unit) }], art: 'shelf-bin' })
  const moves = card('Movements', part.moves.length ? table(['When', 'Movement', 'Quantity', 'Work order', 'By', 'Note'], part.moves.map((move: any) => [showInstant(move.at, actor.zone), KIND[move.kind],
    move.kind === 'count' ? h`Counted ${amount(move.counted, part.unit)}<span class="gk-sub">variance ${move.quantity_milli > 0 ? '+' : ''}${showNumber(move.quantity)}</span>` : `${move.quantity_milli > 0 ? '+' : ''}${amount(move.quantity, part.unit)}`,
    move.work_order_id ? h`<a href="/app/work/${move.work_order_id}">${woNumber(move.work_order_number)}</a>` : '—', move.actor ?? (move.kind === 'opening' ? 'Move-in' : '—'), move.note ?? '']), 'Movements', { wrap: [5] }) : h`<p class="gk-muted">No movements yet.</p>`, { id: 'moves' })
  const side = manage ? h`${card('Receive stock', form('part.receive', back, h`${hidden('part', part.id)}${field(`Quantity (${part.unit})`, 'quantity', { attrs: 'inputmode="decimal"' })}${field('Note', 'note', { required: false, hint: 'Supplier, docket or reason.' })}`, 'Receive', { secondary: true }), { id: 'receive' })}
    ${card('Record a physical count', form('part.count', back, h`${hidden('part', part.id)}${hidden('seen', part.seen)}${field(`Counted on the shelf (${part.unit})`, 'counted', { attrs: 'inputmode="decimal"' })}${field('Note', 'note', { required: false })}`, 'Record count', { secondary: true }), { id: 'count', extra: h`<span class="gk-count">Records the difference from ${amount(part.onHand, part.unit)}</span>` })}` : ''
  return page(part.name, actor, h`${backLink('/app/parts', 'Parts')}${band}<div class="gk-columns"><div class="gk-col-main">${moves}</div><div class="gk-col-side">${side}</div></div>`, { url })
}
