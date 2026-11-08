# Qualification custody

Qualification families, captured copies and scoped upkeep follow RULINGS.md RL-12. Retirement is separate from erasure, and stewardship grants no erasure or private-original authority.

## Retired qualification retention

The owner reads `GET /api/gasket/retention-preview?kind=qualification&id=ID`,
using the retired resource id from `planning`. The preview reports the current
planning revision, eligibility, retained safety sign-offs, retired record count,
reminder count, exact refusal reasons and audit details to anonymize. A qualification hold uses
`retention.hold` with `kind: qualification` and that retired id. A user hold
protects all that person's retired qualifications. Existing user and maintenance
minimum ages both apply, measured conservatively from retirement.

`POST /api/gasket/qualification.erase` requires an ordinary owner session, the
retired `id`, the preview's `revision` and explicit `confirm: true`. The same
handler serves the ordinary form action. It refuses any active replacement,
hold, unmet minimum age or retained safety sign-off for that person's named
qualification. A hold racing erasure cannot also succeed. Nothing deletes
automatically. Tool history and unrelated qualifications are preserved.

An eligible operation removes every retired version of the same qualification
for that person, its renewal notices and private correction and retirement
audit payloads. Audit actor, role, action, record, site and time remain; user
identity erasure is separate. The result reports removed and anonymized counts,
is stored without reference text and is returned unchanged on a retry. Earlier
exports are invalidated in the erasure transaction. A later archive supplied
with `rer import --journal LATER_ARCHIVE` refuses an older archive before
publication; restoring the later archive keeps the erasure result and does not
restore the reference. Prior downloads remain outside local erasure.

RL-12 supplies the policy boundary; it supplies no legal retention period or compliance determination.
Broader copied-data reconciliation and user identity erasure remain under
ADMIN-007 and ADMIN-016.

## Named resource stewardship

An ordinary active owner issues `planning.grant` with `grantee`, `site: primary`,
`kind` (qualification or tool), `target` (the qualification holder, empty for a
tool), exact `name`, `revision: 0`, `enabled: true`, `consent: true` and `reason`.
The grant authorizes creation, correction and retirement of that named record
only. Planned sites are refused. It grants no work planning, personnel directory,
private original document, reminder consent, erasure, retention or grant authority.
Only the owner chooses renewal reminder consent; a steward correction preserves
that existing choice.

`GET /api/gasket/resource-records` returns the existing authorized planning view
for a planner. A named steward without planning rights receives only people and
record facts needed for effective scopes, without private references, contacts,
work, availability or retired evidence. The same view powers Resource settings.
The qualification, tool and retirement actions apply the exact scope again
inside their atomic writes. Existing ordinary record and site permissions remain
independent.

Revoke with `planning.grant` using the grant `id`, current `revision`,
`enabled: false` and `reason`. The old session immediately loses record upkeep.
An ended and reinstated membership or changed operator generation cannot revive
an old grant. A revoked scope requires a fresh deliberate grant; restored
archives always disable grants. Owner-confirmed qualification erasure also
redacts matching scope names, targets and reasons, anonymizes their retained
audit payloads and reports the number of affected grants while retaining actor,
action, site and time attribution.

Qualification erasure redacts released qualification-hold reasons and their audit
payloads as well as qualification and stewardship copies. Active holds on the
holder, recorded contributors or a named steward refuse erasure atomically.

Older captured qualification inputs are matched by their recorded holder and
qualification name as well as current evidence identities. New job captures
exclude the obsolete shared identity. Unattributed older renewal notices refuse
erasure until reconciled; the application does not guess which person owns them.
