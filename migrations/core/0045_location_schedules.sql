-- PLAN-001: preventive work at a location with no asset. A schedule names one
-- asset or one location, like the work it issues; a meter belongs to an asset,
-- so a location's schedule is by calendar only. Work orders and schedule
-- exceptions reference schedules, so the rows go back in after the new table
-- holds the name (as in 0043).
PRAGMA defer_foreign_keys = true;
CREATE TABLE gk_schedules_keep AS SELECT * FROM gk_schedules;
CREATE TABLE gk_schedules_next (
  id TEXT PRIMARY KEY,
  asset_id TEXT REFERENCES gk_assets(id),
  checklist_id TEXT NOT NULL REFERENCES gk_checklists(id),
  title TEXT NOT NULL,
  every_days INTEGER CHECK (every_days IS NULL OR every_days BETWEEN 1 AND 3660),
  meter_id TEXT REFERENCES gk_meters(id),
  every_units TEXT,
  next_due_date TEXT,
  next_due_meter TEXT,
  assignee_id TEXT REFERENCES gk_members(id),
  active INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'fixed' CHECK (cadence IN ('fixed', 'completion')),
  months TEXT,
  weekdays TEXT,
  observe_closures INTEGER NOT NULL DEFAULT 1,
  max_defer_days INTEGER NOT NULL DEFAULT 14 CHECK (max_defer_days BETWEEN 0 AND 365),
  nominal_date TEXT,
  combine TEXT NOT NULL DEFAULT 'first' CHECK (combine IN ('first', 'both')),
  trigger_when TEXT CHECK (trigger_when IS NULL OR trigger_when IN ('above', 'below', 'is')),
  trigger_value TEXT,
  reset_value TEXT,
  sustain_minutes INTEGER NOT NULL DEFAULT 0 CHECK (sustain_minutes BETWEEN 0 AND 10080),
  trigger_fired_on TEXT,
  team_id TEXT REFERENCES gk_teams(id),
  estimate_minutes INTEGER CHECK (estimate_minutes IS NULL OR estimate_minutes BETWEEN 1 AND 60000),
  location TEXT,
  CHECK (every_days IS NOT NULL OR meter_id IS NOT NULL),
  CHECK ((asset_id IS NULL) <> (location IS NULL)),
  CHECK (location IS NULL OR meter_id IS NULL)
);
DROP TABLE gk_schedules;
ALTER TABLE gk_schedules_next RENAME TO gk_schedules;
INSERT INTO gk_schedules (id, asset_id, checklist_id, title, every_days, meter_id, every_units, next_due_date, next_due_meter, assignee_id, active, revision, created_by, created_at, cadence, months, weekdays, observe_closures, max_defer_days, nominal_date, combine, trigger_when, trigger_value, reset_value, sustain_minutes, trigger_fired_on, team_id, estimate_minutes)
  SELECT id, asset_id, checklist_id, title, every_days, meter_id, every_units, next_due_date, next_due_meter, assignee_id, active, revision, created_by, created_at, cadence, months, weekdays, observe_closures, max_defer_days, nominal_date, combine, trigger_when, trigger_value, reset_value, sustain_minutes, trigger_fired_on, team_id, estimate_minutes FROM gk_schedules_keep;
DROP TABLE gk_schedules_keep;
