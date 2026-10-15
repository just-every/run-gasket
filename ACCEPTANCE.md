# Gasket acceptance record

Each clause of [CONTRACT.md](CONTRACT.md) has one flow test through public doors: the JSON door (`/api/gasket/…`), the form door (`/app/do/…`), pages and downloads, against the built Worker with its own local D1. The tests are `tests/gasket/flows.mjs` (one `check` per clause, run by `rer verify`); sign-in mail goes through the real provider adapter and is captured at the network edge. Fixtures are invented; the MaintainX files follow MaintainX's documented column names and are not real customer exports.

| # | What a person can do | Test | Status |
| --- | --- | --- | --- |
| 1 | The owner names the site, gives people access with one role, changes a role and ends access; signed-out requests reach nothing, roles are refused in every handler (JSON and form doors), and ended access stops at once. | `GAS-01 site and access` | LOCAL PROVEN |
| 2 | A lead registers assets with identity and meters, edits them with the earlier identity kept, records sightings (found, elsewhere, missing) and retires an asset with its history. | `GAS-02 asset register` | LOCAL PROVEN |
| 3 | A lead keeps parts, receives stock and records a physical count that posts its exact variance and refuses a stale count. | `GAS-03 parts and physical counts` | LOCAL PROVEN |
| 4 | A lead writes a checklist and publishes revisions; issued work keeps its revision. | `GAS-04 checklist revisions` | LOCAL PROVEN |
| 5 | A lead schedules work by calendar and by counter meter; creating due work orders makes one per due schedule and never a second open one. | `GAS-05 schedules create due work once` | LOCAL PROVEN |
| 6 | A lead assigns, reassigns and raises corrective work; only people who can do work can be assigned; each maintainer sees their own list. | `GAS-06 assign work` | LOCAL PROVEN |
| 7 | The assigned maintainer records checklist results, attaches evidence and records dated readings; a backwards counter, a future reading and someone else's work are refused. | `GAS-07 inspection, evidence and readings` | LOCAL PROVEN |
| 8 | The maintainer issues and returns parts within stock and holdings, records downtime with computed minutes (one open at a time) and records findings that raise linked follow-up work. | `GAS-08 parts, downtime and findings` | LOCAL PROVEN |
| 9 | Submission waits for every result, a finding for any fail or needs-attention and closed downtime; a supervisor returns with a reason or approves the exact version; nobody reviews their own work; approval moves the schedule on. | `GAS-09 submit and review` | LOCAL PROVEN |
| 10 | A supervisor and lead see overdue work, follow-ups, assets down, 30-day downtime and low parts; a maintainer cannot. | `GAS-10 overdue and downtime board` | LOCAL PROVEN |
| 11 | Anyone with access reads an asset's full history with who did what; a lead or supervisor downloads it as CSV; the owner exports and restores the whole installation into a fresh one with the history unchanged. | `GAS-11 asset history and CSV`; installation export and restore use rer's own `export`/`import` | LOCAL PROVEN |
| 12 | A lead moves in MaintainX asset, part and meter-reading exports: a dry run that writes nothing, apply bound to the reviewed dry run, re-apply that adds nothing, journaled undo, and undo refused once Gasket records build on the move-in. | `GAS-12 MaintainX move-in` | LOCAL PROVEN |
| 13 | An agent with its own access prepares schedules, corrective work and counts; a lead or the owner (not the preparer) approves the exact payload or rejects it; stale proposals are refused; the agent cannot approve or change records. | `GAS-13 agent prepares, a person approves` | LOCAL PROVEN |

HTTP-001 (health, the installed Lobby and real 404s) is `tests/runtime.mjs`; Base's email sign-in is `tests/email-link.mjs`.

`rer verify` runs the flow tests on every push in the Verify workflow.

## Boundaries

This is local proof of the first release. It does not establish a hosted deployment, a real owner's physical cycle, reconciliation of assets and parts against a real stores count, MaintainX exports from a real account, accessibility beyond the automated checks, or any safety, compliance or certification claim. A real owner still has to observe one schedule-driven cycle and reconcile assets and parts against physical counts before the release is accepted for use.
