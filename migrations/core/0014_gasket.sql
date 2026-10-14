-- Gasket: one site, its people and roles, the asset register, parts, checklists,
-- schedules, work orders and their evidence, reviews, agent proposals and audit.
-- Append-only history is enforced here by triggers, not only by the handlers.

CREATE TABLE gk_site (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- A person with access. The owner is the Base operator with role 'owner'.
CREATE TABLE gk_members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'lead', 'maintainer', 'supervisor', 'agent')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at INTEGER NOT NULL
);

CREATE TABLE gk_assets (
  id TEXT PRIMARY KEY,
  tag TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  serial TEXT,
  location TEXT NOT NULL,
  custodian TEXT,
  category TEXT,
  criticality TEXT NOT NULL DEFAULT 'normal' CHECK (criticality IN ('normal', 'important', 'critical')),
  notes TEXT,
  retired_at INTEGER,
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  revision INTEGER NOT NULL DEFAULT 1,
  import_revision TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- import_revision holds the import kit's applied revision for rows a move-in created.

-- Every earlier version of an asset's identity, written on each edit.
CREATE TABLE gk_asset_versions (
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  revision INTEGER NOT NULL,
  value_json TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  PRIMARY KEY (asset_id, revision)
);
CREATE TRIGGER gk_asset_versions_keep BEFORE UPDATE ON gk_asset_versions BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

-- A physical sighting of an asset, to reconcile the register against the floor.
CREATE TABLE gk_sightings (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('found', 'elsewhere', 'missing')),
  seen_location TEXT,
  note TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE TRIGGER gk_sightings_keep BEFORE UPDATE ON gk_sightings BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_meters (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('counter', 'gauge', 'condition')),
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  revision INTEGER NOT NULL DEFAULT 1,
  import_revision TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (asset_id, name)
);

-- Readings are dated by when the person took them (taken_on, local date and time).
CREATE TABLE gk_readings (
  id TEXT PRIMARY KEY,
  meter_id TEXT NOT NULL REFERENCES gk_meters(id),
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  work_order_id TEXT,
  value TEXT NOT NULL,
  taken_on TEXT NOT NULL,
  entered_by TEXT NOT NULL,
  entered_at INTEGER NOT NULL,
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  import_revision TEXT
);
CREATE INDEX gk_readings_meter ON gk_readings(meter_id, taken_on);
CREATE TRIGGER gk_readings_keep BEFORE UPDATE ON gk_readings BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_readings_native_keep BEFORE DELETE ON gk_readings WHEN OLD.origin <> 'import' BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_parts (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  minimum_milli INTEGER NOT NULL DEFAULT 0 CHECK (minimum_milli >= 0),
  location TEXT,
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  revision INTEGER NOT NULL DEFAULT 1,
  import_revision TEXT,
  created_at INTEGER NOT NULL
);

-- Quantities in thousandths of the part's unit. On-hand is the sum of movements.
CREATE TABLE gk_part_moves (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  part_id TEXT NOT NULL REFERENCES gk_parts(id),
  kind TEXT NOT NULL CHECK (kind IN ('opening', 'receive', 'issue', 'return', 'count')),
  quantity_milli INTEGER NOT NULL,
  counted_milli INTEGER,
  work_order_id TEXT,
  note TEXT,
  actor TEXT NOT NULL,
  at INTEGER NOT NULL,
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import'))
);
CREATE INDEX gk_part_moves_part ON gk_part_moves(part_id, seq);
CREATE TRIGGER gk_part_moves_keep BEFORE UPDATE ON gk_part_moves BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_part_moves_native_keep BEFORE DELETE ON gk_part_moves WHEN OLD.origin <> 'import' BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_checklists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- A published revision never changes; work orders point at the revision they used.
CREATE TABLE gk_checklist_revisions (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL REFERENCES gk_checklists(id),
  number INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  note TEXT,
  published_by TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  UNIQUE (checklist_id, number)
);
CREATE TRIGGER gk_checklist_revisions_keep BEFORE UPDATE ON gk_checklist_revisions BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_schedules (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
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
  CHECK (every_days IS NOT NULL OR meter_id IS NOT NULL)
);

