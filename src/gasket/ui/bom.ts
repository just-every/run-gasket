// ASSET-006: the bill of materials card: the current revision's lines with
// stock and whether each part and alternate fits this asset's serial, the
// tools, earlier revisions, and (for leads on the asset page) the form that
// saves a new revision.
import type { bomOf } from '../bom'
import { showInstant } from '../dates'
import { amount, card, field, form, h, hidden, select, table, tag } from './html'

type Bom = NonNullable<Awaited<ReturnType<typeof bomOf>>>
type Line = Bom['lines'][number]

const span = (row: { serialFrom: string | null; serialTo: string | null; modelFrom: string | null; modelTo: string | null }) => [
  row.serialFrom || row.serialTo ? `serials ${row.serialFrom ?? 'any'} to ${row.serialTo ?? 'any'}` : 'any serial',
  ...(row.modelFrom || row.modelTo ? [`models ${row.modelFrom ?? 'any'} to ${row.modelTo ?? 'any'}`] : []),
].join('; ')
const fit = (row: Omit<Line, 'alternates' | 'quantity'>, serial: string | null, model: string | null) => row.fits ? '' : h` ${tag('Does not fit')}<span class="gk-sub">Fits ${span(row)}; this asset is ${serial ?? 'without a serial'}${row.modelFrom || row.modelTo ? `, model ${model ?? 'unknown'}` : ''}</span>`

export function bomCard(bom: Bom | null, zone: string, form_: unknown = '') {
  const body = bom ? h`<p class="gk-sub">Revision ${bom.revision}${bom.note ? ` · ${bom.note}` : ''} · ${bom.createdBy ?? '—'} · ${showInstant(bom.createdAt, zone)}</p>
    ${table(['Part', 'Needed', 'Available', 'Approved alternates'], bom.lines.map(line => [h`${line.part.name}<span class="gk-sub">${line.part.number} · ${span(line)}</span>${fit(line, bom.serial, bom.model)}`, amount(line.quantity, line.part.unit),
      h`${amount(line.available, line.part.unit)}${line.short ? h` ${tag('Out of stock')}` : ''}`,
      line.alternates.length ? h`${line.alternates.map(alt => h`<span class="gk-sub">${alt.part.number} ${alt.part.name}: ${amount(alt.available, alt.part.unit)} available · ${span(alt)}${alt.fits ? '' : ` · does not fit this ${!alt.serialFits && !alt.modelFits ? 'serial and model' : !alt.modelFits ? 'model' : 'serial'}`}</span>`)}` : h`<span class="gk-muted">None</span>`]), 'Bill of materials', { wrap: [0, 3] })}
    <p><b>Tools:</b> ${bom.tools.length ? bom.tools.join(', ') : 'none listed'}.</p>
    ${bom.revisions.length > 1 ? h`<p class="gk-sub">Earlier revisions: ${bom.revisions.slice(1).map(row => `${row.number} (${row.createdBy ?? '—'}${row.note ? `, ${row.note}` : ''})`).join('; ')}</p>` : ''}`
    : h`<p class="gk-muted">No bill of materials yet.</p>`
  return card('Bill of materials', h`${body}${form_}`, { id: 'bom' })
}

/** A lead's form for a new revision, prefilled from the current one; four line rows and four alternate rows. */
export function bomForm(bom: Bom | null, assetId: string, back: string, parts: { id: string; number: string; name: string }[]) {
  const options = parts.map(part => ({ value: part.id, label: `${part.number} ${part.name}` }))
  const lines = bom?.lines ?? [], alternates = lines.flatMap(line => line.alternates.map(alt => ({ for: line.part.id, ...alt })))
  const rows = Math.max(4, lines.length + 1), altRows = Math.max(4, alternates.length + 1)
  return form('bom.revise', back, h`<p class="gk-sub">Serial and model bounds are inclusive, in natural order. Leave bounds blank for no restriction; use the same model at both ends for an exact match. Unknown identities never match a restricted range.</p>${hidden('asset', assetId)}${hidden('revision', bom?.revision ?? 0)}
    ${Array.from({ length: rows }, (_, index) => { const line = lines[index]; return h`<div class="gk-grid">${select('Part', 'part', options, line?.part.id ?? '', { required: false, blank: 'No part' })}${field('Needed', 'quantity', { required: false, value: line?.quantity ?? '', attrs: 'inputmode="decimal"' })}${field('Serial from', 'serialFrom', { required: false, value: line?.serialFrom ?? '' })}${field('Serial to', 'serialTo', { required: false, value: line?.serialTo ?? '' })}${field('Model from', 'modelFrom', { required: false, value: line?.modelFrom ?? '' })}${field('Model to', 'modelTo', { required: false, value: line?.modelTo ?? '' })}</div>` })}
    ${Array.from({ length: altRows }, (_, index) => { const alt = alternates[index]; return h`<div class="gk-grid">${select('Alternate for', 'alternateFor', options, alt?.for ?? '', { required: false, blank: 'No line' })}${select('Approved alternate', 'alternate', options, alt?.part.id ?? '', { required: false, blank: 'No alternate' })}${field('Serial from', 'alternateFrom', { required: false, value: alt?.serialFrom ?? '' })}${field('Serial to', 'alternateTo', { required: false, value: alt?.serialTo ?? '' })}${field('Model from', 'alternateModelFrom', { required: false, value: alt?.modelFrom ?? '' })}${field('Model to', 'alternateModelTo', { required: false, value: alt?.modelTo ?? '' })}</div>` })}
    <div class="gk-grid">${Array.from({ length: Math.max(3, (bom?.tools.length ?? 0) + 1) }, (_, index) => field('Tool', 'tool', { required: false, value: bom?.tools[index] ?? '' }))}</div>${field('What changed', 'note', { required: false })}`, 'Save new revision', { secondary: true })
}
