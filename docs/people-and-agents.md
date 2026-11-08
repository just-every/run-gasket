# People, access and agents

## People and access

The owner manages access on **More → People and access**.

- **Give someone access** with their name, email and one role: Maintenance lead, Maintainer, Supervisor or Agent. They sign in with an emailed link.
- **Change role** takes effect on their next request.
- **End access** signs them out everywhere at once. Their past work stays in the history under their name.

A person without access, or whose access has ended, cannot read or change anything.

## Company agents through the shared door

A company agent discovers Gasket at `/mcp` and reads the current registry at
`/docs/agents`. Business subjects bind to the existing owner/operator and Gasket
member IDs; an email claim never selects an account. Business admins become
maintenance leads, members become maintainers, and a native promotion does not
create Business policy-editing rights.

The current Core door reads assets, work, parts, procedures and proposals;
creates and updates assets, creates and assigns corrective work, creates parts,
publishes the first immutable procedure revision and prepares source-bound
maintenance proposals. Company policy decides each operation. An unanswered
policy and Pause stop it. Standard internal work may run autonomously or enter
review; procedure publication is a commitment and waits for the named approver
when the policy requires one. Native maintenance roles and version checks apply
in either case. `/agents` shows policy, calls, review and named approvals.

Native audit entries retain the agent as preparer, the sponsor and any named
approver as separate fields, and display `<agent> for <person>`. Native service
credentials keep their original scopes, expiry and revocation; a read credential
cannot create an asset. Local Pause stops both company tokens and native service
credentials while people keep access to their ordinary maintenance screens.
Revoking an agent or its native credential stops its next call. No provider cost is registered or authorized by the door.

The door declares tools, policy, pause, audit and idempotency. Events,
resources, prompts and subscriptions are undeclared: discovery omits them,
their catalogues are empty and calls return `capability_not_declared` without
native effects. Read tools remain available with current native visibility;
records and imported text are untrusted. Multi-sponsor completion, outside mail,
resource refresh and queued continuations remain unproved. Other native jobs,
including purchasing, model calls and access administration, are not yet MCP
tools. Their existing native doors retain their permissions and evidence
requirements. The 0.2.91 subset journey checks the declared Core and typed
refusals; it does not claim those wider jobs.

## Native agent proposals

The existing Agent maintenance role uses its own sign-in and the native JSON
API. It can prepare schedule, corrective-work, physical-count, reassignment,
interval and duplicate-part merge proposals. Each preserves reasoning and source
versions. A different authorized lead or owner decides on **More → Proposals**;
stale sources refuse execution. This legacy native agent/model-run path has not
yet moved to shared-door invocation and is not claimed by the Core registry.

## Model runs the owner grants

On **More → Agent runs** the owner can let a model look at one to three assets and propose corrective work. A grant names the agent, the provider and model, the assets, a dollar budget and the prices cost is worked out from. **Preview data and actions** shows the exact request that would leave: the assets, their recent work orders and downtime. People, notes, attachments, pay rates and manual files never leave, and posted work costs leave only when the grant says so and records the provider's terms.

**Start one run now** makes a single provider call. The run only prepares proposals as the agent, each citing the records it relied on; you approve or reject them on **Proposals** as before. **Revoke grant** ends the grant for good, stops a run in progress, rejects what it left pending and drops any answer that arrives later. A provider failure stays on the run as a failure, never as a result. **Export decisions, cost and outcomes** downloads every run with its cost, proposals, decisions and measured outcome.

## Teams, shifts and handovers

On **More → Teams**, a lead names a team with its trade (Electrical, Mechanical, HVAC) and adds its people. A work order can name a team, a trade and a shift; when it names a team, only that team's people can be given it. One person is accountable for each work order and **acknowledges** it, or **declines** it with a blocker, which sends it back unassigned and tells the leads. A lead can add **collaborators**, who record results, readings, photos, parts, downtime and findings alongside the accountable person; only the accountable person submits. Handing over to the next shift is an ordinary reassignment with a handoff note, kept on the work order's **Crew** card with everyone who recorded on it. Each team's open work is its queue on the Teams page; **Assigned to me** includes work you collaborate on.

## The audit trail

**More → Audit trail** lists every change, newest first: when, who, what and which record, with the role the person acted under and, for agent proposals and move-ins, what they acted on. Search by action and by date, page back with **Older changes**, and press **Download CSV** for every matching change. Owners and supervisors can read it.
