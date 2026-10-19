-- ASSET-006: each asset's bill of materials, kept as numbered revisions that
-- are never rewritten (a change is a new revision). A line names a part, the
-- quantity a repair needs and an optional serial range it fits; each line may
-- name approved alternate parts, each with its own optional serial range. A
-- revision also lists the tools the work needs.
CREATE TABLE gk_bom_revisions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  number INTEGER NOT NULL,
  tools TEXT,
  note TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (asset_id, number)
);

CREATE TABLE gk_bom_lines (
  revision_id TEXT NOT NULL REFERENCES gk_bom_revisions(id),
  position INTEGER NOT NULL,
  part_id TEXT NOT NULL REFERENCES gk_parts(id),
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
  serial_from TEXT,
  serial_to TEXT,
  PRIMARY KEY (revision_id, part_id)
);

CREATE TABLE gk_bom_alternates (
  revision_id TEXT NOT NULL REFERENCES gk_bom_revisions(id),
  part_id TEXT NOT NULL REFERENCES gk_parts(id),
  alternate_id TEXT NOT NULL REFERENCES gk_parts(id),
  position INTEGER NOT NULL,
  serial_from TEXT,
  serial_to TEXT,
  PRIMARY KEY (revision_id, part_id, alternate_id),
  CHECK (part_id <> alternate_id)
);

CREATE TRIGGER gk_bom_revisions_keep BEFORE UPDATE ON gk_bom_revisions BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_bom_lines_keep BEFORE UPDATE ON gk_bom_lines BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_bom_alternates_keep BEFORE UPDATE ON gk_bom_alternates BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
