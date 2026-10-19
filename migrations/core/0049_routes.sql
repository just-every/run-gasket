-- ASSET-008: multi-asset inspection routes. A route is an ordered list of
-- stops, each an asset and the checklist done there. Issuing a route makes a
-- run with one work order per stop, pinned to that checklist's current
-- revision. A missed stop keeps its reason and stays open; a run is signed off
-- only once every stop is closed.
CREATE TABLE gk_routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE gk_route_stops (
  route_id TEXT NOT NULL REFERENCES gk_routes(id),
  position INTEGER NOT NULL,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  checklist_id TEXT NOT NULL REFERENCES gk_checklists(id),
  PRIMARY KEY (route_id, position)
);
CREATE TABLE gk_route_runs (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES gk_routes(id),
  due_date TEXT NOT NULL,
  issued_by TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  signed_by TEXT,
  signed_at INTEGER
);
ALTER TABLE gk_work_orders ADD COLUMN route_run_id TEXT REFERENCES gk_route_runs(id);
ALTER TABLE gk_work_orders ADD COLUMN route_position INTEGER;
ALTER TABLE gk_work_orders ADD COLUMN missed_reason TEXT;
ALTER TABLE gk_work_orders ADD COLUMN missed_by TEXT;
ALTER TABLE gk_work_orders ADD COLUMN missed_at INTEGER;
