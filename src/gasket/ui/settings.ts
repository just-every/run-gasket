// Site, people and access, the audit trail and the More page.
import type { Bindings } from '../../auth.server'
import { ROLE_LABELS, ROLES, type Actor } from '../actor'
import { showInstant } from '../dates'
import { members, site } from '../site'
import { audit } from '../audit'
import { all } from '../core'
import { card, field, form, h, hidden, raw, select, table, tag, woNumber, type Html } from './html'
import { SETTINGS, page } from './shell'

// US time zones first; a site saved in another zone keeps it as an option.
const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC']
export const ZONE_LABELS: Record<string, string> = { 'America/New_York': 'Eastern (New York)', 'America/Chicago': 'Central (Chicago)', 'America/Denver': 'Mountain (Denver)', 'America/Phoenix': 'Arizona (Phoenix, no daylight saving)', 'America/Los_Angeles': 'Pacific (Los Angeles)', 'America/Anchorage': 'Alaska (Anchorage)', 'Pacific/Honolulu': 'Hawaii (Honolulu)', UTC: 'UTC' }

export async function sitePage(env: Bindings, actor: Actor, url: URL, { first = false } = {}) {
  const current = await site(env)
  const intro = first ? h`<div class="gk-first"><h1>Set up your site</h1><p class="gk-lede">Name the site whose equipment Gasket keeps, and its time zone. Due dates, readings and downtime use this clock.</p></div>` : h`<h1>Site</h1>`
  const siteCard = card('Site', form('site.configure', first ? '/app/assets' : '/app/site', h`${field('Site name', 'name', { value: current?.name ?? '' })}${select('Time zone', 'timezone', [...ZONES, ...(current?.timezone && !ZONES.includes(current.timezone) ? [current.timezone] : [])].map(zone => ({ value: zone, label: ZONE_LABELS[zone] ?? zone.replace('_', ' ') })), current?.timezone ?? 'America/New_York')}${field('PM lead time (days)', 'leadDays', { type: 'number', value: String(current?.lead_days ?? 7), attrs: 'min="0" max="90"', hint: 'How many days before its due date the scheduler issues preventive work.' })}`, first ? 'Save and register equipment' : 'Save'), { id: 'site' })
  // FIELD-009: the owner turns the technician (maintainer) create-work right off or on for this site.
  const technicians = current ? card('Technician-created work', h`<p>${current.technician_create_work ? 'Maintainers may raise corrective and emergency work themselves, take it or leave it for a lead, and record work already done.' : 'Maintainers at this site cannot raise work themselves; leads and the owner raise it for them.'}</p>
    ${form('site.technicianWork', '/app/site', current.technician_create_work ? '' : hidden('allowed', 'yes'), current.technician_create_work ? 'Turn off for this site' : 'Turn on for this site', { secondary: true })}`, { id: 'technician-work' }) : ''
  const steps = h`<ol class="gk-steps" aria-label="First steps">${['Set up the site', 'Register equipment or move in from MaintainX', 'Write a checklist and schedule it', 'Give your team access'].map((step, index) => h`<li${index === 0 ? h` aria-current="step"` : ''}>${step}</li>`)}</ol>`
  return page(env, 'Site', actor, first ? h`${intro}<div class="gk-first-run">${siteCard}${steps}</div>` : h`${intro}<div class="gk-narrow">${siteCard}${technicians}</div>`, { url })
}

export async function accessPage(env: Bindings, actor: Actor, url: URL) {
  const people = await members(env)
  const roleOptions = ROLES.map(role => ({ value: role, label: ROLE_LABELS[role] }))
  // An editable row's role is a select in the Role column; it belongs to the "Change role" form in the last column.
  const role = (person: typeof people[number]) => person.role === 'owner' || person.status !== 'active' ? ROLE_LABELS[person.role]
    : h`<label class="gk-visually-hidden" for="role-${person.id}">Role for ${person.name}</label><select class="gk-role" id="role-${person.id}" name="role" form="role-form-${person.id}">${roleOptions.map(option => h`<option value="${option.value}"${option.value === person.role ? raw(' selected') : ''}>${option.label}</option>`)}</select>`
  const list = table(['Person', 'Role', 'Access', ''], people.map(person => [h`${person.name}<span class="gk-sub gk-email">${person.email}</span>`, role(person), tag(person.status === 'active' ? 'Active' : 'Ended'),
    person.role === 'owner' || person.status !== 'active' ? '' : h`<div class="gk-split"><form method="post" action="/app/do/access.role" class="gk-form gk-inline" id="role-form-${person.id}">${hidden('returnTo', '/app/access')}${hidden('member', person.id)}<div class="gk-actions"><button type="submit" class="gk-secondary">Change role</button></div></form>${form('access.end', '/app/access', hidden('member', person.id), 'End access', { secondary: true, layout: 'gk-inline' })}</div>`]), 'People with access')
  const give = card('Give someone access', h`<div class="gk-give">${form('access.give', '/app/access', h`<div class="gk-grid">${field('Name', 'name')}${field('Email', 'email', { type: 'email' })}${select('Role', 'role', roleOptions, 'maintainer')}</div>`, 'Give access')}
    <ul class="gk-roles"><li><strong>Maintenance lead:</strong> register, parts, checklists, schedules, assignment, move-in and approving proposals.</li><li><strong>Maintainer:</strong> records the work assigned to them.</li><li><strong>Supervisor:</strong> reviews finished work and watches overdue work and downtime.</li><li><strong>Agent:</strong> an AI agent's own sign-in that reads and prepares proposals only.</li></ul></div>`, { id: 'give' })
  return page(env, 'People and access', actor, h`<h1>People and access</h1><p class="gk-lede">Each person has one role. Ending access signs them out everywhere at once.</p>${list}${give}`, { url })
}

