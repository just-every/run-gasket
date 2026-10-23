-- Original manual time entries belong to a work revision and retain attribution.
CREATE TABLE gk_time_entries (
 id TEXT PRIMARY KEY,
 work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
 worked_on TEXT NOT NULL,
 minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
 note TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES gk_members(id),
 recorded_at INTEGER NOT NULL
);
CREATE INDEX gk_time_entries_work ON gk_time_entries(work_order_id, recorded_at, id);
CREATE TRIGGER gk_time_entries_keep BEFORE UPDATE ON gk_time_entries
 BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
