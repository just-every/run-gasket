-- PLAN-001 (slice): custom work fields, required on every work order or by a
-- template, and waiting statuses whose definition names who may use them.
CREATE TABLE gk_work_fields (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'number', 'choice')),
  options TEXT,
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
  position INTEGER NOT NULL,
  retired_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE gk_work_field_values (
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  field_id TEXT NOT NULL REFERENCES gk_work_fields(id),
  value TEXT NOT NULL,
  set_by TEXT NOT NULL,
  set_at INTEGER NOT NULL,
  PRIMARY KEY (work_order_id, field_id)
);
-- A template requires fields (a JSON list of field ids) and evidence; work made
-- from it keeps the requirements of that revision.
ALTER TABLE gk_work_templates ADD COLUMN required_fields TEXT;
ALTER TABLE gk_work_templates ADD COLUMN requires_evidence INTEGER NOT NULL DEFAULT 0 CHECK (requires_evidence IN (0, 1));
ALTER TABLE gk_work_orders ADD COLUMN required_fields TEXT;
ALTER TABLE gk_work_orders ADD COLUMN requires_evidence INTEGER NOT NULL DEFAULT 0 CHECK (requires_evidence IN (0, 1));

CREATE TABLE gk_work_statuses (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE COLLATE NOCASE,
  roles TEXT NOT NULL,
  retired_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
ALTER TABLE gk_work_orders ADD COLUMN waiting_status TEXT REFERENCES gk_work_statuses(id);
