-- ASSET-008: scheduled routes, required tools and calibration tasks.
-- A route may repeat every N days from its first due date; the scheduler issues
-- one run per occurrence. Routes and schedules may name the tools their work
-- needs; each issued work order lists them and the person doing it records
-- which one was used. A calibration task is a schedule on an instrument whose
-- procedure carries the tolerances (number steps with inclusive limits) and a
-- grace window in days after its due date; approving its work keeps the
-- attached certificate as the instrument's next certificate version.
ALTER TABLE gk_routes ADD COLUMN every_days INTEGER CHECK (every_days IS NULL OR every_days BETWEEN 1 AND 3660);
ALTER TABLE gk_routes ADD COLUMN next_due_date TEXT;
ALTER TABLE gk_routes ADD COLUMN assignee_id TEXT REFERENCES gk_members(id);
ALTER TABLE gk_routes ADD COLUMN tools TEXT;
ALTER TABLE gk_route_runs ADD COLUMN occurrence TEXT;
CREATE UNIQUE INDEX gk_route_runs_occurrence ON gk_route_runs(occurrence) WHERE occurrence IS NOT NULL;
ALTER TABLE gk_schedules ADD COLUMN tools TEXT;
ALTER TABLE gk_schedules ADD COLUMN calibration INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gk_schedules ADD COLUMN grace_days INTEGER CHECK (grace_days IS NULL OR grace_days BETWEEN 0 AND 90);
CREATE TABLE gk_work_tools (
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  identifier TEXT,
  recorded_by TEXT,
  recorded_at INTEGER,
  PRIMARY KEY (work_order_id, position)
);
ALTER TABLE gk_evidence ADD COLUMN certificate INTEGER NOT NULL DEFAULT 0;
CREATE TABLE gk_calibration_certificates (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES gk_schedules(id),
  version INTEGER NOT NULL,
  work_order_id TEXT NOT NULL UNIQUE REFERENCES gk_work_orders(id),
  evidence_id TEXT NOT NULL REFERENCES gk_evidence(id),
  checklist_revision_id TEXT NOT NULL REFERENCES gk_checklist_revisions(id),
  result TEXT NOT NULL CHECK (result IN ('in_tolerance', 'out_of_tolerance')),
  due_date TEXT NOT NULL,
  calibrated_on TEXT NOT NULL,
  on_time INTEGER NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  UNIQUE (schedule_id, version)
);
CREATE TRIGGER gk_calibration_certificates_keep BEFORE UPDATE ON gk_calibration_certificates BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
