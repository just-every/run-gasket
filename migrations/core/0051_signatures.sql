-- FIELD-005: before/after photos, annotations and signatures. Evidence keeps
-- its phase (before or after the work), when it was taken (site local time),
-- the door it came through and, for PNG and JPEG, its pixel size. An
-- annotation is a shape over a photo in hundredths of a percent of its width
-- and height, with a note; the original file is never changed. A signature is
-- bound to the work order's version when it was given; a change to the work
-- makes it stale and submission waits until it is given again.
ALTER TABLE gk_evidence ADD COLUMN phase TEXT CHECK (phase IS NULL OR phase IN ('before', 'after'));
ALTER TABLE gk_evidence ADD COLUMN taken_on TEXT;
ALTER TABLE gk_evidence ADD COLUMN door TEXT;
ALTER TABLE gk_evidence ADD COLUMN width INTEGER;
ALTER TABLE gk_evidence ADD COLUMN height INTEGER;
ALTER TABLE gk_work_orders ADD COLUMN submitted_version INTEGER;
CREATE TABLE gk_annotations (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES gk_evidence(id),
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  shape TEXT NOT NULL CHECK (shape IN ('box', 'ellipse', 'arrow')),
  x1 INTEGER NOT NULL CHECK (x1 BETWEEN 0 AND 10000),
  y1 INTEGER NOT NULL CHECK (y1 BETWEEN 0 AND 10000),
  x2 INTEGER NOT NULL CHECK (x2 BETWEEN 0 AND 10000),
  y2 INTEGER NOT NULL CHECK (y2 BETWEEN 0 AND 10000),
  note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TRIGGER gk_annotations_keep BEFORE UPDATE ON gk_annotations BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TABLE gk_signatures (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  version INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('technician', 'customer', 'supervisor')),
  signer_name TEXT NOT NULL,
  member_id TEXT REFERENCES gk_members(id),
  mark BLOB,
  mark_sha256 TEXT,
  door TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE TRIGGER gk_signatures_keep BEFORE UPDATE ON gk_signatures BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
