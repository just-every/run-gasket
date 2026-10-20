// BUY-003 inherits REPORT-009 before exposing its budget measures.
import type { MetricDefinition } from './metric-definitions'
const definitions = [
  ['purchasing.budget-limit','Purchasing period budget','The owner-recorded immutable current policy revision\'s budget_cents, in whole USD cents.'],
  ['purchasing.budget-committed','Authorized purchasing commitments','Sum kept commitment amounts booked within the envelope\'s inclusive site-local dates, for its cost center or the whole site. Count an approved current revision once and retain every sent historic revision until explicit independent release.'],
  ['purchasing.budget-remaining','Remaining purchasing envelope','Recorded budget cents minus authorized committed cents. A negative result is an explicit overrun, never clamped to zero.'],
  ['purchasing.budget-overrun','Purchasing envelope overrun','Maximum of zero and authorized committed cents minus budget cents. Emergency confirmations retain the projected amount and overrun at that decision as a separate snapshot.'],
  ['purchasing.emergency-decisions','Confirmed emergency purchasing decisions','Count retained separately confirmed emergency override records; each names its exact PO revision, authority, reason and budget-impact snapshot. Multiple decisions do not add the same commitment twice.'],
] as const
export const PURCHASE_METRICS: readonly MetricDefinition[] = Object.freeze(definitions.map(([id,name,formula])=>Object.freeze({id,name,formula,version:1 as const,requiredCapability:'work.review' as const,
  eventTime:'An obligation is booked on its original authorization day in the site time zone; threshold-authorized purchases book at send. Budget date bounds include both ends. Emergency decisions use their recorded confirmation time.',
  exclusions:'Unapproved drafts, unsent superseded revisions and independently released commitments are excluded from authorized obligations and remain source-linked. Commitments are never received quantities, posted bills, paid amounts or actual maintenance cost. Site and cost-center envelopes overlap by design and must not be summed.',
  freshness:'Recomputed on request from retained policies, approval/commitment records, send claims and releases. No vendor, ledger or provider verification is inferred. The report names its current audit source revision and exposes original decision snapshots.',
  sourceDoor:'/api/gasket/spend-report',clause:'BUY-003'})))
