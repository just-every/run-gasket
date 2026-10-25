# Foundation operations

Run all first-party operations from the composed, runnable edition checkout
with `rer`. Without it, start with
`npx -y @runeditrun/rer dev just-every/run-gasket` (set up only:
`npx -y @runeditrun/rer setup just-every/run-gasket`; without Node:
`curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-gasket`). `rer dev` alone launches
a fresh checkout for review. The detailed flags and effects are in
`RUN-LOCALLY.md` and `SEED-COMMAND-CONTRACT.md`.

```sh
rer install
rer setup --owner-email you@example.com
rer dev
```

Use the setup prompt instead of the owner-email flag when entering the real
mailbox. Open the `RER_OPEN` URL that `dev` prints on this computer; the app
opens signed in as the owner. Local mail is suppressed; no external email is
sent. Stop `dev` with
`rer dev --stop` or Ctrl-C, and stop `preview` with
`rer preview --stop` before build or verification.

```sh
rer verify
rer reset --yes
rer export --output exports/installation.rer
rer import --input exports/installation.rer --yes
rer deploy
rer describe
```

Use `rer describe` to inspect the checkout's actual
capabilities. `rer check --profile first-party` validates the
declared command contract; it does not run application journeys or contact a
provider.

## Local data and recovery

Setup and development use explicit owner identity and real local migrations.
Dev and preview use the same owner and canonical `.wrangler/state`; local mail
is suppressed and nothing is captured. Treat a printed `RER_OPEN` URL as a
credential: it signs in as the owner. Private settings are
kept in `.dev.vars` with mode 0600 and are not copied into build output.

Local export creates a private archive with an integrity receipt and explicit
exclusions. The foundation has no product-domain tables or background jobs; an
edition's archive contains the supported domain tables and resources that its
adapter declares. Owner/auth, bookkeeping, private settings and
transient runtime state are excluded. Import validates and restores atomically
into an empty destination; confirmed reset preserves export archives. Run setup
after restore to establish a fresh owner. Each first-party seed verifies local
export/import/export equivalence across its supported resources. Remote transfer
is available only when the adapter declares complete resource coverage.

Preserve ambiguous state and applied migration history. Never place a remote
credential, owner secret or local resource ID in source. A schema change needs
a forward migration and verified transition/recovery.

## Deployment

`rer deploy --dry-run` validates the real owner-account
deployment declaration and builds locally without provider requests. Real
deployment requires privately supplied `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`, the declared owner and session and setup secrets, and a real
verified mail sender in `deploy.json`. Follow the owner-account deploy-kit
instructions under `node_modules/@runeditrun/rer/modules/deploy-kit`; account scope,
resource ownership, migrations, receipt and health checks are defined there.
Local validation does not prove hosted acceptance, provider delivery or remote
health.

## Model runs

Agent runs (More, Agent runs) stay off until the installation has `AI_ENABLED` set to `true` and an `AI_API_KEY`. `AI_BASE_URL` names any OpenAI-compatible chat endpoint (default OpenAI's `/v1`; HTTPS only) and `AI_DEADLINE_MS` the wait before a run is recorded as uncertain (default 45000). `deploy.json` declares them for a self-owned deployment: the key is an optional secret, never a variable, and no door, export, audit entry or error returns it. A managed hosting deployment does not declare these settings yet, so runs are unavailable there. Each run is one provider call that may be billed: the grant's dollar budget is a ceiling on reserves and reported usage priced at the owner's per-million-token rates, not a reconciliation against the provider's own bill, so compare the export's cost column with the provider's usage page.

## Hosted installation package

`packaging.json` declares Gasket's Worker build, DB migrations, native sign-in and mail providers. Run `pnpm run build`, then `pnpm delivery:spec` to update the committed deployment specification. `pnpm check:deployment-spec` refuses stale source policy or build output. Package with `node scripts/delivery/base/cli.mjs package --config packaging.json --output rer-package`; the output contains the descriptor, setup manifest, dispatch-only Managed workflow and delivery artifact. Generated packages stay outside source control.

Managed hosting supplies the RER mail relay URL, sender and private credential. Assisted hosting collects the selected provider's sender and private key; Cloudflare also requires its account ID. Configure a verified sender before sending production sign-in mail. Local development continues to suppress mail.


After a successful local archive command, open Settings, then Automation to
inspect the completed backup time, backup age and recovered snapshot time.
Keep the archive itself safe: a receipt does not prove the file is still present.
After a restore, compare original attachment digests and accepted records with
the source archive, then use Confirm restore drill. The server checks product
record counts and records the owner's explicit attestation. A failed or merely
staged import does not become a successful restore receipt or drill. Resume
individual PM schedules and automation rules only after this reconciliation;
rotate connector signing keys before deliberately reconnecting receivers.
