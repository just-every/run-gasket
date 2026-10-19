-- PM-003: a calendar schedule's policy (fixed or completion cadence, allowed
-- months and ISO weekdays, whether site closures move it, how far it may be
-- deferred), the nominal cadence date before the calendar moved it, the site's
-- closed days (holidays and shutdown windows, inclusive), and each skip or
-- deferral request with its independent decision, kept for good.
ALTER TABLE gk_schedules ADD COLUMN cadence TEXT NOT NULL DEFAULT 'fixed' CHECK (cadence IN ('fixed', 'completion'));
ALTER TABLE gk_schedules ADD COLUMN months TEXT;
ALTER TABLE gk_schedules ADD COLUMN weekdays TEXT;
ALTER TABLE gk_schedules ADD COLUMN observe_closures INTEGER NOT NULL DEFAULT 1;
ALTER TABLE gk_schedules ADD COLUMN max_defer_days INTEGER NOT NULL DEFAULT 14 CHECK (max_defer_days BETWEEN 0 AND 365);
ALTER TABLE gk_schedules ADD COLUMN nominal_date TEXT;
UPDATE gk_schedules SET nominal_date = next_due_date;

CREATE TABLE gk_closures (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('holiday', 'shutdown')),
  label TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (starts_on <= ends_on)
);

CREATE TABLE gk_schedule_exceptions (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES gk_schedules(id),
  kind TEXT NOT NULL CHECK (kind IN ('skip', 'defer')),
  occurrence TEXT NOT NULL,
  until TEXT,
  reason TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  decision TEXT CHECK (decision IN ('approved', 'rejected')),
  decided_by TEXT,
  decided_at INTEGER,
  note TEXT,
  CHECK ((kind = 'defer') = (until IS NOT NULL))
);
CREATE UNIQUE INDEX gk_schedule_exceptions_pending ON gk_schedule_exceptions(schedule_id) WHERE decision IS NULL;
CREATE TRIGGER gk_schedule_exceptions_decided BEFORE UPDATE ON gk_schedule_exceptions WHEN OLD.decision IS NOT NULL BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_schedule_exceptions_stay BEFORE DELETE ON gk_schedule_exceptions BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
