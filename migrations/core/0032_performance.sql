-- REPORT-004: estimated work, so backlog and completed work are counted in
-- hours as well as orders. A schedule may name a team and an estimate, which
-- the work it issues carries, so its due occurrences belong to that team even
-- before any work exists for them.
ALTER TABLE gk_work_orders ADD COLUMN estimate_minutes INTEGER CHECK (estimate_minutes IS NULL OR estimate_minutes BETWEEN 1 AND 60000);
ALTER TABLE gk_schedules ADD COLUMN team_id TEXT REFERENCES gk_teams(id);
ALTER TABLE gk_schedules ADD COLUMN estimate_minutes INTEGER CHECK (estimate_minutes IS NULL OR estimate_minutes BETWEEN 1 AND 60000);
