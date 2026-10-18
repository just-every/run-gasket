// Recent activity in the demo, made through Gasket's own commands so it reads
// exactly as people's work does, each stamped at its moment in the morning's
// story: Marcus's half-recorded coil feed alignment with a finding and its
// follow-up, then the Gasket agent's proposals, one approved by Ray.
import type { Bindings } from '../auth.server'
import type { Actor, Role } from './actor'
import { at, one } from './core'
import { addDays } from './dates'
import type { StoryClock } from './demo-story'
import { Input } from './input'
import { decide, prepare } from './proposals'
import { recordFinding, recordResults } from './work'

export async function demoActivity(env: Bindings, story: StoryClock, saturday: string) {
  // Rows from an earlier run mean this already happened.
  if (await one(env, 'SELECT 1 FROM gk_proposals LIMIT 1')) return
  const day = story.day, when = (time: string) => story.at([0, time])
  const as = (key: string, name: string, role: Role): Actor => ({ id: `demo-${key}`, sessionId: 'demo-seed', email: `${key}@demo.invalid`, name, role, zone: 'America/New_York', today: day })
  const marcus = as('marcus', 'Marcus Bell', 'maintainer'), ray = as('ray', 'Ray Kowalski', 'lead'), agent = as('agent', 'Gasket agent', 'agent')

  await at(when('10:15'), () => recordResults(env, marcus, Input.of({ workOrder: 'demo-work-coil', outcome: ['pass', 'attention', ''], note: ['Guide posts clean.', 'Two clamps under torque; retorqued to 85 ft-lb.', ''] })))
  await at(when('10:17'), () => recordFinding(env, marcus, Input.of({ workOrder: 'demo-work-coil', severity: 'medium', text: 'Coil feed guide worn on the operator side; replace at the next die change.', followUp: true, followUpDue: addDays(day, 6) })))

  const hose = await at(when('11:30'), () => prepare(env, agent, Input.of({ kind: 'corrective', reasoning: 'Press 3 lost 47 minutes to the die clamp fitting yesterday and the return hose beside it is weeping AW-46. Replace it in Saturday\'s shutdown while the press is locked out.', payload: { asset: 'demo-press3', title: 'Replace Press 3 return hose', description: 'Return hose at the die clamp manifold weeping AW-46. Replace during the Saturday shutdown, 6:00 to 11:30 am.', due: saturday, assignee: 'demo-devon' } })))
  await at(when('11:32'), () => prepare(env, agent, Input.of({ kind: 'schedule', reasoning: 'CO-1 has no weekly burner check. The cure oven is critical, the last burner and airflow check (4450) was a one-off, and Brenda reads CO-1 every morning, so a weekly check fits her round.', payload: { asset: 'demo-oven', checklist: 'demo-check-burner', title: 'Weekly burner and airflow check', everyDays: '7', firstDue: addDays(day, 2), assignee: 'demo-brenda' } })))
  await at(when('11:45'), () => decide(env, ray, Input.of({ proposal: hose.id, decision: 'approve', hash: hose.hash, note: 'Agreed, stage it with 4471.' })))
}
