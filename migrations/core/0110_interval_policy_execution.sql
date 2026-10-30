-- Preserve every earlier interval decision and distinguish execution from a person's approval.
CREATE TABLE gk_interval_changes_next (
 proposal_id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL REFERENCES gk_schedules(id),
 revision INTEGER NOT NULL, before_days INTEGER, after_days INTEGER, before_units TEXT, after_units TEXT,
 rollback_plan TEXT NOT NULL, rollback_of TEXT, approved_by TEXT REFERENCES gk_members(id), approved_at INTEGER NOT NULL,
 executed_by TEXT NOT NULL REFERENCES gk_members(id),
 execution_kind TEXT NOT NULL CHECK(execution_kind IN ('human','company_policy'))
);
INSERT INTO gk_interval_changes_next SELECT proposal_id,schedule_id,revision,before_days,after_days,before_units,after_units,
 rollback_plan,rollback_of,approved_by,approved_at,approved_by,'human' FROM gk_interval_changes;
DROP TABLE gk_interval_changes;
ALTER TABLE gk_interval_changes_next RENAME TO gk_interval_changes;
CREATE TRIGGER gk_interval_changes_no_update BEFORE UPDATE ON gk_interval_changes BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_interval_changes_no_delete BEFORE DELETE ON gk_interval_changes BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
