// MIG-002 (slice): MaintainX's work-order export (Work Orders → Export → CSV,
// MaintainX's documented column names) moves completed work in as asset
// history: its MaintainX ID, title, work type, completion time and who
// completed it, assignees, categories, recurrence and costs. History never
// reruns: it raises no work, moves no schedule and enters no review.
import type { Json } from '../../modules/import-kit/src/d1/index'

export const WORK_NEEDS = ['ID', 'Title', 'Status', 'Completed on']
const DONE = /^(done|completed?)$/i

/** MaintainX Work Type: Preventive stays preventive, Reactive (or Corrective) is corrective, anything else is other. */
export const workKind = (text: string) => /^preventive$/i.test(text) ? 'preventive' : /^(reactive|corrective)$/i.test(text) ? 'corrective' : 'other'

/** A MaintainX money cell ("$1,234.50", "86", blank) in whole cents; blank is not recorded; anything else is refused. */
export function cents(text: string): number | null | undefined {
  const value = text.trim().replace(/^\$\s*/, '')
  if (!value) return null
  if (!/^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(value)) return undefined
  const [whole, fraction = ''] = value.replace(/,/g, '').split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export interface WorkContext {
  /** Reads `Completed on` the way the move-in reads dates (month-first or day-first). */
  parse: (text: string) => string | null
  today: string
  /** The asset a row names: by `Asset ID` when present, else by exact `Asset` name. */
  assetFor: (assetId: string, assetName: string) => { id: string } | { refused: string }
}

/** One work-order export row as a history effect, or the reason it is refused. */
export function mapWork(get: (name: string) => string, context: WorkContext): { value: Record<string, Json> } | { refused: string } {
  const id = get('ID'), title = get('Title')
  if (!title) return { refused: 'no work order title' }
  if (!DONE.test(get('Status'))) return { refused: `work order ${id} is ${get('Status') || 'not done'} in MaintainX: only completed work moves in as history; raise open work in Gasket` }
  const completedOn = context.parse(get('Completed on'))
  if (!completedOn) return { refused: `Completed on "${get('Completed on')}" is not a date and time Gasket can read` }
  if (completedOn > context.today) return { refused: 'completion is dated in the future' }
  const asset = context.assetFor(get('Asset ID'), get('Asset'))
  if ('refused' in asset) return asset
  const costs: Record<string, number | null> = {}
  for (const [key, column] of [['partsCents', 'Total Parts Cost'], ['laborCents', 'Total Time Cost'], ['otherCents', 'Additional Costs']] as const) {
    const amount = cents(get(column))
    if (amount === undefined) return { refused: `${column} "${get(column)}" is not an amount in dollars and cents` }
    costs[key] = amount
  }
  return { value: {
    asset: asset.id, sourceRef: id, title, kind: workKind(get('Work Type')), description: get('Description') || null, completedOn,
    completedBy: get('Completed by') ? `MaintainX: ${get('Completed by')}` : null, assignedTo: get('Assigned to') || null,
    categories: get('Categories') || null, recurrence: get('Recurrence') || get('Schedule') || null, ...costs,
  } }
}
