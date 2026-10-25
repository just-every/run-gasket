-- AGENT-009: owner-granted, scoped, dollar-budgeted model runs. A grant is the
-- only authority a run has; a run keeps its inputs, cost and outcome for good.
CREATE TABLE gk_agent_grants (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL REFERENCES gk_members(id), created_at INTEGER NOT NULL,
 agent_id TEXT NOT NULL REFERENCES gk_members(id), purpose TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
 assets_json TEXT NOT NULL, costs INTEGER NOT NULL DEFAULT 0 CHECK(costs IN (0,1)), terms_ack TEXT NOT NULL DEFAULT '',
 actions_json TEXT NOT NULL, max_proposals INTEGER NOT NULL CHECK(max_proposals BETWEEN 1 AND 5),
 max_output_tokens INTEGER NOT NULL CHECK(max_output_tokens BETWEEN 100 AND 4000),
 budget_micro INTEGER NOT NULL CHECK(budget_micro > 0), spent_micro INTEGER NOT NULL DEFAULT 0,
 input_price_micro INTEGER NOT NULL CHECK(input_price_micro >= 0), output_price_micro INTEGER NOT NULL CHECK(output_price_micro >= 0),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')), revoked_by TEXT REFERENCES gk_members(id), revoked_at INTEGER, revoke_reason TEXT
);
CREATE TRIGGER gk_agent_grant_stays_revoked BEFORE UPDATE ON gk_agent_grants WHEN OLD.status = 'revoked' AND (NEW.status <> 'revoked' OR NEW.revision <> OLD.revision OR NEW.budget_micro <> OLD.budget_micro) BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_agent_grant_no_delete BEFORE DELETE ON gk_agent_grants BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_agent_runs (
 id TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES gk_agent_grants(id), grant_revision INTEGER NOT NULL,
 started_by TEXT NOT NULL REFERENCES gk_members(id), started_at INTEGER NOT NULL, finished_at INTEGER,
 status TEXT NOT NULL CHECK(status IN ('running','completed','failed','uncertain','revoked')),
 provider TEXT NOT NULL, model TEXT NOT NULL, preview_hash TEXT NOT NULL, inputs_json TEXT NOT NULL,
 reserve_micro INTEGER NOT NULL, cost_micro INTEGER, cost_basis TEXT CHECK(cost_basis IN ('reported','reserved','none')),
 prompt_tokens INTEGER, completion_tokens INTEGER, provider_outcome TEXT, discarded INTEGER NOT NULL DEFAULT 0 CHECK(discarded IN (0,1)), summary TEXT
);
CREATE INDEX gk_agent_runs_recent ON gk_agent_runs(started_at DESC);
CREATE TRIGGER gk_agent_run_settled BEFORE UPDATE ON gk_agent_runs WHEN OLD.finished_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_agent_run_no_delete BEFORE DELETE ON gk_agent_runs BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_agent_run_proposals (
 run_id TEXT NOT NULL REFERENCES gk_agent_runs(id), proposal_id TEXT NOT NULL REFERENCES gk_proposals(id),
 position INTEGER NOT NULL, evidence_json TEXT NOT NULL, PRIMARY KEY(run_id, proposal_id)
);
CREATE TRIGGER gk_agent_run_proposal_keep BEFORE UPDATE ON gk_agent_run_proposals BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_agent_run_proposal_stay BEFORE DELETE ON gk_agent_run_proposals BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
