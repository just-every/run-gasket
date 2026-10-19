-- ASSET-001: the asset and location hierarchy. Every register entry has a
-- level (building, line, machine or component) and an optional parent; an
-- entry without a parent sits directly under the site. Moves are audited
-- (asset.move) with the parents they left and joined.
ALTER TABLE gk_assets ADD COLUMN parent_id TEXT REFERENCES gk_assets(id);
ALTER TABLE gk_assets ADD COLUMN level TEXT NOT NULL DEFAULT 'machine' CHECK (level IN ('building', 'line', 'machine', 'component'));
CREATE INDEX gk_assets_parent ON gk_assets(parent_id);
