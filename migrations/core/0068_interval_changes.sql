-- AGENT-003: declared maintenance limits and the exact human-approved revisions.
CREATE TABLE gk_interval_limits (
 id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL REFERENCES gk_schedules(id),
 source TEXT NOT NULL CHECK(source IN ('oem','legal','site')), revision INTEGER NOT NULL,
 min_days INTEGER, max_days INTEGER, min_units TEXT, max_units TEXT,
 reference TEXT NOT NULL, recorded_by TEXT NOT NULL REFERENCES gk_members(id), recorded_at INTEGER NOT NULL,
 UNIQUE(schedule_id,source,revision)
);
CREATE TRIGGER gk_interval_limits_no_update BEFORE UPDATE ON gk_interval_limits BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_interval_limits_no_delete BEFORE DELETE ON gk_interval_limits BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_interval_changes (
 proposal_id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL REFERENCES gk_schedules(id),
 revision INTEGER NOT NULL, before_days INTEGER, after_days INTEGER, before_units TEXT, after_units TEXT,
 rollback_plan TEXT NOT NULL, rollback_of TEXT, approved_by TEXT NOT NULL REFERENCES gk_members(id), approved_at INTEGER NOT NULL
);
CREATE TRIGGER gk_interval_changes_no_update BEFORE UPDATE ON gk_interval_changes BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_interval_changes_no_delete BEFORE DELETE ON gk_interval_changes BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_proposals_next (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('schedule','corrective','count','reassign','interval')),
 payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, basis_json TEXT NOT NULL,
 reasoning TEXT NOT NULL, prepared_by TEXT NOT NULL, prepared_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 decided_by TEXT, decided_at INTEGER, decision_note TEXT, result_id TEXT
);
INSERT INTO gk_proposals_next SELECT * FROM gk_proposals;
DROP TABLE gk_proposals;
ALTER TABLE gk_proposals_next RENAME TO gk_proposals;
CREATE TRIGGER gk_proposals_decide_once BEFORE UPDATE ON gk_proposals WHEN OLD.status <> 'pending' BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
