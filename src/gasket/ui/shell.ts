// The app's shell from the owner's pick (desk app look H): a white left rail
// with the mark and heavy wordmark, the destinations with their counts, the
// site chip and the signed-in person at its foot; the page on the pale ground
// beside it. Under 900px the rail folds into a top bar with a menu.
import type { Bindings } from '../../auth.server'
import branding from '../../branding.json'
import { bindIds } from '../../bind-ids'
import { ICONS } from '../../icon-head'
import { ROLE_LABELS, can, type Actor } from '../actor'
import { site } from '../site'
import { railCounts } from '../today'
import { describeError, h, initials, raw, type Html } from './html'
import { ICON } from './icons'

type Destination = { href: string; label: string; detail: string; icon: Html; show: (actor: Actor) => boolean; count?: 'work' | 'proposals' }

/** Every destination, by what the person may do. The second group is also the More page. */
export const NAV: Destination[] = [
  { href: '/app', label: 'Work', detail: 'Today\'s work orders.', icon: ICON.work, show: () => true, count: 'work' },
  { href: '/app/assets', label: 'Assets', detail: 'The equipment register.', icon: ICON.assets, show: () => true },
  { href: '/app/schedules', label: 'Schedules', detail: 'Preventive schedules and checklists.', icon: ICON.schedules, show: () => true },
  { href: '/app/parts', label: 'Parts', detail: 'Spares on the shelf.', icon: ICON.parts, show: () => true },
  { href: '/app/proposals', label: 'Proposals', detail: 'Schedules, corrective work and counts an agent prepared for approval.', icon: ICON.proposals, show: actor => can(actor, 'proposal.prepare') || can(actor, 'proposal.decide'), count: 'proposals' },
  { href: '/app/board', label: 'Overdue and downtime', detail: 'Overdue work, work waiting for review, follow-ups, assets down and low parts.', icon: ICON.board, show: actor => can(actor, 'board.read') },
  { href: '/app/stores', label: 'Stores', detail: 'Stockouts, parts demand by asset and work, slow and dead stock, turns and count accuracy.', icon: ICON.board, show: actor => can(actor, 'board.read') },
  { href: '/app/performance', label: 'Performance', detail: 'Backlog hours and age, PM compliance, planned and reactive work, schedule attainment.', icon: ICON.board, show: actor => can(actor, 'board.read') },
  { href: '/app/availability', label: 'Availability', detail: 'Production time, planned and down time, availability and unknown coverage by line and asset, with each outage.', icon: ICON.board, show: actor => can(actor, 'board.read') },
  { href: '/app/bad-actors', label: 'Downtime Pareto', detail: 'Downtime ranked by asset, line, failure mode and reason, with repeats, repair cost and documented lost production.', icon: ICON.board, show: actor => can(actor, 'board.read') },
  { href: '/app/reliability', label: 'Reliability', detail: 'MTBF, MTTR and MTTA with their definitions, failures by failure mode and repeat failures.', icon: ICON.board, show: actor => can(actor, 'board.read') },
]
export const SETTINGS: Destination[] = [
  { href: '/app/metrics', label: 'Measure definitions', detail: 'KPI formulas, source freshness and unresolved data quality.', icon: ICON.board, show: actor => can(actor, 'board.read') },
  { href: '/app/spend-policy', label: 'Spend policy', detail: 'Period envelopes, independent routing, delegations and overrides.', icon: ICON.parts, show: actor => can(actor, 'site.manage') },
  { href: '/app/automation', label: 'Automation', detail: 'Execution health, rule previews, pause and catch-up controls.', icon: ICON.clock, show: actor => can(actor, 'board.read') },
  { href: '/app/purchasing', label: 'Purchasing', detail: 'Suppliers, catalogs, cost centers and maintenance requisitions awaiting approval.', icon: ICON.parts, show: () => true },
  { href: '/app/move-in', label: 'Move in from MaintainX', detail: 'Dry run, apply and undo an import of MaintainX exports.', icon: ICON.movein, show: actor => can(actor, 'import.run') },
  { href: '/app/access', label: 'People and access', detail: 'Give access with a role, change roles and end access.', icon: ICON.people, show: actor => can(actor, 'site.manage') },
  { href: '/app/site', label: 'Site', detail: 'The site name and its time zone.', icon: ICON.site, show: actor => can(actor, 'site.manage') },
  { href: '/app/notices', label: 'Notices', detail: 'Reminders and escalations about overdue work, and the chase rule.', icon: ICON.clock, show: () => true },
  { href: '/app/templates', label: 'Work templates', detail: 'Reusable work with its title, instructions, priority and estimate.', icon: ICON.schedules, show: () => true },
  { href: '/app/teams', label: 'Teams', detail: 'Teams, their trades and people, and each team\'s open work.', icon: ICON.people, show: () => true },
  { href: '/app/codes', label: 'Codes and failures', detail: 'Criticality levels, failure mode, cause, remedy and risk codes, and failures by code.', icon: ICON.board, show: () => true },
  { href: '/app/audit', label: 'Audit trail', detail: 'Every change, who made it and when.', icon: ICON.audit, show: actor => can(actor, 'audit.read') },
]

