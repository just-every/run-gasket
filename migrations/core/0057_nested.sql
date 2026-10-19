-- PM-009: immutable explicit task equivalences and occurrence satisfaction.
CREATE TABLE gk_nested_maps (
 id TEXT PRIMARY KEY, higher TEXT NOT NULL REFERENCES gk_schedules(id), lower TEXT NOT NULL REFERENCES gk_schedules(id),
 revision INTEGER NOT NULL, higher_revision TEXT NOT NULL REFERENCES gk_checklist_revisions(id), lower_revision TEXT NOT NULL REFERENCES gk_checklist_revisions(id),
 tasks TEXT NOT NULL, reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(higher,lower,revision), CHECK(higher<>lower)
);
CREATE TRIGGER gk_nested_maps_keep BEFORE UPDATE ON gk_nested_maps BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_nested_maps_stay BEFORE DELETE ON gk_nested_maps BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_nested_satisfaction (
 id TEXT PRIMARY KEY, mapping TEXT NOT NULL REFERENCES gk_nested_maps(id), higher_work TEXT NOT NULL REFERENCES gk_work_orders(id),
 lower_work TEXT NOT NULL UNIQUE REFERENCES gk_work_orders(id), higher_version INTEGER NOT NULL, lower_version INTEGER NOT NULL,
 occurrence TEXT NOT NULL, evidence TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TRIGGER gk_nested_satisfaction_keep BEFORE UPDATE ON gk_nested_satisfaction BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_nested_satisfaction_stay BEFORE DELETE ON gk_nested_satisfaction BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
