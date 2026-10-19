// ASSET-007: the asset page's lifecycle card: purchase, commissioning,
// warranty, replacement value, service agreements, disposal and the repair
// versus replacement comparison, with the lead's forms and the ledger handoff.
import { DISPOSAL_METHODS } from '../lifecycle'
import { showDate } from '../dates'
import { area, card, field, form, h, hidden, select, table, tag } from './html'

const usd = (cents: number | null | undefined) => cents === null || cents === undefined ? '—' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dollars = (cents: number | null | undefined) => cents === null || cents === undefined ? '' : (cents / 100).toFixed(2)
const day = (value: string | null | undefined) => value ? showDate(value) : '—'

export function lifecycleCard(asset: any, manage: boolean, exportable: boolean, back: string) {
  const { facts: f, agreements, comparison: c } = asset.lifecycle
  const facts = h`<dl>${([['Purchased', f?.purchased_on ? h`${day(f.purchased_on)} · ${usd(f.purchase_cents)}${f.supplier ? ` from ${f.supplier}` : ''}` : '—'], ['Commissioned', day(f?.commissioned_on)],
    ['Warranty', f?.warranty_until ? `until ${day(f.warranty_until)}${f.warranty_terms ? `: ${f.warranty_terms}` : ''}` : '—'], ['Replacement value', f?.replacement_cents ? `${usd(f.replacement_cents)} (${f.replacement_basis})` : '—'],
    ...(f?.disposal_method ? [['Disposal', `${f.disposal_method} on ${day(f.disposed_on)}${f.disposal_cents !== null ? `, proceeds ${usd(f.disposal_cents)}` : ''}`]] : [])] as [string, unknown][]).map(([key, value]) => h`<dt>${key}</dt><dd>${value}</dd>`)}</dl>`
  const compare = h`<p><strong>Repair cost to date:</strong> ${c.repairCents === null ? 'unknown (no cost entries on its work)' : usd(c.repairCents)} across ${c.costedWorkOrders} of ${c.workOrders} work orders · <strong>failure downtime:</strong> ${c.failureMinutes} minutes in ${c.failures} stops${c.repairPercentOfReplacement !== null ? h` · <strong>${c.repairPercentOfReplacement}%</strong> of the replacement value` : ''}</p>
    <p class="gk-sub">Depreciation and book value stay in the connected ledger.</p>`
  const list = agreements.length ? table(['Provider', 'Term', 'Annual cost', 'Scope'], agreements.map((row: any) => [h`${row.provider}${row.reference ? h`<span class="gk-sub">${row.reference}</span>` : ''}`, h`${day(row.starts_on)} to ${day(row.ends_on)}${row.active ? h` ${tag('Active')}` : ''}`, usd(row.annual_cents), row.scope]), 'Service agreements', { wrap: [0, 3] }) : h`<p class="gk-muted">No service agreements recorded.</p>`
  const forms = manage ? h`<details class="gk-details"><summary>Record lifecycle facts</summary>${form('asset.lifecycle', back, h`${hidden('asset', asset.id)}${f ? hidden('revision', f.revision) : ''}<div class="gk-grid">${field('Purchased on', 'purchasedOn', { type: 'date', value: f?.purchased_on ?? '', required: false })}${field('Purchase cost (USD)', 'purchaseCost', { value: dollars(f?.purchase_cents), required: false })}${field('Supplier', 'supplier', { value: f?.supplier ?? '', required: false })}${field('Commissioned on', 'commissionedOn', { type: 'date', value: f?.commissioned_on ?? '', required: false })}${field('Warranty until', 'warrantyUntil', { type: 'date', value: f?.warranty_until ?? '', required: false })}${field('Replacement value (USD)', 'replacementValue', { value: dollars(f?.replacement_cents), required: false })}</div>${field('Warranty terms', 'warrantyTerms', { value: f?.warranty_terms ?? '', required: false })}${area('Replacement value basis', 'replacementBasis', { value: f?.replacement_basis ?? '', required: false })}`, 'Save', { secondary: true })}</details>
    <details class="gk-details"><summary>Add a service agreement</summary>${form('asset.agreement', back, h`${hidden('asset', asset.id)}<div class="gk-grid">${field('Provider', 'provider')}${field('Reference', 'reference', { required: false })}${field('Starts', 'startsOn', { type: 'date' })}${field('Ends', 'endsOn', { type: 'date' })}${field('Annual cost (USD)', 'annualCost', { required: false })}</div>${field('Scope', 'scope')}`, 'Add agreement', { secondary: true })}</details>` : ''
  return card('Lifecycle and replacement', h`${facts}${compare}${list}${forms}${exportable ? h`<p><a class="gk-button gk-secondary" href="/app/assets/${asset.id}/ledger.csv">Download ledger handoff (CSV)</a></p>` : ''}`, { id: 'lifecycle' })
}

/** The disposal fields of the retire form. */
export const disposalFields = h`<div class="gk-grid">${select('Disposal', 'disposalMethod', DISPOSAL_METHODS.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })), '', { required: false, blank: 'Not recorded' })}${field('Disposed on', 'disposedOn', { type: 'date', required: false })}${field('Proceeds (USD)', 'disposalProceeds', { required: false })}</div>`
