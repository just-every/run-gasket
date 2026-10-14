# Backup and restore

Your Gasket's records live in your installation. `rer export` saves them to one archive file, and `rer import` restores that archive into a fresh installation with its history unchanged.

## Back up

Stop Gasket first so nothing changes while it saves, then export:

```sh
rer dev --stop
rer export --output exports/gasket.rer
```

The archive holds the site, people, assets, meters and readings, parts and movements, checklists, schedules, work orders with their results, evidence, downtime, findings and reviews, proposals, the move-in journal and the audit trail. It comes with an integrity receipt. The local outbox and your private settings are left out on purpose.

Keep a copy of the archive somewhere other than this computer.

## Restore

Import only into an empty installation. To restore over the copy on this computer, reset it first; reset keeps your `exports/` folder.

```sh
rer dev --stop
rer reset --yes
rer import --input exports/gasket.rer --yes
rer setup --owner-email you@example.com
rer dev
```

Import checks the archive and restores it all at once, or not at all. Setup then establishes the owner and the private settings the archive leaves out. Start Gasket and sign in: every asset's history reads as it did.

## Move to another computer

Install `rer` and get Gasket on the new computer as in [Getting started](getting-started.md), but before the first `rer dev`, run `rer import --input PATH-TO/gasket.rer --yes`, then `rer setup` and `rer dev`.
