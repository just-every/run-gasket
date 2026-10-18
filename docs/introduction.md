# Introduction

Gasket keeps the equipment a small team owns in service. It holds one asset register, preventive schedules by calendar or meter, the work orders those schedules become, the maintainer's inspection, readings, parts and downtime, a supervisor's review, and the full history of every asset.

It is free and open source under the MIT license. You run your own copy, and you keep every record.

## How work moves through Gasket

1. A maintenance lead registers the equipment, writes a checklist and schedules it on an asset: every so many days, every so many units of a counter meter, or both.
2. **Create due work orders** turns each schedule that falls due within seven days into one work order, assigned to its default maintainer.
3. The maintainer records a result and a note for every checklist item, attaches photos, records readings, issues the parts they used, records downtime and findings, and submits the work for review.
4. A supervisor reads exactly what was recorded and approves it, or returns it with a reason. Approval closes the work order and moves the schedule on to its next due date.
5. Everything lands in the asset's history, with who did what and when. The board shows what is overdue, waiting for review and down right now.

## Who does what

Each person has one role.

| Role | What they do |
| --- | --- |
| Owner | Everything, including people and access, the site and the audit trail. |
| Maintenance lead | Registers equipment and parts, writes checklists and schedules, assigns work, moves data in and approves agent proposals. |
| Maintainer | Records the work assigned to them. |
| Supervisor | Reviews finished work and watches overdue work and downtime. |
| Agent | An AI agent's own sign-in that reads and prepares proposals; a person approves them. |

Nobody approves a work order they did the work on.

## What you need

A computer with Node 22 or later and pnpm 10.12.4, on macOS, Linux or Windows with WSL2. [Getting started](getting-started.md) takes you from nothing to a running copy.

Gasket records what people did. It never certifies equipment as safe or compliant; physical checks still need a qualified person.
