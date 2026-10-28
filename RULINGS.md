# Gasket contract rulings

### RL-1 — Delivery and assigned preparation

Date: 2026-10-26 · Ruled by: ct · Governs: REPORT-006

REPORT-006 delivery and assigned preparation were approved with riders on 26 October 2026 at reviewed SHA `0e133c7e91080ac0f943360a8d73b1d0afc623fe`.

CT approved the report-delivery default with riders: an active human owner explicitly authorizes a saved schedule revision and its named active recipients. Current owner authority, recipient report and export permissions, and the authorized revision are rechecked immediately before each separate recipient submission. Scheduled packs retain authorized aggregate USD measures but exclude original evidence files and individual labor rates. Durable occurrence claims prevent automatic duplicate or uncertain-send retries. Provider acceptance is not inbox delivery. Excluded, failed, rejected, uncertain and interrupted attempts remain visible with an actionable explanation. Any later repair must reconcile the original attempt before explicit authorization of another submission. This policy approval establishes neither provider qualification nor completion.

CT approved assigned schedule preparation with riders: an owner may assign one named active human report reader to prepare a particular schedule. Assignment grants no additional report or export access. Every delegated edit is attributable, saves a new revision and pauses delivery until an active owner reviews and explicitly authorizes that saved revision. Delegates cannot create independent schedules, assign or grant authority, or resume delivery. Current assignment, reader permissions and owning-principal authority govern every draft, preview and download door.

The ruling retains multi-site authorization in ADMIN-002, broader delegated scheduling authority in ADMIN-003 and localized packs in ADMIN-013. These receiving clauses explicitly name those duties. All other original obligations and gaps remain in CONTRACT.md. Policy approval does not supply implementation or provider proof.


### RL-2 — Maintenance service credentials

Date: 2026-10-26 · Ruled by: ct · Governs: INT-001, ADMIN-003, ADMIN-006, ADMIN-007, ADMIN-008, ADMIN-009, ADMIN-016, GAS-11

CT policy ruling, 26 October 2026, reviewed pin 17cecc3ff09c32082143087c894b67313f7da7c9: APPROVE WITH RIDERS for INT-001's conservative service-credential default. This resolves the pending policy decision only. INT-001 remains partial; no clause status or original acceptance point changes.

An active owner issues a credential only through that owner's ordinary authenticated member session with explicit issuance consent, a named client, an explicit nonempty scope selection and a fixed expiry at least one minute and at most 90 days after issuance. The service client acts on behalf of that issuing owner, identified separately by its credential; another member cannot be nominated. It is bearer authority entrusted to the owner's chosen client, not an independent human identity or a provider authorization.

The complete current allowlist is assets:read, work:read, parts:read, asset.create, asset.update, part.create, part.receive, part.count and workorder.create. Read scopes cover their documented collections and detail doors, including asset history. Each request must satisfy both its explicit credential scope and the issuing owner's current membership, ownership, site and record rights, together with the normal operation's server rules. A write scope does not imply a read scope. Today's installation has one site; these scopes are not a promise of per-asset or multi-site credential restrictions. There are no approval, administration, destructive or outbound scopes, no workspace access and no credential issuance or revocation through a service credential. Stock writes do not authorize spend, independent review or a provider send. Agent proposal and grant boundaries remain unchanged.

Reads and retries recheck live authority on every request; mutations also recheck it inside their database batch. Revocation and expiry refuse further use, including cached-result replay, and revocation never resurrects. Loss of required owner authority must refuse use; an ownership transfer must not rebind a credential to the successor. The conservative lifecycle requires replacement issuance after that loss rather than revival when ownership is later restored. Automatic invalidation across removal and reinstatement remains a named lifecycle Gap under INT-001 and ADMIN-003. Ending a browser session alone is not service revocation. Ownership changes, rotation and restoration must preserve existing records, audit and write-retry reconciliation.

The owner controls issuance, private one-time delivery and client storage. The application retains a nonrecoverable verifier, not a retrievable bearer value; metadata reads omit both token and verifier. Installation-controlled encryption remains required for recoverable provider secrets under ADMIN-008. Tokens must not enter URLs, logs, audit, exports or AI context. Rotation means ordinary owner issuance of a replacement and revocation of the predecessor; no automatic renewal, scope expansion or expiry extension is authorized. Unproved rotation, client custody and redaction coverage remain Gaps under ADMIN-008 and INT-001.

