// BUY-006: the buyer's delivery follow-up screen and the vendor follow-up rule.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { showDate, showInstant } from '../dates'
import { OCCASIONS, vendorFollowUp } from '../vendor-follow-up'
import { backLink, card, field, form, h, hidden, table, tag, woNumber } from './html'
import { SEND_LABELS } from './purchase-orders'
import { page } from './shell'

const STATUS: Record<string, string> = { complete: 'Delivered', partial: 'Partly delivered', awaiting: 'Awaiting delivery' }

export async function vendorFollowUpPage(env: Bindings, actor: Actor, url: URL) {
  const data = await vendorFollowUp(env, actor), owner = can(actor, 'site.manage'), rule = data.rule
  const orders = card('Orders sent to vendors', data.orders.length ? table(['Order', 'Promised / actual delivery', 'Acknowledgment', 'Outstanding', 'Status', 'Reminders and escalation'], data.orders.map(row => [
    h`<a href="/app/purchase-orders/${row.orderId}">PO-${row.number}</a> · revision ${row.revision}<span class="gk-sub">${row.supplier.name}${row.supplier.active ? '' : ' · supplier inactive, no reminders'} · ${SEND_LABELS[row.sendState]}</span>${row.work ? h`<span class="gk-sub"><a href="/app/work/${row.work.id}">${woNumber(row.work.number)} ${row.work.title}</a></span>` : ''}`,
    h`Promised ${showDate(row.promisedOn)}${row.deliveries.map(item => h`<span class="gk-sub">Delivered ${showDate(item.day)} · ${item.externalId}${item.backorderNote ? ` · ${item.backorderNote}` : ''}</span>`)}${row.deliveries.length ? '' : h`<span class="gk-sub">No delivery yet</span>`}`,
    row.acknowledgment ? h`${row.acknowledgment.contact} · ${row.acknowledgment.reference}<span class="gk-sub">Buyer-recorded; not independently verified</span>` : 'None recorded',
    h`${row.lines.map((line: any) => h`<span class="gk-sub">${line.description}: ${line.outstanding} of ${line.ordered} ${line.unit}</span>`)}`,
    h`${tag(row.late ? `Late ${row.lateDays} day${row.lateDays === 1 ? '' : 's'}` : STATUS[row.status])}${row.late && row.status === 'partial' ? h`<span class="gk-sub">Partly delivered</span>` : ''}${row.deliveredLateDays ? h`<span class="gk-sub">Delivered ${row.deliveredLateDays} days late</span>` : ''}`,
    h`${row.reminders.map(item => h`<span class="gk-sub">${OCCASIONS[item.occasion as keyof typeof OCCASIONS]} · ${showDate(item.day)} · ${SEND_LABELS[item.state]}</span>`)}${row.escalations.length ? h`<span class="gk-sub">Escalated to ${row.escalations.map(item => item.recipient).join(', ')} · ${showInstant(row.escalations[0].created_at, actor.zone)}</span>` : ''}${row.reminders.length || row.escalations.length ? '' : 'None'}`,
  ]), 'Vendor delivery follow-up', { wrap: [0, 1, 2, 3, 5] }) : h`<p>No orders have been submitted to a vendor.</p>`)
  const pending = card('Next run (preview)', !rule ? h`<p>No vendor follow-up rule is configured, so no reminders or escalations are made.</p>` : data.pending.length
    ? h`<ul class="gk-plain-list">${data.pending.map((item: any) => h`<li>PO-${item.number} revision ${item.revision}: ${item.kind === 'escalation' ? 'escalate the late delivery holding its work to the planners' : `email the vendor · ${OCCASIONS[item.occasion as keyof typeof OCCASIONS]}`}</li>`)}</ul><p class="gk-muted">Preview only. No changes made.</p>`
    : h`<p>Nothing is due today.</p>`)
  const settings = card('Vendor follow-up rule', h`<p>${rule ? `Revision ${rule.number}: remind the vendor ${rule.acknowledgment_days} day${rule.acknowledgment_days === 1 ? '' : 's'} after sending when no acknowledgment is recorded, and once delivery is ${rule.late_days} day${rule.late_days === 1 ? '' : 's'} late; escalate to the planners once it is ${rule.escalation_days} day${rule.escalation_days === 1 ? '' : 's'} late and holds open linked work.` : 'Not configured.'}</p>
    <p>Each reminder is one email to the order's vendor address through installation mail, never resent. Provider acceptance does not confirm mailbox delivery or vendor agreement. Escalations are in-app notices to every active lead (the owners when there is none). <a href="/app/automation#rule-vendor">Pause, resume or catch up</a>; pausing keeps every order and its outstanding quantities.</p>
    ${owner ? form('vendor.rule', '/app/vendor-follow-up', h`${hidden('rule', rule?.number ?? 0)}<div class="gk-grid">${field('Acknowledgment reminder after sending (days)', 'acknowledgmentDays', { type: 'number', value: String(rule?.acknowledgment_days ?? 2) })}${field('Late reminder after the promised day (days)', 'lateDays', { type: 'number', value: String(rule?.late_days ?? 1) })}${field('Escalate to planners when late (days)', 'escalationDays', { type: 'number', value: String(rule?.escalation_days ?? 2) })}</div>`, 'Approve rule', { secondary: true }) : ''}`, { id: 'rule' })
  return page(env, 'Vendor follow-up', actor, h`${backLink('/app/purchase-orders', 'Purchase orders')}<div class="gk-head"><div><h1>Vendor follow-up</h1><p class="gk-lede">Promised and actual deliveries, acknowledgments, partial receipts and late orders.</p></div></div>
    <p>${data.autoBuyLimits} <a href="/app/replenishment">Replenishment envelopes</a></p>${orders}<div class="gk-columns"><div class="gk-col-main">${settings}</div><div class="gk-col-side">${pending}</div></div>`, { url })
}
