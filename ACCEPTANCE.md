<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Accept a Gasket installation

The requirements, evidence and remaining gaps below come from CONTRACT.md.

## Progress

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 14 | 0 | 0 | 14 |
| Target and push further | 54 | 47 | 36 | 137 |
| All | 68 | 47 | 36 | 151 |

Judged from the code and tests at commit `71ab859aee4bfeca7bdf810a0797ca708c5451d3` (27 October 2026). REPORT-006 remains partial following the ct review of `0cbb33a22baacae6a513a6f52eedf381265a67e8`. The independent history-period and distinct mutation repairs are present in this implementation; fresh ct judgment and guarded landing evidence remain required. The current documentation candidate preserves these code and test bytes. Other rows preserve main evidence and scope.

## Published clauses

### Published maintenance guarantees

#### GAS-01 — Set up the site and its people

published · **done**

The owner names the initial site and time zone, invites people as lead, maintainer, supervisor or agent, changes roles and ends access. Every JSON, form, document and download handler enforces the current session and role; ending access revokes existing sessions. New owner installations start empty. ADMIN-014 extends invitation and sign-in to people identified only by a mobile phone number, and ADMIN-015 adds Sign in with Google. **Acceptance evidence:** Through site and access pages and JSON/form doors, configure a site, invite and sign in each role, change one role and end access. Repeat private reads and writes signed out, forbidden and revoked; require refusal without leaked records.

**Evidence.** `src/gasket/site.ts`; `src/gasket/actor.ts`; `src/gasket/http.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### GAS-02 — Keep the asset register

published · **done**

A lead records asset tag, name, serial, location, custodian, category, criticality and counter, gauge or condition meters with units. Edits retain earlier values. Sightings record found, elsewhere or missing; retirement preserves history and prevents new scheduled work. **Acceptance evidence:** Create and edit an asset through the register, add three meter types, record each sighting outcome and retire another asset. Read its previous identity and history; duplicate tags, stale edits and unauthorized changes are refused.

**Evidence.** `src/gasket/assets.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### GAS-03 — Keep the parts list and reconcile counts

published · **done**

A lead keeps part numbers, names, units, stock locations and minimum quantities, receives stock and records physical counts. Counts post exact variance movements without rewriting receipts. Quantities are exact to three decimals; stale counts and invalid precision are refused. **Acceptance evidence:** Receive five units through the parts page, count four against the observed version, inspect the minus-one variance and retained receipt, then submit a stale count and excess precision through the API; neither changes stock.

**Evidence.** `src/gasket/parts.ts`; `src/gasket/quantity.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### GAS-04 — Write checklists with revisions

published · **done**

Leads create checklists and publish revisions. Issued work orders keep the exact procedure revision with which they were generated; editing the master never changes issued instructions or earlier results. **Acceptance evidence:** Create a checklist and issue a PM, publish a revision with an extra step, then open the issued work and revision history. Existing work retains its old steps and later work uses the new revision.

**Evidence.** `src/gasket/checklists.ts`; `src/gasket/schedules.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### GAS-05 — Schedule preventive work

published · **done**

Leads define calendar intervals, counter intervals or both, first due date/value and default maintainer. The explicit Create due work orders command generates work due within seven days or at the counter threshold, with at most one open order per schedule. Automatic operation extends this guarantee in PM-001 and PM-002. **Acceptance evidence:** Create calendar and meter schedules through the API, cross each due boundary and request generation twice. Inspect one linked order per due schedule, the retained due value and no duplicate open work.

**Evidence.** `src/gasket/schedules.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### GAS-06 — Assign work

published · **done**

Leads create corrective work against an asset and assign or reassign work to active maintainers, leads or the owner; technicians also create and self-assign their own unplanned work under FIELD-009. Maintainers have their own work list; assigning a supervisor, agent, ended member or unknown person is refused. **Acceptance evidence:** Raise corrective work through the form door, assign and reassign it, then read both maintainers' own queues. Attempt each ineligible assignee through the JSON door and inspect unchanged assignment.

**Evidence.** `src/gasket/work.ts`; `src/gasket/site.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### GAS-07 — Capture the inspection

published · **done**

The assigned maintainer records pass, fail or needs-attention results with notes, uploads photo or document evidence and records dated meter or condition readings. Other people cannot record the work. Backwards counter readings and future readings are refused; evidence downloads require access. **Acceptance evidence:** As the assigned technician, enter all result types, upload and download evidence, and record readings through work pages/API. Try another technician, a backwards counter and a future date; require refusal and retained original evidence.

**Evidence.** `src/gasket/work.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### GAS-08 — Issue and return parts, record downtime and findings

published · **done**

Assigned maintainers issue available parts, return no more than their holdings, record outage start and end with computed minutes, and record severity-coded findings. One asset has at most one open downtime. A finding requesting follow-up creates a linked corrective work order. **Acceptance evidence:** Issue and return parts through the work form/API, attempt excess stock and returns, open and close downtime, then request corrective follow-up from a finding. Inspect exact stock, minutes, linked work and refusal of overlapping open downtime.

**Evidence.** `src/gasket/work.ts`; `src/gasket/parts.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### GAS-09 — Submit and review

published · **done**

Submission requires all checklist results, a corrective finding linked to every failed or needs-attention result and closed downtime. Supervisors approve the exact reviewed version or return it with a reason. A person who performed work cannot approve it; stale review is refused. Approval closes work and advances the schedule. **Acceptance evidence:** Submit two failed steps with only one finding and require refusal, then supply linked findings and complete inspection evidence. Return with a reason, resubmit, attempt self-review and stale approval, and approve independently. Inspect retained reviews, closure and next schedule due point.

**Evidence.** `src/gasket/review.ts`; `src/gasket/work.ts`; `src/gasket/schedules.ts`; `migrations/core/0017_finding_steps.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### GAS-10 — Watch overdue work and downtime

published · **done**

Leads and supervisors see overdue work, work awaiting review, unresolved corrective follow-ups, assets down now, downtime minutes per asset over the last 30 days and stock below minimum. Open downtime contributes elapsed time; historic outages are clipped to the reporting window. **Acceptance evidence:** Open the board as lead and supervisor with overdue, submitted, failed and down assets plus low stock. Compare counts and clipped minutes with source records; a maintainer cannot read the board API.

**Evidence.** `src/gasket/board.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### GAS-11 — Read and keep the history

published · **done**

Members read asset work, results, readings, part movements, downtime, findings and reviews with actors and dates; leads and supervisors download the same history as CSV. The owner exports the whole installation with rer export and restores it into a fresh installation with rer import without losing domain history. **Acceptance evidence:** Read the full asset history and authorized CSV through public doors, compare events and attribution, export a populated installation using rer export, restore into an empty installation using rer import and compare domain records and attachment digests.

**Evidence.** `src/gasket/history.ts`; `scripts/installer/local.mjs`; `tests/gasket/flows.mjs`; `tests/gasket/installation.mjs`

**Gap.** None.

#### GAS-12 — Move in from MaintainX

published · **done**

The existing register importer accepts MaintainX asset, part and meter-reading CSV columns. A no-write preview lists creates, rejected rows and attention items; apply is bound to the reviewed fingerprint, journaled and idempotent. Undo removes only that import and refuses when later records depend on it. MIG-002 extends this to complete work history. **Acceptance evidence:** Upload the three CSVs through move-in, compare a no-write preview, refuse a changed fingerprint, apply and reapply, undo and import again. Create dependent Gasket records and verify undo reports blockers without removing data.

**Evidence.** `src/gasket/movein/maintainx.ts`; `src/gasket/movein/target.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### GAS-13 — Let an agent prepare and a person approve

published · **done**

An agent uses its own sign-in and the documented JSON API to read maintenance data and propose a schedule, corrective work or physical count. Proposals retain reasoning, payload hash and relied-on versions. A different lead or owner approves or rejects; approval executes the normal command atomically. Stale proposals and direct agent mutations are refused. **Acceptance evidence:** Sign in an agent, prepare each supported proposal via API, reject one, approve another as a different lead, change underlying stock and attempt stale approval. Try direct work capture, record mutation and self-approval; inspect refusals and attributed decisions.

**Evidence.** `src/gasket/proposals.ts`; `src/gasket/actor.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### HTTP-001 — Health, Lobby and real 404s

published · **done**

The installed origin serves the Lobby at /, deployment health and identity at /health, and real 404s for unknown HTTP and document routes. Private maintenance pages remain behind native sign-in. **Acceptance evidence:** Request the emitted Worker's root, health, unknown document, unknown API and health subpath; inspect branding, deployment identity and HTTP status, then attempt a private page signed out.

**Evidence.** `tests/runtime.mjs`; `src/base/lobby.ts`; `src/gasket/http.ts`

**Gap.** None.

## Target clauses

### Administration, trust and ownership

#### ADMIN-001 — US operating defaults

target · **partial**

A US owner configures USD costs, US English as the organization's default display language (ADMIN-013 lets each person choose Spanish or another language), a US postal address and site time zones with daylight saving. Assets support customary and SI units with explicit conversions; schedules and reports show site-local dates and unambiguous timestamps. Existing data keeps its recorded units and currency. **Acceptance evidence:** Set up Ohio and Arizona sites, enter USD hourly rates and Fahrenheit/psi readings, cross a daylight-saving boundary and export. Verify due times, currency, unit labels and unchanged original readings.

**Evidence.** `src/gasket/site.ts`; `src/gasket/dates.ts`; `src/gasket/ui/settings.ts`; `src/gasket/bad-actors.ts`; `src/gasket/lifecycle.ts`; `tests/gasket/flows.mjs`

**Gap.** US English, US time-zone choices, site-local dates, recorded meter units and USD work/lifecycle costs exist; organization postal address, explicit customary/SI conversions, multiple US sites and the complete daylight-saving/export journey remain missing.

#### ADMIN-002 — Multiple sites and shared governance

target · **partial**

One organization manages sites, buildings, lines and storerooms with local calendars and shared asset/part standards. Owners delegate site managers; site membership scopes every list, attachment, report and write. Cross-site transfers retain identity and history. Reparenting a hierarchy entry (ASSET-001) under another site's parent needs management rights at both sites and is otherwise refused. The technician create-work right (FIELD-009) is turned off and on per site by its owner or site manager: that site's technicians are refused at every door while other sites' technicians still create work. The stores report (PART-009) filters by any site the reader may see. Before additional sites ship, this clause scopes REQ-001/REQ-002 portals, published targets and intake and REQ-003 queues, duplicate groups, source photos and work conversion to the authorized site. REPORT-006 multi-site authorization applies at every report, schedule, draft, preview, dispatch and download door before additional sites become operational. **Acceptance evidence:** Create two sites with distinct managers, move an asset with its meter history, then call each private door using the other site's member. Inspect denied access, correct local dates and organization rollups. As a manager of one site only, move a machine under the other site's line and see it refused (ASSET-001). Turn the technician create-work right off at one site and see that site's technicians refused at the web, API and app doors while the other site's technicians still create work (FIELD-009).

**Evidence.** `tests/gasket/flows.mjs` GAS-01 site and access, extended by `tests/gasket/site-access.mjs` siteAccessJourney: owner-created planned sites with distinct recorded managers; metadata visibility and private roster refusal; stale metadata and membership refusal; current-session planned membership revocation; no operational fallback across enumerated JSON, page and download doors and representative form writes for planned or unauthorized site selection; ended-member exclusion; attributed site audit with scoped search and download. `src/gasket/site-access.ts`; `src/gasket/site-context.ts`; `migrations/core/0099_site_registry.sql`.

**Gap.** Only the primary site is operational. Additional sites hold planned metadata and membership only; there is no activation door. Remaining: site-scoped estate records at every list, record, attachment, report, write and download door; asset moves preserving meter and maintenance history; destination hierarchy authority; correct operational local dates and organization rollups; independent technician create-work rights at each site across web, API and app; operational membership revocation in background jobs; complete multi-site archive reconciliation. Conservative default adopted pending CT approval: only the active owner maintains site metadata and membership; recorded managers gain no extra role permissions or personnel access. PLAN-004 qualification and tool records, REQ-001 through REQ-003 intake and source evidence, REPORT-006 preview, dispatch and download, and existing recovery duties remain subject to this full site boundary before additional sites become operational.

#### ADMIN-003 — Role rights and separation of duties

target · **partial**

Owner controls identity, integrations and retention; site admin manages that site; lead plans/assigns and manages registers; technician creates corrective and emergency work, including work already completed, against assets and locations (FIELD-009) and records assigned or self-assigned work; supervisor reviews independently; storeroom clerk counts/issues/receives, and a stores supervisor independently approves count variances (PART-004); buyer drafts POs; purchasing approver authorizes spend; analyst reads authorized reports. Permission templates and custom grants keep work creation, execution, approval and cost-rate visibility separate. Create work is a default technician right that an owner or site admin revokes per role and site, and a ready-made Operator template sees and records only work assigned to that person. Broader delegated scheduling rights inherited from REPORT-006 must preserve current report and export permissions, attributable preparation, explicit owner authorization of the saved revision and separation of preparation from outbound authority. **Acceptance evidence:** Sign in each role and exercise its permitted public doors, including direct forbidden writes/exports. Add a custom site-scoped role, revoke it and test old sessions; technician work and purchasing cannot be self-approved. Remove create work from the technician role at one site and see that site's technicians refused at app and API while the other site's technicians still create work; give a person the Operator template and see only their assigned work. For PLAN-004, explicit revocable grants must support qualification and tool-record creation, correction and retirement within authorized sites and records, independently of planning access, erasure, retention and private-document rights.

**Evidence.** `src/gasket/actor.ts`; `src/gasket/site.ts`; `tests/gasket/flows.mjs`

**Gap.** Fixed owner/lead/maintainer/supervisor/agent roles exist; a technician create-work right (default, self-assigned or left unassigned, owner-revocable for the site; FIELD-009) exists; site, stores, purchasing, analyst roles, custom grants, per-site revocation across sites of the create-work right and the Operator template do not. Broader delegated scheduling rights inherited from REPORT-006 remain unbuilt; existing assigned preparation grants no outbound authority.

#### ADMIN-004 — Requester and contractor access

target · **missing**

Requesters and contractors are invited by mobile phone number or email address (ADMIN-014); neither needs a company email. Requesters submit and follow their own faults without seeing private maintenance costs or other people's requests. Contractors receive expiring access to named work, instructions and evidence, record completion and costs, and cannot browse the asset estate or approve their work. Neither ever reads the team's internal comments or their photos (PLAN-006). Requesters and contractors never create work orders at any door (FIELD-009); they use request intake (REQ-001, REQ-002). **Acceptance evidence:** Invite a requester by US mobile number only and an external electrician by email, have the requester sign in with a one-time SMS code, submit a fault and follow it, and finish assigned contractor work. Change URL/API identifiers to other records, inspect denied access, expire the contractor grant and test its active session. The requester and the contractor are refused a work order's and an asset's internal comments and comment photos (PLAN-006) by URL and API. A requester and a contractor are refused work creation at the web, API and app doors (FIELD-009).

**Evidence.** None.

**Gap.** No requester or contractor identity, scoped portal or expiring external work grant.

#### ADMIN-005 — Enterprise identity lifecycle

target · **missing**

Microsoft Entra ID and Okta SAML/OIDC SSO, enforced MFA policy and SCIM provisioning/deprovisioning map organization groups to site roles. Owner recovery is audited; deprovisioning ends browser, API and mobile access, including queued offline writes at sync. The same applies to people who sign in by phone number (ADMIN-014): ending a phone-only person's access, or changing their number, ends their app sessions and offline sync. **Acceptance evidence:** Connect each identity provider at its network edge, provision two site groups, require MFA, deprovision an active technician and attempt web/API/offline sync. Repeat for a phone-only technician with queued offline work: end their access and attempt app sync. Inspect refusal of every attempt and a logged owner recovery.

**Evidence.** None.

**Gap.** No SSO, SCIM, MFA policy or group/site mapping.

#### ADMIN-006 — Attributed append-only audit

target · **done**

Maintenance changes, immutable readings and movements, checklist revisions, reviews and import decisions commit atomically with actor, action, record and time. Owners and authorized supervisors search/export audit by site, action and date, including integration and AI decisions; corrections append rather than rewrite evidence. While an installation holds one site (until ADMIN-002), the site filter of audit search and export accepts that one site and refuses any other with 404, and every entry and CSV row names its site; per-site attribution across several sites grows with ADMIN-002. **Acceptance evidence:** Perform work, count, review and import through public doors, trigger a stale write, and inspect the audit download. The failed write adds no business change; previous readings remain visible and integration/AI actions name their authority. Filter search and export by the installation's site and by another site id (404); every entry and CSV row names its site.

**Evidence.** `src/gasket/core.ts`; `src/gasket/audit.ts`; `src/gasket/history.ts`; `src/gasket/views.ts`; `migrations/core/0018_audit_role.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### ADMIN-007 — Retention and verifiable erasure

target · **partial**

Owners set retention and legal holds for attachments, request contacts, users and maintenance records. An erasure preview identifies dependencies and retained obligations; apply removes eligible records/files, anonymizes retained audit, and produces a per-type result. Later restores honor the erasure journal; recipients' prior downloads remain outside local erasure. **Acceptance evidence:** Create a held work record and an eligible requester/photo, preview and apply erasure through the owner door, inspect bytes and anonymized audit, and restore an older archive with the later erasure journal. Held records remain and erased records do not reappear. PLAN-004 qualification erasure inherits dependency previews, applicable retention minima and holds, atomic eligible erasure, attributable anonymized audit and durable per-type results; complete copied-data reconciliation remains required.

**Evidence.** `src/gasket/retention.ts`; `src/gasket/request-erasure.ts`; `src/gasket/attachment-erasure.ts`; `tests/gasket/search.mjs` retentionJourney: owner-only policy changes, minimum-age refusals, request, work, attachment and user holds, byte-preserving refusals, stale revisions, explicit release, signed, held, required and certificate original preservation, optional companion evidence on certificate work and signed-work request source preservation with unchanged bytes and per-type results, confirmed erasure and stable per-type retry results; `tests/gasket/recovery.mjs` recoveryJourney: request and optional work originals remain absent after later restore and a later journal fences an older archive.

**Gap.** Ct approved PARTIAL on 25 October 2026: owners manage retention minima and holds; retain indefinitely with no automatic erasure. Held, submitted, signed, required and certificate evidence is preserved; maintenance records and anonymized audit remain. Optional work originals on never-submitted, unsigned and unheld work require fresh owner confirmation. Public erasure refusals preserve original bytes, dependency counts, maintenance records and per-type results for held, signed and certificate evidence. User and full maintenance-record erasure remains partial under ADMIN-016; dependencies and per-type results for remaining file classes remain unproved.

#### ADMIN-008 — Protected credentials and private attachments

target · **partial**

Provider tokens, sensor certificates and mobile credentials are encrypted under installation authority, narrowly scoped, rotatable and revocable. Private file access rechecks current record rights; original attachments use Cloudflare R2 or owner object storage with resumable uploads, declared limits, malware handling and safe rendering. Telemetry aggregation runs in bounded background jobs rather than long request-time database scans. Logs, exports and AI context redact secrets; disconnecting a provider stops new sends. **Acceptance evidence:** Connect/rotate/revoke a provider, upload a private manual and hostile file, then use unauthorized, expired and cross-site download links. Export and inspect logs/context for planted secrets; revoked connectors produce no new outbound requests.

**Evidence.** `src/gasket/work.ts`; `src/gasket/actor.ts`

**Gap.** Authenticated evidence access and safe response headers exist; connector secret lifecycle, scanning, scoped links and export/context redaction are unproved.

#### ADMIN-009 — Complete portable archive and inactive restore

target · **partial**

Owners download a documented archive of all sites, assets, work/history, PMs, requests, stock/movements, POs, costs, attachments, audit and import mappings with schema versions, counts and digests. Restore into empty data validates before writes, pauses automation and excludes sessions/provider secrets; owners reconnect services deliberately. **Acceptance evidence:** Export a realistic multi-site estate through the supported command/download, interrupt/resume, validate digests and restore to a fresh installation. Compare every record class; corrupt and nonempty restores write nothing and restored PMs do not send or buy. Qualification erasure results and later-journal fencing must survive portable archive and inactive restore; an incompatible older archive is refused before publication.

**Evidence.** `scripts/installer/archive-policy.mjs`; `tests/gasket/recovery.mjs` recoveryJourney: supported export and import validate corruption, reject nonempty targets, exclude sessions and signing keys, preserve accepted work and pause restored PMs and connectors; `tests/gasket/automation.mjs` connectorJourney: fresh-key reconnection and pending delivery idempotency; `tests/gasket/flows.mjs` GAS-11 rer export and rer import keep every record: populated attachment digests and records.

**Gap.** Single-site inactive restore is implemented. Complete multi-site manifest and record-class reconciliation and interrupted and resumed export remain unproved. recoveryJourney also proves request erasure checkpoints fence older archives with a later journal; other domain erasure types remain unfinished.

#### ADMIN-010 — Backup recovery and connector operations

target · **done**

The owner sees backup freshness, last successful restore drill, background-worker and connector lag, failed jobs, quotas and actionable failures. Recovery preserves accepted work and notification/purchasing idempotency; an operator can pause a failing automation without deleting its history. **Acceptance evidence:** Back up populated data, interrupt a PM/receipt job, recover to another installation and reconnect intentionally. Inspect visible recovery point, job errors and deduplicated resumed work through owner operations pages.

**Evidence.** `scripts/installer/recovery.mjs`; `src/gasket/recovery.ts`; `tests/gasket/recovery.mjs` recoveryJourney and backupBrowser: completed backup freshness, exact recovered snapshot and digests, owner-confirmed and audited restore drill, rejected backup preserving its receipt, original attachment bytes, accepted work and inactive restore at 1440 and 390; `tests/gasket/automation.mjs` automationJourney: lag, failed jobs, independent pause and retained history; connectorJourney: source receipt timeout after receiver commit, paused recovery, intentional key rotation and reconnection, stable resumed delivery identity, no duplicate stock or bills and restored receipt replay, with owner failure and retry controls at 1440 and 390.

**Gap.** No remaining acceptance points for current recovery doors. Multi-site estate recovery is inherited by ADMIN-002 and ADMIN-009.

#### ADMIN-011 — Accessible responsive maintenance workspace

target · **partial**

Core setup, intake, planning, stores, reporting and work execution are usable at 1440 and 390 widths with keyboard navigation, screen-reader labels, visible focus and text status. Long asset names and errors remain readable; failed saves keep entered work and disclose whether it was persisted. **Acceptance evidence:** Use every core journey at 1440 and 390 with realistic long records, keyboard and assistive semantics. Induce a save failure, reload the confirmed record and inspect retained draft, focus, text errors and absence of horizontal clipping.

**Evidence.** `tests/gasket/intervals-browser.mjs` — workspaceBrowser and noScriptDrafts: site edits, people and roles, long asset registration, meters, checklist authoring, preventive scheduling and execution, intake refusal and confirmation, triage, conversion, assignment, slot confirmation, stock receiving and counts, parts issue and return, filtered reporting, time and evidence, independent review and closure. Assertions run at 1440 with one 390 menu smoke; browserProof captures the named screens at 1440 and 390. Named controls, landmarks, headings, visible keyboard focus, text errors and clipping are asserted. Refused time saves retain the draft and independently reload with no write; a lost reply confirms one persisted write through its member-bound receipt and refuses replay; a real database-edge failure after commit reports its persisted step. Native forms retain text, selections and attachment bytes, permit correction without duplicate effects, and retain submitted values after session expiry. `tests/gasket/part-catalog-browser.mjs` — catalogBrowser: a refused catalog preview retains its supplier and file, changes no part, and a replacement file reaches review and import; receiving and approved merge remain covered. `tests/gasket/requests.mjs` — requestPortalJourney and requestDraftJourney retain the intake, private draft, lost-response and source-evidence checks. These journeys run in existing required push Verify jobs. The workspaceBrowser submit helper proves before-commit refusal, unchanged independently reloaded records, retained fields, focused text errors, a failed zero-step receipt, a successful retry with its reply lost, a saved nonzero-step receipt and disabled replay for 39 distinct actions, including giving, changing and ending access. noScriptDrafts proves that unreachable native results leave the source text, selections and original attachment bytes open; a request lost before arrival has no receipt or effect, a reply lost after commit has one saved record and the same draft cannot repeat it. Native attachment recovery retains one submission identity and permits correction. A refused native role change retains the selector associated with its row form, changes no authority, and a deliberate correction applies that retained role. `tests/gasket/form-save-interruptions.mjs` — saveSnapshot.interrupt: for each committed step of the 39 distinct workspace actions exercised by workspaceBrowser, an isolated installation injects a real database-edge failure, compares the receipt with independently observed commits including recovery writes, restarts the Worker, reloads the exact receipt and confirmed records, and refuses duplicate effects. The additional browser flows correct asset details, revise a procedure without changing issued work, raise corrective work, record downtime and original attachment bytes, cancel and reopen work, register a supplier and cost center, request and draft a purchase, and independently approve a cycle-count variance. workspaceBrowser inspects all 42 fixed HTML workspace destinations and follows populated record links for assistive names, landmarks, headings, keyboard focus and readable long records, with captures at 1440 and 390.

**Gap.** Record-dependent conditional states and specialized workspace actions beyond the 39 named saves remain unproved. Before-commit refusal, lost-success-reply recovery, and interruption after each committed step with fresh-Worker receipt and replay checks cover those 39 actions only. Complete target-workspace journey coverage remains required. Running or unreachable receipts require inspection before another submission.

#### ADMIN-012 — Search, saved views and bulk maintenance actions

target · **partial**

People search/filter assets, work, requests, procedures, parts and vendors by tag, serial, site, owner, date, status and custom fields. Saved views and permission-aware bulk edit/assign/export show a preview and per-record failures; pagination never silently omits the estate. **Acceptance evidence:** Find a serial among thousands of assets, save a cross-filtered view, bulk reassign selected work including a forbidden record and export all pages. Inspect exact selection, denial and totals.

**Evidence.** `src/gasket/search.ts`; `tests/gasket/search.mjs` searchJourney: exact serial search, cross-filtered saved views, complete paged JSON export, scoped work and request denial; `tests/gasket/flows.mjs` PLAN-007 bulk actions and controlled cancellation: per-row bulk outcomes.

**Gap.** JSON search covers current assets, work, requests, procedures, parts and vendors with totals and cursors; existing work custom fields and asset and part custom fields are filterable. `tests/gasket/custom-fields.mjs` customFieldsJourney proves asset and part value filters and a saved custom-field view. Multi-site scope, UI search and saved views, and Work-page bulk selection remain unproved; the last item stays with br under PLAN-007. Ct approved: saved filters are private by default, sharing is owner-only and every read re-evaluates record access. searchJourney asserts a shared filter returns no rows on the next read after revoking request-record permission, and direct request detail is refused.

#### ADMIN-013 — Per-person display language

target · **partial**

Owners set the organization's default display language and every person (owner, lead, technician, supervisor, stores, purchasing, requester, contractor) chooses their own. US English and US Spanish ship complete at launch; the published catalog covers at least 30 display languages, including French, Portuguese, Vietnamese, Simplified and Traditional Chinese, Korean, Tagalog, Polish and right-to-left Arabic. The chosen language applies to the web workspace, the iOS and Android app (FIELD-001), the requester portal and QR fault form (REQ-001, REQ-002), email and push notices (PM-005, INT-004), printed work packs (FIELD-008) and PDF reports (REPORT-006). Signed-out requesters get the portal's site default or their browser preference and can switch. Dates and numbers follow the person's locale while stored values, units, USD amounts and timestamps are unchanged. User-entered text (asset names, checklist steps, notes, readings, comments) is shown exactly as authored, and translated procedures come only from AGENT-007's reviewed translations. A missing translation shows the English string with a visible untranslated marker, never a blank control, and owners can download a per-language completeness report. The existing operator portal and scoped QR form under REQ-001/REQ-002 inherit this full obligation: complete language catalogs, person/site/browser preference, locale formatting and visible fallback must be asserted at both current intake doors by this clause before its language support ships. Localized scheduled report packs inherited from REPORT-006 follow this per-person language and locale duty while preserving stored source values and authored text. **Acceptance evidence:** Set the organization default to English and one technician and one requester to Spanish. On the technician's phone app, the requester's QR fault form and portal, an emailed and a push notification, and a printed work pack, show interface text in Spanish while user-entered checklist text, readings, units, USD amounts and audit attribution stay byte-for-byte unchanged and an English lead still sees English. Remove one Spanish catalog string and show the visible English fallback marker, not a blank control, plus the completeness report naming it. Switch a user to Arabic and check right-to-left layout at 390 width without clipping.

**Evidence.** `migrations/core/0105_display_languages.sql`; `tests/gasket/languages.mjs` — languageJourney: owner organization default and independent self-only preferences for existing human members, signed-out browser and site defaults and explicit switching without identity, forbidden member and default changes and revoked-session refusal, complete primary-site English and Spanish portal and decoded QR intake strings, localized validation and retained-form recovery, opted-in isolated drafts and lost-response exactly-once retry, unchanged authored answers and values, original photo digests and human attribution, visible English fallback after an owner removes a Spanish string and matching owner-only completeness download. Browser proof covers intake, draft recovery, retry, confirmation, fallback and Settings at 1440 and 390. `tests/gasket/requests.mjs` — requestPortalJourney and requestDraftJourney retain intake consent, private-file access, erasure and sign-out draft fencing.

**Gap.** Primary-site intake foundation only. Remaining: complete workspace and all-role localization; requester, contractor, stores and purchasing identities not yet built; the full catalog of at least 30 languages, including Arabic right-to-left qualification; locale date and number formatting; localized email and APNs and FCM push delivery; native iOS and Android app under FIELD-001; printed work packs under FIELD-008; completed-work PDFs and scheduled report packs under REPORT-010 and REPORT-006; reviewed authored procedure translations under AGENT-007; operational multi-site language defaults and authorization under ADMIN-002. Owner-only interface-catalog maintenance grants no delegated access. REQ-001 and REQ-002 retain the full language and locale obligation beyond this initial English and Spanish interface slice. No device, provider, role or site prerequisite is released.

#### ADMIN-014 — Phone-number invites and SMS sign-in

target · **missing**

An owner, site admin or lead invites any person (technician, supervisor, storeroom clerk, buyer, requester or contractor) by mobile phone number or by email address; neither is required. A phone invite is a text message, sent through the owner's connected SMS provider (Twilio or Amazon SNS), with an expiring single-use acceptance link. The person then signs in to the web workspace and the iOS and Android app (FIELD-001) with a six-digit one-time code sent by SMS and valid for 10 minutes. Numbers are stored in E.164 form and identify one person in the organization. Duplicate numbers, malformed numbers and numbers in countries the owner has not enabled (the US and Canada at launch) are refused with a visible reason. A number that has opted out by replying STOP is shown as unreachable rather than silently retried. Code requests are limited to five per number in 15 minutes and per network address, five wrong codes lock the number for 15 minutes, and codes never appear in logs, exports or AI context. A person can add an email address later. Changing a number requires a code sent to the new number. Changing the number or ending access revokes every existing web and app session, API token and device grant, and the person's queued offline writes are refused at sync with a per-record reason that stays visible to them and their lead (FIELD-003). Invitations, code requests, sign-ins, number changes and opt-outs appear in the audit (ADMIN-006). SMS delivery status is visible on the invitation, and provider acceptance never counts as acceptance by the person. Imported users with only a phone number become phone-identified invitations mapped to their history (MIG-002, MIG-008). **Acceptance evidence:** (1) Invite a technician by US mobile number only and inspect the SMS invitation at the provider edge. (2) Accept it, sign in to the iOS and Android app with the one-time SMS code, and receive and complete assigned work. (3) Invite a requester the same way and follow their own request. (4) Import a MaintainX user export containing a phone-only user and see that user mapped to their completed work. (5) Submit a duplicate number, a malformed number and a number from a country that is not enabled, and see each refused with a visible reason. (6) Request a sixth code within 15 minutes and see it refused with a retry time, then enter five wrong codes and see the lockout. (7) Change one phone-only technician's number and end another's access while both hold queued offline work, then sync: existing sessions are revoked, every queued write is refused with a visible reason, and the audit records each event.

**Evidence.** None.

**Gap.** Members are invited and identified by email only: `src/gasket/site.ts` refuses a member without a valid email and invites through the email-only Base auth invitation; no phone identity, SMS invitation or one-time code, rate limit, opt-out handling or number-change revocation.

#### ADMIN-015 — Sign in with Google

target · **missing**

Owners enable Sign in with Google for the organization, optionally limited to named Google Workspace domains, alongside email-link, SMS (ADMIN-014) and enterprise SSO (ADMIN-005) sign-in. A Google account signs in only when its verified email matches an invited or active member, unless the owner sets a domain rule that admits new members at a named default role for review. Members can link and unlink Google from their profile, and owners can require Google or SSO sign-in for owners and leads. Ending access in Gasket revokes existing sessions regardless of the Google session, and the provider credentials are protected under ADMIN-008. **Acceptance evidence:** Enable Google with test credentials at the network edge, sign in an invited lead with Google and land on their own work, and see an uninvited Google account and an account outside the allowed Workspace domain refused. Unlink Google and sign in by email link, require Google for leads and see an email-link lead sign-in refused, then end the lead's access and see their Google sign-in refused and their active session revoked.

**Evidence.** None.

**Gap.** The shared Base auth module carries a Google OIDC preset, but Gasket configures no Google provider, member/domain matching, link/unlink or require-Google policy, and no flow proves Google sign-in or revocation.

### Assets, procedures and equipment context

#### ADMIN-016 — User and full maintenance-record erasure

target · **partial**

The unfinished user and full maintenance-record erasure portion of ADMIN-007 remains a separate obligation. Owner-confirmed erasure must respect retention, legal holds and retained evidence obligations, preserve anonymized audit and prevent resurrection on later restore. Erasing an eligible retired qualification family does not erase its user identity or discharge complete maintenance-record erasure; retained obligations and prevention of resurrection remain required.

**Evidence.** `src/gasket/record-erasure.ts`; `tests/gasket/search.mjs` retentionJourney invoking eraseFixture in `tests/gasket/record-erasure.mjs`: owner-only preview and confirmed form or JSON erasure, inactive non-owner identity anonymization, eligible unsigned work and original removal, explicit dependency counts, legal holds and minimum ages, signed, required and certificate work refusal, stale preview refusal, stable replay results and redacted audit; erasureGuards proves held former-contributor time preservation, retention of another record audit when an ended lead requests erasure, release followed by eligible work erasure, and deletion of mentioned comments with their notices; erasureScreens runs in push Verify at 1440 and 390. `tests/gasket/recovery.mjs` recoveryJourney: inspect later archive bytes, refuse an older archive with the later erasure journal, restore anonymized identities and absent work and originals.

**Gap.** Conservative defaults adopted pending ct approval: only an interactive owner explicitly confirms the current dependency preview; erase only ended non-owner identities without domain dependencies and never-submitted unsigned work without retained evidence or unknown dependencies. Keep inactive opaque identity markers, attributed audit structure and invitation-cancellation markers; redact eligible private payloads and invalidate older archive epochs atomically. Erasure is refused when another record audit refers to the identity or work; retained audit details are preserved. Full erasure of users with retained domain references, remaining maintenance record classes, complete dependency and copied-data reconciliation, and broader erasure coverage remain unproved. Signed, submitted, required, certificate, held and minimum-age evidence is retained. Prior recipient downloads remain outside local erasure. ADMIN-016 remains partial until ct approves these defaults and the remaining scope is proven.

#### ASSET-001 — Asset and location hierarchy

target · **done**

Leads model site/building/line/machine/component parentage with stable identifiers and locations. Moving a subtree preserves work and rolls cost/downtime up without counting an outage twice; cycles and cross-site unauthorized reparenting are refused. Exactly: the site is the root; under it every register entry is a building, line, machine or component, and keeps its id and tag through every move. A parent ranks above its child in that order (a component may also hold components), is active, and is never the entry itself or anything below it; a stale read, a parent of the wrong level, a retired parent and a cycle are refused and write nothing, and an entry with active entries below it cannot be retired. Leads (and the owner) place an entry when they register it and move it later; moving an entry takes everything below it along, work, downtime, readings and history stay on the entries they were recorded on, and the move shows in the history of the entry and of both parents. An entry's roll-up covers it and everything below it: open work, ended downtime as the union of their outages so an outage they share counts once (the shared minutes are shown; entries down now are listed and their outage counts once it ends, as on each asset), and moved-in work cost (MIG-002) in parts, labor and other. Done covers the one site and the cost records that exist today; ADMIN-002 refuses reparenting across sites without rights at both, REPORT-001 rolls its work costs up this hierarchy, and MIG-001 places imported assets under the parents their source names, each before it ships. **Acceptance evidence:** Create a compressor under a line, move its component subtree and open parent history/report totals. Attempt a cycle and cross-site move; verify refused writes and retained descendant records.

**Evidence.** `src/gasket/hierarchy.ts`; `src/gasket/assets.ts`; `src/gasket/history.ts`; `src/gasket/ui/assets.ts`; `migrations/core/0039_hierarchy.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### ASSET-002 — QR and barcode identification