ADMIN-006 continues to own atomic, append-only attribution: service changes must identify the issuing owner and credential authority together with action, record, site and time, without bearer values. Issuance, revocation and ownership effects must remain attributable; secret-free credential metadata must distinguish service use from that owner's interactive work. Credential-specific use attribution and lifecycle-event coverage remain unproved Gaps under ADMIN-006 as inherited by INT-001; this policy ruling does not rejudge ADMIN-006's existing status.

ADMIN-007 and ADMIN-016 continue to own retention, holds, dependency-aware eligible erasure, per-type results, anonymized retained audit and prevention of resurrection. Existing indefinite retention and no automatic erasure remain; expiry or revocation is not data erasure. Write-retry receipts retain their existing reconciliation purpose and retention obligations. ADMIN-009 and GAS-11 continue to require a complete portable archive: retain permitted metadata and history, exclude usable authentication material including bearer verifiers, validate an empty restore before publication, and restore every credential inactive. The source is not revoked merely by export. The restored owner reconnects deliberately with newly issued credentials; no old credential is reactivated. Complete multi-site reconciliation, interrupted and resumed export, and remaining erasure and credential-lifecycle coverage remain named Gaps in their existing clauses.

The complete INT-001 target still includes maintenance records, procedures, assignments, execution and approvals through the same server authorization as screens, with pagination, documented errors and limits, complete OpenAPI examples and idempotent write keys. The current credential restrictions do not remove authorized member API operations or make the target permanently read-only. Complete target-entity and schema coverage and write keys beyond asset.create, asset.update, part.create, part.receive, part.count and workorder.create remain INT-001 Gaps. Interrupted or failed claims require manual reconciliation and never automatically repeat effects. Delegated service ownership remains an ADMIN-003 Gap. All existing integration, provider, migration, audit, export, restore and erasure targets and named Gaps remain in their original clauses. Policy approval supplies no implementation, provider, legal, accounting or physical-safety proof.

### RL-3 — Qualification and tool administration

Date: 2026-10-26 · Ruled by: ct · Governs: PLAN-004

Ct approved the supported defaults with riders on 26 October 2026 at pin 3187a25e3796509296b1a846b70e3ce9884fe6d1: owner-only creation, editing and retirement of qualification and tool records; planning access under the existing work assignment right without expanded personnel or document access; visibly owner-entered references without issuing-body verification; hard blocks without overrides. This is a policy ruling, not independent implementation proof or completion. Gap: Broader delegated record rights; authorized recorded exceptions with approver, reason, audit, scope and expiry; qualification-specific retention minima, holds, eligible erasure, anonymized audit and erasure-journal restore proof. Current single-site planning access does not establish ADMIN-002 multi-site scope. Retirement retains personal evidence indefinitely and is not erasure. SAFE-001 retains qualified sign-offs, prerequisites and reapproval; SAFE-002 retains qualification links and complete audit packs; ADMIN-002 retains site scope. All existing planning, tool, calibration, reservation and utilization acceptance obligations remain.

### RL-4 — Bounded public maintenance intake

Date: 2026-10-23 · Ruled by: ct · Governs: REQ-001

*Tier:* Core

**Requirement.** Operators submit faults from a branded web portal against a selected asset/location with description, urgency, contact and attachments, plus the site's own request fields: administrators configure per-site or per-portal text, choice, number, date and photo fields, mark them required or optional and map them onto the request. The portal shows in the requester's display language (ADMIN-013). ADMIN-013 carries complete catalogs, per-person and organization preferences, signed-out browser/site language selection, locale formatting and visible English fallback for both this portal and REQ-002's QR form before that language door ships; its acceptance journey must exercise both existing intake doors. Until ADMIN-002 adds sites, a portal belongs to the installation's current site. Intake defaults to active signed-in human members; ADMIN-004 inherits requester/contractor identities and their own-request-only access before those identities ship. An owner explicitly audits opening bounded public intake and publishing each opaque target's display name; a public form never lists targets or exposes private asset names, history, costs or request records. Contacts are as given, never verified identities. The adopted conservative default is five new submissions per portal/network/hour and 100 per installation/hour, content-validated PNG or JPEG photos up to 1.5 MB each and five per request, with EXIF and GPS metadata stripped before hashing and storage, and a receipt capability containing only the saved request number. Ct approved these defaults on 23 October 2026 at 08:42Z with riders: limit refusals return explicit errors and are logged without personal data; explicit owner-confirmed erasure removes contacts, photos and details, including copied corrective fault details. Administrators choose authenticated or bounded public intake; anonymous access is rate-limited and cannot enumerate private assets.

