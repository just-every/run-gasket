// REPORT-009: versioned descriptions of the calculations that ship today.
// Keep a changed calculation as a new version; do not rewrite version 1.
// Report source doors accept their existing from/to and scope query parameters.
// Record-specific measures link to their public JSON directory; use its ids
// with /api/gasket/assets/:id, requisitions/:id or suppliers/:id for details.
import { INTERVENTION_METRICS } from './intervention-metrics'
import { REPLENISHMENT_METRICS } from './replenishment-metrics'
import { RECEIVING_METRICS } from './receiving-metrics'
import { PURCHASE_METRICS } from './purchase-metrics'
import { VENDOR_METRICS } from './vendor-follow-up-metrics'

export type MetricDefinition = Readonly<{
  id: string
  name: string
  version: 1
  requiredCapability?: 'work.review'
  formula: string
  eventTime: string
  exclusions: string
  freshness: string
  sourceDoor: string
  clause: string
}>

type DefinitionRow = readonly [id: string, name: string, formula: string, exclusions?: string, eventTime?: string, freshness?: string]
const LIVE = 'Recomputed on request from persisted records; changes appear on the next request. No live equipment or external-ledger freshness is implied.'
const DAYS = 'Selected site-local dates, both included; defaults to the last 30 days through today.'
const OUTAGES = `${DAYS} Overlapping outages are clipped to the window, ending at now when earlier than the selected end.`
const GOOD_READINGS = 'Recomputed on request from meterState normalized good readings (including corrections) and effective counter-change points. Uncorrected suspect/stale readings supply no coverage; no extrapolation beyond first and last accepted points.'
const ESTIMATES = 'Merged work is excluded. Missing estimates contribute no hours and remain counted explicitly; estimates are not actual labor.'

function definitions(sourceDoor: string, clause: string, eventTime: string, exclusions: string, rows: readonly DefinitionRow[], freshness = LIVE): MetricDefinition[] {
  return rows.map(([id, name, formula, omitted, time, fresh]) => Object.freeze({
    id, name, version: 1 as const, formula, eventTime: time ?? eventTime,
    exclusions: omitted ?? exclusions, freshness: fresh ?? freshness, sourceDoor, clause,
  }))
}

