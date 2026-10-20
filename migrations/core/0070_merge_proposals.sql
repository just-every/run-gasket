-- AGENT-006: add merge proposals without replacing AGENT-004's referenced parent.
CREATE TABLE gk_merge_proposals (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind='merge'),
 payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, basis_json TEXT NOT NULL,
 reasoning TEXT NOT NULL, prepared_by TEXT NOT NULL, prepared_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 decided_by TEXT, decided_at INTEGER, decision_note TEXT, result_id TEXT
);
CREATE TRIGGER gk_merge_proposals_decide_once BEFORE UPDATE ON gk_merge_proposals WHEN OLD.status <> 'pending' BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE VIEW gk_all_proposals AS SELECT * FROM gk_proposals UNION ALL SELECT * FROM gk_merge_proposals;
