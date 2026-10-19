-- MIG-002 (slice): completed MaintainX work orders moved in as asset history.
-- A history row keeps its MaintainX ID, type, completion time and who completed
-- it, categories, recurrence and costs (whole cents). It is history only: it
-- never raises work, moves a schedule or enters review.
CREATE TABLE gk_work_history (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  source_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('preventive', 'corrective', 'other')),
  description TEXT,
  completed_on TEXT NOT NULL,
  completed_by TEXT,
  assigned_to TEXT,
  categories TEXT,
  recurrence TEXT,
  parts_cents INTEGER,
  labor_cents INTEGER,
  other_cents INTEGER,
  origin TEXT NOT NULL DEFAULT 'import' CHECK (origin = 'import'),
  import_revision TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX gk_work_history_asset ON gk_work_history(asset_id, completed_on);
