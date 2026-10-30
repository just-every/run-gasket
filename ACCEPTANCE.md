<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Accept a Gasket installation

The primary journey: Bring the equipment estate across, triage a fault, plan qualified work and parts around production, capture and independently review maintenance, reconcile stores and purchasing, then read the equipment’s reliability and complete history.

## Progress

| Tier | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Core | 52 | 55 | 37 | 144 |
| Agent surface | 0 | 7 | 0 | 7 |
| Later | 0 | 0 | 0 | 0 |
| Full target | 52 | 62 | 37 | 151 |

Judged from the code and tests at commit `71ab859aee4bfeca7bdf810a0797ca708c5451d3` (27 October 2026). GAS-06 and the ASSET-006 model compatibility slice are judged from the candidate commit `HEAD` (30 October 2026). MIG-007 is judged from the candidate commit `HEAD` (30 October 2026). Field proof register: 21 rows; 0 passed, 0 failed, 21 not run.

## Core

### Published maintenance guarantees

#### GAS-01 — Set up the site and its people

Core · published · **done** · Cites BASE-ACCESS-001, BASE-ACCESS-002, BASE-ROLE-001, BASE-SIGNIN-001

**Requirement.** The owner configures the initial maintenance site and time zone with lead, maintainer, supervisor and agent memberships. New owner installations start empty. Phone-only membership and Google sign-in are specified by ADMIN-014 and ADMIN-015.

**Acceptance.**
1. Through site and access pages and JSON/form doors, configure a site, invite and sign in each role, change one role and end access.
2. Repeat private reads and writes signed out, forbidden and revoked; require refusal without leaked records.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-01 site and access"
**Gap.** None.

#### GAS-02 — Keep the asset register

Core · published · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-3

**Requirement.** A lead records asset tag, name, serial, location, custodian, category, criticality and counter, gauge or condition meters with units. Edits retain earlier values. Sightings record found, elsewhere or missing; retirement preserves history and prevents new scheduled work.

**Acceptance.**
1. Create and edit an asset through the register, add three meter types, record each sighting outcome and retire another asset.
2. Read its previous identity and history; duplicate tags, stale edits and unauthorized changes are refused.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-02 asset register"
**Gap.** None.

#### GAS-03 — Keep the parts list and reconcile counts

Core · published · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-3

**Requirement.** A lead keeps part numbers, names, units, stock locations and minimum quantities, receives stock and records physical counts. Counts post exact variance movements without rewriting receipts. Quantities are exact to three decimals; stale counts and invalid precision are refused.

**Acceptance.**
1. Receive five units through the parts page, count four against the observed version, inspect the minus-one variance and retained receipt, then submit a stale count and excess precision through the API; neither changes stock.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-03 parts and physical counts"
**Gap.** None.

#### GAS-04 — Write checklists with revisions

Core · published · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-3

**Requirement.** Leads create checklists and publish revisions. Issued work orders keep the exact procedure revision with which they were generated; editing the master never changes issued instructions or earlier results.

**Acceptance.**
1. Create a checklist and issue a PM, publish a revision with an extra step, then open the issued work and revision history.
2. Existing work retains its old steps and later work uses the new revision.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-04 checklist revisions"; `tests/gasket/flows.mjs` — "ASSET-008 scheduled inspection routes across assets"
**Gap.** None.

#### GAS-05 — Schedule preventive work

Core · published · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-3

**Requirement.** Leads define calendar intervals, counter intervals or both, first due date/value and default maintainer. The explicit Create due work orders command generates work due within seven days or at the counter threshold, with at most one open order per schedule. Automatic operation extends this guarantee in PM-001 and PM-002.

**Acceptance.**
1. Create calendar and meter schedules through the API, cross each due boundary and request generation twice.
2. Inspect one linked order per due schedule, the retained due value and no duplicate open work.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-05 schedules create due work once"; `tests/gasket/flows.mjs` — "ASSET-005 meters, units and counter corrections"
**Gap.** None.

#### GAS-06 — Assign work

Core · published · **done** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Leads create corrective work against an asset and assign or reassign work to active maintainers, leads or the owner; technicians also create and self-assign their own unplanned work under FIELD-009. Maintainers have their own work list; assigning a supervisor, ended member or unknown person is refused; agent preparation never represents an agent as the physical maintainer.

**Acceptance.**
1. Raise corrective work through the form door, assign and reassign it, then read both maintainers' own queues.
2. Attempt each ineligible assignee through the JSON door and inspect unchanged assignment.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-06 assign work"
**Gap.** None.

#### GAS-07 — Capture the inspection

Core · published · **done** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** The assigned maintainer records pass, fail or needs-attention results with notes, uploads photo or document evidence and records dated meter or condition readings. Other people cannot record the work. Backwards counter readings and future readings are refused; evidence downloads require access.

**Acceptance.**
1. As the assigned technician, enter all result types, upload and download evidence, and record readings through work pages/API.
2. Try another technician, a backwards counter and a future date; require refusal and retained original evidence.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-07 inspection, evidence and readings"
**Gap.** None.

#### GAS-08 — Issue and return work parts

Core · published · **done** · From GAS-08 · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1

**Requirement.** Assigned maintainers issue available parts and return no more than their holdings.

**Acceptance.**
1. Issue and return parts through the work form and API; inspect exact stock and retained work movements.
2. Attempt excess stock, excess returns and another maintainer’s work; inspect refusal and unchanged stock.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-08, GAS-14 and GAS-15 parts, downtime and findings"
**Gap.** None.

#### GAS-14 — Record asset downtime

Core · published · **done** · From GAS-08 · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1, D-3

**Requirement.** Assigned maintainers record outage start and end with computed minutes. One asset has at most one open downtime.

**Acceptance.**
1. Open and close downtime through work forms and API; inspect computed minutes.
2. Try overlapping open downtime and an end before its start; inspect refusal and unchanged outage evidence.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-08, GAS-14 and GAS-15 parts, downtime and findings"
**Gap.** None.

#### GAS-15 — Record findings and corrective follow-up

Core · published · **done** · From GAS-08 · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1, D-3

**Requirement.** Assigned maintainers record severity-coded findings. A finding requesting follow-up creates linked corrective work.

**Acceptance.**
1. Record a severity-coded finding requesting follow-up; read the linked corrective work and its source finding.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-08, GAS-14 and GAS-15 parts, downtime and findings"
**Gap.** None.

#### GAS-09 — Submit and review

Core · published · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-2

**Requirement.** Submission requires all checklist results, a corrective finding linked to every failed or needs-attention result and closed downtime. Supervisors approve the exact reviewed version or return it with a reason. A person who performed work cannot approve it; stale review is refused. Approval closes work and advances the schedule.

**Acceptance.**
1. Submit two failed steps with only one finding and require refusal, then supply linked findings and complete inspection evidence.
2. Return with a reason, resubmit, attempt self-review and stale approval, and approve independently.
3. Inspect retained reviews, closure and next schedule due point.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-09 submit and review"; `tests/gasket/flows.mjs` — "FIELD-007 crew completion and independent review"
**Gap.** None.

#### GAS-10 — Watch overdue work and downtime

Core · published · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Leads and supervisors see overdue work, work awaiting review, unresolved corrective follow-ups, assets down now, downtime minutes per asset over the last 30 days and stock below minimum. Open downtime contributes elapsed time; historic outages are clipped to the reporting window.

**Acceptance.**
1. Open the board as lead and supervisor with overdue, submitted, failed and down assets plus low stock.
2. Compare counts and clipped minutes with source records; a maintainer cannot read the board API.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-10 overdue and downtime board": lead and supervisor reads with all board categories; persisted source timestamps and durations; expired history excluded; closed and open outages clipped; per-asset minutes and event counts; board pages and maintainer refusal.
**Gap.** Main's partial judgment is retained pending acceptance review of the expanded historic-window clipping and elapsed open-downtime public-door journey. The candidate adds persisted-source reconciliation and lead/supervisor board assertions without changing the judgment.

#### GAS-11 — Read and keep the history

Core · published · **done** · Cites BASE-DATA-001

**Requirement.** Members read asset work, results, readings, part movements, downtime, findings and reviews with actors and dates; leads and supervisors download the same history as CSV.

**Acceptance.**
1. Read the full asset history and authorized CSV through public doors, compare events and attribution, export a populated installation using rer export, restore into an empty installation using rer import and compare domain records and attachment digests.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-11 asset history and CSV"; `tests/gasket/flows.mjs` — "GAS-11 rer export and rer import keep every record"
**Gap.** None.

#### GAS-12 — Move in from MaintainX

Core · published · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-3

**Requirement.** The existing register importer accepts MaintainX asset, part and meter-reading CSV columns. A no-write preview lists creates, rejected rows and attention items; apply is bound to the reviewed fingerprint, journaled and idempotent. Undo removes only that import and refuses when later records depend on it. MIG-002 extends this to complete work history.

**Acceptance.**
1. Upload the three CSVs through move-in, compare a no-write preview, refuse a changed fingerprint, apply and reapply, undo and import again.
2. Create dependent Gasket records and verify undo reports blockers without removing data.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-12 MaintainX move-in"
**Gap.** None.

#### GAS-13 — Version-bound maintenance proposals

Core · published · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-012 · Rules D-2

**Requirement.** Agents prepare schedule, corrective-work and physical-count proposals with reasoning and relied-on record versions. Applying a schedule or corrective change carries standard; a stock adjustment also carries money. The company policy decides whether an authorized call runs, is reviewed, waits for approval or is refused. Under the held company policy, a different lead or owner decides the exact proposal revision; stale proposals have no effect.

**Acceptance.**
1. Under the held company policy, prepare each proposal through the API, reject one and approve another as a different lead; inspect the attributed decision and the normal maintenance result.
2. Change underlying stock and try the stale proposal; inspect refusal and unchanged stock. Under that policy, try direct mutation and self-approval and inspect refusal.

**Evidence.** `tests/gasket/flows.mjs` — "GAS-13 agent prepares, a person approves"
**Gap.** A public-door journey selecting company policy and proving standard/money decisions is missing. The cited journeys show fixed-gate proposals, exact-hash decisions, stale stock refusal and attribution.

#### HTTP-001 — Health, Lobby and real 404s

Core · published · **partial** · Cites BASE-OPS-001, BASE-ACCESS-002, BASE-INSTALL-001, BASE-DATA-005

**Requirement.** The installed origin presents Gasket’s branded Lobby and deployment identity; unknown maintenance document and API routes are real not-found responses. Gasket is a free, MIT-licensed edition.

**Acceptance.**
1. Request the installed Lobby, deployment health, unknown maintenance document, unknown API and an unknown health subpath; inspect branding, deployment identity and status, then try a private maintenance page signed out.

**Evidence.** `tests/runtime.mjs` — "HTTP-001 passed against emitted local Worker: health, the installed homepage, HTTP and document 404s"
**Gap.** A public-door journey opening a private maintenance page signed out within the old cited evidence is missing. The cited journeys show branded Lobby, deployment identity and unknown-route 404s.

### Administration, trust and ownership

#### ADMIN-001 — US operating defaults

Core · target · **partial**

**Requirement.** A US owner configures USD costs, US English as the organization's default display language (ADMIN-013 lets each person choose Spanish or another language), a US postal address and site time zones with daylight saving. Assets support customary and SI units with explicit conversions; schedules and reports show site-local dates and unambiguous timestamps. Existing data keeps its recorded units and currency.

**Acceptance.**
1. Set up Ohio and Arizona sites, enter USD hourly rates and Fahrenheit/psi readings, cross a daylight-saving boundary and export.
2. Verify due times, currency, unit labels and unchanged original readings.

**Evidence.** `src/gasket/site.ts`; `src/gasket/dates.ts`; `src/gasket/ui/settings.ts`; `src/gasket/bad-actors.ts`; `src/gasket/lifecycle.ts`; `tests/gasket/flows.mjs`
**Gap.** US English, US time-zone choices, site-local dates, recorded meter units and USD work/lifecycle costs exist; organization postal address, explicit customary/SI conversions, multiple US sites and the complete daylight-saving/export journey remain missing.

#### ADMIN-002 — Multiple sites and shared governance

Core · target · **partial**

**Requirement.** One organization manages sites, buildings, lines and storerooms with local calendars and shared asset/part standards. Owners delegate site managers; site membership scopes every list, attachment, report and write. Cross-site transfers retain identity and history. Reparenting a hierarchy entry (ASSET-001) under another site's parent needs management rights at both sites and is otherwise refused. The technician create-work right (FIELD-009) is turned off and on per site by its owner or site manager: that site's technicians are refused at every door while other sites' technicians still create work. The stores report (PART-009) filters by any site the reader may see. Before additional sites ship, this clause scopes REQ-001/REQ-002 portals, published targets and intake and REQ-003 queues, duplicate groups, source photos and work conversion to the authorized site. REPORT-006 multi-site authorization applies at every report, schedule, draft, preview, dispatch and download door before additional sites become operational.

**Acceptance.**
1. Create two sites with distinct managers, move an asset with its meter history, then call each private door using the other site's member.
2. Inspect denied access, correct local dates and organization rollups.
3. As a manager of one site only, move a machine under the other site's line and see it refused (ASSET-001).
4. Turn the technician create-work right off at one site and see that site's technicians refused at the web, API and app doors while the other site's technicians still create work (FIELD-009).

**Evidence.** `tests/gasket/flows.mjs` GAS-01 site and access, extended by `tests/gasket/site-access.mjs` siteAccessJourney: owner-created planned sites with distinct recorded managers; metadata visibility and private roster refusal; stale metadata and membership refusal; current-session planned membership revocation; no operational fallback across enumerated JSON, page and download doors and representative form writes for planned or unauthorized site selection; ended-member exclusion; attributed site audit with scoped search and download. `src/gasket/site-access.ts`; `src/gasket/site-context.ts`; `migrations/core/0099_site_registry.sql`.
**Gap.** Only the primary site is operational. Additional sites hold planned metadata and membership only; there is no activation door. Remaining: site-scoped estate records at every list, record, attachment, report, write and download door; asset moves preserving meter and maintenance history; destination hierarchy authority; correct operational local dates and organization rollups; independent technician create-work rights at each site across web, API and app; operational membership revocation in background jobs; complete multi-site archive reconciliation. Conservative default adopted pending CT approval: only the active owner maintains site metadata and membership; recorded managers gain no extra role permissions or personnel access. PLAN-004 qualification and tool records, REQ-001 through REQ-003 intake and source evidence, REPORT-006 preview, dispatch and download, and existing recovery duties remain subject to this full site boundary before additional sites become operational.

#### ADMIN-003 — Role rights and separation of duties

Core · target · **partial** · Cites BASE-ROLE-001

**Requirement.** Owner controls identity, integrations and retention; site admin manages that site; lead plans/assigns and manages registers; technician creates corrective and emergency work, including work already completed, against assets and locations (FIELD-009) and records assigned or self-assigned work; supervisor reviews independently; storeroom clerk counts/issues/receives, and a stores supervisor independently approves count variances (PART-004); buyer drafts POs; purchasing approver authorizes spend; analyst reads authorized reports. Permission templates and custom grants keep work creation, execution, approval and cost-rate visibility separate. Create work is a default technician right that an owner or site admin revokes per role and site, and a ready-made Operator template sees and records only work assigned to that person. Broader delegated scheduling rights inherited from REPORT-006 must preserve current report and export permissions, attributable preparation, explicit owner authorization of the saved revision and separation of preparation from outbound authority. PLAN-010 and RL-12 add explicit revocable qualification and tool-record creation, correction and retirement grants within authorized sites and records, independently of planning, erasure, retention and private-document authority.

**Acceptance.**
1. Sign in each role and exercise its permitted public doors, including direct forbidden writes/exports.
2. Add a custom site-scoped role, revoke it and test old sessions; technician work and purchasing cannot be self-approved.
3. Remove create work from the technician role at one site and see that site's technicians refused at app and API while the other site's technicians still create work; give a person the Operator template and see only their assigned work.

**Evidence.** `src/gasket/actor.ts`; `src/gasket/site.ts`; `tests/gasket/flows.mjs`
**Gap.** Fixed owner/lead/maintainer/supervisor/agent roles exist; a technician create-work right (default, self-assigned or left unassigned, owner-revocable for the site; FIELD-009) exists; site, stores, purchasing, analyst roles, custom grants, per-site revocation across sites of the create-work right and the Operator template do not. Broader delegated scheduling rights inherited from REPORT-006 remain unbuilt; existing assigned preparation grants no outbound authority.

#### ADMIN-004 — Requester and contractor access

Core · target · **missing** · Cites BASE-ROLE-001

**Requirement.** Requesters and contractors are invited by mobile phone number or email address (ADMIN-014); neither needs a company email. Requesters submit and follow their own faults without seeing private maintenance costs or other people's requests. Contractors receive expiring access to named work, instructions and evidence, record completion and costs, and cannot browse the asset estate or approve their work. Neither ever reads the team's internal comments or their photos (PLAN-006). Requesters and contractors never create work orders at any door (FIELD-009); they use request intake (REQ-001, REQ-002).

**Acceptance.**
1. Invite a requester by US mobile number only and an external electrician by email, have the requester sign in with a one-time SMS code, submit a fault and follow it, and finish assigned contractor work.
2. Change URL/API identifiers to other records, inspect denied access, expire the contractor grant and test its active session.
3. The requester and the contractor are refused a work order's and an asset's internal comments and comment photos (PLAN-006) by URL and API.
4. A requester and a contractor are refused work creation at the web, API and app doors (FIELD-009).

**Evidence.** None.
**Gap.** No requester or contractor identity, scoped portal or expiring external work grant.

#### ADMIN-005 — Enterprise identity lifecycle

Core · target · **missing** · Cites BASE-SIGNIN-001, BASE-SIGNIN-002, BASE-ROLE-001 · Register R-5, R-6

**Requirement.** Microsoft Entra ID and Okta group mappings select maintenance organization and site roles. Phone-only technicians have the same enterprise lifecycle; ending access or changing a phone number fences queued mobile and offline work at sync.

**Acceptance.**
1. Connect each identity provider at its network edge, provision two site groups, require MFA, deprovision an active technician and attempt web/API/offline sync.
2. Repeat for a phone-only technician with queued offline work: end their access and attempt app sync.
3. Inspect refusal of every attempt and a logged owner recovery.

**Evidence.** None.
**Gap.** No SSO, SCIM, MFA policy or group/site mapping.

#### ADMIN-006 — Attributed append-only audit

Core · target · **done** · Cites BASE-AUDIT-001, BASE-OPS-005, BASE-AGENT-009 · Rules D-3

**Requirement.** The maintenance audit covers immutable readings and stock movements, checklist revisions, work reviews, import decisions and integration or AI authority. Search and export support maintenance site and action filters, and every row names its site. A single-site installation refuses another site’s identifier; ADMIN-002 extends this to multiple sites.

**Acceptance.**
1. Perform work, count, review and import through public doors, trigger a stale write, and inspect the audit download.
2. The failed write adds no business change; previous readings remain visible and integration/AI actions name their authority.
3. Filter search and export by the installation's site and by another site id (404); every entry and CSV row names its site.

**Evidence.** `tests/gasket/flows.mjs` — "ADMIN-006 audit search, authority and download"
**Gap.** None.

#### ADMIN-007 — Retention and verifiable erasure

Core · target · **partial** · Cites BASE-DATA-002, BASE-DATA-003, BASE-DATA-006

**Requirement.** The maintenance retention plan covers attachments, request contacts, users and maintenance records. Its erasure dependency inventory includes copied corrective fault details and obligations attached to held or signed work. Prior recipient downloads remain outside local erasure. RL-9 preserves indefinite retention and maintenance evidence obligations; eligible erasure remains required. PLAN-011 includes retired qualification families, corrections, reminder captures, stewardship scope labels and hold payloads in the maintenance erasure inventory under RL-12; complete copied-data reconciliation remains required.

**Acceptance.**
1. Create a held work record and an eligible requester/photo, preview and apply erasure through the owner door, inspect bytes and anonymized audit, and restore an older archive with the later erasure journal.
2. Held records remain and erased records do not reappear.

**Evidence.** `src/gasket/retention.ts`; `src/gasket/request-erasure.ts`; `src/gasket/attachment-erasure.ts`; `tests/gasket/search.mjs` retentionJourney: owner-only policy changes, minimum-age refusals, request, work, attachment and user holds, byte-preserving refusals, stale revisions, explicit release, signed, held, required and certificate original preservation, optional companion evidence on certificate work and signed-work request source preservation with unchanged bytes and per-type results, confirmed erasure and stable per-type retry results; `tests/gasket/recovery.mjs` recoveryJourney: request and optional work originals remain absent after later restore and a later journal fences an older archive.
**Gap.** Ct approved PARTIAL on 25 October 2026: owners manage retention minima and holds; retain indefinitely with no automatic erasure. Held, submitted, signed, required and certificate evidence is preserved; maintenance records and anonymized audit remain. Optional work originals on never-submitted, unsigned and unheld work require fresh owner confirmation. Public erasure refusals preserve original bytes, dependency counts, maintenance records and per-type results for held, signed and certificate evidence. User and full maintenance-record erasure remains partial under ADMIN-016; dependencies and per-type results for remaining file classes remain unproved.

#### ADMIN-008 — Protected credentials and private attachments

Core · target · **partial** · Cites BASE-SECRET-001, BASE-INPUT-003, BASE-ROLE-001, BASE-DATA-004

**Requirement.** Provider tokens, sensor certificates and mobile credentials are encrypted under installation authority, narrowly scoped, rotatable and revocable. Original attachments use Cloudflare R2 or owner object storage with resumable uploads, declared limits, malware handling and safe rendering. Telemetry aggregation runs in bounded background jobs rather than long request-time database scans. Logs, exports and AI context redact secrets; disconnecting a provider stops new sends.

**Acceptance.**
1. Connect/rotate/revoke a provider, upload a private manual and hostile file, then use unauthorized, expired and cross-site download links.
2. Export and inspect logs/context for planted secrets; revoked connectors produce no new outbound requests.

**Evidence.** `tests/gasket/private-file-links.mjs` — privateFileLinksJourney: primary-site private-manual issuance and download, original-byte digests, immutable revision identity, expiry, forged-link refusal, other actor and session refusal, signed-out and revoked-session refusal, ended access, planned-site refusal and browser proof at 1440 and 390; existing authenticated evidence access in `src/gasket/work.ts` and `src/gasket/actor.ts`.
**Gap.** Primary-site manual links last five minutes, remain bound to the issuing authenticated session and exact file revision, recheck current record access at issuance and download, and grant no delegated access. Remaining: cross-site record authorization and link proof under ADMIN-002; other private-file classes; installation-controlled encryption, narrow scope, rotation and revocation for provider tokens, sensor certificates and mobile credentials; provider disconnect stopping new sends; qualified object storage, resumable uploads and declared limits; malware handling and hostile-file safe-rendering qualification; bounded background telemetry aggregation; complete secret redaction from logs, exports and AI context.

#### ADMIN-009 — Complete portable archive and inactive restore

Core · target · **partial** · Cites BASE-DATA-001, BASE-BACKUP-001, BASE-SECRET-001

**Requirement.** The portable maintenance archive inventories every site, asset, work/history, PM, request, stock movement, purchase order, cost, original attachment, audit entry and import mapping with schema versions, counts and digests. Restored maintenance automation and service credentials remain inactive until the owner deliberately reconnects them. Qualification erasure results, later-journal fencing and inactive stewardship grants remain part of the portable maintenance archive under RL-12.

**Acceptance.**
1. Export a realistic multi-site estate through the supported command/download, interrupt/resume, validate digests and restore to a fresh installation.
2. Compare every record class; corrupt and nonempty restores write nothing and restored PMs do not send or buy.
3. After erasing a retired qualification family, inspect its durable results in a later archive and restore them without resurrection; refuse an older archive fenced by the later journal, and inspect inactive restored stewardship grants.

**Evidence.** `scripts/installer/archive-policy.mjs`; `tests/gasket/recovery.mjs` recoveryJourney: supported export and import validate corruption, reject nonempty targets, exclude sessions and signing keys, preserve accepted work and pause restored PMs and connectors; `tests/gasket/automation.mjs` connectorJourney: fresh-key reconnection and pending delivery idempotency; `tests/gasket/flows.mjs` GAS-11 rer export and rer import keep every record: populated attachment digests and records.
**Gap.** Single-site inactive restore is implemented. Complete multi-site manifest and record-class reconciliation and interrupted and resumed export remain unproved. recoveryJourney also proves request erasure checkpoints fence older archives with a later journal; other domain erasure types remain unfinished.

