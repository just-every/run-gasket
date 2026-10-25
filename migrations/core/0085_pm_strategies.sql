-- PM strategy drafts, independent decisions and source-bound future rollouts.
CREATE TABLE gk_pm_strategies (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
 library_key TEXT NOT NULL, library_version INTEGER NOT NULL,
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE gk_pm_strategy_revisions (
 id TEXT PRIMARY KEY, strategy_id TEXT NOT NULL REFERENCES gk_pm_strategies(id),
 number INTEGER NOT NULL, items_json TEXT NOT NULL, every_days INTEGER NOT NULL,
 reference TEXT NOT NULL, note TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(strategy_id,number)
);
CREATE TABLE gk_pm_strategy_approvals (
 revision_id TEXT PRIMARY KEY REFERENCES gk_pm_strategy_revisions(id),
 approved_by TEXT NOT NULL REFERENCES gk_members(id), approved_at INTEGER NOT NULL, reason TEXT NOT NULL
);
CREATE TABLE gk_pm_bindings (
 schedule_id TEXT PRIMARY KEY REFERENCES gk_schedules(id), strategy_id TEXT NOT NULL REFERENCES gk_pm_strategies(id),
 revision_id TEXT NOT NULL REFERENCES gk_pm_strategy_revisions(id), base_json TEXT NOT NULL
);
CREATE TABLE gk_pm_rollouts (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, strategy_id TEXT NOT NULL REFERENCES gk_pm_strategies(id),
 revision_id TEXT NOT NULL REFERENCES gk_pm_strategy_revisions(id), preview_json TEXT NOT NULL,
 decisions_json TEXT NOT NULL, occurrence_plan TEXT NOT NULL, applied_by TEXT NOT NULL, applied_at INTEGER NOT NULL
);
CREATE TRIGGER gk_pm_revision_no_update BEFORE UPDATE ON gk_pm_strategy_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_pm_revision_no_delete BEFORE DELETE ON gk_pm_strategy_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_pm_approval_no_update BEFORE UPDATE ON gk_pm_strategy_approvals BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_pm_approval_no_delete BEFORE DELETE ON gk_pm_strategy_approvals BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_pm_rollout_no_update BEFORE UPDATE ON gk_pm_rollouts BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_pm_rollout_no_delete BEFORE DELETE ON gk_pm_rollouts BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