**Acceptance.**
1. Add a required "Is the line stopped?" choice to one site's form, then submit a noisy-motor fault with a photo through signed-in and public configured intake and see the answer on the request; omit the required field and see refusal.
2. Test invalid asset, file limit and abuse controls, then inspect a persisted request and private-data refusal.

### RL-5 — Device-local fault drafts

Date: 2026-10-23 · Ruled by: ct · Governs: REQ-002

*Tier:* Core

**Requirement.** An operator scans an asset QR code to open a phone fault form, in their display language (ADMIN-013), prefilled with allowed asset identity. ADMIN-013 carries this existing form's complete display-language catalog, signed-out selection, locale formatting and visible fallback before its language door ships, and exercises this form in its own acceptance journey. It supports camera evidence and saved drafts with visible submission confirmation; repeated submit and reconnect creates one request. Ct approved explicit device-storage opt-in on 23 October 2026 at 08:42Z: drafts stay on that device, confirmation clears private contents retaining only the receipt, and sign-out clears drafts across open tabs and fences stale saves.

**Acceptance.**
1. At 390 width scan the pump label, photograph a leak, lose connectivity before sending and reconnect/retry.
2. Inspect exactly one request, original asset mapping and a durable confirmation.

### RL-6 — Person time and cost custody

Date: 2026-10-23 · Ruled by: ct · Governs: FIELD-006

*Tier:* Core

**Requirement.** Technicians start, pause and resume timers and enter corrected time with reasons, distinguishing wrench time, travel, wait and admin by person and work. Overlap and implausible duration need review; authorized labor rates, overtime policy and contractor charges cost work without exposing pay rates to unauthorized roles.

**Acceptance.**
1. Record two technicians' timed work and a contractor invoice, cross midnight, correct a timer and attempt overlap.
2. Inspect approved hours and USD costs on work and asset reports, with rates hidden from a requester.
3. Current implementation semantic (ct approved 23 October 2026): the owner manages rates, overtime, invoice capture and time decisions; technicians submit and read their own source entries.
4. Every entry needs a reasoned review, with overlaps and durations over 16 hours flagged.
5. Timers submit separate elapsed segments when paused or stopped; paused gaps contribute no time.
6. Corrections retain the original and replace it only when approved.
7. Approval snapshots the latest authorized rate and splits elapsed time at each site midnight; each day uses its remaining regular-time allowance after other approved time, then the overtime multiplier.
8. A later rate or correction never reprices other approved snapshots. Existing report readers receive aggregate approved time and work costs; person-level cost and pay policy remain owner-only, and audit details contain no pay rate. Overtime is a configurable review policy, not a legal wage calculation; no payroll data is transmitted. ADMIN-002 and ADMIN-003 inherit the same source and rate privacy when site scope and delegated rights ship; FIELD-002 and FIELD-003 inherit retained segments and approval semantics when offline time ships. Original work-minute notes retain author attribution but declare no performer, interval, category or approval; they remain separately disclosed evidence, never guessed person time or pay. REPORT-010 carries approved person time under these privacy rights before it is done.

### RL-7 — Maintenance cost sources

Date: 2026-10-23 · Ruled by: ct · Governs: REPORT-001

*Tier:* Core

**Requirement.** Every work order and asset shows actual labor, consumed and returned parts, contractor, tool and miscellaneous USD costs alongside estimates, commitments and posted amounts. Parent, site and cost-center rollups avoid double counting and rate visibility follows role rights; parent roll-ups follow the asset hierarchy (ASSET-001). The repair cost entries leads record on work orders today (REPORT-005) are part of a work order's actual cost, and REPORT-005 ranks by this clause's reconciled work cost before it ships. Consumed and returned parts are the values PART-007 keeps on each issue and return, never a later price.

**Acceptance.**
1. Complete a two-technician repair using parts and a contractor, return an unused part and reconcile work, asset, parent and site cost downloads with underlying approved entries.
2. Open the downtime Pareto (REPORT-005) and see each failure's repair cost equal its work order's reconciled cost.
3. Current implementation semantic (ct approved 23 October 2026): actuals add retained manual entries, signed consumed and returned PART-007 values, approved labor snapshots and captured contractor invoices, once per source.
4. Existing manual entries stay additive because their external provenance is not guessed.
5. Work, direct asset, current subtree, site and cost-center downloads share these sources; overlapping subtree rows are explicitly non-additive.
6. Estimates, live approved purchase commitments, external commitment records and owner-recorded posted amounts are separate comparisons, never additional actual cost or verified ledger postings.
7. Comparison corrections append a referenced credit; unknown source values and missing imported components remain disclosed.
8. New financial comparison and work cost-center writes are owner-only; existing report readers retain aggregate USD access, without individual labor rates. REPORT-010 carries reconciled costs and approved time into its authorized PDF fields before it is done. BUY-005 and REPORT-008 inherit provider-confirmed bill and ledger reconciliation before shipping; ADMIN-002 and ADMIN-003 inherit current cost scopes and protected person-level rates.