#### ADMIN-010 — Backup recovery and connector operations

Core · target · **done** · Cites BASE-BACKUP-001, BASE-OPS-003, BASE-OPS-004

**Requirement.** The maintenance operations view relates background-worker and connector lag, failed jobs and quotas to accepted work, PM occurrences, purchasing receipts and notification identities. An operator can pause a failing maintenance automation while retaining its history; recovered work and resumed delivery retain their business identities.

**Acceptance.**
1. Back up populated data, interrupt a PM/receipt job, recover to another installation and reconnect intentionally.
2. Inspect visible recovery point, job errors and deduplicated resumed work through owner operations pages.

**Evidence.** `tests/gasket/recovery.mjs` — "recoveryJourney"; `tests/gasket/automation.mjs` — "connectorJourney"; `tests/gasket/automation.mjs` — "automationJourney"
**Gap.** None.

#### ADMIN-011 — Accessible responsive maintenance workspace

Core · target · **partial** · Cites BASE-ACCESSIBILITY-001, BASE-PUBLIC-003 · Register R-1, R-2

**Requirement.** Setup, intake, planning, stores, reporting and technician execution keep long maintenance records and errors readable. Failed saves retain entered work and disclose whether it persisted.

**Acceptance.**
1. Use realistic long asset names and instructions through setup, intake, planning, stores, reports and work execution under the Base accessibility bar.
2. Induce a save failure, reload the confirmed maintenance record and inspect retained draft, focus, text errors and absence of horizontal clipping.

**Evidence.** `tests/gasket/intervals-browser.mjs` — workspaceBrowser and noScriptDrafts: site edits, people and roles, long asset registration, meters, checklist authoring, preventive scheduling and execution, intake refusal and confirmation, triage, conversion, assignment, slot confirmation, stock receiving and counts, parts issue and return, filtered reporting, time and evidence, independent review and closure. Assertions run at 1440 with one 390 menu smoke; browserProof captures the named screens at 1440 and 390. Named controls, landmarks, headings, visible keyboard focus, text errors and clipping are asserted. Refused time saves retain the draft and independently reload with no write; a lost reply confirms one persisted write through its member-bound receipt and refuses replay; a real database-edge failure after commit reports its persisted step. Native forms retain text, selections and attachment bytes, permit correction without duplicate effects, and retain submitted values after session expiry. `tests/gasket/part-catalog-browser.mjs` — catalogBrowser: a refused catalog preview retains its supplier and file, changes no part, and a replacement file reaches review and import; receiving and approved merge remain covered. `tests/gasket/requests.mjs` — requestPortalJourney and requestDraftJourney retain the intake, private draft, lost-response and source-evidence checks. These journeys run in existing required push Verify jobs. The workspaceBrowser submit helper proves before-commit refusal, unchanged independently reloaded records, retained fields, focused text errors, a failed zero-step receipt, a successful retry with its reply lost, a saved nonzero-step receipt and disabled replay for 39 distinct actions, including giving, changing and ending access. noScriptDrafts proves that unreachable native results leave the source text, selections and original attachment bytes open; a request lost before arrival has no receipt or effect, a reply lost after commit has one saved record and the same draft cannot repeat it. Native attachment recovery retains one submission identity and permits correction. A refused native role change retains the selector associated with its row form, changes no authority, and a deliberate correction applies that retained role. `tests/gasket/form-save-interruptions.mjs` — saveSnapshot.interrupt: for each committed step of the 39 distinct workspace actions exercised by workspaceBrowser, an isolated installation injects a real database-edge failure, compares the receipt with independently observed commits including recovery writes, restarts the Worker, reloads the exact receipt and confirmed records, and refuses duplicate effects. The additional browser flows correct asset details, revise a procedure without changing issued work, raise corrective work, record downtime and original attachment bytes, cancel and reopen work, register a supplier and cost center, request and draft a purchase, and independently approve a cycle-count variance. workspaceBrowser inspects all 42 fixed HTML workspace destinations and follows populated record links for assistive names, landmarks, headings, keyboard focus and readable long records, with captures at 1440 and 390.
**Gap.** Record-dependent conditional states and specialized workspace actions beyond the 39 named saves remain unproved. Before-commit refusal, lost-success-reply recovery, and interruption after each committed step with fresh-Worker receipt and replay checks cover those 39 actions only. Complete target-workspace journey coverage remains required. Running or unreachable receipts require inspection before another submission.

#### ADMIN-012 — Search, saved views and bulk maintenance actions

Core · target · **partial** · Cites BASE-ROLE-001

**Requirement.** People search/filter assets, work, requests, procedures, parts and vendors by tag, serial, site, owner, date, status and custom fields. Saved views and permission-aware bulk edit/assign/export show a preview and per-record failures; pagination never silently omits the estate.

**Acceptance.**
1. Find a serial among thousands of assets, save a cross-filtered view, bulk reassign selected work including a forbidden record and export all pages.
2. Inspect exact selection, denial and totals.

**Evidence.** `src/gasket/search.ts`; `tests/gasket/search.mjs` searchJourney: exact serial search, cross-filtered saved views, complete paged JSON export, scoped work and request denial; `tests/gasket/flows.mjs` PLAN-007 bulk actions and controlled cancellation: per-row bulk outcomes.
**Gap.** JSON search covers current assets, work, requests, procedures, parts and vendors with totals and cursors; existing work custom fields and asset and part custom fields are filterable. `tests/gasket/custom-fields.mjs` customFieldsJourney proves asset and part value filters and a saved custom-field view. Multi-site scope, UI search and saved views, and Work-page bulk selection remain unproved; the last item stays with br under PLAN-007. Ct approved: saved filters are private by default, sharing is owner-only and every read re-evaluates record access. searchJourney asserts a shared filter returns no rows on the next read after revoking request-record permission, and direct request detail is refused.

#### ADMIN-013 — Per-person display language

Core · target · **partial**

**Requirement.** Owners set the organization's default display language and every person (owner, lead, technician, supervisor, stores, purchasing, requester, contractor) chooses their own. US English and US Spanish ship complete at launch; the published catalog covers at least 30 display languages, including French, Portuguese, Vietnamese, Simplified and Traditional Chinese, Korean, Tagalog, Polish and right-to-left Arabic. The chosen language applies to the web workspace, the iOS and Android app (FIELD-001), the requester portal and QR fault form (REQ-001, REQ-002), email and push notices (PM-005, INT-004), printed work packs (FIELD-008) and PDF reports (REPORT-006). Signed-out requesters get the portal's site default or their browser preference and can switch. Dates and numbers follow the person's locale while stored values, units, USD amounts and timestamps are unchanged. User-entered text (asset names, checklist steps, notes, readings, comments) is shown exactly as authored, and translated procedures come only from AGENT-007’s source-linked translations under the company’s policy for commitment. A missing translation shows the English string with a visible untranslated marker, never a blank control, and owners can download a per-language completeness report. The existing operator portal and scoped QR form under REQ-001/REQ-002 inherit this full obligation: complete language catalogs, person/site/browser preference, locale formatting and visible fallback must be asserted at both current intake doors by this clause before its language support ships. Localized scheduled report packs inherited from REPORT-006 follow this per-person language and locale duty while preserving stored source values and authored text.

**Acceptance.**
1. Set the organization default to English and one technician and one requester to Spanish.
2. On the technician's phone app, the requester's QR fault form and portal, an emailed and a push notification, and a printed work pack, show interface text in Spanish while user-entered checklist text, readings, units, USD amounts and audit attribution stay byte-for-byte unchanged and an English lead still sees English.
3. Remove one Spanish catalog string and show the visible English fallback marker, not a blank control, plus the completeness report naming it.
4. Switch a user to Arabic and check right-to-left layout at 390 width without clipping.

**Evidence.** `migrations/core/0105_display_languages.sql`; `tests/gasket/languages.mjs` — languageJourney: owner organization default and independent self-only preferences for existing human members, signed-out browser and site defaults and explicit switching without identity, forbidden member and default changes and revoked-session refusal, complete primary-site English and Spanish portal and decoded QR intake strings, localized validation and retained-form recovery, opted-in isolated drafts and lost-response exactly-once retry, unchanged authored answers and values, original photo digests and human attribution, visible English fallback after an owner removes a Spanish string and matching owner-only completeness download. Browser proof covers intake, draft recovery, retry, confirmation, fallback and Settings at 1440 and 390. `tests/gasket/requests.mjs` — requestPortalJourney and requestDraftJourney retain intake consent, private-file access, erasure and sign-out draft fencing.
**Gap.** Primary-site intake foundation only. Remaining: complete workspace and all-role localization; requester, contractor, stores and purchasing identities not yet built; the full catalog of at least 30 languages, including Arabic right-to-left qualification; locale date and number formatting; localized email and APNs and FCM push delivery; native iOS and Android app under FIELD-001; printed work packs under FIELD-008; completed-work PDFs and scheduled report packs under REPORT-010 and REPORT-006; reviewed authored procedure translations under AGENT-007; operational multi-site language defaults and authorization under ADMIN-002. Owner-only interface-catalog maintenance grants no delegated access. REQ-001 and REQ-002 retain the full language and locale obligation beyond this initial English and Spanish interface slice. No device, provider, role or site prerequisite is released.

#### ADMIN-014 — Phone-number invites and SMS sign-in

Core · target · **missing** · Cites BASE-ACCESS-001, BASE-ACCESS-002, BASE-SECRET-001, BASE-MAIL-001

**Requirement.** An owner, site admin or lead invites any person (technician, supervisor, storeroom clerk, buyer, requester or contractor) by mobile phone number or by email address; neither is required. A phone invite is a text message, sent through the owner's connected SMS provider (Twilio or Amazon SNS), with an expiring single-use acceptance link. The person then signs in to the web workspace and the iOS and Android app (FIELD-001) with a six-digit one-time code sent by SMS and valid for 10 minutes. Numbers are stored in E.164 form and identify one person in the organization. Duplicate numbers, malformed numbers and numbers in countries the owner has not enabled (the US and Canada at launch) are refused with a visible reason. A number that has opted out by replying STOP is shown as unreachable rather than silently retried. Code requests are limited to five per number in 15 minutes and per network address, five wrong codes lock the number for 15 minutes, and codes never appear in logs, exports or AI context. A person can add an email address later. Changing a number requires a code sent to the new number. Changing the number or ending access revokes every existing web and app session, API token and device grant, and the person's queued offline writes are refused at sync with a per-record reason that stays visible to them and their lead (FIELD-003). Invitations, code requests, sign-ins, number changes and opt-outs appear in the audit (ADMIN-006). SMS delivery status is visible on the invitation, and provider acceptance never counts as acceptance by the person. Imported users with only a phone number become phone-identified invitations mapped to their history (MIG-002, MIG-008).

**Acceptance.**
1. Invite a technician by US mobile number only and inspect the SMS invitation at the provider edge.
2. Accept it, sign in to the iOS and Android app with the one-time SMS code, and receive and complete assigned work.
3. Invite a requester the same way and follow their own request.
4. Import a MaintainX user export containing a phone-only user and see that user mapped to their completed work.
5. Submit a duplicate number, a malformed number and a number from a country that is not enabled, and see each refused with a visible reason.
6. Request a sixth code within 15 minutes and see it refused with a retry time, then enter five wrong codes and see the lockout.
7. Change one phone-only technician's number and end another's access while both hold queued offline work, then sync: existing sessions are revoked, every queued write is refused with a visible reason, and the audit records each event.

**Evidence.** None.
**Gap.** Members are invited and identified by email only: `src/gasket/site.ts` refuses a member without a valid email and invites through the email-only Base auth invitation; no phone identity, SMS invitation or one-time code, rate limit, opt-out handling or number-change revocation.

#### ADMIN-015 — Sign in with Google

Core · target · **missing** · Cites BASE-ACCESS-001, BASE-ACCESS-002, BASE-SECRET-001, BASE-MAIL-001

**Requirement.** Owners enable Sign in with Google for the organization, optionally limited to named Google Workspace domains, alongside email-link, SMS (ADMIN-014) and enterprise SSO (ADMIN-005) sign-in. A Google account signs in only when its verified email matches an invited or active member, unless the owner sets a domain rule that admits new members at a named default role for review. Members can link and unlink Google from their profile, and owners can require Google or SSO sign-in for owners and leads. Ending access in Gasket revokes existing sessions regardless of the Google session, and the provider credentials are protected under ADMIN-008.

**Acceptance.**
1. Enable Google with test credentials at the network edge, sign in an invited lead with Google and land on their own work, and see an uninvited Google account and an account outside the allowed Workspace domain refused.
2. Unlink Google and sign in by email link, require Google for leads and see an email-link lead sign-in refused, then end the lead's access and see their Google sign-in refused and their active session revoked.

**Evidence.** None.
**Gap.** The shared Base auth module carries a Google OIDC preset, but Gasket configures no Google provider, member/domain matching, link/unlink or require-Google policy, and no flow proves Google sign-in or revocation.

#### ADMIN-016 — User and full maintenance-record erasure

Core · target · **partial** · Cites BASE-DATA-002, BASE-DATA-003, BASE-DATA-006

**Requirement.** User identities and every maintenance record class are in the erasure inventory, including copied work evidence and references retained by other records. The maintenance dependency preview distinguishes eligible records from the signed, submitted, required and certificate evidence that must remain. Prior recipient downloads are outside local erasure. Erasing an eligible retired qualification family under PLAN-011 does not erase its user identity or discharge complete maintenance-record erasure; retained obligations and prevention of resurrection remain required.

**Acceptance.**
1. Preview an ended non-owner identity and unsigned work alongside signed, submitted, required, certificate and dependent records; inspect each dependency and retained obligation.
2. Apply eligible identity and work erasure, inspect the per-type outcome and original bytes, and restore an older archive with the later erasure journal; erased identities and work do not return.
3. Release a hold and retry; inspect anonymized retained audit and unchanged evidence that another record still requires.

**Evidence.** `src/gasket/record-erasure.ts`; `tests/gasket/search.mjs` retentionJourney invoking eraseFixture in `tests/gasket/record-erasure.mjs`: owner-only preview and confirmed form or JSON erasure, inactive non-owner identity anonymization, eligible unsigned work and original removal, explicit dependency counts, legal holds and minimum ages, signed, required and certificate work refusal, stale preview refusal, stable replay results and redacted audit; erasureGuards proves held former-contributor time preservation, retention of another record audit when an ended lead requests erasure, release followed by eligible work erasure, and deletion of mentioned comments with their notices; erasureScreens runs in push Verify at 1440 and 390. `tests/gasket/recovery.mjs` recoveryJourney: inspect later archive bytes, refuse an older archive with the later erasure journal, restore anonymized identities and absent work and originals.
**Gap.** Conservative defaults adopted pending ct approval: only an interactive owner explicitly confirms the current dependency preview; erase only ended non-owner identities without domain dependencies and never-submitted unsigned work without retained evidence or unknown dependencies. Keep inactive opaque identity markers, attributed audit structure and invitation-cancellation markers; redact eligible private payloads and invalidate older archive epochs atomically. Erasure is refused when another record audit refers to the identity or work; retained audit details are preserved. Full erasure of users with retained domain references, remaining maintenance record classes, complete dependency and copied-data reconciliation, and broader erasure coverage remain unproved. Signed, submitted, required, certificate, held and minimum-age evidence is retained. Prior recipient downloads remain outside local erasure. ADMIN-016 remains partial until ct approves these defaults and the remaining scope is proven.

### Assets, procedures and equipment context

#### ASSET-001 — Asset and location hierarchy

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Leads model site/building/line/machine/component parentage with stable identifiers and locations. Moving a subtree preserves work and rolls cost/downtime up without counting an outage twice; cycles and cross-site unauthorized reparenting are refused. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#asset-001).

**Acceptance.**
1. Create a compressor under a line, move its component subtree and open parent history/report totals.
2. Attempt a cycle and cross-site move; verify refused writes and retained descendant records.

**Evidence.** `tests/gasket/flows.mjs` — "ASSET-001 asset and location hierarchy"
**Gap.** A public-door journey moving between operational sites with refusal and unchanged descendants is missing. The cited journeys show same-site moves, cycle/level/stale refusal and subtree history/totals.

#### ASSET-002 — QR and barcode identification

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-ACCESS-003, BASE-PUBLIC-001

**Requirement.** Leads print durable QR and barcode labels for assets, locations and bins. Scanning with a phone camera or supported scanner opens the authorized record, the scoped fault form (REQ-002) or, for a member with the create-work right, new work against that asset or location (FIELD-009); a public label never grants private work/history access. Reprints preserve identity. The code is the existing explicitly published target identity; leads and owners print it, while the owner configures which display name may be public under REQ-001. An active signed-out scan opens only its scoped intake; a member scan offers the authorized record and the ordinary create-work door if the current site grants it. Retired targets reprint the same code and refuse new faults/work with an explicit retired state; unknown codes are explicit 404s. A bin label identifies its published bin location; PART-001 inherits its stock-bin record link before bin balances ship. FIELD-001 carries native scanner deep links before its app ships.

**Acceptance.**
1. Print asset and location labels, scan at a technician phone and signed-out operator portal, report a fault against a location label with no asset, reprint a retired asset label and scan an unknown code.
2. Inspect correct route, restricted fields and explicit retired/unknown states.

**Evidence.** `tests/gasket/requests.mjs` — "labelsJourney"
**Gap.** None.

#### ASSET-003 — Manuals, documents and warranties

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-INPUT-003

**Requirement.** Assets hold versioned OEM manuals, diagrams, warranties, supplier contacts, commissioning dates and authorized documents with expiry reminders. Technicians see the version linked to issued work; offline packs include approved files and retain original attribution. A document is a manual, diagram, warranty, authorization (permit, licence or certificate) or other document of one asset, kept as numbered revisions of a PDF, image or plain-text file of up to 1.5 MB that never change or go away; each revision names its source (publisher and reference) and who added it when. Leads (and the owner) add documents, revisions and contacts; adding a revision, from the revision the lead read (a stale one is refused), is its approval and makes it the master. A lead links a document to open work on the same asset, pinning the current revision or a named earlier one; the work shows and packs that revision, marked when the master has moved on, until a lead links it again. The job pack is one ZIP download of the work order's summary, the pinned files unchanged and a manifest of each file's document, revision, original name, source, SHA-256 and who added it; FIELD-002's offline packs inherit the same pinned files and attribution before they ship. An expiring document names an active member as its owner and reminder days (0 to 365, default 30): on a scheduler run (PM-001) the owner gets one in-app notice once the site's day is within that many days before the expiry date and one more on or after it, and a changed date asks again; email and push wait for PM-005. Supplier, manufacturer and service contacts, each with a phone or email, are kept on the asset; commissioning dates are ASSET-007's lifecycle facts.

**Acceptance.**
1. Attach two manual revisions, link one to work, set a warranty expiration and download the job pack.
2. Change the master and inspect issued/offline documents plus the named owner's expiry reminder.

**Evidence.** `tests/gasket/flows.mjs` — "ASSET-003 manuals, documents and warranties"
**Gap.** A public-door journey reading pinned manual bytes and attribution from a native offline pack is missing. The cited journeys show document revisions, original job packs, expiry reminders and work pinning.

#### ASSET-004 — Status, criticality and failure taxonomy

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Asset states distinguish available, degraded, down, out of service and retired; criticality, risk, failure mode, cause and remedy codes are maintained centrally and mapped on imports. A status change keeps its effective time and reason; manual and telemetry disagreement is visible. The catalog is one site-wide list per kind: criticality is an ordered list of levels (seeded Normal, Important, Critical) that leads add to, reorder, relabel and retire, and risk, failure mode, cause and remedy codes are maintained the same way. A code's key never changes; every record keeps the code it was given, a retired code stays readable on it and is no longer given to new records or matched by imports. An imported value maps onto the active code whose key, label or one of its import names equals it, ignoring case; a value that matches none is refused for criticality and moves in unclassified, with an attention item, for a failure code. Findings carry optional failure mode, cause, remedy and risk codes, and the failure report counts findings and moved-in work by code, lists what is unclassified and names the assets whose evidence disagrees with their declared state.

**Acceptance.**
1. Take a critical pump down, correct its outage classification and map an imported failure code.
2. Inspect effective status history and unclassified/contradictory evidence in reports without rewriting the original event.

**Evidence.** `tests/gasket/flows.mjs` — "ASSET-004 status, criticality and failure taxonomy"
**Gap.** None.

#### ASSET-005 — Meters, units and counter corrections

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Meters record source time, receipt time, unit, quality and provenance for counter/gauge/condition readings. Reset, replacement, rollover and corrected readings require an explained append-only adjustment; stale or suspect readings cannot silently fire PMs or reverse counters. Staleness is per meter feed: each meter declares a feed window in whole hours (1 to 168, 24 by default; a daily-cadence feed can declare 36), and a feed reading received more than that window after its source time is stale. Manual readings, attested by the person who took them on a work order, are not aged. A reading keeps the quality it was received with when the window later changes, and creating due work lists the schedules that stale or suspect readings hold back.

**Acceptance.**
1. Enter manual readings then a replacement counter and late/corrected feed through public doors.
2. Compare normalized run hours, quality flags and due work, and attempt an unexplained backwards reading.

**Evidence.** `tests/gasket/flows.mjs` — "ASSET-005 meters, units and counter corrections"
**Gap.** None.

#### ASSET-006 — Bill of materials and interchangeable spares

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Each asset/component has a revisioned bill of materials, required quantities, approved substitutes, compatible serial/model ranges and linked tools. Work planning sees stock at eligible storerooms and warns when a substitute is not approved. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#asset-006).

**Acceptance.**
1. Create a motor BOM with two approved bearings and a serial restriction, plan a repair with one out of stock and select a substitute.
2. Inspect compatibility and quantities on the resulting work/parts reservation.

**Evidence.** `tests/gasket/flows.mjs` — "ASSET-006 bill of materials and interchangeable spares"; `tests/gasket/recovery.mjs` — "recoveryJourney"
**Gap.** Stock per eligible storeroom and complete bin allocation, valuation and count reconciliation under PART-001 and PART-002 remain unproved. Operational additional-site scope retains ADMIN-002 and its conservative custody default awaiting CT approval; in-transit custody retains PART-006. The Base 0.2.84 hold and native, offline and device qualification remain unchanged. The primary-site journeys prove lead-managed model identity, combined serial and model restrictions, unchanged stock and reservations on incompatible requests, approved substitution, historical revisions and inactive restoration.

#### ASSET-007 — Asset lifecycle and replacement decision

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Leads record purchase, commissioning, warranty, service agreement, replacement value and retirement/disposal with retained service history. A replacement comparison uses actual maintenance cost and downtime; accounting depreciation remains in the connected ledger. Money is US dollars kept in whole cents; purchase and commissioning dates are not in the future and commissioning is not before purchase; a replacement value names its basis; a service agreement has a provider, scope and term (end not before start) and is active from its first to its last day inclusive in the site's calendar. Each lifecycle change is a numbered revision (a stale one is refused) recorded in the asset's history, and a retired asset's facts no longer change. Retiring records the disposal (sold, scrapped, returned, transferred, donated or other, its date and optional proceeds). The comparison's repair cost is the sum of every cost entry (REPORT-005) on the asset's own work orders in any status, unknown (never zero) when there are none; its downtime is the minutes of the asset's ended failure stops by their latest classification (REPORT-003); the repair cost is shown as a percentage of the replacement value to one decimal. The ledger handoff is a CSV of these facts and costs to date with no book value or depreciation.

**Acceptance.**
1. Import an older asset, record its purchase and service agreement, compare repair cost with replacement value and retire it.
2. Open its history and export the ledger handoff without deleting prior work.

**Evidence.** `tests/gasket/flows.mjs` — "ASSET-007 asset lifecycle and replacement decision"
**Gap.** None.

#### ASSET-008 — Multi-asset inspection rounds