/** Each audit action in plain words. */
export const ACTIONS: Record<string, string> = {
  'site.configure': 'Changed the site settings', 'site.technicianwork': 'Turned technician-created work on or off', 'access.give': 'Gave access', 'access.role': 'Changed a role', 'access.end': 'Ended access',
  'asset.create': 'Registered an asset', 'asset.update': 'Changed asset details', 'asset.retire': 'Retired an asset', 'asset.move': 'Moved an asset in the hierarchy', 'asset.lifecycle': 'Recorded asset lifecycle facts', 'asset.agreement': 'Recorded a service agreement', 'asset.sighting': 'Recorded a sighting', 'asset.state': 'Declared an asset state', 'meter.create': 'Added a meter', 'meter.feed': 'Received a feed reading', 'meter.adjust': 'Explained a meter change', 'meter.window': 'Set a feed lateness window', 'code.set': 'Added or relabelled a code', 'code.move': 'Reordered a code', 'code.retire': 'Retired a code',
  'checklist.create': 'Wrote a checklist', 'checklist.revise': 'Published a checklist revision', 'rule.set': 'Approved a failed-step rule', 'workorder.acknowledge': 'Acknowledged assigned work', 'workorder.decline': 'Declined assigned work', 'workorder.collaborate': 'Added a collaborator', 'workorder.uncollaborate': 'Removed a collaborator', 'team.create': 'Named a team', 'team.join': 'Added someone to a team', 'team.leave': 'Removed someone from a team', 'schedule.create': 'Scheduled preventive work',
  'workorder.generate': 'Created a work order from its schedule', 'workorder.create': 'Raised a work order', 'workorder.assign': 'Assigned the work', 'workorder.plan': 'Decided on overdue work', 'workorder.cancel': 'Cancelled a work order', 'workorder.reschedule': 'Rescheduled a work order', 'workorder.reopen': 'Reopened a work order', 'workorder.merge': 'Merged a duplicate work order', 'workorder.merged': 'Took in a duplicate work order', 'schedule.skip': 'Asked to skip a missed preventive occurrence', 'schedule.defer': 'Asked to defer a preventive occurrence', 'schedule.exception': 'Decided a skip or deferral', 'schedule.edit': 'Changed a schedule\'s cadence', 'closure.add': 'Added closed days', 'workorder.schedule': 'Issued by the scheduler', 'chase.rule': 'Approved the chase rule', 'workorder.respond': 'Answered a reminder', 'blocker.raise': 'Raised a blocker', 'blocker.resolve': 'Cleared a blocker', 'workorder.trigger': 'Raised by a meter reading', 'closure.remove': 'Removed closed days',
  'workorder.results': 'Recorded checklist results', 'workorder.readings': 'Recorded readings', 'workorder.evidence': 'Attached evidence', 'comment.post': 'Posted a comment', 'comment.edit': 'Edited a comment',
  'workorder.submit': 'Submitted for review', 'workorder.approve': 'Approved and closed', 'workorder.return': 'Returned for more work',
  'part.create': 'Added a part', 'part.receive': 'Received stock', 'part.substitute': 'Approved a substitute part', 'part.substitute.withdraw': 'Withdrew a substitute approval', 'kit.create': 'Made a repair kit', 'bom.revise': 'Saved a bill of materials revision', 'workorder.reserve': 'Reserved parts to work', 'reservation.release': 'Released a parts reservation', 'part.count': 'Recorded a physical count', 'part.issue': 'Issued a part', 'part.return': 'Returned a part',
  'downtime.start': 'Took the asset down', 'downtime.end': 'Put the asset back in service', 'downtime.classify': 'Corrected a stop\'s classification', 'finding.record': 'Recorded a finding',
  'proposal.prepare': 'Prepared a proposal', 'proposal.approve': 'Approved a proposal', 'proposal.reject': 'Rejected a proposal',
  'import.apply': 'Moved in from MaintainX', 'import.undo': 'Undid a move-in',
}
const PROPOSAL: Record<string, string> = { schedule: 'Preventive schedule', corrective: 'Corrective work order', count: 'Parts count' }

