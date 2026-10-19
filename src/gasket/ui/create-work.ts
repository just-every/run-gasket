// FIELD-009: the parts of a "raise work" form that depend on who raises it. A
// lead or the owner assigns anyone; a technician takes the work or leaves it
// unassigned for a lead. Anyone may record work already done with its past
// start and end.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { localNow } from '../dates'
import { assignable } from '../site'
import { field, h, select } from './html'

/** Inside the form's grid: who does the work. */
export async function assignChoice(env: Bindings, actor: Actor) {
  if (can(actor, 'work.assign')) return select('Assign to', 'assignee', (await assignable(env)).map(person => ({ value: person.id, label: person.name })), '', { required: false, blank: 'Not yet' })
  return select('Who does it', 'unassigned', [{ value: '', label: 'Me' }, { value: 'yes', label: 'Leave unassigned for a lead' }], '', { required: false })
}

/** Below the grid: when work already done started and ended, in the site's clock. */
export const doneAlready = (actor: Actor) => h`<details class="gk-details"><summary>Already done? Record when</summary><div class="gk-grid">${field('Started', 'startedOn', { type: 'datetime-local', required: false, attrs: `max="${localNow(actor.zone)}"` })}${field('Finished', 'endedOn', { type: 'datetime-local', required: false, attrs: `max="${localNow(actor.zone)}"` })}</div><p class="gk-hint">Then record its parts, downtime and checklist on the work order and send it for review.</p></details>`
