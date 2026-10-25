-- Successful local archive operations; never inferred from staged snapshots.
CREATE TABLE gk_recovery_receipts (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('backup','restore')),
 recorded_at INTEGER NOT NULL,
 recovery_point TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 archive_hash TEXT NOT NULL,
 tables_json TEXT NOT NULL CHECK(json_valid(tables_json)),
 drill_by TEXT,
 drill_at INTEGER
);
CREATE TABLE gk_request_erasure_results (
 request_id TEXT PRIMARY KEY REFERENCES gk_requests(id),
 result_json TEXT NOT NULL CHECK(json_valid(result_json))
);
