-- ASSET-004 (slice): a declared asset state with its effective time and reason.
-- Reclassifying a change appends a new entry that names the one it corrects;
-- the original entry is never rewritten. Open downtime still reads as down.
CREATE TABLE gk_asset_states (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  state TEXT NOT NULL CHECK (state IN ('in_service', 'degraded', 'down', 'out_of_service')),
  effective_on TEXT NOT NULL,
  reason TEXT NOT NULL,
  corrects TEXT REFERENCES gk_asset_states(id),
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX gk_asset_states_asset ON gk_asset_states(asset_id, effective_on);
CREATE TRIGGER gk_asset_states_keep BEFORE UPDATE ON gk_asset_states BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_asset_states_stay BEFORE DELETE ON gk_asset_states BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
