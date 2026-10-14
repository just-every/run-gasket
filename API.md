# Gasket API

Every screen in Gasket uses the same handlers as this JSON API, so a person and an agent are held to the same rules. The API lives under `/api/gasket/` on the installation's own origin.

## Signing in

An agent gets its own sign-in: the owner gives an email address the **agent** role on *People and access*. The agent signs in with Base's ordinary email link (`POST /auth/magic-link`, then the emailed `/auth/confirm` link) and sends the session cookie it receives. A request without a live session answers `401 {"error":"authentication_required"}`; ended access answers `401` or `403`. Every `POST` must carry an `Origin` header equal to the installation's origin.

Roles: **owner** (everything), **lead**, **maintainer**, **supervisor** and **agent**. An agent can read everything below and call `proposal.prepare`; every other action answers `403 {"error":"forbidden"}` for it.

## Reading

`GET /api/gasket/NAME` returns JSON.

| Path | Returns |
| --- | --- |
| `me` | The signed-in person, their role, the site's date and time zone |
| `site` | Site name and time zone |
| `members` | People with access (owner only) |
| `assets`, `assets/ID` | The register; one asset with meters (latest readings), earlier identities, sightings and schedules |
| `assets/ID/history` | Every event on the asset in time order, with who did it |
| `parts`, `parts/ID` | Parts with on-hand and minimum; one part with every movement. `seen` is the movement sequence a count must name |
| `checklists`, `checklists/ID` | Checklists and every published revision |
| `schedules` | Schedules with cadence, next due date or meter value and any open work order |
| `work` (`?mine=1`, `?state=closed`), `work/ID` | Work lists; one work order with checklist results, readings, parts, downtime, findings, evidence, reviews and what still blocks submission |
| `board` | Overdue work, waiting for review, open follow-ups, assets down, 30-day downtime, low parts (lead, supervisor, owner) |
| `proposals` | Proposals with payload, reasoning, basis, status and decision |
| `imports` | The move-in journal (lead, owner) |
| `audit` | The latest 500 audit entries (supervisor, owner) |

## Changing

`POST /api/gasket/ACTION` with a JSON body. Success answers `200` with the result (usually `{"id": ...}`); a refusal answers `4xx {"error": CODE, "detail"?: ...}`. Codes are stable words such as `forbidden`, `stale`, `not_your_work`, `insufficient_stock`, `meter_went_backwards`, `not_ready_for_review`, `own_work`, `proposal_stale` and `undo_blocked`.

Actions: `site.configure`, `access.give`, `access.role`, `access.end`, `asset.create`, `asset.update`, `asset.retire`, `asset.sighting`, `meter.create`, `part.create`, `part.receive`, `part.count`, `checklist.create`, `checklist.revise`, `schedule.create`, `workorders.generate`, `workorder.create`, `workorder.assign`, `workorder.cancel`, `workorder.results`, `workorder.evidence`, `workorder.readings`, `workorder.issue`, `workorder.return`, `downtime.start`, `downtime.end`, `finding.record`, `workorder.submit`, `workorder.review`, `proposal.prepare`, `proposal.decide`, `import.preview`, `import.apply`, `import.job`.

Writes that change a versioned record take the version the caller read (`revision` for an asset, `version` for a work order, `seen` for a part count) and answer `409 {"error":"stale"}` if it moved. Files go as `{"filename": "...", "base64": "..."}`.

## Agent proposals

```http
POST /api/gasket/proposal.prepare
{"kind": "corrective",
 "reasoning": "Run hours rose 408 h since the last service and discharge temperature reached 41 °C.",
 "payload": {"asset": "ASSET_ID", "title": "Inspect condenser fan", "due": "2026-10-20", "assignee": "MEMBER_ID"}}
```

Kinds and their payload fields (all strings):

- `schedule`: `asset`, `checklist`, `title`, and `everyDays` + `firstDue` and/or `meter` + `everyUnits` (optional `firstDueMeter`), optional `assignee`.
- `corrective`: `asset`, `title`, `due` (YYYY-MM-DD), optional `description`, `assignee`.
- `count`: `part`, `counted`, optional `note`.

The answer carries the proposal `id` and the SHA-256 `hash` of its exact payload. The payload is validated when prepared. A lead or the owner who did not prepare it decides on the Proposals screen or with `proposal.decide` (`proposal`, `decision` `approve` with the `hash`, or `reject` with a `note`). Approval runs the normal command as that person in the same atomic batch and answers `409 proposal_stale` if the asset or part the proposal relied on changed in the meantime.
