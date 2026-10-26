ALTER TABLE gk_report_schedules ADD COLUMN editor_id TEXT REFERENCES gk_members(id);
