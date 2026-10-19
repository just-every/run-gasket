-- REPORT-002: degraded operation is recorded like downtime but the asset keeps
-- running at reduced output; it is not a stop. The site's weekly production
-- hours are the windows availability is measured over (none declared: every
-- hour of every day).
ALTER TABLE gk_downtime ADD COLUMN degraded INTEGER NOT NULL DEFAULT 0 CHECK (degraded IN (0, 1));

CREATE TABLE gk_production_hours (
  id TEXT PRIMARY KEY,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  starts TEXT NOT NULL,
  ends TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (starts < ends)
);
CREATE INDEX gk_production_hours_day ON gk_production_hours(weekday, starts);