target · **done**

Leads print durable QR and barcode labels for assets, locations and bins. Scanning with a phone camera or supported scanner opens the authorized record, the scoped fault form (REQ-002) or, for a member with the create-work right, new work against that asset or location (FIELD-009); a public label never grants private work/history access. Reprints preserve identity. The code is the existing explicitly published target identity; leads and owners print it, while the owner configures which display name may be public under REQ-001. An active signed-out scan opens only its scoped intake; a member scan offers the authorized record and the ordinary create-work door if the current site grants it. Retired targets reprint the same code and refuse new faults/work with an explicit retired state; unknown codes are explicit 404s. A bin label identifies its published bin location today; PART-001 inherits its stock-bin record link before bin balances ship. FIELD-001 carries native scanner deep links before its app ships. **Acceptance evidence:** Print asset and location labels, scan at a technician phone and signed-out operator portal, report a fault against a location label with no asset, reprint a retired asset label and scan an unknown code. Inspect correct route, restricted fields and explicit retired/unknown states.

**Evidence.** `tests/gasket/requests.mjs` — labelsJourney: lead prints asset/location/bin labels; independent QR and Code128 pixel decoding, phone and keyboard-scanner route resolution; signed-out scoped form without private record access; location-only fault persistence; scanned technician work with original photo, priority/description/self assignment and web provenance, forged-target and revoked-right refusal; retired reprint identity and explicit retired/unknown scans. capture proves labels, authorized scan, scanner, retired reprint and states at 1440/390. `src/gasket/labels.ts`; `src/gasket/ui/labels.ts`; `API.md`.

**Gap.** None.

#### ASSET-003 — Manuals, documents and warranties

target · **done**

Assets hold versioned OEM manuals, diagrams, warranties, supplier contacts, commissioning dates and authorized documents with expiry reminders. Technicians see the version linked to issued work; offline packs include approved files and retain original attribution. A document is a manual, diagram, warranty, authorization (permit, licence or certificate) or other document of one asset, kept as numbered revisions of a PDF, image or plain-text file of up to 1.5 MB that never change or go away; each revision names its source (publisher and reference) and who added it when. Leads (and the owner) add documents, revisions and contacts; adding a revision, from the revision the lead read (a stale one is refused), is its approval and makes it the master. A lead links a document to open work on the same asset, pinning the current revision or a named earlier one; the work shows and packs that revision, marked when the master has moved on, until a lead links it again. The job pack is one ZIP download of the work order's summary, the pinned files unchanged and a manifest of each file's document, revision, original name, source, SHA-256 and who added it; FIELD-002's offline packs inherit the same pinned files and attribution before they ship. An expiring document names an active member as its owner and reminder days (0 to 365, default 30): on a scheduler run (PM-001) the owner gets one in-app notice once the site's day is within that many days before the expiry date and one more on or after it, and a changed date asks again; email and push wait for PM-005. Supplier, manufacturer and service contacts, each with a phone or email, are kept on the asset; commissioning dates are ASSET-007's lifecycle facts. **Acceptance evidence:** Attach two manual revisions, link one to work, set a warranty expiration and download the job pack. Change the master and inspect issued/offline documents plus the named owner's expiry reminder.

**Evidence.** `src/gasket/documents.ts`; `src/gasket/zip.ts`; `src/gasket/ui/documents.ts`; `src/gasket/scheduler.ts`; `migrations/core/0052_asset_documents.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### ASSET-004 — Status, criticality and failure taxonomy

target · **done**

Asset states distinguish available, degraded, down, out of service and retired; criticality, risk, failure mode, cause and remedy codes are maintained centrally and mapped on imports. A status change keeps its effective time and reason; manual and telemetry disagreement is visible. The catalog is one site-wide list per kind: criticality is an ordered list of levels (seeded Normal, Important, Critical) that leads add to, reorder, relabel and retire, and risk, failure mode, cause and remedy codes are maintained the same way. A code's key never changes; every record keeps the code it was given, a retired code stays readable on it and is no longer given to new records or matched by imports. An imported value maps onto the active code whose key, label or one of its import names equals it, ignoring case; a value that matches none is refused for criticality and moves in unclassified, with an attention item, for a failure code. Findings carry optional failure mode, cause, remedy and risk codes, and the failure report counts findings and moved-in work by code, lists what is unclassified and names the assets whose evidence disagrees with their declared state. Done covers every importer that exists today (MaintainX criticality and work categories); each later importer (MIG-001 through MIG-008) maps the codes its source carries this way before it ships. **Acceptance evidence:** Take a critical pump down, correct its outage classification and map an imported failure code. Inspect effective status history and unclassified/contradictory evidence in reports without rewriting the original event.

**Evidence.** `src/gasket/states.ts`; `src/gasket/codes.ts`; `src/gasket/assets.ts`; `src/gasket/work.ts`; `src/gasket/movein/maintainx.ts`; `migrations/core/0025_codes.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### ASSET-005 — Meters, units and counter corrections

target · **done**

Meters record source time, receipt time, unit, quality and provenance for counter/gauge/condition readings. Reset, replacement, rollover and corrected readings require an explained append-only adjustment; stale or suspect readings cannot silently fire PMs or reverse counters. Staleness is per meter feed: each meter declares a feed window in whole hours (1 to 168, 24 by default; a daily-cadence feed can declare 36), and a feed reading received more than that window after its source time is stale. Manual readings, attested by the person who took them on a work order, are not aged. A reading keeps the quality it was received with when the window later changes, and creating due work lists the schedules that stale or suspect readings hold back. **Acceptance evidence:** Enter manual readings then a replacement counter and late/corrected feed through public doors. Compare normalized run hours, quality flags and due work, and attempt an unexplained backwards reading.

**Evidence.** `src/gasket/meters.ts`; `src/gasket/schedules.ts`; `src/gasket/work.ts`; `migrations/core/0021_meter_quality.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### ASSET-006 — Bill of materials and interchangeable spares

target · **done**

Each asset/component has a revisioned bill of materials, required quantities, approved substitutes, compatible serial/model ranges and linked tools. Work planning sees stock at eligible storerooms and warns when a substitute is not approved. Exactly: a lead or owner saves an asset's bill of materials as numbered revisions, never rewriting an earlier one (a stale revision number is refused): lines of parts with the quantity a repair needs and an optional serial range the line fits, approved alternate parts per line each with its own optional serial range, and the tools the work needs, named. Serial ranges include both ends and compare in natural order (digit runs as numbers, letters ignoring case); an asset without a serial fits only lines and alternates without a range. The asset page and every work order on the asset show the current revision with each part's and alternate's available stock (PART-002), whether it fits the asset's serial and which lines are short, and earlier revisions stay listed. Reserving (PART-002) accepts an alternate the current revision lists for that line only when it fits the asset's serial, otherwise a site-wide approved substitute, and refuses with a visible reason a part or alternate outside its serial range or a substitute neither approves; that refusal is the warning. Done covers what exists today: one storeroom per site, assets without component parentage, tools as names and serial numbers as the only compatibility attribute; ASSET-001 gives components their own revisions, PART-001 shows stock per eligible storeroom, PLAN-004 links the named tools to its tool register and ASSET-009 adds model ranges once a model field exists, each before it ships. **Acceptance evidence:** Create a motor BOM with two approved bearings and a serial restriction, plan a repair with one out of stock and select a substitute. Inspect compatibility and quantities on the resulting work/parts reservation.

**Evidence.** `src/gasket/bom.ts`; `src/gasket/ui/bom.ts`; `src/gasket/reservations.ts`; `src/gasket/assets.ts`; `src/gasket/work.ts`; `migrations/core/0037_bom.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### ASSET-007 — Asset lifecycle and replacement decision

target · **done**

Leads record purchase, commissioning, warranty, service agreement, replacement value and retirement/disposal with retained service history. A replacement comparison uses actual maintenance cost and downtime; accounting depreciation remains in the connected ledger. Money is US dollars kept in whole cents; purchase and commissioning dates are not in the future and commissioning is not before purchase; a replacement value names its basis; a service agreement has a provider, scope and term (end not before start) and is active from its first to its last day inclusive in the site's calendar. Each lifecycle change is a numbered revision (a stale one is refused) recorded in the asset's history, and a retired asset's facts no longer change. Retiring records the disposal (sold, scrapped, returned, transferred, donated or other, its date and optional proceeds). The comparison's repair cost is the sum of every cost entry (REPORT-005) on the asset's own work orders in any status, unknown (never zero) when there are none; its downtime is the minutes of the asset's ended failure stops by their latest classification (REPORT-003); the repair cost is shown as a percentage of the replacement value to one decimal. The ledger handoff is a CSV of these facts and costs to date with no book value or depreciation. **Acceptance evidence:** Import an older asset, record its purchase and service agreement, compare repair cost with replacement value and retire it. Open its history and export the ledger handoff without deleting prior work.

**Evidence.** `src/gasket/lifecycle.ts`; `src/gasket/assets.ts`; `src/gasket/ui/lifecycle.ts`; `migrations/core/0047_asset_lifecycle.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### ASSET-008 — Inspections, rounds and calibration

target · **done**

Leads publish multi-asset inspection routes and calibration tasks with due tolerances, required tools, certificate attachments and failed-reading follow-up. Each stop records its asset and procedure revision; missed or failed stops stay open independently. A route is an ordered list of at least two stops, each an asset and the checklist done there; issuing it makes a run with one work order per stop, all due the same day and pinned to each checklist's current revision, so a failed reading (FIELD-004) raises its follow-up on that stop alone. A missed stop keeps its reason and stays open; a supervisor (the review right) signs a run off only once every stop is closed, so signing never closes missing work. A route may repeat every N whole days from its first due date (fixed cadence, to a default person): the scheduler (PM-001) and Create due work orders issue one run per occurrence (`route@date`) once its date is within the site's lead time, whatever state earlier runs are in, and a route with a retired stop waits. A route or schedule may name required tools; each work order it issues lists them, and its submission waits until the person doing it records which one was used (a serial or asset number). A calibration task is a schedule on an instrument whose procedure carries the tolerances: its number steps with inclusive limits (FIELD-004), at least one required, so a reading outside them fails and needs a linked finding with follow-up work. Its due tolerance is a grace window of 0 to 90 whole days after the due date, in the site's time zone: the task reads in date before the due date, due through due date + grace, overdue after; its cadence runs from the day its work is approved unless the lead chooses fixed (PM-003). Its work needs a certificate (an attached PDF or image marked as the certificate) before review; approval keeps the latest certificate as the instrument's next certificate version with the procedure revision, the tools used, whether it was on time (approved by due date + grace) and its result: out of tolerance when any number step failed, in tolerance otherwise. That result is Gasket's reading of the recorded values against the procedure's limits; Gasket does not certify the instrument or verify the reference standard's own certification. Earlier versions are kept. A tool register with its own calibration due dates and booking is PLAN-004's, and compliance template libraries, qualification links and audit packs are SAFE-002's, each owed to calibration tasks before it ships. **Acceptance evidence:** Schedule a route across three assets and a gauge calibration, fail one reading and skip one stop. Inspect independent follow-up, calibration certificate/version and incomplete route state; signing a route cannot close missing work.

**Evidence.** `src/gasket/routes.ts`; `src/gasket/calibration.ts`; `src/gasket/tools.ts`; `src/gasket/ui/schedules.ts`; `src/gasket/ui/calibration.ts`; `migrations/core/0049_routes.sql`; `migrations/core/0050_calibration.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### ASSET-009 — Custom asset and part fields

target · **partial**

Leads define typed custom fields on assets, locations and parts (text, number with unit, single or multiple choice, date, yes/no and link), scoped to the organization, a site or an asset or part category, and mark each required or optional with validation. Values show and edit on register pages, the technician app and the QR scan view, and are available in search, filters and saved views (ADMIN-012), automation conditions (PLAN-009), dashboards (REPORT-007), the API (INT-001), imports (MIG-001, MIG-002, MIG-007) and every export. Value changes keep history with actor and time. Renaming a field keeps its values; retiring a field archives its values instead of deleting them. **Acceptance evidence:** Define a required "Refrigerant type" choice field on the HVAC asset category and a "Voltage" number field in volts on parts. Set values through the register and the app, read them back on the page, the QR scan view and the API, filter assets by refrigerant type and export CSV with the values. An invalid choice and a missing required value are refused. Rename one field and retire another, then inspect retained values and history. Import a MaintainX asset export with a custom-field column and see it mapped onto the field.

**Evidence.** `tests/gasket/custom-fields.mjs` customFieldsJourney (registered in `tests/gasket/flows.mjs`): typed text, unit-bearing number, choice, multiple choice, date, yes or no and link values; organization, current-site and category definitions; required and invalid-choice refusal; asset, part and location values through forms and JSON; actor and time history; rename retention and archived values; asset and part custom-field search, saved filters, filtered CSV and MaintainX custom-column preview, apply, replay and edited-value undo refusal. customBrowser: field Settings, register pages, signed-in scan edits, location register and import mapping at 1440 and 390.

**Gap.** Native technician-app values require FIELD-001; additional-site scope requires ADMIN-002. Current organization and site scopes share this installation boundary. Conservative default adopted, awaiting ct approval: active owners and leads define fields and edit values; values are readable only through an already authorized record door and never appear in public intake. Types and applicability are immutable after definition; rename preserves the id and retirement archives values. REPORT-007 and the complete MIG-001, MIG-002 and MIG-007 doors inherit field coverage before shipping.

### Operator requests and follow-through

#### REQ-001 — Web operator request portal

target · **partial**

Operators submit faults from a branded web portal against a selected asset/location with description, urgency, contact and attachments, plus the site's own request fields: administrators configure per-site or per-portal text, choice, number, date and photo fields, mark them required or optional and map them onto the request. The portal shows in the requester's display language (ADMIN-013). ADMIN-013 carries complete catalogs, per-person and organization preferences, signed-out browser/site language selection, locale formatting and visible English fallback for both this portal and REQ-002's QR form before that language door ships; its acceptance journey must exercise both existing intake doors. Until ADMIN-002 adds sites, a portal belongs to the installation's current site. Intake defaults to active signed-in human members; ADMIN-004 inherits requester/contractor identities and their own-request-only access before those identities ship. An owner explicitly audits opening bounded public intake and publishing each opaque target's display name; a public form never lists targets or exposes private asset names, history, costs or request records. Contacts are as given, never verified identities. The adopted conservative default is five new submissions per portal/network/hour and 100 per installation/hour, content-validated PNG or JPEG photos up to 1.5 MB each and five per request, with EXIF and GPS metadata stripped before hashing and storage, and a receipt capability containing only the saved request number. Ct approved these defaults on 23 October 2026 at 08:42Z with riders: limit refusals return explicit errors and are logged without personal data; explicit owner-confirmed erasure removes contacts, photos and details, including copied corrective fault details. Administrators choose authenticated or bounded public intake; anonymous access is rate-limited and cannot enumerate private assets. **Acceptance evidence:** Add a required "Is the line stopped?" choice to one site's form, then submit a noisy-motor fault with a photo through signed-in and public configured intake and see the answer on the request; omit the required field and see refusal. Test invalid asset, file limit and abuse controls, then inspect a persisted request and private-data refusal.

**Evidence.** `tests/gasket/requests.mjs` — requestPortalJourney: configured typed fields, signed-in and opted-in public faults, required answer refusal, persisted answers, invalid target and file bounds, receipt privacy and creator-only access. `tests/gasket/request-privacy.mjs` — photoPrivacy: content-selected PNG and JPEG, metadata stripping, malformed images and photo count refusal; installationLimit: installation ceiling and private-data-free limit logs; erasePrivateRequest: confirmed owner erasure, private data removal and stale retry refusal. requestScreens: settings, queue, detail, erased detail and form at 1440 and 390. `tests/gasket/requests.mjs` — requestTriageJourney: scoped converted photo evidence and converted-detail erasure.

**Gap.** Ct approved defaults and riders on 23 October 2026 at 08:42Z, explicitly retaining PARTIAL. Rider implementation and public-door proof are complete; ct DONE ruling requested. ADMIN-013 inherits portal language; ADMIN-004 inherits future requester identities.

#### REQ-002 — QR mobile fault reporting

target · **partial**

An operator scans an asset QR code to open a phone fault form, in their display language (ADMIN-013), prefilled with allowed asset identity. ADMIN-013 carries this existing form's complete display-language catalog, signed-out selection, locale formatting and visible fallback before its language door ships, and exercises this form in its own acceptance journey. It supports camera evidence and saved drafts with visible submission confirmation; repeated submit and reconnect creates one request. Ct approved explicit device-storage opt-in on 23 October 2026 at 08:42Z: drafts stay on that device, confirmation clears private contents retaining only the receipt, and sign-out clears drafts across open tabs and fences stale saves. **Acceptance evidence:** At 390 width scan the pump label, photograph a leak, lose connectivity before sending and reconnect/retry. Inspect exactly one request, original asset mapping and a durable confirmation.

**Evidence.** `tests/gasket/requests.mjs` — requestDraftJourney: decoded printed QR at 390, camera photo, opted-in device draft, offline send and reopen, lost accepted response and exactly-once retry, original asset mapping and durable confirmation. `tests/gasket/request-draft-privacy.mjs` — draftPrivacy: no storage without opt-in, opt-out deletion, receipt-only confirmed storage, native and API sign-out clearing across scopes, open-tab fencing and no restoration after reload. capture: draft, receipt and cleared form at 1440 and 390.

**Gap.** Ct approved defaults and riders on 23 October 2026 at 08:42Z, explicitly retaining PARTIAL. Rider implementation and public-door proof are complete; ct DONE ruling requested. ADMIN-013 inherits QR form language, preferences and fallback.

#### REQ-003 — Triage, duplicate linking and corrective conversion

target · **done**

Leads triage requests by site, asset criticality, urgency and impact, ask for details, link duplicates, approve/decline with a reason and convert to corrective work without retyping. The original requester, photos and timeline stay linked. Existing leads and owners triage their current installation site, recording production impact (unknown, running, reduced or stopped); ADMIN-002 inherits cross-site queue scoping before additional sites ship. Every decision has a reason and the version seen. Duplicate links stay a one-level group for the same asset or location, retaining every report. Approval permits conversion, not automatic spending or dispatch; conversion uses the original target, description and urgency and is atomic with source links, so retries return the existing work. Questions/replies remain attributed on the request timeline; REQ-004 inherits external requester conversations and delivery before those doors ship. Only planners/reviewers and the work's current assignee/collaborators receive its necessary linked fault/photo evidence; private contacts stay on the creator/lead request door. **Acceptance evidence:** Triage two reports of the same fault, request more details, link one as duplicate and create one corrective order. Open both request timelines and work evidence; reject a third with an explained outcome.

**Evidence.** `tests/gasket/requests.mjs` — requestTriageJourney: current-site queue with criticality/urgency/impact filters; lead asks details and creator replies with retained attribution; independent source timelines, reasoned approval/decline; duplicate self/chain/cross-target refusal, linked reports and originals retained; no-retyping form conversion and retry to one corrective work with both reporters and all photo originals/digests; work evidence scoped to planners/reviewers/assignee/collaborators without private contacts. capture proves queue, approved/converted/duplicate/declined timelines and corrective source evidence at 1440/390. `src/gasket/triage.ts`; `src/gasket/request-sources.ts`; `API.md`.

**Gap.** None.

#### REQ-004 — Requester status and two-way updates

target · **missing**

Requesters see submitted, acknowledged, planned, waiting, resolved or declined status for their own reports and exchange scoped comments/photos. Actual email/push delivery follows configured events; resolution links the completion summary while hiding rates, private notes and other requests. The requester conversation is its own; the team's internal comments on the work order and asset (PLAN-006) never appear in it. REQ-003 currently records attributable questions, replies and decisions on request timelines; this clause inherits their requester conversation/delivery under own-request scope before those external doors ship. **Acceptance evidence:** Submit as an operator, receive acknowledgment, reply with a photo, observe a waiting-on-parts update and then a technician resolution. Inspect mailbox/push edge and portal privacy using another requester, and see none of the work order's internal comments (PLAN-006) in the portal.

**Evidence.** None.

**Gap.** No requester status page, conversation or lifecycle notifications.

#### REQ-005 — Response targets and escalation

target · **done**

Leads define acknowledgment and resolution targets by priority and site calendar, with accountable owners and after-hours rules. Unacknowledged or overdue requests escalate to named people, and paused clocks require an explicit reason rather than disappearing from backlog. Current clocks pin the priority policy, site time zone, weekday hours and holiday snapshot at submission. After-hours policy either counts all elapsed time or only open site hours. Acknowledgment uses the first retained triage decision; resolution ends at linked work closure or an explicit decline, abandonment or duplicate decision. Reasoned pause and resume events exclude only their interval and never hide the request. The existing owner-controlled chase job records one in-app escalation per overdue clock with named ownership, input evidence and grant revision; acknowledgment stops further acknowledgment escalation, while resolution remains independent. PM-005 inherits external delivery and ADMIN-002 inherits additional site scope. Ct ruled: only active owners and leads within triage access can be accountable owners or escalation recipients; inactive accounts and other recipients are denied without additional request data exposure. REQ-008 carries the named gap Escalation to assigned staff and groups, with ADMIN-004 requester groups and ADMIN-002 site scope; ADMIN-003 inherits future role routing. **Acceptance evidence:** Create urgent and routine requests before a site holiday, advance the clock, pause one for access and inspect distinct target clocks, overdue notices and escalation ownership until acknowledged.

