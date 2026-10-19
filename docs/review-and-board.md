# Review and the board

A supervisor reviews finished work, and the board shows what needs attention across the site.

## Review a work order

Work waiting for review appears on the board and in the work list with the status **Waiting for review**. Open it and read what was recorded: results, notes, evidence, readings, parts, downtime and findings.

- **Approve and close** closes the work order and moves its schedule on: a calendar schedule to its next due date, a meter schedule to the reading recorded plus its interval.
- **Return for more work**, with a reason, sends it back to the maintainer.

You approve the exact version you read. If anyone changes the work order while you review it, Gasket asks you to reload first. Nobody can review work they recorded, even if it was later reassigned to someone else.

Reviewing records what was entered. It is not a safety sign-off.

## The board

**More → Overdue and downtime** shows, as of today:

- overdue work orders;
- work waiting for review;
- open follow-up work raised from findings;
- assets down right now, and for how long so far;
- downtime minutes per asset over the last 30 days;
- parts below their minimum.

## Performance

**Performance** in the menu (leads, supervisors and the owner) shows a period of days, the last 30 by default, for the whole site or one team: the backlog by age with estimated hours (work without an estimate is named), overdue and at-risk work, PM compliance, planned against reactive work and schedule attainment. PM compliance counts every preventive occurrence that fell due: done on time, late, still overdue, cancelled, skipped or never generated, so a missed one never drops out; each row links to its work order, its assignee and any blocker. Give estimates when raising work or setting up a schedule, and name a schedule's team so its work and its missed occurrences belong to that team.

## Availability

**Availability** in the menu (leads, supervisors and the owner) shows each line, and each entry with an outage, over a period of days: production time (the site's declared weekly production hours, or every hour when none are declared), planned time taken out of it, down time with overlapping outages of an entry and the entries below it counted once, availability, degraded running listed on its own, and unknown coverage where no hour meter was reporting. The source timeline lists every outage with its window clipped to the period and its minutes inside production hours. Record degraded running from the work order's Downtime card with **Degraded: still running at reduced output**.

## Downtime Pareto

**Downtime Pareto** in the menu ranks failure minutes inside production hours by asset, line, failure mode and reason, with each row's share and cumulative share, repeat failures, repair cost and lost production. When a component and the machine above it are down at once the shared minutes count once. Leads record repair cost entries on the work order's **Repair cost** card and document a lost-production rate per production hour for a line or machine on this page; with neither, the cost or loss reads Unknown and is never estimated. **Download inputs (CSV)** exports every figure behind the ranking.

## Reliability

**Reliability** in the menu (leads, supervisors and the owner) shows a period of days, the last 30 by default, for the whole site or one asset. Every stop recorded on a work order is a failure unless it was marked a planned stop. MTBF divides the run hours an asset's hour meter (a counter in hours) counted between its first and last reading in the period by the failures inside that time; the rest of the period is shown as unknown coverage, never guessed. MTTR is the mean time from a failure to back in service, and MTTA the mean time from a failure to the assignee acknowledging its work order. Each measure shows its sample and what it left out and why, and the page lists its definitions, failures by failure mode with their cumulative share, repeat failures of one asset, and every failure with links to its work.

If a stop was classified wrongly, a lead chooses it under **Correct a classification**, sets planned or the failure mode and gives a reason. The measures change at once; the stop shows every classification it has had, who gave it and when.

## Every asset's history

An asset's page lists its work orders and its full history: work orders, results, readings, parts, downtime, findings and reviews, with who did what and when. Earlier details of the asset itself are kept when it is edited or retired. A lead or supervisor can press **Download history (CSV)** to take the history away as a spreadsheet.

Next: [Parts and assets](parts-and-assets.md).
