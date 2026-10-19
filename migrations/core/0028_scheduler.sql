-- PM-001: the installation's own scheduler (a Cron Trigger every 15 minutes).
-- Each run is kept with its UTC time, what it issued and, when the scheduler had
-- not run for longer than 45 minutes, the gap: missed-run debt stays visible.
-- A work order the schedule issued names its occurrence (schedule and due date,
-- counter value or triggering reading), so the scheduler never issues one twice.
CREATE TABLE gk_scheduler_runs (
  id TEXT PRIMARY KEY,
  cron TEXT NOT NULL,
  ran_at INTEGER NOT NULL,
  created INTEGER NOT NULL,
  gap_minutes INTEGER,
  finished_at INTEGER NOT NULL
);
CREATE INDEX gk_scheduler_runs_at ON gk_scheduler_runs(ran_at);
ALTER TABLE gk_work_orders ADD COLUMN occurrence TEXT;
CREATE INDEX gk_work_orders_occurrence ON gk_work_orders(occurrence);
