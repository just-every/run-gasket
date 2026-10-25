-- Minimum retention never schedules deletion; explicit owner erasure is still required.
CREATE TABLE gk_retention_policies (
 kind TEXT PRIMARY KEY CHECK(kind IN ('attachments','request_contacts','users','maintenance_records')),
 minimum_days INTEGER NOT NULL CHECK(minimum_days BETWEEN 0 AND 36500),
 revision INTEGER NOT NULL,
 changed_by TEXT NOT NULL,
 changed_at INTEGER NOT NULL
);
CREATE TABLE gk_retention_scope_holds (
 kind TEXT NOT NULL CHECK(kind IN ('attachment','user')),
 record_id TEXT NOT NULL,
 held INTEGER NOT NULL CHECK(held IN (0,1)),
 reason TEXT NOT NULL,
 revision INTEGER NOT NULL,
 changed_by TEXT NOT NULL,
 changed_at INTEGER NOT NULL,
 PRIMARY KEY(kind,record_id)
);
