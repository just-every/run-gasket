-- Current links retain their identity; every change has immutable attribution.
CREATE TABLE gk_work_dependencies (
 id TEXT PRIMARY KEY,
 work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
 predecessor_id TEXT NOT NULL REFERENCES gk_work_orders(id),
 revision INTEGER NOT NULL CHECK(revision>0),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 UNIQUE(work_order_id,predecessor_id),
 CHECK(work_order_id<>predecessor_id)
);
CREATE INDEX gk_work_dependencies_predecessor ON gk_work_dependencies(predecessor_id,active);
CREATE TABLE gk_work_dependency_history (
 dependency_id TEXT NOT NULL REFERENCES gk_work_dependencies(id),
 revision INTEGER NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 reason TEXT NOT NULL,
 work_version INTEGER NOT NULL,
 source_version INTEGER NOT NULL,
 changed_by TEXT NOT NULL REFERENCES gk_members(id),
 changed_at INTEGER NOT NULL,
 PRIMARY KEY(dependency_id,revision)
);
CREATE TRIGGER gk_work_dependency_history_update BEFORE UPDATE ON gk_work_dependency_history
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_work_dependency_history_delete BEFORE DELETE ON gk_work_dependency_history
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_work_dependencies_delete BEFORE DELETE ON gk_work_dependencies
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;

DROP TRIGGER gk_guard_other;
CREATE TRIGGER gk_guard_other BEFORE INSERT ON gk_guard
WHEN NEW.ok IS NOT 1 AND NEW.code NOT IN ('stale','insufficient_stock','return_exceeds_issue','dependencies_blocked','dependency_cycle')
BEGIN SELECT RAISE(ABORT,'gasket_guard_failed'); END;
CREATE TRIGGER gk_guard_dependencies_blocked BEFORE INSERT ON gk_guard
WHEN NEW.ok IS NOT 1 AND NEW.code='dependencies_blocked'
BEGIN SELECT RAISE(ABORT,'gasket_guard_dependencies_blocked'); END;
CREATE TRIGGER gk_guard_dependency_cycle BEFORE INSERT ON gk_guard
WHEN NEW.ok IS NOT 1 AND NEW.code='dependency_cycle'
BEGIN SELECT RAISE(ABORT,'gasket_guard_dependency_cycle'); END;
