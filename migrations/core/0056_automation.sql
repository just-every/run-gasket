-- PM-008: installation-owned automation controls and durable job evidence.
CREATE TABLE gk_automation_rules (
  id TEXT PRIMARY KEY CHECK (id IN ('pm','routes','chase','expiry')),
  revision INTEGER NOT NULL DEFAULT 1,
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0,1)),
  reason TEXT NOT NULL DEFAULT '',
  changed_by TEXT,
  changed_at INTEGER NOT NULL
);
INSERT INTO gk_automation_rules (id,changed_at) VALUES ('pm',0),('routes',0),('chase',0),('expiry',0);
CREATE TABLE gk_automation_jobs (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES gk_automation_rules(id),
  rule_revision INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('cron','catchup','reading')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  state TEXT NOT NULL CHECK (state IN ('running','completed','failed','paused')),
  input TEXT NOT NULL,
  output TEXT,
  error TEXT
);
CREATE INDEX gk_automation_jobs_rule ON gk_automation_jobs(rule_id,started_at);
ALTER TABLE gk_scheduler_runs ADD COLUMN state TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE gk_scheduler_runs ADD COLUMN error TEXT;
ALTER TABLE gk_notices ADD COLUMN automation_job_id TEXT REFERENCES gk_automation_jobs(id);
ALTER TABLE gk_notices ADD COLUMN automation_revision INTEGER;
CREATE TRIGGER gk_automation_authority_guard BEFORE INSERT ON gk_guard
WHEN NEW.code = 'automation_changed' AND NEW.ok = 0
BEGIN SELECT RAISE(ABORT, 'gasket_guard_automation_changed'); END;
