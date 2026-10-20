-- AGENT-005: questions and human promises remain attributable and append-only.
CREATE TABLE gk_agent_queries (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  work_version INTEGER NOT NULL,
  recipient_id TEXT NOT NULL REFERENCES gk_members(id),
  question TEXT NOT NULL,
  asked_by TEXT NOT NULL REFERENCES gk_members(id),
  asked_at INTEGER NOT NULL,
  UNIQUE(work_order_id, work_version, recipient_id)
);
CREATE TABLE gk_agent_answers (
  query_id TEXT PRIMARY KEY REFERENCES gk_agent_queries(id),
  next_action TEXT NOT NULL,
  promised_on TEXT NOT NULL,
  answered_by TEXT NOT NULL REFERENCES gk_members(id),
  answered_at INTEGER NOT NULL
);
CREATE TRIGGER gk_agent_queries_no_update BEFORE UPDATE ON gk_agent_queries BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_agent_answers_no_update BEFORE UPDATE ON gk_agent_answers BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_proposals_next (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('schedule', 'corrective', 'count', 'reassign')),
  payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, basis_json TEXT NOT NULL,
  reasoning TEXT NOT NULL, prepared_by TEXT NOT NULL, prepared_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by TEXT, decided_at INTEGER, decision_note TEXT, result_id TEXT
);
INSERT INTO gk_proposals_next SELECT * FROM gk_proposals;
DROP TABLE gk_proposals;
ALTER TABLE gk_proposals_next RENAME TO gk_proposals;
CREATE TRIGGER gk_proposals_decide_once BEFORE UPDATE ON gk_proposals WHEN OLD.status <> 'pending' BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

-- Preserve every existing notice and delivery authority while adding agent occasions.
CREATE TABLE gk_notices_next (
 id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, work_order_id TEXT REFERENCES gk_work_orders(id), asset_id TEXT REFERENCES gk_assets(id),
 comment_id TEXT REFERENCES gk_comments(id), part_id TEXT REFERENCES gk_parts(id), purchase_order_id TEXT REFERENCES gk_purchase_orders(id),
 kind TEXT NOT NULL CHECK(kind IN ('reminder','overdue','escalation_lead','escalation_supervisor','blocker_missed','declined','mention','expiry','replenishment','agent_query','agent_escalation')),
 occasion TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL,
 automation_job_id TEXT REFERENCES gk_automation_jobs(id), automation_revision INTEGER,
 UNIQUE(recipient_id,occasion),
 CHECK((kind='replenishment' AND part_id IS NOT NULL AND purchase_order_id IS NOT NULL AND work_order_id IS NULL AND asset_id IS NULL)
 OR (kind<>'replenishment' AND ((work_order_id IS NULL)<>(asset_id IS NULL))))
);
INSERT INTO gk_notices_next SELECT * FROM gk_notices;
DROP TABLE gk_notices;
ALTER TABLE gk_notices_next RENAME TO gk_notices;
CREATE INDEX gk_notices_recipient ON gk_notices(recipient_id,created_at);
