// The supervisor's board: what is late, waiting, down and low.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { board } from '../board'
import { showDate, showLocal } from '../dates'
import { showNumber } from '../quantity'
import { STATUS, amount, card, h, table, tag, woNumber } from './html'
import { page } from './shell'

const orderRows = (rows: any[], today: string) => rows.map(row => [h`<a href="/app/work/${row.id}"><span class="gk-nowrap">${woNumber(row.number)}</span> · ${row.title}</a>`, h`<a href="/app/assets/${row.asset_id}">${row.asset_name}</a><span class="gk-sub">${row.asset_tag}</span>`, h`${showDate(row.due_date)}${row.due_date < today && row.status !== 'submitted' ? h` ${tag('Overdue')}` : ''}`, row.assignee ?? 'Not assigned', tag(STATUS[row.status])])

export async function boardPage(env: Bindings, actor: Actor, url: URL) {
  const b = await board(env, actor)
  const none = (text: string) => h`<p class="gk-muted">${text}</p>`
  const tiles = h`<ul class="gk-tiles" aria-label="Summary">${[['Overdue', b.overdue.length], ['Waiting for review', b.awaitingReview.length], ['Open follow-ups', b.followUps.length], ['Down now', b.down.length], ['Parts below minimum', b.lowParts.length]].map(([label, count]) => h`<li${label === 'Overdue' && count ? h` class="gk-tile-alert"` : ''}><span class="gk-tile-n">${count}</span><span>${label}</span></li>`)}</ul>`
  const headings = ['Work order', 'Asset', 'Due', 'Assigned to', 'Status']
  return page(env, 'Overdue and downtime', actor, h`<h1>Overdue and downtime</h1><p class="gk-lede">As of ${showDate(b.today)}. Downtime covers ${showDate(b.since)} to today.</p>${tiles}
    <div class="gk-columns"><div class="gk-col-main">
    ${card('Overdue work', b.overdue.length ? table(headings, orderRows(b.overdue, b.today), 'Overdue work', { wrap: [0] }) : none('Nothing is overdue.'), { id: 'overdue' })}
    ${card('Waiting for review', b.awaitingReview.length ? table(headings, orderRows(b.awaitingReview, b.today), 'Waiting for review', { wrap: [0] }) : none('Nothing is waiting for review.'), { id: 'review' })}
    ${card('Open follow-ups', b.followUps.length ? table(headings, orderRows(b.followUps, b.today), 'Open follow-ups', { wrap: [0] }) : none('No open follow-up work.'), { id: 'follow-ups' })}
    </div><div class="gk-col-side">
    ${card('Down now', b.down.length ? table(['Asset', 'Since', 'Reason'], b.down.map(row => [h`<a href="/app/assets/${row.asset_id}">${row.asset_name}</a><span class="gk-sub">${row.asset_tag}${row.number ? ` · ${woNumber(row.number)}` : ''}</span>`, h`${showLocal(row.started_on)}<span class="gk-sub">${showNumber(row.minutesSoFar)} minutes so far</span>`, row.reason]), 'Down now', { wrap: [0, 2] }) : none('Every asset is in service.'), { id: 'down' })}
    ${card('Downtime, last 30 days', b.downtime.length ? table(['Asset', 'Minutes', 'Times down'], b.downtime.map(row => [h`<a href="/app/assets/${row.asset_id}">${row.asset_name}</a><span class="gk-sub">${row.asset_tag}</span>`, showNumber(row.minutes), showNumber(row.events)]), 'Downtime', { wrap: [0] }) : none('No downtime recorded in the last 30 days.'), { id: 'downtime' })}
    ${card('Parts below minimum', b.lowParts.length ? table(['Part', 'On hand', 'Minimum'], b.lowParts.map(part => [h`<a href="/app/parts/${part.id}">${part.name}</a><span class="gk-sub">${part.number}</span>`, amount(part.onHand, part.unit), amount(part.minimum, part.unit)]), 'Low parts', { wrap: [0] }) : none('Every part is at or above its minimum.'), { id: 'low' })}
    </div></div>`, { url })
}
