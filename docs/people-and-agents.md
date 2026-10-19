# People, access and agents

## People and access

The owner manages access on **More → People and access**.

- **Give someone access** with their name, email and one role: Maintenance lead, Maintainer, Supervisor or Agent. They sign in with an emailed link.
- **Change role** takes effect on their next request.
- **End access** signs them out everywhere at once. Their past work stays in the history under their name.

A person without access, or whose access has ended, cannot read or change anything.

## Agents prepare, a person approves

An AI agent can help keep the plan up to date without changing anything itself. Give it its own access with the **Agent** role. It signs in like a person and uses the same JSON API as the screens ([the API reference](../API.md)).

An agent reads the register, parts, schedules and work orders, and prepares three kinds of proposal:

- a **preventive schedule** for an asset;
- a **corrective work order** for an asset;
- a **parts count**.

Each proposal shows what it would do and the agent's reasoning. On **More → Proposals**, a lead or the owner presses **Approve and run** or **Reject**; the person who prepared a proposal can never decide it. Approving runs the ordinary action as the approver, and is refused if the records the proposal relied on changed since it was prepared.

## Teams, shifts and handovers

On **More → Teams**, a lead names a team with its trade (Electrical, Mechanical, HVAC) and adds its people. A work order can name a team, a trade and a shift; when it names a team, only that team's people can be given it. One person is accountable for each work order and **acknowledges** it, or **declines** it with a blocker, which sends it back unassigned and tells the leads. A lead can add **collaborators**, who record results, readings, photos, parts, downtime and findings alongside the accountable person; only the accountable person submits. Handing over to the next shift is an ordinary reassignment with a handoff note, kept on the work order's **Crew** card with everyone who recorded on it. Each team's open work is its queue on the Teams page; **Assigned to me** includes work you collaborate on.

## The audit trail

**More → Audit trail** lists every change, newest first: when, who, what and which record, with the role the person acted under and, for agent proposals and move-ins, what they acted on. Search by action and by date, page back with **Older changes**, and press **Download CSV** for every matching change. Owners and supervisors can read it.