### RL-8 — Strategy rollout decisions

Date: 2026-10-25 · Ruled by: ct · Governs: PM-007

Ct ruled 25 October 2026: an owner or supervisor independent of the author explicitly approves the adapted strategy and exact rollout. The atomic rollout approval retains a digest of the source preview, conflict decisions and occurrence plan, with both local and program values. Current-site calendar and meter procedure rollouts preserve issued work, due dates and meter triggers. Explicit plans cancel no issued work and retain due occurrences for ordinary generation. Two-site rollout and complete site scope still require this seed's unbuilt multi-site model (ADMIN-002); calibration strategy rollout remains unbuilt.

### RL-9 — Maintenance retention and eligible erasure

Date: 2026-10-25 · Ruled by: ct · Governs: ADMIN-007

Ct approved PARTIAL on 25 October 2026: owners manage retention minima and holds; retain indefinitely with no automatic erasure. Held, submitted, signed, required and certificate evidence is preserved; maintenance records and anonymized audit remain. Optional work originals on never-submitted, unsigned and unheld work require fresh owner confirmation. Public erasure refusals preserve original bytes, dependency counts, maintenance records and per-type results for held, signed and certificate evidence. User and full maintenance-record erasure remains partial under ADMIN-016; dependencies and per-type results for remaining file classes remain unproved.

### RL-10 — Request response recipients

Date: 2026-10-25 · Ruled by: ct · Governs: REQ-005

Ct ruled 25 October 2026: active owners and leads only, within existing triage access; other recipients are denied and no additional request data is exposed. Escalation to assigned staff and groups remains missing under REQ-008, inheriting ADMIN-004 requester groups and ADMIN-002 site scope.

### RL-11 — Damaged return disposition

Date: 2026-10-23 · Ruled by: ct · Governs: PART-003

Controlled receipt sources now support bin, lot, serial and expiry selection, atomic source limits, replay refusal, linked usable and damaged returns, inspected source restoration and expiring lots in the stores report. Ct approved owner-only confirmed disposition on 23 October 2026 at 13:37Z. Historical unattributed issues and count variances refuse affected controlled stock rather than inventing a source. PART-001 inherits complete bin reconciliation, and FIELD-002 inherits offline reconciliation before those doors ship, as scoped in the approved campaign brief.

### RL-101 — AGENT-009: Accountable agent execution and measurable value

Date: 2026-10-28 · Ruled by: ct · Governs: AGENT-009

Question: May a bounded maintenance model run exclude sensitive records and preserve honest cost/revocation lineage?

Adopted/proposed default: Owner-issued exact asset/provider/model/action/budget grant; no people/documents/rates; one call; revoked proposals rejected; costs estimated from usage.

Outcome: **adopt with rider**. Approve precise provider/data-scope declarations, installation-private key, minimized authorized data, immutable input/cost lineage, revocation fencing and honest unknown reservations; exclusions describe the current preparation capability, while company policy determines which authorized agent actions run or require review.

Why: MaintainX skills use permissioned maintenance data and present bounded recommendations. No common norm is established by the reviewed sources for Gasket’s one-provider/three-asset/no-retry limits or owner-entered price calculation; these are conservative current controls. Usage-priced cost must stay labeled an estimate, never provider invoice reconciliation.

