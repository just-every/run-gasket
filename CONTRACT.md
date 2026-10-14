# Gasket product contract

Gasket is for the maintenance lead at a small Australian maker, workshop or equipment-heavy hospitality or facilities operator. It keeps the equipment the business owns in service: one asset register, preventive schedules, assigned work orders, the maintainer's inspection, readings, parts and downtime evidence, a supervisor's review, and the overdue and downtime picture that follows. It is not a contractor's customer job queue, an IT service desk, production scheduling or software uptime monitoring.

This document sets the required behaviour of the first release. [ACCEPTANCE.md](ACCEPTANCE.md) names the test that proves each clause and records its status.

## Operating rules

- A new installation starts empty: no assets, parts, schedules or sample data. The owner names the one site and enters or imports real records.
- Every person signs in with Base's native sign-in. The owner gives each person one role: **lead** (runs the register, schedules, parts and assignments), **maintainer** (does the physical work assigned to them), **supervisor** (reviews finished work and watches overdue work and downtime) or **agent** (an AI agent's own sign-in: it reads and prepares proposals, and changes nothing else). The owner holds every role.
- Every server handler checks the signed-in person's current role and status itself; hiding a link or a route is never the only check. Ending a person's access ends their sessions at once.
- Every change is written in one atomic batch with an audit entry naming the person, the action and the record. Readings, part movements, checklist revisions, reviews and audit entries are append-only.
- Only the person a work order is assigned to records its inspection, readings, parts and downtime. Nobody approves a work order they did the work on.
- **HTTP-001.** `/health` answers the deployment's health and identity, `/` is the installed Lobby, and unknown paths answer real 404s, for both HTTP and documents.
- Software status is a record of what people entered. "Reviewed" means a supervisor accepted the record; it never means the equipment is safe, certified or compliant. Physical checks still need a qualified person.

## First release: thirteen clauses

1. **Set up the site and its people.** The owner names the site and its time zone, gives a person access with one role, changes a role and ends access. A person without access, or whose access has ended, cannot read or change anything.
2. **Keep the asset register.** A lead registers an asset with its asset tag, name, serial, location, custodian, category, criticality and meters (counter, gauge or condition, with a unit). Edits keep the earlier values in the asset's history; retiring an asset keeps all of its history. A lead records a physical sighting of an asset (found at the recorded location, found elsewhere, or not found) to reconcile the register.
3. **Keep the parts list and reconcile counts.** A lead keeps parts with a part number, unit and minimum quantity, receives stock, and records a physical count. A count posts the exact variance as its own movement; on-hand never goes below zero and history is never rewritten.
4. **Write checklists with revisions.** A lead writes a checklist and publishes revisions. A work order keeps the revision it was created with, so a later revision never changes work already issued.
5. **Schedule preventive work.** A lead schedules a checklist on an asset every N days, every N units of a counter meter, or both, with a first due date and a default maintainer. "Create due work orders" creates one work order for each schedule that is due within seven days or whose meter has reached its due value, and never a second open one for the same schedule.
6. **Assign work.** A lead assigns or reassigns a work order to a maintainer or lead with access; each maintainer sees their own work list. A lead can also raise a corrective work order on an asset by hand.
7. **Capture the inspection.** The assigned maintainer records a result (pass, fail or needs attention) and a note for every checklist item, attaches inspection evidence (a photo or document), and records dated meter and condition readings. A counter reading lower than the asset's latest earlier reading is refused.
8. **Issue and return parts, record downtime and findings.** The assigned maintainer issues parts to the work order (never more than on hand) and returns unused parts (never more than issued). They record when the asset went down and came back; minutes are computed and an asset has one open downtime at a time. They record corrective findings with a severity; a finding that needs follow-up raises a corrective work order linked to it.
9. **Submit and review.** The maintainer submits when every checklist item has a result, every fail or needs-attention result has a finding and no downtime is open. A supervisor approves the exact version they reviewed, or returns it with a reason for more work. A changed work order makes an earlier review attempt stale. Approval closes the work order and moves its schedule on.
10. **Watch overdue work and downtime.** A supervisor and lead see overdue work orders, work waiting for review, open follow-ups, assets down now, downtime minutes per asset over the last 30 days and parts below their minimum.
11. **Read and keep the history.** Anyone with access reads an asset's full history: work orders, results, readings, parts, downtime, findings and reviews, with who did what and when. A lead or supervisor downloads it as CSV. The owner exports the whole installation with `rer export` and restores it into a fresh installation with `rer import`; the history is unchanged after restore.
12. **Move in from MaintainX.** A lead uploads MaintainX's asset export, part export and meter-reading export (CSV, MaintainX's documented column names). A dry run shows what would be created, rejected rows with reasons and what needs attention, and writes nothing. Applying is bound to the reviewed dry run, is journaled, and re-applying the same files adds nothing. Undo removes exactly that import, and refuses while later Gasket records depend on it.
13. **Let an agent prepare and a person approve.** An agent signs in with its own **agent** access and uses the same JSON API as the screens ([API.md](API.md)). It reads the register, parts, schedules and work orders, and prepares proposals of three kinds: a preventive **schedule** for an asset, a **corrective work order** for an asset, and a **parts count**. A proposal records what it would do, the agent's reasoning and the record versions it relied on. A lead or the owner (never the person who prepared it) approves or rejects each one. Approval runs the normal command as the approver in the same atomic batch, refuses when the records it relied on changed since it was prepared, and records who approved, when and the exact payload hash. An agent cannot approve, record work or change any record directly.

## Decided defaults

- One site, one time zone, Australian English and metric units by default; a business can rename units freely.
- Calendar schedules keep a fixed cadence: the next due date is the previous due date plus the interval, not the completion date. Meter schedules are due again at the reading recorded on approval plus the interval.
- Work orders are generated when a lead (or an approved agent proposal) asks, within a seven-day horizon; there is no unattended background generation in the first release.
- Part quantities are exact to three decimal places. Parts carry no cost or valuation.
- Inspection evidence is stored inside the installation's database, up to 1.5 MB per file.
- Roles are fixed (owner, lead, maintainer, supervisor, agent); there are no custom permissions.
- The first move-in kit is MaintainX's documented CSV exports. Asset hierarchy (Parent), teams, vendors and costs are not carried; the dry run lists what is left behind.

## Not in the first release

More than one site; contractor or customer jobs; requests from outside the team; purchase orders and suppliers; costs, depreciation and budgets; sensor or IoT feeds and automatic meter capture; offline mobile capture; calendars and notifications; custom roles and fields; asset hierarchy; production scheduling; safety certification, regulatory compliance, permit-to-work or lockout/tagout sign-off; autonomous equipment control; any provider or AI model call made by Gasket itself.

A real owner still has to observe one schedule-driven cycle on their own equipment and reconcile assets and parts against physical counts before this release is accepted for use.
