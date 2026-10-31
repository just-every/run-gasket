-- Policy applications are retained separately from historical human approvals.
CREATE TABLE gk_interval_policy_changes (
 proposal_id TEXT PRIMARY KEY REFERENCES gk_proposals(id), schedule_id TEXT NOT NULL REFERENCES gk_schedules(id),
 revision INTEGER NOT NULL, before_days INTEGER, after_days INTEGER, before_units TEXT, after_units TEXT,
 rollback_plan TEXT NOT NULL, sponsor_id TEXT NOT NULL REFERENCES gk_members(id),
 agent_id TEXT NOT NULL, operation_id TEXT NOT NULL, decision_id TEXT NOT NULL,
 disposition TEXT NOT NULL CHECK(disposition IN ('autonomous','review','approval')),
 approver_id TEXT REFERENCES gk_members(id), applied_at INTEGER NOT NULL,
 payload_hash TEXT NOT NULL, evidence_hash TEXT NOT NULL, basis_json TEXT NOT NULL,
 CHECK((disposition='approval' AND approver_id IS NOT NULL) OR (disposition<>'approval' AND approver_id IS NULL)),
 UNIQUE(schedule_id,revision)
);
CREATE TRIGGER gk_interval_policy_changes_no_update BEFORE UPDATE ON gk_interval_policy_changes BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_interval_policy_changes_no_delete BEFORE DELETE ON gk_interval_policy_changes BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE VIEW gk_all_interval_changes AS
 SELECT proposal_id,schedule_id,revision,before_days,after_days,before_units,after_units,rollback_plan,rollback_of,approved_by,approved_at FROM gk_interval_changes
 UNION ALL
 SELECT proposal_id,schedule_id,revision,before_days,after_days,before_units,after_units,rollback_plan,NULL,approver_id,applied_at FROM gk_interval_policy_changes;
