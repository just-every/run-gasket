# Gasket demo

`rer demo` opens a fresh, signed-in Gasket Demo. Stop it with `rer demo --stop`.
The copy lives under `.rer/demo/` and is deleted on stop; the owner's
`.wrangler/state` is never used. A second launch starts again from sample data.

Hollis Stamping & Coating's Dayton plant, the invented buyer of the homepage,
is the demo: Ellen Brandt (the owner, maintenance manager), Ray Kowalski
(lead), Dana Ortiz (supervisor), four technicians, the Gasket agent, ten
assets (Presses 1 to 4, compressors AC-01 and AC-02, receiver RT-01, dryer
DR-01, cure oven CO-1 and forklift FL-07), eight preventive schedules,
fourteen work orders (an overdue press lube, today's work, one in progress,
two done today, Saturday's AC-02 bearing change and closed history), six
parts with the two 6316-C3 bearings received this morning, six meters in
°F, psi, hrs, in/s and strokes, Press 3's downtime and the agent's proposals
(one approved, one pending). Dates follow launch time in Dayton's clock and
the shutdown is the coming Saturday. `src/demo.ts` inserts the register with
fixed identities, then `src/gasket/demo-activity.ts` records recent work
through Gasket's own commands. Neither fetches.

Base's v2 demo guard is the first import of `src/server.ts`. It adds the Demo
name without a bar or outbox. Access invitations and sign-in mail go through
Base's development sender, which returns success without sending or storing a
message. Public reads remain real; Gasket's equipment workflows have
no public internet check. MaintainX move-in reads uploaded CSV files locally.
Normal installations retain their real mail providers and ordinary auth.

`deploy-demo.json` and the Run demo workflow (Base's `run-demo.yml`) publish
https://demo.run-gasket.com/ on rer 0.2.30's native demo host: each visitor
gets their own Worker Loader isolate with SQLite Durable Object storage for
Gasket's D1, and static files are served at the edge. The workflow reads the
`run-demo` environment (`CLOUDFLARE_ACCOUNT_ID` is a variable there) and can be
dispatched with `test_only` for the separate test host, which needs the private
`RER_DEMO_MEASUREMENT_TOKEN`. Dispatch with `test_only` and `remove_test` to
remove that host and read back absence. Production uses real Turnstile;
test-only uses Cloudflare's test keys. The front uses Base's existing signed
`/auth/owner-claim` handler.

Each copy ends after 60 minutes, or 15 idle minutes, when its storage is
erased. Hosting, upgrades and removal are described in Base's
[DEMO.md at rer-v0.2.30](https://github.com/runeditrun/base/blob/rer-v0.2.30/default-seed/DEMO.md#hosting-the-demo);
runtime adoption is documented in
[src/modules/demo/README.md](src/modules/demo/README.md).