**Evidence.** `tests/gasket/requests.mjs` — requestResponseJourney: urgent elapsed and routine business clocks cross a site holiday and weekend; source timestamp reconciliation, distinct targets, reasoned pause and resume without hiding backlog, named accountable owner and in-app recipient, acknowledgment stops its clock while resolution continues, terminal resolution, immutable policy snapshots, replay-safe notices, chase grant pause and catch-up, scoped job evidence, erasure, active-recipient revalidation, refusal of inactive or demoted recipients, no request fields in outbound mail and immediate permission revocation. capture: policy, request queue, acknowledged, resumed and paused details and automation at 1440 and 390. `src/gasket/request-response.ts`; `migrations/core/0084_request_response.sql`.

**Gap.** Ct ruled 25 October 2026: active owners and leads only, within existing triage access; other recipients are denied and no additional request data is exposed. Escalation to assigned staff and groups remains missing under REQ-008, inheriting ADMIN-004 requester groups and ADMIN-002 site scope.

#### REQ-006 — Email and Google Forms intake

target · **missing**

A site inbound email address accepts fault descriptions, attachments and replies with sender validation; Google Forms responses map authorized asset/location fields into requests through a documented connector. Message/response IDs deduplicate repeated deliveries; rejected rows are visible. **Acceptance evidence:** Send an operator email and replay a Google Forms response at the network edge, reply to the acknowledgment and submit an unmappable asset. Inspect one request per source ID, linked reply and actionable rejection.

**Evidence.** None.

**Gap.** No maintenance inbound email or Google Forms connector.

#### REQ-007 — Request reporting and operator adoption

target · **done**

Leads see request volumes, acknowledgment and resolution time, repeat faults, conversion and rejection reasons by site, asset and requester group. Reports link to the exact records and show untriaged and abandoned requests rather than excluding them from response metrics. Current lead and owner triage permission protects the page, JSON and CSV doors. The current installation is the site dimension; ADMIN-002 inherits authorized multi-site report scoping before more sites ship. Requester groups describe signed-in intake, public unverified intake and erased identity; ADMIN-004 inherits future requester groups under its scoped identities. Acknowledgment is the first recorded lead decision on each report; resolution is independent closure of linked corrective work. Declines stay separate from repair resolution. Durations disclose elapsed totals, measured counts, missing counts and all-request counts. Repeat faults are explicit duplicate links; conversion counts reports linked by retained work-created events, with the canonical approval reason. Abandonment is an explicit reasoned triage decision that retains the report, never an inference from waiting time. Erased sources remain counted with unavailable identity and timeline evidence disclosed. REPORT-009 definitions, retained omissions, source links and freshness apply to all these measures. **Acceptance evidence:** Submit, duplicate, decline, convert and leave requests untriaged, then filter and download the request dashboard and compare counts and time denominators with source timestamps.

**Evidence.** `tests/gasket/requests.mjs` — requestReportJourney: submit, duplicate, decline, convert, independently close corrective work, explicitly abandon and leave unanswered and untriaged reports; reconcile volume and elapsed-time totals, measured and all-request denominators to source details and closure timestamps; filter by current site, asset, intake group, status and site-local dates; reconcile CSV rows and timestamps; exact source links, recorded reasons, immutable definitions, stable fingerprint, empty-cohort unknowns, erased-source omissions and immediate role revocation at JSON, page and download doors. capture: report, filtered report, queue entry, triage, abandoned detail and definition at 1440 and 390. `src/gasket/request-report.ts`; `src/gasket/ui/request-report.ts`.

**Gap.** None.

### Work planning and coordination

#### REQ-008 — Escalation to assigned staff and groups

target · **missing**

Extend request escalation beyond the active owner and lead slice to assigned staff and groups within authorized triage access. This missing scope inherits ADMIN-004 requester groups and ADMIN-002 site scope; unauthorized recipients receive no request data.

**Evidence.** None.

**Gap.** No escalation to assigned staff or groups; requires ADMIN-004 requester groups and ADMIN-002 site scope. REQ-005 denies other recipients by default within existing triage access.

#### PLAN-001 — Priority, lifecycle and reusable work templates

target · **done**

Leads plan corrective, emergency and preventive work against an asset or a location with no asset (a restroom door, a dock light) with priority, estimated duration, instructions, due date, custom fields and permissioned custom statuses. Reusable templates and bulk creation preserve stable work numbers and required completion/review rules. Work a technician creates (FIELD-009) follows the same template, required-field, required-evidence and review rules as work a lead creates. A work order names exactly one asset or, with no asset, one location: the text the lead gives, trimmed, up to 160 characters, with the site's known asset and work locations offered; its follow-ups keep the location, and downtime and meter readings, which belong to an asset, are refused on it; preventive work at a location comes from a calendar schedule naming that location, since meters belong to assets. A custom field is text, a number or one of two to thirty listed choices; one marked required needs a value before any work order is submitted for review under its current definition (so it binds open work too, and a retired field never does), and a template may also require fields and photo or document evidence, kept with the work made from that revision. A waiting status (for example Waiting on parts) sits inside the lifecycle on open work and names the roles (lead, maintainer, supervisor; the owner always) that may set or clear it; a maintainer sets one only on work they hold or collaborate on. **Acceptance evidence:** Create urgent corrective work from a template, create location-only work for a dock light, add a required field and custom waiting status, bulk-create selected jobs and try to bypass completion requirements through the API as a lead and as the technician who created the work. Inspect persistent numbers and refusal.

**Evidence.** `src/gasket/work.ts`; `src/gasket/templates.ts`; `src/gasket/ui/templates.ts`; `migrations/core/0042_work_templates.sql`; `migrations/core/0043_location_work.sql`; `src/gasket/work-fields.ts`; `migrations/core/0044_work_fields.sql`; `src/gasket/review.ts`; `tests/gasket/flows.mjs`; `migrations/core/0045_location_schedules.sql`; `src/gasket/schedules.ts`

**Gap.** None.

#### PLAN-002 — Teams, trades and accountable assignments

target · **done**

A work order has an accountable assignee plus collaborators, trade/team and shift. Leads assign/reassign with handoff notes; technicians acknowledge or decline with a blocker and only authorized participants record scoped work. A team is a named group of assignable people (owner, leads, maintainers) with one trade, kept by leads; a work order may name a team, a trade (the team's by default) and a shift label, and when it names a team every assignment door (assign, overdue plan, bulk) gives it only to a member of that team. Every reassignment keeps a handoff (from and to person and shift, an optional note, who and when) and asks the new assignee to acknowledge again. Collaborators are assignable people a lead adds or removes; the assignee and active collaborators record results, readings, evidence, parts, downtime and findings, only the assignee acknowledges, declines, answers chasing and submits, and anyone else is refused. Declining needs a blocker (PM-006's kinds, owner, next action and promised date), returns the work unassigned and gives every active lead (the owners when there is none) an in-app notice; PM-005 adds email and push delivery of it before it ships. Each record names who made it, the work order lists its contributors, and a contributor cannot review it (GAS-09). **Acceptance evidence:** Assign an electrical job to a team and lead technician, add a collaborator and hand over across shifts. Inspect both queues, acknowledgment and recorded contributor; an unrelated technician cannot write.

**Evidence.** `src/gasket/crew.ts`; `src/gasket/work.ts`; `src/gasket/control.ts`; `src/gasket/ui/crew.ts`; `migrations/core/0031_crew.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PLAN-003 — Calendar and workload scheduling

target · **done**

Leads schedule work on day and week calendars with estimated hours, preview when dragging or rescheduling and capacity by person/team/site. Workload conflicts, unassigned jobs, leave and overdue work remain visible; calendar edits do not silently reset PM due policy. Slots are separate from original due dates and estimates: moving or removing a slot leaves the PM occurrence and cadence unchanged. Explicit person windows supply capacity; overlapping absence reduces the denominator. Existing assignment and handoff doors release incompatible bookings when the accountable person changes. **Acceptance evidence:** Schedule five repairs into a 16-hour team window, mark a technician absent and move a job between days. Inspect capacity and conflicts, unassigned work and unchanged PM due evidence on desktop and phone.

**Evidence.** `tests/gasket/planning.mjs` — calendarPlanningJourney: five repairs in a 16-hour team window; person, team and site capacity; absence and person conflicts; unassigned and overdue work; day and week pages; desktop drag preview and phone form confirmation; original PM due date, next due date and cadence unchanged. browserProof at 1440 and 390.

**Gap.** —

#### PLAN-004 — Skills, qualifications and resources

target · **partial**

Planning matches required trades, certifications, availability, tools and reserved parts; expired qualifications or double-booked resources block or require an authorized recorded exception. Utilization separates assigned, productive and unavailable hours. The current planning door matches trades through team membership, dated qualification references, explicit availability, named work and BOM tools linked to the calibrated tool register, and BOM quantities held through parts reservations. It rechecks constraints on confirmation; subsequent absence, expiry and physical stock shortages remain visible as conflicts. Assigned hours are active slots; productive hours are approved wrench time, excluding travel, wait, administrative and legacy unclassified time. Capacity is explicit availability minus overlapping absence, with no inferred workday. Ct approves these supported defaults with riders: only the owner creates, edits or retires qualification records and tool records, including tool identity and calibration facts. Retirement preserves attributed history and prevents retired records from satisfying new requirements. Planning reads, availability edits and resource use require the existing work assignment right and existing record access; they do not grant record-maintenance rights, unrestricted personnel access, private certificate originals, personal identifiers, private contacts, pay rates or unrelated records. Source documents retain their separate access controls. A certification or licence reference is information the owner entered, not verification by Gasket with an issuing body. Every reference display identifies it as “Owner-entered reference — not verified by Gasket with the issuing body,” with recorded dates and calculated expiry distinguished from verification. Gasket does not certify competence, physical safety, trade licensing, legal compliance or employment-law compliance. Qualified people choose applicable standards and authorize physical maintenance and equipment release. A hard block refuses planning confirmation or assignment when a required qualification or tool is missing, expired, unavailable or incompatibly booked. No override is supported. Gap: Broader qualification and tool-record role grants remain required under PLAN-004 and ADMIN-003. Gap: Authorized recorded exceptions remain part of the target and require a separately authorized approver, reason, attributable audit, explicit scope and expiry before shipping. Gap: Automatic qualification expiry and renewal reminders are unproved; existing document expiry reminders remain under ASSET-003 and external notification delivery under PM-005. Qualification data can be personal data. Corrections and retirement preserve attributed prior evidence under ADMIN-006; retirement is not erasure. Retention, legal holds, eligible erasure, anonymized retained audit and prevention of resurrection on restore remain under ADMIN-007 and ADMIN-016. Complete archive and inactive restore coverage remain under ADMIN-009 and GAS-11. Gap: Qualification-specific audit, erasure, retention and restore coverage is unproved by this policy review. SAFE-001 inherits qualification references for qualified sign-offs, prerequisites, expiry and changed-evidence reapproval; SAFE-002 inherits training and qualification links, retained certificates and complete portable compliance audit packs. ADMIN-002 inherits site-scoped access at every door before additional sites ship. ASSET-006 and ASSET-008 retain linked tool-register, calibration, booking and tool-use obligations. All unproved obligations remain named Gaps without reducing the complete target. **Acceptance evidence:** Plan a high-voltage repair for a technician with an expired credential and a shared tool already booked. Resolve both constraints and inspect the schedulable slot and utilization denominator. CT policy ruling, 27 October 2026, reviewed pin 2d16c035c2eff1371d08ef6fd4c5608a55c708a9: APPROVE WITH RIDERS for ordinary owner-confirmed erasure of unused retired qualification families. This resolves the pending policy decision only. PLAN-004 remains partial. An active owner using the ordinary authenticated owner door may explicitly confirm erasure after a dependency preview. Eligibility applies to the whole recorded qualification family, including its corrections and replacements. An active replacement, applicable hold, unmet user or maintenance-record retention minimum, retained safety sign-off or other retained evidence obligation refuses erasure. Apply rechecks current authority, eligibility and the confirmed revision atomically; stale confirmation and conflicting concurrent changes refuse without partial erasure. Successful erasure removes eligible retired qualification details, correction copies and associated reminder content, anonymizes retained qualification audit details, and records durable per-type results. Actor attribution, action, site and time remain attributable; the user account and identity remain. Retirement, expiry and reminder automation never authorize automatic erasure. This qualification slice does not establish user identity erasure or complete maintenance-record erasure. Later archives preserve the erasure result. A later erasure journal fences older archives before publication; restore must preserve the erasure or refuse without publishing resurrected data. Owner-only qualification and tool-record upkeep is an initial authority boundary. PLAN-004 and ADMIN-003 retain explicit, revocable delegation to named active people within authorized sites and records for creation, correction and retirement. Planning access alone grants no record-maintenance, private certificate, erasure, retention or hold-release authority. Owner-entered qualification references remain unverified with issuing bodies. Gasket does not establish competence, physical safety, licensing or legal compliance. Prior recipient copies, independently retained archives and provider-held copies remain outside demonstrated local erasure. Applicable retention decisions remain the owner’s responsibility with qualified advice where needed. Through JSON and form doors, preview and explicitly erase an eligible unused retired qualification family. Assert exact dependency and per-type results, removal of original and corrected reference details and reminder content, preserved actor attribution, and stable retry results. Refuse signed-out and unauthorized callers, stale and unconfirmed requests, active replacements, each applicable hold, each unmet retention minimum and retained safety sign-offs; assert unchanged protected evidence. Exercise competing hold and erasure operations. Inspect a later archive, restore its durable results without resurrection, and refuse an older archive fenced by the later journal. Grant a named person qualification-record maintenance rights within an explicit site and record scope; exercise permitted creation, correction and retirement, refuse operations outside that scope, revoke the grant and refuse further use through existing sessions. The grant supplies no erasure, retention, hold-release or private-document authority. Authorized recorded exceptions remain a separate required journey with a separately authorized approver, reason, attributable audit, explicit scope and expiry. PLAN-004 implementation update, 28 October 2026: under the 27 October ruling, an active owner explicitly grants a named active person creation, correction and retirement of an exact qualification family or named tool within the operational primary site. Every write rechecks the live session, grant, current membership revision and operator generation atomically. Revocation and membership reinstatement cannot revive old authority; archives restore grants inactive. A steward receives only the necessary record facts, without private original references, contacts, unrelated personnel, work planning, reminder consent, erasure, retention or hold-release rights. Qualification erasure also redacts matching scope names and retained grant audit payloads, redacts released qualification-hold reasons and their audit payloads, names active refusal reasons in the preview, removes reminder captures and fences delayed captures using opaque evidence identities. Pre-identity captured inputs are matched to their recorded holder and qualification name. Unattributed older renewal notices prevent erasure until reconciled; their shared identity is never guessed. Authorized recorded exceptions remain absent, and additional operational sites remain owed under ADMIN-002. PLAN-004 remains partial; this update changes no original acceptance point or CT rider.

**Evidence.** `tests/gasket/planning.mjs` — qualificationPlanningJourney: expired high-voltage credential and booked shared tool refused, credential renewal and adjacent slot accepted, trade matching, required BOM reservations and stock shortage, tool calibration expiry, concurrent booking refusal, stale preview and handoff release; calendarPlanningJourney: assigned, approved productive and unavailable minutes with explicit capacity denominator. browserProof at 1440 and 390. Existing reserved-parts and tool-use journeys remain in `tests/gasket/flows.mjs`. `tests/gasket/planning.mjs` qualificationPlanningJourney additionally proves owner-only retirement through JSON and form doors, refusal without authority or current revision, retained snapshots and released bookings, replacement identities, correction and retirement audit, owner-selected in-app expiry and renewal reminders through the real scheduler with pinned dates, pause and resume, deduplication and recipient isolation, provenance and private-reference exclusion from permitted planning reads; browserProof captures owner resources, permitted planning, renewal notices and refused slots at 1440 and 390. External reminder delivery remains PM-005 proof. `tests/gasket/safety.mjs` safetyJourney proves retirement and identical replacement facts require fresh sign-off. `tests/gasket/recovery.mjs` recoveryJourney reconciles retired qualification and tool evidence after empty restore without restoring eligibility. `tests/gasket/safety.mjs` safetyJourney also proves immutable pre-upgrade qualification snapshots survive the actual identity migrations and permit submission, reminder preference changes preserve record identity and sign-offs, and retirement or changed facts still require reapproval. `tests/gasket/planning.mjs` qualificationPlanningJourney proves retained reminder identity, expiry, consent and selected lead window, owner-only execution inputs and outputs, and exact qualification notice health accounting; browserProof submits reminder preferences and retirement at 1440 and 390. `tests/gasket/recovery.mjs` recoveryJourney proves those reminder inputs survive retirement and inactive empty restore.  `tests/gasket/planning.mjs` qualificationPlanningJourney covers confirmed family erasure, correction copies, reminders, holds, retention minima, active replacements, authority refusals and durable results; `tests/gasket/safety.mjs` safetyJourney protects retained sign-offs; `tests/gasket/recovery.mjs` recoveryJourney opens archive bytes, restores durable results and refuses older archives with the later journal.  `tests/gasket/planning.mjs` qualificationPlanningJourney also exercises owner-issued exact record stewardship through JSON, form and browser doors; permitted qualification and tool creation, correction and retirement; scope and privilege refusals; live revocation; membership reinstatement; and anonymized stewardship copies during erasure. `tests/gasket/recovery.mjs` recoveryJourney proves restored stewardship remains inactive.  `tests/gasket/safety.mjs` safetyJourney exercises pre-identity qualification capture erasure after the actual identity upgrade.

**Gap.** Gap: PLAN-004 and ADMIN-003 retain operational multi-site and broader role-template stewardship, plus authorized recorded exceptions with approver, reason, audit, scope and expiry. PLAN-004, ADMIN-007 and ADMIN-016 retain complete copied-data reconciliation, including unattributed older renewal notices, and user identity and full maintenance-record erasure beyond the demonstrated qualification slice. ADMIN-002 retains multi-site authorization. ADMIN-009 retains complete archive reconciliation. SAFE-001 retains qualified sign-offs, prerequisites and changed-evidence reapproval; SAFE-002 retains qualification links, retained certificates and complete audit packs. PM-005 retains external reminder delivery. Issuing-body verification, provider-held copies, legal retention sufficiency and physical-safety approval remain unproved boundaries within PLAN-004, ADMIN-007, ADMIN-016, SAFE-001 and SAFE-002. Policy approval supplies no completion.

#### PLAN-005 — Dependencies and production windows

target · **partial**

Work can depend on predecessor jobs, equipment access, permits, parts and approved production shutdown windows. Planning exposes the critical blockers and coordinates with the buyer's production calendar; moving a window retains the original promise and alerts affected owners. **Acceptance evidence:** Plan a repair after isolation and parts receipt in a production window, move that window from the connected calendar and inspect blocked/ready states and affected owner notices.

**Evidence.** `src/gasket/chasing.ts`; `src/gasket/ui/chasing.ts`; `tests/gasket/flows.mjs`; `tests/gasket/agent-follow-up.mjs`

**Gap.** Owned parts/access blockers, promised dates, missed-promise notices and attributed resolution exist; predecessor/permit/receipt dependencies, enforced ready/blocked planning and connected production-window moves with affected-owner notices remain absent.

#### PLAN-006 — Comments, mentions and shift handoff

target · **done**

Authorized teams use work/asset comments, photos, mentions and handoff summaries with read/unread state and durable notification links. Internal notes stay private from requesters/contractors; edits retain history and resolution does not delete the conversation. Conversations not tied to a record are PLAN-008. Exactly: every member who can read a work order or an asset reads its comments, in the order they were posted; the owner, leads, maintainers and supervisors post them and an agent does not. A comment is text of up to 2,000 characters with up to four photos (PNG, JPEG, WebP or HEIC, up to 1.5 MB each), may be marked a shift handoff summary, and mentions active people chosen when it is posted; each mentioned person gets one in-app notice on the Notices page that links to the comment on its record. Only its author edits a comment and every version stays readable with who and when; no door deletes a comment, so approving, canceling or merging the record keeps its conversation, which can continue. A comment someone else wrote is unread for a person until they open the record's page or mark its thread read through the JSON door; an edit never makes a read comment unread, and a mention notice is unread until its comment is read. Every comment is an internal note. Done covers the identities that exist today (owner, lead, maintainer, supervisor and agent, all internal); requester and contractor access (ADMIN-004) and the requester conversation (REQ-004) keep these comments and their photos from requesters and contractors before they ship. **Acceptance evidence:** Mention the incoming technician on a returning job with a photo and internal cost note, sign in on their phone and follow the notice. Inspect unread state, retained edit history and contractor/requester privacy.

**Evidence.** `src/gasket/comments.ts`; `src/gasket/ui/comments.ts`; `src/gasket/chasing.ts`; `migrations/core/0038_comments.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PLAN-007 — Bulk actions and controlled cancellation

target · **partial**

Leads bulk assign, reschedule or cancel selected work after seeing affected dependencies and PM consequences: until PLAN-005 work dependencies exist, each selected row shows its schedule consequence and open follow-up work, and PLAN-005 adds dependency consequences. Bulk operations through the JSON door (`workorders.bulk`, a preview then per-row outcomes) satisfy the bulk operation itself; bulk selection on the Work page remains a requirement, delivered with the owner-chosen Work table look. Merge, reopen and skip-occurrence live on the work-order and schedules pages. Reopening a returned repair means a reviewed, closed corrective repair whose fault came back reopens to Returned for rework and fresh review; canceled work reopens to Open. Cancellation, reopening and merging duplicate work retain reasons, original evidence and links; partial failures are reported per item and cannot fabricate completed maintenance. **Acceptance evidence:** Select mixed authorized/stale work, preview a bulk reschedule (each row shows its schedule consequence and open follow-up work) and cancel one PM, then reopen a reviewed, closed corrective repair whose fault came back and see it Returned for rework and fresh review, and reopen canceled work to Open. Inspect per-row outcomes, retained evidence and an overdue PM obligation until explicitly resolved. Select several rows on the Work page and apply a bulk action there.

**Evidence.** `src/gasket/control.ts`; `src/gasket/work.ts`; `src/gasket/schedules.ts`; `migrations/core/0019_work_merge.sql`; `tests/gasket/flows.mjs`

**Gap.** Bulk assign, reschedule and cancel with preview and per-row outcomes, reopen, merge and PM skip are served through the JSON door; selecting work in bulk on the Work page is still owed and arrives with the Work table look.

#### PLAN-008 — Team, group and direct messaging

target · **partial**

Members hold one-to-one, ad-hoc group and team conversations plus a site-wide All team conversation in the web workspace and the iOS and Android app, with no Slack or Teams subscription required. Creating a team creates its conversation; joining a team grants it and leaving or removal ends access to every message sent afterwards. Messages carry text, photos, files, record links and mentions, with unread counts, read state, deep links and push/email notices under each person's preferences (PM-005). A person with work-creation rights (technicians by default, ADMIN-003 and FIELD-009) turns a message into a request or corrective work that links back to the message and keeps its photos as original, attributed evidence. Messages written offline queue on the device and send exactly once after reconnecting. Requesters and contractors never see internal conversations. Edits and deletions keep history, owners can apply retention and legal hold (ADMIN-007), and conversations are included in audit export (ADMIN-006) and the portable archive (ADMIN-009). **Acceptance evidence:** Create a team and confirm its conversation appears for current members and for a member added later. Send a one-to-one message and a group message with a photo between a technician's phone and a lead's browser; inspect push delivery at the APNs/FCM edge, deep-link opening and unread/read state. Turn one message into corrective work that links back to the message and keeps the original photo digest. Queue a message offline, reconnect twice and see it delivered once. Remove a member and verify app and API refuse messages sent after removal; a requester and a contractor are refused internal conversations by URL and API.

**Evidence.** `tests/gasket/messages.mjs` messagesJourney: public JSON and form doors prove fixed-pair creation, original text and attribution, stable duplicate and changed-payload retries, independent unread and read state, restart durability, participant-only authority, ended and revoked refusal, planned-site refusal, audit privacy and retained identity dependencies; messagesBrowser proves list, reading and sending at 1440 with screen proof at 1440 and 390. `tests/gasket/recovery.mjs` recoveryJourney: original messages, retry identities and per-person read markers reconcile after empty inactive restore and another Worker restart. The journey is loaded by `tests/gasket/flows.mjs` in Verify; recovery has its required Verify job.

**Gap.** Online operational-primary-site one-to-one text is implemented; PLAN-008 remains partial. Conservative current defaults are active existing human participants only, no owner content-reading bypass, fixed participant pairs, append-only indefinite retention, metadata-only audit and no automatic outbound delivery; adopted under the standing conservative-default rule, with policy approval and broader scoped delegation still open. Missing: team and site-wide All team conversations, ad-hoc groups and join or leave boundaries; photos, files, record links and mentions; message-to-request and corrective-work conversion with original attributed evidence; edits and deletion history; conversation-specific owner retention, legal hold and eligible erasure with complete audit and archive reconciliation. Held: native iOS and Android messaging and deep links, APNs and FCM plus email delivery under preferences, offline queuing and exactly-once reconnect proof on devices; SMS sender qualification and phone-only identities retain ADMIN-004 and ADMIN-014. Requester and contractor identities receive no internal conversation access and remain unbuilt prerequisites. Additional operational sites retain ADMIN-002. No native-device, provider-delivery, complete messaging or legal-retention qualification is claimed.

#### PLAN-009 — No-code automation rules

target · **partial**

Leads build site-scoped rules without code from documented triggers (request submitted, work created or changed status, asset status changed, meter reading recorded, part below minimum, checklist result failed, work overdue) with conditions on asset, location, category, priority, team, custom field and time of day, and actions (route or assign to a team or person, set priority, status or due date, attach a procedure, notify people or a channel, create follow-up work, request approval). Rules are versioned, can be tested against recent records without changing anything, run in a stated order with conflicts shown, are loop-protected and pausable, and record the rule revision on every action. Actions run within the rule owner's rights and can never approve work, approve spend or close a finding. **Acceptance evidence:** Build a rule that routes new requests for Line 2 conveyors to the electrical team at high priority, test it against last week's requests with no changes written, then enable it and submit one matching and one non-matching request. Inspect the assignment, the rule revision in audit and no action on the non-match. Create two rules that would trigger each other and see the loop stopped with a visible error; save a rule whose action approves work and see it refused.

**Evidence.** `tests/gasket/rules.mjs` rulesJourney (registered in `tests/gasket/flows.mjs`): current-site no-code definitions, historical no-write preview across live records and ledgers, matching and non-matching request routing and priority with a custom-field condition, versioned pause and catch-up, deterministic conflicts, visible alternating-rule loop refusal, prohibited approval and destructive actions, current-author revocation and action revision in audit. `tests/gasket/rule-sources.mjs` ruleSourcesJourney: work, state, feed and work reading, failed checklist, stock and overdue source doors; due date, procedure, in-app notice, follow-up and request-approval actions; no access expansion and no replay of partially committed effects. `tests/gasket/rules-browser.mjs` rulesBrowser: form-built routing rule, preview, source request, execution errors and notices at 1440 and 390.

**Gap.** Conservative default adopted, awaiting ct approval: active owners and leads author and control rules; actions recheck the active author and enabled revision, never widen record access, and never approve work, approve spend, close findings or perform destructive or outbound actions. Notifications stay in app; external channels remain unavailable under INT-004 through INT-007. Rules cover the current site only; estate-wide scope requires ADMIN-002. Priority then rule id determines order; first conflicting field action wins. An action failure retains earlier effects and refuses catch-up that would repeat them.

### Preventive maintenance and automatic follow-up

#### PM-001 — Unattended calendar generation

target · **done**

An installation-owned scheduler generates recurring calendar PMs without a person pressing a button, using each site's time zone, lead time and fixed- or completion-based policy. Each due occurrence has a stable identity; restart, overlap and retry create one work order and retain missed-run debt. The scheduler is a Cron Trigger every 15 minutes (UTC), declared for the deployed Worker and run by `rer dev`; each run issues, at the site's time zone, calendar work the site's lead time ahead of its due date (whole days, 0 to 90, 7 by default; the owner sets it on the Site page or through `site.configure`) and counter or trigger work as soon as it is due (PM-002, PM-003). Manual generation uses the same lead time. Gasket keeps one site per installation today, so each installation's site has its own lead time; ADMIN-002 inherits a lead time per site before it ships. An occurrence is its schedule plus its due date (or counter value, or triggering reading); the scheduler never issues an occurrence that already had a work order, so a canceled occurrence stays owed until a person reissues or skips it. Every run is kept; a run more than 45 minutes after the one before records the gap, and calendar work the scheduler issued after its due date is listed as issued late, on the Schedules page and in `scheduler`. **Acceptance evidence:** Save a monthly PM through the schedule door, leave the app, cross its due window and restart the scheduler twice. Open one generated order, its due occurrence and any missed-run warning without invoking manual generation.

