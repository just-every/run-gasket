# Gasket demo

`rer demo` opens a fresh, signed-in Gasket Demo. Stop it with `rer demo --stop`.
The copy lives under `.rer/demo/` and is deleted on stop; the owner's
`.wrangler/state` is never used. A second launch starts again from sample data.

Harbour Kitchen Co, the invented kitchen in the MaintainX fixtures, has eight
assets, five people and an agent, work orders (including overdue, in progress,
awaiting review, closed and a follow-up from a finding), four preventive
schedules and checklists, six parts, three meters with dated readings,
sightings, downtime and the agent's proposals (one approved, two pending).
Dates follow launch time. `src/demo.ts` inserts the register with fixed
identities, then `src/gasket/demo-activity.ts` records recent work through
Gasket's own commands. Neither fetches.

Base's v2 demo guard is the first import of `src/server.ts`. It adds the Demo
name without a bar or outbox. Access invitations and sign-in mail go through
Base's development sender, which returns success without sending or storing a
message. Public reads remain real; Gasket's equipment workflows have
no public internet check. MaintainX move-in reads uploaded CSV files locally.
Normal installations retain their real mail providers and ordinary auth.

`deploy-demo.json` and the Run demo workflow deploy one isolated container per
visitor to https://demo.run-gasket.com/. The workflow reads the `run-demo`
environment and can be dispatched with `test_only` for the separate test host.
Dispatch with `test_only` and `remove_test` to remove that host and read back
absence. Production uses real Turnstile; test-only uses Cloudflare's test keys.
The front uses Base's existing signed `/auth/owner-claim` handler.

The intended lifetime is 60 minutes, or 15 idle minutes. Container cleanup and
effect policy are supplied by Base. Runtime adoption is documented in
[src/modules/demo/README.md](src/modules/demo/README.md).
