# Gasket API

Every screen in Gasket uses the same handlers as this JSON API, so a person and an agent are held to the same rules. The API lives under `/api/gasket/` on the installation's own origin.

## Signing in

An agent gets its own sign-in: the owner gives an email address the **agent** role on *People and access*. The agent signs in with Base's ordinary email link (`POST /auth/magic-link`, then the emailed `/auth/confirm` link) and sends the session cookie it receives. A request without a live session answers `401 {"error":"authentication_required"}`; ended access answers `401` or `403`. Every `POST` must carry an `Origin` header equal to the installation's origin.

Roles: **owner** (everything), **lead**, **maintainer**, **supervisor** and **agent**. An agent can read everything below and call `proposal.prepare`; every other action answers `403 {"error":"forbidden"}` for it.

## Reading

`GET /api/gasket/NAME` returns JSON.

| Path | Returns |
| --- | --- |
| `agent-runs`, `agent-runs/ID`, `agent-grants/ID/preview` | AGENT-009 (owner only): the provider this installation holds a key for (a host name, never the key), the grants with budget and spend, and every model run with its input versions, provider outcome, cost and basis, tokens, proposals with their human decisions and any measured outcome; one run; the exact request a grant would send now, its versioned records, withheld data, reserve and `previewHash`. `/app/agent-runs.csv` downloads the same history. |
| `outcomes`, `outcomes/ID` | Retained AGENT-004 assessments, newest first, each with a source-record door; one immutable assessment with agreed windows, exposure, source records, uncertainty and comparisons. These are recorded snapshots, not live recomputations. |
| `me` | The signed-in person, their role, the site's date and time zone |
| `site` | Site name, time zone and `lead_days` (PM-001: whole days ahead of its due date that calendar PM work is issued; `site.configure` takes optional `leadDays`, 0 to 90, 7 by default) |
| `members` | People with access (owner only) |
| `assets`, `assets/ID` | The register; one asset with meters (latest good reading, normalized counter total, every reading with its source and receipt times, provenance and quality, and its explained changes), earlier identities, sightings and schedules |
| `assets/ID/history` | Every event on the asset in time order, with who did it |
| `parts`, `parts/ID` | Parts with on-hand, `reserved`, `available` and minimum; one part with every movement, its `reservations` and approved `substitutes`. `seen` is the movement sequence a count must name |
| `kits` | PART-002: repair kits with their lines, and every approved substitute |
| `stores` (`?from=&to=`, site-local, both included; default the last 90 days; optional `site`) | PART-009: `value` (opening, closing, average, net issued, `turns`), `stockouts` (stocked, events with the emptying movement, `outNow`), `demand` (`byWorkOrder`, `byAsset`, `committed`), `slow`, `dead`, `counts` (accuracy per part and in total) and `movedIn` opening stock (lead, supervisor, owner). `/app/stores/movements.csv` downloads the period's source movements |
| `valuation` (`?from=YYYY-MM-DD&to=YYYY-MM-DD`, site-local, both included; default this month) | PART-007: per part opening, `received`, `issued`, `returned`, `counted` and `closing` `quantity` and `valueCents`, `averageCents`, `unpriced` movements, `totals` and the disclosed `policy` (owner, lead, supervisor). `/app/parts/valuation.csv` downloads the same rows. Parts also carry `valueCents`, `averageCents` and `price_cents`; each movement its `value_cents` and, for receipts, `unit_price_cents`, `freight_cents` and `tax_cents` |
| `checklists`, `checklists/ID` | Checklists and every published revision |
| `schedules` | Schedules with cadence, next due date or meter value and any open work order |
| `notices` | My in-app notices, newest first (PM-006), each with its `link`; a mention (PLAN-006) also carries `comment_id` and `unread` |
| `work/ID/comments`, `assets/ID/comments` | One record's comments, oldest first, with my `unread` count and each comment's `unread`, `kind` (`comment` or `handoff`), mentions, photos (with SHA-256) and `revisions` (PLAN-006); `work/ID` and `assets/ID` carry the same as `comments` |
| `chase-rule` | The current chase rule (`number` 0 is Gasket's default) |
| `performance` (`?from=`, `?to=`, `?team=`, `?site=`) | REPORT-004 (lead, supervisor, owner): `backlog` now (count, estimated `hours`, `unestimated`, age `bands`, `overdue`, `atRisk`, `awaitingReview`), `compliance` for preventive occurrences due in the period (`denominator`, `onTimePercent`, `outcomes`, `occurrences` with their work, assignee and open blockers), `mix` (planned against reactive work closed in the period) and `attainment` (work due in the period done by its due date) |
| `reliability` (`?from=`, `?to=`, `?asset=`, `?site=`) | REPORT-003 (lead, supervisor, owner): `mtbf` (`hours`, `operatingHours`, `failures` inside hour-meter coverage, `excluded`, `unknownHours`), `mttr` and `mtta` (`minutes`, `sample`, `excluded`), `assets` (hour meter, covered span `from`/`to`, operating and unknown hours, MTBF), `failures` and `plannedStops` (each with its work, repair minutes, acknowledgement and every `classifications` entry), `pareto` (by failure mode, with `percent` and `cumulativePercent`), `repeats` and `definitions` |
| `availability` (`?from=`, `?to=`, `?asset=`, `?site=`) | REPORT-002 (lead, supervisor, owner): `production` (`declared`, the declared `hours`, production `minutes`), `entries` (each line and entry with an outage, or the entry asked for and everything below it with an outage: `productionMinutes`, `plannedMinutes`, `denominatorMinutes`, `downMinutes` with overlaps counted once and `overlapMinutes`, `degradedMinutes`, `availabilityPercent`, `unknownCoverageMinutes`, `hourMeters`, `downNow`), `outages` (the source timeline: `kind` failure, planned or degraded, reason, failure mode, line, work, recorded and clipped `span`, `startsBefore`, `endsAfter`, `open`, `productionMinutes`, `outsideProductionMinutes`) and `definitions` |
| `bad-actors` (`?from=`, `?to=`, `?asset=`, `?site=`) | REPORT-005 (lead, supervisor, owner): `byAsset`, `byLine`, `byFailureMode` and `byReason` (each row: `label`, counted `minutes`, `failures`, `percent`, `cumulativePercent`, `repeats`, `repairCents` and `repairUnknown`, `lossCents` and `lossUnknownMinutes`, `contributors`), `totals`, `excluded` (planned stops, degraded running), `repeats`, `failures` (each with `productionMinutes`, counted `minutes`, `duplicateMinutes`, `duplicateOf`, `repairCents`, `rate` with entry and basis, `lossCents`; `null` is unknown) and `definitions`. `/app/bad-actors.csv` downloads the same inputs. |
| `teams` | Teams with their `trade`, `members` and `work` (the team's queue: open work naming the team, soonest due first) (PLAN-002) |
| `scheduler` | The automatic scheduler (lead, owner, supervisor): `cron`, `lastRun`, recent `runs`, `gaps` (when it had not run for more than 45 minutes) and `late` (calendar work it issued after its due date) |
| `work` (`?mine=1`, `?team=ID`, `?state=closed`), `work/ID` | Work lists (`mine` is work assigned to me or that I collaborate on, with `my_part`; `team` is one team's work); one work order with its `crew` (team, trade, shift, collaborators, handoffs, acknowledgements and declines, contributors), checklist results, readings, parts, downtime, findings, evidence, reviews, overdue decisions and what still blocks submission |
| `board` | Overdue work, waiting for review, `unassigned` open work, open follow-ups, assets down, 30-day downtime, low parts (lead, supervisor, owner) |
| `proposals` | Proposals with payload, reasoning, basis, status and decision |
| `imports` | The move-in journal (lead, owner) |
| `audit` (`?action=`, `?from=`, `?to=`, `?site=`, `?limit=`, `?before=`) | Audit entries newest first, 100 a page (`limit` up to 500); `next` continues with `before`. `action` is one action or a family such as `workorder`; `from` and `to` are site-local dates; each entry carries the role it acted under and its authority (supervisor, owner). `/app/audit.csv` with the same filters downloads every matching entry. |

## Changing

`POST /api/gasket/ACTION` with a JSON body. Success answers `200` with the result (usually `{"id": ...}`); a refusal answers `4xx {"error": CODE, "detail"?: ...}`. Codes are stable words such as `forbidden`, `stale`, `not_your_work`, `insufficient_stock`, `meter_went_backwards`, `not_ready_for_review`, `own_work`, `proposal_stale` and `undo_blocked`.

Actions: `site.configure`, `site.technicianWork`, `access.give`, `access.role`, `access.end`, `asset.create`, `asset.update`, `asset.retire`, `asset.lifecycle`, `asset.agreement`, `asset.sighting`, `asset.state`, `downtime.classify`, `production.hours.add`, `production.hours.remove`, `work.cost`, `loss.rate`, `template.save`, `template.retire`, `workorder.priority`, `workorders.fromTemplate`, `part.substitute`, `kit.create`, `bom.revise`, `workorder.reserve`, `reservation.release`, `meter.create`, `meter.window`, `meter.feed`, `meter.adjust`, `code.set`, `code.move`, `code.retire`, `part.create`, `part.receive`, `part.quarantine.dispose`, `part.count`, `checklist.create`, `checklist.revise`, `schedule.create`, `schedule.edit`, `chase.rule`, `team.create`, `team.member`, `workorder.collaborate`, `workorder.acknowledge`, `workorder.decline`, `workorder.respond`, `blocker.raise`, `blocker.resolve`, `schedule.defer`, `schedule.exception`, `closure.add`, `closure.remove`, `workorders.generate`, `workorder.create`, `workorder.assign`, `workorder.plan`, `workorder.cancel`, `workorder.results`, `workorder.evidence`, `workorder.readings`, `workorder.issue`, `workorder.return`, `downtime.start`, `downtime.end`, `finding.record`, `workorder.submit`, `workorder.review`, `proposal.prepare`, `proposal.decide`, `import.preview`, `import.apply`, `import.job`, `workorders.bulk`, `workorder.reopen`, `workorder.merge`, `schedule.skip`, `rule.set`, `workorder.acknowledge`, `asset.move`, `comment.post`, `comment.edit`, `comment.read`, `agentrun.grant`, `agentrun.revoke`, `agentrun.start`.

ASSET-007: `asset.lifecycle` (lead, owner) takes `asset`, the `revision` read (none the first time; `stale` otherwise), optional `purchasedOn`, `purchaseCost`, `supplier`, `commissionedOn`, `warrantyUntil`, `warrantyTerms`, `replacementValue` with `replacementBasis` (US dollars, `$` and commas allowed); `asset.agreement` takes `asset`, `provider`, optional `reference`, `scope`, `startsOn`, `endsOn` and optional `annualCost`; `asset.retire` takes optional `disposalMethod` (`sold`, `scrapped`, `returned`, `transferred`, `donated`, `other`), `disposedOn` and `disposalProceeds`. `assets/ID` carries `lifecycle` (`facts`, `agreements`, `comparison`); `/app/assets/ID/ledger.csv` (lead, supervisor, owner) is the ledger handoff.

`asset.create` takes optional `level` (`building`, `line`, `machine` by default, or `component`) and `parent` (none: directly under the site). A parent ranks above its child in that order (a component may hold components) and is active (`parent_level`, `parent_retired`). `asset.move` (lead, owner) takes `asset`, the `revision` you read and `parent` (empty for the site) and moves the entry with everything below it; it refuses `cycle` (the entry itself or anything below it), `parent_level`, `parent_retired`, `stale` and `unchanged`. `asset.retire` refuses `active_children`. `assets/ID` carries `hierarchy`: `level`, `parent`, `path` (from the site down), `children` and `subtree` (`below`, `downNow`, `openWork`, `closedWork`, `downtimeMinutes`: ended outages of the entry and everything below it with overlaps counted once, `downtimeOverlapMinutes`, and `movedInCostCents` parts, labor and other).

`comment.post` (owner, lead, maintainer, supervisor; never an agent) comments on a `workOrder` or an `asset` (one of them): `body` (up to 2,000 characters), optional `handoff` (`yes` marks a shift handoff summary), optional `mention` list (active people other than agents; each gets one in-app `mention` notice linking to the comment) and up to four `photo` files (PNG, JPEG, WebP or HEIC, up to 1.5 MB each; in JSON, `{filename, base64, type}` objects). `comment.edit` (its author only: `not_your_comment`) takes `comment` and the new `body`; every version stays in `revisions`, and the same text is `unchanged`. Nothing deletes a comment; a closed, cancelled or merged record keeps its thread and takes new comments. A comment someone else wrote is `unread` for you until you open the record's page or send `comment.read` with its `workOrder` or `asset`; edits never make a read comment unread. Comment photos download at `/app/comment-photos/ID` for signed-in members. Every comment is internal: requester and contractor identities do not exist yet (ADMIN-004, REQ-004 keep these threads from them).

`rule.set` (lead, owner) approves a checklist's failed-step rule: `checklist`, `outcome` (a list holding `fail`, `attention` or both; empty switches it off), `severity` and `dueDays`. Recording a result the rule covers on a step that has no finding yet raises that step's finding and a corrective work order (due in `dueDays`, assigned to the inspection's assignee) carrying the step, note, readings and evidence; the work order view shows it as `origin`, and each finding's `obligation` is `open`, `acknowledged`, `resolved` (the correction was independently approved) or `cancelled`. `workorder.acknowledge` (the correction's assignee) takes `workOrder`; a correction cannot be submitted before it is acknowledged.

`workorder.create` (lead, owner, and a maintainer for work assigned to themselves or, with `unassigned: true`, left for a lead: FIELD-009; naming anyone else is refused `assign_to_self`, `unassigned` with `assignee` `assignee_or_unassigned`; while the owner has turned the technician right off with `site.technicianWork` (`allowed` true or false; `unchanged` when it already is) a maintainer is refused `create_work_right_revoked`; optional `startedOn` and `endedOn` record work already done, site-local `YYYY-MM-DDTHH:MM`, both or neither (`started_and_ended`), start not after end (`work_ends_before_start`), end not after now (`work_in_future`); the work keeps `created_via` `web` or `api`, `work_started_on` and `work_ended_on`, and a template's checklist pins its current revision) (PLAN-001) takes either `asset` or, for work with no asset, `location` (text, trimmed, up to 160 characters; both or neither is refused `asset_or_location`), and `priority` (`emergency`, `high`, `normal`, `low`; default from the template, else `normal`) and `template` (an active template; its title, instructions, priority and estimate fill what the work does not give, and the work keeps `template_id` and `template_revision`). `template.save` (lead, owner) takes `name` (unique, any case), `title`, optional `instructions`, `priority` and `estimateHours`, and with `template` plus the `revision` read saves the next revision (refusing `stale`, `template_name_taken`); `template.retire` takes `template`; `workorder.priority` takes `workOrder`, `priority` and `reason`. `workorders.fromTemplate` (lead, owner) raises one template's work for an `asset` list (up to 200) with `due`, optional `priority`, `assignee` and `preview`; a preview writes nothing, and each row reports `would_create`, `created` (with `id` and `number`) or its refusal (`asset_not_found`, `asset_retired`, ...). `templates` lists every template. `template.save` also takes a `requiredFields` list (active field ids; the existing `requiredField` spelling remains accepted), `requiresEvidence` and an optional `checklist` (FIELD-009); work made from that revision keeps both. `workfield.save` (lead, owner) takes `label` (unique, any case), `kind` (`text`, `number`, `choice`), an `option` list for a choice (2 to 30, or comma-separated) and `required`; `workfield.retire` takes `field`. `workorder.field` (assignee, collaborator, lead) takes `workOrder`, `field`, `value` (empty clears; numbers and choices are checked) and optional `version`. `workstatus.save` (lead, owner) takes `label` and a `role` list (`lead`, `maintainer`, `supervisor`); `workorder.waiting` takes `workOrder` and `status` (empty clears), refused `status_not_permitted` unless the person's role is named by both the current and the new status (the owner always may). `work-fields` lists fields and statuses. `schedule.create` takes `asset` or, for calendar work at a place with no asset, `location` (a meter needs an asset; both or neither is refused `asset_or_location`). `workorder.submit` answers `not_ready_for_review` with `detail.missing` naming each required field without a value and missing required evidence.

`team.create` (lead, owner) names a team: `name` (unique, any case), `trade` and optional `member` list; `team.member` takes `team`, `member` and optional `remove`. Members are active owners, leads or maintainers. `workorder.create` and `schedule.create` take optional `estimateHours` (more than 0, at most 1000, two decimals; kept in minutes), and `schedule.create` an optional `team` whose trade and estimate the work it issues carries. `workorder.create` and `workorder.assign` take optional `team`, `trade` (the team's by default) and `shift` (a label such as `Day` or `Night`); `workorder.assign` also takes a handoff `note`. When a work order names a team, `workorder.assign`, `workorder.plan` and `workorders.bulk` give it only to a member of that team (`assignee_not_in_team`). Every reassignment keeps a handoff (from and to person and shift, the note, who, when) and asks the new assignee to acknowledge again. `workorder.collaborate` (lead, owner) adds `member` as a collaborator, or removes one with `remove`; collaborators record results, readings, evidence, parts, downtime and findings alongside the assignee, while only the assignee acknowledges, declines, responds and submits; anyone else gets `not_your_work`. `workorder.acknowledge` (the assignee) acknowledges assigned work; `workorder.decline` (the assignee) needs a blocker (`kind`, `nextAction`, `promisedOn`, optional `owner`) and an optional `note`, returns the work unassigned and gives every active lead (the owners when there is none) an in-app `declined` notice.

`workorders.bulk` (lead, owner) takes `workOrder` and `version` lists (the versions you read), `action` (`assign` with `assignee`, `reschedule` with `due`, or `cancel` with `reason`) and optional `preview`. A preview writes nothing; either way each row reports its `outcome` (`would_change`, `changed`, `unchanged`, `stale`, `work_order_not_open`, `work_order_not_found`, `parts_still_issued` or `downtime_open`) and `notes` on what else it touches. `workorder.reopen` takes `workOrder` and `reason` (cancelled work reopens; reviewed corrective work returns for rework). `workorder.merge` takes the duplicate `workOrder`, `into` and `reason`. `schedule.skip` asks to skip an overdue `schedule` with no open work, with a `reason`; `schedule.defer` asks to move the current occurrence of `schedule` to `until` (after it, at most its `maxDeferDays` later), with a `reason`. Each answers `id` of the request; one request per schedule waits at a time (`exception_pending`). Nothing moves until `schedule.exception` (owner or supervisor, never the requester: `not_independent`) takes `exception`, `decision` (`approve` or `reject`) and optional `note`; on a site with one owner and no supervisor the owner may decide their own request with `singleApprover` `yes` (otherwise `confirm_single_approver`), and the exception is kept with `single_approver` 1; an approved skip moves the schedule to its next due date, an approved deferral moves it and its issued work order, which keeps its checklist revision. `schedules` lists each schedule's `exceptions`, newest first. `schedule.edit` (lead, owner) takes `schedule`, `revision`, `everyDays` and the calendar fields below, with optional `preview`; either way it answers `issued` (open work, unchanged), `before` and `after` (the next five due dates). `chase.rule` (lead, owner) approves a chase rule revision: `remindBeforeDays`, `responseWithinDays`, `leadAfterDays` and `supervisorAfterDays` (not below `leadAfterDays`). `workorder.respond` (the assignee) takes `workOrder` and `response` (`on_it`, or `blocked` with the blocker fields); `blocker.raise` (the assignee or a lead) takes `workOrder`, `kind` (`parts`, `access`, `skill` or `production`), optional `owner` (an active member; you by default), `nextAction` and `promisedOn` (today or later); `blocker.resolve` (its owner, the assignee or a lead) takes `blocker` and `resolution`. `work/ID` carries `chase`: `overdue_since`, `overdue_days`, `responses`, `blockers` and `notices`. `closure.add` (lead, owner) takes `kind` (`holiday` or `shutdown`), `label`, `startsOn` and optional `endsOn` (inclusive); `closure.remove` takes `closure`; `closures` lists them. Due dates the calendar placed move with the closures.

`asset.state` (lead, owner) declares an asset's state with a `reason`: `state` (`in_service`, `degraded`, `down` or `out_of_service`) and `effectiveOn` (site-local), or `corrects` (an earlier entry's id) to reclassify that entry at its own effective time; nothing is rewritten. Open downtime reads as `down` whatever is declared. `assets/ID` carries `states` (newest effective first, with `corrects` and `corrected_by`) and `conflicts`: `open_downtime` when declared in service or degraded during open downtime, `telemetry_running` when a feed counter rises while declared down or out of service; `assets` carries each asset's `conflicts` count.

`downtime.start` takes optional `planned` (a planned stop, not a failure) or `failureMode` (an active failure mode code), not both. It also takes `degraded` (REPORT-002: the asset kept running at reduced output; not a stop, and not with `planned`). `production.hours.add` (lead, owner) takes `weekdays` (ISO 1-7), `starts` and `ends` (HH:MM, up to `24:00`) and refuses `hours_overlap`; `production.hours.remove` takes `hours`. `work.cost` (REPORT-005; lead, owner) takes `workOrder`, `category` (`parts`, `labor`, `contractor`, `other`), `amount` (USD; negative corrects earlier entries) and `note`, and refuses `cost_below_zero`; the work order's `costs` lists the entries with `totalCents` (`null` when none). `loss.rate` (lead, owner) takes `asset`, `rate` (USD per production hour; empty records that the loss is unknown) and `basis`. `downtime.classify` (lead, owner) corrects a stop's classification with a `reason`: `downtime`, `planned` or `failureMode`; it appends a classification and never rewrites the stop or an earlier one, and a classification equal to the current one is refused.

`part.receive` takes optional `unitPrice` (USD per unit; blank uses the vendor price), `freight` and `tax` (USD), landed on that receipt (PART-007). `part.price` (lead, owner) sets or, blank, clears a part's vendor `price`; it revalues nothing. PART-004: `count.plan` (lead, owner) takes `title`, `counter` (an active owner, lead or maintainer) and a shelf `location` and/or `part` list. `counts`, `counts/ID` list and read counts (planners see all, a counter their own; the counter's open sheet has no `expected` or `onHand`). `count.submit` (the counter) takes `count` and parallel `line`, `counted` and `reason` (`lost` or `damaged` short, `found` over, blank when matched) lists for every line. `count.decide` (lead, owner, not the counter) takes `line`, `decision` (`approve`, or `reject` with a `note`). `site.countApproval` (owner) sets the USD `threshold` at or above which a variance waits. `part.substitute` (lead, owner) approves `substitute` in place of `part` (that direction only), with an optional `reason`; `withdraw` ends the approval. `kit.create` (lead, owner) names a repair kit with parallel `part` and `quantity` lists. `workorder.reserve` (lead, owner) reserves to open work either one `part` with `quantity` (and `insteadOf`, the part it fills in for, which needs an approved substitute) or a whole `kit`, with `swap` entries `PART:SUBSTITUTE` for lines filled by a substitute; it is refused with `insufficient_available` when any part would go below zero available, `substitute_not_approved` or `already_reserved`, and writes nothing then. `reservation.release` (lead, owner) takes `reservation` and `reason`. Cancelling, merging away or approving a work order releases its open reservations; `workorder.issue` never takes stock reserved for other work.

`bom.revise` (lead, owner) saves a new revision of an asset's bill of materials: `asset`; lines as parallel `part`, `quantity`, `serialFrom`, `serialTo` (an optional inclusive serial range, natural order); approved alternates as parallel `alternateFor` (a line's part), `alternate`, `alternateFrom`, `alternateTo`; `tool` names; an optional `note`; and optionally `revision`, the number you read (a stale one is refused). `assets/ID` and `work/ID` carry `bom`. `workorder.reserve` takes a part listed as an alternate on the asset's current revision only when it fits the asset's serial (`substitute_not_compatible`), and refuses a listed part outside its line's range (`part_not_compatible`).

`code.set` (lead, owner) adds a code at the end of its `kind` (`criticality`, `risk`, `failure_mode`, `cause` or `remedy`) with a `key` (lowercase letters, digits, `_` or `-`, at most 40, never changed), a `label` and optional `importNames` (comma-separated); the same `kind` and `key` again relabels it and replaces its import names. `code.move` takes `kind`, `key` and a 1-based `position`. `code.retire` takes `kind`, `key` and a `reason`; a retired code stays on every record that has it, is no longer given or matched, and the last active criticality level cannot be retired. `codes` (any role) lists the catalog in order with `retired`; an asset's `criticality` is a level key (`criticality_label` its label), and `finding.record` takes optional `failureMode`, `cause`, `remedy` and `risk` keys. `failures` (lead, owner, supervisor) counts findings and moved-in work per code, lists `unclassified` findings and moved-in work, and names the assets whose evidence disagrees with their state (`conflicts`). MaintainX `Criticality` and work `Categories` map onto active codes by key, label or import name, ignoring case.

`meter.feed` (lead, owner) records one reading from a named feed: `meter`, `value`, `takenOn` (the source time, site-local `YYYY-MM-DDTHH:MM`), `source` (the feed's name), optional `unit` (must be the meter's; otherwise `unit_mismatch`) and optional `quality` (`good` or `suspect`). A reading received more than its meter's feed window after its source time is kept as `stale`: the window is whole hours (1 to 168), set with optional `feedWindowHours` on `meter.create` (24 by default; a daily export might declare 36) and changed with `meter.window` (lead, owner: `meter`, `feedWindowHours`), which leaves readings already kept as they were received. Readings taken on a work order (`workorder.readings`) are attested by the person and never aged. Stale and suspect readings are kept and shown but never move a counter or make preventive work due; `workorders.generate` lists the schedules they hold back under `held`. A good counter reading below an earlier one answers `409 meter_went_backwards`. The answer carries `id`, `meter`, `quality`, `normalized` (the counter total across counter changes), `duplicate` (a delivery repeating a kept reading, same feed, source time and value, is that reading) and `created` (work its meter's schedules raised at once, PM-002). `workorder.readings` answers `created` the same way.

`meter.adjust` (lead, owner) appends an explained change, always with a `reason`: `kind` `reset`, `replacement` or `rollover` with `meter`, `effectiveOn` (after every kept reading), `lastValue` (the old count's last value) and `startValue` (where the new count starts), which carries `lastValue - startValue` forward into later normalized values; or `kind` `correction` with `reading` and the corrected `value`, which keeps the recorded value beside it and counts the reading as good. `assets/ID` lists each meter's readings (value, recorded value, normalized value, unit, source time `taken_on`, receipt time `received_on`, `provenance`, `source`, `quality`, correction) and its changes.

`finding.record` takes `severity`, `text`, optional `followUp` and `followUpDue`, and optional `item`: the index of the checklist step the finding answers in the work order's pinned revision. Submission needs a finding linked to every failed or needs-attention step.

`workorder.plan` is the decision on an overdue work order (lead, owner): `{"workOrder", "version", "plan"}` where `plan` is `keep` (it stays with the person who holds it), `as_is`, or `to:MEMBER_ID` (an ordinary assignment to someone else). It is recorded in the audit trail and in the work order's `decisions`.

Writes that change a versioned record take the version the caller read (`revision` for an asset, `version` for a work order, `seen` for a part count) and answer `409 {"error":"stale"}` if it moved. Files go as `{"filename": "...", "base64": "..."}`.

## Agent proposals

```http
POST /api/gasket/proposal.prepare
{"kind": "corrective",
 "reasoning": "Run hours rose 408 h since the last service and discharge temperature reached 41 °C.",
 "payload": {"asset": "ASSET_ID", "title": "Inspect condenser fan", "due": "2026-10-20", "assignee": "MEMBER_ID"}}
```

Kinds and their payload fields (all strings):

- `schedule`: `asset`, `checklist`, `title`, and `everyDays` + `firstDue` and/or `meter` + `everyUnits` (optional `firstDueMeter`), optional `assignee`; on a gauge meter instead of `everyUnits`: `when` (`above` or `below`), `threshold`, optional `resetAt` (re-arms at or past it; the threshold by default) and `sustainMinutes`; on a condition meter: `conditions` (a list from `good`, `fair`, `poor`, not all) and `sustainMinutes`; with both a calendar and a meter, `combine` (`first`, the default, or `both`); for calendar cadence optional `cadence` (`fixed`, the default, counts from the planned date; `completion` from the day the work is approved), `months` (1-12) and `weekdays` (ISO, Monday 1 to Sunday 7) lists (none means all), `observeClosures` (`yes` by default: move off closed days) and `maxDeferDays` (0-365, default 14). A due date on a day it may not fall moves forward to the next allowed day.
- `corrective`: `asset`, `title`, `due` (YYYY-MM-DD), optional `description`, `assignee`.
- `count`: `part`, `counted`, optional `note`.

The answer carries the proposal `id` and the SHA-256 `hash` of its exact payload. The payload is validated when prepared. A lead or the owner who did not prepare it decides on the Proposals screen or with `proposal.decide` (`proposal`, `decision` `approve` with the `hash`, or `reject` with a `note`). Approval runs the normal command as that person in the same atomic batch and answers `409 proposal_stale` if the asset or part the proposal relied on changed in the meantime.

## PM-009 nested preventive programs

`GET /api/gasket/programs` lists immutable task mappings and occurrence satisfaction evidence. `POST nested.map` (lead/owner) takes `higher`, `lower` schedule ids, `tasks` (lines such as `1 = 2`, lower task = higher task) and `reason`. Every lower task must map to a compatible higher step, with both current procedure revisions pinned. `POST nested.satisfy` (lead/owner) takes `higherWork`, `lowerWork` and optional `preview: true`; preview and missing tasks write nothing. Closed independently approved higher work can satisfy untouched lower work on the same due day only when all mapped tasks have passing original evidence. `/app/programs` serves mapping, preview/apply and retained evidence. The lower work is retained as cancelled with an explicit equivalent-work link, never recorded as performed.

## BUY-002 quotations and purchase orders

`GET /api/gasket/quotes`, `/api/gasket/purchase-orders` and `/api/gasket/purchase-orders/:id` read immutable snapshots and their exact approvals, submissions and separately recorded acknowledgments. Owner-as-buyer actions are `quote.save`, `purchase.save`, `purchase.send`, `purchase.acknowledge`; `purchase.approve` requires an independent supervisor/owner, never initiator or revision author. Saves take BUY-001 supplier/cost-center/work/asset links, parallel `kind`, `description`, `quantity`, `unit`, `unitPrice` lists, `deliveryOn`, `freight`, `salesTax`, `useTax`, `taxTreatment`, `taxNote` and up to five new `attachments` per save (PDF, PNG, JPEG or text, 1.5 MB each; up to 20 retained). Quote saves require `reference`; PO saves require `reason`, optional compared `quote` ids, `selectedQuote` and `comparisonNote`; revisions additionally require `order` and its current `revision`. Approve/send take `order` and `revision`. Acknowledgment takes `send`, `contact`, `reference`, `note`. `/app/purchase-orders` exposes comparison and draft forms, `/app/purchase-orders/:id` the history and exact-revision actions, `/app/purchase-files/:id` the signed-in download. Vendor payable excludes buyer use tax, which is separately recorded and included in commitment. One claimed provider submission per revision has an honest accepted/refused/uncertain/development outcome and never automatically retries.

## BUY-003 spend policies and independent authority

Owners save immutable policies with `spend.policy`: optional `policy`/current `revision`, optional `costCenter` (blank means site), inclusive site-local `from`/`to`, USD `budget`, parallel `threshold`/`approver` lists and optional `currency` (`USD` only). Empty form rows are ignored together; partially filled steps are refused. Thresholds are inclusive and earlier steps precede later ones. `spend.delegate` takes `principal`, `delegate`, inclusive `from`/`to`, `reason`, or a current `delegation`/`revision` with `revoke: true`. Named and acting authority must remain active owners/supervisors, independent of initiator and current revision author.

PO detail adds its current route, retained step decisions, emergency outcomes and releases. `purchase.approve` takes `order`, exact `revision`, optional `step` (otherwise the caller's next step), and `note`. Budget checks and commitment claims share the final approval/send transaction. `purchase.emergency` requires an independent reviewer's `order`, exact `revision`, `reason` and separate `confirm: true`; `purchase.release` requires an independent reviewer, sent `revisionId`, `reason` and `confirm: true`. Releases record no provider agreement, receipt, bill or payment. Existing send replay returns the retained submission without sending again. Site and cost-center limits both apply; approved current revisions and sent historic revisions count once until release, and unsent superseded revisions leave the obligation total. `/app/spend-policy` and `GET /api/gasket/spend-policy` are owner-only controls; `GET /api/gasket/spend-report` exposes source-linked budgets, obligations, exclusions, drafts, emergency snapshots and releases to owners/supervisors. Other internal readers retain order outcomes with budget values omitted. Unsupported currency is refused; every actual order edit creates a fresh revision. Small orders below all configured thresholds use explicit policy authority, without claiming a manual review.

## REPORT-009 measure definitions and data quality

`GET /api/gasket/metrics` and `/app/metrics` use the existing report-read right (owner, lead, supervisor). Optional `from`, `to`, `site` and `asset` follow the reliability report's period/scope rules; the cost, finding and import quality queues cover retained records, with counter coverage for the selected period. `metric` selects a definition id and `version=1` requests its immutable version; unknown ids/versions return 404. Each definition carries formula, event-time policy, exclusions, input freshness, clause and public source-list door. The response includes `computedAt`, `sourceRevision`, `latestChangeAt`, a reproducible `inputFingerprint`, coverage and source-linked cost/code/counter/import findings. Import review details require the existing `import.run` right; other report readers receive no import details. Applied move-ins retain reviewed omissions separately from current source facts, and legacy omissions remain explicitly unknown. Correct a missing stop code with the existing `downtime.classify` command; recomputation uses its latest classification and retains the original evidence.

## BUY-004 receiving and inspection

Read `/api/gasket/purchase-orders/ID/receipts` for each immutable revision's ordered, received, usable, quarantined, returned and outstanding quantities, plus retained deliveries and evidence. `/api/gasket/receipts/ID` gives the original snapshot, per-bin/lot/serial lines and inspection events. Sign-in is required for these doors and `/app/receipt-evidence/ID` original downloads.

Leads and the owner POST `receipt.receive` with `order`, `revisionId`, supplier-scoped `externalId`, delivery `freight`/`salesTax` (USD), optional `note`, `backorderNote`, `packingSlip` (the standard filename/base64/type file object), and `lines`: `{line: 0, part: "PART_ID", quantity: "6", quarantine: "1", bin: "A3", lot: "LOT_ID", serial: ""}`. `line` is the zero-based PO snapshot index. Quantities allow three decimals; stock units must match. A serialized line holds exactly one unit; split a PO line into multiple rows for bins, lots or serials. Identical receipt replays return `replayed: true`; changed payloads with that identity are refused.

POST `receipt.inspect` with `receiptLine`, `kind` (`release` or `return`), `source` (`quarantine` or `usable`), `quantity` and `reason`. Release requires quarantine; returns reopen outstanding replacement quantities. Quarantine never enters usable stock before release; usable supplier returns remove moving-average value as a negative receipt. Returned goods and original evidence remain attributed history, without claiming a financial credit.

## PART-005 replenishment

Leads and the owner manage the current part location with POST `replenishment.policy`: `part`, observed `revision` (0 initially), `minimum`, `maximum`, `reorderQuantity`, `safetyStock`, `supplier`, `costCenter`, active owner `purchaser`, whole-calendar `leadDays`, USD `unitPrice`, optional USD `freight`/`salesTax`/`useTax` and `taxNote`, `active`, `automatic`, and optional independently approved `envelope`. GET `replenishment` shows policies, shortage, proposed quantities and open documents; GET `replenishment/preview` is read-only. The page is `/app/replenishment`, linked from Stores.

The owner proposes `replenishment.envelope` with `supplier`, `costCenter`, inclusive `from`/`to`, USD `perOrder` and `periodLimit`, and `reason`. A different owner/supervisor POSTs `replenishment.envelope.approve` with `envelope`, `confirm: true`, and `reason`. The owner stops it with `replenishment.envelope.revoke` and a reason. It cannot replace BUY-003 authority, authorize another vendor, self-approve, or automate an emergency. Worker control uses existing `automation.control` and `automation.catchup` with `rule: "replenishment"` and its observed revision. Notices are stored in-app; external email/push alerts are not claimed.

## BUY-006 vendor delivery follow-up

GET `vendor-follow-up` (page `/app/vendor-follow-up`, linked from Purchase orders) returns the current `rule`, every order's latest submitted revision with `promisedOn`, `sentOn`, `deliveries`, buyer-recorded `acknowledgment`, per-line `ordered`/`delivered`/`returned`/`outstanding`, `status` (`awaiting`, `partial`, `complete`), `late`/`lateDays`, linked `work`, retained `reminders` and `escalations`, and `pending`: what the next run would do. Reading it writes nothing. The owner approves a new rule revision with POST `vendor.rule`: observed `rule` number (0 initially), `acknowledgmentDays` (0–30), `lateDays` (1–30) and `escalationDays` (1–60). Worker control uses `automation.control` and `automation.catchup` with `rule: "vendor"`. Reminders are single claimed emails to the vendor through installation mail, labelled with the provider outcome; escalations are in-app notices to the leads (the owners when there is none).

## AGENT-005 follow-up

The signed-in agent (or existing proposal preparer) reads `GET /api/gasket/agent-follow-up/WORK_ID` for due date, acknowledgment, findings, unresolved parts/access blockers, questions and human promises, linked corrective evidence/reviews and the current lead-approved `chase.rule`. `agent.query` takes `workOrder`, its `version`, `question` and optional `recipient` (the assignee/blocker owner, or a reviewer for submitted work); retrying the same version and recipient returns its existing question. The responsible person answers `agent.answer` with `query`, `nextAction` and `promisedOn` (a site-local date, today or later), also available on the work page. Answers are retained and not overwritten.

`agent.escalate` takes `workOrder`; a missed promise, unanswered query after the rule's response interval, or overdue work past its lead interval sends contextual in-app notices to the leads/owner, and supervisors after the rule's supervisor interval. Promise dates are missed after their site-local day ends; unanswered-query age uses elapsed 24-hour days. Repeated escalation of the same work/rule/evidence occasion retains one notice per recipient. `proposal.prepare` also accepts `kind: "reassign"` with `payload: {workOrder, assignee, note}` and source-cited `reasoning` when escalation is due. Its basis pins the work version, rule, questions, blockers and linked outcomes; a different lead/owner approves with `proposal.decide`, using the existing normal team/assignee rules. Changed evidence refuses stale approval. The agent never applies reassignment directly.

`agent.closure` takes `workOrder` and `reasoning`. It records a recommendation only when that work and every linked corrective descendant are already independently approved and closed, required technician evidence is complete and blockers are cleared. It changes no work or findings; reopening a linked repair prevents another recommendation. Agent questions/escalations are in-app records, and no model invocation or external delivery is claimed.


## PART-008 supplier catalog and duplicate control

`POST catalog.preview` accepts `supplier` and `file` (CSV upload or the ordinary filename/base64/type JSON file). Columns: `number,name,unit,manufacturer,manufacturerNumber,vendorNumber,packUnit,packQuantity,price`. `unit` is the stocking unit, `packQuantity` its quantity in one supplier pack, and `price` is USD per pack. Review the returned mappings, digest and fingerprint, then send the same source with that `fingerprint` to `catalog.import`. Exact replays return the original job. `catalog.undo` takes `job`; later use or changed dependencies refuse undo.

`POST catalog.receive` takes `item` (catalog entry ID), `quantity` in supplier packs and optional USD `freight`, `tax`, and `note`. It posts exact converted stocking units and the extended pack value, rounded half up to cents; it is a human-recorded receipt, not a supplier delivery assertion. `catalog.prefer` selects `item` as the canonical part's preferred supplier entry. The part detail includes every alternative pack and price.

`GET parts/lookup?number=...` resolves part, manufacturer and vendor aliases. Ambiguous manufacturer numbers return 409 with candidates until an approved merge. `POST part.merge.preview` takes `source` and `canonical`; `part.merge.approve` repeats those IDs plus `fingerprint` and `reason`. Stale dependencies, differing stocking units, unfinished counts and conflicting current BOM serial restrictions refuse approval. Original records and values stay intact, and all old numbers resolve to the approved canonical balance. `POST part.photo` takes `part` and a PNG/JPEG/WebP `photo`; signed-in members read the retained bytes at `/app/part-photos/ID`.

After a canonical merge, `part.count` requests with an observed `seen` also include the part detail's `revision`; an older revision or a missing revision on such a merged-item count is stale. The Parts form carries both automatically.

### Evidence-backed PM interval changes (AGENT-003)

`interval.limit` (existing register managers: lead/owner) records immutable declarations for a `schedule`, `source` (`oem`, `legal`, `site`), the last `revision` (0 initially), and a source `reference`. Calendar schedules need inclusive integer `minDays`/`maxDays`; counter schedules need positive exact `minUnits`/`maxUnits` in that meter's recorded units. Combined schedules need both. These are human declarations, not verified standards. All three sources are required before an interval proposal; the tightest bound applies. Existing manual `schedule.edit` also enforces recorded bounds.

`proposal.prepare` accepts `kind: "interval"`, `reasoning`, and `payload: {schedule, everyDays?, everyUnits?, from, to, peers, rollbackPlan, rollbackOf?}`. `peers` is a comma-separated list of 1–20 active asset ids in the subject's category. The inclusive site-local window must contain complete past days (up to 367). At least one existing cadence changes; an unmentioned cadence, the calendar policy, next promised occurrence and issued work stay as recorded. Days are whole days; counter quantities keep up to six decimal places. `proposals` returns the cited schedule revision, source records, normalized operating hours, failure rates, completed/late PMs, posted actual USD costs, clipped downtime, missing coverage, uncertainty and nominal frequency change. This is a deterministic recorded comparison, not a model invocation or a causal forecast. Extensions require positive observed hours, independently closed PM evidence (for the subject's schedule) and no recorded failure throughout the selected cohort; unknown cost/coverage remains disclosed.

A different lead/owner uses the existing `proposal.decide` with the payload `hash`. Approval recomputes the comparison and limits and atomically updates only the schedule's subsequent intervals; any source-history, limit or schedule change refuses a stale decision. The Proposals page displays the comparison, sources, uncertainty, hard limits and rollback plan before the ordinary human decision. To restore a prior interval, prepare another `interval` proposal with `rollbackOf` equal to the original approved proposal id and both original cadence values. Restoration requires that exact approved schedule revision still be current, the current limits, another independent human decision and a new rollback plan. It is explicitly labelled restoration, without claiming evidence supports extending the interval.

### Measured intervention outcomes (AGENT-004)

A lead/owner agrees a retained observation plan with `outcome.window`: `proposal` is a human-approved interval change, or `workOrder` names independently reviewed completed asset work (exactly one), `baselineFrom`/`baselineTo` precede its site-local approval day, `postFrom`/`postTo` start on or after it, and `peers` lists 1–20 comparable active assets in the subject's category. The approved source must still be current when the human agrees the plan. Completed work uses its retained independent review time; reopened work cannot start a new plan. Windows are inclusive site-local dates (up to 367 days each). A plan may name future observation dates; an assessment waits until the whole period has passed.

An agent or existing proposal preparer calls `outcome.assess` with that `window` id. It compares retained good normalized hour-counter observations, failure counts, clipped nondegraded downtime and posted actual USD costs across the agreed periods and pooled matched peers. An actual counter observation at midnight after the last day may close exposure coverage; events and cost postings exclude that endpoint. No interpolation, production-loss estimates or missing-cost zeros are invented. Missing/held readings, unknown exposure or costs, production reduction, commissioning age, duty and later maintenance changes remain explicit. Rate changes use the same observed span for numerator and denominator; fewer logged events from proportionally less operation never count as success. `observational_improvement` requires complete measured exposure/costs, no worsening subject rate and favorable change beyond pooled peers; it makes no causal or statistical-significance claim. Other states are `no_improvement`, `unproven` and measured `worsening`.

Each distinct source set retains one immutable report. `GET outcomes/ID` uses the same current authenticated internal read scope as work records and proposals. Worsening or unproven results create a deduplicated in-app notice for active leads (owners if none), linking the exact retained comparison. External email/push is still PM-005. `outcome.reversal` takes `outcome` and a `rollbackPlan`, recomputes the assessment and, only for a still-current worsening result, stages an ordinary version-bound interval-restoration proposal. `outcome.investigate` stages a corrective investigation proposal for unproven, worsening or unimproved results. These actions never change a standard or create work without the ordinary independent `proposal.decide` approval. Source changes refuse a stale follow-up; retained reports never silently update. No model/provider invocation is claimed.

## AGENT-006 source-bound duplicate merge proposals

`proposal.prepare` accepts `kind: "merge"` with `payload: {source, canonical, reason}` and source-cited `reasoning`, using the existing agent/lead/owner preparation grant. `proposals` retains both part balances, the combined quantity and USD value, zero quantity/value adjustment, stock movement citations and dependency counts. Its fingerprint binds the full ordinary merge preview without exposing restricted purchasing/replenishment records.

A different lead/owner decides with the existing `proposal.decide` and payload hash. Approval recomputes the dependency fingerprint and stock/value projection, refuses changed evidence and runs the ordinary canonical merge and proposal decision atomically. Unit mismatches, unfinished physical counts and incompatible BOM serial restrictions remain refused. Identity consolidation preserves original movements, source identities, values, reservations and return valuation. It creates no physical receipt, count or spend; bills and missing movements are not reconciled by this slice.

The focused public-door and populated-upgrade journey runs with `pnpm run test:agent-stock`. Verify runs it in a parallel `agent-stock` job, including the Proposals, Work and Audit browser proof at 1440 and 390; all existing Verify checks remain in the original job.

### Stock reconciliation evidence (AGENT-006, partial)

`GET parts/ID/insights` resolves the canonical part and returns read-only evidence to current members under the existing part-read admission. It returns stock/reservation quantities and USD value, possible duplicates citing both supplier-item IDs, actual count variance movements, and gross issues with work-order/movement IDs. Manufacturer **and** manufacturer number match case-insensitively after trimming; a match is a review candidate, and different stocking units are flagged rather than treated as interchangeable. Unknown manufacturers/numbers do not match.

Demand compares the current 30 site-local calendar days (today included) with the preceding 30. Returns do not erase gross issues. `increased` is true only above twice nonzero prior issues, false otherwise, and null with no prior issues. Replenishment returns the current policy revision, proposed quantity and material-only estimate in USD cents rounded half up, plus outstanding purchase revisions, quantities, quarantine and due dates. Unchanged outstanding purchases still offset proposed replenishment when late; this is a follow-up risk, not permission to order twice. Revised purchases require review and are excluded from incoming under PART-005. No policy means `replenishment: null`. Estimates exclude freight/tax, authorize no spend, and establish no delivery; estimates exceeding the safe whole-cent range are null. The endpoint creates no proposal, stock movement, audit, purchase or notice. Bills, executable bin/reorder proposals and proof of any missing physical movement remain unavailable.

New `proposal.prepare` count proposals retain `observed`, `counted`, `quantityDelta`, `valueCents`, `valueDeltaCents` and the source `movements` in `basis`. Independent approval applies the ordinary physical-count variance with PART-007 valuation; changed stock refuses approval. Pending older count proposals keep their original version-bound approval semantics. Preparation and risk assessment never create an inferred receipt.

### Damaged work returns (PART-003 slice)

`workorder.return` accepts `condition: "usable"` (the default) or `"damaged"`. Damaged returns require a nonempty `reason` (up to 300 characters). Existing work-recording authorization and held-quantity limits apply. The returned amount credits its original work issue value; a separate immutable quarantine adjustment removes the same quantity and value from usable stock. Part detail exposes `quarantines`, `quarantinedQuantity`, and `quarantinedValueCents`; work parts expose the quantity still held as `quarantined`. The valuation JSON and CSV include a `quarantined` adjustment: opening + received + issued + returned + counted + quarantined = closing.

POST `part.quarantine.dispose` with `returnId` from a part's quarantine history, a unique `identity` (up to 100 characters), `kind` (`release` or `write_off`), `quantity`, an inspection `reason` (up to 300 characters), and `confirmed: true`. The current conservative default is owner-only, pending policy approval. Release returns inspected goods to usable stock and reverses their quarantine adjustment. Write-off removes held goods without changing usable stock. Neither action changes the original work credit. Partial dispositions divide the remaining original cents proportionally, rounded half up; the final disposition takes the exact remainder. Concurrent disposition cannot exceed the quantity held. An identical identity and payload returns `replayed: true`; a changed payload is refused. Every successful action creates one immutable disposition and one `part.disposition` audit entry. Each quarantine record retains its original quantity and value, exposes `remaining` and `remaining_value_cents`, and lists its attributed `dispositions`. No automatic disposition occurs.

## Signed maintenance webhooks and connector recovery

The installation owner creates and operates subscriptions through the same signed-in
JSON door as other maintenance actions (send the installation's `Origin` header).
No provider account is needed. Subscriptions start paused. Work mutations and
purchase receipts atomically append immutable events in the same D1 transaction;
a rolled-back mutation or an idempotent receipt replay creates no second event.
The event history starts with the connector migration, not earlier records.

`POST /api/gasket/webhook.subscribe` takes `name`, an HTTPS `endpoint`, an `events`
array containing `work.changed` and/or `receipt.created`, optional `asset` (one
asset, otherwise this installation), optional `cursor` (0 through the current
high-water cursor; defaults to current), and optional hourly attempt `quota`
(1–1000; default 100). Endpoints must be DNS names, with no embedded credentials,
query string or fragment; IP literals, local hostnames and redirects are refused.
Use a public HTTPS receiver you control. The response returns `id`, `secret`,
`secretVersion`, `paused` and `cursor`. Copy the random 32-byte signing secret
securely into your receiver now: it is returned once and never included in reads,
audit or job evidence. Gasket stores it encrypted with a purpose-separated key
derived from the installation's `SESSION_SECRET`. Preserve that installation
secret across restarts; a restore with a different secret needs owner key rotation
and an explicit retry of any `signing_key_unavailable` dead letter.

`GET /api/gasket/connectors` exposes scopes, revisions, cursor/high-water,
last receiver acceptance, quota/remaining attempts, last error, immutable events,
deliveries, attempts and a read-only next-scan preview. Event pagination uses
`?after=<cursor>` and returns at most 100 events and `next`; deliveries and
attempts remain retained. The owner sees the summary and actionable dead letters
on **Automation → Maintenance webhooks**. Other roles cannot inspect or operate
subscriptions. An acceptance is an HTTP 2xx response, not remote business
acknowledgment. Receiver bodies and signing headers are never retained.

Owner actions:

- `webhook.control`: `subscription`, current `revision`, `paused` and `reason`.
  Pausing retains every pending event/delivery. Resume by setting `paused:false`.
- `webhook.rotate`: `subscription`, current `revision` and `reason`. Returns the
  replacement secret once and increments the signing-key version immediately.
  Install it in the receiver before resuming a paused subscription. Already sent
  attempts retain their key version; later attempts use the new key.
- `webhook.resume`: `subscription`, current `revision`, a `cursor` at or behind
  its current cursor, and `reason`. Reconciles the retained source log; stable
  event/delivery IDs and unique jobs prevent delivered events being sent again.
- `webhook.retry`: `delivery` and `reason`, only for a dead letter. Repair the
  receiver or rotate its key first. Starts a new bounded retry cycle with the
  original event/delivery identity and preserves every earlier attempt.

PM-008's **Maintenance webhooks** job runs on the quarter-hour Cron Trigger.
`automation.control` pauses/resumes the entire job under its current grant
revision; `automation.catchup` executes it now. Its retained input names the
source high-water, subscription revisions/cursors and limits, and each attempt
names the exact automation job, grant, subscription and signing-key revisions.
Previewing connector state sends nothing and changes no business data or jobs.
The source cursor advances transactionally with durable delivery creation and
never depends on a later network success.

Each execution scans up to 100 events per subscription and claims at most 20
network attempts across subscriptions. Claims atomically consume each
subscription's hourly quota; exhausted quotas preserve queued jobs. The hour
starts with its first attempt; the first claim at least an hour later resets it.
Signing timestamps, retry eligibility, leases and quota windows use the live wall
clock, even when a delayed Cron retains an older business source time. Every
request has a 5-second abort and a 30-second claim lease. An interrupted
lease is recovered on a later run, visibly retained as `lease_expired`. At most
three attempts per retry cycle occur. Network failures, timeouts, HTTP 408/429
and 5xx responses retry with exponential minimum delays of 1 then 2 seconds;
`Retry-After` seconds or HTTP dates extend the delay, bounded to 24 hours.
Other 3xx/4xx responses become dead letters immediately; redirects are never
followed. Cron cadence may delay an eligible retry until the next job. Repeated
failure becomes a retained dead letter with its source, HTTP status and error.
Quota and outcome measures are defined in `connectors.quota` in the existing
versioned measure registry; no provider acceptance or historical completeness is
invented.

### Receiver byte protocol

Every POST contains JSON `{id,cursor,type,sourceId,sourceVersion,assetId,
occurredAt,data}`. `work.changed` carries the retained work number/status and
source version; `receipt.created` carries the PO id, immutable PO revision id and
supplier receipt identity. Event ids are globally random and retained; source
ids always name actual Gasket records. `gasket-id` is the stable delivery id,
`gasket-key-version` the signing version, and `gasket-timestamp` integer Unix
seconds. `gasket-signature` is `v1=` plus lowercase hex HMAC-SHA256 over these
UTF-8 bytes, with the **exact unparsed body**:

```
<gasket-timestamp>.<gasket-id>.<body>
```

The reference receiver is `scripts/webhooks/receiver.mjs` (`receiveWebhook`).
It refuses a timestamp more than 300 seconds old or in the future, unknown key
versions, malformed signatures and changed bytes before calling the receiver's
`acceptOnce(eventId,event)` transaction. Use the receiver's independent clock,
not the supplied timestamp, for verification.

Delivery is **at least once**: a receiver may commit just before its response is
lost. In one durable transaction, insert a unique event id and apply its work,
stock, bill or notification effects; an existing event id returns the original
receipt without applying effects again. Persist deduplication across restarts
and key rotation. Never use only a process-local Set in a real receiver. A
freshly signed retry retains the same event identity, while expired captured
requests must be refused. Return 2xx only after the transaction commits.
INT-003 through INT-017 inherit these event identities, durable cursors,
reconciliation, delivery-outcome and PM-008 controls when their adapters ship;
this framework does not assert those provider integrations already exist.

## Operator request intake

An owner creates a portal with `POST /api/gasket/request.portal`: `name`, optional `mode` (`authenticated` by default, or `public` with `publicConsent: true`), and `fields` (up to 20 definitions with unique `key`, `label`, `type`, `required`, and `options` for a choice). Types are text, choice, number, date and photo. Updates give `portal` and `revision`; omitted fields retain their definitions. `request.field` adds a field from the configuration page. `disabled: true` closes intake. Each portal belongs to the current installation site; ADMIN-002 inherits future site separation.

`request.target` is owner-only: `portal`, `kind` (asset/location/bin), `asset` for an asset, deliberately public `name`, and `publishConsent: true`. Only the supplied display name and opaque code reach public forms. No anonymous target listing exists. Open `/request/PORTAL?target=CODE`; signed-in human members can also select the portal's targets. The public route never returns private assets/history/costs. Agent sessions and inactive members are refused. ADMIN-004 must enforce own-request access for future external identities.

Submit a same-origin JSON or multipart POST to `/request/PORTAL` with `target`, random UUID `submissionKey`, `description`, `urgency` (normal/high/emergency), `contact`, optional `photo`, and `field_KEY` for each site field. Photo fields and the optional main photo accept PNG or JPEG content, at most 1.5 MB each, five total. Content is validated independently of the filename or declared media type; EXIF, GPS and other descriptive metadata are stripped before storage and hashing. JSON uses `{filename, base64, type}`. A streamed body is bounded at 8 MB before parsing. The website honeypot must be empty. Missing required/invalid answers are refused. Successful native posts redirect to a durable number-only receipt. `Accept: application/json` returns `{id, number, receipt}`. The same key/fingerprint returns the existing receipt even after a lost response or a later required-field/portal/retirement change, using its retained original form definition; changed content with the same key returns 409. Five new submissions per portal/network/hour and 100 per installation/hour are admitted atomically. Network identifiers are secret-salted, hourly hashes, never raw IP audit data. Limit refusals return 429 and an intake_rate_limited error; the audit records only that code and the portal, with no personal or network data. No background sending occurs.

`GET /api/gasket/requests` is owner/lead-only (filters `status`, `urgency`, `criticality`, `target`); `/api/gasket/requests/ID` and `/app/request-files/ID` admit the creator or a lead/owner. Contacts are unverified. `/app/request-portals` configures intake; `/app/requests` lists its triage queue. Display-language catalog, person/browser/site preference and fallback work is explicitly inherited by ADMIN-013 for both portal and QR form. Ct approved the defaults with riders on 23 October 2026 at 08:42Z, explicitly retaining PARTIAL pending a DONE ruling.

The phone form has a camera-capture hint and optional, explicit private-device draft storage. IndexedDB retains the original photo File objects, target and submission UUID; reload/reconnect reuses them, including after an accepted response is lost. No background transmission occurs. Successful confirmation clears draft contacts and photos and retains only a confirmation link. Sign-out clears every draft scope, revokes storage opt-in in open forms and fences stale saves and restores. Clear draft removes the saved draft and creates a fresh submission key. ADMIN-013 inherits display language and fallback on this existing form.

`/app/labels?target=CODE` prints a stable published target; omit the query to print all configured targets. QR encodes the installation-origin `/scan/CODE` URL; Code128 encodes that same opaque target code. `/scan` accepts a scanner's code. Signed-out scans open the scoped fault form without granting asset/work/history access. Signed-in scans offer the authorized asset and, only with the current create-work right, a corrective-work form. `label.work` always binds work to the scanned target, ignoring caller asset/location overrides; the ordinary work/create/template/review rules remain in force. Retired labels reprint the same identity but scan as retired (410); unknown codes return an explicit 404.

## Request triage and corrective conversion

Owner/lead `request.triage` takes `request`, the seen `version`, a required `reason`, `decision` (assess, ask_details, approve, decline, duplicate) and optional `impact` (unknown/running/reduced/stopped). Duplicate decisions name a canonical request with the same asset/location; self links, chains, terminal sources and moving a group root are refused. Both timelines retain the linkage and all originals. A creator answers a needs-details request with `request.reply` (`request`, `version`, `text`); other people cannot impersonate that creator. Questions are retained in-app; requester communications/delivery remain REQ-004, with no outbound claim.

After approval, `request.convert` (`request`, `version`, optional `due`, default current site day) creates one unassigned corrective work without retyping the original description, target or urgency. Linking every source report and recording source timeline/audit events happen in the same transaction as work creation. Retrying returns the existing work. The work's `requestSources` retains original reporters, answers, file links and digests for its planners/reviewers/current assignee/collaborators. File downloads enforce the same necessary-work scope, while contacts stay private to the original creator and lead/owner. Every report remains distinct; no source photo or history is rewritten. Queue filters include impact, criticality, urgency, status and target at the current site. ADMIN-002 inherits future site separation.

## Work-order PDF downloads

Current human members download open or completed work at
`GET /app/work/ID/report.pdf`; the work-detail page provides the same link.
The report uses the pinned procedure revision, current results and readings,
parts issued and returned, comments, named signatures with version and stale
state, review decisions, and numbered audit entries. Original evidence and
comment photos are attached with SHA-256 digests; PNG and JPEG also render
inline. An invalid image or unsupported character returns an explicit refusal.
No report download changes the work record.

Owners, leads and supervisors see structured costs. Other permitted viewers
receive no structured costs or audit payloads, which can contain financial
notes. Existing membership and session revocation apply at every download.
Agent export remains refused pending approval; REPORT-010 stays partial.
ADMIN-003 inherits granular rate permissions, ADMIN-002 inherits cross-site
checks, ADMIN-004 inherits external identity admission, FIELD-006 inherits
timers, corrected-time review and authorized labor rates, and ADMIN-013 inherits viewer-language report labels.
Current report labels are US English; supported authored text stays as entered.

Owners and leads use the work-detail disclosure to download several reports.
`GET /app/work-reports.zip?numbers=1,2,3` takes comma-separated work numbers.
Repeated `work=ID` query parameters are also supported. One to twenty distinct
orders produce one numbered PDF each. Missing orders, invalid selections and
bundles exceeding 30 MB fail explicitly before a ZIP response is returned.
The ZIP is created on demand and is never published or retained by the server.

`POST /api/gasket/workorder.time` records original manual time on open work for
the assignee or a current collaborator: `workOrder`, required current `version`,
site-local `workedOn` date, integer `minutes` from 1 to 1440, and `note`. Future
dates are refused. The form on the work page uses the same action. Acceptance
bumps the work revision, makes prior signatures stale, and retains the named
contributor for independent review. A retry with the old version writes nothing.
These minutes are original entries and are not approved hours or automatic
labor charges; timers, corrections, overlap review and rates remain FIELD-006.

Owner-only `request.erase` takes `request`, the seen `version` and explicit `confirm: true`. It removes request contact, photo bytes, answers and timeline details, redacts private audit payloads while preserving attribution and the erasure event, and removes fault title and description copied into corrective work. The request number remains; a retry of an erased submission returns 410. No automatic erasure runs.

## Estate search and saved filters

`GET /api/gasket/search` accepts `kind` (asset, work, request, procedure, part or vendor), literal substring `q`, exact `tag`, `serial`, `site`, `owner`, `status`, inclusive `from` and `to`, and a work custom `field` with its exact `value`. Site is the current site's name. Owner is an asset custodian name or a work assignee, request requester or procedure creator member id. Dates use the site clock: work due dates, other records' creation dates (vendors use their last update). Unsupported record fields do not match. Merged parts resolve through their canonical records.

Each response has `rows`, `total` and `next`. Pass `next` as `cursor`, retaining the filters and signed-in person. `limit` is 1 to 200, default 100. To export the complete result, collect every page until `next` is null; never stop at the first page. These are current reads, so pause estate changes when a consistent export is needed. Requests remain restricted to triagers; technicians receive only assigned or collaborating work. No contacts, prices, attachment bytes or credentials are returned.

`POST /api/gasket/search.save` takes `name`, `filters` (an object of the filter strings), optional `shared`, and optional `id` with `revision` to update. Views default to private; only the owner shares them. `GET /api/gasket/search-views` lists accessible views. `GET /api/gasket/search?view=ID` applies a saved view, with optional paging controls. Saved filters cannot be overridden on that request, and never confer permission to read records. `POST /api/gasket/search.delete` takes `id` and `revision`; only its creator or the owner can change or delete a view.

## Holds and inactive recovery

`POST /api/gasket/retention.hold` is owner-only and takes `kind` (request or work), `id`, current `revision` (0 initially), `held` and a `reason`. `GET /api/gasket/retention-preview?request=ID` reports request-file counts and bytes, holds and retained obligations. An active request hold or linked work hold atomically refuses the existing confirmed `request.erase` action. The conservative default is indefinite retention with no automatic erasure. Request erasure commits a restore checkpoint and invalidates pending export snapshots atomically. Supply a post-erasure archive with `rer import --journal LATER_ARCHIVE`: an older archive is refused whole, while the later archive retains anonymous request attribution.

The supported `rer export` archive excludes sessions, sign-in tokens and connector signing keys, including their encrypted form. Export leaves the source active. `rer import` validates before publication, requires an empty destination and restores PM schedules, automation rules and connectors inactive. Review the existing Automation page, rotate connector keys, then deliberately resume rules and schedules. Accepted work and execution history remain. This is single-site proof; multi-site recovery and complete erasure-journal enforcement are unfinished.


### Request reporting

Leads and owners open `/app/request-report` from Requests. The JSON source door is `/api/gasket/request-report`; `/app/request-report.csv` downloads the same selection. Each read rechecks current triage permission. Optional `from` and `to` are inclusive site-local submission dates; `site` selects the current site name, `asset` an exact asset id, `group` is `signed-in`, `public` or `erased`, and `status` selects the retained lifecycle state. Defaults cover the last 30 site-local days. Unknown scope values return an empty selection; invalid dates or intake groups are refused.

The response includes source rows and links, reasons, first-decision and closed-corrective-work timestamps, total elapsed milliseconds, measured and all-request denominators, group summaries, source revision, latest change and an input fingerprint. Duplicate reports count separately; shared work is not a unique conversion count. No private contact, attachment or inferred requester identity is exported. Explicit `abandon` at `request.triage` needs the version seen and a reason, keeps the report and its timeline, and supplies the `abandoned` state. Unanswered questions never imply abandonment. Erasure keeps volume while disclosing unavailable identity and timeline evidence. Measure definitions are versioned under `requests.*` at `/api/gasket/metrics`.


### Request response policies and PM strategy rollout

`GET /api/gasket/request-response` and `/app/request-response` require current triage permission. `POST /api/gasket/request.responsePolicy` accepts `urgency`, positive `acknowledgmentMinutes` and `resolutionMinutes`, named active lead or owner ids in `owner` and `escalation`, `afterHours` (`business` or `elapsed`), a `weekdays` list of ISO day strings, and `opens` and `closes` as minutes after midnight. Approval appends a policy revision and snapshots current site holidays; new requests retain that revision. Existing requests without a policy remain visible without an invented target. Request detail exposes internal clocks only to triagers. `POST /api/gasket/request.clock` requires `request`, clock `revision`, `kind` (`pause` or `resume`) and a nonempty `reason`. It retains attributed transitions and excludes the paused interval from both clocks. The owner-controlled `chase` automation grant also governs request escalations. Notices are stored in Gasket and appear in the named recipient's request queue, with the full clock and ownership on request detail. No external message is sent.

`GET /api/gasket/pm-strategies` lists the versioned starting library, latest strategy revisions and retained rollout records for internal board readers. `POST /api/gasket/pm.copy` requires register permission and `template`, `name`, `category`; it creates a draft retaining the library id and version. `pm.adapt` appends a revision using `strategy`, current `number`, typed `items`, `everyDays`, a safety and manufacturer `reference` and change `note`. `pm.approve` requires an independent owner or supervisor, exact `revision` and a reason; an unadapted library copy cannot be approved.

`pm.preview` takes a `strategy` and `schedules` list and writes nothing. Current-site, category-matched calendar schedules are supported. The returned hash covers source versions, existing procedures, issued work, declared interval limits, program changes and local conflicts. `pm.rollout` requires an independent owner or supervisor, that exact hash, the same selection and explicit `occurrencePlan: "preserve_issued_and_due"`. Each conflicting schedule needs a `decisions` entry keyed by its id with `choice` (`keep_local` or `use_program`) and a nonempty `reason`. Nonconflicting local overrides survive automatically. Changes to sources require another preview. The transaction preserves issued work and due dates and creates future procedure revisions; it cannot cancel issued work or perform catch-up. The Schedules page provides copy, adaptation, approval, diff and conflict-decision forms using the same actions. Additional sites, non-calendar rollouts, cancellation and catch-up remain gaps in PM-007. Both clauses retain the conservative authorization defaults in their contract Gap pending ct approval.


### Recovery receipts and optional evidence erasure

Successful local `rer export` and `rer import` commands record archive digests,
the source recovery point and completed-operation time. The owner reads these
through `GET /api/gasket/recovery` and the existing Automation page. A failed
command never advances the last completed receipt. A restored installation
requires deliberate resumption of schedules and connector-key rotation.
`POST /api/gasket/recovery.drill` takes `receipt` and explicit `confirm`; it
reconciles product record counts to the restore manifest and records the owner's
attestation that original attachment digests were checked. Import alone never
claims a successful drill.

Request retention previews now enumerate removed attachment, event, clock and
escalation counts. Confirmed request erasure returns and persists its per-type
result; retries return that same result. The result remains in later archives.

`GET /api/gasket/retention-preview?kind=attachment&id=ID` previews optional work
evidence. `POST /api/gasket/attachment.erase` takes `evidence`, the preview's
work `version` and explicit `confirm`. Only the owner may use either door.
The conservative default preserves work holds, any submitted or signed work,
required evidence and calibration certificates. Eligible originals and their
annotations are removed atomically, attachment audit payloads are anonymized,
the maintenance record remains, and older archives are fenced by the same
later-journal requirement as request erasure. Per-type results survive retries
and restore. Prior downloads remain outside local erasure. There is no automatic
erasure; user retention and broader maintenance-record erasure remain unfinished.


`GET /api/gasket/retention-settings` reads owner-only per-type minimum ages.
`POST /api/gasket/retention.policy` takes `kind` (attachments, request_contacts,
users or maintenance_records), `minimumDays`, current `revision` and `reason`.
Every type retains indefinitely by default; a minimum age only delays eligibility
for explicit erasure. It never starts an automatic deletion job. Request-contact
and attachment minima are enforced atomically by their existing erasure doors.
User and maintenance-record settings are retained for their future erasure doors;
those classes are not currently eligible for deletion. `retention.hold` also
accepts attachment and user kinds. Attachment holds protect their original files;
user holds protect their linked request intake and uploaded work originals.

## Register custom fields

Owners and maintenance leads define fields at `/app/settings/fields` or with
`POST /api/gasket/customfield.save`. Supply `name`, `entityType` (`asset`,
`location` or `part`), `type` (`text`, `number`, `single`, `multiple`, `date`,
`boolean` or `link`), and `scope` (`organization`, `site` or `category`). Category
scope names one asset or part `category`. Number fields require `unit` and accept
`minimum` and `maximum`. Choice `options` are comma-separated or one per line.
`required: true` refuses missing values when creating or editing an applicable
record. Existing records remain readable while a newly required field is filled.

Asset and part creation accept `customValues`, an object keyed by field id. The
`customvalue.set` action accepts `entityType`, `entityId` and `customValues`.
Values are JSON scalars or arrays; number strings and comma-separated multiple
choices are also accepted. The existing register-management permission controls
writes. Ordinary authorized record reads include `customFields` with values,
value revisions and actor-stamped history. Signed-out intake never receives them.
Location fields are at `/api/gasket/locations/{id}/fields`; their id is the
published location target, also used by `/app/locations/{id}` and its scan label.

A field rename supplies its `id`, current `revision` and unchanged definition to
`customfield.save`. Definition types and applicability are immutable; define a
new field to change their meaning. `customfield.retire` takes `id` and `revision`
and archives values. `part.category` takes `part`, its `revision`, `category`
and any newly required `customValues`. Previously scoped values remain archived.

`GET /api/gasket/search?kind=asset&field={id}&value=R-32` filters scalar values
or exact array members; `kind=part` uses the same door. Saved views retain these
filters and recheck record access. The asset register also accepts `field` and
`value`. `/app/assets.csv`, `/app/parts.csv` and `/app/locations.csv` include
custom values, units and archived definitions; CSV downloads require the
existing history-export permission and neutralize spreadsheet formulas.

The current organization and current site share this installation's boundary.
Multiple sites, native apps and custom dashboards inherit field coverage under
ADMIN-002, FIELD-001 and REPORT-007. Full migration doors inherit it under
MIG-001, MIG-002 and MIG-007; the existing MaintainX asset mapper supports it now.

## Site automation rules

Owners and maintenance leads use `/app/settings/rules`; JSON clients use
`GET /api/gasket/rules` and the `rules.save`, `rules.preview` and `rules.control`
actions. A rule has a `name`, `trigger`, numeric `priority`, `conditions` and
`actions`, plus a recorded `reason`. Editing supplies `rule` and its current
`revision`. Each published revision starts paused. Enabling or pausing takes
`rule`, `revision`, `paused` and `reason` and creates another immutable revision.
The author retains responsibility; an owner editing a lead's rule does not
silently replace that author's authority.

Triggers are `request.submitted`, `work.created`, `work.status_changed`,
`asset.status_changed`, `meter.recorded`, `part.below_minimum`,
`checklist.failed` and `work.overdue`. They use committed source mutations;
stock mutations below minimum each produce an event, and the scheduler evaluates
retained overdue work once per local due date and day. A failed checklist result
keeps its existing correction obligations. Imports never rerun old maintenance.

Conditions are objects with `field`, `op` and `value`. Fields are `asset`,
`location`, `category`, `priority`, `team`, `status`, `time` or `custom:{id}`.
Operators are `eq`, `ne`, `contains`, `gte`, `lte`; time uses `between` with
`value` and `until` as site-local 24-hour times, inclusive start and exclusive
end. Crossing midnight is supported. All conditions must match. Archived custom
fields do not match new events. Source snapshots retain routing and condition
facts, excluding request contacts, answers, files and free-text descriptions.

Actions are `assign` (`team`, `person`), `priority` (`value`), `status` (`value`),
`due` (`days`), `procedure` (`value` is a checklist id), `notify` (`people` or
`team`, and `text`), `follow_up` (`title`, `days`) and `request_approval`.
Work status is limited to open or in progress; request status to new or needs
details. Attaching a procedure refuses existing results or an existing procedure.
Requesting approval submits complete work already held by the author and never
approves it. Every effect rechecks the author's current active rights and grant.
Assignments and notices refuse newly exposing a record. No action approves work,
approves spend, closes findings, deletes data or sends to an external channel.

Rules run by ascending priority and then id; the first action for a conflicting
field wins, with later conflicts visible. Repeated rule visits to the same
record and bounded chain depth stop with a visible error. Every committed action
records its rule revision, event, input and output in audit and execution history.
A failed action stops later actions and preserves earlier committed effects.
Catch-up refuses an event with completed effects to avoid repeating them.

`rules.preview` takes `rule`, optional `revision`, and optional epoch-millisecond
`from` and `to` bounds (default: the last seven days, at most 200 recent records).
It reads retained source snapshots or explicitly labelled current fields of
older recent requests, checks proposed effects and conflicts, and writes no
work, notices, purchases, audit or execution rows. Paused-rule previews are
allowed. `rules.control` with `catchUp: true` and a retained `event` retries an
untouched paused or failed source under the revision supplied; repeated catch-up
keeps the source identity. Health shows pauses, events, executions and errors.
External delivery remains unavailable. The conservative author, access and
in-app-only policy awaits ct approval under PLAN-009.

## Model runs (AGENT-009)

Only an owner uses these, and only when the installation has `AI_ENABLED` true with an `AI_API_KEY` (and optionally `AI_BASE_URL`, default OpenAI's `/v1`) set as its own settings; the key is never returned by any door. `agentrun.grant` takes `agent` (an active agent-role person), `provider` (the host shown by `agent-runs`), `model`, `assets` (one to three asset ids), `actions` (`corrective`), `budget` (USD), `inputPrice` and `outputPrice` (USD per million tokens), `maxProposals` (1 to 5), `maxOutputTokens` (100 to 4000) and optionally `costs: true` with `termsAck` (at least twenty characters naming the terms that bind the provider). `GET agent-grants/ID/preview` returns the exact request, and `agentrun.start` takes the grant and that `previewHash`; it refuses a changed preview, a revoked grant, a provider other than the granted host and a run whose reserve would pass the budget, then makes one provider call and returns the run. `agentrun.revoke` takes `grant` and `reason`, ends the grant for good, marks its running runs revoked, rejects the proposals those runs left pending and discards any answer that arrives later, still recording its cost. A run only prepares pending corrective proposals as the grant's agent; a lead or the owner approves them with `proposal.decide`.


### Work calendar and resources

`GET /api/gasket/planning?from=2026-10-20&view=week` reads current open work,
bookings, conflicts, explicit availability and utilization by person, team and
site. `view=day` selects one day; the default is seven days. The existing
work assignment right gates this read and both `/app/planning` and
`/app/settings/resources`. The calendar preserves original due dates,
PM cadence and work estimates. Assignee changes release the old slot and tool
bookings as part of the existing handoff; rescheduling does not reassign work.
Qualification dates and provenance support planning; owner-held reference text
and retired evidence are omitted from non-owner planning responses. Recorded
expiry and calculated expiry state are separate from issuing-body verification.

Planning mutations use the ordinary authenticated action and form doors:

- `planning.qualification`: owner-only `member`, `name`, inclusive `expires`
  date and `reference`. A renewal retains the former value in the audit.
  Explicit `remind: true` with `remindDays` from 0 to 365 opts into owner-only
  in-app notices before expiry and after the inclusive expiry date. The existing
  expiry automation grant controls these notices. Each evidence revision gets
  at most one due and one expired notice per owner; renewal starts a new occasion.
  Retired or replaced evidence no longer contributes active notices. No external
  delivery or automatic qualification renewal is performed.
- `planning.tool`: owner-only `name`, `identifier`, inclusive `calibrationDue`,
  optional existing `id`, and current planning `revision`. Names are immutable.
- `planning.retire`: owner-only `kind` (`qualification` or `tool`), `reason`
  and current `revision`; a qualification names `member` and `name`, while a
  tool names its `id`. Retirement stores an immutable attributed snapshot,
  removes eligibility and releases tool bookings. Retired evidence is returned
  only to the owner in the planning view. Retirement is not erasure. A new
  record with the same name is separate evidence; it never revives a retired
  sign-off or the old tool id. Corrections retain prior values in the audit.
- `planning.window`: work assignment right; `member`, `kind` (`available` or
  `absent`), site-local `starts` and `ends`, `reason` and `revision`. Windows
  cover one day and may not overlap another window of the same kind for that
  person. `planning.window.remove` requires its `id`, a `reason` and `revision`.
- `planning.requirements`: `workOrder`, comma-separated `qualifications`
  (empty clears the requirements), and `revision`.
- `planning.slot`: `workOrder`, `starts`, `ends`, repeated `tool` register ids
  and `revision`. `preview=true` returns conflicts without writing; confirmation
  repeats the checks and atomically claims the resources. `remove=true` releases
  the slot. Assign the work first through the existing work-order door.

No override is available for an expired qualification, an unavailable person,
a missing reserved BOM part or an overlapping person or tool booking. The
credential reference is entered by the owner, not verified by Gasket. Productive
minutes are approved wrench entries clipped to the selected period; travel,
wait, administrative, pending and legacy unclassified entries are excluded.
Capacity uses explicit site-clock availability minus absence intersections;
without recorded availability there is no utilization denominator. Team
capacity shares its members with other teams, so team capacities are not additive.

### Controlled receipt stock

`receipt.receive` lines accept optional `expiresOn` as a site-local date in `YYYY-MM-DD` format. Issue is permitted through that date and refused afterward. `GET /api/gasket/parts/ID` includes `stockSources`, each with its receipt line `id`, `bin`, `lot`, `serial`, `expires_on`, `onHand`, `expired` and `reconciliationRequired`. These are receipt-source quantities, not complete bin balances: reservation allocation, bin valuation, on-order allocation and bin counts remain under PART-001. `stores` includes current `expiringLots` within 90 site-local days, including expired sources, independently of its movement-date filter.

`workorder.issue` takes `receiptLine` and a unique `identity` for controlled stock, beside `workOrder`, `part` and `quantity`. A source must belong to that part, remain unexpired and have sufficient quantity; a serial requires exactly one unit. The request still rechecks stock reserved for other work. Reusing the identity is refused with 409, including when another source is supplied. Without a source, only unattributed shelf stock can be issued. Existing JSON clients issuing unattributed shelf stock retain their current input shape.

`workorder.return` requires `sourceIssue` for controlled holdings. It must name an issue for this part and work order; total returns cannot exceed that issue. Usable returns replenish the original source; damaged returns remain quarantined at their original work value. Owner-confirmed inspection release restores the original source, including serial identity. Serialized returns and dispositions cannot split the unit. Controlled movement detail retains `controlled_source`, `source_issue`, `bin`, `lot` and `serial`.

Historical unallocated issues and new nonzero count variances leave explicit source holds. Further issues of that part return `source_reconciliation_required`; complete bin reconciliation remains unfinished under PART-001. The current bin lookup is `/app/parts?bin=BIN_NAME`, behind ordinary member authentication. A published bin label links members to the matching name without adding any stock to signed-out intake. Additional sites remain under ADMIN-002 and transit remains under PART-006.

## Version 1 and paged estates

The versioned base is `/api/gasket/v1/`. Existing documented reads and actions are available below it with the same member session, origin requirement, record access and business rules. Unsupported numeric versions return `404 {"error":"unsupported_api_version"}`. The unversioned base remains compatible.

Version 1 collection reads `assets`, `work` and `parts` return `{filters,total,rows,next}`. Rows carry identity, title, status, dates, site and an authorized `sourceDoor` for the complete record. Part rows also carry current on-hand, reserved and available quantities. Full detail is fetched separately, keeping collection requests bounded in database calls. Use `limit` (1 through 200; default 100) and send the opaque `next` value as `cursor` until it is null. There is no legacy 500-work cap on this door. Results use stable identity order and re-evaluate permission on every page. They are live reads, not a frozen snapshot: concurrent changes can change totals. A cursor is bound to the member, role, time zone, collection and filters; changing those returns `400 {"error":"invalid_cursor"}`. Page size may change. Use the documented search filters (`q`, `tag`, `serial`, `site`, `owner`, `from`, `to`, `status`, `field`, `value`); work dates filter the due date, other records use the site-local creation date. The Work collection includes both open and historical records unless filtered by status. A different site returns no rows; this installation still represents one site.

For example, send `GET /api/gasket/v1/assets?limit=50`, then `GET /api/gasket/v1/assets?limit=50&cursor=ENCODED_NEXT`. Detail and history are at `/api/gasket/v1/assets/ID` and `/api/gasket/v1/assets/ID/history`. Stock balances and retained movements are at `/api/gasket/v1/parts/ID`. Use a member session or an explicitly scoped owner service credential. A session never grants an approval right that member lacks.

## Write retry receipts

For the following thirty-six actions, optionally send `Idempotency-Key` with JSON on either API base. Keys are 1 through 128 ASCII letters, digits, dots, underscores, colons or hyphens. Send the **same JSON bytes** on every retry. The key belongs to the authenticated member across actions and both bases, not to a browser session. Reusing it for another action or different bytes returns `409 {"error":"idempotency_key_conflict"}`. An unsupported action with a key returns `400 {"error":"idempotency_not_supported"}` before invoking it; it never silently performs an unprotected write. JSON bodies and stored successful results are limited to 64,000 bytes for keyed requests; larger bodies return 413. Multipart requests with a key return 415.

The receipt allowlist is `asset.create`, `asset.update`, `part.create`, `part.receive`, `part.count`, `workorder.create`, `checklist.create`, `checklist.revise`, `template.save`, `workorder.assign`, `workorder.results`, `workorder.issue`, `workorder.return`, `workorder.submit`, `workorder.review`, `meter.create`, `schedule.create`, `workorder.evidence`, `workorder.annotate`, `workorder.time`, `workorder.readings`, `workorder.tool`, `workorder.sign`, `finding.record`, `downtime.start`, `downtime.end`, `workorder.cancel`, `workorder.reopen`, `customfield.save`, `customfield.retire`, `customvalue.set`, `part.category`, `document.add`, `document.revise`, `document.expiry` and `document.link`.

A successful retry returns the original JSON result and `Idempotency-Replayed: true`; the first response says `false`. It does not create another audit event, stock receipt, work order or asset revision. Current active membership, role and relevant create-work policy are checked again before replay. A role change refuses replay, even when the new role could make a new write. Replayed work creation also rechecks current access to that work record. Execution receipts recheck the current assignee or permitted collaborator; submission still requires the assignee. Review receipts require current review authority and independence from the work. A completed receipt remains replayable after its own transition to submitted, closed or returned; new keys still run every ordinary state, version, evidence and stock guard.

A durable claim is stored before execution. An overlapping request, or a claim interrupted before the result was saved, returns `409 {"error":"idempotency_pending"}`. A completed failure returns `409 {"error":"idempotency_failed"}` on later retries. Neither state automatically runs again. Inspect the record and audit history and reconcile the uncertain outcome before choosing a new key; a failed response may follow an already committed effect. Receipts survive Worker restarts and remain retained indefinitely. They store key and body hashes, action, actor, role, time, state and bounded successful results; they do not store input bodies or raw keys. Existing administration retention and erasure obligations continue to apply.

Example: POST `/api/gasket/v1/asset.create` with the JSON content type, the installation's `Origin`, a member session cookie and `Idempotency-Key: synthetic-gasket-1`. Body: `{"tag":"00042","name":"Pump","location":"Workshop"}`. If the response is lost, repeat those exact bytes with the same key. Read the returned id using the asset detail door and inspect its history or the register page. Errors use the existing `{error,detail?}` contract: 400 invalid input, 401 absent session, 403 forbidden access, 404 absent record or route, 409 conflict, 413 oversized keyed body and 415 unsupported keyed media type.

INT-001 remains partial: complete target-entity coverage, comprehensive OpenAPI schemas and write keys beyond the thirty-six listed actions are still owed. CT approved the existing service-credential policy with riders on 26 October 2026; the synchronized dated passage in CONTRACT.md and ACCEPTANCE.md preserves the remaining lifecycle and inherited obligations. Future service identities must inherit the same current record permissions and approval refusals.

## Scoped owner service credentials

An owner using an ordinary member session can POST `service.create` with `name`, a nonempty `scopes` array, `expiresAt` (epoch milliseconds, at least one minute and at most 90 days ahead) and explicit `consent: true`. The result contains `id` and a one-time `token`. Save the token privately. Send it only to this installation in `Authorization: Bearer TOKEN`; POST still requires the exact installation `Origin`. Never put it in a URL. An Authorization header selects service authentication and never falls back to a cookie on failure.

Supported read scopes are `assets:read`, `work:read` and `parts:read` for those collection, detail and asset-history doors. Supported write scopes remain exactly `asset.create`, `asset.update`, `part.create`, `part.receive`, `part.count` and `workorder.create`. The other thirty keyed actions require ordinary member sessions and never add service authority. Each credential belongs to its issuing owner; no other member identity can be nominated. Owner membership and operator authority must remain active. It can never administer the site, issue or revoke credentials, approve work or spend, or open workspace pages. Every mutation checks the live credential again inside its database batch. Losing the issuing owner role or active account or membership permanently revokes that owner's credentials, even if ownership or access is restored. A replacement must be issued deliberately; browser sign-out alone does not revoke a credential. Retry keys are isolated to that credential. Existing business guards still apply.

`GET service-credentials` lists the owner's credential metadata without tokens or token hashes. POST `service.revoke` with `credential: ID` revokes one of that owner's credentials; next-request reads and write replays fail. Expired or revoked credentials return 401; denied scopes return 403. Creating and revoking credentials records an attributed audit event without the token. Every service business mutation also records its issuing owner and credential id atomically with the effect. Audit search, the audit page and CSV distinguish this authority from interactive owner activity. Owner-role and account-status changes now record each newly invalidated credential and issuing owner, the initiating administrator, cause and time atomically with native revocation. Refused changes produce no invalidation event, and reinstatement never repeats it. The audit page names the service client; authorized audit search and CSV preserve the same attribution. Archives strip token hashes; restoration retains credential metadata but revokes every credential, so a source token never becomes usable in a restored installation. The owner creates a fresh credential after reviewing the restored installation.

Conservative policy approved with ct riders on 26 October 2026: only owners explicitly consent to issuing their own scoped, expiring credentials; no approval, administration, destructive or outbound scope is supported. Delegated service ownership remains under ADMIN-003. ADMIN-006, ADMIN-007, ADMIN-008, ADMIN-009 and ADMIN-016 inherit service audit, custody, retention, erasure and inactive-restore obligations. Read the native estate subset's OpenAPI examples in `openapi.json`; complete target-entity schemas remain unfinished.

### Scheduled report packs

Active human owners use `POST /api/gasket/report.schedule` with a name, report (`performance`, `reliability`, `availability` or `bad-actors`), revision (zero for a new schedule), Sunday-zero weekday, `HH:MM` clock, firstDay, recipient member ids, optional team or asset filter, optional paused flag and explicit consent. Existing schedules also supply their schedule id and current revision. Team filters apply to Performance; asset filters apply to the other packs.

`GET /api/gasket/report-schedules` lists saved schedules and durable delivery results for owners. The Settings screen is `/app/settings/reports`. Owner previews are `/app/report-packs/:id.pdf` and `/app/report-packs/:id.csv`; they never send mail. Each weekly pack covers the seven completed site dates before the occurrence. Saved zones follow daylight saving, use the later repeated time and the first valid minute after a missing time. The installation scheduler catches up one oldest occurrence per tick.

Every recipient is checked at dispatch using current membership, operator status and report and export rights. Individual labor rates and original files are excluded. Each recipient gets a separate message. Provider acceptance records submission, not inbox delivery. Failed, rejected, uncertain or interrupted unconfirmed claims stay visible without automatic resend. Revisions, consent, claims and results are audited. This conservative delivery policy awaits ct approval under REPORT-006.

The CSV is a complete typed dataset: `path,type,value`, with one scalar or empty container per row. Paths use bracketed JSON keys; numbers, booleans, nulls, arrays and objects retain their types. Spreadsheet formula prefixes are protected with a leading apostrophe. PDF and CSV include period, definitions, freshness, permission scope, source revision and fingerprint, dashboard and source links, plus separately labelled site-wide data-quality context. A pack too large for the bounded mail attachment limit fails visibly rather than truncating its CSV.


### Procedure execution through version 1

The request examples and field schemas in `openapi.json` cover procedure creation
and immutable revision, work templates, assignment, checklist results, stock issue
and return, submission and independent approval. Read `/api/gasket/v1/checklists` and
`/api/gasket/v1/checklists/ID` for current and retained procedure revisions, and `templates` for
work templates. Create work with its template, then assign it to an active
member. Work pins the checklist revision current at creation. Later revisions
never alter that work's required steps.

Record parallel outcome, value and note arrays against that work. Issue stock
only as its assignee or collaborator and return no more than was issued. Read
`/api/gasket/v1/work/ID` for the exact current version before submission; missing required
results or evidence refuse it. A separate member with review authority reads
the submitted version and approves or returns it with a reason. Neither an
owner's self-review nor a service credential can bypass that decision. These
operations share the workspace handlers, retained result history and audit.
Each documented keyed request can retry its original bytes without adding
another revision, handoff, result log, movement, submission or review.

Procedure, assignment and execution schemas describe this tested native slice.
Other maintenance entities, attachment-size writes, broader write-key coverage
and the remaining credential custody, retention and erasure riders remain unfinished; the thirty-six-action
receipt allowlist refuses every other keyed action explicitly.

A template saved through JSON retains `requiredFields` in its current revision and
in work created from it. Both accepted field-list spellings are validated; when
both are present their union is required. Missing values refuse submission with
`not_ready_for_review`, even after checklist results are complete.

A service-created maintenance event retains its issuing owner and credential in
the direct business audit entry. Standing rules execute under their own recorded
author, using current rule authority rather than the triggering bearer. Their
retained source event points to the original audit sequence so trigger provenance
remains traceable without presenting it as the rule execution authority.


### Retained execution records and original files

OpenAPI request examples now cover meters, calendar schedules with required tools,
small evidence uploads, annotations, original time entries, readings, findings,
planned downtime, technician and independent supervisor signatures, cancellation
and reopening. They also cover custom-field creation, rename, value changes and
retirement, part categories, document originals, immutable revisions, expiry and
revision links pinned to work. A retired custom definition and its last value and
history remain readable. These are ordinary member operations; no service scope
was added. New effects retain their existing state, version, quantity and authority
checks. Signature retries recheck either execution authority or independent review
authority according to the original role.

Versioned original-byte downloads are `GET /api/gasket/v1/documents/REVISION_ID/file`,
`GET /api/gasket/v1/evidence/EVIDENCE_ID/file` and
`GET /api/gasket/v1/signature-marks/SIGNATURE_ID/file`. They use the same private-file
handlers as workspace downloads and refuse service credentials. Document download
identities name immutable revisions. The keyed JSON request ceiling remains 64,000
bytes including encoded file content; larger originals use the unkeyed upload door
and its separate file limit. No upload body or original file is stored in a retry
receipt.

OpenAPI also describes the tested asset, work and part detail responses, retained
custom values, evidence, signatures, time, readings, findings, downtime and
secret-free credential metadata. The API journey checks those shapes against actual
responses as well as independently asserting their business values. Additional
maintenance entities and comprehensive schemas remain INT-001 work.

Archive proof inspects the credential rows and original archive bytes: usable bearer
values and their verifiers are absent, metadata retains inactive placeholders,
export preserves source authority and restore refuses source tokens. After the
restored record counts are reconciled, the owner deliberately issues a new
credential and can revoke it again. This does not establish client-side custody,
legal retention, full metadata erasure or complete multi-site archive coverage.