**Evidence.** `src/gasket/scheduler.ts`; `src/server.ts`; `src/gasket/schedules.ts`; `wrangler.jsonc`; `deploy.json`; `migrations/core/0028_scheduler.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PM-002 — Automatic meter and condition triggers

target · **done**

Validated manual or integrated counter, gauge and condition readings automatically evaluate thresholds, trend duration and hysteresis. Combined calendar/meter policies state whichever-first or both; repeated/late sensor deliveries do not duplicate work or satisfy a condition with stale data. Every reading a door keeps (a feed reading or one taken on a work order) evaluates the schedules on its meter at once. A gauge trigger fires when good readings stay strictly above (or below) its threshold and a condition trigger when they stay in its chosen conditions, for at least its sustain minutes measured between source times (0: the first such reading); after firing it re-arms only once a later good reading is at or past its reset value (the threshold unless set; for a condition, out of the chosen conditions). Only good readings received after the trigger was set up count, so stale, suspect, moved-in or earlier readings never fire one. A counter is due at its value. A schedule with a calendar and a meter is due on whichever comes first unless it states both. A feed delivery repeating a kept reading (same meter, feed, source time and value) is that reading, not a new one, and a schedule never has more than one open order. Generated work names the reading that raised it. **Acceptance evidence:** Configure counter and sustained-temperature triggers, send fresh, repeated, late and recovered readings through ingest and await generated work. Inspect one order per trigger, source evidence and explicit rejection of stale data.

**Evidence.** `src/gasket/schedules.ts`; `src/gasket/triggers.ts`; `src/gasket/meters.ts`; `src/gasket/actions.ts`; `migrations/core/0027_meter_triggers.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PM-003 — Cadence, seasonal windows and exceptions

target · **done**

Leads choose fixed versus completion cadence, seasonal months, weekdays, holidays, shutdown windows and bounded deferral with a reason. Skipping a task retains the missed obligation and independent risk approval; editing schedules previews already-issued and future work. Due dates are site-local calendar days, so a daylight-saving change never moves one. A calendar schedule may allow only some months and ISO weekdays and, unless it is set to run through them, avoids the site's closures (holidays and shutdown windows, both ends inclusive, kept by leads); a due date on a day it may not fall moves forward to the next allowed day, never earlier. Fixed cadence counts from the planned (nominal) date, so moves never drift it; completion cadence counts from the day the work is approved. A lead asks to skip an overdue occurrence that has no open work, or to defer the current occurrence to a date after it and at most the schedule's deferral limit later (14 days unless set, up to 365), always with a reason; nothing moves until an owner or supervisor other than the person who asked approves it (on a site with one owner and no supervisor, that owner may approve their own request after an explicit second confirmation, and the decision is labeled single-approver), issued work moves with an approved deferral and keeps its checklist revision, and every request and decision stays on record, so a skipped occurrence remains recorded as missed. Editing a calendar schedule's interval, cadence or calendar shows a no-write preview of its issued work (unchanged: due date and checklist revision) and of its next five due dates before and after the change. **Acceptance evidence:** Configure weekday/seasonal PMs across a holiday and daylight-saving change, defer one with approval and edit an interval. Inspect next dates, retained missed work and unchanged issued checklist/due evidence.

**Evidence.** `src/gasket/schedules.ts`; `src/gasket/calendar.ts`; `src/gasket/exceptions.ts`; `migrations/core/0026_pm_calendar.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PM-004 — Failed inspection creates accountable correction

target · **done**

A failed required result automatically creates or links a corrective finding/work order according to a lead-approved rule, carrying failed step, readings, evidence, severity and deadline. A lead-approved rule is one numbered rule per checklist (outcomes, severity, due days) that a lead or owner sets, revised by appending a new number. The correction goes to the inspection's assignee, who must acknowledge it before submitting, and only an independent approval of the correction resolves the original failure; closing the PM cannot hide unresolved corrective work. The notice is in-app: the correction on its assignee's own list and on the board, plus the audit entry; email and APNs/FCM delivery of it belongs to PM-005. **Acceptance evidence:** Fail a required inspection item through mobile/API without manually asking for follow-up, inspect the linked corrective work and its in-app notice (the assignee's list, the board and the audit entry), see submission refused until the assignee acknowledges, complete/review it and verify the originating failure closes only under the checklist's numbered rule and only on an independent approval.

**Evidence.** `src/gasket/corrections.ts`; `src/gasket/work.ts`; `src/gasket/review.ts`; `migrations/core/0020_failure_rules.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PM-005 — Assignee and approver notifications

target · **missing**

Generation, assignment, returned work, review request and due changes enqueue actual email and APNs/FCM mobile push to authorized people with record links. Each event/destination has delivery status, deduplication, per-person channel/event preferences and quiet hours, and escalation when delivery fails; notices render in each recipient's display language (ADMIN-013), and provider acceptance is distinct from human acknowledgment. Owners can mark an escalation mandatory so preferences cannot suppress it. **Acceptance evidence:** Generate and return work, inspect email and mobile push at provider edges, open the deep link and acknowledge. Turn off a technician's email for assignment events while keeping push and set quiet hours, assign work and inspect push delivered, email suppressed with the preference recorded as the reason, and a mandatory escalation still delivered during quiet hours. Induce a delivery failure and retry/restart; inspect visible failure and no duplicated business event.

**Evidence.** None.

**Gap.** In-app maintenance notices exist; assignment/review/due-change email and APNs/FCM delivery, event/destination lifecycle, channel preferences, quiet hours and mandatory escalation remain absent.

#### PM-006 — Overdue escalation and blocker chasing

target · **done**

Rules remind the accountable technician before/after due time, request an acknowledgment/blocker, and escalate to the lead and supervisor on elapsed thresholds or missing response. Parts, access, skill and production blockers have owners and next actions; reassigning needs a lead decision and never resets age. Chasing runs with the scheduler (PM-001) on the site's dates under one lead-approved rule (revisions kept; by default remind one day before the due date, expect a response within one day of the overdue notice, escalate to leads after two days overdue and to supervisors after five): the assignee is reminded the set days before the due date and again once it is overdue and answers on it or blocked; every active lead is notified once the work has been overdue for the lead days or the assignee has not responded within the response days after the overdue notice, and every active supervisor (the owners when there is none) after the supervisor days. A blocker names its kind, owner (any active member, the reporter by default), next action and promised date; a promise not cleared by its date notifies its owner and the leads. Each notice goes once per recipient and occasion and is an in-app notice on the Notices page and the work order; PM-005 adds email and push delivery of these notices before it ships. Overdue age counts from the day the work first became overdue and no reassignment or reschedule resets it. **Acceptance evidence:** Leave urgent PM unacknowledged, advance the clock, report a parts blocker and miss its promised date. Inspect escalating notices, accountable blocker and approved reassignment while the original overdue age remains.

**Evidence.** `src/gasket/chasing.ts`; `src/gasket/scheduler.ts`; `src/gasket/ui/chasing.ts`; `migrations/core/0029_chasing.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PM-007 — PM template rollout and change control

target · **partial**

Leads version preventive strategies across asset classes/sites, preview affected schedules, preserve local overrides and obtain required approval for revised safety/OEM requirements. Rollout never silently rewrites issued work; cancellation and catch-up plans are explicit. Gasket ships a versioned library of ready-made procedure and PM templates for common equipment (air compressors, pumps, electric motors, conveyors, HVAC units, boilers, forklifts, fire extinguishers and backup generators) that leads copy, adapt and approve before use; a copied template keeps a link to its library version. **Acceptance evidence:** Copy the library air-compressor template, adapt and approve it, then publish a revised compressor program to two sites with one local override, review the diff and approve rollout. Inspect future schedules, unchanged issued work and a conflict requiring local decision.

**Evidence.** `tests/gasket/requests.mjs` — strategyRolloutJourney: copy air-compressor library provenance, adapt and independently approve the strategy; preview two current-site compressor schedules, preserve local interval overrides, require a reasoned conflict decision, refuse stale previews and declared interval-bound violations, refuse self-approval by an author with review rights, retain approver and exact rollout digest with both conflict sides, preserve due occurrences and meter triggers, retain explicit cancellation and catch-up plans, retain rollout decisions, leave every issued-work field unchanged and issue the next occurrence with the approved procedure. capture: conflict diff and retained rollout at 1440 and 390. `src/gasket/pm-library.ts`; `src/gasket/pm-strategies.ts`; `src/gasket/ui/pm-strategies.ts`; `migrations/core/0085_pm_strategies.sql`.

**Gap.** Ct ruled 25 October 2026: an owner or supervisor independent of the author explicitly approves the adapted strategy and exact rollout. The atomic rollout approval retains a digest of the source preview, conflict decisions and occurrence plan, with both local and program values. Current-site calendar and meter procedure rollouts preserve issued work, due dates and meter triggers. Explicit plans cancel no issued work and retain due occurrences for ordinary generation. Two-site rollout and complete site scope still require this seed's unbuilt multi-site model (ADMIN-002); calibration strategy rollout remains unbuilt.

#### PM-008 — Scheduler health and automation controls

target · **done**

Owners see last/next run, due-event coverage, paused rules, delivery backlog and per-job errors. They can test a rule without live work/purchases, pause/resume and safely catch up; workers have bounded authority and all automatic actions retain rule revision and input evidence. Exactly: the Automation page and JSON doors show the last scheduler trigger, the next UTC quarter-hour trigger, current calendar/meter due-event coverage and the latest executions. The owner pauses or resumes each current automatic job (PM generation, inspection routes, work chasing and document-expiry reminders) with a reason and numbered grant revision, pauses or enables an individual PM schedule with its revision, and runs catch-up under the revision they saw. Pausing retains due dates, issued work and source records; a last successful job more than 45 minutes ago is visibly missed even while paused. A read-only preview of a PM schedule, paused or enabled, uses the ordinary due evaluator but writes no work, notices, purchasing records, audit or execution rows. Each attempted job records its source (cron, reading or catch-up), grant revision, input facts, start, end and completed, paused or failed outcome; stale catch-up is a retained failure with no work. Automatic work audit entries and notices reference that job and its revision; PM work also keeps its schedule revision and due occurrence or reading, routes keep their stops, chasing its numbered rule, and document reminders their expiry facts. Automatic writes recheck the current unpaused grant in their transaction. The owner cannot use a job name to authorize reviews, spend or unrelated actions. The current notice jobs save in-app notices synchronously; their running and failed job counts are shown, while external email/push delivery is explicitly unavailable, never a zero provider backlog or an invented send. Done covers every automatic capability that exists today (PM-001, PM-002, PM-006, ASSET-003, ASSET-008, PART-005 and BUY-006 vendor follow-up, whose reminder email outcomes are shown): PM-005/INT-004 add actual external delivery backlog and failures, PLAN-009 rules, INT-002 through INT-017 connector jobs and AGENT-001 through AGENT-009 autonomous jobs inherit these preview, control, authority, provenance and health obligations before they ship. **Acceptance evidence:** Test then enable a PM rule, stop its worker across a due slot and inspect a visible missed-run condition. Resume/catch up and inspect one due work order with rule revision; test mode sends no live notification.

**Evidence.** `src/gasket/automation.ts`; `src/gasket/automation-jobs.ts`; `src/gasket/automation-context.ts`; `src/gasket/scheduler.ts`; `src/gasket/ui/automation.ts`; `tests/gasket/automation.mjs`; `tests/gasket/flows.mjs`; `tests/gasket/planning.mjs` qualificationPlanningJourney proves owner-held qualification reminder input and output custody and stored notice totals; `tests/gasket/recovery.mjs` recoveryJourney reconciles retained qualification reminder inputs after inactive restore.

**Gap.** None.

#### PM-009 — Nested and coordinated preventive programs

target · **done**

Leads define nested PM packages so an approved higher-level service can satisfy explicitly mapped lower-level tasks, coordinate linked assets and avoid duplicate downtime. Suppression records the exact task/revision/occurrence evidence and never hides an overdue obligation without the approved equivalent work. Exactly: leads publish numbered, immutable task mappings between higher and lower schedules, including schedules on linked assets, with a reason for the equivalence. Every lower task maps to a higher task of the same type, unit, limits and choices; the mapping pins both procedure revisions and cycles are refused. On the Programs page a lead previews and applies a specific pair of occurrences with the same due day. The higher work must be independently approved and closed; each mapped task needs a passing result or its required photo, never an exception or an unanswered, failed or conditional non-applicable task. The lower work must still be untouched and open. A missing mapped task leaves that occurrence and its due date unchanged. Applying the equivalent records both work versions, procedure revisions, mapping revision, review and original result/photo references, retains the lower work as cancelled with a visible satisfaction link (never as separately performed maintenance), releases its reservations and advances only its schedule by its ordinary cadence. A satisfied occurrence cannot be reopened or applied twice; later mapping or procedure revisions do not rewrite earlier satisfaction evidence. **Acceptance evidence:** Schedule weekly, monthly and annual nested services, complete an annual package with one mapped task missing and inspect lower-level obligations. Only fully evidenced approved equivalents suppress duplicate work; missed steps stay due.

**Evidence.** `src/gasket/nested.ts`; `src/gasket/ui/nested.ts`; `tests/gasket/nested.mjs`; `tests/gasket/flows.mjs`

**Gap.** None.

### Mobile technician execution

#### FIELD-001 — iOS and Android technician app

target · **missing**

Installable iOS and Android apps provide secure sign-in (email link, one-time SMS code for people known only by mobile number under ADMIN-014, Google under ADMIN-015 or organization SSO under ADMIN-005), own/team work, creating new corrective work and logging completed work (FIELD-009), asset scan, manuals, team messaging (PLAN-008) and notifications with deep links, in each person's display language (ADMIN-013). Supported OS/device versions and release/update requirements are published; a browser-only page does not establish native offline or push delivery. The app is a create-work door under FIELD-009 and carries its obligations before it ships: a technician scans an asset QR label (ASSET-002) and creates corrective work with priority, description and a photo, takes it or leaves it unassigned for a lead, and sees it in their own queue and on the lead's board; a template's required field and required photo are refused exactly as at the API; app-created work is recorded with the door `app`; and requesters, contractors and technicians whose create-work right is off are refused. The app's checklists carry FIELD-004 before it ships: typed steps with units and limits, conditional steps, a photo on its step, a supervisor's exception with its reason, and submission blocked exactly as at the API. **Acceptance evidence:** Install release builds on an iPhone and Android phone, sign in one technician by email link and a phone-only technician with a one-time SMS code, scan an asset and create corrective work against it, open an assigned job from push and update the app while retaining authorized drafts. On the app, scan an asset QR label, create corrective work with priority, description and a photo, assign it to yourself and see it in your own queue and on the lead's board; omit a template's required field and photo and see the API's refusal; see the audit record the door `app`; a requester, a contractor and a technician whose site has the create-work right off are refused (FIELD-009).

**Evidence.** None.

**Gap.** No native app packages, supported-device policy or native push/deep links.

#### FIELD-002 — Offline work packs and durable capture

target · **missing**

Technicians download authorized jobs, procedures, asset history, parts availability snapshots and manuals before losing service. Checklist results, readings, notes, photos, signatures, time and part usage persist through airplane mode, app termination and device restart; unsynced state and stale stock are explicit. New work a technician creates offline (FIELD-009) is a durable draft with a device-local identity that syncs exactly once and receives its server work number on reconnect. Work created offline is recorded with the door `sync` (FIELD-009). Offline checklists keep FIELD-004's typed steps: conditions evaluate on the device, a number's outcome comes from its limits, a step photo stays bound to its step through sync, and the server's submission blockers apply on reconnect. Photos, annotations and signatures captured offline keep FIELD-005's phase, capture time, version binding and stale-signature rule, and record the door `sync`. Manuals in an offline pack are the document revisions pinned on the work (ASSET-003), each with its source and who added it, never a later master. **Acceptance evidence:** Download a job, enter airplane mode, record every evidence type, kill/restart the app and reopen the draft. Create a new corrective work order with a photo in airplane mode, restart the device, reconnect twice and see exactly one work order with one server number. Verify all bytes/times survive, stock is labeled a snapshot and the app shows what remains unsynced. The audit records the synced work order's creator and the door `sync` (FIELD-009).

**Evidence.** None.

**Gap.** No offline database, job packs, durable outbox or offline evidence capture.

#### FIELD-003 — Reconnection, conflicts and device revocation

target · **missing**

Reconnect sync is resumable and idempotent with per-record results. Server-side assignment, stock, meter and review versions remain authoritative; conflicting offline changes need a visible resolution and never disappear. Revoked users/devices cannot upload; remote wipe policy and local-data expiry are disclosed. Work created offline whose creator's create-work right or access ended before it syncs is refused at sync with a visible per-record reason that stays on the device and in the lead's view (FIELD-009). **Acceptance evidence:** Two devices edit the same job offline and consume the last part, then reconnect in reverse order and interrupt photo sync. Inspect one accepted movement, visible conflict and retained draft; revoke a device and verify refused upload. Create work in airplane mode, revoke the creator's create-work right before reconnecting, sync, and see the work refused with a visible reason that stays on the device and the lead's view (FIELD-009).

**Evidence.** None.

**Gap.** No offline sync, conflict resolution, device access policy or queued-write revocation.

#### FIELD-004 — Typed checklists and required evidence

target · **done**

Procedures support pass/fail, numbers with limits/units, text, options, required photos, conditional steps and required readings. A failed tolerance links to follow-up; supervisor-controlled exceptions require a reason, and procedure changes keep historical step identities. A step is a check (pass, needs attention or fail), a number with its unit and inclusive limits (either limit may be left open) that passes inside them and fails outside, text, a choice from listed options where the options marked to fail fail, or a required photo (an image attached to that step; a document does not answer it). A step may apply only when an earlier step has a named answer (an option's value, otherwise its outcome); a step that does not apply takes no answer and blocks nothing. A number step may name the asset meter it reads, which must have the same unit; its value is then kept as that meter's manual reading (ASSET-005), so required readings are number steps. Before submission a failed limit needs a linked finding with follow-up work (raised by hand or as a PM-004 correction), and a failed or needs-attention check or option needs a linked finding. A supervisor, meaning anyone with the review right (owner or supervisor) who recorded nothing on the work, may grant an exception on one applicable step with a reason; it is kept unchanged and the step then blocks nothing. Each step has a key: a new revision keeps a step's key when the step keeps its label (ignoring case) or names its earlier key, and issued work keeps the revision it was created with. Today's doors are the web workspace (on a phone browser too) and the JSON API; the native app (FIELD-001) and offline capture (FIELD-002) carry these step kinds, conditions, step photos, exceptions and blocked submission before they ship. **Acceptance evidence:** Publish a checklist with conditional temperature and photo steps, fail a limit and try to submit with missing required evidence through phone and API. Inspect blocked submission, linked finding and retained step revision.

**Evidence.** `src/gasket/steps.ts`; `src/gasket/checklists.ts`; `src/gasket/work.ts`; `src/gasket/review.ts`; `src/gasket/ui/work.ts`; `src/gasket/ui/schedules.ts`; `migrations/core/0048_typed_steps.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### FIELD-005 — Photos, annotations and signatures

target · **done**

Technicians capture timestamped before/after photos, annotate damage, attach documents and collect named technician/customer or supervisor signatures tied to the exact work revision. Original files/digests survive edits and sync; signature capture never claims equipment certification. Exactly: evidence may be marked before or after the work and carry the time it was taken (site local time, never ahead of now) besides its upload time, and records the door it came through (`web` or `api`; offline capture is `sync` under FIELD-002). An annotation is a box, ellipse or arrow placed in percent of a photo's width and height (two decimals) with a note, drawn over the photo where its pixel size is known (PNG, JPEG); the original file and its SHA-256 never change. A technician signature is given by the assignee or a collaborator as themselves (the signed-in member); a customer signature is recorded on that person's session by the name the customer gives, with an optional drawn mark kept with its SHA-256, and is labelled as a name as given, not verified; a supervisor signature is given by a member with the review right who did no work on it, on submitted work, for the version they review. Every signature binds to the work order's version at signing and never changes the work; signing any other version is refused as stale. Any later change to the work makes technician and customer signatures stale, and submission waits until each such signer signs the current version; earlier signatures stay on record as superseded. A signature confirms the work record at that version and is labelled as not an equipment certification. FIELD-002 and FIELD-003 carry offline capture, offline signatures and upload provenance under these same rules before they ship. **Acceptance evidence:** Capture/annotate two photos, obtain a named signature, change the work and submit a stale signature. Download originals and inspect revision binding, required re-signing and offline upload provenance.

**Evidence.** `src/gasket/work.ts`; `src/gasket/annotations.ts`; `src/gasket/signatures.ts`; `src/gasket/ui/evidence.ts`; `migrations/core/0051_signatures.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### FIELD-006 — Wrench time, labor and contractor costs

target · **done**

Technicians start, pause and resume timers and enter corrected time with reasons, distinguishing wrench time, travel, wait and admin by person and work. Overlap and implausible duration need review; authorized labor rates, overtime policy and contractor charges cost work without exposing pay rates to unauthorized roles. **Acceptance evidence:** Record two technicians' timed work and a contractor invoice, cross midnight, correct a timer and attempt overlap. Inspect approved hours and USD costs on work and asset reports, with rates hidden from a requester. Current implementation semantic (ct approved 23 October 2026): the owner manages rates, overtime, invoice capture and time decisions; technicians submit and read their own source entries. Every entry needs a reasoned review, with overlaps and durations over 16 hours flagged. Timers submit separate elapsed segments when paused or stopped; paused gaps contribute no time. Corrections retain the original and replace it only when approved. Approval snapshots the latest authorized rate and splits elapsed time at each site midnight; each day uses its remaining regular-time allowance after other approved time, then the overtime multiplier. A later rate or correction never reprices other approved snapshots. Existing report readers receive aggregate approved time and work costs; person-level cost and pay policy remain owner-only, and audit details contain no pay rate. Overtime is a configurable review policy, not a legal wage calculation; no payroll data is transmitted. ADMIN-002 and ADMIN-003 inherit the same source and rate privacy when site scope and delegated rights ship; FIELD-002 and FIELD-003 inherit retained segments and approval semantics when offline time ships. Original work-minute notes retain author attribution but declare no performer, interval, category or approval; they remain separately disclosed evidence, never guessed person time or pay. REPORT-010 carries approved person time under these privacy rights before it is done.

**Evidence.** Timers, both technicians, four categories, midnight overtime, reasoned corrections, flagged overlap and implausible duration, contractor invoices and hidden rates: `tests/gasket/labor-costs.mjs` (laborJourney). Approved work and asset hours and USD costs: `tests/gasket/work-costing.mjs` (costingJourney). Work forms, timer states, review and owner pay policy at 1440 and 390: `tests/gasket/labor-costs-browser.mjs` (laborBrowser); report screens: `tests/gasket/work-costing-browser.mjs` (costingBrowser). Original work-minute evidence remains in `tests/gasket/work-pdf.mjs` (workPdfJourney); laborJourney and costingJourney retain those notes as disclosed evidence without inventing a performer, approved hours or a rate.

**Gap.** None.

#### FIELD-007 — Crew completion and independent review

target · **done**

Multi-person work records each contributor and required step sign-off, supports blocked/in-progress/returned states and independent supervisor review. Reassignment preserves contributors, so no one who performed any step can approve; material changes require fresh review. Contributors are the assignee and collaborators (PLAN-002); each checklist step keeps who signed it off, and every step needs a result before submission. Work is blocked while it carries an open owned blocker (PM-006) or a waiting status (PLAN-001), and stays in progress meanwhile. Anyone who recorded a step result, reading, part movement, downtime, finding or evidence on the work, whoever holds it now, is refused approval. Every record makes a new revision of the work; submitted work takes no records until it is returned, and an approval names the exact revision it read (an older one is refused as stale). **Acceptance evidence:** Complete a repair with two technicians, reassign to a third, submit and attempt review by each contributor. Require independent approval of the exact final revision and retain the return/rework history.

**Evidence.** `src/gasket/review.ts`; `src/gasket/crew.ts`; `src/gasket/work.ts`; `src/gasket/ui/work.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

#### FIELD-008 — Field usability, print and secure device lifecycle

target · **partial**

Phone execution provides glove-usable controls of at least 48 by 48 CSS pixels with at least 8 pixels between targets, camera/scanner support, accessible instructions and explicit save/sync feedback; printable work packs retain IDs/revisions for controlled later entry. Shared-device sign-out protects cached data, and lost devices can be revoked without deleting server history. **Acceptance evidence:** Use a job at 390 width with long instructions and measure every interactive control at no less than 48 by 48 CSS pixels with 8 pixels spacing, print a pack, re-enter its evidence with provenance, sign out a shared device and revoke another. Inspect cache isolation and intact server records.

**Evidence.** `migrations/core/0106_controlled_print_packs.sql`; `tests/gasket/print-packs.mjs` — printPacksJourney: immutable primary-site non-meter pack issuance and PDF downloads, retained authored instructions after checklist and template master edits, identifying pack and work and checklist revisions on every PDF and native browser-printed page, current human assignment and collaboration with successful collaborator acceptance and removed-collaborator receipt replay refusal, independent English and Spanish pack preferences and labels and errors, original-paper preview and separately declared performance time, atomic results and evidence and correction effects with a durable authenticated-entry receipt and member-bound and action-bound form retries, lost replies and Worker restart without duplicates, stale or foreign packs and changed-payload refusal, revoked and signed-out and ended and reassigned and agent and service and planned-site refusal, normal completion and independent review, retained work and user and paper-original erasure dependencies with ordinary optional attachment erasure preserved. The journey uses the native web and JSON doors and shows the pack, entry preview, receipt and browser print view at 1440 and 390. `tests/gasket/site-access.mjs` — siteAccessJourney: enumerated print reads refuse planned-site selection without returning primary-site identity or shell data. `tests/gasket/recovery.mjs` — recoveryJourney: inactive archive restoration reconciles immutable pack PDF bytes, original paper bytes, results and receipt, excludes source sessions and retains retry identity after another Worker restart.

**Gap.** Operational primary-site online print slice only. Remaining: glove-usable control dimensions and spacing, camera and scanner support and real-phone usability qualification; native iOS and Android execution; offline capture and synchronization and cache isolation; shared-device sign-out and lost-device revocation with device proof; SMS sender qualification under Twilio A2P and APNs and FCM push delivery. Other controlled print and later-entry coverage, including meter readings, stock and labor transactions and paper safety attestations, remains unbuilt; existing server safety, ordinary completion and independent-review gates remain mandatory. Full language and locale coverage and Arabic right-to-left qualification retain ADMIN-013; requester and contractor and phone-only identities retain ADMIN-004 and ADMIN-014; operational multi-site scope retains ADMIN-002. This slice retains immutable paper provenance and refuses erasure with retained dependencies; broader erasure authority and complete estate archive qualification remain unproved. Full FIELD-008 acceptance remains unproved.

#### FIELD-009 — Technician-created and after-the-fact work

target · **done**

