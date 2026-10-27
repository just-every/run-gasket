-- Retirement retains evidence; it never erases or reactivates a resource.
ALTER TABLE gk_qualifications ADD COLUMN remind_days INTEGER CHECK(remind_days BETWEEN 0 AND 365);
ALTER TABLE gk_qualifications ADD COLUMN reminder_owner_id TEXT REFERENCES gk_members(id);
ALTER TABLE gk_qualifications ADD COLUMN retired_at INTEGER;
ALTER TABLE gk_qualifications ADD COLUMN retired_by TEXT REFERENCES gk_members(id);
ALTER TABLE gk_qualifications ADD COLUMN retirement_reason TEXT;
ALTER TABLE gk_planning_tools ADD COLUMN retired_at INTEGER;
ALTER TABLE gk_planning_tools ADD COLUMN retired_by TEXT REFERENCES gk_members(id);
ALTER TABLE gk_planning_tools ADD COLUMN retirement_reason TEXT;
CREATE TABLE gk_resource_history (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('qualification','tool')),
 record_key TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES gk_members(id),
 recorded_at INTEGER NOT NULL, planning_revision INTEGER NOT NULL UNIQUE, action TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL
);
CREATE TRIGGER gk_resource_history_update BEFORE UPDATE ON gk_resource_history BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_resource_history_delete BEFORE DELETE ON gk_resource_history BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_resource_notices (
 id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES gk_members(id), member_id TEXT NOT NULL REFERENCES gk_members(id),
 qualification_name TEXT NOT NULL, expires_on TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('due','expired')),
 text TEXT NOT NULL, created_at INTEGER NOT NULL, automation_job_id TEXT REFERENCES gk_automation_jobs(id), automation_revision INTEGER,
 UNIQUE(recipient_id,member_id,qualification_name,expires_on,state)
);