/** Frozen array and frozen scalar-only records; this is the immutable version-1 catalog. */
export const METRIC_DEFINITIONS: readonly MetricDefinition[] = Object.freeze([
  ...INTERVENTION_METRICS,
  ...PURCHASE_METRICS,
  ...RECEIVING_METRICS,
  ...REPLENISHMENT_METRICS,
  ...VENDOR_METRICS,
  // board.ts intentionally has different status and time policies from performance.ts.
  ...definitions('/api/gasket/board', 'GAS-10', 'Current state on request; due dates are compared with today in the site time zone.', 'No additional exclusions beyond the stated status filter.', [
    ['board.overdue', 'Board overdue work', 'Count work with due_date before today and status other than closed, cancelled or submitted.'],
    ['board.awaiting-review', 'Board waiting for review', 'Count work with status submitted.'],
    ['board.unassigned', 'Board unassigned work', 'Count work with no assignee and status other than closed, cancelled or submitted.'],
    ['board.follow-ups', 'Board open follow-ups', 'Count work with follow_up_of set and status other than closed or cancelled; submitted follow-ups remain included.'],
    ['board.down-now', 'Board assets down now', 'Count open, non-degraded downtime records; each row shows max(0, minutes from started_on to now).', 'Degraded operation is excluded; planned stops are included.', 'Open downtime starts through the current site-local clock.'],
    ['board.downtime', 'Board recent downtime minutes and events', 'Per asset, sum max(0, minutes from max(started_on, window start) to ended_on or now); events count qualifying records. Overlaps are summed, not deduplicated.', 'Degraded operation excluded; planned stops included. No production-hours filter.', 'Window starts at site-local midnight of today minus 30 days and runs through now; ended_on at the start boundary qualifies.'],
    ['board.low-stock', 'Board parts below minimum', 'Count parts whose summed movement quantity is less than minimum quantity; show on-hand and minimum quantities.', 'Reservations do not reduce on-hand for this comparison.'],
  ]),

  ...definitions('/api/gasket/performance', 'REPORT-004', `${DAYS} Optional team scope. Backlog is current state, independent of the selected reporting dates.`, ESTIMATES, [
    ['performance.backlog', 'Backlog orders and estimated hours', 'Count open, in_progress and returned work; hours = sum known estimate_minutes / 60, rounded to one decimal.'],
    ['performance.backlog-age', 'Backlog age bands', 'Count backlog and sum its estimated hours in 0–7, 8–30, 31–90 and over-90-day bands; age is site-local days from created_at to today.'],
    ['performance.unestimated', 'Work without an estimate', 'Count and list backlog with no estimate_minutes; each backlog, age-band and work-mix tally also discloses its unestimated count.'],
    ['performance.overdue', 'Performance overdue backlog', 'Count backlog due before today and sum its known estimated hours.'],
    ['performance.at-risk', 'At-risk backlog', 'Count status-open work due from today through today plus 7 days, inclusive, and sum known estimated hours.'],
    ['performance.awaiting-review', 'Work awaiting review and oldest age', 'Count submitted work, sum known estimated hours and report maximum site-local days from submitted_at to today; oldest age is null with no submitted work.'],
    ['performance.pm-compliance', 'PM on-time compliance', '100 × on-time PM occurrences / non-pending occurrences, rounded to one decimal; null with an empty denominator.', 'Merged work and pending occurrences excluded. Late, overdue, cancelled, approved skips and ungenerated occurrences remain in the denominator.', `${DAYS} Occurrence = schedule plus due_date; highest work number wins duplicates. Submission date in the site zone is completion when status is submitted or closed; latest approved skip overrides its occurrence.`],
    ['performance.pm-outcomes', 'PM occurrence outcomes and denominator', 'Count on_time, late, overdue, cancelled, skipped, ungenerated and pending outcomes separately; denominator is every outcome except pending.', 'Merged work excluded. Ungenerated covers an active schedule’s current overdue next_due_date with no issued work; historical missing occurrences are not reconstructed.', `${DAYS} Issued work is on time if its qualifying submission date is at or before due_date; otherwise late, cancelled, overdue or pending. Approved skips override. Ungenerated uses current schedule state.`],
    ['performance.planned-reactive', 'Planned and reactive work', 'Count closed preventive and corrective work separately, sum known estimated hours and disclose missing-estimate counts; planned share = 100 × preventive / (preventive + corrective), one decimal or null.', ESTIMATES, `${DAYS} Work must currently be closed and its closed_at site-local date must fall in the selected period.`],
    ['performance.schedule-attainment', 'Schedule attainment', '100 × judged due work submitted on or before due_date / judged due work; also show attained and due counts and missed work. One decimal or null.', 'Merged work and work neither past due nor submitted/closed excluded. Cancelled due work remains counted; schedule exceptions without work are not separate attainment rows.', `${DAYS} Work due_date lies in period; judged if due_date is before today or qualifying submission exists. Completion uses submitted_at in the site zone, not approval time.`],
  ]),

  ...definitions('/api/gasket/reliability', 'REPORT-003', `${DAYS} Site or exact asset, without descendants; stops must start at or after window start and before window end, capped at now. Latest classification counts.`, 'Planned stops and degraded operation are excluded from failure measures; planned stops remain listed separately.', [
    ['reliability.failures', 'Reliability failures and planned stops', 'Count non-planned, non-degraded stops starting inside the window; separately count planned non-degraded stops.'],
    ['reliability.operating-hours', 'Operating hours and meter coverage', 'For each asset’s first hour counter by name then id, subtract first good normalized reading from last good reading within the window; aggregate known differences. Hours display one decimal.', 'Only counter units h, hr, hrs, hour or hours qualify. Fewer than two good readings means unknown operating hours, not zero.', undefined, GOOD_READINGS],
    ['reliability.unknown-hours', 'Reliability unknown coverage hours', 'Per reported asset, hours before the first and after the last good reading; whole window if fewer than two. Aggregate displayed per-asset unknown hours, rounded to one decimal.', 'Coverage is elapsed wall time, not run hours. Unselected assets without failures and without usable operating readings are omitted from the returned asset set.', undefined, GOOD_READINGS],
    ['reliability.mtbf', 'Mean time between failures (MTBF)', 'Sum known operating hours / failures starting within their asset’s first-to-last-good-reading span, rounded to one decimal; null with no covered failures. Per-asset MTBF uses that asset’s hours and covered failures.', 'Planned/degraded stops and failures outside good hour-meter coverage excluded; excluded failure count is disclosed. Missing run hours are not estimated.', undefined, GOOD_READINGS],
    ['reliability.mtbf-sample', 'MTBF sample and exclusions', 'Sample = covered failure count; exclusions = all qualifying failures minus covered failures; disclose operating hours and unknown hours.', 'Same qualifying-failure and meter rules as MTBF.', undefined, GOOD_READINGS],
    ['reliability.mttr', 'Mean time to repair (MTTR)', 'Mean stored stop-to-return minutes of ended qualifying failures, rounded to one decimal; null with no ended failures.', 'Still-open failures excluded and counted; planned/degraded stops excluded. Duration is the whole stored repair, not clipped to the report window.'],
    ['reliability.mttr-sample', 'MTTR sample and exclusions', 'Sample = ended qualifying failures; excluded = qualifying failures still open.'],
    ['reliability.mtta', 'Mean time to acknowledge (MTTA)', 'Mean minutes from failure start to first workorder.acknowledge audit event on its work at or after that start, rounded to one decimal; null with no matching acknowledgments.', 'Failures without a matching acknowledgment excluded and counted; planned/degraded stops excluded. Acknowledgment lookup is not capped at report-window end.'],
    ['reliability.mtta-sample', 'MTTA sample and exclusions', 'Sample = failures with acknowledgment at or after stop; excluded = remaining qualifying failures.'],
    ['reliability.failure-pareto', 'Failure-mode Pareto', 'Group qualifying failures by latest failure mode, descending count; share = 100 × row count / total failures; cumulative share uses running count. Percentages have one decimal.', 'Missing failure codes remain in an Unclassified row; planned/degraded stops excluded.'],
    ['reliability.repeats', 'Repeat failures', 'Group qualifying failures by asset and known failure mode; list groups with at least two failures and each group’s failure count.', 'Unclassified failures cannot form a repeat group; planned/degraded stops excluded.'],
  ]),

  ...definitions('/api/gasket/availability', 'REPORT-002', `${OUTAGES} Scope is site or selected entry and descendants, using the current hierarchy and production schedule.`, 'Time outside the clipped window is excluded; minutes are whole and displayed hours and percentages have one decimal.', [
    ['availability.production', 'Production time', 'Sum unioned current weekly production windows inside the report window; with no declared windows use the entire window.', 'Historical production schedules are not reconstructed; current declared hours apply to the whole period.'],
    ['availability.planned', 'Planned production time', 'Union production minutes inside latest-classified planned stops of an entry or its descendants.', 'Time outside production hours excluded; overlapping planned stops counted once.'],
    ['availability.denominator', 'Availability denominator', 'Production minutes minus unioned planned production minutes.'],
    ['availability.down', 'Failure downtime', 'Union failure-stop production spans for the entry and descendants, intersected with denominator spans.', 'Planned time, degraded operation and time outside production hours excluded; overlapping failure spans count once.'],
    ['availability.up', 'Availability numerator minutes', 'Denominator minutes minus unioned failure downtime minutes.', 'No independent positive-running evidence is required by this arithmetic; unknown coverage is disclosed separately and is not subtracted.'],
    ['availability.percent', 'Production availability', '100 × (denominator minutes − down minutes) / denominator minutes, one decimal; null if denominator is zero.', 'Planned time and degraded operation do not lower availability. Unknown coverage is displayed separately, not removed from the arithmetic.'],
    ['availability.overlap', 'Availability overlapping failure minutes', 'Sum each failure’s production minutes inside denominator spans, minus unioned failure downtime.', 'Overlaps measure duplicate failure time in the selected subtree; planned and degraded spans excluded.'],
    ['availability.degraded', 'Degraded running time', 'Union degraded-operation production spans inside denominator, minus unioned failure downtime.', 'Planned and failure downtime take precedence; degraded running does not lower availability.'],
    ['availability.unknown', 'Availability unknown coverage', 'Denominator spans minus union of every hour meter’s first-to-last-good-reading span on the entry and descendants; report remaining minutes.', 'Fewer than two good readings provides no coverage. Coverage is not extrapolated and does not alter the availability calculation.', undefined, GOOD_READINGS],
    ['availability.outages', 'Outage production and outside-production minutes', 'Per overlapping outage, production minutes = clipped span intersected with production windows; outside minutes = clipped elapsed minutes minus production minutes. Entry outage count includes all kinds.', 'No stop-start-in-period requirement; outages beginning earlier still qualify.'],
    ['availability.down-now', 'Availability entries down now', 'List distinct asset tags in the entry’s subtree with open failure outages overlapping the selected window.', 'Planned and degraded outages excluded; an open outage must overlap the chosen report window.'],
  ]),

  ...definitions('/api/gasket/bad-actors', 'REPORT-005', `${OUTAGES} Current hierarchy, latest stop classification and latest documented loss rates apply.`, 'Planned stops and degraded operation are excluded and counted separately; time outside production windows is excluded.', [
    ['bad-actors.downtime', 'Ranked failure downtime', 'Sum failure production minutes after removing overlap with earlier failures on the same ancestor/descendant branch; earliest started_on wins, then shallower entry, then id.', 'Unrelated entries remain separate losses even when simultaneous; planned production time is not subtracted from this ranking.'],
    ['bad-actors.failures', 'Ranked failure count and excluded stops', 'Count overlapping failure outages, including those with zero counted minutes; separately count planned and degraded outages.'],
    ['bad-actors.duplicate', 'Duplicate failure minutes not counted', 'Sum each failure’s production minutes minus its retained ranked minutes.', 'Only overlapping ancestor/descendant failures deduplicate; unrelated failures do not.'],
    ['bad-actors.pareto', 'Downtime Pareto share and cumulative share', 'Group retained minutes by asset, nearest line, latest failure mode or trimmed case-insensitive reason; rank descending minutes. Share = row minutes / total × 100; cumulative uses running minutes; one decimal or null.', 'Missing line and mode remain No line and Unclassified rows; zero-minute failures remain contributors.'],
    ['bad-actors.repeats', 'Downtime Pareto repeat groups', 'Group failures by asset and known failure mode; groups of two or more are repeats; ranking rows disclose number of repeat groups.', 'Unclassified failures excluded from repeats only; they remain in ranked downtime.'],
    ['bad-actors.repair-cost', 'Ranked repair cost and unknown work', 'Sum recorded work-cost entries on distinct failure work orders once per ranking row or site total; known totals sum in whole USD cents, unknown work count stays separate.', 'No cost entry means unknown, not zero. The same work may contribute to different ranking rows; do not sum row costs as a deduplicated installation total.', 'Failure selection uses the clipped report window; cost entries on its linked work are summed regardless of their recording date.'],
    ['bad-actors.loss-rate', 'Documented production loss rate', 'Use the latest documented cents per production hour on the failed entry, otherwise the nearest ancestor with a documented rate.', 'An explicit unknown rate on a nearer entry stops inheritance; missing or unknown rates remain unknown.'],
    ['bad-actors.lost-production', 'Documented lost production and unknown minutes', 'Per failure round(counted minutes × documented cents/hour / 60) to whole cents; total known losses; separately sum counted minutes lacking a known rate.', 'Missing rates are not estimated or silently zeroed; known loss may be partial.'],
  ]),

  ...definitions('/api/gasket/stores', 'PART-009', 'Selected site-local dates, both included; defaults to last 90 days. Movements use recorded at instants within local midnight boundaries; closing balances use movements before next-day midnight.', 'Current single-site stock movements only; moved-in work-history costs never enter demand. Quantities retain three-decimal precision.', [
    ['stores.opening-closing', 'Stores opening and closing stock value', 'Sum signed kept movement values before period start for opening and before period end for closing, in whole USD cents.', 'Null movement values contribute no priced value; unpriced stock remains in quantities.'],
    ['stores.average-value', 'Average stock value', 'Round half up((opening cents + closing cents) / 2) to one cent.'],
    ['stores.net-issued', 'Issued value less returned value', 'Negate reconciliation’s signed issue and return movement values in the selected period.'],
    ['stores.turns', 'Inventory turns', 'Net issued cents / rounded average opening-and-closing cents, rounded to two decimals; null when average value is not positive.', 'Not annualized; unpriced stock has no invented value.'],
    ['stores.stockouts', 'Stockout events, affected parts and share', 'Stocked parts have positive on-hand immediately before or after an in-period movement. Stockout event = movement from positive to nonpositive on-hand; share = 100 × stocked parts with events / stocked parts, one decimal or null.', 'A positive opening balance with no in-period movements does not set stocked in the current implementation. Parts never seen positive are excluded from the denominator.'],
    ['stores.out-at-end', 'Stocked parts out at period end', 'List parts satisfying the stores stocked predicate whose closing on-hand is nonpositive.', 'Uses the same movement-observed stocked population as stockout share; not all zero-stock catalog parts.'],
    ['stores.demand', 'Parts demand by work order and asset', 'Sum issues less returns per part quantity and negate their signed kept values; group by linked work or asset. Unpriced movement counts are retained in JSON.', 'Receipts, counts and opening movements excluded. Missing values contribute no priced demand; missing work/asset links do not form that grouping.'],
    ['stores.committed', 'Reserved demand now', 'List nonzero current open-reservation quantities per part.', 'This is current reserved quantity, not historical period-end demand.', 'Current reservations on request, independent of selected from/to dates.'],
    ['stores.slow', 'Slow stock', 'List positive closing stock with no issue movement during selected period, with on-hand quantity and last issue time.', 'Returns and reservations are not issues.'],
    ['stores.dead', 'Dead stock', 'List positive closing stock with no issue during the 365 site-local days ending on the selected to date.', 'Returns and reservations are not issues; last issue is read only through the report end.'],
    ['stores.count-accuracy', 'Inventory count accuracy', '100 × exact expected-quantity hits / counts, one decimal or null; counts combine direct count movements and submitted planned count lines.', 'Planned lines are counted once via count submission; their linked variance movements are not direct counts. Direct zero variance and planned counted = expected are hits.'],
    ['stores.moved-in', 'Moved-in opening stock', 'Sum imported opening-movement quantities per part through selected report end; list nonzero totals separately.', 'Opening stock belongs in balances, never demand; this total is cumulative through end, not only in-period imports.'],
  ]),

  ...definitions('/api/gasket/valuation', 'PART-007', 'Selected site-local dates, both included; defaults to first day of selected to month through to (today by default). Movement at is the accounting time.', 'Null kept values are not invented; pre-valuation and moved-in opening stock remain unpriced. Vendor-price changes revalue no existing movement.', [
    ['valuation.stock-value', 'Stock value', 'Sum signed kept value_cents over movements; the Parts page sums current values across all parts. Whole USD cents.', undefined, 'All persisted movements for current Parts stock; reconciliation closing uses movements before midnight after to.'],
    ['valuation.average-unit', 'Average unit cost', 'Round half up(stock value cents × 1000 / on-hand milliunits); null when no positive on-hand.', 'Quantity includes unpriced movements; do not infer full valuation coverage from a numeric average.'],
    ['valuation.opening-closing', 'Valuation opening and closing quantities and values', 'Opening sums movements before from midnight; closing sums movements before midnight after to; report each part’s quantities and values and total values.'],
    ['valuation.received', 'Received and opening-stock movements', 'Sum signed quantity and kept value for receive and opening kinds inside the selected period.', 'Opening imports remain identifiable in movements; received does not mean every movement was a priced native receipt.'],
    ['valuation.issues-returns-counts', 'Issue, return and count-adjustment reconciliation', 'Separately sum signed quantity and kept value for issue, return and count kinds inside period; opening + received + issued + returned + counted = closing.'],
    ['valuation.unpriced', 'Unpriced movements', 'Count movements through report end with null value_cents, or receipt kind with null unit_price_cents.', 'Count is cumulative, not restricted to from; a receipt with freight/tax but no price is still unpriced.'],
    ['valuation.receipt-value', 'Receipt landed value', 'Round half up(unit-price cents × received milliunits / 1000) + receipt freight cents + receipt sales-tax cents.', 'Entered unit price takes precedence over vendor price; with neither, only entered freight and tax are valued.', 'Receipt posting time; value is retained on that movement.'],
    ['valuation.issue-value', 'Issue movement value', 'Negative rounded half-up share of current stock value × issued quantity / on-hand; last quantity out consumes remaining value.', 'Changing vendor price does not alter an issue.', 'Issue posting time; kept signed movement value.'],
    ['valuation.return-value', 'Return movement value', 'Rounded half-up share of value still held by this work order for the part × returned quantity / quantity still held.', 'Uses the work’s retained issue/return values, not current vendor or stock unit price.', 'Return posting time; kept positive movement value.'],
    ['valuation.count-value', 'Count-variance movement value', 'Value variance at stock average; positive variance with no on-hand uses latest priced receipt’s landed unit value, else zero. Zero variance has zero value.', 'No vendor-price-only revaluation; unknown cost does not become an estimated cost.', 'Count posting time; kept signed variance value.'],
  ]),

  ...definitions('/api/gasket/assets', 'ASSET-007', 'Lifetime to request time for exactly this asset, without descendants; latest lifecycle revision and latest failure classification apply.', 'No depreciation, book value, future forecast or automatic repair-versus-replace decision is calculated.', [
    ['lifecycle.repair-cost', 'Lifecycle repair cost to date and coverage', 'Sum all recorded work-cost entries on this asset’s work, any status; null if no entries. Disclose costed work-order count and total work-order count.', 'Missing cost entries are unknown, not zero; movement-derived or imported historical costs are not added here.'],
    ['lifecycle.failure-downtime', 'Lifecycle failure minutes and stops', 'Sum stored minutes and count ended, non-degraded stops whose latest classification is failure.', 'Open, planned and degraded stops excluded; no production-hours clipping or overlap union.'],
    ['lifecycle.repair-replacement', 'Repair cost as share of replacement value', '100 × repair cents / recorded positive replacement cents, rounded to one decimal; null when either input is unknown.', 'Uses recorded replacement basis, not depreciation or market valuation.'],
    ['lifecycle.recorded-values', 'Lifecycle purchase, replacement and disposal amounts', 'Display latest recorded purchase cents, replacement cents with basis, and optional disposal proceeds in USD; missing remains unknown.', 'Recorded facts are not calculated book values.'],
    ['lifecycle.agreement-cost', 'Service-agreement annual cost and active status', 'Display recorded annual cents per agreement; active if starts_on ≤ today ≤ ends_on.', 'No prorating or addition to actual repair cost; missing annual amount remains unknown.'],
  ]),

  ...definitions('/api/gasket/assets', 'ASSET-001', 'Lifetime records on the selected asset and descendants in the current hierarchy, recomputed on request.', 'Historical hierarchy membership is not reconstructed; retired descendants remain in scope.', [
    ['hierarchy.descendants', 'Entries below the asset', 'Count current descendant entries, excluding the selected entry itself.'],
    ['hierarchy.work', 'Subtree open and closed work', 'Count work on selected entry and descendants: open = status not closed/cancelled (including submitted); closed = status closed.', 'Cancelled work excluded from both; moved-in work-history rows are not native work orders.'],
    ['hierarchy.downtime', 'Subtree ended downtime', 'Union ended non-degraded outage spans across the subtree and sum minutes, counting overlaps once.', 'Open and degraded outages excluded; planned stops included; no production-hours or period filter.'],
    ['hierarchy.overlap', 'Subtree shared downtime minutes', 'Sum each asset’s unioned ended non-degraded minutes minus the union across all subtree assets.', 'Same-asset duplicates are already unioned before this cross-asset overlap calculation.'],
    ['hierarchy.down-now', 'Subtree assets down now', 'List distinct subtree asset tags with open, non-degraded downtime.', 'Degraded operation excluded; planned stops included.'],
    ['hierarchy.moved-in-cost', 'Subtree moved-in maintenance cost', 'Sum work-history parts_cents, labor_cents and other_cents across the subtree; display categories and their sum in USD.', 'Native work costs are not added; absent imported amounts contribute zero to this roll-up.'],
  ]),

  ...definitions('/api/gasket/purchasing', 'BUY-001', 'Current recorded supplier and requisition data on request; supplier snapshots belong to the requisition’s requested_at time.', 'Requisitions are requests pending approval; their existence does not authorize spend or establish received stock.', [
    ['purchasing.lead-time', 'Supplier lead time', 'Display supplier’s recorded lead_days as whole calendar days.', 'No observed-delivery or predictive lead-time calculation.'],
  ]),
  ...definitions('/api/gasket/purchasing', 'BUY-001', 'Immutable requested line quantities at requisition requested_at; use requests[].id with /api/gasket/requisitions/:id for lines.', 'No prices, authorized spend or stock receipts inferred from requested quantities.', [
    ['purchasing.request-quantity', 'Requisition line quantity', 'Display positive quantity_milli / 1000 with the line’s recorded unit; retain precision to three decimals.'],
  ]),
  ...definitions('/api/gasket/purchasing', 'BUY-001', 'Current supplier catalog revision on request; use suppliers[].id with /api/gasket/suppliers/:id for items.', 'Unknown catalog price remains unknown; catalog changes do not rewrite quotations or purchase snapshots.', [
    ['purchasing.catalog-price', 'Supplier catalog quoted unit price', 'Display optional recorded USD price in whole cents per catalog unit; no extension or aggregation.'],
  ]),
  ...definitions('/api/gasket/purchase-orders', 'BUY-002', 'Each immutable numbered PO revision’s creation time; current order list uses its current revision. The same arithmetic applies to immutable quotation snapshots at /api/gasket/quotes.', 'USD only. Tax amounts are entered facts, not a tax determination; values do not imply approval, delivery, receipt or payment.', [
    ['purchasing.line-extended', 'Quote and purchase-order extended line value', 'Round half up(unit-price cents × quantity_milli / 1000) to whole USD cents.'],
    ['purchasing.subtotal', 'Quote and purchase-order subtotal', 'Sum already-rounded extended line cents; quantities and unit prices retain their recorded units.'],
    ['purchasing.freight-tax', 'Recorded freight, sales tax and buyer use tax', 'Display separately entered freight, salesTax and useTax cents; omitted amounts are zero.', 'No percentage-derived tax estimate; exempt tax treatment refuses nonzero sales/use-tax amounts.'],
    ['purchasing.vendor-payable', 'Vendor payable', 'Subtotal cents + freight cents + recorded sales-tax cents.', 'Buyer use tax excluded from vendor payable.'],
    ['purchasing.commitment', 'Total purchase commitment', 'Vendor payable cents + recorded buyer use-tax cents.', 'Snapshot total is not a budget balance or actual posted spend.'],
  ]),

  ...definitions('/api/gasket/automation', 'PM-008', 'Health calculated at request time from persisted job and schedule records; no retrospective report-date filter.', 'No external email/push delivery worker is configured; notice storage is not external delivery confirmation.', [
    ['automation.last-next-trigger', 'Last scheduler trigger and next trigger', 'Last trigger = most recent scheduler ran_at with its state; next trigger = next 15-minute UTC epoch boundary.', 'Next trigger is a schedule time, not proof of future execution.'],
    ['automation.last-success', 'Rule last successful execution', 'Most recent started_at of a completed job for each automation rule; null if none.', 'Failed, running and paused attempts are not successful executions.'],
    ['automation.uncovered', 'Minutes without successful automation and missed status', 'Floor elapsed minutes since latest completed job started_at, otherwise rule changed_at; max with zero. Missed if known elapsed exceeds 45 minutes.', 'Null when neither timestamp exists. This measures absence of recorded completion, not the number of lost obligations.'],
    ['automation.due-coverage', 'Preventive due-event coverage', 'Per schedule choose paused, work_issued, due, cancelled_occurrence_owed, reading_held, no_good_reading or not_due from pause state, open work and ordinary evaluator preview, in that precedence.', 'No percentage completeness claim; preview writes no work. Existing open work suppresses generation. Held and missing-good-reading conditions stay explicit.', undefined, 'Re-evaluated on request against current rule revisions, schedule state, lead time and good meter readings; pending or stale evidence is not assumed current.'],
    ['automation.recent-jobs', 'Recent execution outcomes', 'List latest 50 jobs ordered by started_at descending then id descending, retaining governing revision, source and outcome.', 'Recent list is capped at 50, not a complete-history failure rate; /api/gasket/automation/jobs exposes retained ledger.'],
    ['automation.notices-stored', 'In-app notices saved', 'Count all persisted notice records.', 'Stored notices do not establish external delivery or that a recipient read them.'],
    ['automation.notice-running', 'Notice jobs still running', 'Count chase and expiry jobs with state running.', 'Other rule jobs and completed/paused/failed notice jobs excluded.'],
    ['automation.notice-failed', 'Failed notice jobs', 'Count chase and expiry jobs with state failed across retained history.', 'Not limited to recent 50 jobs; other rule jobs excluded.'],
  ]),
])
