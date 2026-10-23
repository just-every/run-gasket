-- Operator intake is opt-in. Public identifiers are opaque and publish only a
-- deliberately supplied label; no asset register, costs or history are public.
CREATE TABLE gk_request_portals (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('authenticated','public')),
  enabled INTEGER NOT NULL DEFAULT 1, fields_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE gk_request_targets (
  id TEXT PRIMARY KEY, portal_id TEXT NOT NULL REFERENCES gk_request_portals(id),
  kind TEXT NOT NULL CHECK(kind IN ('asset','location','bin')), asset_id TEXT REFERENCES gk_assets(id),
  name TEXT NOT NULL, retired_at INTEGER, created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE gk_requests (
  id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, portal_id TEXT NOT NULL REFERENCES gk_request_portals(id),
  target_id TEXT NOT NULL REFERENCES gk_request_targets(id), asset_id TEXT REFERENCES gk_assets(id), location TEXT,
  description TEXT NOT NULL, urgency TEXT NOT NULL, contact TEXT NOT NULL, requester_id TEXT,
  answers_json TEXT NOT NULL, form_json TEXT NOT NULL, submission_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', version INTEGER NOT NULL DEFAULT 1, duplicate_of TEXT REFERENCES gk_requests(id),
  work_order_id TEXT REFERENCES gk_work_orders(id), created_at INTEGER NOT NULL,
  UNIQUE(portal_id,submission_key)
);
CREATE TABLE gk_request_files (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES gk_requests(id), field_key TEXT,
  filename TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, bytes BLOB NOT NULL
);
CREATE TABLE gk_request_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL REFERENCES gk_requests(id),
  kind TEXT NOT NULL, text TEXT NOT NULL, actor TEXT, at INTEGER NOT NULL
);
CREATE TRIGGER gk_request_events_keep BEFORE UPDATE ON gk_request_events BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_request_files_keep BEFORE UPDATE ON gk_request_files BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_request_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL);
CREATE INDEX gk_requests_queue ON gk_requests(status,created_at);
