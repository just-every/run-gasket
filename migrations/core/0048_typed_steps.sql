-- FIELD-004: typed checklist steps keep the value entered (a number, text or
-- option); evidence may answer one step (a required photo); and a supervisor's
-- exception on a step, with its reason, is kept unchanged.
ALTER TABLE gk_results ADD COLUMN value TEXT;
ALTER TABLE gk_result_log ADD COLUMN value TEXT;
ALTER TABLE gk_evidence ADD COLUMN item INTEGER;
CREATE TABLE gk_step_exceptions (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  item INTEGER NOT NULL,
  reason TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  UNIQUE (work_order_id, item)
);
CREATE TRIGGER gk_step_exceptions_keep BEFORE UPDATE ON gk_step_exceptions BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