- [Source 1](https://help.getmaintainx.com/about-smart-hub): MaintainX skills produce bounded outputs; proposed changes use safeguards and user decisions.
- [Source 2](https://help.getmaintainx.com/pm-schedule-monitor): Maintenance analysis is limited to records/capacity the user may access.

Main evidence: `CONTRACT.md:349` at `e5b99032b38770d86a34472087b096be6d62769f`.

Placement: AGENT-009 owns model custody/cost once; the Agent surface alone states company-policy execution classes, without preset approval schemes.

Engineering/proof retained: Grounded manuals, schedules/events, multiple providers, hosting secret declarations and actual custody qualification remain owed; excluding all manuals today does not remove AGENT-007 retrieval.

### RL-102 — ASSET-009: Custom asset and part fields

Date: 2026-10-28 · Ruled by: ct · Governs: ASSET-009

Question: May active owners/leads define immutable typed fields while record readership controls value access?

Adopted/proposed default: Owners/leads define/edit; values use existing record doors; types/applicability immutable, rename stable, retirement preserves values.

Outcome: **adopt with rider**. Approve current owner/lead schema administration and record-authorized value access, exclude public intake disclosure, preserve field identity on rename and historical values on retirement; any future type/applicability migration must be explicit and preserve validated existing data.

Why: MaintainX has separate role/team permissions for entities and custom fields. No common norm is established by the reviewed sources for Gasket’s immutable types or lead-only editing restriction: retain the conservative schema boundary while authorized technician-app value entry remains owed under FIELD-001.

- [Source 1](https://help.getmaintainx.com/user-roles-and-permissions): MaintainX distinguishes requester, full-user and administrator rights; record and custom-field permissions follow role/team grants.
- [Source 2](https://help.getmaintainx.com/global-organization-settings): Global custom fields have explicit type definitions and organization-level publication/management.

Main evidence: `CONTRACT.md:107` at `e5b99032b38770d86a34472087b096be6d62769f`.

Placement: ASSET-009 owns schema/value authority once; receiving search/API/import/export clauses cite its field identities.

Engineering/proof retained: Multi-site scope, native app values, complete imports/dashboard/search/API/export coverage remain engineering obligations, not a policy waiver.

### RL-103 — INT-001: Documented maintenance REST API

Date: 2026-10-28 · Ruled by: ct · Governs: INT-001

Question: Does the existing service-credential default still need a new approval?

Adopted/proposed default: Owner-bound scoped expiring credentials; no privileged scopes; transactional revocation and inactive restore.

Outcome: **resolved**. The dated 26 October ct addition already approves the credential policy with riders; retain the complete maintenance API target and all unproved lifecycle duties.

Why: The Status Gap still contains pending wording, but expressly points to an approving addition. That addition is authoritative; issuing a second policy would duplicate an existing ruling.

- [Source 1](https://github.com/just-every/run-gasket/commit/2a754765866854884ebb7252f5c01d9d752862c6): Main records ct approval of the credential boundary and preserves target coverage and credential-lifecycle gaps.

Main evidence: `CONTRACT.md:543` at `e5b99032b38770d86a34472087b096be6d62769f`.

Resolving commit: `2a754765866854884ebb7252f5c01d9d752862c6`. Exact resolving text:

> CT policy ruling, 26 October 2026, reviewed pin 17cecc3ff09c32082143087c894b67313f7da7c9: APPROVE WITH RIDERS for INT-001's conservative service-credential default.

Engineering/proof retained: Already ruled; wider entities/schemas, write keys and custody/erasure/restore attribution remain engineering. This pass does not grant additional service scopes.

### RL-104 — PLAN-009: No-code automation rules

Date: 2026-10-28 · Ruled by: ct · Governs: PLAN-009

Question: May owners/leads control deterministic scoped maintenance rules without widening record or independent decision authority?

Adopted/proposed default: Current active author/version, first conflicting field action wins, no approval/spend/finding closure/destructive/outbound effects.

Outcome: **adopt with rider**. Approve versioned rule administration by active owners/leads and current-authority scoped execution, with visible deterministic conflict order and partial failures; reconcile completed effects before catch-up, and keep independent approval/spend/finding-close doors separate. Agent action dispositions follow company policy.

Why: MaintainX supports administrator-configured automation through API-backed triggers/actions under chosen credentials. No common norm is established by the reviewed sources for Gasket’s priority/id conflict order or partial-failure scheme: retain the explicit deterministic scheme with visible non-atomic outcomes rather than silently repeat effects.

- [Source 1](https://help.getmaintainx.com/zapier-integration/set-up-a-zapier-action): Administrators configure and test actions such as work-order/message creation using a MaintainX API key.
- [Source 2](https://help.getmaintainx.com/user-roles-and-permissions): MaintainX distinguishes requester, full-user and administrator rights; record and custom-field permissions follow role/team grants.

Main evidence: `CONTRACT.md:157` at `e5b99032b38770d86a34472087b096be6d62769f`.

Placement: PLAN-009 owns rule execution/conflict recovery once; integrations cite its rule identity and current scope.

Engineering/proof retained: Outbound channels and estate-wide scope remain owed under INT-004–007 and ADMIN-002; the current in-app-only floor cannot become a permanent target exclusion.
