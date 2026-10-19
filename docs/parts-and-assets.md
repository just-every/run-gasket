# Parts and assets

## Parts that match the shelf

On **Parts**, a lead adds each part with its part number, name, unit (each, L, m, kg…), minimum on hand and shelf location. A part below its minimum is marked **Below minimum** and appears on the board.

On a part's page:

- **Receive stock** adds what arrived, with a note of the supplier, docket or reason.
- **Record a physical count** enters what is actually on the shelf. Gasket records the exact difference as its own movement, so the history is never rewritten.
- **Movements** lists every opening, receipt, issue, return and count, with its work order and who made it.

On-hand stock never goes below zero.

## Reservations, kits and substitutes

A lead or owner can set stock aside for a work order before it starts. On the work order, **Reserve part** reserves one part, and **Reserve kit** reserves every part of a repair kit at once. Each part then shows what is **Reserved** for work and what is **Available** to anyone else; nothing leaves the shelf until it is issued. A reservation is refused when there is not enough available, so two jobs can never both count on the last unit, and issuing to one job never takes parts reserved for another.

Under **Repair kits** on **Parts**, a lead makes a kit from up to four parts and quantities. On a part's page, **Approved substitutes** lets a lead approve another part that may fill in for it; when reserving, choose **Instead of** or **Use a substitute** to take the approved part. Unapproved substitutes are refused.

A reservation ends when a lead releases it with a reason, or when its work order is cancelled, merged into another or approved and closed. Each part's **Reservations** card keeps every reservation with how and why it ended.

## The asset register

A lead registers each asset on **Assets** and keeps its details up to date under **Change details**; the earlier values stay in its history. **Retire asset** takes it out of service for good while keeping its history; close or cancel its open work first.

### Meters

Each asset can have meters: a **counter** that never goes down (run hours, miles, cycles), a **gauge** for a measured value (a temperature, a pressure), or a **condition** of good, fair or poor. Maintainers record readings on work orders, and counter meters can drive schedules.

### Sightings

To reconcile the register with the floor, record a sighting on the asset's page: found at its recorded location, found somewhere else, or not found. The asset list shows the last sighting of each.

Next: [People, access and agents](people-and-agents.md).
