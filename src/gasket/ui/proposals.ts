// Agent proposals waiting for a person's decision, and the decisions made.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all } from '../core'
import { showDate, showInstant } from '../dates'
import { proposalList } from '../proposals'
import { card, field, form, h, hidden, tag } from './html'
import { page } from './shell'

const KIND: Record<string, string> = { reassign: 'Reassignment', schedule: 'Preventive schedule', corrective: 'Corrective work order', count: 'Parts count' }
const LABELS: Record<string, string> = { workOrder: 'Work order', asset: 'Asset', checklist: 'Checklist', title: 'Title', everyDays: 'Every (days)', meter: 'Meter', everyUnits: 'Every (units)', firstDue: 'First due', firstDueMeter: 'First due at', assignee: 'Maintainer', description: 'Details', due: 'Due', part: 'Part', counted: 'Counted', note: 'Note' }

export async function proposalsPage(env: Bindings, actor: Actor, url: URL) {
  const rows = await proposalList(env, actor)
  // Show the records a proposal names by their business names; the ids stay in Details.
  const [registerNames, workNames] = await Promise.all([
    all(env, `SELECT id, tag || ' ' || name AS label FROM gk_assets UNION ALL SELECT id, number || ' ' || name FROM gk_parts
      UNION ALL SELECT id, name FROM gk_members UNION ALL SELECT id, name FROM gk_checklists UNION ALL SELECT id, name || ' (' || unit || ')' FROM gk_meters`),
    all(env, "SELECT id, 'WO-' || number || ' ' || title AS label FROM gk_work_orders"),
  ])
  const names = new Map<string, string>([...registerNames, ...workNames].map(row => [row.id, row.label]))
  const show = (key: string, value: string) => ['due', 'firstDue'].includes(key) ? showDate(value) : names.get(value) ?? value
  const decider = can(actor, 'proposal.decide')
  // One violet primary per screen: "Approve and run" on the first proposal this person may decide, secondary below it.
  const first = rows.find(row => decider && row.status === 'pending' && row.prepared_by !== actor.id)
  const result = (row: any) => row.kind === 'reassign' && row.status === 'approved' ? h`<p><a href="/app/work/${row.result_id}">Open the reassigned work order</a></p>` : row.status !== 'approved' || !row.result_id ? '' : row.kind === 'corrective' ? h`<p><a href="/app/work/${row.result_id}">Open the work order it raised</a></p>`
    : row.kind === 'schedule' ? h`<p><a href="/app/schedules">See the schedule it created</a></p>` : h`<p><a href="/app/parts/${row.payload.part}">See the part's count</a></p>`
  const items = rows.map(row => card(KIND[row.kind], h`<p>${row.reasoning}</p>
    <p class="gk-eyebrow">What it will change</p><dl class="gk-pairs">${Object.entries(row.payload as Record<string, string>).map(([key, value]) => h`<div><dt>${LABELS[key] ?? key}</dt><dd>${show(key, value)}</dd></div>`)}</dl>
    <p class="gk-sub">Prepared by ${row.prepared_by_name} · ${showInstant(row.prepared_at, actor.zone)}${row.decided_by_name ? ` · ${row.status === 'approved' ? 'approved' : 'rejected'} by ${row.decided_by_name} ${showInstant(row.decided_at, actor.zone)}` : ''}${row.decision_note ? ` · ${row.decision_note}` : ''}</p>
    ${decider && row.status === 'pending' && row.prepared_by !== actor.id ? h`<div class="gk-split">
      ${form('proposal.decide', '/app/proposals', h`${hidden('proposal', row.id)}${hidden('decision', 'approve')}${hidden('hash', row.payload_hash)}`, 'Approve and run', { secondary: row !== first })}
      ${form('proposal.decide', '/app/proposals', h`${hidden('proposal', row.id)}${hidden('decision', 'reject')}${field('Reason to reject', 'note')}`, 'Reject', { secondary: true })}</div>` : ''}
    ${result(row)}`,
  { extra: tag(row.status === 'pending' ? 'Pending' : row.status === 'approved' ? 'Approved' : 'Rejected') }))
  return page(env, 'Proposals', actor, h`<h1>Proposals</h1><p class="gk-lede">An agent prepares; a maintenance lead approves or rejects. Approving runs the normal command as you, and refuses if the records it relied on have changed.</p>
    ${rows.length ? items : h`<div class="gk-empty"><h2>No proposals yet</h2><p>An agent with its own access prepares proposals through Gasket's API.</p></div>`}`, { url })
}
