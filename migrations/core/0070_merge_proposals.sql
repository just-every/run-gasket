-- AGENT-006: source-bound duplicate merge proposals. Preserve AGENT-004 foreign keys.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE gk_proposals_next (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('schedule','corrective','count','reassign','interval','merge')),
 payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, basis_json TEXT NOT NULL,
 reasoning TEXT NOT NULL, prepared_by TEXT NOT NULL, prepared_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 decided_by TEXT, decided_at INTEGER, decision_note TEXT, result_id TEXT
);
INSERT INTO gk_proposals_next SELECT * FROM gk_proposals;
DROP TABLE gk_proposals;
ALTER TABLE gk_proposals_next RENAME TO gk_proposals;
CREATE TRIGGER gk_proposals_decide_once BEFORE UPDATE ON gk_proposals WHEN OLD.status <> 'pending' BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
