import { intervalEvidenceCard } from './interval-evidence'
// Agent proposals waiting for a person's decision, and the decisions made.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all } from '../core'
import { showDate, showInstant } from '../dates'
import { proposalList } from '../proposals'
import { card, field, form, h, hidden, tag } from './html'
import { page } from './shell'

const KIND: Record<string, string> = { merge: 'Duplicate part merge', interval: 'PM interval change', reassign: 'Reassignment', schedule: 'Preventive schedule', corrective: 'Corrective work order', count: 'Parts count' }
const LABELS: Record<string, string> = { source: 'Duplicate part', canonical: 'Keep as canonical part', reason: 'Merge reason', outcome: 'Outcome comparison', schedule: 'Schedule', from: 'Evidence from', to: 'Evidence through', peers: 'Peer assets', rollbackPlan: 'Rollback plan', rollbackOf: 'Original approval', workOrder: 'Work order', asset: 'Asset', checklist: 'Checklist', title: 'Title', everyDays: 'Every (days)', meter: 'Meter', everyUnits: 'Every (units)', firstDue: 'First due', firstDueMeter: 'First due at', assignee: 'Maintainer', description: 'Details', due: 'Due', part: 'Part', counted: 'Counted', note: 'Note' }

export async function proposalsPage(env: Bindings, actor: Actor, url: URL) {
  const rows = await proposalList(env, actor)
  // Show the records a proposal names by their business names; the ids stay in Details.
  const [registerNames, workNames, scheduleNames] = await Promise.all([
    all(env, `SELECT id, tag || ' ' || name AS label FROM gk_assets UNION ALL SELECT id, number || ' ' || name FROM gk_parts
      UNION ALL SELECT id, name FROM gk_members UNION ALL SELECT id, name FROM gk_checklists UNION ALL SELECT id, name || ' (' || unit || ')' FROM gk_meters`),
    all(env, "SELECT id, 'WO-' || number || ' ' || title AS label FROM gk_work_orders"),
    all(env, "SELECT id, title AS label FROM gk_schedules"),
  ])
  const names = new Map<string, string>([...registerNames, ...workNames, ...scheduleNames].map(row => [row.id, row.label]))
  const show = (key: string, value: string) => key === 'outcome' ? h`<a href="/api/gasket/outcomes/${value}">Read retained comparison</a>` : key === 'peers' ? value.split(',').map(id => names.get(id.trim()) ?? id.trim()).join('; ') : ['due', 'firstDue'].includes(key) ? showDate(value) : names.get(value) ?? value
  const decider = can(actor, 'proposal.decide')
  // One violet primary per screen: "Approve and run" on the first proposal this person may decide, secondary below it.
  const first = rows.find(row => decider && row.status === 'pending' && row.prepared_by !== actor.id)
  const result = (row: any) => row.kind === 'merge' && row.status === 'approved' ? h`<p><a href="/app/parts/${row.result_id}">Open the canonical part</a></p>` : row.kind === 'reassign' && row.status === 'approved' ? h`<p><a href="/app/work/${row.result_id}">Open the reassigned work order</a></p>` : row.status !== 'approved' || !row.result_id ? '' : row.kind === 'corrective' ? h`<p><a href="/app/work/${row.result_id}">Open the work order it raised</a></p>`
    : ['schedule', 'interval'].includes(row.kind) ? h`<p><a href="/app/schedules">${row.kind === 'interval' ? 'See the revised schedule' : 'See the schedule it created'}</a></p>` : h`<p><a href="/app/parts/${row.payload.part}">See the part's count</a></p>`
  const items = rows.map(row => card(KIND[row.kind], h`<p>${row.reasoning}</p>
    <p class="gk-eyebrow">What it will change</p><dl class="gk-pairs">${Object.entries(row.payload as Record<string, string>).map(([key, value]) => h`<div><dt>${LABELS[key] ?? key}</dt><dd>${show(key, value)}</dd></div>`)}</dl>
    ${row.kind === 'interval' ? intervalEvidenceCard(row, actor) : ''}
    ${row.kind === 'count' && row.basis.quantityDelta !== undefined ? h`<p class="gk-eyebrow">Retained count impact</p>
      <p><a href="/api/gasket/parts/${row.basis.part}/insights">${row.basis.number}: read stock evidence</a></p>
      <p>Recorded: ${row.basis.observed} ${row.basis.unit}, USD ${(row.basis.valueCents / 100).toFixed(2)}. Physically counted: ${row.basis.counted} ${row.basis.unit}.</p>
      <p>Quantity adjustment: ${row.basis.quantityDelta} ${row.basis.unit}; value adjustment: USD ${(row.basis.valueDeltaCents / 100).toFixed(2)}. Approval records a count variance, never a physical receipt.</p>
      <details><summary>Retained count sources (${row.basis.movements.length})</summary>${row.basis.movements.map((move: any) => h`<p>${move.kind}: ${move.quantity}, USD ${(move.valueCents / 100).toFixed(2)} · ${showInstant(move.at, actor.zone)}${move.workOrder ? h` · <a href="/app/work/${move.workOrder}">Open source work</a>` : ''}</p>`)}</details>` : ''}
    ${row.kind === 'merge' ? h`<p class="gk-eyebrow">Retained stock and value</p>
      ${row.basis.balances.map((balance: any) => h`<p><a href="/app/parts/${balance.id}">${balance.number}</a>: ${balance.quantity} ${balance.unit}, USD ${(balance.valueCents / 100).toFixed(2)}</p>`)}
      <p>Combined: ${row.basis.combined.quantity} ${row.basis.combined.unit}, USD ${(row.basis.combined.valueCents / 100).toFixed(2)}. Quantity adjustment: ${row.basis.quantityDelta}; value adjustment: USD ${(row.basis.valueDeltaCents / 100).toFixed(2)}.</p>
      <p>${row.basis.consequence}</p><p>${row.basis.boundary}</p>
      <details><summary>Source stock movements (${row.basis.movements.length})</summary>${row.basis.movements.map((move: any) => h`<p>${move.kind}: ${move.quantity}, USD ${(move.valueCents / 100).toFixed(2)} · ${showInstant(move.at, actor.zone)} · <a href="/app/parts/${move.part}">Open retained source history</a></p>`)}</details>` : ''}
    <p class="gk-sub">Prepared by ${row.prepared_by_name} · ${showInstant(row.prepared_at, actor.zone)}${row.decided_by_name ? ` · ${row.status === 'approved' ? 'approved' : 'rejected'} by ${row.decided_by_name} ${showInstant(row.decided_at, actor.zone)}` : ''}${row.decision_note ? ` · ${row.decision_note}` : ''}</p>
    ${decider && row.status === 'pending' && row.prepared_by !== actor.id ? h`<div class="gk-split">
      ${form('proposal.decide', '/app/proposals', h`${hidden('proposal', row.id)}${hidden('decision', 'approve')}${hidden('hash', row.payload_hash)}`, 'Approve and run', { secondary: row !== first })}
      ${form('proposal.decide', '/app/proposals', h`${hidden('proposal', row.id)}${hidden('decision', 'reject')}${field('Reason to reject', 'note')}`, 'Reject', { secondary: true })}</div>` : ''}
    ${result(row)}`,
  { extra: tag(row.status === 'pending' ? 'Pending' : row.status === 'approved' ? row.application ? 'Applied' : 'Approved' : 'Rejected') }))
  return page(env, 'Proposals', actor, h`<h1>Proposals</h1><p class="gk-lede">An agent prepares proposals. Company policy controls supported agent applications; ordinary human approval still requires a different maintenance lead. Changes refuse if the records they relied on have changed.</p>
    ${rows.length ? items : h`<div class="gk-empty"><h2>No proposals yet</h2><p>An agent with its own access prepares proposals through Gasket's API.</p></div>`}`, { url })
}
