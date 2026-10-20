-- AGENT-004: human-agreed exposure windows and retained source-bound assessments.
CREATE TABLE gk_outcome_windows (
 id TEXT PRIMARY KEY, proposal_id TEXT REFERENCES gk_proposals(id), work_order_id TEXT REFERENCES gk_work_orders(id),
 baseline_from TEXT NOT NULL, baseline_to TEXT NOT NULL, post_from TEXT NOT NULL, post_to TEXT NOT NULL,
 peers_json TEXT NOT NULL, source_revision INTEGER NOT NULL, source_approved_at INTEGER NOT NULL, recorded_by TEXT NOT NULL REFERENCES gk_members(id), recorded_at INTEGER NOT NULL, CHECK((proposal_id IS NULL)<>(work_order_id IS NULL))
);
CREATE TRIGGER gk_outcome_windows_no_update BEFORE UPDATE ON gk_outcome_windows BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_outcome_windows_no_delete BEFORE DELETE ON gk_outcome_windows BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_outcome_assessments (
 id TEXT PRIMARY KEY, proposal_id TEXT REFERENCES gk_proposals(id), source_hash TEXT NOT NULL UNIQUE,
 report_json TEXT NOT NULL, recorded_by TEXT NOT NULL REFERENCES gk_members(id), recorded_at INTEGER NOT NULL
);
CREATE TRIGGER gk_outcome_assessments_no_update BEFORE UPDATE ON gk_outcome_assessments BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_outcome_assessments_no_delete BEFORE DELETE ON gk_outcome_assessments BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;

ALTER TABLE gk_notices ADD COLUMN outcome_id TEXT REFERENCES gk_outcome_assessments(id);
