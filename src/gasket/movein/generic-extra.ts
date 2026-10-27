import type { Bindings } from '../../auth.server'
import type { Json } from '../../modules/import-kit/src/d1/index'
import type { Actor } from '../actor'
import { all, insist, type Row } from '../core'
import { Input } from '../input'
import { scheduleFields } from '../schedules'
import { columns } from './csv'
import { assetCustomMapping } from './maintainx-custom'

export const HEADERS_EXTRA = {
  locations: ['Source ID', 'Name', 'Portal'],
  pms: ['Source ID', 'Title', 'Asset ID', 'Location', 'Checklist', 'Every days', 'First due', 'Cadence', 'Months', 'Weekdays', 'Observe closures', 'Max defer days', 'Assignee', 'Team', 'Estimate hours', 'Active'],
}
export type ExtraKind = keyof typeof HEADERS_EXTRA

async function resolve(env: Bindings, text: string, table: string, keys: string[], explicit: Record<string, string>, label: string): Promise<Row | null> {
  if (!text) return null
  const mapped = Object.hasOwn(explicit, text) ? explicit[text] : null
  insist(mapped !== '', `invalid_${label}_mapping`)
  const rows = await all(env, `SELECT * FROM ${table} WHERE ${mapped !== null ? 'id=?' : keys.map(key => `${key}=? COLLATE NOCASE`).join(' OR ')}`, ...(mapped !== null ? [mapped] : keys.map(() => text)))
  insist(rows.length === 1, `unknown_or_ambiguous_${label}`)
  return rows[0]
}
function yesNo(value: string, name: string, required = false): boolean | undefined {
  if (!value && !required) return undefined
  insist(/^(yes|no)$/i.test(value), `invalid_${name}`)
  return value.toLowerCase() === 'yes'
}

/** Controlled imports use existing private targets and ordinary calendar and crew validators. */
export async function mapExtra(env: Bindings, actor: Actor, kind: ExtraKind, cells: Record<string, string>, assetMapping: Record<string, string>, userMapping: Record<string, string>, teamMapping: Record<string, string>, customMapping:Record<string,string>={}): Promise<{ native: Record<string, Json>; customValues: Record<string, Json> }> {
  const read = columns(Object.keys(cells)), values = Object.values(cells), get = (name: string) => read.get(values, name)
  if (kind === 'locations') {
    const name = Input.of({ name: get('Name') }).text('name', { max: 160 })
    const portal = await resolve(env, get('Portal'), 'gk_request_portals', ['id', 'name'], {}, 'portal')
    insist(portal && portal.mode === 'authenticated' && portal.enabled === 1, 'authenticated_portal_required')
    const custom = await assetCustomMapping(env, Input.of({customMapping}), Object.keys(cells), 'location')
    return { native: { portal_id: portal.id, kind: 'location', asset_id: null, name, retired_at: null, created_by: actor.id }, customValues: custom.values(cells, null) }
  }
  insist(kind === 'pms', 'invalid_entity')
  const asset = await resolve(env, get('Asset ID'), 'gk_assets', ['id', 'tag'], assetMapping, 'asset')
  insist(!asset?.retired_at, 'asset_retired')
  const checklist = await resolve(env, get('Checklist'), 'gk_checklists', ['id', 'name'], {}, 'checklist')
  insist(checklist, 'checklist_not_found')
  const assignee = await resolve(env, get('Assignee'), 'gk_members', ['id', 'email', 'name'], userMapping, 'assignee')
  if (assignee) {
    const operators = await all(env, 'SELECT status FROM oa_operators WHERE id=?', assignee.operator_id)
    insist(assignee.status === 'active' && ['owner', 'lead', 'maintainer'].includes(assignee.role) && operators[0]?.status === 'active', 'assignee_not_assignable')
  }
  const team = await resolve(env, get('Team'), 'gk_teams', ['id', 'name'], teamMapping, 'team')
  const active = yesNo(get('Active'), 'Active', true), observe = yesNo(get('Observe closures'), 'Observe closures')
  const input = Input.of({ asset: asset?.id ?? '', location: get('Location'), checklist: checklist.id, title: get('Title'),
    everyDays: get('Every days'), firstDue: get('First due'), cadence: get('Cadence'),
    months: get('Months') ? [get('Months')] : [], weekdays: get('Weekdays') ? [get('Weekdays')] : [],
    ...(observe === undefined ? {} : { observeClosures: observe }), maxDeferDays: get('Max defer days'),
    assignee: assignee?.id ?? '', team: team?.id ?? '', estimateHours: get('Estimate hours') })
  const value = await scheduleFields(env, input)
  insist(value.everyDays, 'calendar_cadence_required')
  return { customValues: {}, native: { asset_id: value.asset, location: value.location, checklist_id: value.checklist, title: value.title,
    every_days: value.everyDays, meter_id: null, every_units: null, next_due_date: value.nextDueDate, next_due_meter: null,
    assignee_id: value.assigneeId, active: active ? 1 : 0, revision: 1, created_by: actor.id, cadence: value.cadence,
    months: value.months, weekdays: value.weekdays, observe_closures: value.observeClosures ? 1 : 0,
    max_defer_days: value.maxDeferDays, nominal_date: value.nominalDate, combine: value.combine, trigger_when: null,
    trigger_value: null, reset_value: null, sustain_minutes: 0, trigger_fired_on: null, team_id: value.teamId,
    estimate_minutes: value.estimateMinutes, tools: null, calibration: 0, grace_days: null } }
}
