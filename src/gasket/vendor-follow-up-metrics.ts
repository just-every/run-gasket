// BUY-006 inherits REPORT-009 for its delivery follow-up measures.
import type { MetricDefinition } from './metric-definitions'
const rows = [
  ['vendor.outstanding', 'Outstanding vendor delivery quantities', 'Per line of each order\'s latest submitted revision: ordered quantity minus delivered quantity (quarantine included) plus supplier returns, never below zero, exact to three decimals.'],
  ['vendor.late', 'Late vendor deliveries and days late', 'An order is late while any line is outstanding and the site-local today is after its promised delivery day; days late = whole calendar days from the promised day to today. A completed order reports days from the promised day to its last delivery day when later.'],
  ['vendor.reminders', 'Vendor reminder emails by outcome', 'Count retained reminder claims by occasion (acknowledgment, late) and submission state. Provider acceptance is not mailbox delivery or vendor agreement.'],
] as const
export const VENDOR_METRICS: readonly MetricDefinition[] = Object.freeze(rows.map(([id, name, formula]) => Object.freeze({ id, name, formula, version: 1 as const, clause: 'BUY-006',
  eventTime: 'Submission claim, receipt posting and reminder claim instants shown as site-local days; promised delivery is the revision\'s recorded date.',
  exclusions: 'Orders whose only submissions were rejected, rate limited or failed are excluded; earlier submitted revisions of a revised order are not followed. Acknowledgments are buyer-recorded and not independently verified.',
  freshness: 'Recomputed on request from retained submissions, receipts, inspection returns, acknowledgments and reminder claims.',
  sourceDoor: '/api/gasket/vendor-follow-up',
})))
