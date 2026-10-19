-- PLAN-001: work names an asset or, with no asset, a location (a restroom
-- door, a dock light). Rebuild gk_work_orders with asset_id optional and a
-- location; every row names exactly one of the two.
-- Other tables reference work orders, so the rows go back in only after the new
-- table holds the name: dropping the old table counts each reference as a
-- deferred violation, and inserting the rows back clears each one again.
PRAGMA defer_foreign_keys = true;
CREATE TABLE gk_work_orders_keep AS SELECT * FROM gk_work_orders;
CREATE TABLE gk_work_orders_next (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  asset_id TEXT REFERENCES gk_assets(id),
  kind TEXT NOT NULL CHECK (kind IN ('preventive', 'corrective')),
  schedule_id TEXT REFERENCES gk_schedules(id),
  follow_up_of TEXT,
  title TEXT NOT NULL,
  description TEXT,
  checklist_revision_id TEXT REFERENCES gk_checklist_revisions(id),
  due_date TEXT NOT NULL,
  due_meter TEXT,
  assignee_id TEXT REFERENCES gk_members(id),
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'submitted', 'returned', 'closed', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  submitted_at INTEGER,
  closed_at INTEGER,
  closed_by TEXT,
  merged_into TEXT REFERENCES gk_work_orders(id),
  acknowledged_at INTEGER,
  acknowledged_by TEXT,
  trigger_reading_id TEXT REFERENCES gk_readings(id),
  occurrence TEXT,
  overdue_since TEXT,
  team_id TEXT REFERENCES gk_teams(id),
  trade TEXT,
  shift TEXT,
  estimate_minutes INTEGER CHECK (estimate_minutes IS NULL OR estimate_minutes BETWEEN 1 AND 60000),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('emergency', 'high', 'normal', 'low')),
  template_id TEXT,
  template_revision INTEGER,
  location TEXT,
  CHECK ((asset_id IS NULL) <> (location IS NULL))
);
DROP TABLE gk_work_orders;
ALTER TABLE gk_work_orders_next RENAME TO gk_work_orders;
INSERT INTO gk_work_orders (id, number, asset_id, kind, schedule_id, follow_up_of, title, description, checklist_revision_id, due_date, due_meter, assignee_id, status, version, created_by, created_at, submitted_at, closed_at, closed_by, merged_into, acknowledged_at, acknowledged_by, trigger_reading_id, occurrence, overdue_since, team_id, trade, shift, estimate_minutes, priority, template_id, template_revision)
  SELECT id, number, asset_id, kind, schedule_id, follow_up_of, title, description, checklist_revision_id, due_date, due_meter, assignee_id, status, version, created_by, created_at, submitted_at, closed_at, closed_by, merged_into, acknowledged_at, acknowledged_by, trigger_reading_id, occurrence, overdue_since, team_id, trade, shift, estimate_minutes, priority, template_id, template_revision FROM gk_work_orders_keep ORDER BY number;
DROP TABLE gk_work_orders_keep;
CREATE INDEX gk_work_orders_asset ON gk_work_orders(asset_id, due_date);
CREATE UNIQUE INDEX gk_work_orders_one_open ON gk_work_orders(schedule_id) WHERE schedule_id IS NOT NULL AND status NOT IN ('closed', 'cancelled');
CREATE INDEX gk_work_orders_occurrence ON gk_work_orders(occurrence);
CREATE INDEX gk_work_orders_location ON gk_work_orders(location) WHERE location IS NOT NULL;

-- A finding names its work order's asset, so a finding on location work has none.
-- Nothing references findings: an ordinary rebuild, keeping the no-update trigger.
CREATE TABLE gk_findings_next (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  asset_id TEXT REFERENCES gk_assets(id),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  text TEXT NOT NULL,
  follow_up_id TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  item INTEGER,
  rule_id TEXT REFERENCES gk_failure_rules(id),
  failure_mode TEXT REFERENCES gk_codes(id),
  cause TEXT REFERENCES gk_codes(id),
  remedy TEXT REFERENCES gk_codes(id),
  risk TEXT REFERENCES gk_codes(id)
);
INSERT INTO gk_findings_next (id, work_order_id, asset_id, severity, text, follow_up_id, recorded_by, recorded_at, item, rule_id, failure_mode, cause, remedy, risk)
  SELECT id, work_order_id, asset_id, severity, text, follow_up_id, recorded_by, recorded_at, item, rule_id, failure_mode, cause, remedy, risk FROM gk_findings;
DROP TABLE gk_findings;
ALTER TABLE gk_findings_next RENAME TO gk_findings;
CREATE TRIGGER gk_findings_keep BEFORE UPDATE ON gk_findings BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
