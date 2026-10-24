-- Saved filters are private by default. Shared filters confer no record rights.
CREATE TABLE gk_search_views (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES gk_members(id),
  name TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0 CHECK(shared IN (0,1)),
  filters_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
