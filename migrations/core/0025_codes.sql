-- ASSET-004: one central, ordered catalog of criticality levels and risk,
-- failure mode, cause and remedy codes. Leads add, reorder, relabel and retire
-- codes; a code's key never changes, records keep the code they were given and
-- retired codes stay readable. Import names map an imported value onto a code.
CREATE TABLE gk_codes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('criticality', 'risk', 'failure_mode', 'cause', 'remedy')),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  import_names TEXT,
  position INTEGER NOT NULL,
  retired_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (kind, key)
);
INSERT INTO gk_codes (id, kind, key, label, position, created_at) VALUES
  ('criticality:normal', 'criticality', 'normal', 'Normal', 1, 0),
  ('criticality:important', 'criticality', 'important', 'Important', 2, 0),
  ('criticality:critical', 'criticality', 'critical', 'Critical', 3, 0);

-- Asset criticality is a catalog level now, not a fixed list: rebuild gk_assets without its CHECK.
PRAGMA defer_foreign_keys = true;
CREATE TABLE gk_assets_next (
  id TEXT PRIMARY KEY,
  tag TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  serial TEXT,
  location TEXT NOT NULL,
  custodian TEXT,
  category TEXT,
  criticality TEXT NOT NULL DEFAULT 'normal',
  notes TEXT,
  retired_at INTEGER,
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  revision INTEGER NOT NULL DEFAULT 1,
  import_revision TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO gk_assets_next (id, tag, name, serial, location, custodian, category, criticality, notes, retired_at, origin, revision, import_revision, created_at, updated_at)
  SELECT id, tag, name, serial, location, custodian, category, criticality, notes, retired_at, origin, revision, import_revision, created_at, updated_at FROM gk_assets;
DROP TABLE gk_assets;
ALTER TABLE gk_assets_next RENAME TO gk_assets;

-- Findings carry codes (each optional); moved-in work history carries the failure mode its category mapped to.
ALTER TABLE gk_findings ADD COLUMN failure_mode TEXT REFERENCES gk_codes(id);
ALTER TABLE gk_findings ADD COLUMN cause TEXT REFERENCES gk_codes(id);
ALTER TABLE gk_findings ADD COLUMN remedy TEXT REFERENCES gk_codes(id);
ALTER TABLE gk_findings ADD COLUMN risk TEXT REFERENCES gk_codes(id);
ALTER TABLE gk_work_history ADD COLUMN failure_mode TEXT REFERENCES gk_codes(id);
