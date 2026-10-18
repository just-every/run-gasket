// Move in from MaintainX: upload, dry run, apply, and the journal with undo.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { showInstant } from '../dates'
import type { Input } from '../input'
import { importJobs, previewImport } from '../movein/maintainx'
import { showNumber } from '../quantity'
import { backLink, card, details, fileField, form, h, hidden, select, table, tag } from './html'
import { page } from './shell'

const STATE: Record<string, string> = { completed: 'Completed', undone: 'Undone', applying: 'Applying', failed: 'Failed', rolled_back: 'Rolled back', queued: 'Queued', undoing: 'Undoing', rolling_back: 'Rolling back' }

export async function moveInPage(env: Bindings, actor: Actor, url: URL) {
  const jobs = await importJobs(env, actor)
  const upload = card('Upload MaintainX exports', h`<form method="post" action="/app/move-in/preview" enctype="multipart/form-data" class="gk-form">
    ${fileField('Asset export (CSV)', 'assets', { required: true, accept: '.csv', hint: 'Reporting → Export Data → Assets, all columns.' })}
    ${fileField('Part export (CSV)', 'parts', { accept: '.csv', hint: 'Optional. Reporting → Export Data → Parts.' })}
    ${fileField('Meter reading export (CSV)', 'readings', { accept: '.csv', hint: 'Optional. Reporting → Export Data → Meter Readings, manual meters.' })}
    ${select('Dates in the reading export', 'dateFormat', [{ value: 'MDY', label: 'Month first (MaintainX default, 04/28/2026)' }, { value: 'DMY', label: 'Day first (28/04/2026)' }], 'MDY')}
    <div class="gk-actions"><button type="submit">Dry run</button></div></form><p class="gk-hint">A dry run reads the files and writes nothing.</p>`, { id: 'upload' })
  const journal = card('Move-in journal', jobs.length ? table(['Applied', 'State'], jobs.map(job => [h`${showInstant(job.appliedAt, actor.zone)}<span class="gk-sub">${job.by ?? '—'} · ${showNumber(job.effects)} record${job.effects === 1 ? '' : 's'}</span>`,
    h`${tag(STATE[job.state] ?? job.state)}${job.state === 'completed' ? (job.blockers.length ? h`<span class="gk-sub">Undo blocked: ${job.blockers.length} record(s) were edited or built on since</span>` : form('import.job', '/app/move-in', h`${hidden('job', job.id)}${hidden('action', 'undo')}`, 'Undo this move-in', { secondary: true, layout: 'gk-inline' })) : ''}`]), 'Move-ins', { wrap: [1] }) : h`<p class="gk-muted">Nothing moved in yet.</p>`, { id: 'journal' })
  return page(env, 'Move in from MaintainX', actor, h`<h1>Move in from MaintainX</h1><p class="gk-lede">Bring your asset register, spares and meter history across. Review the dry run before anything is written; you can undo a move-in until Gasket records build on it.</p><div class="gk-columns"><div class="gk-col-main">${upload}</div><div class="gk-col-side">${journal}</div></div>`, { url })
}

export async function previewPage(env: Bindings, actor: Actor, input: Input, url: URL) {
  const preview = await previewImport(env, actor, input)
  const counts = preview.create
  const summary = h`<ul class="gk-tiles" aria-label="Would create">${[['Assets', counts.assets], ['Meters', counts.meters], ['Readings', counts.readings], ['Parts', counts.parts], ['Rejected rows', preview.rejected.length]].map(([label, n]) => h`<li><span class="gk-tile-n">${showNumber(n)}</span><span>${label}</span></li>`)}</ul>`
  const apply = form('import.apply', '/app/move-in', h`${hidden('fingerprint', preview.fingerprint)}${Object.entries(preview.carry).map(([key, value]) => hidden(key, value))}`, 'Apply this move-in')
  return page(env, 'Dry run', actor, h`${backLink('/app/move-in', 'Move in')}<h1>Dry run: nothing has been written</h1>${summary}${preview.unchanged ? h`<p class="gk-muted">Already moved in, unchanged: ${preview.unchanged} row${preview.unchanged === 1 ? '' : 's'}. Applying again leaves them as they are.</p>` : ''}
    ${card('Rejected rows', preview.rejected.length ? table(['Where', 'Why'], preview.rejected.map(row => [row.location, row.reason]), 'Rejected rows', { wrap: [1] }) : h`<p class="gk-muted">No rows rejected.</p>`, { id: 'rejected' })}
    ${card('Needs your attention', preview.attention.length ? table(['Where', 'What'], preview.attention.map(row => [row.location, row.reason]), 'Attention', { wrap: [1] }) : h`<p class="gk-muted">Nothing needs attention.</p>`, { id: 'attention' })}
    ${card('What is not carried', h`<ul class="gk-plain-list">${preview.gaps.map(gap => h`<li>${gap}</li>`)}</ul>`, { id: 'gaps' })}
    ${card('Apply', h`<p>Applying writes exactly this dry run. If the files change, run the dry run again.</p>${apply}${details([['Reviewed fingerprint', preview.fingerprint]])}`, { id: 'apply' })}`, { url })
}
