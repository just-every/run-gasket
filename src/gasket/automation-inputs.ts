import { qualificationReminderInputs } from './resource-reminders'
import { responseInputs } from './request-response'
import { connectorInputs } from './webhooks'
// The current automatic jobs' source facts, retained before an execution.
import type { Bindings } from '../auth.server'
import { all } from './core'
import { chaseRule } from './chasing'
import { meterState } from './meters'
import { DUE_SCHEDULES } from './schedules'
import { replenishmentInputs } from './replenishment-state'
import type { AutomationRule } from './automation-jobs'
import { followUps } from './vendor-follow-up'

export async function automationInputs(env: Bindings, rule: AutomationRule, day: string) {
  if (rule === 'connectors') return { day, connectors: await connectorInputs(env) }
  if (rule === 'vendor') return { day, vendor: await followUps(env, day) }
  if (rule === 'replenishment') return { day, replenishment: await replenishmentInputs(env, day) }
  if (rule === 'pm') {
    const schedules = await all(env, DUE_SCHEDULES)
    return { day, schedules, meters: await Promise.all(schedules.filter(row => row.meter_id).map(async row => ({ meter: row.meter_id, state: await meterState(env, row.meter_id) }))) }
  }
  if (rule === 'routes') return { day, routes: await all(env, 'SELECT * FROM gk_routes'), stops: await all(env, 'SELECT * FROM gk_route_stops') }
  if (rule === 'chase') return { day, requestResponse:await responseInputs(env), rule: await chaseRule(env), orders: await all(env, "SELECT * FROM gk_work_orders WHERE status IN ('open','in_progress','returned')"), blockers: await all(env, 'SELECT * FROM gk_blockers WHERE resolved_at IS NULL'), members: await all(env, "SELECT id,role FROM gk_members WHERE status='active'") }
  return { day, qualificationReminders:await qualificationReminderInputs(env), documents: await all(env, "SELECT d.*, a.retired_at, m.status AS owner_status FROM gk_documents d JOIN gk_assets a ON a.id=d.asset_id LEFT JOIN gk_members m ON m.id=d.owner_id WHERE d.expires_on IS NOT NULL") }
}
