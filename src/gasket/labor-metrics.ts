import type { MetricDefinition } from './metric-definitions'
const sourceDoor='/api/gasket/work'
export const LABOR_METRICS: readonly MetricDefinition[]=[
  {id:'labor.approved-hours',name:'Approved person hours',version:1,clause:'FIELD-006',sourceDoor,
    formula:'Sum elapsed milliseconds divided by 3600000 for approved time entries, grouped by work and category. A correction replaces its original only on approval.',
    eventTime:'Actual start and end instants entered in site local time or captured by the timer; midnight splits use the site time zone. Repeated wall times use the later instant; nonexistent times are refused.',
    exclusions:'Pending, rejected and superseded sources contribute no approved time. They remain visible to their person and the owner. Overlap and more than 16 hours require explicit owner review; every entry needs review.',
    freshness:'Recomputed on request from retained sources. Active timer segments are not yet submitted or approved.'},
  {id:'labor.approved-cost',name:'Approved labor USD cost',version:1,clause:'FIELD-006',sourceDoor,
    formula:'At approval, split elapsed time at each site midnight. Regular minutes use remaining daily threshold after other approved time. Remaining minutes use the authorized overtime multiplier in hundredths. Round the whole entry to cents once. Preserve the selected rate and cost snapshot.',
    eventTime:'Approval snapshots the latest authorized person rate. Daily allowance follows approval order across all four categories and all work; replacing approved time excludes its original. Later rates and corrections do not reprice other approved entries.',
    exclusions:'Unapproved time contributes no actual cost. Missing rate refuses approval. The configurable overtime review policy is not a legal wage calculation and transmits no payroll data. Per-person pay rates and line costs require owner access; role-visible aggregate work costs retain existing access rights.',
    freshness:'Approved snapshots retained permanently; totals recompute on request. Rate policy changes are prospective for later approvals only.'},
]