/** The record each audit row names, by its business label and page; never its id. */
export async function auditRecords(env: Bindings) {
  const [orders, assets, parts, people, checklists, schedules, proposals, meters, imports, teams] = await Promise.all([
    all(env, 'SELECT w.id, w.number, COALESCE(a.name, w.location) AS name FROM gk_work_orders w LEFT JOIN gk_assets a ON a.id = w.asset_id'), all(env, 'SELECT id, tag, name FROM gk_assets'),
    all(env, 'SELECT id, number, name FROM gk_parts'), all(env, 'SELECT id, name FROM gk_members'), all(env, 'SELECT id, name FROM gk_checklists'),
    all(env, 'SELECT id, title FROM gk_schedules'), all(env, 'SELECT id, kind FROM gk_proposals'),
    all(env, 'SELECT m.id, m.name, a.id AS asset, a.tag FROM gk_meters m JOIN gk_assets a ON a.id = m.asset_id'), all(env, 'SELECT id FROM ik_jobs'), all(env, 'SELECT id, name FROM gk_teams')])
  const link = (href: string, label: string) => h`<a href="${href}">${label}</a>`
  return new Map<string, Html>([
    ['site', link('/app/site', 'The site')],
    ...teams.map(row => [row.id, link('/app/teams', `Team: ${row.name}`)] as const),
    ...orders.map(row => [row.id, link(`/app/work/${row.id}`, `${woNumber(row.number)} · ${row.name}`)] as const),
    ...assets.map(row => [row.id, link(`/app/assets/${row.id}`, `${row.tag} ${row.name}`)] as const),
    ...parts.map(row => [row.id, link(`/app/parts/${row.id}`, `${row.number} ${row.name}`)] as const),
    ...people.map(row => [row.id, link('/app/access', row.name)] as const),
    ...checklists.map(row => [row.id, link(`/app/checklists/${row.id}`, row.name)] as const),
    ...schedules.map(row => [row.id, link('/app/schedules', `Schedule: ${row.title}`)] as const),
    ...proposals.map(row => [row.id, link('/app/proposals', `Proposal: ${PROPOSAL[row.kind] ?? 'agent proposal'}`)] as const),
    ...meters.map(row => [row.id, link(`/app/assets/${row.asset}`, `${row.name} meter on ${row.tag}`)] as const),
    ...imports.map(row => [row.id, link('/app/move-in', 'MaintainX move-in')] as const),
  ])
}

export async function auditPage(env: Bindings, actor: Actor, url: URL) {
  const [{ rows, next }, records] = await Promise.all([audit(env, actor, url), auditRecords(env)])
  const filters = new URLSearchParams([...url.searchParams].filter(([key, value]) => ['action', 'from', 'to', 'site'].includes(key) && value))
  const search = h`<form method="get" action="/app/audit" class="gk-form gk-audit-search"><div class="gk-grid">
    ${select('Action', 'action', Object.entries(ACTIONS).map(([value, label]) => ({ value, label })), filters.get('action') ?? '', { required: false, blank: 'Every action' })}
    ${field('From', 'from', { type: 'date', required: false, value: filters.get('from') ?? '' })}${field('To', 'to', { type: 'date', required: false, value: filters.get('to') ?? '' })}</div>
    <div class="gk-actions"><button type="submit" class="gk-secondary">Search</button><a class="gk-button gk-secondary" href="/app/audit.csv${filters.size ? `?${filters}` : ''}">Download CSV</a></div></form>`
  const older = next ? h`<p><a class="gk-more-rows" href="/app/audit?${new URLSearchParams([...filters, ['before', String(next)]])}">Older changes</a></p>` : ''
  return page(env, 'Audit trail', actor, h`<h1>Audit trail</h1><p class="gk-lede">Every change, newest first, with who made it and on what authority. The download holds every matching change.</p>${search}${table(['When', 'Who', 'Action', 'Record'], rows.map(row => [showInstant(row.at, actor.zone), h`${row.actor_name ?? '—'}<span class="gk-sub">${row.authority}</span>`,
    ACTIONS[row.action] ?? 'Changed a record', records.get(row.subject) ?? h`<span class="gk-muted">A deleted record</span>`]), 'Audit trail', { wrap: [1, 2, 3] })}${older}`, { url })
}

export async function morePage(env: Bindings, actor: Actor, url: URL) {
  const items = SETTINGS.filter(item => item.show(actor))
  return page(env, 'More', actor, h`<h1>More</h1><ul class="gk-more">${items.map(item => h`<li><a href="${item.href}">${item.label}</a><span class="gk-sub">${item.detail}</span></li>`)}</ul>${items.length ? '' : h`<p class="gk-muted">Nothing else for your role.</p>`}`, { url })
}