const headers = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'strict-origin',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
}

const current = (path: string) => path === '/app' || path.startsWith('/app/work') ? '/app'
  : path.startsWith('/app/checklists') ? '/app/schedules'
  : [...NAV, ...SETTINGS].find(item => item.href !== '/app' && path.startsWith(item.href))?.href ?? ''

/** The site clock's short zone name, "EDT". */
export const zoneName = (zone: string, at = Date.now()) => new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(at).find(part => part.type === 'timeZoneName')?.value ?? zone

async function rail(env: Bindings, actor: Actor, here: string) {
  const [counts, place] = await Promise.all([railCounts(env, actor), site(env)])
  const link = (item: Destination) => {
    const count = item.count ? counts[item.count] : 0
    return h`<li><a href="${item.href}"${item.href === here ? raw(' aria-current="page"') : ''}>${item.icon}<span class="gk-nav-label">${item.label}</span>${count ? h`<b class="gk-nav-count${item.count === 'proposals' ? ' gk-nav-count-accent' : ''}">${count}</b>` : ''}</a></li>`
  }
  const settings = SETTINGS.filter(item => item.show(actor))
  return h`<aside class="gk-rail"><div class="gk-rail-head"><a class="gk-brand" href="/app"><img src="/brand/mark.svg" alt="" width="40" height="40"><span data-rer-name>${branding.name}</span></a>
    <input type="checkbox" id="gk-menu" class="gk-menu-toggle"><label for="gk-menu" class="gk-menu-button">${ICON.menu}<span>Menu</span></label></div>
    <div class="gk-rail-body"><nav class="gk-nav" aria-label="Main"><ul>${NAV.filter(item => item.show(actor)).map(link)}</ul>${settings.length ? h`<ul class="gk-nav-settings">${settings.map(link)}</ul>` : ''}</nav>
    <div class="gk-rail-foot">${place ? h`<p class="gk-site-chip">${ICON.pin}<span>${place.name}</span></p>` : ''}
    <p class="gk-person" title="${actor.email}"><span class="gk-avatar gk-avatar-me" aria-hidden="true">${initials(actor.name)}</span><span><strong>${actor.name}</strong><span class="gk-sub">${ROLE_LABELS[actor.role]}</span></span></p>
    <p class="gk-clock-note">${ICON.clock}<span>Dates and times in ${zoneName(actor.zone)}, the site's clock</span></p></div></div></aside>`
}

export async function page(env: Bindings, title: string, actor: Actor | null, body: Html, { url, status = 200, bar }: { url?: URL; status?: number; bar?: Html } = {}): Promise<Response> {
  const notice = url?.searchParams.get('notice'), error = url?.searchParams.get('error')
  const nav = actor ? await rail(env, actor, url ? current(url.pathname) : '') : ''
  const document = h`<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ${branding.name}</title>${raw(ICONS)}<link rel="preload" href="/fonts/inter/inter-variable-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/rer-theme.css"><link rel="stylesheet" href="/gasket.css"></head><body>
<div class="gk-app${actor ? '' : ' gk-app-bare'}">${nav}<main class="gk-main${bar ? ' gk-has-bar' : ''}">${notice ? h`<p class="gk-flash" role="status">${notice}</p>` : ''}${error ? h`<p class="gk-flash gk-error" role="alert">That did not work: ${describeError(error)}</p>` : ''}${body}</main></div>${bar ? h`<div class="gk-bar"><div class="gk-bar-inner">${bar}</div></div>` : ''}</body></html>`
  return new Response(bindIds(document.html, '<g-id>'), { status, headers })
}