CREATE TABLE gk_work_orders (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
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
  closed_by TEXT
);
CREATE INDEX gk_work_orders_asset ON gk_work_orders(asset_id, due_date);
-- One open work order per schedule.
CREATE UNIQUE INDEX gk_work_orders_one_open ON gk_work_orders(schedule_id) WHERE schedule_id IS NOT NULL AND status NOT IN ('closed', 'cancelled');

-- The latest result per checklist item; the handler also appends every result to gk_result_log.
CREATE TABLE gk_results (
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  item INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'fail', 'attention')),
  note TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (work_order_id, item)
);
CREATE TABLE gk_result_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id TEXT NOT NULL,
  item INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  note TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE TRIGGER gk_result_log_keep BEFORE UPDATE ON gk_result_log BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_evidence (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  bytes BLOB NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL
);
CREATE TRIGGER gk_evidence_keep BEFORE UPDATE ON gk_evidence BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

-- Times are local site date-times (YYYY-MM-DDTHH:MM); minutes are computed when it ends.
CREATE TABLE gk_downtime (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  work_order_id TEXT REFERENCES gk_work_orders(id),
  started_on TEXT NOT NULL,
  ended_on TEXT,
  minutes INTEGER,
  reason TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX gk_downtime_one_open ON gk_downtime(asset_id) WHERE ended_on IS NULL;
CREATE TRIGGER gk_downtime_end_once BEFORE UPDATE ON gk_downtime WHEN OLD.ended_on IS NOT NULL BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_findings (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  text TEXT NOT NULL,
  follow_up_id TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE TRIGGER gk_findings_keep BEFORE UPDATE ON gk_findings BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_reviews (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  version INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'returned')),
  reason TEXT,
  reviewer TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TRIGGER gk_reviews_keep BEFORE UPDATE ON gk_reviews BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

-- Agent-prepared proposals. Approval records the exact payload hash it ran.
CREATE TABLE gk_proposals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('schedule', 'corrective', 'count')),
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  basis_json TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  prepared_by TEXT NOT NULL,
  prepared_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by TEXT,
  decided_at INTEGER,
  decision_note TEXT,
  result_id TEXT
);
CREATE TRIGGER gk_proposals_decide_once BEFORE UPDATE ON gk_proposals WHEN OLD.status <> 'pending' BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_audit (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE TRIGGER gk_audit_no_update BEFORE UPDATE ON gk_audit BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_audit_no_delete BEFORE DELETE ON gk_audit BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

-- In-batch preconditions: a row with ok <> 1 aborts the whole batch with its code.
CREATE TABLE gk_guard (code TEXT NOT NULL, ok INTEGER NOT NULL);
CREATE TRIGGER gk_guard_stale BEFORE INSERT ON gk_guard WHEN NEW.ok IS NOT 1 AND NEW.code = 'stale' BEGIN SELECT RAISE(ABORT, 'gasket_guard_stale'); END;
CREATE TRIGGER gk_guard_stock BEFORE INSERT ON gk_guard WHEN NEW.ok IS NOT 1 AND NEW.code = 'insufficient_stock' BEGIN SELECT RAISE(ABORT, 'gasket_guard_insufficient_stock'); END;
CREATE TRIGGER gk_guard_return BEFORE INSERT ON gk_guard WHEN NEW.ok IS NOT 1 AND NEW.code = 'return_exceeds_issue' BEGIN SELECT RAISE(ABORT, 'gasket_guard_return_exceeds_issue'); END;
CREATE TRIGGER gk_guard_other BEFORE INSERT ON gk_guard WHEN NEW.ok IS NOT 1 AND NEW.code NOT IN ('stale', 'insufficient_stock', 'return_exceeds_issue') BEGIN SELECT RAISE(ABORT, 'gasket_guard_failed'); END;
