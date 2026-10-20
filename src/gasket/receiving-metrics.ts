// BUY-004 inherits REPORT-009 for delivery and inspection quantities and values.
import type { MetricDefinition } from './metric-definitions'
const rows = [
  ['receiving.delivered', 'PO delivered quantities', 'Sum immutable received quantity_milli / 1000 by PO revision and line. Returned goods remain in delivered history.'],
  ['receiving.usable', 'Receipt usable quantities', 'Initial delivered minus initial quarantine, plus releases, minus supplier returns from usable stock. This is receipt disposition, not current on-hand after work issues.'],
  ['receiving.quarantine', 'Quarantined delivery quantities', 'Initial quarantine minus releases and supplier returns from quarantine. Quarantine never contributes to usable stock or its value.'],
  ['receiving.outstanding', 'Outstanding and backorder quantities', 'Ordered quantity minus delivered quantity plus all supplier returns, per immutable PO revision and line. Returns reopen replacement shortage.'],
  ['receiving.landed', 'Delivery landed value and charge allocation', 'Extend delivered PO line quantity at its kept USD unit price, half up to a cent. Allocate delivery freight and sales tax by extended line value with largest remainders, ties by PO line position; split each line by received quantity across bins/lots/serials. Split quarantine value half up, retaining exact remainder on usable stock.'],
  ['receiving.returned', 'Supplier return quantities and values', 'Sum retained return-event quantity by source. Quarantine returns remove its retained proportional value without a usable stock movement; usable returns remove stock at the current moving average, as a negative receipt.'],
] as const
export const RECEIVING_METRICS: readonly MetricDefinition[] = Object.freeze(rows.map(([id,name,formula]) => Object.freeze({ id,name,formula,version:1 as const,clause:'BUY-004',
  eventTime:'Immutable receipt posting time and inspection event time, displayed in the site time zone; quantities are lifetime to request time for each exact approved PO revision.',
  exclusions:'Receipts are physical delivery and inspection records, not supplier bills, credits, payment or ledger-posted actual costs. Service and repair lines carry delivery quantities and allocated costs but do not create stock movements. Historical revisions are separate obligations, never combined into one order quantity.',
  freshness:'Recomputed on request from retained receipts and append-only inspection events. Audit source revision and latest change appear in the measure registry. No supplier or ledger verification is implied.',
  sourceDoor:'/api/gasket/purchase-orders',
})))