Core · target · **partial** · From ASSET-008 · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Leads publish ordered multi-asset inspection routes. Each stop retains its asset, pinned procedure and independently open missed or failed work; route sign-off cannot close missing work. Recurrence preserves one run per occurrence even when earlier runs remain open. [Maintenance semantics](docs/maintenance-semantics.md#asset-008) defines task issue and tool requirements.

**Acceptance.**
1. Schedule a three-asset route, fail one reading and skip another stop; inspect each stop’s source procedure, follow-up and incomplete state.
2. Attempt route sign-off while work is missing; inspect refusal, then finish the stops and read the retained run.

**Evidence.** `tests/gasket/flows.mjs` — "ASSET-008 scheduled inspection routes across assets"
**Gap.** A journey completing and successfully signing an inspection run after refusing incomplete sign-off is missing. The cited route journey issues pinned stops, records a failure and a missed stop, reads its reason and refuses incomplete sign-off; it never finishes and signs the run.

#### ASSET-010 — Calibration tasks and certificate versions

Core · target · **partial** · From ASSET-008 · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Leads publish calibration tasks with due tolerances, required tools, certificate attachments and failed-reading follow-up. The procedure pins numeric tolerances; an out-of-tolerance reading needs a linked corrective finding. Review retains certificate versions, tool identities and on-time status without claiming equipment certification. [Maintenance semantics](docs/maintenance-semantics.md#asset-010) defines the calibration calculation.

**Acceptance.**
1. Schedule gauge calibration with required tools, fail a reading and inspect its independent corrective work.
2. Try missing or expired calibration evidence, complete and review the work, then inspect retained certificate versions and on-time status.

**Evidence.** `tests/gasket/flows.mjs` — "ASSET-010 gauge calibration with tolerances, tools and certificate versions"
**Gap.** A calibration journey attempting submission with a missing required certificate and reading unchanged work is missing. The cited calibration journey reads missing-evidence messages, records tools and certificate originals, approves two versions and reads tolerances, dates and retained results.

#### ASSET-009 — Custom asset and part fields

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Leads define typed custom fields on assets, locations and parts (text, number with unit, single or multiple choice, date, yes/no and link), scoped to the organization, a site or an asset or part category, and mark each required or optional with validation. Values show and edit on register pages, the technician app and the QR scan view, and are available in search, filters and saved views (ADMIN-012), automation conditions (PLAN-009), dashboards (REPORT-007), the API (INT-001), imports (MIG-001, MIG-002, MIG-007) and every export. Value changes keep history with actor and time. Renaming a field keeps its values; retiring a field archives its values instead of deleting them. Under RL-102, active owners and leads administer immutable typed field definitions; ordinary record rights control values, and public intake discloses none. Renames preserve field identity and retirement preserves historical values. A future type or applicability migration must explicitly preserve validated existing data.

**Acceptance.**
1. Define a required "Refrigerant type" choice field on the HVAC asset category and a "Voltage" number field in volts on parts.
2. Set values through the register and the app, read them back on the page, the QR scan view and the API, filter assets by refrigerant type and export CSV with the values.
3. An invalid choice and a missing required value are refused.
4. Rename one field and retire another, then inspect retained values and history.
5. Import a MaintainX asset export with a custom-field column and see it mapped onto the field.

**Evidence.** `tests/gasket/custom-fields.mjs` customFieldsJourney (registered in `tests/gasket/flows.mjs`): typed text, unit-bearing number, choice, multiple choice, date, yes or no and link values; organization, current-site and category definitions; required and invalid-choice refusal; asset, part and location values through forms and JSON; actor and time history; rename retention and archived values; asset and part custom-field search, saved filters, filtered CSV and MaintainX custom-column preview, apply, replay and edited-value undo refusal. customBrowser: field Settings, register pages, signed-in scan edits, location register and import mapping at 1440 and 390.
**Gap.** The cited journey shows current-installation typed schema administration, register values, rename/retirement and a register import. Native app values, multi-site scope and complete search, API, import, dashboard and export coverage remain unproved under RL-102.

### Operator requests and follow-through

#### REQ-001 — Web operator request portal

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-INPUT-003, BASE-ACCESS-003, BASE-PUBLIC-001

**Requirement.** Operators submit faults from a branded web portal against a selected asset/location with description, urgency, contact and attachments, plus the site's own request fields: administrators configure per-site or per-portal text, choice, number, date and photo fields, mark them required or optional and map them onto the request. The portal shows in the requester's display language (ADMIN-013). ADMIN-013 carries complete catalogs, per-person and organization preferences, signed-out browser/site language selection, locale formatting and visible English fallback for both this portal and REQ-002's QR form before that language door ships; its acceptance journey must exercise both existing intake doors. Until ADMIN-002 adds sites, a portal belongs to the installation's current site. Intake defaults to active signed-in human members; ADMIN-004 inherits requester/contractor identities and their own-request-only access before those identities ship. An owner explicitly audits opening bounded public intake and publishing each opaque target's display name; a public form never lists targets or exposes private asset names, history, costs or request records. Contacts are as given, never verified identities. The adopted conservative default is five new submissions per portal/network/hour and 100 per installation/hour, content-validated PNG or JPEG photos up to 1.5 MB each and five per request, with EXIF and GPS metadata stripped before hashing and storage, and a receipt capability containing only the saved request number. Under RL-4, limit refusals return explicit errors and are logged without personal data; explicit owner-confirmed erasure removes contacts, photos and details, including copied corrective fault details. Administrators choose authenticated or bounded public intake; anonymous access is rate-limited and cannot enumerate private assets. The recorded maintenance policy is in RULINGS.md RL-4.

**Acceptance.**
1. Add a required "Is the line stopped?" choice to one site's form, then submit a noisy-motor fault with a photo through signed-in and public configured intake and see the answer on the request; omit the required field and see refusal.
2. Test invalid asset, file limit and abuse controls, then inspect a persisted request and private-data refusal.

**Evidence.** `tests/gasket/requests.mjs` — requestPortalJourney: configured typed fields, signed-in and opted-in public faults, required answer refusal, persisted answers, invalid target and file bounds, receipt privacy and creator-only access. `tests/gasket/request-privacy.mjs` — photoPrivacy: content-selected PNG and JPEG, metadata stripping, malformed images and photo count refusal; installationLimit: installation ceiling and private-data-free limit logs; erasePrivateRequest: confirmed owner erasure, private data removal and stale retry refusal. requestScreens: settings, queue, detail, erased detail and form at 1440 and 390. `tests/gasket/requests.mjs` — requestTriageJourney: scoped converted photo evidence and converted-detail erasure.
**Gap.** Ct approved defaults and riders on 23 October 2026 at 08:42Z, explicitly retaining PARTIAL. Rider implementation and public-door proof are complete; ct DONE ruling requested. ADMIN-013 inherits portal language; ADMIN-004 inherits future requester identities.

#### REQ-002 — QR mobile fault reporting

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-INPUT-003, BASE-ACCESS-003, BASE-PUBLIC-001

**Requirement.** An operator scans an asset QR code to open a phone fault form, in their display language (ADMIN-013), prefilled with allowed asset identity. ADMIN-013 carries this existing form's complete display-language catalog, signed-out selection, locale formatting and visible fallback before its language door ships, and exercises this form in its own acceptance journey. It supports camera evidence and saved drafts with visible submission confirmation; repeated submit and reconnect creates one request. Under RL-5, device storage requires explicit opt-in: drafts stay on that device, confirmation clears private contents retaining only the receipt, and sign-out clears drafts across open tabs and fences stale saves. The recorded maintenance policy is in RULINGS.md RL-5.

**Acceptance.**
1. At 390 width scan the pump label, photograph a leak, lose connectivity before sending and reconnect/retry.
2. Inspect exactly one request, original asset mapping and a durable confirmation.

**Evidence.** `tests/gasket/requests.mjs` — requestDraftJourney: decoded printed QR at 390, camera photo, opted-in device draft, offline send and reopen, lost accepted response and exactly-once retry, original asset mapping and durable confirmation. `tests/gasket/request-draft-privacy.mjs` — draftPrivacy: no storage without opt-in, opt-out deletion, receipt-only confirmed storage, native and API sign-out clearing across scopes, open-tab fencing and no restoration after reload. capture: draft, receipt and cleared form at 1440 and 390.
**Gap.** Ct approved defaults and riders on 23 October 2026 at 08:42Z, explicitly retaining PARTIAL. Rider implementation and public-door proof are complete; ct DONE ruling requested. ADMIN-013 inherits QR form language, preferences and fallback.

#### REQ-003 — Triage, duplicate linking and corrective conversion

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Leads triage requests by site, asset criticality, urgency and impact, ask for details, link duplicates, approve/decline with a reason and convert to corrective work without retyping. The original requester, photos and timeline stay linked. Existing leads and owners triage their current installation site, recording production impact (unknown, running, reduced or stopped); ADMIN-002 inherits cross-site queue scoping before additional sites ship. Every decision has a reason and the version seen. Duplicate links stay a one-level group for the same asset or location, retaining every report. Approval permits conversion, not automatic spending or dispatch; conversion uses the original target, description and urgency and is atomic with source links, so retries return the existing work. Questions/replies remain attributed on the request timeline; REQ-004 inherits external requester conversations and delivery before those doors ship. Only planners/reviewers and the work's current assignee/collaborators receive its necessary linked fault/photo evidence; private contacts stay on the creator/lead request door.

**Acceptance.**
1. Triage two reports of the same fault, request more details, link one as duplicate and create one corrective order.
2. Open both request timelines and work evidence; reject a third with an explained outcome.

**Evidence.** `tests/gasket/requests.mjs` — "requestTriageJourney"
**Gap.** None.

#### REQ-004 — Requester status and two-way updates

Core · target · **missing**

**Requirement.** Requesters see submitted, acknowledged, planned, waiting, resolved or declined status for their own reports and exchange scoped comments/photos. Actual email/push delivery follows configured events; resolution links the completion summary while hiding rates, private notes and other requests. The requester conversation is its own; the team's internal comments on the work order and asset (PLAN-006) never appear in it. REQ-003 currently records attributable questions, replies and decisions on request timelines; this clause inherits their requester conversation/delivery under own-request scope before those external doors ship.

**Acceptance.**
1. Submit as an operator, receive acknowledgment, reply with a photo, observe a waiting-on-parts update and then a technician resolution.
2. Inspect mailbox/push edge and portal privacy using another requester, and see none of the work order's internal comments (PLAN-006) in the portal.

**Evidence.** None.
**Gap.** No requester status page, conversation or lifecycle notifications.

#### REQ-005 — Response targets and escalation

Core · target · **done**

**Requirement.** Leads define acknowledgment and resolution targets by priority and site calendar, with accountable owners and after-hours rules. Unacknowledged or overdue requests escalate to named people, and paused clocks require an explicit reason rather than disappearing from backlog. Request clocks pin the priority policy, site time zone, weekday hours and holiday snapshot at submission. After-hours policy either counts all elapsed time or only open site hours. Acknowledgment uses the first retained triage decision; resolution ends at linked work closure or an explicit decline, abandonment or duplicate decision. Reasoned pause and resume events exclude only their interval and never hide the request. The owner-controlled chase job records one in-app escalation per overdue clock with named ownership, input evidence and grant revision; acknowledgment stops further acknowledgment escalation, while resolution remains independent. PM-005 inherits external delivery and ADMIN-002 inherits additional site scope. Under RL-10, only active owners and leads within triage access can be accountable owners or escalation recipients; inactive accounts and other recipients are denied without additional request data exposure. REQ-008 carries the named gap Escalation to assigned staff and groups, with ADMIN-004 requester groups and ADMIN-002 site scope; ADMIN-003 inherits future role routing. The recorded maintenance policy is in RULINGS.md RL-10.

**Acceptance.**
1. Create urgent and routine requests before a site holiday, advance the clock, pause one for access and inspect distinct target clocks, overdue notices and escalation ownership until acknowledged.

**Evidence.** `tests/gasket/requests.mjs` — "requestResponseJourney"
**Gap.** None.

#### REQ-006 — Email and Google Forms intake

Core · target · **missing**

**Requirement.** A site inbound email address accepts fault descriptions, attachments and replies with sender validation; Google Forms responses map authorized asset/location fields into requests through a documented connector. Message/response IDs deduplicate repeated deliveries; rejected rows are visible.

**Acceptance.**
1. Send an operator email and replay a Google Forms response at the network edge, reply to the acknowledgment and submit an unmappable asset.
2. Inspect one request per source ID, linked reply and actionable rejection.

**Evidence.** None.
**Gap.** No maintenance inbound email or Google Forms connector.

#### REQ-007 — Request reporting and operator adoption

Core · target · **done**

**Requirement.** Leads see request volumes, acknowledgment and resolution time, repeat faults, conversion and rejection reasons by site, asset and requester group. Reports link to the exact records and show untriaged and abandoned requests rather than excluding them from response metrics. Current lead and owner triage permission protects the page, JSON and CSV doors. The current installation is the site dimension; ADMIN-002 inherits authorized multi-site report scoping before more sites ship. Requester groups describe signed-in intake, public unverified intake and erased identity; ADMIN-004 inherits future requester groups under its scoped identities. Acknowledgment is the first recorded lead decision on each report; resolution is independent closure of linked corrective work. Declines stay separate from repair resolution. Durations disclose elapsed totals, measured counts, missing counts and all-request counts. Repeat faults are explicit duplicate links; conversion counts reports linked by retained work-created events, with the canonical approval reason. Abandonment is an explicit reasoned triage decision that retains the report, never an inference from waiting time. Erased sources remain counted with unavailable identity and timeline evidence disclosed. REPORT-009 definitions, retained omissions, source links and freshness apply to all these measures.

**Acceptance.**
1. Submit, duplicate, decline, convert and leave requests untriaged, then filter and download the request dashboard and compare counts and time denominators with source timestamps.

**Evidence.** `tests/gasket/requests.mjs` — "requestReportJourney"
**Gap.** None.

#### REQ-008 — Escalation to assigned staff and groups

Core · target · **missing** · Cites BASE-ROLE-001

**Requirement.** Request escalation reaches assigned staff and groups within authorized triage access, including ADMIN-004 requester groups and ADMIN-002 site scope. Unauthorized recipients receive no request data.

**Acceptance.**
1. Route an overdue request to assigned staff and an authorized group; inspect the named escalation and its retained request link.
2. Remove a recipient’s triage or site access and retry; inspect refusal with no request data exposed.

**Evidence.** None.
**Gap.** No escalation to assigned staff or groups; requires ADMIN-004 requester groups and ADMIN-002 site scope. REQ-005 denies other recipients by default within existing triage access.

### Work planning and coordination

#### PLAN-001 — Priority, lifecycle and reusable work templates

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Leads plan corrective, emergency and preventive work against an asset or a location with no asset (a restroom door, a dock light) with priority, estimated duration, instructions, due date, custom fields and permissioned custom statuses. Reusable templates and bulk creation preserve stable work numbers and required completion/review rules. Work a technician creates (FIELD-009) follows the same template, required-field, required-evidence and review rules as work a lead creates. A work order names exactly one asset or, with no asset, one location: the text the lead gives, trimmed, up to 160 characters, with the site's known asset and work locations offered; its follow-ups keep the location, and downtime and meter readings, which belong to an asset, are refused on it; preventive work at a location comes from a calendar schedule naming that location, since meters belong to assets. A custom field is text, a number or one of two to thirty listed choices; one marked required needs a value before any work order is submitted for review under its current definition (so it binds open work too, and a retired field never does), and a template may also require fields and photo or document evidence, kept with the work made from that revision. A waiting status (for example Waiting on parts) sits inside the lifecycle on open work and names the roles (lead, maintainer, supervisor; the owner always) that may set or clear it; a maintainer sets one only on work they hold or collaborate on.

**Acceptance.**
1. Create urgent corrective work from a template, create location-only work for a dock light, add a required field and custom waiting status, bulk-create selected jobs and try to bypass completion requirements through the API as a lead and as the technician who created the work.
2. Inspect persistent numbers and refusal.

**Evidence.** `tests/gasket/flows.mjs` — "PLAN-001 work priority and reusable templates"
**Gap.** None.

#### PLAN-002 — Teams, trades and accountable assignments

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** A work order has an accountable assignee plus collaborators, trade/team and shift. Leads assign/reassign with handoff notes; technicians acknowledge or decline with a blocker and only authorized participants record scoped work. A team is a named group of assignable people (owner, leads, maintainers) with one trade, kept by leads; a work order may name a team, a trade (the team's by default) and a shift label, and when it names a team every assignment door (assign, overdue plan, bulk) gives it only to a member of that team. Every reassignment keeps a handoff (from and to person and shift, an optional note, who and when) and asks the new assignee to acknowledge again. Collaborators are assignable people a lead adds or removes; the assignee and active collaborators record results, readings, evidence, parts, downtime and findings, only the assignee acknowledges, declines, answers chasing and submits, and anyone else is refused. Declining needs a blocker (PM-006's kinds, owner, next action and promised date), returns the work unassigned and gives every active lead (the owners when there is none) an in-app notice; PM-005 adds email and push delivery of it before it ships. Each record names who made it, the work order lists its contributors, and a contributor cannot review it (GAS-09).

**Acceptance.**
1. Assign an electrical job to a team and lead technician, add a collaborator and hand over across shifts.
2. Inspect both queues, acknowledgment and recorded contributor; an unrelated technician cannot write.

**Evidence.** `tests/gasket/flows.mjs` — "PLAN-002 teams, trades and accountable assignments"
**Gap.** None.

#### PLAN-003 — Calendar and workload scheduling

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Leads schedule work on day and week calendars with estimated hours, preview when dragging or rescheduling and capacity by person/team/site. Workload conflicts, unassigned jobs, leave and overdue work remain visible; calendar edits do not silently reset PM due policy. Slots are separate from original due dates and estimates: moving or removing a slot leaves the PM occurrence and cadence unchanged. Explicit person windows supply capacity; overlapping absence reduces the denominator. Existing assignment and handoff doors release incompatible bookings when the accountable person changes.

**Acceptance.**
1. Schedule five repairs into a 16-hour team window, mark a technician absent and move a job between days.
2. Inspect capacity and conflicts, unassigned work and unchanged PM due evidence on desktop and phone.

**Evidence.** `tests/gasket/planning.mjs` — "calendarPlanningJourney"
**Gap.** None.

#### PLAN-004 — Skills, qualifications and resources

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Planning matches required trades, qualifications, availability, tools and reserved BOM quantities. Confirmation rechecks those constraints and exposes later absence, expiry and physical shortages as conflicts. Assigned hours are active slots; productive hours are approved wrench time, separate from travel, wait, administration and legacy notes. Capacity uses explicit availability minus overlapping absence. RL-3 establishes custody and unverified owner-entered references; RL-12 adds the record stewardship in PLAN-010 and qualification erasure in PLAN-011. Authorized recorded planning exceptions remain a separate obligation, rather than an implicit power of a steward.

**Acceptance.**
1. Plan qualified work with the required trade, reserved BOM, calibrated tool and explicit availability; confirm and inspect the held resources.
2. Try an expired qualification, overlapping tool booking and stock shortage; inspect refusal and conflicts after later absence or expiry.
3. Read assigned, productive and unavailable hours against explicit capacity, keeping approved wrench time separate from other categories.
4. Exercise an authorized recorded exception with its separately authorized approver, reason, audit, explicit scope and expiry.

**Evidence.** `tests/gasket/planning.mjs` — qualificationPlanningJourney: expired high-voltage credential and booked shared tool refused, credential renewal and adjacent slot accepted, trade matching, required BOM reservations and stock shortage, tool calibration expiry, concurrent booking refusal, stale preview and handoff release; calendarPlanningJourney: assigned, approved productive and unavailable minutes with explicit capacity denominator. browserProof at 1440 and 390. Existing reserved-parts and tool-use journeys remain in `tests/gasket/flows.mjs`. `tests/gasket/planning.mjs` qualificationPlanningJourney additionally proves owner-only retirement through JSON and form doors, refusal without authority or current revision, retained snapshots and released bookings, replacement identities, correction and retirement audit, owner-selected in-app expiry and renewal reminders through the real scheduler with pinned dates, pause and resume, deduplication and recipient isolation, provenance and private-reference exclusion from permitted planning reads; browserProof captures owner resources, permitted planning, renewal notices and refused slots at 1440 and 390. External reminder delivery remains PM-005 proof. `tests/gasket/safety.mjs` safetyJourney proves retirement and identical replacement facts require fresh sign-off. `tests/gasket/recovery.mjs` recoveryJourney reconciles retired qualification and tool evidence after empty restore without restoring eligibility. `tests/gasket/safety.mjs` safetyJourney also proves immutable pre-upgrade qualification snapshots survive the actual identity migrations and permit submission, reminder preference changes preserve record identity and sign-offs, and retirement or changed facts still require reapproval. `tests/gasket/planning.mjs` qualificationPlanningJourney proves retained reminder identity, expiry, consent and selected lead window, owner-only execution inputs and outputs, and exact qualification notice health accounting; browserProof submits reminder preferences and retirement at 1440 and 390. `tests/gasket/recovery.mjs` recoveryJourney proves those reminder inputs survive retirement and inactive empty restore.  `tests/gasket/planning.mjs` qualificationPlanningJourney covers confirmed family erasure, correction copies, reminders, holds, retention minima, active replacements, authority refusals and durable results; `tests/gasket/safety.mjs` safetyJourney protects retained sign-offs; `tests/gasket/recovery.mjs` recoveryJourney opens archive bytes, restores durable results and refuses older archives with the later journal.  `tests/gasket/planning.mjs` qualificationPlanningJourney also exercises owner-issued exact record stewardship through JSON, form and browser doors; permitted qualification and tool creation, correction and retirement; scope and privilege refusals; live revocation; membership reinstatement; and anonymized stewardship copies during erasure. `tests/gasket/recovery.mjs` recoveryJourney proves restored stewardship remains inactive.  `tests/gasket/safety.mjs` safetyJourney exercises pre-identity qualification capture erasure after the actual identity upgrade.  `tests/gasket/safety.mjs` safetyJourney additionally opens the compliance pack after qualification retirement and proves the retained sign-off remains present while the pack reports changed qualification evidence.
**Gap.** Authorized recorded exceptions with separately authorized approver, reason, audit, scope and expiry remain absent. Operational multi-site planning remains ADMIN-002; the cited journeys show current qualified booking, conflicts, reminders and explicit utilization.

#### PLAN-010 — Scoped qualification and tool stewardship

Core · target · **partial** · From PLAN-004 · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-AUDIT-001

**Requirement.** Under RL-12, owners issue explicit revocable grants to named active people for qualification-family or tool-record creation, correction and retirement within authorized sites and records. Record upkeep, work planning, private originals, reminder consent, erasure, retention and hold release remain separate rights. References remain visibly owner-entered and unverified with issuing bodies; Gasket does not establish competence, physical safety, licensing or legal compliance. The detailed family and custody rules are in [Qualification custody](docs/qualification-custody.md).

**Acceptance.**
1. Grant a named person an exact qualification-family or tool scope; create, correct and retire permitted records through JSON and form doors, preserving versions and attributed history.
2. Try another family, tool, site, person and privileged operation; inspect refusal and unchanged protected records, with no private originals, contacts or unrelated personnel exposed.
3. Retire and replace a qualification or tool; inspect retained snapshots, released bookings and fresh sign-off for changed facts, while reminder-preference edits preserve unchanged evidence identity.
4. Revoke the grant and change or reinstate membership; existing sessions cannot revive the old authority. Restore an archive and inspect inactive grants.
5. Read the reference label, dates and calculated expiry as unverified information, independently of private original-reference access.
6. Choose in-app expiry and renewal reminders, pause and resume, and inspect consent, lead window, deduplication, recipient isolation and retained input/output custody.

**Evidence.** `tests/gasket/planning.mjs` — qualificationPlanningJourney: expired high-voltage credential and booked shared tool refused, credential renewal and adjacent slot accepted, trade matching, required BOM reservations and stock shortage, tool calibration expiry, concurrent booking refusal, stale preview and handoff release; calendarPlanningJourney: assigned, approved productive and unavailable minutes with explicit capacity denominator. browserProof at 1440 and 390. Existing reserved-parts and tool-use journeys remain in `tests/gasket/flows.mjs`. `tests/gasket/planning.mjs` qualificationPlanningJourney additionally proves owner-only retirement through JSON and form doors, refusal without authority or current revision, retained snapshots and released bookings, replacement identities, correction and retirement audit, owner-selected in-app expiry and renewal reminders through the real scheduler with pinned dates, pause and resume, deduplication and recipient isolation, provenance and private-reference exclusion from permitted planning reads; browserProof captures owner resources, permitted planning, renewal notices and refused slots at 1440 and 390. External reminder delivery remains PM-005 proof. `tests/gasket/safety.mjs` safetyJourney proves retirement and identical replacement facts require fresh sign-off. `tests/gasket/recovery.mjs` recoveryJourney reconciles retired qualification and tool evidence after empty restore without restoring eligibility. `tests/gasket/safety.mjs` safetyJourney also proves immutable pre-upgrade qualification snapshots survive the actual identity migrations and permit submission, reminder preference changes preserve record identity and sign-offs, and retirement or changed facts still require reapproval. `tests/gasket/planning.mjs` qualificationPlanningJourney proves retained reminder identity, expiry, consent and selected lead window, owner-only execution inputs and outputs, and exact qualification notice health accounting; browserProof submits reminder preferences and retirement at 1440 and 390. `tests/gasket/recovery.mjs` recoveryJourney proves those reminder inputs survive retirement and inactive empty restore.  `tests/gasket/planning.mjs` qualificationPlanningJourney covers confirmed family erasure, correction copies, reminders, holds, retention minima, active replacements, authority refusals and durable results; `tests/gasket/safety.mjs` safetyJourney protects retained sign-offs; `tests/gasket/recovery.mjs` recoveryJourney opens archive bytes, restores durable results and refuses older archives with the later journal.  `tests/gasket/planning.mjs` qualificationPlanningJourney also exercises owner-issued exact record stewardship through JSON, form and browser doors; permitted qualification and tool creation, correction and retirement; scope and privilege refusals; live revocation; membership reinstatement; and anonymized stewardship copies during erasure. `tests/gasket/recovery.mjs` recoveryJourney proves restored stewardship remains inactive.  `tests/gasket/safety.mjs` safetyJourney exercises pre-identity qualification capture erasure after the actual identity upgrade.
**Gap.** Operational multi-site and broader role-template stewardship remain unproved under PLAN-004, ADMIN-003 and ADMIN-002. The cited journey shows exact current-site family/tool grants, scoped upkeep, privacy refusal, live revocation, membership fencing and inactive restore.

#### PLAN-011 — Dependency-aware qualification-family erasure

Core · target · **partial** · From PLAN-004 · Cites BASE-DATA-003, BASE-DATA-006, BASE-AUDIT-001, BASE-ROLE-001

**Requirement.** RL-12 permits ordinary owner-confirmed erasure of an eligible retired qualification family, considering every correction and replacement and every retained obligation. It preserves durable per-type results and attributable anonymized audit while the user identity remains. Retirement, expiry and reminders do not authorize automatic erasure. An agent erasure call carries destructive, adding sensitive when the family contains regulated identity or health data; the company's policy decides execution. [Qualification custody](docs/qualification-custody.md) defines captured-copy matching and older-archive fencing.

**Acceptance.**
1. Through JSON and form doors, preview the complete retired family and explicitly confirm the exact eligible revision; read dependency reasons and durable per-type results, including a stable retry.
2. Try signed-out and unauthorized callers, stale or unconfirmed requests, active replacements, each applicable hold, unmet user or maintenance retention minima and retained safety sign-offs; protected evidence stays unchanged.
3. Compete hold and erasure operations; inspect one consistent outcome without partial erasure or lost retained evidence.
4. Erase original and corrected qualification details, matching reminder captures, stewardship scope names and released hold payloads; inspect anonymized retained audit with actor, action, site and time, and the unchanged user identity.
5. Upgrade pre-identity captures and reconcile their recorded holder and qualification name; unattributed older renewal notices refuse erasure until reconciled, without guessing a shared identity.
6. Open a later archive, restore durable results without resurrection and refuse an older archive fenced by the later journal.

**Evidence.** `tests/gasket/planning.mjs` — qualificationPlanningJourney: expired high-voltage credential and booked shared tool refused, credential renewal and adjacent slot accepted, trade matching, required BOM reservations and stock shortage, tool calibration expiry, concurrent booking refusal, stale preview and handoff release; calendarPlanningJourney: assigned, approved productive and unavailable minutes with explicit capacity denominator. browserProof at 1440 and 390. Existing reserved-parts and tool-use journeys remain in `tests/gasket/flows.mjs`. `tests/gasket/planning.mjs` qualificationPlanningJourney additionally proves owner-only retirement through JSON and form doors, refusal without authority or current revision, retained snapshots and released bookings, replacement identities, correction and retirement audit, owner-selected in-app expiry and renewal reminders through the real scheduler with pinned dates, pause and resume, deduplication and recipient isolation, provenance and private-reference exclusion from permitted planning reads; browserProof captures owner resources, permitted planning, renewal notices and refused slots at 1440 and 390. External reminder delivery remains PM-005 proof. `tests/gasket/safety.mjs` safetyJourney proves retirement and identical replacement facts require fresh sign-off. `tests/gasket/recovery.mjs` recoveryJourney reconciles retired qualification and tool evidence after empty restore without restoring eligibility. `tests/gasket/safety.mjs` safetyJourney also proves immutable pre-upgrade qualification snapshots survive the actual identity migrations and permit submission, reminder preference changes preserve record identity and sign-offs, and retirement or changed facts still require reapproval. `tests/gasket/planning.mjs` qualificationPlanningJourney proves retained reminder identity, expiry, consent and selected lead window, owner-only execution inputs and outputs, and exact qualification notice health accounting; browserProof submits reminder preferences and retirement at 1440 and 390. `tests/gasket/recovery.mjs` recoveryJourney proves those reminder inputs survive retirement and inactive empty restore.  `tests/gasket/planning.mjs` qualificationPlanningJourney covers confirmed family erasure, correction copies, reminders, holds, retention minima, active replacements, authority refusals and durable results; `tests/gasket/safety.mjs` safetyJourney protects retained sign-offs; `tests/gasket/recovery.mjs` recoveryJourney opens archive bytes, restores durable results and refuses older archives with the later journal.  `tests/gasket/planning.mjs` qualificationPlanningJourney also exercises owner-issued exact record stewardship through JSON, form and browser doors; permitted qualification and tool creation, correction and retirement; scope and privilege refusals; live revocation; membership reinstatement; and anonymized stewardship copies during erasure. `tests/gasket/recovery.mjs` recoveryJourney proves restored stewardship remains inactive.  `tests/gasket/safety.mjs` safetyJourney exercises pre-identity qualification capture erasure after the actual identity upgrade.
**Gap.** Complete copied-data reconciliation, including unattributed older renewal notices, remains owed. The cited journeys show eligible confirmed family erasure, retention/hold/safety refusals, captured-copy redaction, durable results and archive fencing; user identity and full maintenance-record erasure remain ADMIN-016.

#### PLAN-005 — Dependencies and production windows

Core · target · **partial**

**Requirement.** Work can depend on predecessor jobs, equipment access, permits, parts and approved production shutdown windows. Planning exposes the critical blockers and coordinates with the buyer's production calendar; moving a window retains the original promise and alerts affected owners.

**Acceptance.**
1. Plan a repair after isolation and parts receipt in a production window, move that window from the connected calendar and inspect blocked/ready states and affected owner notices.

**Evidence.** `src/gasket/chasing.ts`; `src/gasket/ui/chasing.ts`; `tests/gasket/flows.mjs`; `tests/gasket/agent-follow-up.mjs`
**Gap.** Owned parts/access blockers, promised dates, missed-promise notices and attributed resolution exist; predecessor/permit/receipt dependencies, enforced ready/blocked planning and connected production-window moves with affected-owner notices remain absent.

#### PLAN-006 — Comments, mentions and shift handoff

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-INPUT-003

**Requirement.** Authorized teams use work/asset comments, photos, mentions and handoff summaries with read/unread state and durable notification links. Internal notes stay private from requesters/contractors; edits retain history and resolution does not delete the conversation. Conversations not tied to a record are PLAN-008. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#plan-006).

**Acceptance.**
1. Mention the incoming technician on a returning job with a photo and internal cost note, sign in on their phone and follow the notice.
2. Inspect unread state, retained edit history and contractor/requester privacy.

**Evidence.** `tests/gasket/flows.mjs` — "PLAN-006 comments, mentions and shift handoff"
**Gap.** A public-door journey requester/contractor privacy with those identities and company-policy execution of agent comments is missing. The cited journeys show internal handoff, mentions, originals, unread state and retained edits; external identities cannot be created.

#### PLAN-007 — Bulk actions and controlled cancellation

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Leads bulk assign, reschedule or cancel selected work after seeing affected dependencies and PM consequences: until PLAN-005 work dependencies exist, each selected row shows its schedule consequence and open follow-up work, and PLAN-005 adds dependency consequences. Bulk operations through the JSON door (`workorders.bulk`, a preview then per-row outcomes) satisfy the bulk operation itself; bulk selection on the Work page remains a requirement, delivered with the owner-chosen Work table look. Merge, reopen and skip-occurrence live on the work-order and schedules pages. Reopening a returned repair means a reviewed, closed corrective repair whose fault came back reopens to Returned for rework and fresh review; canceled work reopens to Open. Cancellation, reopening and merging duplicate work retain reasons, original evidence and links; partial failures are reported per item and cannot fabricate completed maintenance.

**Acceptance.**
1. Select mixed authorized/stale work, preview a bulk reschedule (each row shows its schedule consequence and open follow-up work) and cancel one PM, then reopen a reviewed, closed corrective repair whose fault came back and see it Returned for rework and fresh review, and reopen canceled work to Open.
2. Inspect per-row outcomes, retained evidence and an overdue PM obligation until explicitly resolved.
3. Select several rows on the Work page and apply a bulk action there.

**Evidence.** `src/gasket/control.ts`; `src/gasket/work.ts`; `src/gasket/schedules.ts`; `migrations/core/0019_work_merge.sql`; `tests/gasket/flows.mjs`
**Gap.** Bulk assign, reschedule and cancel with preview and per-row outcomes, reopen, merge and PM skip are served through the JSON door; selecting work in bulk on the Work page is still owed and arrives with the Work table look.

#### PLAN-008 — Team, group and direct messaging

Core · target · **partial**

**Requirement.** Members hold one-to-one, ad-hoc group and team conversations plus a site-wide All team conversation in the web workspace and the iOS and Android app, with no Slack or Teams subscription required. Creating a team creates its conversation; joining a team grants it and leaving or removal ends access to every message sent afterwards. Messages carry text, photos, files, record links and mentions, with unread counts, read state, deep links and push/email notices under each person's preferences (PM-005). A person with work-creation rights (technicians by default, ADMIN-003 and FIELD-009) turns a message into a request or corrective work that links back to the message and keeps its photos as original, attributed evidence. Messages written offline queue on the device and send exactly once after reconnecting. Requesters and contractors never see internal conversations. Edits and deletions keep history, owners can apply retention and legal hold (ADMIN-007), and conversations are included in audit export (ADMIN-006) and the portable archive (ADMIN-009).

**Acceptance.**
1. Create a team and confirm its conversation appears for current members and for a member added later.
2. Send a one-to-one message and a group message with a photo between a technician's phone and a lead's browser; inspect push delivery at the APNs/FCM edge, deep-link opening and unread/read state.
3. Turn one message into corrective work that links back to the message and keeps the original photo digest.
4. Queue a message offline, reconnect twice and see it delivered once.
5. Remove a member and verify app and API refuse messages sent after removal; a requester and a contractor are refused internal conversations by URL and API.

**Evidence.** `tests/gasket/messages.mjs` messagesJourney: public JSON and form doors prove fixed-pair creation, original text and attribution, stable duplicate and changed-payload retries, independent unread and read state, restart durability, participant-only authority, ended and revoked refusal, planned-site refusal, audit privacy and retained identity dependencies; messagesBrowser proves list, reading and sending at 1440 with screen proof at 1440 and 390. `tests/gasket/recovery.mjs` recoveryJourney: original messages, retry identities and per-person read markers reconcile after empty inactive restore and another Worker restart. The journey is loaded by `tests/gasket/flows.mjs` in Verify; recovery has its required Verify job.
**Gap.** Online operational-primary-site one-to-one text is implemented; PLAN-008 remains partial. Conservative current defaults are active existing human participants only, no owner content-reading bypass, fixed participant pairs, append-only indefinite retention, metadata-only audit and no automatic outbound delivery; adopted under the standing conservative-default rule, with policy approval and broader scoped delegation still open. Missing: team and site-wide All team conversations, ad-hoc groups and join or leave boundaries; photos, files, record links and mentions; message-to-request and corrective-work conversion with original attributed evidence; edits and deletion history; conversation-specific owner retention, legal hold and eligible erasure with complete audit and archive reconciliation. Held: native iOS and Android messaging and deep links, APNs and FCM plus email delivery under preferences, offline queuing and exactly-once reconnect proof on devices; SMS sender qualification and phone-only identities retain ADMIN-004 and ADMIN-014. Requester and contractor identities receive no internal conversation access and remain unbuilt prerequisites. Additional operational sites retain ADMIN-002. No native-device, provider-delivery, complete messaging or legal-retention qualification is claimed.

#### PLAN-009 — No-code automation rules

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-OPS-003, BASE-OPS-004

**Requirement.** Leads build site-scoped rules without code from documented triggers (request submitted, work created or changed status, asset status changed, meter reading recorded, part below minimum, checklist result failed, work overdue) with conditions on asset, location, category, priority, team, custom field and time of day, and actions (route or assign to a team or person, set priority, status or due date, attach a procedure, notify people or a channel, create follow-up work, request approval). Rules are versioned, can be tested against recent records without changing anything, run in a stated order with conflicts shown, are loop-protected and pausable, and record the rule revision on every action. Actions run within the rule owner's rights and can never approve work, approve spend or close a finding. Under RL-104, active owners and leads administer versioned rules; execution uses the author’s current scope, visible priority and identifier order, and the first conflicting field action wins. Partial failures remain visible and completed effects are reconciled before catch-up. Independent work, spend and finding-closure decisions remain separate doors; agent calls carry their computed classes under company policy.

**Acceptance.**
1. Build a rule that routes new requests for Line 2 conveyors to the electrical team at high priority, test it against last week's requests with no changes written, then enable it and submit one matching and one non-matching request.
2. Inspect the assignment, the rule revision in audit and no action on the non-match.
3. Create two rules that would trigger each other and see the loop stopped with a visible error; save a rule whose action approves work and see it refused.

**Evidence.** `tests/gasket/rules.mjs` rulesJourney (registered in `tests/gasket/flows.mjs`): current-site no-code definitions, historical no-write preview across live records and ledgers, matching and non-matching request routing and priority with a custom-field condition, versioned pause and catch-up, deterministic conflicts, visible alternating-rule loop refusal, prohibited approval and destructive actions, current-author revocation and action revision in audit. `tests/gasket/rule-sources.mjs` ruleSourcesJourney: work, state, feed and work reading, failed checklist, stock and overdue source doors; due date, procedure, in-app notice, follow-up and request-approval actions; no access expansion and no replay of partially committed effects. `tests/gasket/rules-browser.mjs` rulesBrowser: form-built routing rule, preview, source request, execution errors and notices at 1440 and 390.
**Gap.** The cited rule journeys show current-site definitions, no-write preview, current-authority field actions, loop and conflict handling. Estate-wide scope, outbound channels and complete reconciliation of partial effects before catch-up remain unproved under RL-104; independent work approval, spend and finding closure remain separate doors.

### Preventive maintenance and automatic follow-up

#### PM-001 — Unattended calendar generation

Core · target · **partial** · Cites BASE-OPS-003, BASE-OPS-004 · Rules D-3

**Requirement.** An installation-owned scheduler generates recurring calendar PMs without a person pressing a button, using each site's time zone, lead time and fixed- or completion-based policy. Each due occurrence has a stable identity; restart, overlap and retry create one work order and retain missed-run debt. The timing, occurrence identity, lead-time and missed-run calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#pm-001).

**Acceptance.**
1. Save a monthly PM through the schedule door, leave the app, cross its due window and restart the scheduler twice.
2. Open one generated order, its due occurrence and any missed-run warning without invoking manual generation.

**Evidence.** `tests/gasket/flows.mjs` — "PM-001 unattended calendar generation"
**Gap.** A public-door journey interrupting and restarting a scheduler across a due occurrence is missing. The cited journeys show repeated scheduled invocations, one occurrence, late issue and missed-run warnings without worker interruption.

#### PM-002 — Automatic meter and condition triggers

Core · target · **done** · Cites BASE-OPS-003, BASE-OPS-004 · Rules D-3

**Requirement.** Validated manual or integrated counter, gauge and condition readings automatically evaluate thresholds, trend duration and hysteresis. Combined calendar/meter policies state whichever-first or both; repeated/late sensor deliveries do not duplicate work or satisfy a condition with stale data. Every reading a door keeps (a feed reading or one taken on a work order) evaluates the schedules on its meter at once. A gauge trigger fires when good readings stay strictly above (or below) its threshold and a condition trigger when they stay in its chosen conditions, for at least its sustain minutes measured between source times (0: the first such reading); after firing it re-arms only once a later good reading is at or past its reset value (the threshold unless set; for a condition, out of the chosen conditions). Only good readings received after the trigger was set up count, so stale, suspect, moved-in or earlier readings never fire one. A counter is due at its value. A schedule with a calendar and a meter is due on whichever comes first unless it states both. A feed delivery repeating a kept reading (same meter, feed, source time and value) is that reading, not a new one, and a schedule never has more than one open order. Generated work names the reading that raised it.

**Acceptance.**
1. Configure counter and sustained-temperature triggers, send fresh, repeated, late and recovered readings through ingest and await generated work.
2. Inspect one order per trigger, source evidence and explicit rejection of stale data.

**Evidence.** `tests/gasket/flows.mjs` — "PM-002 automatic meter and condition triggers"
**Gap.** None.

#### PM-003 — Cadence, seasonal windows and exceptions

Core · target · **done**

**Requirement.** Leads choose fixed versus completion cadence, seasonal months, weekdays, holidays, shutdown windows and bounded deferral with a reason. Skipping a task retains the missed obligation and independent risk approval; editing schedules previews already-issued and future work. Due dates are site-local calendar days, so a daylight-saving change never moves one. A calendar schedule may allow only some months and ISO weekdays and, unless it is set to run through them, avoids the site's closures (holidays and shutdown windows, both ends inclusive, kept by leads); a due date on a day it may not fall moves forward to the next allowed day, never earlier. Fixed cadence counts from the planned (nominal) date, so moves never drift it; completion cadence counts from the day the work is approved. A lead asks to skip an overdue occurrence that has no open work, or to defer the current occurrence to a date after it and at most the schedule's deferral limit later (14 days unless set, up to 365), always with a reason; nothing moves until an owner or supervisor other than the person who asked approves it (on a site with one owner and no supervisor, that owner may approve their own request after an explicit second confirmation, and the decision is labeled single-approver), issued work moves with an approved deferral and keeps its checklist revision, and every request and decision stays on record, so a skipped occurrence remains recorded as missed. Editing a calendar schedule's interval, cadence or calendar shows a no-write preview of its issued work (unchanged: due date and checklist revision) and of its next five due dates before and after the change.

**Acceptance.**
1. Configure weekday/seasonal PMs across a holiday and daylight-saving change, defer one with approval and edit an interval.
2. Inspect next dates, retained missed work and unchanged issued checklist/due evidence.

**Evidence.** `tests/gasket/flows.mjs` — "PM-003 cadence, seasonal windows and exceptions"
**Gap.** None.

#### PM-004 — Failed inspection creates accountable correction

Core · target · **done** · Cites BASE-OPS-003, BASE-OPS-004

**Requirement.** A failed required result automatically creates or links a corrective finding/work order according to a lead-approved rule, carrying failed step, readings, evidence, severity and deadline. A lead-approved rule is one numbered rule per checklist (outcomes, severity, due days) that a lead or owner sets, revised by appending a new number. The correction goes to the inspection's assignee, who must acknowledge it before submitting, and only an independent approval of the correction resolves the original failure; closing the PM cannot hide unresolved corrective work. The notice is in-app: the correction on its assignee's own list and on the board, plus the audit entry; email and APNs/FCM delivery of it belongs to PM-005.

**Acceptance.**
1. Fail a required inspection item through mobile/API without manually asking for follow-up, inspect the linked corrective work and its in-app notice (the assignee's list, the board and the audit entry), see submission refused until the assignee acknowledges, complete/review it and verify the originating failure closes only under the checklist's numbered rule and only on an independent approval.

**Evidence.** `tests/gasket/flows.mjs` — "PM-004 failed inspection raises an accountable correction"
**Gap.** None.

#### PM-005 — Assignee and approver notifications

Core · target · **missing** · Cites BASE-MAIL-001

**Requirement.** Generation, assignment, returned work, review request and due changes enqueue actual email and APNs/FCM mobile push to authorized people with record links. Each event/destination has delivery status, deduplication, per-person channel/event preferences and quiet hours, and escalation when delivery fails; notices render in each recipient's display language (ADMIN-013), and provider acceptance is distinct from human acknowledgment. Owners can mark an escalation mandatory so preferences cannot suppress it. Qualification expiry and renewal reminders under PLAN-010 use these same delivery channels and preferences.

**Acceptance.**
1. Generate and return work, inspect email and mobile push at provider edges, open the deep link and acknowledge.
2. Turn off a technician's email for assignment events while keeping push and set quiet hours, assign work and inspect push delivered, email suppressed with the preference recorded as the reason, and a mandatory escalation still delivered during quiet hours.
3. Induce a delivery failure and retry/restart; inspect visible failure and no duplicated business event.

**Evidence.** None.
**Gap.** In-app maintenance notices exist; assignment/review/due-change email and APNs/FCM delivery, event/destination lifecycle, channel preferences, quiet hours and mandatory escalation remain absent.

#### PM-006 — Overdue escalation and blocker chasing

Core · target · **done** · Cites BASE-OPS-003, BASE-OPS-004

**Requirement.** Rules remind the accountable technician before/after due time, request an acknowledgment/blocker, and escalate to the lead and supervisor on elapsed thresholds or missing response. Parts, access, skill and production blockers have owners and next actions; reassigning needs a lead decision and never resets age. Chasing runs with the scheduler (PM-001) on the site's dates under one lead-approved rule (revisions kept; by default remind one day before the due date, expect a response within one day of the overdue notice, escalate to leads after two days overdue and to supervisors after five): the assignee is reminded the set days before the due date and again once it is overdue and answers on it or blocked; every active lead is notified once the work has been overdue for the lead days or the assignee has not responded within the response days after the overdue notice, and every active supervisor (the owners when there is none) after the supervisor days. A blocker names its kind, owner (any active member, the reporter by default), next action and promised date; a promise not cleared by its date notifies its owner and the leads. Each notice goes once per recipient and occasion and is an in-app notice on the Notices page and the work order; PM-005 adds email and push delivery of these notices before it ships. Overdue age counts from the day the work first became overdue and no reassignment or reschedule resets it.

**Acceptance.**
1. Leave urgent PM unacknowledged, advance the clock, report a parts blocker and miss its promised date.
2. Inspect escalating notices, accountable blocker and approved reassignment while the original overdue age remains.

**Evidence.** `tests/gasket/flows.mjs` — "PM-006 overdue escalation and blocker chasing"
**Gap.** None.

#### PM-007 — PM template rollout and change control

Core · target · **partial**

**Requirement.** Leads version preventive strategies across asset classes/sites, preview affected schedules, preserve local overrides and obtain required approval for revised safety/OEM requirements. Rollout never silently rewrites issued work; cancellation and catch-up plans are explicit. Gasket ships a versioned library of ready-made procedure and PM templates for common equipment (air compressors, pumps, electric motors, conveyors, HVAC units, boilers, forklifts, fire extinguishers and backup generators) that leads copy, adapt and approve before use; a copied template keeps a link to its library version. The recorded maintenance policy is in RULINGS.md RL-8.

**Acceptance.**
1. Copy the library air-compressor template, adapt and approve it, then publish a revised compressor program to two sites with one local override, review the diff and approve rollout.
2. Inspect future schedules, unchanged issued work and a conflict requiring local decision.

**Evidence.** `tests/gasket/requests.mjs` — strategyRolloutJourney: copy air-compressor library provenance, adapt and independently approve the strategy; preview two current-site compressor schedules, preserve local interval overrides, require a reasoned conflict decision, refuse stale previews and declared interval-bound violations, refuse self-approval by an author with review rights, retain approver and exact rollout digest with both conflict sides, preserve due occurrences and meter triggers, retain explicit cancellation and catch-up plans, retain rollout decisions, leave every issued-work field unchanged and issue the next occurrence with the approved procedure. capture: conflict diff and retained rollout at 1440 and 390. `src/gasket/pm-library.ts`; `src/gasket/pm-strategies.ts`; `src/gasket/ui/pm-strategies.ts`; `migrations/core/0085_pm_strategies.sql`.
**Gap.** Ct ruled 25 October 2026: an owner or supervisor independent of the author explicitly approves the adapted strategy and exact rollout. The atomic rollout approval retains a digest of the source preview, conflict decisions and occurrence plan, with both local and program values. Current-site calendar and meter procedure rollouts preserve issued work, due dates and meter triggers. Explicit plans cancel no issued work and retain due occurrences for ordinary generation. Two-site rollout and complete site scope still require this seed's unbuilt multi-site model (ADMIN-002); calibration strategy rollout remains unbuilt.

#### PM-008 — Scheduler health and automation controls

Core · target · **partial** · Cites BASE-OPS-003, BASE-OPS-004 · Rules D-3

**Requirement.** Owners see last/next run, due-event coverage, paused rules, delivery backlog and per-job errors. They can test a rule without live work/purchases, pause/resume and safely catch up; workers have bounded authority and all automatic actions retain rule revision and input evidence. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#pm-008).

**Acceptance.**
1. Test then enable a PM rule, stop its worker across a due slot and inspect a visible missed-run condition.
2. Resume/catch up and inspect one due work order with rule revision; test mode sends no live notification.

**Evidence.** `tests/gasket/automation.mjs` — "automationJourney"; `tests/gasket/planning.mjs` — "qualificationPlanningJourney"
**Gap.** A public-door journey interrupting a running PM job across a due slot and reconciling catch-up is missing. The cited journeys show pause/resume, stale/concurrent catch-up, no-write preview and job lineage; connector recovery does not interrupt a PM job.

#### PM-009 — Nested and coordinated preventive programs

Core · target · **done** · Cites BASE-OPS-003, BASE-OPS-004

**Requirement.** Leads define nested PM packages so an approved higher-level service can satisfy explicitly mapped lower-level tasks, coordinate linked assets and avoid duplicate downtime. Suppression records the exact task/revision/occurrence evidence and never hides an overdue obligation without the approved equivalent work. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#pm-009).

**Acceptance.**
1. Schedule weekly, monthly and annual nested services, complete an annual package with one mapped task missing and inspect lower-level obligations.
2. Only fully evidenced approved equivalents suppress duplicate work; missed steps stay due.

**Evidence.** `tests/gasket/nested.mjs` — "nestedJourney"
**Gap.** None.

### Mobile technician execution

#### FIELD-001 — iOS and Android technician app

Core · target · **missing** · Cites BASE-ROLE-001, BASE-INPUT-001 · Register R-3, R-4

**Requirement.** Installable iOS and Android apps provide secure sign-in (email link, one-time SMS code for people known only by mobile number under ADMIN-014, Google under ADMIN-015 or organization SSO under ADMIN-005), own/team work, creating new corrective work and logging completed work (FIELD-009), asset scan, manuals, team messaging (PLAN-008) and notifications with deep links, in each person's display language (ADMIN-013). Supported OS/device versions and release/update requirements are published; a browser-only page does not establish native offline or push delivery. The app is a create-work door under FIELD-009 and carries its obligations before it ships: a technician scans an asset QR label (ASSET-002) and creates corrective work with priority, description and a photo, takes it or leaves it unassigned for a lead, and sees it in their own queue and on the lead's board; a template's required field and required photo are refused exactly as at the API; app-created work is recorded with the door `app`; and requesters, contractors and technicians whose create-work right is off are refused. The app's checklists carry FIELD-004 before it ships: typed steps with units and limits, conditional steps, a photo on its step, a supervisor's exception with its reason, and submission blocked exactly as at the API.

**Acceptance.**
1. Install release builds on an iPhone and Android phone, sign in one technician by email link and a phone-only technician with a one-time SMS code, scan an asset and create corrective work against it, open an assigned job from push and update the app while retaining authorized drafts.
2. On the app, scan an asset QR label, create corrective work with priority, description and a photo, assign it to yourself and see it in your own queue and on the lead's board; omit a template's required field and photo and see the API's refusal; see the audit record the door `app`; a requester, a contractor and a technician whose site has the create-work right off are refused (FIELD-009).

**Evidence.** None.
**Gap.** No native app packages, supported-device policy or native push/deep links.

#### FIELD-002 — Offline work packs and durable capture

Core · target · **missing** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-INPUT-003

**Requirement.** Technicians download authorized jobs, procedures, asset history, parts availability snapshots and manuals before losing service. Checklist results, readings, notes, photos, signatures, time and part usage persist through airplane mode, app termination and device restart; unsynced state and stale stock are explicit. New work a technician creates offline (FIELD-009) is a durable draft with a device-local identity that syncs exactly once and receives its server work number on reconnect. Work created offline is recorded with the door `sync` (FIELD-009). Offline checklists keep FIELD-004's typed steps: conditions evaluate on the device, a number's outcome comes from its limits, a step photo stays bound to its step through sync, and the server's submission blockers apply on reconnect. Photos, annotations and signatures captured offline keep FIELD-005's phase, capture time, version binding and stale-signature rule, and record the door `sync`. Manuals in an offline pack are the document revisions pinned on the work (ASSET-003), each with its source and who added it, never a later master.

**Acceptance.**
1. Download a job, enter airplane mode, record every evidence type, kill/restart the app and reopen the draft.
2. Create a new corrective work order with a photo in airplane mode, restart the device, reconnect twice and see exactly one work order with one server number.
3. Verify all bytes/times survive, stock is labeled a snapshot and the app shows what remains unsynced.
4. The audit records the synced work order's creator and the door `sync` (FIELD-009).

**Evidence.** None.
**Gap.** No offline database, job packs, durable outbox or offline evidence capture.

#### FIELD-003 — Reconnection, conflicts and device revocation

Core · target · **missing** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Reconnect sync is resumable and idempotent with per-record results. Server-side assignment, stock, meter and review versions remain authoritative; conflicting offline changes need a visible resolution and never disappear. Revoked users/devices cannot upload. Device-local expiry and wipe disclosure belong to FIELD-010. Work created offline whose creator's create-work right or access ended before it syncs is refused at sync with a visible per-record reason that stays on the device and in the lead's view (FIELD-009).

**Acceptance.**
1. Two devices edit the same job offline and consume the last part, then reconnect in reverse order and interrupt photo sync.
2. Inspect one accepted movement, visible conflict and retained draft; revoke a device and verify refused upload.
3. Create work in airplane mode, revoke the creator's create-work right before reconnecting, sync, and see the work refused with a visible reason that stays on the device and the lead's view (FIELD-009).

**Evidence.** None.
**Gap.** No offline sync, conflict resolution, device access policy or queued-write revocation.

#### FIELD-004 — Typed checklists and required evidence

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1

**Requirement.** Procedures support pass/fail, numbers with limits/units, text, options, required photos, conditional steps and required readings. A failed tolerance links to follow-up; supervisor-controlled exceptions require a reason, and procedure changes keep historical step identities. A step is a check (pass, needs attention or fail), a number with its unit and inclusive limits (either limit may be left open) that passes inside them and fails outside, text, a choice from listed options where the options marked to fail fail, or a required photo (an image attached to that step; a document does not answer it). A step may apply only when an earlier step has a named answer (an option's value, otherwise its outcome); a step that does not apply takes no answer and blocks nothing. A number step may name the asset meter it reads, which must have the same unit; its value is then kept as that meter's manual reading (ASSET-005), so required readings are number steps. Before submission a failed limit needs a linked finding with follow-up work (raised by hand or as a PM-004 correction), and a failed or needs-attention check or option needs a linked finding. A supervisor, meaning anyone with the review right (owner or supervisor) who recorded nothing on the work, may grant an exception on one applicable step with a reason; it is kept unchanged and the step then blocks nothing. Each step has a key: a new revision keeps a step's key when the step keeps its label (ignoring case) or names its earlier key, and issued work keeps the revision it was created with. Today's doors are the web workspace (on a phone browser too) and the JSON API; the native app (FIELD-001) and offline capture (FIELD-002) carry these step kinds, conditions, step photos, exceptions and blocked submission before they ship.

**Acceptance.**
1. Publish a checklist with conditional temperature and photo steps, fail a limit and try to submit with missing required evidence through phone and API.
2. Inspect blocked submission, linked finding and retained step revision.

**Evidence.** `tests/gasket/flows.mjs` — "FIELD-004 typed checklists and required evidence"
**Gap.** A public-door journey native app and offline typed steps, conditions, step photos and submission blockers is missing. The cited journeys show web/API typed results, limits, exceptions and findings.

#### FIELD-005 — Photos, annotations and signatures

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** Technicians capture timestamped before/after photos, annotate damage, attach documents and collect named technician/customer or supervisor signatures tied to the exact work revision. Original files/digests survive edits and sync; signature capture never claims equipment certification. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#field-005).

**Acceptance.**
1. Capture/annotate two photos, obtain a named signature, change the work and submit a stale signature.
2. Download originals and inspect revision binding, required re-signing and offline upload provenance.

**Evidence.** `tests/gasket/flows.mjs` — "FIELD-005 photos, annotations and revision-bound signatures"
**Gap.** A public-door journey offline signatures and original-file synchronization is missing. The cited journeys show online annotations, originals, signature revisions and required re-signing.

#### FIELD-006 — Wrench time, labor and contractor costs

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1

**Requirement.** Technicians start, pause and resume timers and enter corrected time with reasons, distinguishing wrench time, travel, wait and admin by person and work. Overlap and implausible duration need review; authorized labor rates, overtime policy and contractor charges cost work without exposing pay rates to unauthorized roles. The recorded maintenance policy is in RULINGS.md RL-6. ADMIN-002 and ADMIN-003 inherit the same source and rate privacy when site scope and delegated rights ship; FIELD-002 and FIELD-003 inherit retained segments and approval semantics when offline time ships. Original work-minute notes retain author attribution but declare no performer, interval, category or approval; they remain separately disclosed evidence, never guessed person time or pay. REPORT-010 carries approved person time under these privacy rights as part of its PDF capability.

**Acceptance.**
1. Record two technicians' timed work and a contractor invoice, cross midnight, correct a timer and attempt overlap.
2. Inspect approved hours and USD costs on work and asset reports, with rates hidden from a requester.
3. The owner manages rates, overtime, invoice capture and time decisions; technicians submit and read their own source entries.
4. Every entry needs a reasoned review, with overlaps and durations over 16 hours flagged.
5. Timers submit separate elapsed segments when paused or stopped; paused gaps contribute no time.
6. Corrections retain the original and replace it only when approved.
7. Approval snapshots the latest authorized rate and splits elapsed time at each site midnight; each day uses its remaining regular-time allowance after other approved time, then the overtime multiplier.
8. A later rate or correction never reprices other approved snapshots. Existing report readers receive aggregate approved time and work costs; person-level cost and pay policy remain owner-only, and audit details contain no pay rate. Overtime is a configurable review policy, not a legal wage calculation; no payroll data is transmitted.

**Evidence.** `tests/gasket/labor-costs.mjs` — "laborJourney"; `tests/gasket/work-costing.mjs` — "costingJourney"
**Gap.** None.

#### FIELD-007 — Crew completion and independent review

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-2

**Requirement.** Multi-person work records each contributor and required step sign-off, supports blocked/in-progress/returned states and independent supervisor review. Reassignment preserves contributors, so no one who performed any step can approve; material changes require fresh review. Contributors are the assignee and collaborators (PLAN-002); each checklist step keeps who signed it off, and every step needs a result before submission. Work is blocked while it carries an open owned blocker (PM-006) or a waiting status (PLAN-001), and stays in progress meanwhile. Anyone who recorded a step result, reading, part movement, downtime, finding or evidence on the work, whoever holds it now, is refused approval. Every record makes a new revision of the work; submitted work takes no records until it is returned, and an approval names the exact revision it read (an older one is refused as stale).

**Acceptance.**
1. Complete a repair with two technicians, reassign to a third, submit and attempt review by each contributor.
2. Require independent approval of the exact final revision and retain the return/rework history.

**Evidence.** `tests/gasket/flows.mjs` — "FIELD-007 crew completion and independent review"
**Gap.** None.

#### FIELD-008 — Field usability and controlled print

Core · target · **partial** · From FIELD-008

**Requirement.** Phone execution provides glove-usable controls, camera/scanner support, accessible instructions and explicit save/sync feedback. Printable work packs retain IDs and revisions for controlled later entry. The declared measurable control size and spacing are specified in [Maintenance semantics](docs/maintenance-semantics.md#field-008).

**Acceptance.**
1. At phone width, use long work instructions and measure each interactive target against the declared size and spacing.
2. Print a work pack and re-enter its evidence with original work and revision provenance.

**Evidence.** `migrations/core/0106_controlled_print_packs.sql`; `tests/gasket/print-packs.mjs` — printPacksJourney: immutable primary-site non-meter pack issuance and PDF downloads, retained authored instructions after checklist and template master edits, identifying pack and work and checklist revisions on every PDF and native browser-printed page, current human assignment and collaboration with successful collaborator acceptance and removed-collaborator receipt replay refusal, independent English and Spanish pack preferences and labels and errors, original-paper preview and separately declared performance time, atomic results and evidence and correction effects with a durable authenticated-entry receipt and member-bound and action-bound form retries, lost replies and Worker restart without duplicates, stale or foreign packs and changed-payload refusal, revoked and signed-out and ended and reassigned and agent and service and planned-site refusal, normal completion and independent review, retained work and user and paper-original erasure dependencies with ordinary optional attachment erasure preserved. The journey uses the native web and JSON doors and shows the pack, entry preview, receipt and browser print view at 1440 and 390. `tests/gasket/site-access.mjs` — siteAccessJourney: enumerated print reads refuse planned-site selection without returning primary-site identity or shell data. `tests/gasket/recovery.mjs` — recoveryJourney: inactive archive restoration reconciles immutable pack PDF bytes, original paper bytes, results and receipt, excludes source sessions and retains retry identity after another Worker restart.
**Gap.** Operational primary-site online print slice only. Remaining: glove-usable control dimensions and spacing, camera and scanner support and real-phone usability qualification; native iOS and Android execution; offline capture and synchronization and cache isolation; shared-device sign-out and lost-device revocation with device proof; SMS sender qualification under Twilio A2P and APNs and FCM push delivery. Other controlled print and later-entry coverage, including meter readings, stock and labor transactions and paper safety attestations, remains unbuilt; existing server safety, ordinary completion and independent-review gates remain mandatory. Full language and locale coverage and Arabic right-to-left qualification retain ADMIN-013; requester and contractor and phone-only identities retain ADMIN-004 and ADMIN-014; operational multi-site scope retains ADMIN-002. This slice retains immutable paper provenance and refuses erasure with retained dependencies; broader erasure authority and complete estate archive qualification remain unproved. Full FIELD-008 acceptance remains unproved.

#### FIELD-010 — Shared and lost device lifecycle

Core · target · **missing** · From FIELD-008, FIELD-003

**Requirement.** Shared-device sign-out protects cached maintenance data. Lost devices can be revoked without deleting server history; local expiry and wipe behavior are disclosed.

**Acceptance.**
1. Sign out a shared device and try to read another person’s cached maintenance work.
2. Revoke a lost device, try its queued upload and inspect refusal, cache isolation and intact server history.

**Evidence.** `migrations/core/0106_controlled_print_packs.sql`; `tests/gasket/print-packs.mjs` — printPacksJourney: immutable primary-site non-meter pack issuance and PDF downloads, retained authored instructions after checklist and template master edits, identifying pack and work and checklist revisions on every PDF and native browser-printed page, current human assignment and collaboration with successful collaborator acceptance and removed-collaborator receipt replay refusal, independent English and Spanish pack preferences and labels and errors, original-paper preview and separately declared performance time, atomic results and evidence and correction effects with a durable authenticated-entry receipt and member-bound and action-bound form retries, lost replies and Worker restart without duplicates, stale or foreign packs and changed-payload refusal, revoked and signed-out and ended and reassigned and agent and service and planned-site refusal, normal completion and independent review, retained work and user and paper-original erasure dependencies with ordinary optional attachment erasure preserved. The journey uses the native web and JSON doors and shows the pack, entry preview, receipt and browser print view at 1440 and 390. `tests/gasket/site-access.mjs` — siteAccessJourney: enumerated print reads refuse planned-site selection without returning primary-site identity or shell data. `tests/gasket/recovery.mjs` — recoveryJourney: inactive archive restoration reconciles immutable pack PDF bytes, original paper bytes, results and receipt, excludes source sessions and retains retry identity after another Worker restart.
**Gap.** Shared-device sign-out and lost-device revocation with device proof, offline cache isolation, queued-upload refusal and local expiry/wipe disclosure remain unbuilt. The cited journeys show current human-session and membership refusals, including after inactive archive restoration, without a native or offline device lifecycle. Operational primary-site online print slice only. Remaining: glove-usable control dimensions and spacing, camera and scanner support and real-phone usability qualification; native iOS and Android execution; offline capture and synchronization and cache isolation; shared-device sign-out and lost-device revocation with device proof; SMS sender qualification under Twilio A2P and APNs and FCM push delivery. Other controlled print and later-entry coverage, including meter readings, stock and labor transactions and paper safety attestations, remains unbuilt; existing server safety, ordinary completion and independent-review gates remain mandatory. Full language and locale coverage and Arabic right-to-left qualification retain ADMIN-013; requester and contractor and phone-only identities retain ADMIN-004 and ADMIN-014; operational multi-site scope retains ADMIN-002. This slice retains immutable paper provenance and refuses erasure with retained dependencies; broader erasure authority and complete estate archive qualification remain unproved. Full FIELD-008 acceptance remains unproved.

#### FIELD-009 — Technician-created and after-the-fact work

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1

**Requirement.** Technicians create their own unplanned work from the iOS and Android app (FIELD-001), the web workspace and the JSON API; it is a default right of the technician role (ADMIN-003) that an owner or site admin revokes per site. A technician opens new corrective or emergency work against a scanned asset (ASSET-002), a picked asset or a location with no asset (PLAN-001), with priority, description, photos and an optional template, then assigns it to themselves or leaves it unassigned on the lead's board. They can also record work already done: past start and end times, parts issued (PART-003), a closed downtime (GAS-14) and a checklist from a template. Technician-created work keeps a stable work number and follows the same template, required-field, required-evidence and stock rules as lead-created work (PLAN-001, FIELD-004). It goes to independent supervisor review (GAS-09, FIELD-007), and its creator, like any contributor, cannot approve it. Work created offline (FIELD-002) syncs exactly once; if the creator's create-work right or access ended meanwhile it is refused at sync with a visible per-record reason (FIELD-003, ADMIN-014). Requesters, contractors and roles without the right are refused at every door and use request intake (REQ-001, REQ-002) instead. The creator, the door used (app, web, API or offline sync) and the time are recorded in the audit (ADMIN-006), and technician-created work counts in backlog, MTTR and downtime reporting (REPORT-003, REPORT-005) exactly like other work. Until site admins exist (ADMIN-002/003) the owner turns the right off and on for the site; while it is off every create door refuses a technician, and a follow-up raised by a finding on work they hold (GAS-15) is not technician-created work. The door is recorded as `web` (the workspace's form door) or `api` (the JSON API); FIELD-001 adds `app` and FIELD-002 `sync`. Past start and end are site-local minutes, given together, with start no later than end and end no later than the site's clock; a template's checklist is pinned at the revision current when the work is created. Doors and identities that do not exist yet carry these obligations in their own text and acceptance before they ship: the app and QR scan (FIELD-001, ASSET-002), offline creation with exactly-once sync and refusal at sync (FIELD-002, FIELD-003), per-site revocation across sites (ADMIN-002) and requester and contractor refusal (ADMIN-004).

**Acceptance.**
1. On the iOS and Android app, a technician scans an asset QR label and creates corrective work with priority, description and a photo, assigns it to themselves, and sees it in their own queue and on the lead's board.
2. The technician records work already done with a past start and end time, parts issued, a closed downtime and a checklist from a template; it goes to independent supervisor review and the creator's approval is refused.
3. Omit a required template field and required photo evidence on technician-created work through the app and the API and see the same refusal a lead gets.
4. An owner removes the create-work right from the technician role at one site; that site's technicians are refused at the app and the API while technicians at the other site still create work.
5. A requester and a contractor are refused at the same app and API doors.
6. Open the backlog, MTTR and downtime reports and the audit download, and see the technician-created work counted, with its creator and door attributed.
7. Create work in airplane mode, revoke the creator's right before reconnecting, sync, and see the work refused with a visible reason that stays on the device and the lead's view.

**Evidence.** `tests/gasket/flows.mjs` — "FIELD-009 technician-created and after-the-fact work"
**Gap.** A public-door journey iOS/Android creation, two operational sites, requester/contractor refusal and revoked offline sync is missing. The cited journeys show web/API creation, after-the-fact evidence, current-site rights, independent review and report/audit attribution.

### Spare parts and storerooms

#### PART-001 — Multi-location stock and bin visibility

Core · target · **partial**

**Requirement.** Stores staff see on-hand, reserved, available, on-order and in-transit quantities per site/storeroom/bin with barcode lookup and units. Reorder and issue decisions use available stock; site permissions govern transfers and reads. Stock value and average cost (PART-007) are kept per site, storeroom and bin, and cycle counts (PART-004) are planned and counted by bin. ASSET-002 supplies published bin-location labels; when this clause adds stock-bin records, their scans must open the authorized stock-bin record without expanding public access.

**Acceptance.**
1. Receive the same bearing into two sites and three bins, reserve one quantity and scan a bin.
2. Compare available/on-hand/on-order totals and attempt an unauthorized cross-site read.

**Evidence.** `src/gasket/parts.ts`; `src/gasket/reservations.ts`; `src/gasket/catalogs.ts`; `tests/gasket/flows.mjs`; `tests/gasket/part-catalog.mjs`; `src/gasket/stock-sources.ts`; `src/gasket/ui/labels.ts`; `tests/gasket/receiving.mjs` (receivingJourney: same-part receipt sources across three bins, bin lookup, public-scan isolation and other-site refusal); `tests/gasket/receiving-browser.mjs` (controlledBrowser at 1440 and 390)
**Gap.** Current-site receipt-source quantities are visible for the same part across named bins, with authenticated bin-name lookup and a private stock-source link from published bin labels. Signed-out scans expose no stock and an unknown site is refused. Gap: Complete bin balances require reservation allocation, per-bin valuation, on-order allocation and count reconciliation, including historical unattributed movements. Additional-site scope remains ADMIN-002 and in-transit quantities remain PART-006; PART-001 remains partial.

#### PART-002 — Parts reservations, kits and approved substitution

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Planners reserve parts or repair kits to work before dispatch, allocating across bins and approved substitutes. Reservations expire/release on cancellation; competing work cannot reserve the same last unit. Physical issue remains a separate movement. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#part-002).

**Acceptance.**
1. Reserve a repair kit to two competing work orders, substitute an approved part and cancel one order.
2. Inspect exact available stock, released reservation and unchanged physical on-hand until issue.

**Evidence.** `tests/gasket/flows.mjs` — "PART-002 parts reservations, kits and approved substitution"
**Gap.** A public-door journey allocating reservations across multiple stock bins is missing. The cited journeys show same-site reservations, substitution, competing stock refusal and release.

#### PART-003 — Controlled issues, returns and traceability

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1

**Requirement.** Issues/returns identify work, asset, person, bin, quantity and effective time; lot/serial/expiry tracking is available for controlled spares. Returns preserve original issue value, quarantine damaged items and never exceed holdings; a damaged work return credits the work at its retained issue value and records an equal, separate quarantine adjustment, excluded from usable stock and available value until disposition. A reason is required and the current return form defaults to usable; offline conflicts require explicit resolution. Expiring lots appear in the stores report (PART-009). The current web and JSON doors require an explicit receipt source and stable request identity for controlled issues; a serial is one whole unit. Recorded expiry permits issue through that site-local date and refuses later dates. Usable returns and inspected releases retain their source. Historical unattributed issues and count variances refuse affected controlled stock pending bin reconciliation under PART-001. FIELD-002 inherits offline reconciliation. The recorded maintenance policy is in RULINGS.md RL-11.

**Acceptance.**
1. Issue a serialized spare from a named bin, return one damaged item and attempt an excess return/replayed offline issue.
2. Inspect linked movements, quarantine quantity, original valuation and duplicate refusal.

**Evidence.** `tests/gasket/work-returns.mjs` — "workReturnsJourney"; `tests/gasket/receiving.mjs` — "receivingJourney"
**Gap.** None.

#### PART-004 — Cycle counts and inventory adjustments

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1

**Requirement.** Stores staff plan blind counts by bin, freeze or reconcile concurrent movements and submit variances for configured independent approval. Each approved adjustment appends an attributed movement; lost, found and damaged stock have reason codes and cost effect. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#part-004).

**Acceptance.**
1. Count a bin while another technician issues one unit, submit a variance and approve as the stores supervisor.
2. Inspect reconciled expected balance, stale-count refusal and auditable quantity/value adjustments.

**Evidence.** `tests/gasket/flows.mjs` — "PART-004 cycle counts and inventory adjustments"
**Gap.** None.

#### PART-005 — Reorder points, lead time and automatic replenishment

Core · target · **done** · Cites BASE-OPS-003, BASE-OPS-004 · Rules D-2

**Requirement.** Leads set minimum/maximum, reorder quantity, safety stock, vendor and lead time per location. Crossing available-stock thresholds alerts stores, drafts a deduplicated requisition/PO and follows it until receipt; automatic ordering only uses a separately approved vendor/spend envelope. Open replenishment documents and their age appear in the stores report (PART-009). The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#part-005).

**Acceptance.**
1. Consume below minimum, run the replenishment worker twice, inspect one draft and delivered notice, approve within a spend envelope and receive a partial delivery.
2. Inspect remaining shortage and due-date follow-up.

**Evidence.** `tests/gasket/replenishment.mjs` — "replenishmentJourney"
**Gap.** None.

#### PART-006 — Inter-site transfers and stock reconciliation

Core · target · **missing**

**Requirement.** Stores can request, approve, dispatch and receive transfers with in-transit custody and partial/lost quantities. Sender and receiver rights are separate; network replay never moves stock twice and count reports reconcile source, transit and destination. Open transfers and their age appear in the stores report (PART-009).

**Acceptance.**
1. Transfer ten seals between sites, receive eight and mark two lost after approval, then replay delivery confirmation.
2. Inspect source/destination/transit movements and variance cost without a second receipt.

**Evidence.** None.
**Gap.** No multi-site transfer, transit custody or partial-transfer reconciliation.

#### PART-007 — Inventory valuation and transaction history

Core · target · **done**

**Requirement.** Parts retain purchase price, landed freight/tax allocation and a disclosed moving-average or FIFO policy. Work consumption snapshots its cost; later price changes and returns do not rewrite old asset cost. Owners can reconcile opening, movement and closing quantity/value. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#part-007).

**Acceptance.**
1. Receive two differently priced lots with freight and sales tax, issue/return units and change the vendor price.
2. Download a period reconciliation and verify exact USD valuation and immutable historic work cost.

**Evidence.** `tests/gasket/flows.mjs` — "PART-007 inventory valuation and transaction history"
**Gap.** None.

#### PART-008 — Supplier catalogs and duplicate part control

Core · target · **done**

**Requirement.** Parts support manufacturer/vendor numbers, unit packs/conversions, preferred and alternative suppliers, approved equivalences, photos and catalog prices. Proposed duplicate merges show all dependencies and preserve aliases/movements under an approved canonical item. Catalog CSVs name a stocking unit and the stocking quantity in one supplier pack; pack receipts multiply exact three-decimal quantities and refuse a result beyond three decimals, with USD extended pack prices rounded half up to cents. A repeated manufacturer number proposes a duplicate, never merges automatically. A lead or owner previews and approves a canonical item in the same stocking unit with a reason and the fingerprint of its dependencies; a changed preview, unfinished physical count or contradictory current BOM serial range is refused. A shelf count observed before a merge is stale even if the latest movement sequence is unchanged. Original part identities, movement quantities and values, receipts, kit and BOM revisions, aliases and photos remain retained; lookup of either old number opens the canonical item, whose balance combines their movements. The chosen canonical item supplies its shelf, minimum and current replenishment policy; source policies remain historical and all existing purchase documents still count against further replenishment. Catalog imports require a no-write review and exact source fingerprint, replay idempotently and retain source bytes, digest and attribution; undo removes only their changes and refuses later dependencies.

**Acceptance.**
1. Import two supplier catalogs with each/box quantities and duplicate manufacturer numbers, preview and approve a merge, then scan either old number.
2. Inspect correct conversion, compatibility and complete movement history.

**Evidence.** `tests/gasket/part-catalog.mjs` — "partCatalogJourney"
**Gap.** None.

#### PART-009 — Stock performance and inventory history

Core · target · **partial**

**Requirement.** Stores report stockouts, demand by asset/work, slow/dead stock, turns, count accuracy, expiring lots and open replenishment/transfer age. Every number drills to movements and separates historical imports from current balances. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#part-009).

**Acceptance.**
1. Receive, reserve, issue, count and age spare stock, then filter the stores dashboard by site and download source movements.
2. Reconcile stockout and inventory value denominators with the same period.

**Evidence.** `tests/gasket/flows.mjs` — "PART-009 stock performance and inventory history"
**Gap.** A public-door journey filtering operational sites and inspecting open transfer age is missing. The cited journeys show current-site demand, stockouts, value, count accuracy and imported stock.

### Maintenance purchasing and external work

#### BUY-001 — Vendor records and maintenance requisitions

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Buyers manage US supplier contacts, ship-to addresses, tax treatment, payment terms, lead times, catalogs and active status. Technicians/planners request parts, services or repairs linked to work/asset/cost center, with an accountable purchaser and visible approval state. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#buy-001).

**Acceptance.**
1. Create a supplier and a technician requisition for bearings plus contractor labor, link the asset and cost center, and inspect the buyer queue.
2. Disable the supplier and try to place new work against it.

**Evidence.** `tests/gasket/purchasing.mjs` — "purchasingJourney"
**Gap.** None.

#### BUY-002 — Quotes and numbered purchase orders

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-MAIL-001 · Rules D-2

**Requirement.** Buyers compare vendor quotations and draft sequentially numbered POs with quantities, units, USD prices, freight, US sales/use-tax fields, delivery dates, work/asset links and attachments. Sending records the exact approved revision and vendor acknowledgment separately. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#buy-002).

**Acceptance.**
1. Compare two quotes, draft a mixed parts/service PO, approve and send through vendor email, then revise quantity.
2. Inspect numbered versions, totals, linked work and the requirement to reapprove changed spend.

**Evidence.** `tests/gasket/purchase-orders.mjs` — "purchaseOrdersJourney"
**Gap.** None.

#### BUY-003 — Spend approval and purchasing separation

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-2

**Requirement.** Owners define per-site/cost-center budgets, dollar approval limits and multi-step approval/delegation. An initiator cannot approve their own purchase; currency, line or vendor changes invalidate approval. Emergency overrides require named authority and remain reportable. This clause extends BUY-002's exact-revision independent approval, invalidation on every edit and immutable send history with its budget, multi-step, delegation and emergency controls before it ships, including approval thresholds that may permit small POs to skip manual approval. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#buy-003).

**Acceptance.**
1. Submit a $4,500 PO across two approval limits, attempt self-approval, delegate during leave and change a line after approval.
2. Inspect correct routing, renewed approval and separately reported emergency override.

**Evidence.** `tests/gasket/spend.mjs` — "spendJourney"
**Gap.** None.

#### BUY-004 — Partial receiving, inspection and returns

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1

**Requirement.** Stores match deliveries to approved PO lines, receive partially by bin/lot/serial, inspect/quarantine damaged goods and record backorders or supplier returns. Duplicate receipt identities do not add stock twice; remaining quantities stay open and receipts carry evidence. A delivery's freight and sales tax are allocated across its lines by line value before each line lands at its valued cost (PART-007). The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#buy-004).

**Acceptance.**
1. Receive six of ten ordered parts, quarantine one, upload the packing slip and replay the receipt ID.
2. Inspect five usable units, remaining order, quarantine/return movement and no duplicate quantity.

**Evidence.** `tests/gasket/receiving.mjs` — "receivingJourney"
**Gap.** None.

#### BUY-005 — Bills, match exceptions and financial handoff

Core · target · **missing**

**Requirement.** Each received/partially received delivery can create a linked supplier bill. Buyers reconcile PO, receipt and bill quantity/price/tax, track credits and send approved bills/cost allocation to accounting. Payment status returns from the ledger; Gasket does not itself become a bank or general ledger.

**Acceptance.**
1. Record two deliveries and bills, introduce a price/quantity mismatch, resolve under authorized tolerance and sync to QuickBooks Online.
2. Replay and reverse a receipt; inspect one ledger bill per approved source and retained credit linkage.

**Evidence.** None.
**Gap.** No delivery bills, three-way matching, credits or ledger reconciliation.

#### BUY-006 — Vendor delivery follow-up and replenishment control

Core · target · **done** · Cites BASE-OPS-003, BASE-OPS-004, BASE-MAIL-001

**Requirement.** Buyers see promised/actual delivery, late items, acknowledgments and partial receipts; configured reminders chase the vendor and escalate a parts blocker to the planner. Auto-buy limits apply per order and period, and pausing a rule preserves open orders. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#buy-006).

**Acceptance.**
1. Send an approved PO, withhold vendor acknowledgment, advance past promised delivery and receive only part.
2. Inspect vendor reminder, planner escalation, outstanding quantity and blocked overspend.

**Evidence.** `tests/gasket/vendor-follow-up.mjs` — "vendorFollowUpJourney"; `tests/gasket/replenishment.mjs` — "replenishmentJourney"
**Gap.** None.

#### BUY-007 — Contractor and external repair work

Core · target · **missing**

**Requirement.** Leads scope and authorize contractor work with quotes, service terms, qualification/insurance expiry, asset access window and expected costs. Contractors submit evidence, time/materials and invoices against scoped work; an independent supervisor accepts before costs are finalized.

**Acceptance.**
1. Send a pump rebuild to a contractor with an expiring qualification, receive quote and completion evidence, return incomplete work, then accept and match its invoice.
2. Inspect scoped access and actual cost in asset history.

**Evidence.** None.
**Gap.** No external repair lifecycle, contractor qualification, service acceptance or invoice capture.

#### BUY-008 — Purchasing visibility and vendor performance

Core · target · **partial**

**Requirement.** Buyers report committed versus actual maintenance spend, open/late PO lines, approval age, vendor lead-time/quality and receipt/bill exceptions by site, asset and cost center. Reports link to original approvals, deliveries and posted financial IDs.

**Acceptance.**
1. Draft, approve, partially receive and bill POs from two vendors, then download a monthly purchasing report.
2. Reconcile commitments, actuals, late quantities and exception age to source documents.

**Evidence.** `src/gasket/purchase-report.ts`; `src/gasket/vendor-follow-up.ts`; `src/gasket/receiving.ts`; `tests/gasket/spend.mjs`; `tests/gasket/vendor-follow-up.mjs`; `tests/gasket/receiving.mjs`
**Gap.** Source-linked purchasing commitments, releases/emergencies, open/late delivery lines and receipt/quarantine quantities exist; consolidated monthly purchasing downloads, actual bills/financial IDs, vendor quality/lead-time aggregation, approval/exception age and complete site/asset/cost-center reconciliation remain absent.

### Costs, reliability and management reporting

#### REPORT-001 — Work and asset maintenance costing

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Every work order and asset shows actual labor, consumed and returned parts, contractor, tool and miscellaneous USD costs alongside estimates, commitments and posted amounts. Parent, site and cost-center rollups avoid double counting and rate visibility follows role rights; parent roll-ups follow the asset hierarchy (ASSET-001). The repair cost entries leads record on work orders (REPORT-005) are part of a work order's actual cost, and REPORT-005 ranks by this clause's reconciled work cost before it ships. Consumed and returned parts are the values PART-007 keeps on each issue and return, never a later price. The recorded maintenance policy is in RULINGS.md RL-7. REPORT-010 carries reconciled costs and approved time into its authorized PDF fields as part of its PDF capability. BUY-005 and REPORT-008 inherit provider-confirmed bill and ledger reconciliation before shipping; ADMIN-002 and ADMIN-003 inherit current cost scopes and protected person-level rates.

**Acceptance.**
1. Complete a two-technician repair using parts and a contractor, return an unused part and reconcile work, asset, parent and site cost downloads with underlying approved entries.
2. Open the downtime Pareto (REPORT-005) and see each failure's repair cost equal its work order's reconciled cost.
3. Actuals add retained manual entries, signed consumed and returned PART-007 values, approved labor snapshots and captured contractor invoices, once per source.
4. Existing manual entries stay additive because their external provenance is not guessed.
5. Work, direct asset, current subtree, site and cost-center downloads share these sources; overlapping subtree rows are explicitly non-additive.
6. Estimates, live approved purchase commitments, external commitment records and owner-recorded posted amounts are separate comparisons, never additional actual cost or verified ledger postings.
7. Comparison corrections append a referenced credit; unknown source values and missing imported components remain disclosed.
8. New financial comparison and work cost-center writes are owner-only; existing report readers retain aggregate USD access, without individual labor rates.

**Evidence.** `tests/gasket/work-costing.mjs` — "costingJourney"; `tests/gasket/labor-costs.mjs` — "laborJourney"
**Gap.** None.

#### REPORT-002 — Downtime and production availability

Core · target · **done**

**Requirement.** Report planned/unplanned outages, degraded operation, reason, failure mode, affected production window and availability denominator. Overlapping component events roll up without double counting; open outages and uncertain feed coverage remain visible with drill-down. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#report-002).

**Acceptance.**
1. Enter overlapping component outages across a reporting boundary and a planned shutdown, then inspect asset/line availability and source timeline.
2. Verify clipped windows, excluded planned time policy and explicit unknown coverage.

**Evidence.** `tests/gasket/flows.mjs` — "REPORT-002 downtime and production availability"
**Gap.** None.

#### REPORT-003 — MTBF, MTTR and failure analysis

Core · target · **done**

**Requirement.** Reliability reports calculate MTBF from defined operating time and qualifying failure counts, MTTR from defined repair durations, and MTTA from acknowledgment events. Definitions, sample size, exclusions and unknown inputs are displayed; failure-code Pareto and repeat failures link to work. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#report-003).

**Acceptance.**
1. Record three failures, one planned stop and missing operating coverage; compare MTBF/MTTR/MTTA and failure Pareto to hand-calculated source events.
2. Correct a failure classification and inspect revised definitions and retained provenance.

**Evidence.** `tests/gasket/flows.mjs` — "REPORT-003 MTBF, MTTR, MTTA and failure analysis"
**Gap.** None.

#### REPORT-004 — Backlog, PM compliance and schedule performance

Core · target · **done**

**Requirement.** Leads see backlog age and estimated hours, overdue risk, PM on-time compliance, planned/reactive ratio, schedule attainment and work awaiting review. Missed/skipped/canceled PM occurrences remain in the disclosed denominator and drill to accountable work/blockers. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#report-004).

**Acceptance.**
1. Create on-time, late, canceled and ungenerated PM obligations plus reactive repairs, then filter by site/team and compare counts/hours and compliance denominator against source due occurrences.

**Evidence.** `tests/gasket/flows.mjs` — "REPORT-004 backlog, PM compliance and schedule performance"
**Gap.** None.

#### REPORT-005 — Downtime Pareto and cost of bad actors

Core · target · **done**

**Requirement.** Leads rank downtime by asset, line, failure mode and reason, alongside repeat failures, repair cost and documented lost-production assumptions. Unknown costs remain unknown; drill-down explains each ranked contributor and excludes duplicate component time. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#report-005).

**Acceptance.**
1. Enter costed failures across three assets, including overlapping components and one unknown loss rate, then inspect Pareto/cumulative percentages and exported inputs without a fabricated loss estimate.

**Evidence.** `tests/gasket/flows.mjs` — "REPORT-005 downtime Pareto and cost of bad actors"
**Gap.** None.

#### REPORT-006 — Scheduled reports and CSV PDF delivery

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-MAIL-001

**Requirement.** Authorized users save report filters and schedule site-local email delivery of readable PDF and complete CSV datasets. Exports include definitions, period, freshness and permission scope; delivery failures are visible and restricted rates and files never leak to recipients. The report settings support weekly Performance, Reliability, Availability, Downtime Pareto, asset history and stock valuation packs with saved team or asset filters where supported. Asset history requires one asset and retains period events with attribution and source references, excluding the asset detail document links. Valuation retains site-wide opening, movement and closing quantities and values with unpriced movement coverage; it refuses an asset filter. Each occurrence covers the seven completed site days before its delivery date. The saved site time zone survives later site setting changes. A repeated wall time uses its later occurrence; a missing wall time uses the first valid minute after the clock gap. Delayed execution handles one oldest outstanding occurrence per tick and retains each original reporting period. CSV uses typed scalar paths to retain every value and empty collection, with formula-safe cells; PDF retains readable report values and versioned definitions. Freshness, permission scope, source revision, source fingerprint, dashboard links and authorized site-wide data-quality context accompany the dataset. An owner creates and authorizes a schedule revision and its named recipients with audited consent in the product; an agent’s call to create, edit or authorize one carries external (+ sensitive), which the company’s policy decides. An owner may name one active report reader as a delegated author for that schedule. Delegates can read and edit only their assigned schedules while the owning principal remains an active owner; every delegated edit is audited and forces a pause until an owner reviews and explicitly authorizes the saved revision. Delegates cannot grant authority, create independent schedules or resume delivery. Current report and export permissions, reassignment and ended access are enforced at schedule, draft, preview and download doors. Every recipient must currently have report and history-export access; the job rechecks the active owning principal, recipient role and saved revision after generation and immediately before sending one separate message per recipient. Original evidence files and individual labor rates are not included. A durable occurrence claim prevents automatic duplicate submission after retry or restart. Provider acceptance is distinct from inbox delivery; excluded, failed, rejected, uncertain and interrupted unconfirmed attempts remain visible and are never automatically resent. ADMIN-002 inherits multi-site authorization at every report, preview, dispatch and download door; ADMIN-003 inherits broader delegated scheduling rights and ADMIN-013 inherits localized packs. Additional report families must reuse their own access and redaction rules before scheduling ships for them.

**Acceptance.**
1. Schedule a weekly supervisor pack across daylight saving, inspect email, PDF and CSV at the provider edge and reconcile rows with the dashboard.
2. Remove recipient access before delivery and verify exclusion with a visible delivery result.
3. Any later repair must reconcile the original attempt before explicit authorization of another submission.

**Evidence.** `tests/gasket/report-schedules.mjs` — reportSchedulesJourney: explicit human-owner consent and attributed consent and delegated edit audit, saved filters and all six complete CSV datasets reconciled to public report reads; independently calculated PDF results, original-file and individual-rate exclusion, role removal, paused and stale drafts, delegated preparation and reauthorization, DST gaps and repeated times, visible rejected, uncertain and real PDF generation failures without resend. `tests/gasket/report-pack-assertions.mjs` — assertPack: complete versioned definitions, period, saved zone, freshness, permission scope, source revision, source fingerprint, working dashboard links and authorized site-wide quality context in CSV and PDF. `tests/gasket/report-schedule-riders.mjs` — scheduleRiders: saved-zone previews and edits after a site setting change, delayed original periods, concurrent claims, in-generation authority and revision changes, owner revocation and assigned-delegate isolation. `tests/gasket/report-interruption.mjs` — interruptClaim: kill the actual Worker process group after a durable D1 claim, restart the installation, retain the unconfirmed result and reconciliation guidance without resubmission. `tests/gasket/report-schedule-browser.mjs` — reportScheduleScreens: owner form authorization, saved authorization after a lost reply with retained fields and refused replay, delegated paused save and every retained failure result at 1440 and 390. `tests/gasket/report-provider.mjs`: held-key SendGrid qualification of the built scheduled door, actual PDF and CSV inspection, HTTP 202, provider reference and one submission; inbox receipt is not claimed. `RULINGS.md` records the approved inherited duties explicitly named in ADMIN-002, ADMIN-003 and ADMIN-013. The repaired reportSchedulesJourney asserts all four retained boundary fixtures and exactly two exported in-period events, independently of the public report response. Direct assertions for typed empty arrays and objects, site-wide quality, history actors and unpriced values precede aggregate dataset comparisons.
**Gap.** Independent history-period exclusion and distinct mutation assertion repairs await fresh ct judgment. REPORT-006 remains partial until ct accepts the repaired proof; exact-candidate full-history publication scan and guarded landing receipts remain required.

#### REPORT-007 — Custom dashboards and cross-site comparisons

Core · target · **missing**

**Requirement.** Analysts build saved charts/tables over documented measures, dimensions and custom fields, compare normalized sites/assets and drill to permissioned records. Global totals disclose sites and missing data; filters, formulas and report versions are exportable.

**Acceptance.**
1. Build a cost-per-operating-hour dashboard for two sites, save/share it and remove one site grant.
2. Inspect recomputed permitted totals, a missing-hours warning and portable measure definitions.

**Evidence.** None.
**Gap.** No report builder, saved custom charts or site comparisons.

#### REPORT-008 — Maintenance budgets and repair replacement planning

Core · target · **partial**

**Requirement.** Leads plan monthly/annual USD maintenance budgets by site/asset/cost center, compare actual plus committed spend and forecast remaining work. Repair/replace scenarios use failure and lifecycle costs with explicit assumptions; approving a scenario binds its exact version, and an agent’s approval carries commitment, which the company’s policy decides. Capital accounting stays in ERP.

**Acceptance.**
1. Set a budget, approve POs and complete work across month end, then compare forecast/actual/commitment and a replacement scenario.
2. Inspect no double counting between PO commitment and posted bill.

**Evidence.** `src/gasket/purchase-policy.ts`; `src/gasket/purchase-report.ts`; `src/gasket/lifecycle.ts`; `tests/gasket/spend.mjs`; `tests/gasket/flows.mjs`
**Gap.** Dated site/cost-center purchasing budgets, source-linked commitments and asset repair-versus-recorded-replacement comparisons exist; maintenance actual/commitment forecasts by asset/period, approved replacement scenarios and PO-to-posted-bill reconciliation remain absent.

#### REPORT-009 — Reliable measure definitions and data quality

Core · target · **done**

**Requirement.** Every KPI names its formula, event time policy, exclusions and input freshness. Data-quality views surface unmatched costs, missing failure codes, counter gaps and unresolved imports; metric changes are versioned and cannot improve performance by silently dropping unresolved work. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#report-009).

**Acceptance.**
1. Import incomplete history and late readings, open a KPI's definition and source list, then resolve a missing code.
2. Inspect traceable recomputation, explicit coverage and unchanged original history.

**Evidence.** `tests/gasket/metrics.mjs` — "metricsJourney"; `tests/gasket/intervals.mjs` — "intervalJourney"; `tests/gasket/outcomes.mjs` — "outcomeJourney"
**Gap.** None.

#### REPORT-010 — Completed work-order PDF

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Anyone with access to a work order downloads it, open or completed, as a single PDF to hand to an auditor, customer or contractor. The PDF holds the work number, asset and location, type, priority, dates, assignee and contributors, the exact procedure revision with every step result, readings with units, notes, comments, parts used and returned, time entries, embedded photos with their original-file digests, named signatures with time and revision, the review decision and the audit trail. Labor rates and costs appear only for viewers allowed to see them (ADMIN-003), interface text follows the viewer's display language (ADMIN-013) while user-entered text stays as authored, and a PDF of work changed after signing marks the signatures stale. Leads can select several work orders and download one PDF each in a ZIP.

**Acceptance.**
1. Complete a work order with a failed step, two readings, two photos, a named signature, parts, time and a contractor charge, then approve it.
2. Download its PDF as the supervisor and compare every step result, reading, photo digest, signature, review decision and audit entry with the record.
3. Download it as a technician without rate visibility and see no labor rates or costs.
4. A requester and a technician from another site are refused.
5. Bulk-download three work orders as a ZIP and see one PDF per work order.

**Evidence.** `tests/gasket/work-pdf.mjs` — workPdfJourney: open and reviewed work, pinned step results, two unit-bearing readings, issued and returned parts, attributed original minutes, embedded photos and original digests, named signatures with stale and current state, each audit payload, restricted-viewer cost redaction, three PDFs in a ZIP, invalid selection refusal, and work-detail browser downloads at 1440 and 390.
**Gap.** Labor-rate policy, viewer-language text, requester and other-site refusal remain unproved (FIELD-006, ADMIN-003, ADMIN-013, ADMIN-004 and ADMIN-002). WebP and HEIC originals are attached but have no inline preview. Characters outside the bundled font are explicitly refused. Current agent members are denied PDF export pending approval to align with the anyone-with-work-access requirement.

### Connected maintenance operations

#### INT-001 — Documented maintenance REST API

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** A documented versioned REST API covers maintenance records, procedures, assignments, execution and approvals. Pagination, scoped service credentials, idempotent write keys, error contracts, limits and OpenAPI examples let a buyer operate the complete job without browser automation. RL-103 retains the credential policy in RL-2: owner-bound explicit scopes and expiry, no privileged scopes, transactional authority checks and irreversible revocation, one-time secret custody, attributable credential use, reconciliation on rotation and restoration with all credentials inactive. These restrictions on service credentials do not reduce the complete maintenance API target.

**Acceptance.**
1. Use API documentation to create/read/update and page an asset/work/stock estate, retry a timed-out write with the same key and attempt forbidden site and approval operations.
2. Compare API results with UI/history.

**Evidence.** `tests/gasket/api.mjs` apiJourney: documented asset creation, reads, revisioned update, paged asset, work and stock estates, lost-response replay, concurrent claims, mismatched keys, durable stock receipt across Worker restart, forbidden site and review actions, scoped service access, consent, expiry and next-request revocation; browserProof reconciles the asset, work and part pages at 1440 and 390. `tests/gasket/recovery.mjs` recoveryJourney: exported credentials stay inactive after restore. `API.md`; `openapi.json`. apiJourney now also uses the published OpenAPI examples to create and revise a procedure and template, assign its pinned work, record results, issue and return exact stock, submit and independently approve it; each of the nine added keyed actions replays without another audit effect. Forbidden assignee, stale review, incomplete submission, self-review, changed assignment and service-scope operations are refused. The same journey proves all nine credential scopes, no implicit read grant, secret-free service mutation attribution in audit and CSV, permanent bearer revocation after owner demotion or deactivation and reinstatement, deliberate replacement issuance and preserved service use after browser sign-out. The same apiJourney retains documented template requiredFields, refuses submission until its value is recorded, and distinguishes the triggering credential from lead-owned and owner-owned standing-rule execution through audit and source-event links. Browser proof includes the incomplete-work refusal and both direct-service and standing-rule audit pages at 1440 and 390.
**Gap.** The cited API journey shows versioned aliases, paged asset/work/part collections and bounded owner service credentials with durable write retries. Complete target entities and schemas, remaining write keys, rotation and custody, secret redaction, credential-use attribution, authority-loss invalidation without revival and inactive restore/erasure reconciliation remain unproved under RL-2 and RL-103.

#### INT-002 — Signed webhooks and reliable connector jobs

Core · target · **done** · Cites BASE-OPS-003, BASE-OPS-004 · Rules D-3

**Requirement.** Owners subscribe to scoped maintenance events with signed payloads, source IDs, replay protection and bounded retry/dead-letter inspection. Connectors expose cursor, last success, quota and error; reconciliation can resume without duplicating work, stock, bills or notifications.

**Acceptance.**
1. Subscribe to work/receipt events, verify signatures at the receiver edge, return rate limits and timeouts, rotate signing secret and resume from a cursor.
2. Inspect deduplication, expired replay refusal and actionable dead letters.

**Evidence.** `tests/gasket/automation.mjs` — "connectorJourney"
**Gap.** None.

#### INT-003 — QuickBooks Online maintenance spend sync

Core · target · **missing** · Register R-8

**Requirement.** Authorized QuickBooks Online OAuth connects vendors, approved purchase/bill lines, part/contractor costs, US sales/use-tax details and cost-center/class references. The owner previews mappings and chooses the system of record; external IDs, duplicate protection, credits and payment-status reconciliation prevent silent ledger drift. For rebillable work, such as a facilities operator's tenant repair, a lead marks completed work billable to a QuickBooks customer; labor, parts and contractor lines carry the owner's configured rates or markup. A person who approves the billable set does so in the product and binds its exact revision; an agent’s equivalent approval carries money, which the company’s policy decides. Gasket creates one QuickBooks customer invoice per approved set, then shows its invoice and payment status.

**Acceptance.**
1. Connect a QuickBooks sandbox, map an approved partial receipt/bill and cost allocation, sync twice, change a ledger tax/account mapping and return payment/credit status.
2. Inspect one posted document and a visible conflict requiring correction.
3. Mark a completed tenant repair billable to a customer, approve it and see one QuickBooks invoice with its labor and part lines; replay the sync and see no second invoice, and return its paid status.

**Evidence.** None.
**Gap.** No QuickBooks OAuth, financial mappings, bill posting or reconciliation.

#### INT-004 — Email and APNs FCM push delivery

Core · target · **partial** · Cites BASE-MAIL-001 · Register R-9

**Requirement.** The owner connects Amazon SES or SendGrid email and Apple APNs/Google FCM push for PM-005 and requester/purchasing/report events. Messages render in each recipient's display language (ADMIN-013). The owner verifies sender domains, handles expired device credentials, processes bounced mail and complaints, and inspects preferences and delivery history; secrets stay private and delivery does not imply acknowledgment.

**Acceptance.**
1. Send a real provider-edge test and work notice to email/iOS/Android, simulate bounced mail and expired device token, rotate credentials and inspect exact event links, suppression and visible failure state.

**Evidence.** `src/mail.server.mjs`; `src/gasket/purchase-orders.ts`; `src/gasket/vendor-reminders.ts`; `tests/gasket/purchase-orders.mjs`; `tests/gasket/vendor-follow-up.mjs`
**Gap.** Purchasing order/reminder email uses the installation mail provider (including SendGrid), with retained submission outcomes and provider-edge assertions; SES, APNs/FCM, localized maintenance/request/report events, recipient preferences, bounce/complaint and device-token lifecycle remain absent or unproved.

#### INT-005 — Slack maintenance intake and alerts

Core · target · **missing** · Register R-10

**Requirement.** A scoped Slack app maps workspaces/channels to sites, posts assigned/overdue/down/parts-blocked work, and accepts operator requests or authorized acknowledge actions. Slack identity is mapped to current Gasket rights; links retain record scope and revoked access stops interactive actions.

**Acceptance.**
1. Connect Slack at its network edge, create a request from a channel, post overdue work and acknowledge as a mapped technician.
2. Replay an interaction and revoke that member; inspect one request/action and denied stale interaction.

**Evidence.** None.
**Gap.** No Slack connection, intake, delivery or interactive authorization.

#### INT-006 — Microsoft Teams through Zapier

Core · target · **missing** · Register R-11

**Requirement.** A documented Microsoft Teams integration through Zapier routes scoped maintenance events to channels and operator requests back to Gasket with stable source IDs. Setup states the Zapier dependency, required permissions and which acknowledgment/status actions are supported; failures are visible in both job traces.

**Acceptance.**
1. Configure a Teams/Zapier flow, receive a down-asset notice and submit a fault card, replay the response and disconnect the Zap.
2. Inspect one linked request, mapped site and visible paused/failed routing.

**Evidence.** None.
**Gap.** No Teams/Zapier integration or documented operational setup.

#### INT-007 — Zapier triggers and actions

Core · target · **missing** · Register R-11

**Requirement.** The published Zapier connector offers new/updated request, work, outage, low-stock and PO events plus scoped create/update/read actions. Test mode and field mapping show real schemas; event IDs and action keys prevent loops and duplicate work when a Zap retries.

**Acceptance.**
1. Build a Zap from a new fault to a maintenance request and from review completion to another authorized tool, replay both event/action and edit a field mapping.
2. Inspect one source-linked result and actionable schema error.

**Evidence.** None.
**Gap.** No Zapier connector, public triggers/actions or loop prevention.

#### INT-008 — SAP procurement and asset exchange

Core · target · **missing** · Register R-12

**Requirement.** A supported SAP S/4HANA integration maps equipment/functional locations, vendors, material numbers, cost centers, requisitions/POs, receipts and cost postings through authorized APIs or reviewed files. Ownership is explicit per field/entity; reconciliation reports unmatched codes and prevents two systems from purchasing the same requirement.

**Acceptance.**
1. Map a SAP equipment/material/cost-center set, exchange an approved requisition and partial receipt, replay and introduce an unknown material.
2. Inspect linked external IDs, reconciled quantities/costs and a blocked unmapped line.

**Evidence.** None.
**Gap.** No SAP equipment, materials, procurement or cost integration.

#### INT-009 — Oracle procurement and maintenance cost exchange

Core · target · **missing** · Register R-13

**Requirement.** Oracle Fusion Cloud ERP integration exchanges authorized supplier/item/cost-center data, maintenance requisitions/POs, receipts, bills and posted cost statuses through documented APIs/files. The owner reviews mappings and exception queues; disconnect/reconnect resumes from a visible checkpoint.

**Acceptance.**
1. Connect an Oracle sandbox, map a supplier/item, send an approved PO cost allocation, return a partial receipt/bill and interrupt/reconnect.
2. Inspect one financial event per external ID and visible mapping exceptions.

**Evidence.** None.
**Gap.** No Oracle Fusion integration, mappings or reconciliation.

#### INT-010 — OPC UA and PLC SCADA condition ingest

Core · target · **missing** · Register R-14

**Requirement.** An owner-installed read-only OT gateway supports OPC UA plus documented Modbus TCP/EtherNet-IP mappings for PLC/SCADA tags. It maps certificate-trusted source tags, units, equipment, quality and source times to readings; buffered replay is idempotent and stale/disconnected tags show unknown. Gasket never writes control commands.

**Acceptance.**
1. Connect a gateway to a controlled OPC UA server and a mapped PLC feed, cross a temperature threshold, lose/recover the link and replay buffered samples.
2. Inspect fresh/unknown states, one condition job and no control writes.

**Evidence.** None.
**Gap.** No OT gateway, OPC UA/PLC adapters, trust configuration or telemetry ingest.

#### INT-011 — Fluke condition monitoring

Core · target · **missing** · Register R-15

**Requirement.** The Fluke/eMaint condition-monitoring adapter maps supported vibration/temperature sensor channels and alarms to Gasket assets, units and thresholds with raw-source references and freshness. Product-specific setup names the required Fluke service/hardware agreement; calibration results are a separate documented mapping when licensed.

**Acceptance.**
1. Connect a supported Fluke condition-monitoring source at its network edge, ingest vibration/temperature alarm and recovery, replay it and remove source permission.
2. Inspect one fault/work link, original readings and explicit stale/disconnected state.

**Evidence.** None.
**Gap.** No Fluke service adapter, licensed-channel mapping or condition-event ingestion.

#### INT-012 — Tractian sensor alarms and diagnosis context

Core · target · **missing** · Register R-16

**Requirement.** An authorized Tractian API/webhook connection imports asset health, vibration/temperature/hourmeter evidence, fault severity and diagnosis references, preserving source identity and timestamps. Lead-approved mappings turn alarms into deduplicated work; algorithmic confidence and disagreement remain visible.

**Acceptance.**
1. Map a Tractian sensor to a motor, deliver an alarm, repeat it and deliver later recovery plus conflicting manual evidence.
2. Inspect one linked work order, full context and unresolved disagreement until reviewed.

**Evidence.** None.
**Gap.** No Tractian connection, asset-health import or alarm/work routing.

#### INT-013 — Samsara fleet meters and inspection defects

Core · target · **missing** · Register R-17

**Requirement.** Samsara OAuth/API/webhooks map vehicle IDs, odometer/engine hours, DVIR defects and available telemetry to owned fleet assets, PM meters and corrective requests. Freshness, units, deleted vehicles and duplicate inspections are handled explicitly; trip/dispatch management stays in Samsara.

**Acceptance.**
1. Connect a Samsara fleet sandbox, import a vehicle with engine hours and a DVIR defect, replay/update that inspection and revoke the connection.
2. Inspect one source-linked fault, correct PM trigger and disconnected freshness.

**Evidence.** None.
**Gap.** No Samsara vehicle, meter or DVIR integration.

#### INT-014 — MachineMetrics production and machine data

Core · target · **missing** · Register R-18

**Requirement.** MachineMetrics integration maps machine identity, operating state, runtime, cycle counts and available condition events to maintenance meters and production windows. Source mapping/quality is reviewable; maintenance downtime and production stoppage remain distinct until classified.

**Acceptance.**
1. Connect two machine feeds, ingest running/stopped periods and a condition event, remap a tag and interrupt coverage.
2. Inspect meter/production context, one fault work item and explicit classification/coverage gaps.

**Evidence.** None.
**Gap.** No MachineMetrics feed, runtime mapping or production-state reconciliation.

#### INT-015 — Existing CMMS and EAM exchange

Core · target · **missing** · Register R-12

**Requirement.** Buyers retaining SAP maintenance, IBM Maximo or UpKeep for another site can synchronize scoped assets, faults, work IDs/status and completion evidence with explicit ownership, loop suppression and conflicts. The integration remains an exchange with a separate system; Gasket still owns its full CMMS job for the chosen estate.

**Acceptance.**
1. Connect a separate SAP/Maximo/UpKeep test tenant in turn, create a fault, route its work and exchange completion twice.
2. Inspect stable links, no echo loop and visible conflicting status that waits for an authorized decision; an agent’s resolution carries its class under the company’s policy.

**Evidence.** None.
**Gap.** No SAP maintenance, IBM Maximo or UpKeep coexistence adapters.

#### INT-016 — Power BI and analytics export

Core · target · **missing** · Register R-19

**Requirement.** Authorized Power BI connects to documented paginated incremental maintenance datasets with asset/work/cost/downtime relationships, deletion markers, schema versions and metric definitions. Site/rate permissions and refresh lag remain visible; extracts reconcile to the product reports.

**Acceptance.**
1. Refresh Power BI from a multi-site dataset, close/reclassify work and erase an eligible contact, then refresh incrementally.
2. Compare counts/costs to source reports and verify excluded site/rate data does not leak.

**Evidence.** None.
**Gap.** No Power BI connector, incremental dataset contract or permissioned analytical extracts.

#### INT-017 — Production and business calendar integration

Core · target · **missing** · Register R-20

**Requirement.** Leads connect Microsoft 365 Outlook or Google Calendar to bring approved shutdown and access windows into Gasket and publish authorized work appointments with stable IDs, time-zone handling and controlled one-way or two-way ownership. Calendar edits cannot mark work complete or issue spend.

**Acceptance.**
1. Connect each calendar provider, import a shutdown, publish a work slot, move it externally and replay the change across daylight saving.
2. Inspect one updated appointment, planner conflict and unchanged work completion and cost authority.

**Evidence.** None.
**Gap.** No Outlook/Google Calendar connection or production-window synchronization.

### Switching, import and migration

#### MIG-001 — Reviewed, reversible and attributable move-in

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-3

**Requirement.** All importers provide a no-write mapping/validation preview, source IDs and checksums, rejected-row reasons, duplicate matching and field-level attention items. Apply requires the reviewed fingerprint and current rights, checkpoints durably and is idempotent; undo removes only its changes and reports later dependencies. Imported attribution never grants source users active access. Every importer whose source names asset parents (MaintainX Parent) places the imported assets under them in the hierarchy (ASSET-001), refusing levels and cycles the hierarchy refuses, instead of keeping the parent as a note. Every importer whose source carries a part's unit cost moves opening stock in valued at it (PART-007); until then moved-in opening stock is unpriced.

**Acceptance.**
1. Preview an export containing duplicates, malformed units, orphan work and an unknown user, change the source after review and attempt apply.
2. Apply the reviewed data, resume/reapply, then undo before and after dependent work; inspect the exact journal and refusal.
3. Import MaintainX assets with parents and see them placed under those parents (ASSET-001).

**Evidence.** `src/gasket/movein/maintainx.ts`; `src/gasket/movein/maintainx-work.ts`; `src/gasket/movein/target.ts`; `tests/gasket/flows.mjs`
**Gap.** Reviewed, journaled and idempotent MaintainX register/completed-history import, parent placement and dependency-blocked undo exist; complete provider/entity/file mapping, resumable complete-history extraction and full attribution coverage remain missing.

#### MIG-002 — MaintainX complete maintenance migration

Core · target · **partial**

**Requirement.** Move in MaintainX organization CSV exports for assets, locations, parts/transactions, vendors, requests, POs, meters/readings, work and time/cost transactions. Reporting date-range work exports and work-order PDF details supply completed history and procedure authorship where CSV lacks it; authorized API/file retrieval supplies original attachments and PM/procedure/user mappings. Download attachment URLs while authorized; preserve completion, source identities and recurrence without rerunning old work. Users identified only by a mobile phone number become phone-identified invitations (ADMIN-014) that keep their history, and custom asset, part and work field values map onto ASSET-009 and PLAN-001 fields.

**Acceptance.**
1. Upload real-format MaintainX CSVs plus completed-work PDF/detail and attachment inputs through move-in, including multiple date ranges, a phone-only user and custom-field columns.
2. Reconcile open/closed work, results, users (by email or phone number), custom-field values, costs, stock, PM next dates and file digests, then replay.
3. Any unavailable record class is an explicit blocking discrepancy, never silently dropped.

**Evidence.** `src/gasket/movein/maintainx.ts`; `src/gasket/movein/maintainx-work.ts`; `tests/gasket/flows.mjs`
**Gap.** Assets, parts, meter readings and completed work orders (as asset history across date ranges, with MaintainX ID, type, completion, people as text, categories, recurrence and parts/labor/other cost) import through the reviewed move-in; open work, procedure results and PDF details, attachments, PM/procedure/user mappings, phone-only users (ADMIN-014), custom fields (ASSET-009, PLAN-001), vendors, requests, POs, part transactions and time entries are missing.

#### MIG-003 — UpKeep complete maintenance migration

Core · target · **missing**

**Requirement.** Move in UpKeep asset, location, part, PM, meter and work CSV/Excel exports plus work-order PDF/ZIP detail and authorized API/file extraction. Preserve completed history, checklists, time/cost, source user attribution, DVIR/Edge reading context where present and original file binaries; File IDs/PDFs alone are not treated as originals. Map opening stock separately from historical consumption and keep imported PMs paused pending cutover.

**Acceptance.**
1. Import documented-format UpKeep work/history and entity files with PDF/ZIP detail, API/file mapping and meter/Edge history across date ranges.
2. Compare original file digests, work status/dates, users, costs, PM rules and current stock; reject unresolved source/file IDs and reimport without duplication.

**Evidence.** None.
**Gap.** No UpKeep importer, history/file extractor, PM mapping or cutover reconciliation.

#### MIG-004 — Fiix complete maintenance migration

Core · target · **missing**

**Requirement.** Move in Fiix page CSV and report CSV/XLSX for users/sites, businesses, assets, parts, task groups, scheduled maintenance, work, meter readings and asset events. Where available, the Enterprise database/SQL ZIP export with uploaded files supplies complete relational history and binaries; authorized API/supported extraction fills permitted source gaps. Map source v5/v6 schemas, codes and custom fields explicitly and keep migrated schedules inactive until approved.

**Acceptance.**
1. Import a Fiix CSV/report set and an available database/file ZIP through reviewed move-in, including failures, completed tasks and meter timestamps.
2. Reconcile identities, work steps, PM recurrence, hours, costs and attachment digests; list missing source entitlements and prevent incomplete cutover.

**Evidence.** None.
**Gap.** No Fiix report/database/file importer, schema mapping or historical reconciliation.

#### MIG-005 — Limble complete maintenance migration

Core · target · **missing**

**Requirement.** Move in Limble Excel/CSV exports for assets, PM templates, parts, open/in-progress/completed tasks, vendors and users, plus XLSX audit and authorized file/meter extraction. Keep multiple labor entries, downtime, invoices, instructions and completer attribution. Source completed-task bulk-import limits do not justify losing attachments: retrieve originals separately and reconcile reading coverage. Historic part use never changes the imported opening balance.

**Acceptance.**
1. Import Limble export samples containing multiple labor entries, downtime, historical parts and task files, and obtain originals via supported authorized extraction.
2. Compare PM next dates, stock, users, costs, audit and file/reading totals; show unresolved coverage as a blocking exception.

**Evidence.** None.
**Gap.** No Limble entity/task importer, original-file/meter extraction or audit mapping.

#### MIG-006 — Tractian complete maintenance migration

Core · target · **missing** · Register R-16

**Requirement.** Move in Tractian tenant exports as supplied Excel/CSV/Sheets-derived files and authorized documented REST API/webhook or tenant-supported SQL extraction, with a reviewed schema manifest. Preserve assets, teams, PM plans, work/history, parts/movements, purchasing, timers/costs, original attachments, health/alarms and raw sensor context. No universal Tractian full-export format is assumed; the delivered adapter must resolve source coverage before cutover.

**Acceptance.**
1. Use an authorized tenant export/API schema to import an asset with PM, historical repair, purchase, timer, alarm and attachment.
2. Reconcile each source class and explicitly resolve missing raw timer/file/meter data; replay without duplicate work, balances or alarms.

**Evidence.** None.
**Gap.** No Tractian export/API migration adapter, source manifest or full-history reconciliation.

#### MIG-007 — Open-work CSV and Excel migration

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-3

**Requirement.** Leads import generic CSV/XLS/XLSX open work, assets, locations, parts, PMs and historical work using published templates and source-ID mapping. Dates, US/SI units, leading-zero codes, custom fields, team assignments and unknown users are previewed; imported historic consumption does not issue stock or notify people.

**Acceptance.**
1. Upload a 2,000-row open/history spreadsheet with leading-zero assets, mixed dates, custom fields and orphan assignees.
2. Fix preview errors, apply and compare every accepted row, no stock side effects and no historical notices.

**Evidence.** `tests/gasket/generic-migration.mjs` — "genericMigrationJourney": 2,000 open and historical rows through CSV, XLS and XLSX preview; leading-zero identifiers, mixed dates, custom values, explicit asset, user and team mappings, corrected preview errors, bounded apply and durable resume, every accepted native row, replay, unchanged stock and no historical notices; template and import authority refusals; migration screens at 1440 and 390. `tests/gasket/flows.mjs` — "2,000-row spreadsheet migration and source reconciliation", required in the inventory shard with small-fixture refusal.
**Gap.** None.

#### MIG-008 — Reconciled cutover and a complete exit

Core · target · **partial** · Cites BASE-DATA-001

**Requirement.** Before replacing any named incumbent, owners reconcile counts, critical field totals, custom-field values, people by email or phone number, open obligations, PM due dates, inventory quantities/value, cost/downtime totals and original file digests in a parallel comparison. An approved cutover pauses old automation before enabling Gasket; delta import handles freeze-window changes. Unresolved omissions require repair, not scope reduction. Buyers can later export documented CSV/JSON plus original files for the whole estate.

**Acceptance.**
1. Run the old and imported estate side by side, change work during the freeze, apply a reviewed delta and resolve discrepancies.
2. Approve cutover and observe exactly one future PM/notice, then export all records/files for another tool.

**Evidence.** `src/gasket/movein/maintainx.ts`; `src/gasket/history.ts`
**Gap.** Register preview and history CSV exist; no all-entity reconciliation, shadow/delta cutover, activation controls or complete neutral exit pack.

### Safe maintenance records and operational limits

#### SAFE-001 — Hazard, isolation and permit evidence

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** Leads attach site-approved hazard, isolation and lockout and permit procedures to work with named qualified sign-offs, prerequisites, expiry and attachments. Gasket records these human attestations and blocks administrative completion when required evidence is absent; it never determines that equipment is physically safe or energizes it. The maintenance door uses lead-published site-approved prerequisites and the assigned human's own dated qualification reference, isolation attestation and permit original. Sign-offs bind the work version, latest procedure revision and prerequisite revision; changed evidence requires reapproval, and submission and independent approval recheck expiry and qualification facts.

**Acceptance.**
1. Configure an isolation prerequisite, attempt work submission without the required qualified sign-off, record the permit and its expiry, and change the procedure.
2. Inspect refusal, human attribution and required reapproval of the changed evidence.

**Evidence.** `tests/gasket/safety.mjs` — "safetyJourney"
**Gap.** None.

#### SAFE-002 — Compliance templates and calibration evidence

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** Organizations version maintenance and compliance templates, required inspection and calibration intervals and electronic audit packs with procedure versions, signatures, training and qualification references and retained certificates. The buyer's qualified people choose applicable standards and decide compliance; the software supplies traceable evidence without issuing certification. CSV and JSON audit manifests and original files support handoff to the buyer's separate QMS and EHS system. The library links versioned checklists, required inspection or calibration intervals and named qualification or training references. Audit packs use existing owner custody for qualification evidence; planning grants no certificate-original access. Packs preserve pinned instructions, results, signatures, qualification snapshots, certificate and permit originals, linked documents and independent reviews with per-file digests and explicit missing or expired evidence.

**Acceptance.**
1. Publish a required inspection template, issue work, change the template and export an audit pack containing original instructions, results, qualifications, certificates and independent review.
2. Verify missing/expired evidence remains explicit.

**Evidence.** `tests/gasket/safety.mjs` — "safetyJourney"
**Gap.** None.

#### SAFE-003 — Capacity, ownership and honest service state

Core · target · **partial**

**Requirement.** The target supports a US organization with multiple sites, at least 10,000 assets, 100,000 parts and one million historical work orders, with paginated search/export. The supported offline pack holds at least one technician's assigned and team work for the next 7 days (no fewer than 200 work orders) with their procedures, asset histories and linked manuals, and up to 2 GB of attachments. Storage, connector and notification limits are visible before use; reaching a limit preserves accepted evidence and shows actionable failure instead of silent truncation.

**Acceptance.**
1. Load a representative estate at the declared capacity through import/public API, page/search/export all records, download an offline pack at that 7-day, 200-work-order, 2 GB floor on a phone and work it in airplane mode, and exceed a configured limit.
2. Inspect exact counts, usable core workflows and explicit refusal without lost accepted data.

**Evidence.** `tests/gasket/work-pagination.mjs` — workPaginationJourney, registered in `tests/gasket/flows.mjs`: imports 1,205 same-day open work orders through public preview and resumable apply, closes a separate cohort through independent review, traverses authorized web and JSON pages exactly once, reconciles legacy arrays, versioned API fields and complete bounded CSV, tests tied sort keys, altered and foreign cursors, changed snapshots, configured export-limit refusal, signed-out and revoked access, forbidden records and planned-site refusal, and preserves accepted records and original attachment digests. Browser navigation assertions run at 1440; proof captures Today, All open, Closed and Done today at 1440 and 390. `API.md` documents current paging, snapshot and CSV limits.
**Gap.** This proves only operational primary-site work-list completeness at the demonstrated fixture size, not declared or qualified target capacity. Gap: ADMIN-002 operational multi-site authorization; qualification at 10,000 assets, 100,000 parts and one million historical work orders with complete estate-wide search and export performance; the seven-day offline pack containing at least 200 work orders with procedures, asset histories, linked manuals and up to 2 GB of attachments; real-phone airplane-mode proof and the held SMS sender and APNs and FCM delivery dependencies; comprehensive visible storage, connector and notification limits before use and failure handling that preserves all accepted evidence. ADMIN-009 retains its resumable rer-export dependency, and br retains Work-table bulk-selection custody.

### Push further

#### AGENT-001 — Detect developing failures from live evidence

Core · push-further · **missing** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-012 · Rules D-1

**Requirement.** A reliability agent combines fresh sensor trends, meter quality, OEM references and repeated failure/work history to surface developing faults before breakdown. It cites exact observations, coverage, confidence and competing explanations, prepares a deduplicated corrective proposal and names an accountable lead. Work creation carries standard, and relied-on maintenance sign-off carries commitment; the company policy decides their execution. Physical equipment safety remains with qualified people under SAFE-001.

**Acceptance.**
1. Feed authorized rising vibration, missing samples and two comparable historical failures through ingest.
2. Inspect a source-cited proposal before the failure threshold, explicit insufficient-coverage state for gaps and no live work beyond the lead's grant.

**Evidence.** None.
**Gap.** No live reliability analysis, predictive fault proposal, confidence or evidence-coverage engine.

#### AGENT-002 — Stage an executable repair around production

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-012 · Rules D-2

**Requirement.** The agent reads manuals, failure context, BOMs, stock, supplier lead times, technician qualifications and production windows to propose repair steps, reserve eligible parts/people/slot and chase prerequisites. Plan changes carry standard, maintenance sign-off commitment and purchasing money; the company policy decides agent execution. The qualified technician owns isolation and physical repair. Changed resources make the proposal stale.

**Acceptance.**
1. Provide an impending motor fault with a missing bearing and a two-hour production window.
2. Inspect a cited plan, compatible part/skill/slot choices and a purchasing draft; under the held company policy approve the plan, then change availability before execution and require replanning rather than silent substitution.

**Evidence.** `src/gasket/proposals.ts`; `tests/gasket/flows.mjs`
**Gap.** Human-approved corrective proposals exist; fault-to-plan reasoning, resource/parts/production staging and prerequisite chasing do not.

#### AGENT-003 — Propose evidence-backed PM interval changes

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-012 · Rules D-2

**Requirement.** The agent compares failures, readings, completed/late PMs, actual costs, downtime and operating exposure to propose interval changes with a cohort comparison, uncertainty and expected effect. It preserves OEM/legal/site minima as hard constraints and binds each proposed maintenance-standard change to its exact version and rollback plan. The change carries commitment; the company policy decides execution, including a reliability lead’s approval under the held policy. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#agent-003).

**Acceptance.**
1. Give comparable assets different failure histories and OEM minimum intervals, inspect a cited proposed change and expected trade-off, reject an unsupported extension and under the held company policy approve a constrained revision.
2. Change the source history and verify stale approval is refused.

**Evidence.** `tests/gasket/intervals.mjs` — "intervalJourney"
**Gap.** A public-door journey computing commitment and executing a standard change under company policy is missing. The cited journeys show fixed independent proposal gate, cohorts, constraints, stale-source refusal and rollback.

#### AGENT-004 — Measure whether reliability actually improves

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-012 · Rules D-2

**Requirement.** After an approved intervention or PM change, the agent follows the affected assets across the agreed exposure window, compares downtime/failure/cost with baseline and matched peers, and reports confounders and missing coverage. It alerts the lead to worsening or unproven outcomes and proposes a reversal/new investigation; it cannot declare success from fewer logged events alone. The maintenance rules and calculations are specified in [Maintenance semantics](docs/maintenance-semantics.md#agent-004).

**Acceptance.**
1. Approve a PM change, provide post-change operation with lower downtime and then a telemetry gap/production reduction.
2. Inspect exposure-normalized results, stated uncertainty and a reversal proposal approved under the held company policy when failures worsen.

**Evidence.** `tests/gasket/outcomes.mjs` — "outcomeJourney"
**Gap.** A public-door journey executing authorized restoration/investigation under company policy is missing. The cited journeys show measured windows, matched peers, unknowns, warnings and fixed-gate follow-up.

#### AGENT-005 — Follow overdue work through verified closure

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-012 · Rules D-2

**Requirement.** The agent watches work due dates, acknowledgments, findings, parts/access blockers and review evidence, asks the responsible person for the next action and follows promised dates. It proposes reassignment/escalation under the lead's policy and verifies linked corrective outcomes before recommending closure. Agent reassignment carries standard and a maintenance sign-off carries commitment; the company policy decides execution. Physical completion still needs the technician’s evidence. A promised date is a site-local calendar day and is missed only after that day ends; an unanswered agent question reaches the lead-approved chase rule's response interval after that many elapsed 24-hour days. Escalation and reassignment proposals retain the work version, rule and cited questions/blockers; changed evidence refuses approval.

**Acceptance.**
1. Leave a PM blocked on parts and a repair awaiting review, answer one agent query with a promised date and miss it.
2. Inspect contextual escalation, proposed reassignment and refusal to mark either work or finding closed without the technician’s evidence; under the held company policy, closure waits for the supervisor’s decision.

**Evidence.** `tests/gasket/agent-follow-up.mjs` — "agentFollowUpJourney"
**Gap.** A public-door journey computing standard/commitment and executing reassignment/sign-off under company policy is missing. The cited journeys show questions, blockers/promises, fixed-gate reassignment and unsupported-closure refusal.

#### AGENT-006 — Reconcile spare-parts reality

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-012 · Rules D-1

**Requirement.** The agent compares POs, receipts, bills, work consumption, reservations and count variances to find duplicate items, missing movements, unusual demand and replenishment risk. It prepares merge/count/bin/reorder proposals with source citations and quantity/value impact. Staff physically count and receive. Agent adjustments and spend carry money, reversible catalog merges standard and irreversible merges destructive; the company policy decides execution. No model inference is a physical receipt. Current deterministic stock insights treat matching manufacturer and manufacturer number as review candidates, retaining incompatible stocking-unit warnings. Demand compares gross issues (returns remain separate) in adjacent 30-site-day windows inclusive of their end dates; a rise requires more than twice nonzero prior issues, and no prior issues means an unknown trend. Replenishment risk uses the current policy, counts unchanged outstanding orders even when late, and estimates material USD cents at the policy unit price rounded half up excluding freight and tax; it authorizes no spend or delivery. A physical count proposal retains the recorded stock, count variance and its moving-average value under PART-007.

**Acceptance.**
1. Provide a duplicate bearing, late PO and inconsistent count/issue history.
2. Inspect cited correction/replenishment proposals and value impacts, under the held company policy approve one after a physical count, and reject an unsupported receipt.
3. Changed stock invalidates the prepared adjustment.

**Evidence.** `src/gasket/stock-insights.ts`; `src/gasket/proposals.ts`; `src/gasket/parts.ts`; `src/gasket/part-merge.ts`; `src/gasket/ui/proposals.ts`; `src/gasket/today.ts`; `src/gasket/ui/settings.ts`; `src/gasket/catalog-snapshot.ts`; `migrations/core/0070_merge_proposals.sql`; `tests/gasket/agent-stock.mjs`; `tests/gasket/agent-stock-browser.mjs`; `tests/gasket/flows.mjs`; `.github/workflows/verify.yml`
**Gap.** Source-bound count and duplicate-merge proposals, stale-stock/dependency guards, retained count/merge quantity and USD impacts, and independent human approval exist. Read-only stock insights discover manufacturer-number duplicate candidates, cite work consumption and count variances, compare adjacent 30-site-day gross-issue windows, and show policy replenishment quantities, estimated material value and late outstanding purchase revisions. Full PO/receipt/bill reconciliation, executable bin/reorder proposals and evidence establishing a missing movement remain absent; deterministic risk evidence is not an autonomous purchasing decision.

#### AGENT-007 — Draft grounded procedures and technician assistance

Core · push-further · **missing** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-012

**Requirement.** The maintenance assistant retrieves approved manuals, revisioned procedures, prior repairs and authorized asset history to draft checklists or answers with page and record citations, uncertainty and unresolved conflicting instructions. It drafts translations linked to the exact source revision; a changed source makes a translation stale and technicians can open the original beside it. Publishing a relied-on procedure or translation carries commitment, with company policy deciding execution; the held policy names the qualified lead and bilingual reviewer. Retrieved text cannot widen authority or operate equipment.

**Acceptance.**
1. Ask for a repair checklist using an OEM manual and past work, inspect citations and conflicting instructions, then include malicious instructions in a manual; authority remains unchanged.
2. Under the held company policy, publish after the qualified lead’s decision; inspect the bound procedure revision.
3. Under that policy draft a Spanish lockout translation, reject a mistranslation, approve its correction and inspect the source link; change the source and inspect the stale translation.

**Evidence.** None.
**Gap.** No model-backed maintenance assistant, retrieval, grounded procedure drafting, reviewed translation or qualified review workflow.

#### AGENT-008 — Extract source-linked purchasing documents

Core · push-further · **missing** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-012 · Rules D-1

**Requirement.** The agent reads supplier quotes, invoices, POs and packing-slip photos or PDFs to prepare part/vendor matches, pack conversions, prices, taxes and receipt/bill lines with highlighted source regions and confidence. Ambiguous matches remain visible. Creating a draft carries standard; binding a purchase or bill carries money and commitment, decided by company policy. Physical delivery is evidenced by stores rather than inferred from a document.

**Acceptance.**
1. Upload a skewed packing slip and invoice with a new vendor part, mismatched unit pack and tax.
2. Inspect highlighted source matches and exceptions; under the held company policy correct and approve bill creation, and inspect unchanged inventory until stores records physical receipt.

**Evidence.** None.
**Gap.** No document extraction, confidence/source-region matching or reviewed purchasing-document creation.

#### AGENT-009 — Accountable agent execution and measurable value

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-012 · Register R-7

**Requirement.** Owners declare authorized model providers and data scope, keep each provider key installation-private, minimize authorized maintenance data and retain immutable input and estimated-cost lineage under RL-101. Revocation fences pending proposals and late results, while unknown provider charges remain honest reservations. The bounded preparation capability’s data exclusions and single-call limits are documented in [Maintenance semantics](docs/maintenance-semantics.md#agent-009); grounded manual retrieval remains AGENT-007’s obligation. The company policy decides execution of every authorized agent action by its class; usage-priced cost remains an estimate, never provider invoice reconciliation.

**Acceptance.**
1. Grant a bounded reliability run with a company-set dollar budget, inspect its data/action preview, approve one proposal under the held company policy and revoke during another run.
2. Export decisions/cost/outcome history; verify no post-revocation writes, secret leakage or invented success after provider failure.

**Evidence.** `src/gasket/agent-grants.ts`; `src/gasket/agent-runs.ts`; `src/gasket/agent-run-input.ts`; `src/gasket/agent-provider.ts`; `src/gasket/agent-run-views.ts`; `src/gasket/ui/agent-runs.ts`; `src/gasket/proposals.ts`; `src/gasket/outcomes.ts`; `migrations/core/0090_agent_runs.sql`; `tests/gasket/agent-runs.mjs`; `tests/gasket/agent-runs-browser.mjs`; `tests/gasket/agent-run-live.mjs`; `tests/gasket/receipts/agent-009-live.json`; `tests/gasket/outcomes.mjs`
**Gap.** The cited run journeys show bounded corrective preparation, minimized input, immutable usage-priced estimates and revocation fencing. Grounded manuals, scheduled and event-started runs, multiple providers, managed-hosting secret declarations and actual provider custody qualification remain unproved under RL-101. Company-policy execution of the authorized actions remains unbuilt.

## Agent surface

### Agent surface

#### SURFACE-001 — Maintenance registry and Core jobs

Agent surface · target · **partial** · From new · Cites BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-013

**Requirement.** The maintenance registry describes exactly the tool and non-tool inventory above and routes embedded maintenance agents through these same jobs.

**Acceptance.**
1. Discover the registry and reconcile its Core clause coverage, job names and declared classes with this table.
2. Create the same corrective work through its UI action, API and MCP job; inspect equal maintenance state and source history.
3. Run a bounded embedded maintenance proposal and find its corresponding registry job in the run lineage.

**Evidence.** `agent-surface.json`; `src/gasket/agent-door`; `tests/gasket/agent-native-journey.mjs`; 30 October 2026 normal GASKET_VERIFY_SHARD=foundation pnpm exec rer verify --non-interactive on rer 0.2.91 with Base 2135c394939f4a737adabdc8003b0e667b31ac5a: 1,376/1,376 BASE-AGENT points and native specialist journey, exit 0; native product probe at 1440 and 390
**Gap.** Only the documented granular Core slice is registered. The aggregate jobs, remaining native verbs and embedded model-run invocation are incomplete.

#### SURFACE-002 — Internal changes and outside maintenance exposure

Agent surface · target · **partial** · From new · Cites BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007

**Requirement.** Maintenance record audience and actual recipient determine internal versus outside exposure, including writes into already externally visible work.

**Acceptance.**
1. Read and update an internal work record and inspect standard with the server-counted items.
2. Send a maintenance report to a known vendor, a new outside recipient and a public target; inspect external, recipient counts and each counterparty kind.
3. Move an original into a vendor-visible record and inspect external even when no separate send occurs.
4. Put a claimed internal recipient in imported text; the actual record audience and recipient still decide the class.

**Evidence.** `agent-surface.json`; `src/gasket/agent-door`; `tests/gasket/agent-native-journey.mjs`; 30 October 2026 normal GASKET_VERIFY_SHARD=foundation pnpm exec rer verify --non-interactive on rer 0.2.91 with Base 2135c394939f4a737adabdc8003b0e667b31ac5a: 1,376/1,376 BASE-AGENT points and native specialist journey, exit 0; native product probe at 1440 and 390
**Gap.** Declared internal changes retain native visibility. Outside-send tools and audience-derived external journeys remain unimplemented; public resources are an UNDECLARED family.

#### SURFACE-003 — Maintenance money and relied-on decisions

Agent surface · target · **partial** · From new · Cites BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008

**Requirement.** Maintenance stock value, purchasing and cost changes carry source-bound monetary facts; relied-on work and maintenance-standard decisions carry their exact revision.

**Acceptance.**
1. Prepare a PO, valued stock adjustment and cost-policy change; inspect money with exact USD amount, supplier and source revision.
2. Sign a maintenance record, publish an interval standard or approve a scoped qualification/tool planning exception and inspect commitment with its exact revision and affected business scope.
3. Run a purchase offer carrying both money and commitment under two company policies; the result follows the policy in force.
4. Inspect usage-priced model cost separately from provider invoices, and an unknown charge as a reservation.

**Evidence.** `agent-surface.json`; `src/gasket/agent-door`; `tests/gasket/agent-native-journey.mjs`; 30 October 2026 normal GASKET_VERIFY_SHARD=foundation pnpm exec rer verify --non-interactive on rer 0.2.91 with Base 2135c394939f4a737adabdc8003b0e667b31ac5a: 1,376/1,376 BASE-AGENT points and native specialist journey, exit 0; native product probe at 1440 and 390
**Gap.** First immutable procedure publication is commitment; purchasing/money and the complete bound-revision/value decision journeys remain unimplemented.

#### SURFACE-004 — Authority, custody and operating-service classes

Agent surface · target · **partial** · From new · Cites BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-011

**Requirement.** Maintenance membership, original evidence, provider custody and running services determine the additional classes from their stored facts.

**Acceptance.**
1. Create an outside connector resource and inspect accounts with its provider; a provider-retained consent or identity step adds gated with provider and step.
2. Change a membership, delegation or staff/site/device/resource right, including automatic-order authority, and inspect access with affected people, scope and widening or narrowing direction; a site name, time-zone or lead-time edit alone adds no access while retaining other applicable classes.
3. Rotate a provider credential; change an independent-count threshold, automatic-order safeguard, purchasing approval limit, named approver or budget ceiling; or authorize a qualification/tool planning exception. Inspect security from the stored setting and changed safeguards; an ordinary purchasing call adds it only when its facts meet this test.
4. Erase eligible maintenance originals, irreversibly retire an asset, resource or field identity, or irreversibly revoke a service credential; inspect destructive with item counts and readable retained history. Credential issuance alone adds no destructive, and a reversible draft change remains standard.
5. Read a regulated qualification, identity, bank or pay record and inspect sensitive with count and kind.
6. Change running PM, connector, gateway or reminder behavior, including site lead time and delivery preferences, and inspect live with service and scope.
7. Try self-escalation through maintenance memberships, grants or policy; inspect unchanged authority under both policies.

**Evidence.** `agent-surface.json`; `src/gasket/agent-door`; `tests/gasket/agent-native-journey.mjs`; 30 October 2026 normal GASKET_VERIFY_SHARD=foundation pnpm exec rer verify --non-interactive on rer 0.2.91 with Base 2135c394939f4a737adabdc8003b0e667b31ac5a: 1,376/1,376 BASE-AGENT points and native specialist journey, exit 0; native product probe at 1440 and 390
**Gap.** Detailed work reads compute sensitive personnel/pay facts. Access, security, destructive, live, accounts and gated adapters and their authority journeys remain unimplemented; spend and owner-native administration are unproved.

#### SURFACE-005 — Maintenance resources and change handoffs

Agent surface · target · **partial** · From new · Cites BASE-AGENT-003, BASE-AGENT-010, BASE-AGENT-013

**Requirement.** The resource and event inventory exposes the maintenance record families above with stable source links for follow-up work and reconciliation.

**Acceptance.**
1. Read each declared maintenance resource family on populated fixtures and follow a changed work record back from its result link.
2. Subscribe to work review, stock receipt and supplier delivery changes and reconcile their event identities across the feed and webhook.
3. Revoke access to a work record, change it and inspect all subscribed channels for absence of its later evidence.
4. Discover each specialist prompt and follow its referenced maintenance clauses.

**Evidence.** `agent-surface.json`; `src/gasket/agent-door`; `tests/gasket/agent-native-journey.mjs`; 30 October 2026 normal GASKET_VERIFY_SHARD=foundation pnpm exec rer verify --non-interactive on rer 0.2.91 with Base 2135c394939f4a737adabdc8003b0e667b31ac5a: 1,376/1,376 BASE-AGENT points and native specialist journey, exit 0; native product probe at 1440 and 390
**Gap.** UNDECLARED families: resources, events, prompts and subscriptions. Their typed refusals do not prove native maintenance event delivery, resource refresh, webhook handoffs or the other target resource families.

#### SURFACE-006 — Grounded maintenance actions and physical evidence

Agent surface · target · **partial** · From new · Cites BASE-AGENT-005, BASE-AGENT-008, BASE-AGENT-012

**Requirement.** The specialist distinguishes observations, source-backed estimates and actions from physical maintenance attestations; cited source revisions fence stale plans.

**Acceptance.**
1. Prepare repair, interval and replenishment actions from a seeded maintenance week and inspect the source record and version behind each.
2. Change a plan’s stock, qualification or production-window source; inspect the stale action’s refusal and unchanged maintenance state.
3. Read a malicious manual and a document claiming physical delivery; inspect unchanged authority and no invented isolation, receipt or safety certification.
4. Under the held policy, approve an agent-prepared work action and inspect the person’s decision separately from the agent’s preparation.

**Evidence.** `agent-surface.json`; `src/gasket/agent-door`; `tests/gasket/agent-native-journey.mjs`; 30 October 2026 normal GASKET_VERIFY_SHARD=foundation pnpm exec rer verify --non-interactive on rer 0.2.91 with Base 2135c394939f4a737adabdc8003b0e667b31ac5a: 1,376/1,376 BASE-AGENT points and native specialist journey, exit 0; native product probe at 1440 and 390
**Gap.** Declared writes retain native versions, source-bound proposals and physical-evidence limits. Complete qualified repair/window staging, proposal application, native Undo and queued continuation remain unproved.

#### SURFACE-007 — A stranger specialist completes a maintenance week

Agent surface · target · **partial** · From new · Cites BASE-AGENT-001, BASE-AGENT-004, BASE-AGENT-007, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-013 · Register R-21

**Requirement.** A stranger maintenance coordinator receives only the seed URL and completes a seeded maintenance week through MCP, starting with existing physical observations and qualifications.

**Acceptance.**
1. Discover the jobs, resources and prompts; triage a fault, plan a compatible repair, reserve parts and a qualified slot, follow work evidence and reconcile purchasing and reliability outcomes.
2. Under the company’s all-autonomous policy, complete every authorized software action without waiting for a person or a policy refusal.
3. Repeat the week under the held company policy: standard enters review and every other declared class waits for its named approver; inspect each decision against that policy.
4. Before policy setup, inspect no effect; complete the company’s answers and resume the same maintenance week.
5. Pause the specialist mid-week, try its next call and inspect refusal without affecting the technician’s browser work.

**Evidence.** `agent-surface.json`; `src/gasket/agent-door`; `tests/gasket/agent-native-journey.mjs`; 30 October 2026 normal GASKET_VERIFY_SHARD=foundation pnpm exec rer verify --non-interactive on rer 0.2.91 with Base 2135c394939f4a737adabdc8003b0e667b31ac5a: 1,376/1,376 BASE-AGENT points and native specialist journey, exit 0; native product probe at 1440 and 390
**Gap.** The declared maintenance slice has a native owner/scoped-credential journey. Full stranger-specialist fault-to-repair/purchasing/reliability work, multi-sponsor completion, outside mail and timed/dual-host journeys remain unproved.

## Later

None.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Human screen-reader pass for maintenance and public journeys | ADMIN-011 | not run | | |
| R-2 | VPAT for the maintenance workspace | ADMIN-011 | not run | | |
| R-3 | iOS App Store approval and distribution | FIELD-001 | not run | | |
| R-4 | Android store approval and distribution | FIELD-001 | not run | | |
| R-5 | Microsoft Entra ID tenant qualification | ADMIN-005 | not run | | |
| R-6 | Okta tenant qualification | ADMIN-005 | not run | | |
| R-7 | Actual model-provider custody and terms qualification | AGENT-009 | not run | | |
| R-8 | QuickBooks Online field receipt | INT-003 | not run | | |
| R-9 | SES, SendGrid, APNs and FCM field receipt | INT-004 | not run | | |
| R-10 | Slack field receipt | INT-005 | not run | | |
| R-11 | Microsoft Teams and Zapier field receipt | INT-006, INT-007 | not run | | |
| R-12 | SAP S/4HANA field receipt | INT-008, INT-015 | not run | | |
| R-13 | Oracle Fusion field receipt | INT-009 | not run | | |
| R-14 | Physical OPC UA and PLC gateway field receipt | INT-010 | not run | | |
| R-15 | Licensed Fluke/eMaint channels field receipt | INT-011 | not run | | |
| R-16 | Tractian tenant and hardware field receipt | INT-012, MIG-006 | not run | | |
| R-17 | Samsara tenant and vehicle hardware field receipt | INT-013 | not run | | |
| R-18 | MachineMetrics tenant and machine coverage field receipt | INT-014 | not run | | |
| R-19 | Power BI tenant field receipt | INT-016 | not run | | |
| R-20 | Microsoft 365 and Google Calendar tenants field receipt | INT-017 | not run | | |
| R-21 | Claude, ChatGPT, Codex and Copilot client compatibility field receipt | SURFACE-007 | not run | | |
