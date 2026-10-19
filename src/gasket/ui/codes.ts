// ASSET-004: the central code catalog and failures by code, with what is
// unclassified and where an asset's evidence disagrees with its state.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { CODE_KINDS, codeList, failureReport } from '../codes'
import { card, field, form, h, hidden, select, table, tag } from './html'
import { page } from './shell'

export const CODE_KIND: Record<string, string> = { criticality: 'Criticality', failure_mode: 'Failure mode', cause: 'Cause', remedy: 'Remedy', risk: 'Risk' }

export async function codesPage(env: Bindings, actor: Actor, url: URL) {
  const codes = await codeList(env)
  const manage = can(actor, 'register.manage')
  const report = can(actor, 'board.read') ? await failureReport(env, actor) : null
  const counts = new Map((report?.codes ?? []).map(code => [code.id, code]))
  const kinds = CODE_KINDS.map(kind => {
    const rows = codes.filter(code => code.kind === kind)
    const list = rows.length ? table(['Order', 'Code', 'Import names', ...(kind !== 'criticality' && report ? ['Findings', 'Moved-in work'] : [])], rows.map(code => [String(code.position),
      h`${code.label}<span class="gk-sub">${code.key}${code.retired ? h` · ${tag('Retired')}` : ''}</span>`, code.importNames.join(', ') || '—',
      ...(kind !== 'criticality' && report ? [String(counts.get(code.id)?.findings ?? 0), String(counts.get(code.id)?.history ?? 0)] : [])]), CODE_KIND[kind], { wrap: [1, 2] }) : h`<p class="gk-muted">No codes yet.</p>`
    const active = rows.filter(code => !code.retired).map(code => ({ value: code.key, label: code.label }))
    const forms = manage ? h`${form('code.set', '/app/codes', h`${hidden('kind', kind)}<div class="gk-grid">${field('Key', 'key', { hint: 'Lowercase, never changes. An existing key relabels that code.' })}${field('Label', 'label')}${field('Import names', 'importNames', { required: false, hint: 'Comma-separated values an import maps onto this code.' })}</div>`, 'Save code', { secondary: true })}
      ${active.length > 1 ? form('code.move', '/app/codes', h`${hidden('kind', kind)}<div class="gk-grid">${select('Code', 'key', rows.map(code => ({ value: code.key, label: code.label })))}${field('Move to position', 'position', { type: 'number', value: 1 })}</div>`, 'Move', { secondary: true }) : ''}
      ${active.length ? form('code.retire', '/app/codes', h`${hidden('kind', kind)}<div class="gk-grid">${select('Code', 'key', active)}${field('Reason', 'reason')}</div>`, 'Retire code', { secondary: true }) : ''}` : ''
    return card(CODE_KIND[kind], h`${list}${forms}`, { id: kind })
  })
  const failures = report ? card('Unclassified and disagreeing evidence', h`<p>${report.unclassified.findings} finding${report.unclassified.findings === 1 ? '' : 's'} without a failure mode.</p>
    ${report.unclassified.history.length ? table(['Moved-in work', 'Asset', 'MaintainX categories'], report.unclassified.history.map(row => [`#${row.sourceRef} ${row.title}`, row.asset, row.categories ?? '—']), 'Unclassified moved-in work', { wrap: [0, 2] }) : h`<p class="gk-muted">All moved-in work has a failure mode.</p>`}
    ${report.conflicts.length ? h`<ul class="gk-plain-list">${report.conflicts.map(row => h`<li>${tag('Evidence disagrees')} <a href="/app/assets/${row.asset}">${row.name}</a></li>`)}</ul>` : h`<p class="gk-muted">No asset's evidence disagrees with its declared state.</p>`}`, { id: 'unclassified' }) : ''
  return page(env, 'Codes and failures', actor, h`<h1>Codes and failures</h1><p class="gk-lede">One list of criticality levels and failure mode, cause, remedy and risk codes for the whole site. Records keep the code they were given; a retired code stays readable.</p><div class="gk-columns"><div class="gk-col-main">${failures}${kinds.slice(1)}</div><div class="gk-col-side">${kinds[0]}</div></div>`, { url })
}