Technicians create their own unplanned work from the iOS and Android app (FIELD-001), the web workspace and the JSON API; it is a default right of the technician role (ADMIN-003) that an owner or site admin revokes per site. A technician opens new corrective or emergency work against a scanned asset (ASSET-002), a picked asset or a location with no asset (PLAN-001), with priority, description, photos and an optional template, then assigns it to themselves or leaves it unassigned on the lead's board. They can also record work already done: past start and end times, parts issued (PART-003), a closed downtime (GAS-08) and a checklist from a template. Technician-created work keeps a stable work number and follows the same template, required-field, required-evidence and stock rules as lead-created work (PLAN-001, FIELD-004). It goes to independent supervisor review (GAS-09, FIELD-007), and its creator, like any contributor, cannot approve it. Work created offline (FIELD-002) syncs exactly once; if the creator's create-work right or access ended meanwhile it is refused at sync with a visible per-record reason (FIELD-003, ADMIN-014). Requesters, contractors and roles without the right are refused at every door and use request intake (REQ-001, REQ-002) instead. The creator, the door used (app, web, API or offline sync) and the time are recorded in the audit (ADMIN-006), and technician-created work counts in backlog, MTTR and downtime reporting (REPORT-003, REPORT-005) exactly like other work. Until site admins exist (ADMIN-002/003) the owner turns the right off and on for the site; while it is off every create door refuses a technician, and a follow-up raised by a finding on work they hold (GAS-08) is not technician-created work. The door is recorded as `web` (the workspace's form door) or `api` (the JSON API); FIELD-001 adds `app` and FIELD-002 `sync`. Past start and end are site-local minutes, given together, with start no later than end and end no later than the site's clock; a template's checklist is pinned at the revision current when the work is created. Doors and identities that do not exist yet carry these obligations in their own text and acceptance before they ship: the app and QR scan (FIELD-001, ASSET-002), offline creation with exactly-once sync and refusal at sync (FIELD-002, FIELD-003), per-site revocation across sites (ADMIN-002) and requester and contractor refusal (ADMIN-004). **Acceptance evidence:** (1) On the iOS and Android app, a technician scans an asset QR label and creates corrective work with priority, description and a photo, assigns it to themselves, and sees it in their own queue and on the lead's board. (2) The technician records work already done with a past start and end time, parts issued, a closed downtime and a checklist from a template; it goes to independent supervisor review and the creator's approval is refused. (3) Omit a required template field and required photo evidence on technician-created work through the app and the API and see the same refusal a lead gets. (4) An owner removes the create-work right from the technician role at one site; that site's technicians are refused at the app and the API while technicians at the other site still create work. (5) A requester and a contractor are refused at the same app and API doors. (6) Open the backlog, MTTR and downtime reports and the audit download, and see the technician-created work counted, with its creator and door attributed. (7) Create work in airplane mode, revoke the creator's right before reconnecting, sync, and see the work refused with a visible reason that stays on the device and the lead's view. Point (1), the app half of (3), the second site of (4), the requester and contractor of (5) and point (7) are asserted under FIELD-001, ADMIN-002, ADMIN-004, FIELD-002 and FIELD-003, which carry them.

**Evidence.** `src/gasket/actor.ts`; `src/gasket/site.ts`; `src/gasket/work.ts`; `src/gasket/templates.ts`; `src/gasket/ui/create-work.ts`; `migrations/core/0046_technician_work.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

### Spare parts and storerooms

#### PART-001 — Multi-location stock and bin visibility

target · **partial**

Stores staff see on-hand, reserved, available, on-order and in-transit quantities per site/storeroom/bin with barcode lookup and units. Reorder and issue decisions use available stock; site permissions govern transfers and reads. Stock value and average cost (PART-007) are kept per site, storeroom and bin, and cycle counts (PART-004) are planned and counted by bin. ASSET-002 supplies published bin-location labels today; when this clause adds stock-bin records, their scans must open the authorized stock-bin record without expanding public access. **Acceptance evidence:** Receive the same bearing into two sites and three bins, reserve one quantity and scan a bin. Compare available/on-hand/on-order totals and attempt an unauthorized cross-site read.

**Evidence.** `src/gasket/parts.ts`; `src/gasket/reservations.ts`; `src/gasket/catalogs.ts`; `tests/gasket/flows.mjs`; `tests/gasket/part-catalog.mjs`; `src/gasket/stock-sources.ts`; `src/gasket/ui/labels.ts`; `tests/gasket/receiving.mjs` (receivingJourney: same-part receipt sources across three bins, bin lookup, public-scan isolation and other-site refusal); `tests/gasket/receiving-browser.mjs` (controlledBrowser at 1440 and 390)

**Gap.** Current-site receipt-source quantities are visible for the same part across named bins, with authenticated bin-name lookup and a private stock-source link from published bin labels. Signed-out scans expose no stock and an unknown site is refused. Gap: Complete bin balances require reservation allocation, per-bin valuation, on-order allocation and count reconciliation, including historical unattributed movements. Additional-site scope remains ADMIN-002 and in-transit quantities remain PART-006; PART-001 remains partial.

#### PART-002 — Parts reservations, kits and approved substitution

target · **done**

Planners reserve parts or repair kits to work before dispatch, allocating across bins and approved substitutes. Reservations expire/release on cancellation; competing work cannot reserve the same last unit. Physical issue remains a separate movement. Exactly: a lead or owner approves one part as a substitute for another (that direction only) and can withdraw the approval, and keeps repair kits, each a named fixed set of parts and quantities (a different mix is a new kit). A planner (lead or owner) reserves to open work one part, or every line of a kit at once, each line filled by the part it names or by an approved substitute for it, never an unapproved one; a work order holds at most one open reservation per part, and a kit is reserved whole or not at all. A part's reserved stock is, over its open reservations, what each still needs (its quantity less what its work order has been issued of that part, net of returns, never below zero), and available is on hand less reserved; a reservation is refused unless every part it touches stays at or above zero available, checked in the same atomic write, so competing work cannot reserve the same last unit, and issuing to work never takes stock reserved for other work. A physical count can still leave a part short, shown as negative available. A reservation ends, kept with who ended it, when and why, when a planner releases it with a reason or when its work order is canceled, merged into another or approved and closed; reservations do not lapse by time. Reserving never moves stock: on hand changes only by receipt, issue, return and count. Gasket keeps one shelf location per part and one site today; PART-001 allocates reservations across bins and storerooms and ADMIN-002 across sites before they ship. **Acceptance evidence:** Reserve a repair kit to two competing work orders, substitute an approved part and cancel one order. Inspect exact available stock, released reservation and unchanged physical on-hand until issue.

**Evidence.** `src/gasket/reservations.ts`; `src/gasket/parts.ts`; `src/gasket/work.ts`; `src/gasket/control.ts`; `src/gasket/review.ts`; `src/gasket/ui/parts.ts`; `src/gasket/ui/work.ts`; `migrations/core/0035_reservations.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PART-003 — Controlled issues, returns and traceability

target · **done**

Issues/returns identify work, asset, person, bin, quantity and effective time; lot/serial/expiry tracking is available for controlled spares. Returns preserve original issue value, quarantine damaged items and never exceed holdings; a damaged work return credits the work at its retained issue value and records an equal, separate quarantine adjustment, excluded from usable stock and available value until disposition. A reason is required and the current return form defaults to usable; offline conflicts require explicit resolution. Expiring lots appear in the stores report (PART-009). The current web and JSON doors require an explicit receipt source and stable request identity for controlled issues; a serial is one whole unit. Recorded expiry permits issue through that site-local date and refuses later dates. Usable returns and inspected releases retain their source. Historical unattributed issues and count variances refuse affected controlled stock pending bin reconciliation under PART-001. FIELD-002 inherits offline reconciliation. **Acceptance evidence:** Issue a serialized spare from a named bin, return one damaged item and attempt an excess return/replayed offline issue. Inspect linked movements, quarantine quantity, original valuation and duplicate refusal.

**Evidence.** `src/gasket/parts.ts`; `src/gasket/work.ts`; `src/gasket/receiving.ts`; `src/gasket/valuation.ts`; `migrations/core/0071_work_return_quarantine.sql`; `migrations/core/0078_work_quarantine_disposition.sql`; `tests/gasket/flows.mjs`; `tests/gasket/receiving.mjs`; `tests/gasket/work-returns.mjs` (workReturnsJourney: damaged and usable returns, exact disposition value, excess and replay refusal, concurrent disposition, authority, reconciliation, archive and canonical merge; browserDisposition: owner form at 1440 and 390); `src/gasket/stock-sources.ts`; `migrations/core/0092_controlled_stock.sql`; `tests/gasket/receiving.mjs` (receivingJourney: selected serial, expiry, replay and concurrent exhaustion, source-bound returns, inspected release, bin lookup, unauthorized reads and count refusal; standalone entry: Archive retains source identities, expiry, controlled movements and disposition links); `tests/gasket/receiving-browser.mjs` (controlledBrowser: issue form, bin scan, source stock, stores expiry and receiving at 1440 and 390)

**Gap.** Controlled receipt sources now support bin, lot, serial and expiry selection, atomic source limits, replay refusal, linked usable and damaged returns, inspected source restoration and expiring lots in the stores report. Ct approved owner-only confirmed disposition on 23 October 2026 at 13:37Z. Historical unattributed issues and count variances refuse affected controlled stock rather than inventing a source. PART-001 inherits complete bin reconciliation, and FIELD-002 inherits offline reconciliation before those doors ship, as scoped in the approved campaign brief.

#### PART-004 — Cycle counts and inventory adjustments

target · **done**

Stores staff plan blind counts by bin, freeze or reconcile concurrent movements and submit variances for configured independent approval. Each approved adjustment appends an attributed movement; lost, found and damaged stock have reason codes and cost effect. Exactly: a lead or the owner plans a count of one shelf location's parts and/or chosen parts for one counter (an active owner, lead or maintainer); the count sheet never shows its counter the expected quantity while the count is open (the parts register still shows on-hand to its readers). Gasket reconciles rather than freezes: a count stands for the shelf at the moment it is submitted, each line keeps the on-hand and movement sequence then, and its variance is counted minus that expected quantity, posted onto whatever is on hand when it posts, so movements during and after the count are kept, never undone. A shortage needs the reason lost or damaged and an overage found; a matched line needs none. Each posted variance is valued by PART-007 at the stock's average when it posts. The owner sets the approval threshold in USD: variances valued at or above it ($0.00, the default, means every variance) wait for a lead or the owner who did not count them, and smaller ones post at submission as the counter's movement. Approval is refused as stale once another count of that part has posted after the line was counted, and refused when posting would leave on-hand below zero; a rejection needs a reason and posts nothing. Each posted adjustment is a count movement attributed to the person who posted it, carrying its reason, value and count number, and is in the audit (ADMIN-006) and the period reconciliation (PART-007). Until stores roles exist (ADMIN-003) leads and the owner act for stores staff and the stores supervisor. Direct physical counts (GAS-03) stay as published. Done covers what exists today: one storeroom per site with shelf locations as text; PART-001 adds bins and bin counts, and ADMIN-003's storeroom clerk and stores supervisor inherit counting and independent approval, each before it ships. **Acceptance evidence:** Count a bin while another technician issues one unit, submit a variance and approve as the stores supervisor. Inspect reconciled expected balance, stale-count refusal and auditable quantity/value adjustments.

**Evidence.** `src/gasket/counts.ts`; `src/gasket/ui/counts.ts`; `src/gasket/valuation.ts`; `src/gasket/parts.ts`; `migrations/core/0054_cycle_counts.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PART-005 — Reorder points, lead time and automatic replenishment

target · **done**

Leads set minimum/maximum, reorder quantity, safety stock, vendor and lead time per location. Crossing available-stock thresholds alerts stores, drafts a deduplicated requisition/PO and follows it until receipt; automatic ordering only uses a separately approved vendor/spend envelope. Open replenishment documents and their age appear in the stores report (PART-009). Exactly: until PART-001 and ADMIN-002 add bins and sites, each part has one recorded stock location, and leads and the owner maintain immutable numbered policies for that location: minimum, maximum, reorder quantity, safety stock, active vendor, cost center, accountable active owner purchaser, calendar lead days and human-entered USD unit price, freight, sales/use tax and tax note. Available is on-hand less outstanding reservations; at or below minimum plus safety stock the quarter-hour worker drafts the larger of maximum minus available and reorder quantity, less outstanding linked deliveries, never below zero, with one open document per part. Read-only preview creates no purchases, notices, audit or execution rows. The draft pins its policy revision and creates an attributed in-app notice for the owner and leads; the notice is labelled stored in-app, with no external alert claimed. PM-005 inherits external email/push delivery before shipping it. Open documents show age as elapsed whole 24-hour days, exact remaining delivery and quarantine quantities, remaining stock shortage against maximum, and a due day equal to opening site-local day plus lead days; due on or before today prompts retained stores follow-up. Receipts and returns use BUY-004: quarantine is delivered but unavailable, and supplier returns reopen replacement shortage. Repeated workers neither duplicate the open document nor the same follow-up occasion. A buyer-edited PO revision is flagged for review rather than guessed to buy the same part. Automatic sending requires a separate immutable vendor/cost-center envelope proposed by the owner and explicitly approved by a different active owner or supervisor, never the policy author, envelope author, PO initiator or revision author. Its inclusive site-local period and per-order/period USD ceilings apply in addition to BUY-003 budgets; a claim consumes its amount even after uncertain or rejected submission, with no automatic retry or refund. The linked immutable PO vendor and cost center must match the current policy and envelope. Automatic sending also needs live BUY-003 threshold authority with no manual steps or emergency decision; otherwise the draft waits for ordinary independent purchasing decisions. Envelope ceilings and consumed USD amounts are visible only to the owner and supervisors with the review right, including in worker-history inputs; leads read vendor, cost center, dates and approval state and select an approved envelope by id without those amounts. Policy unit costs retain BUY-001/002 visibility. Revoking the envelope or ending its independent approver's authority stops new claims while retaining open orders. The owner pauses, previews, resumes and catches up under PM-008, and every automatic record keeps the worker job, grant revision and source facts; REPORT-009 defines the new measures and source doors. **Acceptance evidence:** Consume below minimum, run the replenishment worker twice, inspect one draft and delivered notice, approve within a spend envelope and receive a partial delivery. Inspect remaining shortage and due-date follow-up.

**Evidence.** `src/gasket/replenishment.ts`; `src/gasket/replenishment-policy.ts`; `src/gasket/replenishment-state.ts`; `src/gasket/replenishment-purchasing.ts`; `src/gasket/ui/replenishment.ts`; `src/gasket/replenishment-metrics.ts`; `migrations/core/0062_replenishment.sql`; `tests/gasket/replenishment.mjs`; `tests/gasket/replenishment-browser.mjs`; `tests/gasket/replenishment-archive.mjs`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PART-006 — Inter-site transfers and stock reconciliation

target · **missing**

Stores can request, approve, dispatch and receive transfers with in-transit custody and partial/lost quantities. Sender and receiver rights are separate; network replay never moves stock twice and count reports reconcile source, transit and destination. Open transfers and their age appear in the stores report (PART-009). **Acceptance evidence:** Transfer ten seals between sites, receive eight and mark two lost after approval, then replay delivery confirmation. Inspect source/destination/transit movements and variance cost without a second receipt.

**Evidence.** None.

**Gap.** No multi-site transfer, transit custody or partial-transfer reconciliation.

#### PART-007 — Inventory valuation and transaction history

target · **done**

Parts retain purchase price, landed freight/tax allocation and a disclosed moving-average or FIFO policy. Work consumption snapshots its cost; later price changes and returns do not rewrite old asset cost. Owners can reconcile opening, movement and closing quantity/value. Exactly: Gasket's disclosed policy is moving-average cost, kept in whole US cents, and every stock movement keeps its own signed value beside its quantity, so stock value is the sum of movement values and no later event rewrites one. A receipt is valued at its unit price times its quantity, rounded half up to a cent, plus the freight and sales tax entered on that receipt, landed wholly on its part; a receipt without a unit price takes the part's current vendor price, and with neither it is unpriced. An issue takes the stock's average (stock value times quantity over on-hand, rounded half up; the last unit out takes exactly what is left). A return credits the work order's own issued value for that part in the same proportion, never today's average, so a work order's parts cost is what its issues were taken at less what its returns credited. A count variance is valued at the average, or with nothing on hand at the latest priced receipt's landed unit cost, else $0.00. Setting or changing a part's vendor price (leads and the owner) revalues no stock and no work. The period reconciliation (JSON and CSV) covers site-local dates from and to, both included: per part, opening (every movement before the start of the first day), received, issued, returned, count adjustment and closing quantity and value, the average unit cost and the number of unpriced movements, with a total row; it is downloaded by the owner and by the leads and supervisors who download asset history and the ledger handoff (ASSET-007). Work orders show each part's consumed cost and the asset history shows each issue's and return's value. Movements recorded before valuation existed and moved-in opening stock carry no value and are counted as unpriced, never as a cost. Done covers what exists today (one storeroom per site and single-part receipts): PART-001 values stock per storeroom and bin, BUY-004 allocates one delivery's freight and tax across its lines before landing them, MIG-001 moves opening stock in with its source unit cost, and REPORT-001 carries these consumed and returned part values into work, asset, parent and site actual costs, each before it ships. **Acceptance evidence:** Receive two differently priced lots with freight and sales tax, issue/return units and change the vendor price. Download a period reconciliation and verify exact USD valuation and immutable historic work cost.

**Evidence.** `src/gasket/valuation.ts`; `src/gasket/parts.ts`; `src/gasket/work.ts`; `src/gasket/history.ts`; `src/gasket/ui/parts.ts`; `src/gasket/ui/work.ts`; `migrations/core/0053_part_valuation.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PART-008 — Supplier catalogs and duplicate part control

target · **done**

Parts support manufacturer/vendor numbers, unit packs/conversions, preferred and alternative suppliers, approved equivalences, photos and catalog prices. Proposed duplicate merges show all dependencies and preserve aliases/movements under an approved canonical item. Catalog CSVs name a stocking unit and the stocking quantity in one supplier pack; pack receipts multiply exact three-decimal quantities and refuse a result beyond three decimals, with USD extended pack prices rounded half up to cents. A repeated manufacturer number proposes a duplicate, never merges automatically. A lead or owner previews and approves a canonical item in the same stocking unit with a reason and the fingerprint of its dependencies; a changed preview, unfinished physical count or contradictory current BOM serial range is refused. A shelf count observed before a merge is stale even if the latest movement sequence is unchanged. Original part identities, movement quantities and values, receipts, kit and BOM revisions, aliases and photos remain retained; lookup of either old number opens the canonical item, whose balance combines their movements. The chosen canonical item supplies its shelf, minimum and current replenishment policy; source policies remain historical and all existing purchase documents still count against further replenishment. Catalog imports require a no-write review and exact source fingerprint, replay idempotently and retain source bytes, digest and attribution; undo removes only their changes and refuses later dependencies. **Acceptance evidence:** Import two supplier catalogs with each/box quantities and duplicate manufacturer numbers, preview and approve a merge, then scan either old number. Inspect correct conversion, compatibility and complete movement history.

**Evidence.** `src/gasket/catalogs.ts`; `src/gasket/catalog-import.ts`; `src/gasket/catalog-snapshot.ts`; `src/gasket/part-merge.ts`; `src/gasket/part-identity.ts`; `src/gasket/part-photos.ts`; `src/gasket/ui/part-catalog.ts`; `src/gasket/ui/catalog-preview.ts`; `src/gasket/ui/part-merge.ts`; `tests/gasket/part-catalog.mjs`; `tests/gasket/part-catalog-browser.mjs`; `tests/gasket/flows.mjs`

**Gap.** None.

#### PART-009 — Stock performance and inventory history

target · **done**

Stores report stockouts, demand by asset/work, slow/dead stock, turns, count accuracy, expiring lots and open replenishment/transfer age. Every number drills to movements and separates historical imports from current balances. Exactly: the stores report (page, JSON and a source-movements CSV) is read by leads, supervisors and the owner over site-local dates from and to, both included (the last 90 days by default), and names its site. Stocked parts are those with stock on hand at some point in the period; a stockout is a movement in the period that leaves a stocked part with nothing on hand, each event naming that movement and its work order, and the stockout share is parts with a stockout over stocked parts; parts out of stock at the period's end are listed. Demand is issues less returns in the period, by quantity and the value PART-007 kept on them, per work order and per asset, with open reservations as committed demand. Slow stock is on hand at the period's end with no issue in the period; dead stock is on hand then with no issue in the 365 days ending then. Turns are issued less returned value over the average of opening and closing stock value, which are the PART-007 reconciliation's totals for the same period (two decimals, not annualized, none at a $0.00 average). Count accuracy is direct counts (GAS-03) and planned count lines (PART-004) in the period that found exactly the expected quantity, per part and in total. Opening stock moved in from MaintainX is listed apart from native receipts (part of balances, never of demand), every movement in the download is marked native or moved in, and moved-in work history costs stay in asset history, outside demand. Percentages have one decimal, rounded half up. Done covers what exists today (one site, replenishment documents, no controlled expiring lots or transfers): PART-003 adds expiring lots, PART-006 open transfer age and ADMIN-002 the site filter across sites, each to this report before it ships. **Acceptance evidence:** Receive, reserve, issue, count and age spare stock, then filter the stores dashboard by site and download source movements. Reconcile stockout and inventory value denominators with the same period.

**Evidence.** `src/gasket/stores.ts`; `src/gasket/ui/stores.ts`; `src/gasket/valuation.ts`; `src/gasket/counts.ts`; `tests/gasket/flows.mjs`

**Gap.** None.

### Maintenance purchasing and external work

#### BUY-001 — Vendor records and maintenance requisitions

target · **done**

Buyers manage US supplier contacts, ship-to addresses, tax treatment, payment terms, lead times, catalogs and active status. Technicians/planners request parts, services or repairs linked to work/asset/cost center, with an accountable purchaser and visible approval state. Exactly: until ADMIN-003 supplies the buyer role, the owner acts as buyer and manages suppliers, catalog entries and cost centers; the owner, leads and maintainers submit requisitions, and existing internal members read the purchasing queue and supplier records. A supplier keeps its named contact, email and phone, US ship-to street/city/state/ZIP, recorded sales-tax, buyer use-tax or exemption treatment (an exemption needs its basis), payment terms, lead time in whole calendar days and active status. Catalog SKUs name a part, service or external repair, its unit and an optional quoted USD price in whole cents; an unknown price stays unknown. Supplier edits use numbered revisions and keep attributed before/after facts in audit. A requisition names an active supplier, active cost center and active owner as accountable purchaser, has part/service/repair lines with positive quantities exact to three decimals, and may link work, an asset, or both (then the work must belong to that asset); work supplies its asset when no asset is given. It keeps the supplier facts it requested against and shows Pending approval: it neither authorizes spend, sends an order nor receives stock. Disabling a supplier refuses new requisitions while retaining earlier ones. Done covers the current single site, roles and requisition door: ADMIN-002 adds site scope, ADMIN-003 buyer and purchasing rights, BUY-002 orders, BUY-003 independent spend approval and BUY-007 new external repair work, each inheriting active-supplier refusal for new purchasing before it ships. **Acceptance evidence:** Create a supplier and a technician requisition for bearings plus contractor labor, link the asset and cost center, and inspect the buyer queue. Disable the supplier and try to place new work against it.

**Evidence.** `src/gasket/suppliers.ts`; `src/gasket/requisitions.ts`; `src/gasket/ui/purchasing.ts`; `tests/gasket/purchasing.mjs`; `tests/gasket/flows.mjs`

**Gap.** None.

#### BUY-002 — Quotes and numbered purchase orders

target · **done**

Buyers compare vendor quotations and draft sequentially numbered POs with quantities, units, USD prices, freight, US sales/use-tax fields, delivery dates, work/asset links and attachments. Sending records the exact approved revision and vendor acknowledgment separately. Exactly: until ADMIN-003 provides the buyer role, the owner acts as buyer and existing internal members read quotes, orders and original attachments. Buyers record immutable supplier quotations and select among compared quotes with a reason, then save an order with a sequential PO number; every edit creates a new numbered immutable revision and invalidates any earlier approval for the new revision. Quantities are exact to three decimal places, USD unit prices are whole cents, each extended line rounds half up to a cent, and vendor payable is the sum of extended lines, freight and recorded sales tax; buyer use tax is shown separately and included in the disclosed commitment, never added to vendor payable. Tax treatment and exemption basis are human-entered, never a tax determination. A supervisor or a different owner approves the exact revision, never its initiator or revision author. With no eligible independent approver the PO page states that it is blocked and directs the owner to People and access to invite a supervisor; it offers no self-approval exception. BUY-003 adds budgets, multi-step limits, delegation and emergency override to this independent revision approval before it ships, including a threshold policy that may permit small orders to skip manual approval. The buyer submits the approved immutable snapshot and its attachments to its recorded vendor email through installation mail; one claimed send is retained per revision, including after a crash or uncertain result, and no replay automatically sends it again. Provider acceptance is labelled mailbox delivery unconfirmed; local development suppression says no vendor email was sent, and refusal or uncertainty remains visible. Vendor acknowledgment is a separately buyer-recorded contact, reference and note, labelled not independently verified, never inferred from provider acceptance. Disabling the supplier refuses new drafts, approvals and sends while retaining old versions, approvals, submission outcomes and acknowledgments. **Acceptance evidence:** Compare two quotes, draft a mixed parts/service PO, approve and send through vendor email, then revise quantity. Inspect numbered versions, totals, linked work and the requirement to reapprove changed spend.

**Evidence.** `src/gasket/quotes.ts`; `src/gasket/purchase-orders.ts`; `src/gasket/ui/purchase-orders.ts`; `tests/gasket/purchase-orders.mjs`; `tests/gasket/flows.mjs`

**Gap.** None.

#### BUY-003 — Spend approval and purchasing separation

target · **done**

Owners define per-site/cost-center budgets, dollar approval limits and multi-step approval/delegation. An initiator cannot approve their own purchase; currency, line or vendor changes invalidate approval. Emergency overrides require named authority and remain reportable. This clause extends BUY-002's exact-revision independent approval, invalidation on every edit and immutable send history with its budget, multi-step, delegation and emergency controls before it ships, including approval thresholds that may permit small POs to skip manual approval. Exactly: until ADMIN-002 and ADMIN-003 add multiple sites and purchasing roles, the owner manages one site's policies and dated delegations, and active owners and supervisors supply independent decisions. A current immutable policy revision defines a USD budget for inclusive site-local dates, for the whole site or one cost center; both scopes apply together, and periods cannot overlap within one scope. The original authorization day books a commitment (threshold authorization books at send), never the promised delivery day. Required steps are the named active owner/supervisor at each threshold at or below the commitment, ordered by dollars, then site before cost center, then entered position; each earlier step must be approved first. A zero threshold asks for manual approval on every amount. Below every configured threshold, the policy supplies authority without manual approval, honestly labelled; with no policy, BUY-002's independent approval still applies. Delegation has inclusive dates, a reason and immutable versions: its delegate acts in place of its named principal, both must retain eligible roles and neither may be the initiator or current revision author. Each decision pins its policy step, delegation revision and exact PO revision, and policy or delegation changes are re-evaluated before later decisions and sending. Currency other than USD is refused without changing the order; line or vendor edits create a new revision needing authority again. Atomic budget checks count each approved current revision once and every sent historic revision until an independent reviewer explicitly confirms its release with a reason; an unsent superseded revision ceases to be an obligation. Neither competing completions nor send can exceed a ceiling without a separately confirmed independent emergency decision naming its authority, reason and projected budget impact. Releases and overrides remain in attributed reports and audit, and never assert receipt, supplier agreement, bill, posted actual cost or payment. Missing independent authority blocks with a page explaining how the owner adds a supervisor or changes its named policy/delegation. Existing internal members retain PO/history access with step names, status, delegates and outcomes; budget values and the override report require the owner or supervisor review right, and editing policies/delegations is owner-only. The versioned measure registry and source-linked report follow REPORT-009, including visible excluded/released obligations and unapproved drafts. ADMIN-002 adds site scoping, ADMIN-003 its buyer/approver grants, BUY-004 and BUY-005 actual receipts/bills and BUY-006 automatic-order limits before they ship; none changes this commitment into an invented actual. **Acceptance evidence:** Submit a $4,500 PO across two approval limits, attempt self-approval, delegate during leave and change a line after approval. Inspect correct routing, renewed approval and separately reported emergency override.

**Evidence.** `src/gasket/purchase-policy.ts`; `src/gasket/purchase-authority.ts`; `src/gasket/purchase-orders.ts`; `src/gasket/purchase-report.ts`; `src/gasket/purchase-metrics.ts`; `src/gasket/ui/spend-policy.ts`; `src/gasket/ui/purchase-approval.ts`; `migrations/core/0060_spend_policy.sql`; `tests/gasket/spend.mjs` (BUY-003, also run by `tests/gasket/flows.mjs`)

**Gap.** None.

#### BUY-004 — Partial receiving, inspection and returns

target · **done**

Stores match deliveries to approved PO lines, receive partially by bin/lot/serial, inspect/quarantine damaged goods and record backorders or supplier returns. Duplicate receipt identities do not add stock twice; remaining quantities stay open and receipts carry evidence. A delivery's freight and sales tax are allocated across its lines by line value before each line lands at its valued cost (PART-007). Exactly: until ADMIN-003 supplies stores roles, leads and the owner receive and inspect; existing internal members read receipts and original evidence. Each delivery pins an approved immutable PO revision; a superseded revision may receive only after a retained send submission, and an unsent current revision must still have live authority. Part lines match an existing part in the same recorded unit; conversions are not inferred. A delivery may split a PO line across named bins, lots and individual serials; a serial identifies exactly one unit and is unique for that part. Delivered quantities are exact to three decimals and cannot exceed ordered quantity less prior deliveries plus supplier returns. Quarantine is delivered but excluded from usable stock and stock value until released after inspection. Attributed inspection events release held quarantine or return held quarantine or available usable goods to the supplier, with quantity and reason; returns reopen outstanding replacement quantities. Usable supplier returns remove current moving-average value as negative receipts, while quarantine returns remove only the held value; neither asserts a supplier credit, bill or payment. Each delivery keeps a supplier-scoped receipt identity: an identical replay returns the retained receipt, and a changed payload under that identity is refused. Original packing-slip bytes and SHA-256 remain downloadable behind sign-in. USD extended delivery lines round half up to a cent; freight and sales tax use largest-remainder allocation by delivered line value (ties by PO line position), then quantity splits within a line, and all allocated cents reconcile. A zero-value delivery cannot absorb nonzero charges. Quarantine takes its proportional landed value rounded half up, with the remainder retained on usable stock; releases exhaust the exact held remainder. The receiving page and JSON door show each revision's delivered, usable, quarantined, returned and outstanding quantities and retained backorder notes, with source-linked versioned definitions under REPORT-009. PART-001 carries bin-level stock, reservations and counts, PART-003 downstream controlled issues/expiry, and ADMIN-002 cross-site receiving scope before those capabilities ship. **Acceptance evidence:** Receive six of ten ordered parts, quarantine one, upload the packing slip and replay the receipt ID. Inspect five usable units, remaining order, quarantine/return movement and no duplicate quantity.

**Evidence.** `src/gasket/receiving.ts`; `src/gasket/receipt-stock.ts`; `src/gasket/ui/receiving.ts`; `src/gasket/receiving-metrics.ts`; `migrations/core/0061_receiving.sql`; `tests/gasket/receiving.mjs`; `tests/gasket/receiving-browser.mjs`; `tests/gasket/flows.mjs`

**Gap.** None.

#### BUY-005 — Bills, match exceptions and financial handoff

target · **missing**

Each received/partially received delivery can create a linked supplier bill. Buyers reconcile PO, receipt and bill quantity/price/tax, track credits and send approved bills/cost allocation to accounting. Payment status returns from the ledger; Gasket does not itself become a bank or general ledger. **Acceptance evidence:** Record two deliveries and bills, introduce a price/quantity mismatch, resolve under authorized tolerance and sync to QuickBooks Online. Replay and reverse a receipt; inspect one ledger bill per approved source and retained credit linkage.

**Evidence.** None.

**Gap.** No delivery bills, three-way matching, credits or ledger reconciliation.

#### BUY-006 — Vendor delivery follow-up and replenishment control

target · **done**

Buyers see promised/actual delivery, late items, acknowledgments and partial receipts; configured reminders chase the vendor and escalate a parts blocker to the planner. Auto-buy limits apply per order and period, and pausing a rule preserves open orders. Exactly: until ADMIN-003 adds purchasing and planner roles, the owner acts as buyer and existing internal members read follow-up. The Vendor follow-up page and its JSON door follow each order's latest revision with a retained submission (accepted, locally suppressed, unconfirmed or uncertain; rejected, rate-limited and failed sends never reached the vendor and are not followed) and show its promised delivery day, each delivery's site-local day and receipt identity, the latest buyer-recorded acknowledgment (not independently verified) or none, and per line the ordered, delivered (quarantine included) and outstanding quantity, which is ordered less delivered plus supplier returns (BUY-004), exact to three decimals. An order is partly delivered while some but not all of it is delivered, and late while anything is outstanding and the site-local today is after its promised day, by whole calendar days; a completed order shows how many days after its promised day its last delivery came. Reminders run only under an owner-approved immutable numbered rule, none by default, and only while something is outstanding and the supplier is active: one acknowledgment reminder when no acknowledgment is recorded once the site-local days since the submission reach the rule's acknowledgment days (0 to 30), and one late reminder once the delivery is the rule's late days (1 to 30) past its promised day. Each is one email to the order's submitted vendor address through installation mail, claimed before submission and never resent, labelled with its provider outcome: provider acceptance is not mailbox delivery or vendor agreement, local development says no vendor email was sent, and uncertainty or refusal stays visible. A later submitted revision is followed afresh with its own occasions. A delivery that is the rule's escalation days (1 to 60) late with outstanding part lines while its linked work is still open is a parts blocker: one in-app escalation notice, linked to that work and the PO and shown in the work's chase, goes to the planners, who are every active lead (the owners when there is none); no external alert is claimed. The auto-buy limits are PART-005's independently approved envelopes: each caps every automatic order and the envelope's inclusive site-local period in USD, in addition to BUY-003 budgets, and an automatic order over either ceiling is not sent. Follow-up runs as PM-008's Vendor delivery follow-up job every quarter hour; the owner pauses, resumes and catches it up under its revision, the page and JSON door show exactly what the next run would do without writing anything, and pausing it or the replenishment job keeps every open order, its outstanding quantities and its records. Each reminder and escalation keeps its job, grant revision and rule number, the job keeps its input facts, and its measures follow REPORT-009. ADMIN-003 adds the buyer and planner roles, ADMIN-002 site scope and PM-005/INT-004 external delivery of escalations before they ship. **Acceptance evidence:** Send an approved PO, withhold vendor acknowledgment, advance past promised delivery and receive only part. Inspect vendor reminder, planner escalation, outstanding quantity and blocked overspend.

**Evidence.** `src/gasket/vendor-follow-up.ts`; `src/gasket/vendor-reminders.ts`; `src/gasket/ui/vendor-follow-up.ts`; `src/gasket/vendor-follow-up-metrics.ts`; `src/gasket/replenishment.ts`; `migrations/core/0063_vendor_follow_up.sql`; `tests/gasket/vendor-follow-up.mjs`; `tests/gasket/vendor-follow-up-browser.mjs`; `tests/gasket/replenishment.mjs`; `tests/gasket/flows.mjs`

**Gap.** None.

#### BUY-007 — Contractor and external repair work

target · **missing**

Leads scope and authorize contractor work with quotes, service terms, qualification/insurance expiry, asset access window and expected costs. Contractors submit evidence, time/materials and invoices against scoped work; an independent supervisor accepts before costs are finalized. **Acceptance evidence:** Send a pump rebuild to a contractor with an expiring qualification, receive quote and completion evidence, return incomplete work, then accept and match its invoice. Inspect scoped access and actual cost in asset history.

**Evidence.** None.

**Gap.** No external repair lifecycle, contractor qualification, service acceptance or invoice capture.

#### BUY-008 — Purchasing visibility and vendor performance

target · **partial**

Buyers report committed versus actual maintenance spend, open/late PO lines, approval age, vendor lead-time/quality and receipt/bill exceptions by site, asset and cost center. Reports link to original approvals, deliveries and posted financial IDs. **Acceptance evidence:** Draft, approve, partially receive and bill POs from two vendors, then download a monthly purchasing report. Reconcile commitments, actuals, late quantities and exception age to source documents.

**Evidence.** `src/gasket/purchase-report.ts`; `src/gasket/vendor-follow-up.ts`; `src/gasket/receiving.ts`; `tests/gasket/spend.mjs`; `tests/gasket/vendor-follow-up.mjs`; `tests/gasket/receiving.mjs`

**Gap.** Source-linked purchasing commitments, releases/emergencies, open/late delivery lines and receipt/quarantine quantities exist; consolidated monthly purchasing downloads, actual bills/financial IDs, vendor quality/lead-time aggregation, approval/exception age and complete site/asset/cost-center reconciliation remain absent.

### Costs, reliability and management reporting

#### REPORT-001 — Work and asset maintenance costing

target · **done**

Every work order and asset shows actual labor, consumed and returned parts, contractor, tool and miscellaneous USD costs alongside estimates, commitments and posted amounts. Parent, site and cost-center rollups avoid double counting and rate visibility follows role rights; parent roll-ups follow the asset hierarchy (ASSET-001). The repair cost entries leads record on work orders today (REPORT-005) are part of a work order's actual cost, and REPORT-005 ranks by this clause's reconciled work cost before it ships. Consumed and returned parts are the values PART-007 keeps on each issue and return, never a later price. **Acceptance evidence:** Complete a two-technician repair using parts and a contractor, return an unused part and reconcile work, asset, parent and site cost downloads with underlying approved entries. Open the downtime Pareto (REPORT-005) and see each failure's repair cost equal its work order's reconciled cost. Current implementation semantic (ct approved 23 October 2026): actuals add retained manual entries, signed consumed and returned PART-007 values, approved labor snapshots and captured contractor invoices, once per source. Existing manual entries stay additive because their external provenance is not guessed. Work, direct asset, current subtree, site and cost-center downloads share these sources; overlapping subtree rows are explicitly non-additive. Estimates, live approved purchase commitments, external commitment records and owner-recorded posted amounts are separate comparisons, never additional actual cost or verified ledger postings. Comparison corrections append a referenced credit; unknown source values and missing imported components remain disclosed. New financial comparison and work cost-center writes are owner-only; existing report readers retain aggregate USD access, without individual labor rates. REPORT-010 carries reconciled costs and approved time into its authorized PDF fields before it is done. BUY-005 and REPORT-008 inherit provider-confirmed bill and ledger reconciliation before shipping; ADMIN-002 and ADMIN-003 inherit current cost scopes and protected person-level rates.

**Evidence.** Two-technician repair, consumed parts and immutable original-value return, contractor, tools and retained manual entries; separate estimates, commitments and posted amounts; additive work, direct asset, parent, site and cost-center downloads; protected person costs; Pareto and lifecycle equal reconciled work: `tests/gasket/work-costing.mjs` (costingJourney), using approved entries from `tests/gasket/labor-costs.mjs` (laborJourney). Matching work, asset, parent, site and cost-center screens at 1440 and 390: `tests/gasket/work-costing-browser.mjs` (costingBrowser).

**Gap.** None.

#### REPORT-002 — Downtime and production availability

target · **done**

Report planned/unplanned outages, degraded operation, reason, failure mode, affected production window and availability denominator. Overlapping component events roll up without double counting; open outages and uncertain feed coverage remain visible with drill-down. Exactly: the report covers a period of site-local days, both ends included (the last 30 days by default), for the site (every line and every entry with an outage) or one register entry and everything below it (ASSET-001), and is read by leads, supervisors and the owner. An outage is downtime recorded on a work order; whoever records it marks it a failure stop, a planned stop or degraded operation (the asset kept running at reduced output), with its reason and an optional failure mode, and its latest classification counts (REPORT-003). Outages are clipped to the period; one still open counts to now and its entry is listed as down now. Production time is the site's declared weekly production hours (windows per ISO weekday ending by midnight, which leads and the owner add and remove; with none declared, every hour of every day), as they stand now, inside the period; the source timeline shows each outage's recorded and clipped window, its work order and line, and its minutes inside and outside production time. An entry's planned time is the production time inside a planned stop of it or of anything below it, and is left out of the availability denominator (production time less planned time). Its down time is the denominator time inside a failure stop of it or of anything below it, overlapping outages counted once with the shared minutes shown, and availability is (denominator - down time) / denominator. Degraded operation is listed on its own, does not lower availability and is not a stop (REPORT-003). Unknown coverage is denominator time that no hour meter on the entry or below it was reporting (from its first to its last good reading in the period; a stale feed reading, ASSET-005, is not good), shown in hours and never estimated or counted as up or down. Minutes are whole; hours and percentages have one decimal, rounded half up. Done covers every source of outages and production time that exists today (downtime on work orders, declared production hours and hour meters); technician after-the-fact work FIELD-009, moved-in history MIG-001 and MIG-002, machine feeds INT-010 and INT-014, and production windows from PLAN-005 and INT-017 feed these definitions before they ship. **Acceptance evidence:** Enter overlapping component outages across a reporting boundary and a planned shutdown, then inspect asset/line availability and source timeline. Verify clipped windows, excluded planned time policy and explicit unknown coverage.

**Evidence.** `src/gasket/availability.ts`; `src/gasket/outages.ts`; `src/gasket/spans.ts`; `src/gasket/ui/availability.ts`; `src/gasket/work.ts`; `migrations/core/0040_availability.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### REPORT-003 — MTBF, MTTR and failure analysis

target · **done**

Reliability reports calculate MTBF from defined operating time and qualifying failure counts, MTTR from defined repair durations, and MTTA from acknowledgment events. Definitions, sample size, exclusions and unknown inputs are displayed; failure-code Pareto and repeat failures link to work. Exactly: the report covers a period of site-local days, both ends included (the last 30 days by default), for the site or one asset, and is read by leads, supervisors and the owner. A stop is downtime recorded on a work order (degraded operation, REPORT-002, is not a stop); whoever records it marks it a planned stop or a failure, with an optional failure mode code (ASSET-004), and a lead or owner corrects that classification by appending a new one with a reason, never rewriting the stop or an earlier classification; the latest classification counts and every one stays visible with who and when. A qualifying failure is a stop that started in the period and is not classified as planned; planned stops are listed and left out of every measure. Operating time is what the asset's hour meter (a counter whose unit is h, hr, hrs, hour or hours; the first by name when there are several) counted between its first and last good reading in the period; the rest of the period is unknown coverage, shown in hours and never estimated. MTBF is operating hours divided by the failures that started inside that covered time; failures outside it, or on an asset without an hour meter, are excluded and counted. MTTR is the mean minutes from a failure's stop to back in service over failures that have ended; failures still down are excluded and counted. MTTA is the mean minutes from a failure's stop to the first acknowledgment of its work order (PLAN-002) at or after it; failures not acknowledged since are excluded and counted. The Pareto ranks failures by failure mode, most first, with each mode's share and the cumulative share, unclassified failures as their own row; a repeat failure is two or more failures of one asset with the same failure mode in the period. Hours, minutes and percentages have one decimal, rounded half up. Done covers every source of stops that exists today (downtime recorded on work orders); each later source of stops or operating time (technician after-the-fact work FIELD-009, moved-in history MIG-001 and MIG-002, machine feeds INT-010 and INT-014, parent and line roll-ups ASSET-001 and REPORT-002) records the same planned/failure classification and feeds these definitions before it ships. **Acceptance evidence:** Record three failures, one planned stop and missing operating coverage; compare MTBF/MTTR/MTTA and failure Pareto to hand-calculated source events. Correct a failure classification and inspect revised definitions and retained provenance.

**Evidence.** `src/gasket/reliability.ts`; `src/gasket/ui/reliability.ts`; `src/gasket/work.ts`; `migrations/core/0034_reliability.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### REPORT-004 — Backlog, PM compliance and schedule performance

target · **done**

Leads see backlog age and estimated hours, overdue risk, PM on-time compliance, planned/reactive ratio, schedule attainment and work awaiting review. Missed/skipped/canceled PM occurrences remain in the disclosed denominator and drill to accountable work/blockers. Exactly: the report covers a period of site-local days, both ends included (the last 30 days by default), for the site and optionally one team (a schedule may name a team and an estimate, which the work it issues carries). Backlog is open, in-progress and returned work now, by age since it was raised (0-7, 8-30, 31-90, over 90 days) with the leads' estimated hours, and work with no estimate is counted and named rather than guessed; overdue is due before today and at risk is due within the next 7 days and not started; work awaiting review is counted on its own. A PM occurrence is a schedule and its due date (when issued more than once, its latest work order counts) and is judged once its due date has passed or its work is done: on time when submitted on or before its due date, otherwise late, overdue (still open), canceled, skipped (an approved skip) or not generated (due with no work ever issued); all of these stay in the denominator, occurrences not yet due are left out and counted. Planned/reactive compares preventive and corrective work approved and closed in the period; schedule attainment is the share of work due in the period, judged the same way, done on or before its due date. Percentages have one decimal, rounded half up. **Acceptance evidence:** Create on-time, late, canceled and ungenerated PM obligations plus reactive repairs, then filter by site/team and compare counts/hours and compliance denominator against source due occurrences.

**Evidence.** `src/gasket/performance.ts`; `src/gasket/ui/performance.ts`; `src/gasket/schedules.ts`; `migrations/core/0032_performance.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### REPORT-005 — Downtime Pareto and cost of bad actors

target · **done**

Leads rank downtime by asset, line, failure mode and reason, alongside repeat failures, repair cost and documented lost-production assumptions. Unknown costs remain unknown; drill-down explains each ranked contributor and excludes duplicate component time. Exactly: the report covers REPORT-002's period and scope (site-local days, both ends included, the last 30 days by default; the site or one register entry and everything below it) and is read by leads, supervisors and the owner. Ranked downtime is the production minutes (REPORT-002) of failure stops; planned stops and degraded operation are left out and counted. Where failures of an entry and of an entry above or below it overlap, the shared minutes count once, for the failure that started first (then the higher entry), and the other shows them as duplicate time; failures of unrelated entries are separate losses even at the same time. Leads rank by asset, by line (the entry's nearest line, or "No line"), by failure mode (the latest classification, or "Unclassified") and by reason (the recorded reason, ignoring case and outer spaces), most minutes first, each row with its share and the cumulative share of the ranked total, its repeat failures (as REPORT-003 defines them), its repair cost and its lost production, and a drill-down listing each contributing failure with its counted and duplicate minutes and its work order. Repair cost is the sum of the USD cost entries (parts, labor, contractor or other, each with a note) that leads and the owner record on the failures' work orders, each work order once per row; entries are never edited, a negative entry corrects earlier ones and a work order's total never goes below zero; a work order with no entry is unknown, never zero. Lost production is counted minutes times the documented USD rate per production hour of the failed entry or, when it has none, of its nearest entry above with one; leads and the owner document a rate with its basis, or document that it is unknown, and the latest one of an entry counts. With no rate, or a rate documented as unknown, the loss is unknown and never estimated. A CSV download carries every ranked failure's inputs (recorded and counted windows, production, counted and duplicate minutes, repair cost, the rate with its entry and basis, lost production) and writes "unknown" where nothing is documented. Money is USD in whole cents, rounded half up; percentages have one decimal. Done covers the cost and rate records that exist today; REPORT-001 makes its reconciled work cost this repair cost, and technician after-the-fact work FIELD-009, moved-in history MIG-001 and MIG-002 and machine feeds INT-010 and INT-014 feed failures through REPORT-002's definitions, each before it ships. **Acceptance evidence:** Enter costed failures across three assets, including overlapping components and one unknown loss rate, then inspect Pareto/cumulative percentages and exported inputs without a fabricated loss estimate.

**Evidence.** `src/gasket/bad-actors.ts`; `src/gasket/ui/bad-actors.ts`; `src/gasket/outages.ts`; `migrations/core/0041_bad_actors.sql`; `tests/gasket/flows.mjs`

**Gap.** None.

#### REPORT-006 — Scheduled reports and CSV PDF delivery

target · **partial**

Authorized users save report filters and schedule site-local email delivery of readable PDF and complete CSV datasets. Exports include definitions, period, freshness and permission scope; delivery failures are visible and restricted rates and files never leak to recipients. The current Settings door supports weekly Performance, Reliability, Availability, Downtime Pareto, asset history and stock valuation packs with saved team or asset filters where supported. Asset history requires one asset and retains period events with attribution and source references, excluding the asset detail document links. Valuation retains site-wide opening, movement and closing quantities and values with unpriced movement coverage; it refuses an asset filter. Each occurrence covers the seven completed site days before its delivery date. The saved site time zone survives later site setting changes. A repeated wall time uses its later occurrence; a missing wall time uses the first valid minute after the clock gap. Delayed execution handles one oldest outstanding occurrence per tick and retains each original reporting period. CSV uses typed scalar paths to retain every value and empty collection, with formula-safe cells; PDF retains readable report values and versioned definitions. Freshness, permission scope, source revision, source fingerprint, dashboard links and authorized site-wide data-quality context accompany the dataset. Report delivery and assigned preparation policy: only active human owners create and authorize delivery schedules, with explicit audited consent and named active members. An owner may name one active human report reader as a delegated author for that schedule. Delegates can read and edit only their assigned schedules while the owning principal remains an active owner; every delegated edit is audited and forces a pause until an owner reviews and explicitly authorizes the saved revision. Delegates cannot grant authority, create independent schedules or resume delivery. Current report and export permissions, reassignment and ended access are enforced at schedule, draft, preview and download doors. Every recipient must currently have report and history-export access; the job rechecks the active owning principal, recipient role and saved revision after generation and immediately before sending one separate message per recipient. Original evidence files and individual labor rates are not included. A durable occurrence claim prevents automatic duplicate submission after retry or restart. Provider acceptance is distinct from inbox delivery; excluded, failed, rejected, uncertain and interrupted unconfirmed attempts remain visible and are never automatically resent. ADMIN-002 inherits multi-site authorization at every report, preview, dispatch and download door; ADMIN-003 inherits broader delegated scheduling rights and ADMIN-013 inherits localized packs. Additional report families must reuse their own access and redaction rules before scheduling ships for them. **Acceptance evidence:** Schedule a weekly supervisor pack across daylight saving, inspect email, PDF and CSV at the provider edge and reconcile rows with the dashboard. Remove recipient access before delivery and verify exclusion with a visible delivery result. Delivery and assigned-preparation policy was approved with riders on 26 October 2026 at reviewed SHA `0e133c7e91080ac0f943360a8d73b1d0afc623fe`; the exact rulings are retained in `RULINGS.md`. Any later repair must reconcile the original attempt before explicit authorization of another submission. Policy approval supplies neither provider qualification nor inbox-delivery proof.

**Evidence.** `tests/gasket/report-schedules.mjs` — reportSchedulesJourney: explicit human-owner consent and attributed consent and delegated edit audit, saved filters and all six complete CSV datasets reconciled to public report reads; independently calculated PDF results, original-file and individual-rate exclusion, role removal, paused and stale drafts, delegated preparation and reauthorization, DST gaps and repeated times, visible rejected, uncertain and real PDF generation failures without resend. `tests/gasket/report-pack-assertions.mjs` — assertPack: complete versioned definitions, period, saved zone, freshness, permission scope, source revision, source fingerprint, working dashboard links and authorized site-wide quality context in CSV and PDF. `tests/gasket/report-schedule-riders.mjs` — scheduleRiders: saved-zone previews and edits after a site setting change, delayed original periods, concurrent claims, in-generation authority and revision changes, owner revocation and assigned-delegate isolation. `tests/gasket/report-interruption.mjs` — interruptClaim: kill the actual Worker process group after a durable D1 claim, restart the installation, retain the unconfirmed result and reconciliation guidance without resubmission. `tests/gasket/report-schedule-browser.mjs` — reportScheduleScreens: owner form authorization, saved authorization after a lost reply with retained fields and refused replay, delegated paused save and every retained failure result at 1440 and 390. `tests/gasket/report-provider.mjs`: held-key SendGrid qualification of the built scheduled door, actual PDF and CSV inspection, HTTP 202, provider reference and one submission; inbox receipt is not claimed. `RULINGS.md` records the approved inherited duties explicitly named in ADMIN-002, ADMIN-003 and ADMIN-013. The repaired reportSchedulesJourney asserts all four retained boundary fixtures and exactly two exported in-period events, independently of the public report response. Direct assertions for typed empty arrays and objects, site-wide quality, history actors and unpriced values precede aggregate dataset comparisons.

**Gap.** Independent history-period exclusion and distinct mutation assertion repairs await fresh ct judgment. REPORT-006 remains partial until ct accepts the repaired proof; exact-candidate full-history publication scan and guarded landing receipts remain required.

#### REPORT-007 — Custom dashboards and cross-site comparisons

target · **missing**

Analysts build saved charts/tables over documented measures, dimensions and custom fields, compare normalized sites/assets and drill to permissioned records. Global totals disclose sites and missing data; filters, formulas and report versions are exportable. **Acceptance evidence:** Build a cost-per-operating-hour dashboard for two sites, save/share it and remove one site grant. Inspect recomputed permitted totals, a missing-hours warning and portable measure definitions.

**Evidence.** None.

**Gap.** No report builder, saved custom charts or site comparisons.

#### REPORT-008 — Maintenance budgets and repair replacement planning

target · **partial**

Leads plan monthly/annual USD maintenance budgets by site/asset/cost center, compare actual plus committed spend and forecast remaining work. Repair/replace scenarios use failure and lifecycle costs with explicit assumptions and human approval, leaving capital accounting to ERP. **Acceptance evidence:** Set a budget, approve POs and complete work across month end, then compare forecast/actual/commitment and a replacement scenario. Inspect no double counting between PO commitment and posted bill.

**Evidence.** `src/gasket/purchase-policy.ts`; `src/gasket/purchase-report.ts`; `src/gasket/lifecycle.ts`; `tests/gasket/spend.mjs`; `tests/gasket/flows.mjs`

**Gap.** Dated site/cost-center purchasing budgets, source-linked commitments and asset repair-versus-recorded-replacement comparisons exist; maintenance actual/commitment forecasts by asset/period, approved replacement scenarios and PO-to-posted-bill reconciliation remain absent.

#### REPORT-009 — Reliable measure definitions and data quality

target · **done**

Every KPI names its formula, event time policy, exclusions and input freshness. Data-quality views surface unmatched costs, missing failure codes, counter gaps and unresolved imports; metric changes are versioned and cannot improve performance by silently dropping unresolved work. Exactly: the Measure definitions page and JSON door keep a numbered, immutable definition for every current KPI, with its formula, site-local or recorded event-time policy, exclusions, freshness and public source-list door. Reads recompute from retained inputs and disclose the source audit revision, latest change, input fingerprint and coverage; an unknown cost or missing counter span is never an invented zero. The quality view lists work without cost entries, missing components of moved-in costs, unpriced stock movements, unclassified stops/findings/history, counter good-point coverage and retained late or suspect readings. Applied move-ins retain their reviewed rejections, attention items and source gaps; successful apply does not clear them, and legacy move-ins explicitly say their omissions are unknown. Import details retain the existing move-in permission. A lead resolves a stop's missing failure code through the append-only classification door; the next report uses that classification while retaining the original stop, reading, work and imported history. Formula changes add a new definition version and preserve earlier versions. Done covers all KPI capabilities and sources that exist today; REQ-007, FIELD-006, BUY-003 through BUY-008, REPORT-001 and REPORT-006 through REPORT-008, INT-001 through INT-017, MIG-001 through MIG-008 and AGENT-001 through AGENT-009 inherit the registry, retained source omissions, source-list and freshness obligations for every measure or source they add before shipping. **Acceptance evidence:** Import incomplete history and late readings, open a KPI's definition and source list, then resolve a missing code. Inspect traceable recomputation, explicit coverage and unchanged original history.

**Evidence.** `src/gasket/metric-definitions.ts`; `src/gasket/intervention-metrics.ts`; `src/gasket/metrics.ts`; `src/gasket/outcomes.ts`; `tests/gasket/metrics.mjs`; `tests/gasket/intervals.mjs`; `tests/gasket/outcomes.mjs`; `tests/gasket/outcomes-browser.mjs`

**Gap.** Numbered definitions include the retained AGENT-003 cohort and AGENT-004 outcome measures, exact event/coverage policies, unknown inputs and observational limits; authenticated source lists open retained proposals and both interval/work outcome assessments without altering them. Existing quality/recomputation journey and interval/outcome HTTP and browser journeys assert the acceptance points.

#### REPORT-010 — Completed work-order PDF

target · **partial**

Anyone with access to a work order downloads it, open or completed, as a single PDF to hand to an auditor, customer or contractor. The PDF holds the work number, asset and location, type, priority, dates, assignee and contributors, the exact procedure revision with every step result, readings with units, notes, comments, parts used and returned, time entries, embedded photos with their original-file digests, named signatures with time and revision, the review decision and the audit trail. Labor rates and costs appear only for viewers allowed to see them (ADMIN-003), interface text follows the viewer's display language (ADMIN-013) while user-entered text stays as authored, and a PDF of work changed after signing marks the signatures stale. Leads can select several work orders and download one PDF each in a ZIP. **Acceptance evidence:** Complete a work order with a failed step, two readings, two photos, a named signature, parts, time and a contractor charge, then approve it. Download its PDF as the supervisor and compare every step result, reading, photo digest, signature, review decision and audit entry with the record. Download it as a technician without rate visibility and see no labor rates or costs. A requester and a technician from another site are refused. Bulk-download three work orders as a ZIP and see one PDF per work order.

**Evidence.** `tests/gasket/work-pdf.mjs` — workPdfJourney: open and reviewed work, pinned step results, two unit-bearing readings, issued and returned parts, attributed original minutes, embedded photos and original digests, named signatures with stale and current state, each audit payload, restricted-viewer cost redaction, three PDFs in a ZIP, invalid selection refusal, and work-detail browser downloads at 1440 and 390.

**Gap.** Labor-rate policy, viewer-language text, requester and other-site refusal remain unproved (FIELD-006, ADMIN-003, ADMIN-013, ADMIN-004 and ADMIN-002). WebP and HEIC originals are attached but have no inline preview. Characters outside the bundled font are explicitly refused. Current agent members are denied PDF export pending approval to align with the anyone-with-work-access requirement.

### Connected maintenance operations

#### INT-001 — Documented maintenance REST API

target · **partial**

A documented versioned REST API covers maintenance records, procedures, assignments, execution and approvals using the same server authorization as screens. Pagination, scoped service credentials, idempotent write keys, error contracts, limits and OpenAPI examples let a buyer operate the complete job without browser automation. **Acceptance evidence:** Use API documentation to create/read/update and page an asset/work/stock estate, retry a timed-out write with the same key and attempt forbidden site and approval operations. Compare API results with UI/history.

**Evidence.** `tests/gasket/api.mjs` apiJourney: documented asset creation, reads, revisioned update, paged asset, work and stock estates, lost-response replay, concurrent claims, mismatched keys, durable stock receipt across Worker restart, forbidden site and review actions, scoped service access, consent, expiry and next-request revocation; browserProof reconciles the asset, work and part pages at 1440 and 390. `tests/gasket/recovery.mjs` recoveryJourney: exported credentials stay inactive after restore. `API.md`; `openapi.json`. apiJourney now also uses the published OpenAPI examples to create and revise a procedure and template, assign its pinned work, record results, issue and return exact stock, submit and independently approve it; each of the nine added keyed actions replays without another audit effect. Forbidden assignee, stale review, incomplete submission, self-review, changed assignment and service-scope operations are refused. The same journey proves all nine credential scopes, no implicit read grant, secret-free service mutation attribution in audit and CSV, permanent bearer revocation after owner demotion or deactivation and reinstatement, deliberate replacement issuance and preserved service use after browser sign-out. The same apiJourney retains documented template requiredFields, refuses submission until its value is recorded, and distinguishes the triggering credential from lead-owned and owner-owned standing-rule execution through audit and source-event links. Browser proof includes the incomplete-work refusal and both direct-service and standing-rule audit pages at 1440 and 390.

**Gap.** Version 1 aliases, keyset-paged asset, work and part collections, scoped owner service credentials and fifteen durable JSON write actions exist. Remaining: complete target-entity and schema coverage beyond the documented estate, procedure and core execution flow; write keys for the other native actions; complete credential lifecycle-transition attribution, custody, retention, erasure and restore proof. The dated CT addition below approves the existing credential policy with riders; no new service scopes are granted. Interrupted or failed claims require manual reconciliation and never automatically repeat effects. Conservative default adopted pending ct approval: owner-only explicit consent to scoped credentials for that owner, maximum 90-day expiry, no approval, administration, destructive or outbound scopes; revocation is checked on the next request and inside mutation batches, and restored credentials are inactive. ADMIN-003 inherits delegated ownership; ADMIN-006 through ADMIN-009 and ADMIN-016 inherit custody, audit, retention, erasure and restore obligations.

#### INT-002 — Signed webhooks and reliable connector jobs

target · **done**

Owners subscribe to scoped maintenance events with signed payloads, source IDs, replay protection and bounded retry/dead-letter inspection. Connectors expose cursor, last success, quota and error; reconciliation can resume without duplicating work, stock, bills or notifications. **Acceptance evidence:** Subscribe to work/receipt events, verify signatures at the receiver edge, return rate limits and timeouts, rotate signing secret and resume from a cursor. Inspect deduplication, expired replay refusal and actionable dead letters.

**Evidence.** `tests/gasket/automation.mjs` — connectorJourney (flow: INT-002 signed events and durable connector delivery): owner subscriptions to scoped work/receipt events and retained source IDs; independent receiver-edge HMAC verification, secret rotation, tampered/expired replay refusal; 429 Retry-After and actual request timeout; cursor rewind, concurrent claims, receiver deduplication and pending-job restart/export/import recovery without duplicated work, stock, bills or notices; quota, last success/error, bounded retries and retained actionable dead letters. connectorBrowser in the same file proves Automation inspection and the retry form at 1440/390. `src/gasket/webhooks.ts`; `src/gasket/connector-jobs.ts`; `scripts/webhooks/receiver.mjs`; `API.md`.

**Gap.** None.

#### INT-003 — QuickBooks Online maintenance spend sync

target · **missing**

Authorized QuickBooks Online OAuth connects vendors, approved purchase/bill lines, part/contractor costs, US sales/use-tax details and cost-center/class references. The owner previews mappings and chooses the system of record; external IDs, duplicate protection, credits and payment-status reconciliation prevent silent ledger drift. For rebillable work, such as a facilities operator's tenant repair, a lead marks completed work billable to a QuickBooks customer; labor, parts and contractor lines carry the owner's configured rates or markup, an authorized person approves the billable set, and Gasket creates one QuickBooks customer invoice per approved set, then shows its invoice and payment status. **Acceptance evidence:** Connect a QuickBooks sandbox, map an approved partial receipt/bill and cost allocation, sync twice, change a ledger tax/account mapping and return payment/credit status. Inspect one posted document and a visible conflict requiring correction. Mark a completed tenant repair billable to a customer, approve it and see one QuickBooks invoice with its labor and part lines; replay the sync and see no second invoice, and return its paid status.

**Evidence.** None.

**Gap.** No QuickBooks OAuth, financial mappings, bill posting or reconciliation.

#### INT-004 — Email and APNs FCM push delivery

target · **partial**

The owner connects Amazon SES or SendGrid email and Apple APNs/Google FCM push for PM-005 and requester/purchasing/report events. Messages render in each recipient's display language (ADMIN-013). The owner verifies sender domains, handles expired device credentials, processes bounced mail and complaints, and inspects preferences and delivery history; secrets stay private and delivery does not imply acknowledgment. **Acceptance evidence:** Send a real provider-edge test and work notice to email/iOS/Android, simulate bounced mail and expired device token, rotate credentials and inspect exact event links, suppression and visible failure state.

**Evidence.** `src/mail.server.mjs`; `src/gasket/purchase-orders.ts`; `src/gasket/vendor-reminders.ts`; `tests/gasket/purchase-orders.mjs`; `tests/gasket/vendor-follow-up.mjs`

**Gap.** Purchasing order/reminder email uses the installation mail provider (including SendGrid), with retained submission outcomes and provider-edge assertions; SES, APNs/FCM, localized maintenance/request/report events, recipient preferences, bounce/complaint and device-token lifecycle remain absent or unproved.

#### INT-005 — Slack maintenance intake and alerts

target · **missing**

A scoped Slack app maps workspaces/channels to sites, posts assigned/overdue/down/parts-blocked work, and accepts operator requests or authorized acknowledge actions. Slack identity is mapped to current Gasket rights; links retain record scope and revoked access stops interactive actions. **Acceptance evidence:** Connect Slack at its network edge, create a request from a channel, post overdue work and acknowledge as a mapped technician. Replay an interaction and revoke that member; inspect one request/action and denied stale interaction.

**Evidence.** None.

**Gap.** No Slack connection, intake, delivery or interactive authorization.

#### INT-006 — Microsoft Teams through Zapier

target · **missing**

A documented Microsoft Teams integration through Zapier routes scoped maintenance events to channels and operator requests back to Gasket with stable source IDs. Setup states the Zapier dependency, required permissions and which acknowledgment/status actions are supported; failures are visible in both job traces. **Acceptance evidence:** Configure a Teams/Zapier flow, receive a down-asset notice and submit a fault card, replay the response and disconnect the Zap. Inspect one linked request, mapped site and visible paused/failed routing.

**Evidence.** None.

**Gap.** No Teams/Zapier integration or documented operational setup.

#### INT-007 — Zapier triggers and actions

target · **missing**

The published Zapier connector offers new/updated request, work, outage, low-stock and PO events plus scoped create/update/read actions. Test mode and field mapping show real schemas; event IDs and action keys prevent loops and duplicate work when a Zap retries. **Acceptance evidence:** Build a Zap from a new fault to a maintenance request and from review completion to another authorized tool, replay both event/action and edit a field mapping. Inspect one source-linked result and actionable schema error.

**Evidence.** None.

**Gap.** No Zapier connector, public triggers/actions or loop prevention.

#### INT-008 — SAP procurement and asset exchange

target · **missing**

A supported SAP S/4HANA integration maps equipment/functional locations, vendors, material numbers, cost centers, requisitions/POs, receipts and cost postings through authorized APIs or reviewed files. Ownership is explicit per field/entity; reconciliation reports unmatched codes and prevents two systems from purchasing the same requirement. **Acceptance evidence:** Map a SAP equipment/material/cost-center set, exchange an approved requisition and partial receipt, replay and introduce an unknown material. Inspect linked external IDs, reconciled quantities/costs and a blocked unmapped line.

**Evidence.** None.

**Gap.** No SAP equipment, materials, procurement or cost integration.

#### INT-009 — Oracle procurement and maintenance cost exchange

target · **missing**

Oracle Fusion Cloud ERP integration exchanges authorized supplier/item/cost-center data, maintenance requisitions/POs, receipts, bills and posted cost statuses through documented APIs/files. The owner reviews mappings and exception queues; disconnect/reconnect resumes from a visible checkpoint. **Acceptance evidence:** Connect an Oracle sandbox, map a supplier/item, send an approved PO cost allocation, return a partial receipt/bill and interrupt/reconnect. Inspect one financial event per external ID and visible mapping exceptions.

**Evidence.** None.

**Gap.** No Oracle Fusion integration, mappings or reconciliation.

#### INT-010 — OPC UA and PLC SCADA condition ingest

target · **missing**

An owner-installed read-only OT gateway supports OPC UA plus documented Modbus TCP/EtherNet-IP mappings for PLC/SCADA tags. It maps certificate-trusted source tags, units, equipment, quality and source times to readings; buffered replay is idempotent and stale/disconnected tags show unknown. Gasket never writes control commands. **Acceptance evidence:** Connect a gateway to a controlled OPC UA server and a mapped PLC feed, cross a temperature threshold, lose/recover the link and replay buffered samples. Inspect fresh/unknown states, one condition job and no control writes.

**Evidence.** None.

**Gap.** No OT gateway, OPC UA/PLC adapters, trust configuration or telemetry ingest.

#### INT-011 — Fluke condition monitoring

target · **missing**

The Fluke/eMaint condition-monitoring adapter maps supported vibration/temperature sensor channels and alarms to Gasket assets, units and thresholds with raw-source references and freshness. Product-specific setup names the required Fluke service/hardware agreement; calibration results are a separate documented mapping when licensed. **Acceptance evidence:** Connect a supported Fluke condition-monitoring source at its network edge, ingest vibration/temperature alarm and recovery, replay it and remove source permission. Inspect one fault/work link, original readings and explicit stale/disconnected state.

**Evidence.** None.

**Gap.** No Fluke service adapter, licensed-channel mapping or condition-event ingestion.

#### INT-012 — Tractian sensor alarms and diagnosis context

target · **missing**

An authorized Tractian API/webhook connection imports asset health, vibration/temperature/hourmeter evidence, fault severity and diagnosis references, preserving source identity and timestamps. Lead-approved mappings turn alarms into deduplicated work; algorithmic confidence and disagreement remain visible. **Acceptance evidence:** Map a Tractian sensor to a motor, deliver an alarm, repeat it and deliver later recovery plus conflicting manual evidence. Inspect one linked work order, full context and unresolved disagreement until reviewed.

**Evidence.** None.

**Gap.** No Tractian connection, asset-health import or alarm/work routing.

#### INT-013 — Samsara fleet meters and inspection defects

target · **missing**

Samsara OAuth/API/webhooks map vehicle IDs, odometer/engine hours, DVIR defects and available telemetry to owned fleet assets, PM meters and corrective requests. Freshness, units, deleted vehicles and duplicate inspections are handled explicitly; trip/dispatch management stays in Samsara. **Acceptance evidence:** Connect a Samsara fleet sandbox, import a vehicle with engine hours and a DVIR defect, replay/update that inspection and revoke the connection. Inspect one source-linked fault, correct PM trigger and disconnected freshness.

**Evidence.** None.

**Gap.** No Samsara vehicle, meter or DVIR integration.

#### INT-014 — MachineMetrics production and machine data

target · **missing**

MachineMetrics integration maps machine identity, operating state, runtime, cycle counts and available condition events to maintenance meters and production windows. Source mapping/quality is reviewable; maintenance downtime and production stoppage remain distinct until classified. **Acceptance evidence:** Connect two machine feeds, ingest running/stopped periods and a condition event, remap a tag and interrupt coverage. Inspect meter/production context, one fault work item and explicit classification/coverage gaps.

**Evidence.** None.

**Gap.** No MachineMetrics feed, runtime mapping or production-state reconciliation.

#### INT-015 — Existing CMMS and EAM exchange

target · **missing**

Buyers retaining SAP maintenance, IBM Maximo or UpKeep for another site can synchronize scoped assets, faults, work IDs/status and completion evidence with explicit ownership, loop suppression and conflicts. The integration remains an exchange with a separate system; Gasket still owns its full CMMS job for the chosen estate. **Acceptance evidence:** Connect a separate SAP/Maximo/UpKeep test tenant in turn, create a fault, route its work and exchange completion twice. Inspect stable links, no echo loop and visible conflicting status requiring human decision.

**Evidence.** None.

**Gap.** No SAP maintenance, IBM Maximo or UpKeep coexistence adapters.

#### INT-016 — Power BI and analytics export

target · **missing**

Authorized Power BI connects to documented paginated incremental maintenance datasets with asset/work/cost/downtime relationships, deletion markers, schema versions and metric definitions. Site/rate permissions and refresh lag remain visible; extracts reconcile to the product reports. **Acceptance evidence:** Refresh Power BI from a multi-site dataset, close/reclassify work and erase an eligible contact, then refresh incrementally. Compare counts/costs to source reports and verify excluded site/rate data does not leak.

**Evidence.** None.

**Gap.** No Power BI connector, incremental dataset contract or permissioned analytical extracts.

#### INT-017 — Production and business calendar integration

target · **missing**

This target integration remains unimplemented: leads will connect Microsoft 365 Outlook or Google Calendar to bring approved shutdown and access windows into Gasket and publish authorized work appointments with stable IDs, time-zone handling and controlled one-way or two-way ownership. Calendar edits cannot mark work complete or issue spend. **Acceptance evidence:** Connect each calendar provider, import a shutdown, publish a work slot, move it externally and replay the change across daylight saving. Inspect one updated appointment, planner conflict and unchanged work completion and cost authority.

**Evidence.** None.

**Gap.** No Outlook/Google Calendar connection or production-window synchronization.

### Switching, import and migration

#### MIG-001 — Reviewed, reversible and attributable move-in

target · **partial**

All importers provide a no-write mapping/validation preview, source IDs and checksums, rejected-row reasons, duplicate matching and field-level attention items. Apply requires the reviewed fingerprint and current rights, checkpoints durably and is idempotent; undo removes only its changes and reports later dependencies. Imported attribution never grants source users active access. Every importer whose source names asset parents (MaintainX Parent) places the imported assets under them in the hierarchy (ASSET-001), refusing levels and cycles the hierarchy refuses, instead of keeping the parent as a note. Every importer whose source carries a part's unit cost moves opening stock in valued at it (PART-007); until then moved-in opening stock is unpriced. **Acceptance evidence:** Preview an export containing duplicates, malformed units, orphan work and an unknown user, change the source after review and attempt apply. Apply the reviewed data, resume/reapply, then undo before and after dependent work; inspect the exact journal and refusal. Import MaintainX assets with parents and see them placed under those parents (ASSET-001).

**Evidence.** `src/gasket/movein/maintainx.ts`; `src/gasket/movein/maintainx-work.ts`; `src/gasket/movein/target.ts`; `tests/gasket/flows.mjs`

**Gap.** Reviewed, journaled and idempotent MaintainX register/completed-history import, parent placement and dependency-blocked undo exist; complete provider/entity/file mapping, resumable complete-history extraction and full attribution coverage remain missing.

#### MIG-002 — MaintainX complete maintenance migration

target · **partial**

Move in MaintainX organization CSV exports for assets, locations, parts/transactions, vendors, requests, POs, meters/readings, work and time/cost transactions. Reporting date-range work exports and work-order PDF details supply completed history and procedure authorship where CSV lacks it; authorized API/file retrieval supplies original attachments and PM/procedure/user mappings. Download attachment URLs while authorized; preserve completion, source identities and recurrence without rerunning old work. Users identified only by a mobile phone number become phone-identified invitations (ADMIN-014) that keep their history, and custom asset, part and work field values map onto ASSET-009 and PLAN-001 fields. **Acceptance evidence:** Upload real-format MaintainX CSVs plus completed-work PDF/detail and attachment inputs through move-in, including multiple date ranges, a phone-only user and custom-field columns. Reconcile open/closed work, results, users (by email or phone number), custom-field values, costs, stock, PM next dates and file digests, then replay. Any unavailable record class is an explicit blocking discrepancy, never silently dropped.

**Evidence.** `src/gasket/movein/maintainx.ts`; `src/gasket/movein/maintainx-work.ts`; `tests/gasket/flows.mjs`

**Gap.** Assets, parts, meter readings and completed work orders (as asset history across date ranges, with MaintainX ID, type, completion, people as text, categories, recurrence and parts/labor/other cost) import through the reviewed move-in; open work, procedure results and PDF details, attachments, PM/procedure/user mappings, phone-only users (ADMIN-014), custom fields (ASSET-009, PLAN-001), vendors, requests, POs, part transactions and time entries are missing.

#### MIG-003 — UpKeep complete maintenance migration

target · **missing**

Move in UpKeep asset, location, part, PM, meter and work CSV/Excel exports plus work-order PDF/ZIP detail and authorized API/file extraction. Preserve completed history, checklists, time/cost, source user attribution, DVIR/Edge reading context where present and original file binaries; File IDs/PDFs alone are not treated as originals. Map opening stock separately from historical consumption and keep imported PMs paused pending cutover. **Acceptance evidence:** Import documented-format UpKeep work/history and entity files with PDF/ZIP detail, API/file mapping and meter/Edge history across date ranges. Compare original file digests, work status/dates, users, costs, PM rules and current stock; reject unresolved source/file IDs and reimport without duplication.

**Evidence.** None.

**Gap.** No UpKeep importer, history/file extractor, PM mapping or cutover reconciliation.

#### MIG-004 — Fiix complete maintenance migration

target · **missing**

Move in Fiix page CSV and report CSV/XLSX for users/sites, businesses, assets, parts, task groups, scheduled maintenance, work, meter readings and asset events. Where available, the Enterprise database/SQL ZIP export with uploaded files supplies complete relational history and binaries; authorized API/supported extraction fills permitted source gaps. Map source v5/v6 schemas, codes and custom fields explicitly and keep migrated schedules inactive until approved. **Acceptance evidence:** Import a Fiix CSV/report set and an available database/file ZIP through reviewed move-in, including failures, completed tasks and meter timestamps. Reconcile identities, work steps, PM recurrence, hours, costs and attachment digests; list missing source entitlements and prevent incomplete cutover.

**Evidence.** None.

**Gap.** No Fiix report/database/file importer, schema mapping or historical reconciliation.

#### MIG-005 — Limble complete maintenance migration

target · **missing**

Move in Limble Excel/CSV exports for assets, PM templates, parts, open/in-progress/completed tasks, vendors and users, plus XLSX audit and authorized file/meter extraction. Keep multiple labor entries, downtime, invoices, instructions and completer attribution. Source completed-task bulk-import limits do not justify losing attachments: retrieve originals separately and reconcile reading coverage. Historic part use never changes the imported opening balance. **Acceptance evidence:** Import Limble export samples containing multiple labor entries, downtime, historical parts and task files, and obtain originals via supported authorized extraction. Compare PM next dates, stock, users, costs, audit and file/reading totals; show unresolved coverage as a blocking exception.

**Evidence.** None.

**Gap.** No Limble entity/task importer, original-file/meter extraction or audit mapping.

#### MIG-006 — Tractian complete maintenance migration

target · **missing**

Move in Tractian tenant exports as supplied Excel/CSV/Sheets-derived files and authorized documented REST API/webhook or tenant-supported SQL extraction, with a reviewed schema manifest. Preserve assets, teams, PM plans, work/history, parts/movements, purchasing, timers/costs, original attachments, health/alarms and raw sensor context. No universal Tractian full-export format is assumed; the delivered adapter must resolve source coverage before cutover. **Acceptance evidence:** Use an authorized tenant export/API schema to import an asset with PM, historical repair, purchase, timer, alarm and attachment. Reconcile each source class and explicitly resolve missing raw timer/file/meter data; replay without duplicate work, balances or alarms.

**Evidence.** None.

**Gap.** No Tractian export/API migration adapter, source manifest or full-history reconciliation.

#### MIG-007 — Open-work CSV and Excel migration

target · **done**

Leads import generic CSV/XLS/XLSX open work, assets, locations, parts, PMs and historical work using published templates and source-ID mapping. Dates, US/SI units, leading-zero codes, custom fields, team assignments and unknown users are previewed; imported historic consumption does not issue stock or notify people. **Acceptance evidence:** Upload a 2,000-row open/history spreadsheet with leading-zero assets, mixed dates, custom fields and orphan assignees. Fix preview errors, apply and compare every accepted row, no stock side effects and no historical notices.

**Evidence.** `tests/gasket/generic-migration.mjs` — genericMigrationJourney, registered in `tests/gasket/flows.mjs`: CSV and both Excel formats reconcile identical native work; published templates are downloadable through protected doors; assets and parts retain leading zeros, explicit US and SI quantities and ASSET-009 fields; locations reject public portals and retain typed fields; calendar PMs retain validated cadence, dates, crew and active state, support unchanged undo and reapply; preview refuses unmapped required fields, invalid dates and choices and orphan open-work assignees; explicit user and team mappings resolve them; every accepted work row reconciles its retained source and actual native asset, dates, costs, fields and team, while history produces no stock changes, notices or accounts; replay adds nothing. Browser upload, error correction, source mapping, reviewed apply, journal and reconciliation at 1440 and 390. The committed 2,000-row mode runs outside Verify with GASKET_MIGRATION_ROWS=2000; its exact candidate heavy-slot run id is cited in the landing report for sx-gasket-c-i925. `IMPORT.md` documents templates, source-ID mapping and native precision.

**Gap.** None.

#### MIG-008 — Reconciled cutover and a complete exit

target · **partial**

Before replacing any named incumbent, owners reconcile counts, critical field totals, custom-field values, people by email or phone number, open obligations, PM due dates, inventory quantities/value, cost/downtime totals and original file digests in a parallel comparison. An approved cutover pauses old automation before enabling Gasket; delta import handles freeze-window changes. Unresolved omissions require repair, not scope reduction. Buyers can later export documented CSV/JSON plus original files for the whole estate. **Acceptance evidence:** Run the old and imported estate side by side, change work during the freeze, apply a reviewed delta and resolve discrepancies. Approve cutover and observe exactly one future PM/notice, then export all records/files for another tool.

**Evidence.** `src/gasket/movein/maintainx.ts`; `src/gasket/history.ts`

**Gap.** Register preview and history CSV exist; no all-entity reconciliation, shadow/delta cutover, activation controls or complete neutral exit pack.

### Safe maintenance records and operational limits

#### SAFE-001 — Hazard, isolation and permit evidence

target · **done**

Leads attach site-approved hazard, isolation and lockout and permit procedures to work with named qualified sign-offs, prerequisites, expiry and attachments. Gasket records these human attestations and blocks administrative completion when required evidence is absent; it never determines that equipment is physically safe or energizes it. The current door uses lead-published site-approved prerequisites and the assigned human's own dated qualification reference, isolation attestation and permit original. Sign-offs bind the work version, latest procedure revision and prerequisite revision; changed evidence requires reapproval, and submission and independent approval recheck expiry and qualification facts. **Acceptance evidence:** Configure an isolation prerequisite, attempt work submission without the required qualified sign-off, record the permit and its expiry, and change the procedure. Inspect refusal, human attribution and required reapproval of the changed evidence.

**Evidence.** `tests/gasket/safety.mjs` safetyJourney: publishes site-approved isolation prerequisites; refuses submission without a qualified sign-off, missing or expired qualifications, expired permits and absent isolation confirmation; records attributed permits and originals; procedure, prerequisite, qualification, work evidence and linked-instruction changes require reapproval; independent approval rechecks prerequisites. browserProof exercises the sign-off form and captures the procedure, work and library at 1440 and 390.

**Gap.** No remaining acceptance points.

#### SAFE-002 — Compliance templates and calibration evidence

target · **done**

Organizations version maintenance and compliance templates, required inspection and calibration intervals and electronic audit packs with procedure versions, signatures, training and qualification references and retained certificates. The buyer's qualified people choose applicable standards and decide compliance; the software supplies traceable evidence without issuing certification. CSV and JSON audit manifests and original files support handoff to the buyer's separate QMS and EHS system. The current library links versioned checklists, required inspection or calibration intervals and named qualification or training references. Audit packs use existing owner custody for qualification evidence; planning grants no certificate-original access. Packs preserve pinned instructions, results, signatures, qualification snapshots, certificate and permit originals, linked documents and independent reviews with per-file digests and explicit missing or expired evidence. **Acceptance evidence:** Publish a required inspection template, issue work, change the template and export an audit pack containing original instructions, results, qualifications, certificates and independent review. Verify missing/expired evidence remains explicit.

**Evidence.** `tests/gasket/safety.mjs` safetyJourney: publishes a required calibrated inspection template with a 30-day interval and a linked qualification or training reference; issues work and changes the template; reconciles CSV and JSON manifests and every file digest for pinned original instructions, results, qualification snapshots, certificate and permit originals, signatures and independent review; proves missing evidence before sign-off and explicit permit expiry on a pinned later clock; refuses unauthenticated and forbidden downloads. browserProof captures the library, template and work at 1440 and 390. Existing calibration and signature journeys remain in `tests/gasket/flows.mjs`.

**Gap.** No remaining acceptance points.

#### SAFE-003 — Capacity, ownership and honest service state

target · **partial**

The target supports a US organization with multiple sites, at least 10,000 assets, 100,000 parts and one million historical work orders, with paginated search/export. The supported offline pack holds at least one technician's assigned and team work for the next 7 days (no fewer than 200 work orders) with their procedures, asset histories and linked manuals, and up to 2 GB of attachments. Storage, connector and notification limits are visible before use; reaching a limit preserves accepted evidence and shows actionable failure instead of silent truncation. **Acceptance evidence:** Load a representative estate at the declared capacity through import/public API, page/search/export all records, download an offline pack at that 7-day, 200-work-order, 2 GB floor on a phone and work it in airplane mode, and exceed a configured limit. Inspect exact counts, usable core workflows and explicit refusal without lost accepted data.

**Evidence.** `tests/gasket/work-pagination.mjs` — workPaginationJourney, registered in `tests/gasket/flows.mjs`: imports 1,205 same-day open work orders through public preview and resumable apply, closes a separate cohort through independent review, traverses authorized web and JSON pages exactly once, reconciles legacy arrays, versioned API fields and complete bounded CSV, tests tied sort keys, altered and foreign cursors, changed snapshots, configured export-limit refusal, signed-out and revoked access, forbidden records and planned-site refusal, and preserves accepted records and original attachment digests. Browser navigation assertions run at 1440; proof captures Today, All open, Closed and Done today at 1440 and 390. `API.md` documents current paging, snapshot and CSV limits.

**Gap.** This proves only operational primary-site work-list completeness at the demonstrated fixture size, not declared or qualified target capacity. Gap: ADMIN-002 operational multi-site authorization; qualification at 10,000 assets, 100,000 parts and one million historical work orders with complete estate-wide search and export performance; the seven-day offline pack containing at least 200 work orders with procedures, asset histories, linked manuals and up to 2 GB of attachments; real-phone airplane-mode proof and the held SMS sender and APNs and FCM delivery dependencies; comprehensive visible storage, connector and notification limits before use and failure handling that preserves all accepted evidence. ADMIN-009 retains its resumable rer-export dependency, and br retains Work-table bulk-selection custody.

### Agent surface (Base-delivered)

#### BASE-AGENT-001 — One MCP door per seed

target · **partial**

*Tier:* Agent surface **Requirement.** Every seed, hosted or self-hosted, serves one remote MCP endpoint at `/mcp` over Streamable HTTP. It speaks the current revision (2026-07-28) and accepts 2025-11-25 clients through the twelve-month deprecation window. It implements `server / discover`, tools, resources and prompts. Lists are deterministic and carry `ttlMs` and `cacheScope: "private"`. Roots, Sampling and Logging are not served. **Acceptance.** 1. `server / discover` returns the supported versions, capabilities, `serverInfo` and instructions. 2. A 2026-07-28 request works with no handshake, and a 2025-11-25 client completes `initialize` and lists the same tools. 3. An unsupported version returns `UnsupportedProtocolVersion`. 4. Two `tools / list` calls return the same order, with cache fields. 5. A foreign Origin returns 403, and a header and body method mismatch returns `HeaderMismatch`. 6. An oversized body returns 413 with no effect.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** Core transport is wired. Stranger-specialist completion and the undeclared optional families remain unproved.

#### BASE-AGENT-002 — The seed's jobs are tools, through the UI's own actions

target · **partial**

*Tier:* Agent surface **Requirement.** Each Core job a person does in the product is a tool. Where one is not, the Agent surface says why: it runs on a device, it is a person's interactive screen, it belongs to a connector or the import door, or it is an installation fact. Risk is never the reason: a risky job is a tool with its class (BASE-AGENT-006). Tools are named `<seed>.<area>.<verb>` and declare input and output schemas and truthful annotations. Each calls the same server action as the UI, so validation and authorization are written once, and the seed's embedded agents use the same registry. A business refusal returns `isError` with the seed's stable error code. **Acceptance.** 1. The Core clause ids in each tool's `_meta`, with the not-a-tool reasons that `server / discover` serves, cover every Core clause in the contract, and no reason is risk; the harness and `rer check` fail on a gap. 2. Each tool's fixture result validates against its `outputSchema`. 3. Read tools declare `readOnlyHint`; tools that can carry destructive declare `destructiveHint`, and tools that can carry external declare `openWorldHint`. 4. A refusal returns the same error code the UI gets for the same action. 5. The UI action and its tool, on the same fixture, give the same record state and the same audit event type. 6. The seed's embedded agents appear in the audit as calls to the same tools.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** Only the declared Core maintenance slice is registered. Other supported native jobs and legacy embedded model runs still need native registry adapters; their existing screens retain their authority.

#### BASE-AGENT-003 — Records are resources

target · **partial**

*Tier:* Agent surface **Requirement.** Each primary record type has a URI template, and tools return `resource_link`s to the records they touch. A read returns exactly the fields the caller's role sees in the UI. File bytes count against any byte budget on the grant. A record the caller cannot open reads as not found, identical to a missing id. Text from customers, imports or files carries an untrusted marker in `_meta`. **Acceptance.** 1. `resources / templates / list` names every record type in the Agent surface. 2. Reads as two roles return exactly what the UI shows each. 3. An out-of-scope id and a missing id give identical responses. 4. A write's `resource_link` reads back the new state. 5. Bytes over budget return `budget_exhausted` and no partial content. 6. Customer-sourced text carries the untrusted marker.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** Resources cover assets, work, parts and procedures. Other primary families, byte budgets and resource refresh are undeclared; multi-sponsor visibility completion remains a gap.

#### BASE-AGENT-004 — Business identity and short-lived, audience-bound tokens

target · **partial**

*Tier:* Agent surface **Requirement.** The door is an OAuth 2.1 resource server. Its RFC 9728 metadata names the authorization servers this installation trusts. That is the paired Business when Business provisioned it, verified with the owner-claim trust the installation already holds for its import door; otherwise it is the seed's own sign-in. Access tokens are RFC 9068 JWTs with `aud` set to the seed's canonical MCP URI, `sub` the sponsoring person, `act` the agent (RFC 8693) with its specialist, scopes per tool family, and a lifetime of 15 minutes or less (5 by default). The policy scopes rules on the sponsor, agent and specialist the token names. The consent behind the tokens can last longer and is revocable. Tokens travel only in the Authorization header, and there is no passthrough. **Acceptance.** 1. An unauthenticated call returns 401 with `resource_metadata`, and the metadata names the trusted servers and scopes. 2. A Business token for this seed works, and the same token sent to a sibling seed returns 401. 3. An expired token returns 401, and a token with a lifetime over 15 minutes is refused. 4. A read-only token calling a write tool returns 403 `insufficient_scope` with every needed scope in one challenge. 5. A token in a query string is refused and not logged. 6. Revoking consent in the seed or in Business refuses the next call within 60 seconds. 7. After unpairing, Business tokens are refused and the seed's own sign-in still works.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** Owner-bound subjects, consent and narrow native service credentials are integrated. Multi-sponsor completion, self-host token issuance and full unpair lifecycle are undeclared.

#### BASE-AGENT-005 — An agent acts as a person in a role, never more

target · **partial**

*Tier:* Agent surface **Requirement.** Every call is authorized as the sponsoring person's current role and access (BASE-ACCESS-004), intersected with the grant's resources, actions and budget. A grant only narrows. No call widens the calling agent's own authority. A call that would widen its own grant or its sponsor's role, or change the company policy or Pause, is refused with `self_escalation`, whatever the policy says; narrowing its own grant is allowed. Other access and security changes are ordinary actions in the access and security classes. An agent never acts after its sponsor is suspended. Anything an agent reads (records, files, emails, imports, other seeds' results) is data and cannot change its scope, its targets or a call's class. **Acceptance.** 1. For each role fixture, every tool's allow or deny through MCP equals the UI's for the same action. 2. A one-folder, read-only grant holds, and widening through arguments is refused. 3. Downgrading the sponsor changes the next call's result, and suspending the sponsor returns 401. 4. Calls that widen the agent's own grant or its sponsor's role, or change the policy or Pause, return `self_escalation` and change nothing, even under a policy with every class autonomous; dropping a scope from its own grant runs. 5. An injection fixture yields no out-of-grant call and no change of class: record text asking for a wider action, or claiming that a recipient is internal.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** Native roles/site membership and current service scopes constrain the declared calls. Access/security tools and their native escalation/narrowing journeys are not declared; no widening capability is claimed.

#### BASE-AGENT-006 — Every action declares its risk class

target · **partial**

*Tier:* Agent surface **Requirement.** Classes come from the fleet list in RISK-POLICY.md: standard, external, money, commitment, accounts, gated, access, security, destructive, sensitive and live. In the registry, each tool declares the classes it can carry and a server-side classifier that decides them per call from the arguments, current records and, for gated, the provider's answer. The classifier also supplies each class's facts: the measure (items, recipients, amount and currency, people or records), the counterparty (internal, known, new or public), the direction for access, the provider and step for gated, and the data kind for sensitive. A classifier never reads a flag, label or claim supplied by the agent or by record text. A seed cannot add a class; it proposes one for the fleet list. **Acceptance.** 1. Every tool in `tools / list` carries its possible classes in `_meta`, equal to the Agent surface table. 2. For each tool, fixture calls cover every class it can carry, and the computed classes and facts equal the fixture's expected values. 3. An argument or record text asserting a class or a confirmation (`internal: true`, `confirmExternal: true`) leaves the computed classes unchanged. 4. Money calls carry amount and currency, external calls their counterparty and recipient count, access calls their direction, and destructive calls their item count. 5. No tool in `tools / list` declares a class outside the fleet list, and `rer check` fails on one. 6. A refused call's audit row still records its computed classes.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** The declared registry computes standard, commitment and sensitive from native effects/records. Other native job adapters and their class journeys remain outside this slice.

#### BASE-AGENT-007 — The company's policy decides, at one chokepoint

target · **partial**

*Tier:* Agent surface **Requirement.** Every agent door calls one decision function: MCP, the integration API with agent tokens, and the seed's embedded agents. It evaluates the call's classes against the company's policy, as above. The seed ships no dispositions and fills no gap with one: agent access opens only under a complete policy that setup has asked for (RISK-POLICY.md), and before then every agent call returns `policy_unset` with the setup link and changes nothing. *Autonomous* runs the call. *Review* runs it and adds it to the review feed. *Approval* saves a pending action with server-computed facts and returns `input_required`, with a URL-mode elicitation to the seed's approval page and a pending handle. Each person the rule names approves the exact saved revision in a signed-in browser, and changed inputs need a new approval. The retried call returns the result and a receipt. A rejection returns `approval_rejected`, and a lapse past the wait the rule sets returns `approval_expired`. *Blocked* returns `policy_blocked`, naming the class, rule and revision. **Acceptance.** 1. The Base harness runs each tool under each disposition for every class it can carry, and sees it run, run and enter the review feed, wait with no effect, or be refused. 2. Before setup is complete, the setup page lists every class the seed's tools carry with examples and no answer pre-selected, an agent call returns `policy_unset` with the setup link and changes nothing, and an incomplete revision cannot be confirmed; a `*` rule completes it, and a tool an upgrade adds with an unanswered class appears in `tools / list` once that class is answered, while the other tools keep running. 3. Under "money autonomous up to $500, approval up to $10,000, blocked above", calls of $400, $600 and $20,000 run, wait and are refused; a per-day cap sends the call that crosses it to the next rule. 4. A call carrying two classes takes the stricter disposition. 5. An approval shows server-computed facts and an expiry, returns the URL elicitation and a handle, and completes once after the named approver approves; a changed input needs a new approval, and a rejection or lapse leaves no effect. 6. The same call through MCP, the integration API and an embedded agent gets the same decision. 7. A policy change applies to the next call within 60 seconds, and the audit cites the new revision. 8. A policy document with a bad signature or another Business's id is rejected, and the door keeps the last valid revision.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** Core signed policy, review, approval, refusal and Pause are integrated. Spend, multi-sponsor completion and embedded model-run invocation are undeclared.

#### BASE-AGENT-008 — Truthful attribution

target · **partial**

*Tier:* Agent surface **Requirement.** Every agent act is recorded and shown as `"<agent> for <person>"`, and mail and messages an agent sends outside name it that way as their sender. An approval, a review mark, a confirmation (a warning dialog, a typed-field confirmation, a delivery confirmation), a decision or a signature attributed to a person comes only from that person's signed-in session. When an agent does the equivalent act, the record names the agent, and the act carries its own class; a binding decision or a signature is commitment. Agent doors ignore arguments that stand for a person's confirmation. No tool solves a bot check, or enters a person's own password or 2FA code at an outside service. A provider step that demands a person goes to a person, whatever the policy says; the gated class marks such steps before they run. **Acceptance.** 1. An agent call carrying a person-confirmation flag is classified and decided exactly as without it. 2. Approving, marking reviewed or answering a policy question with an agent or device token returns 403 and changes nothing. 3. A form-mode elicitation "accept" never completes an approval. 4. Where an agent's decision, signature or field confirmation runs without a person, it reads `"<agent> for <person>"` in the record, the activity view, exports and any certificate, never as the person's own act. 5. After a person approves an agent's prepared action, the record shows the person as approver and the agent as preparer. 6. Activity and exports at 1440 and 390 show `"<agent> for <person>"` for every agent act. 7. Mail an agent sends to an outside address names `"<agent> for <person>"` as its sender.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** Native audit and named approval preserve preparer/sponsor/approver attribution. Outside mail, physical attestations, native Undo and embedded model-run migration are undeclared.

#### BASE-AGENT-009 — Every agent action is audited with its class and decision

target · **partial**

*Tier:* Agent surface **Requirement.** Extending BASE-OPS-005, each call that reads private data or changes anything records the agent client, name and specialist, and the run or task id (`traceparent` when sent); the sponsoring person, the grant, the tool and the targets; the classes and their facts, and the policy revision and rule; the decision (autonomous, review, approval, blocked, unset or self_escalation) and the outcome (done, refused, pending or failed); the approval or review id and person, and the idempotency key. For a period, the seed's Agents page shows actions by class and decision with the notable ones, the review feed (Mark reviewed, Flag, and Undo where reversible), pending approvals, steps waiting for a person and setup questions. Business shows the same across seeds. **Acceptance.** 1. One write leaves a complete audit row. 2. Refused, pending, unset and self-escalation calls are audited. 3. The Agents page's counts by class and decision equal the audit rows on a fixture week. 4. The review feed lists exactly the calls decided as review; Mark reviewed records the person, and Undo restores a reversible one. 5. Filtering by agent or class lists only those rows, and export includes every field. 6. Removing the agent keeps its rows and its name. 7. The Agents page works at 1440 and 390 with no serious or critical axe findings.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** Declared calls, private reads and refusals have policy-linked audits. Cross-seed Business aggregation, undeclared families and full custody/erasure reconciliation remain gaps.

#### BASE-AGENT-010 — Agents can follow changes

target · **partial**

*Tier:* Agent surface **Requirement.** The seed emits a typed event for every record change and for every approval, review and policy decision. Each event carries a stable id, a type, the record URI, the actor (a person, or an agent acting for a person) and a time. Events never carry secrets or more than the subscriber may read. Agents can read events three ways: `subscriptions / listen`, an `events.list` tool with a cursor, and signed webhooks from Base `integrations` using the same ids. Every channel delivers at least once and filters by access at delivery. **Acceptance.** 1. A subscribed record changed in the UI produces a notification within 10 seconds. 2. `events.list` returns the same event id the webhook carries. 3. Replaying from a cursor returns the same ids in order. 4. After access is revoked, no channel delivers events about that record. 5. A failed webhook is visible and replays without duplicate effects. 6. `approval.pending`, `approval.decided`, `review.flagged` and `policy.adopted` carry the class and decision and nothing the subscriber may not read.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** UNDECLARED family: native maintenance events, subscriptions and webhook handoffs. rer 0.2.86 still requires BASE-AGENT-010.1.effects for a Core-only declaration; Base subset support is required. Built-in events.list remains for compatibility.

#### BASE-AGENT-011 — Limits are policy, and Pause stops everything

target · **partial**

*Tier:* Agent surface **Requirement.** Business limits are rules in the company's policy: per-call and per-day thresholds on any class's measure, such as money moved, outside recipients or items destroyed; spend caps on provider cost (models, SMS, email) per seed, specialist or agent, which setup asks with the classes; "no cap" is an answer. Tools with provider cost declare an estimate before they run, and an exhausted cap returns `budget_exhausted` before any partial effect. The seed's capacity limits (request rate, body and byte sizes) protect the installation: they bound rate and size, never daily business volume, are documented and are not policy. A grant carries budgets only when the person granting it sets them. A **Pause agents** control in the seed, and Pause all agents in Business when paired, refuses every agent token within 60 seconds until a person resumes; browser sessions and devices keep working. **Acceptance.** 1. A rate overrun returns 429 with `Retry-After`. 2. A per-day cap of three outside recipients sends the fourth to the rule that applies past the cap. 3. An exhausted spend cap returns `budget_exhausted` with no partial effect and shows the spend. 4. Under the answer "no cap", a spending call runs and its spend shows in usage; a call that spends nothing is unaffected by any cap. 5. The usage view shows calls, decisions by class, money moved and provider spend per agent. 6. Pause and Pause all agents each stop the next call within 60 seconds, and resume restores access. 7. An agent token cannot resume.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** Business and local Pause fence declared effects. UNDECLARED families: spend reservations, provider budgets and queued continuations; no provider cost is registered.

#### BASE-AGENT-012 — Writes are idempotent and conflict-safe

target · **partial**

*Tier:* Agent surface **Requirement.** Every mutating tool requires an idempotency key and takes an optional expected revision. The same key with the same arguments returns the first outcome for at least 24 hours; the same key with different arguments returns `idempotency_conflict`; a stale revision returns `revision_conflict` with the current revision. Long work returns a job handle and a status tool, with no dependence on the Tasks extension. **Acceptance.** 1. Two calls with one key give one effect and equal results. 2. A retry with a new JSON-RPC id and the same key, after a dropped stream, returns the recorded outcome. 3. The same key with different arguments returns a conflict and no effect. 4. A stale revision returns a conflict naming the current revision. 5. A job handle used by another person's token reads as not found.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** Declared native writes retain replay/conflict/revision guards. UNDECLARED families: long jobs and queued continuations; no provider effect is retried.

#### BASE-AGENT-013 — Manifest, docs and the conformance journey

target · **partial**

*Tier:* Agent surface **Requirement.** `server / discover` instructions and an on-site `/docs/agents` page are generated from the action registry. The page lists tools by job, with each tool's classes, the test that adds each computed class, its scopes, resource templates, event types, capacity limits and error codes, and the specialist role. `prompts / list` carries the specialist's jobs. Base ships the conformance journey, a harness that `rer verify` runs against `rer dev` and seeds run in CI. It is an MCP client; a signed-in test person takes a person's steps (setup answers, approvals, review marks, resume) through the URLs the door returns, and the same browser leg runs the UI-parity actions and the page checks at 1440 and 390. It runs every acceptance point of BASE-AGENT-001 to 012 and of the seed's SURFACE clauses under two company policies: *all autonomous* (`*`), and *held* (standard review, every other class the seed declares approval, which the test person grants), plus the single-class variants a point names. A point that names no disposition passes under both. **Acceptance.** 1. The docs list exactly the names in `tools / list` and `resources / templates / list`. 2. Each tool's classes, and the test behind each computed one, are documented. 3. The harness fails on any of: a tool without a schema; an effect under approval or blocked, or before setup is complete; a computed class that differs from its fixture; a flag that changes a class or completes a person's step; a role-parity mismatch; a wrong-audience token being accepted; a duplicate effect on retry. 4. Every acceptance point runs under both policies, every decision matches the policy in force, and under all autonomous no call waits for a person or is refused by policy. 5. A stranger agent given only the seed URL completes the specialist journey through MCP.

**Evidence.** `src/gasket/agent-door`; `agent-surface.json`; `tests/gasket/initialize-agent-owner.mjs`; `tests/gasket/agent-native-journey.mjs`; normal rer verify Core journey

**Gap.** The registry-derived /docs/agents, specialist prompt and declared journey are present. Full specialist/native-job coverage and the undeclared families remain gaps; conformance retains the failing Base optional-event assertion.

## Push further

### Push further

#### AGENT-001 — Detect developing failures from live evidence

push-further · **missing**

A reliability agent combines fresh sensor trends, meter quality, OEM references and repeated failure/work history to surface developing faults before breakdown. It cites exact observations, coverage, confidence and competing explanations, prepares a deduplicated corrective proposal and names an accountable lead. Lead-defined rules may authorize bounded low-risk work creation; safety-critical decisions always require qualified human review. **Acceptance evidence:** Feed authorized rising vibration, missing samples and two comparable historical failures through ingest. Inspect a source-cited proposal before the failure threshold, explicit insufficient-coverage state for gaps and no live work beyond the lead's grant.

**Evidence.** None.

**Gap.** No live reliability analysis, predictive fault proposal, confidence or evidence-coverage engine.

#### AGENT-002 — Stage an executable repair around production

push-further · **partial**

The agent reads manuals, failure context, BOMs, stock, supplier lead times, technician qualifications and production windows to propose repair steps, reserve eligible parts/people/slot and chase prerequisites. A lead approves the plan/window and a purchasing approver authorizes spend; the qualified technician owns isolation and physical repair. Changed resources make the proposal stale. **Acceptance evidence:** Provide an impending motor fault with a missing bearing and a two-hour production window. Inspect a cited plan, compatible part/skill/slot choices and a purchasing draft; approve, change availability before execution and require replanning rather than silent substitution.

**Evidence.** `src/gasket/proposals.ts`; `tests/gasket/flows.mjs`

**Gap.** Human-approved corrective proposals exist; fault-to-plan reasoning, resource/parts/production staging and prerequisite chasing do not.

#### AGENT-003 — Propose evidence-backed PM interval changes

push-further · **done**

The agent compares failures, readings, completed/late PMs, actual costs, downtime and operating exposure to propose interval changes with a cohort comparison, uncertainty and expected effect. It preserves OEM/legal/site minima as hard constraints and never edits a maintenance standard without a reliability lead's version-bound approval and rollback plan. Exactly: the comparison uses an inclusive window of complete past site-local days and explicitly named active peers of the same asset category. It retains source records and their revisions, good normalized counter exposure, failure rates per 1,000 observed hours, completed and late PMs, posted USD costs, clipped downtime and unknown coverage. The expected effect states the arithmetic change in nominal PM frequency and the effort/exposure trade-off, with no causal forecast or invoked model claimed. Leads record versioned OEM, legal and site references and inclusive minimum/maximum bounds in whole calendar days and the counter's recorded units (up to six decimals); Gasket labels these human declarations, not verified standards, and enforces every source at both agent approval and manual schedule editing. Longer intervals require positive measured exposure and independently closed PMs across the cohort, including the subject schedule, with no recorded failures; a rollback restoration is explicitly labelled and still requires current bounds and independent approval. The ordinary independent lead/owner proposal decision rechecks source history and the exact schedule revision atomically; it changes subsequent calendar/counter cadence while preserving issued work, calendar policy and the next promised occurrence. The recorded rollback plan accompanies every proposal; restoring the prior cadence is a new independent proposal bound to the original approved revision, refused if that revision has since changed. Done covers current schedules and the single site; ADMIN-002 inherits permissioned cross-site cohort selection and ADMIN-003 inherits delegated reliability-lead rights before they ship. **Acceptance evidence:** Give comparable assets different failure histories and OEM minimum intervals, inspect a cited proposed change and expected trade-off, reject an unsupported extension and approve a constrained revision. Change the source history and verify stale approval is refused.

**Evidence.** `src/gasket/interval-evidence.ts`; `src/gasket/intervals.ts`; `src/gasket/proposals.ts`; `src/gasket/exceptions.ts`; `src/gasket/ui/interval-evidence.ts`; `migrations/core/0068_interval_changes.sql`; `tests/gasket/intervals.mjs`; `tests/gasket/intervals-browser.mjs`; `tests/gasket/flows.mjs`

**Gap.** None.

#### AGENT-004 — Measure whether reliability actually improves

push-further · **done**

After an approved intervention or PM change, the agent follows the affected assets across the agreed exposure window, compares downtime/failure/cost with baseline and matched peers, and reports confounders and missing coverage. It alerts the lead to worsening or unproven outcomes and proposes a reversal/new investigation; it cannot declare success from fewer logged events alone. Exactly: a lead or owner agrees immutable inclusive baseline and post-change site-local date windows and active same-category peer assets for an approved interval revision or independently reviewed work intervention. Assessments use complete past windows, actual good normalized hour-counter endpoints (including the closing midnight), clipped nondegraded downtime and native actual USD cost postings; missing exposure or cost is unknown, never zero or interpolated. The subject's per-operating-hour changes are compared with pooled peer-rate changes; nominal production reduction, held readings, unknown wall hours, age, duty and later interventions stay explicit. Observational improvement needs complete measured exposure and costs, no worsening subject rate and a favorable change beyond matched peers; fewer events from less operation alone is no improvement, and no causal success, significance or invoked model is claimed. Each source set retains one immutable assessment. Worsening or unproven outcomes give active leads an in-app notice (owners when none) linked to that report; PM-005 inherits external delivery before it ships. An agent stages a source-bound restoration or investigation proposal for an independent ordinary lead/owner decision; remeasurement refuses stale follow-up and agent actions never apply the reversal themselves. Current calendar/counter changes and independently approved asset work are covered; future intervention doors under AGENT-002 and AGENT-003 inherit source-linked observation before shipping, while ADMIN-002 and ADMIN-003 inherit site scope and delegated rights. **Acceptance evidence:** Approve a PM change, provide post-change operation with lower downtime and then a telemetry gap/production reduction. Inspect exposure-normalized results, stated uncertainty and a human-approved reversal proposal when failures worsen.

**Evidence.** `src/gasket/outcomes.ts`; `src/gasket/outcomes-plan.ts`; `src/gasket/outcome-intervention.ts`; `src/gasket/chasing.ts`; `src/gasket/proposals.ts`; `migrations/core/0069_outcomes.sql`; `tests/gasket/outcomes.mjs`; `tests/gasket/outcomes-browser.mjs`; `tests/gasket/flows.mjs`

**Gap.** None.

#### AGENT-005 — Follow overdue work through verified closure

push-further · **done**

The agent watches work due dates, acknowledgments, findings, parts/access blockers and review evidence, asks the responsible person for the next action and follows promised dates. It proposes reassignment/escalation under the lead's policy and verifies linked corrective outcomes before recommending closure. Humans decide reassignment and independent supervisor approval remains mandatory. A promised date is a site-local calendar day and is missed only after that day ends; an unanswered agent question reaches the lead-approved chase rule's response interval after that many elapsed 24-hour days. Escalation and reassignment proposals retain the work version, rule and cited questions/blockers; changed evidence refuses approval. **Acceptance evidence:** Leave a PM blocked on parts and a repair awaiting review, answer one agent query with a promised date and miss it. Inspect contextual escalation, proposed reassignment and refusal to mark either work or finding closed without technician evidence and supervisor decision.

**Evidence.** `src/gasket/agent-follow-up.ts`; `src/gasket/proposals.ts`; `src/gasket/chasing.ts`; `tests/gasket/agent-follow-up.mjs`; `tests/gasket/agent-follow-up-browser.mjs`

**Gap.** Signed-in agents read due dates, acknowledgments, findings, blockers, promises and linked reviews; query responsible people, escalate under the lead chase rule, propose version-bound human-approved reassignment and recommend closure only after complete independently approved linked outcomes.

#### AGENT-006 — Reconcile spare-parts reality

push-further · **partial**

The agent compares POs, receipts, bills, work consumption, reservations and count variances to find duplicate items, missing movements, unusual demand and replenishment risk. It prepares merge/count/bin/reorder proposals with source citations and quantity/value impact. Staff physically count/receive; authorized humans approve adjustments, merges and spend, never an inferred physical receipt. Current deterministic stock insights treat matching manufacturer and manufacturer number as review candidates, retaining incompatible stocking-unit warnings. Demand compares gross issues (returns remain separate) in adjacent 30-site-day windows inclusive of their end dates; a rise requires more than twice nonzero prior issues, and no prior issues means an unknown trend. Replenishment risk uses the current policy, counts unchanged outstanding orders even when late, and estimates material USD cents at the policy unit price rounded half up excluding freight and tax; it authorizes no spend or delivery. A physical count proposal retains the recorded stock, count variance and its moving-average value under PART-007. **Acceptance evidence:** Provide a duplicate bearing, late PO and inconsistent count/issue history. Inspect cited correction/replenishment proposals and value impacts, approve one after a physical count, and reject an unsupported receipt. Changed stock invalidates the prepared adjustment.

**Evidence.** `src/gasket/stock-insights.ts`; `src/gasket/proposals.ts`; `src/gasket/parts.ts`; `src/gasket/part-merge.ts`; `src/gasket/ui/proposals.ts`; `src/gasket/today.ts`; `src/gasket/ui/settings.ts`; `src/gasket/catalog-snapshot.ts`; `migrations/core/0070_merge_proposals.sql`; `tests/gasket/agent-stock.mjs`; `tests/gasket/agent-stock-browser.mjs`; `tests/gasket/flows.mjs`; `.github/workflows/verify.yml`

**Gap.** Source-bound count and duplicate-merge proposals, stale-stock/dependency guards, retained count/merge quantity and USD impacts, and independent human approval exist. Read-only stock insights discover manufacturer-number duplicate candidates, cite work consumption and count variances, compare adjacent 30-site-day gross-issue windows, and show policy replenishment quantities, estimated material value and late outstanding purchase revisions. Full PO/receipt/bill reconciliation, executable bin/reorder proposals and evidence establishing a missing movement remain absent; deterministic risk evidence is not an autonomous purchasing decision.

#### AGENT-007 — Draft grounded procedures and technician assistance

push-further · **missing**

The assistant retrieves approved manuals, revisioned procedures, prior repairs and authorized asset history to draft checklists or answer technician questions with page/record citations and uncertainty. It also drafts translations of approved procedures, checklist steps and request-form text into a person's display language (ADMIN-013); a translated revision publishes only after a qualified bilingual reviewer approves it, stays linked to its source revision, becomes stale when the source changes, and technicians can open the original authored text beside it. Leads publish procedures after qualified review; unsafe/unsupported actions remain unresolved questions, and uploaded text cannot expand the agent's rights or operate equipment. **Acceptance evidence:** Ask for a repair checklist using an OEM manual and past work, inspect citations and conflicting instructions, then submit malicious instructions inside a manual. Publish only after lead review and verify no authority or procedure revision changes from retrieved text. Draft a Spanish translation of a lockout step, reject a mistranslation, approve a corrected version and verify its source link, then change the source and see the translation marked stale.

**Evidence.** None.

**Gap.** No model-backed maintenance assistant, retrieval, grounded procedure drafting, reviewed translation or qualified review workflow.

#### AGENT-008 — Extract purchasing documents for human review

push-further · **missing**

The agent reads supplier quote, invoice, PO or packing-slip photos/PDFs to propose part/vendor matches, pack conversions, prices, taxes and linked receipt/bill lines with highlighted source regions and confidence. Buyers resolve ambiguous matches and approve documents; the agent never asserts physical delivery or places unapproved spend. **Acceptance evidence:** Upload a skewed packing slip and invoice with a new vendor part, mismatched unit pack and tax. Inspect source-highlighted proposed matches and exceptions, correct them, approve bill creation and confirm no inventory receipt occurs without stores confirmation.

**Evidence.** None.

**Gap.** No document extraction, confidence/source-region matching or reviewed purchasing-document creation.

#### AGENT-009 — Accountable agent execution and measurable value

push-further · **partial**

Owners control model/provider, data scope, budget and revocable per-action grants. Every run records input versions/citations, proposed versus applied actions, cost, human decisions and measured maintenance outcome; private manuals and rates only reach authorized providers under the buyer's terms. Stop/revoke cancels pending authority and uncertain model/provider failures remain visible without fabricated results. Exactly: only an owner grants a run. A grant names one agent identity, the one provider host this installation holds a key for, the exact model id, up to three assets whose records may leave, corrective-work proposals as the only action, a dollar budget with the per-million-token prices the cost is computed from, and caps on proposals and output. People, notes, attachments, pay rates and manual or document files are never sent; posted work costs are sent only when the grant says so and records the provider terms in writing, so the default is deny. The preview shows the exact request, the versioned records in it and the reserve, and a run starts only on that preview's hash. A run makes one provider call with a deadline, no retry and no second provider. The reserve, bounded by the prompt bytes and the output cap at the granted prices, is charged before the call and replaced by the cost from reported usage afterwards; a call that may have been billed but reported no usage keeps the whole reserve, shown as reserved, and a refusal before any work costs nothing. A run only prepares pending proposals as the agent identity, each citing records from its input; it cannot approve, spend, send or change work, and an answer outside the granted shape, scope or citations is refused with no proposal. Revoking permanently ends the grant, marks its running runs revoked, rejects the proposals those runs left pending and drops any answer that arrives later while still recording its cost; decisions already made stay. Every run keeps its grant revision, input versions, provider outcome, cost and basis, tokens, proposals with their human decisions and any measured outcome, and the export lists them without keys or provider text. Run cost and spend are ledger figures of recorded runs, not KPIs: any measure built on them is registered under REPORT-009 first. Runs are started by an owner, never by a schedule: a scheduled or event-started run inherits PM-008's preview, pause and health obligations before it ships, and AGENT-001, AGENT-002 and AGENT-005 through AGENT-008 inherit this grant, budget, scope and revocation for every model call they add (AGENT-007's retrieval of manuals also inherits the terms rule). **Acceptance evidence:** Grant a bounded reliability run with a dollar budget, inspect its data/action preview, approve one proposal and revoke during another run. Export decisions/cost/outcome history; verify no post-revocation writes, secret leakage or invented success after provider failure.

**Evidence.** `src/gasket/agent-grants.ts`; `src/gasket/agent-runs.ts`; `src/gasket/agent-run-input.ts`; `src/gasket/agent-provider.ts`; `src/gasket/agent-run-views.ts`; `src/gasket/ui/agent-runs.ts`; `src/gasket/proposals.ts`; `src/gasket/outcomes.ts`; `migrations/core/0090_agent_runs.sql`; `tests/gasket/agent-runs.mjs`; `tests/gasket/agent-runs-browser.mjs`; `tests/gasket/agent-run-live.mjs`; `tests/gasket/receipts/agent-009-live.json`; `tests/gasket/outcomes.mjs`

**Gap.** Every acceptance point is proved (see ACCEPTANCE.md); the clause stays partial until ct approves the defaults adopted here for privacy, consent and custody: grants and revocation are owner-only; one provider per installation, named by host, with its key held as a private setting and never returned by any door; people, notes, attachments, pay rates and manual or document files are never sent, posted work costs only under provider terms the owner writes down, so private manuals are not sent at all until AGENT-007 defines retrieval; revoking rejects the proposals a grant's runs left pending; reported usage priced at the owner's own rates, never a provider bill reconciliation. Not covered by this slice: scheduled or event-started runs (PM-008 obligations), more than one provider per installation, a provider key declared in the managed hosting deployment specification (self-owned `rer deploy` declares it), and grounded document retrieval (AGENT-007).
