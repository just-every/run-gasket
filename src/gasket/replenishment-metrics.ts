// PART-005's source-linked measures inherit REPORT-009.
import type { MetricDefinition } from './metric-definitions'
const rows = [
  ['replenishment.job-health', 'Replenishment notice-job health', 'Count replenishment rule execution rows in running and failed states separately; health.delivery.replenishment in the automation source door.'],
  ['replenishment.available', 'Replenishment available stock', 'Current on-hand movement quantity minus outstanding reservations. The trigger is available <= configured minimum + safety stock.'],
  ['replenishment.proposed', 'Proposed replenishment quantity', 'When at/below trigger, max(0, max(maximum - available, reorder quantity) - outstanding linked deliveries); otherwise zero. At most one open replenishment document exists per part.'],
  ['replenishment.shortage', 'Remaining stock shortage', 'Max(0, maximum - current available), disclosed independently of outstanding deliveries and quarantined quantities.'],
  ['replenishment.age', 'Open replenishment age and delivery due', 'Age = max(0, floor(elapsed milliseconds since opening / 86400000)); due = opening site-local day plus configured whole calendar lead days. Outstanding delivery is due when due day <= current site-local day.'],
  ['replenishment.envelope', 'Separate automatic-order envelope consumption', 'Sum claimed automatic-order commitment cents inside the envelope inclusive site-local dates. Each claim must fit both per-order and period limits and all live BUY-003 purchasing authority and budget checks.'],
] as const
export const REPLENISHMENT_METRICS: readonly MetricDefinition[] = Object.freeze(rows.map(([id,name,formula]) => Object.freeze({id,name,formula,version:1 as const,clause:'PART-005',
  eventTime:'Current stock and open-document state at request time; immutable policies pin location, supplier, costs and lead time. Automatic claims book on the site-local day of claim.',
  exclusions:'Quarantine is excluded from usable stock. Supplier returns reopen replacement shortage. A buyer-edited linked PO revision requires review and supplies no guessed incoming stock. Envelope consumption retains uncertain or rejected sends; no automatic retry, refund, ledger actual or external alert delivery is inferred.',
  freshness:'Recomputed on request; PM-008 retains worker source inputs, rule revision, outcomes and provenance. In-app notices are stored synchronously; external email/push alert delivery remains unavailable.',
  sourceDoor:id==='replenishment.job-health'?'/api/gasket/automation':'/api/gasket/replenishment',
})))
