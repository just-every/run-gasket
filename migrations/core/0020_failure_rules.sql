-- PM-004: a lead-approved rule per checklist names which results raise a
-- correction, with its severity and deadline. A new rule appends a numbered
-- revision; the finding it raised names the rule it used. A correction's
-- assignee acknowledges it before it can be submitted.
CREATE TABLE gk_failure_rules (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL REFERENCES gk_checklists(id),
  number INTEGER NOT NULL,
  outcomes TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  due_days INTEGER NOT NULL,
  active INTEGER NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  UNIQUE (checklist_id, number)
);
CREATE TRIGGER gk_failure_rules_keep BEFORE UPDATE ON gk_failure_rules BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
ALTER TABLE gk_findings ADD COLUMN rule_id TEXT REFERENCES gk_failure_rules(id);
ALTER TABLE gk_work_orders ADD COLUMN acknowledged_at INTEGER;
ALTER TABLE gk_work_orders ADD COLUMN acknowledged_by TEXT;
