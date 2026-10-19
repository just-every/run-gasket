-- PART-002: parts reservations, repair kits and approved substitutes. A lead
-- approves one part as a substitute for another (one direction) and keeps
-- repair kits (fixed lines of parts and quantities). A planner reserves a part,
-- or a kit's lines, to open work; a work order holds at most one open
-- reservation per part. A reservation ends when a planner releases it or its
-- work order is cancelled, merged away or approved and closed; nothing is
-- deleted. Physical issue stays a separate movement in gk_part_moves.
CREATE TABLE gk_part_substitutes (
  part_id TEXT NOT NULL REFERENCES gk_parts(id),
  substitute_id TEXT NOT NULL REFERENCES gk_parts(id),
  reason TEXT,
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  withdrawn_by TEXT,
  withdrawn_at INTEGER,
  PRIMARY KEY (part_id, substitute_id),
  CHECK (part_id <> substitute_id)
);

CREATE TABLE gk_kits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE gk_kit_lines (
  kit_id TEXT NOT NULL REFERENCES gk_kits(id),
  part_id TEXT NOT NULL REFERENCES gk_parts(id),
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
  PRIMARY KEY (kit_id, part_id)
);
CREATE TRIGGER gk_kit_lines_keep BEFORE UPDATE ON gk_kit_lines BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_reservations (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  part_id TEXT NOT NULL REFERENCES gk_parts(id),
  requested_part_id TEXT NOT NULL REFERENCES gk_parts(id),
  kit_id TEXT REFERENCES gk_kits(id),
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
  reserved_by TEXT NOT NULL,
  reserved_at INTEGER NOT NULL,
  released_by TEXT,
  released_at INTEGER,
  release_reason TEXT
);
CREATE UNIQUE INDEX gk_reservations_one_open ON gk_reservations(work_order_id, part_id) WHERE released_at IS NULL;
CREATE INDEX gk_reservations_part ON gk_reservations(part_id) WHERE released_at IS NULL;
