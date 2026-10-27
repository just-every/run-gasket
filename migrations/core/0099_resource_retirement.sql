-- The active register is separate from immutable retired evidence.
ALTER TABLE gk_qualifications ADD COLUMN record_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE gk_qualifications ADD COLUMN recorded_at INTEGER;
ALTER TABLE gk_qualifications ADD COLUMN recorded_by TEXT;
ALTER TABLE gk_qualifications ADD COLUMN remind_days INTEGER CHECK(remind_days BETWEEN 0 AND 365);
CREATE TABLE gk_qualification_reminders (
 id TEXT PRIMARY KEY,
 record_id TEXT NOT NULL,
 recipient_id TEXT NOT NULL REFERENCES gk_members(id),
 stage TEXT NOT NULL CHECK(stage IN ('due','expired')),
 text TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 automation_job_id TEXT REFERENCES gk_automation_jobs(id),
 UNIQUE(record_id,recipient_id,stage)
);
CREATE TABLE gk_retired_resources (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('qualification','tool')),
 record_id TEXT NOT NULL,
 snapshot TEXT NOT NULL,
 retired_at INTEGER NOT NULL,
 retired_by TEXT NOT NULL REFERENCES gk_members(id),
 reason TEXT NOT NULL
);
CREATE TRIGGER gk_retired_resources_update BEFORE UPDATE ON gk_retired_resources
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_retired_resources_delete BEFORE DELETE ON gk_retired_resources
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
