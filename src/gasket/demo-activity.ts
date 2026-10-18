// Recent activity in the demo, made through Gasket's own commands so it reads
// exactly as people's work does: a half-recorded service with a finding and its
// follow-up, and an agent's proposals, one already approved by the lead.
import type { Bindings } from '../auth.server'
import type { Actor, Role } from './actor'
import { one } from './core'
import { addDays } from './dates'
import { Input } from './input'
import { decide, prepare } from './proposals'
import { recordFinding, recordResults } from './work'

export async function demoActivity(env: Bindings, day: string) {
  // Rows from an earlier run mean this already happened.
  if (await one(env, 'SELECT 1 FROM gk_proposals LIMIT 1')) return
  const as = (key: string, name: string, role: Role): Actor => ({ id: `demo-${key}`, sessionId: 'demo-seed', email: `${key}@demo.invalid`, name, role, zone: 'America/New_York', today: day })
  const max = as('max', 'Max Ortiz', 'maintainer'), lead = as('lead', 'Lena Park', 'lead'), agent = as('agent', 'Upkeep agent', 'agent')

  await recordResults(env, max, Input.of({ workOrder: 'demo-work-oven', outcome: ['pass', 'attention', ''], note: ['Hinges tight; seal intact.', 'Descale cycle slow to drain; spray arm cleaned.', ''] }))
  await recordFinding(env, max, Input.of({ workOrder: 'demo-work-oven', severity: 'medium', text: 'Replace the sticking drain valve before the next service.', followUp: true, followUpDue: addDays(day, 6) }))

  const fryer = await prepare(env, agent, Input.of({ kind: 'corrective', reasoning: 'The last calibration found the right vat 6 °C over setpoint. The high-limit thermostat probe should be replaced before it trips during service.', payload: { asset: 'demo-fryer', title: 'Replace right-vat thermostat probe', description: 'Calibration found the right vat reading 6 °C high. Fit the spare TP-9 probe and recalibrate.', due: addDays(day, 2), assignee: 'demo-mo' } }))
  await decide(env, lead, Input.of({ proposal: fryer.id, decision: 'approve', hash: fryer.hash, note: 'Agreed, the spare probe is on the shelf.' }))
  await prepare(env, agent, Input.of({ kind: 'schedule', reasoning: 'The walk-in cooler compressor is critical and has no preventive schedule; the blast chiller uses the same weekly cold room inspection.', payload: { asset: 'demo-cooler', checklist: 'demo-check-cold', title: 'Cold room weekly inspection', everyDays: '7', firstDue: addDays(day, 4), assignee: 'demo-mo' } }))
  await prepare(env, agent, Input.of({ kind: 'count', reasoning: 'Rinse aid is below its minimum and the dishwasher is down for a hose. A recount confirms what to reorder.', payload: { part: 'demo-part-rinse', counted: '1', note: 'Counted in the chemical store' } }))
}
