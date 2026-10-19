-- PLAN-002: teams, trades, shifts and accountable assignments. A team is a
-- named group of assignable people with one trade; a work order may name a
-- team, a trade and a shift. Collaborators record alongside the accountable
-- assignee; every reassignment keeps a handoff (people, shifts and a note).
-- Declined work gives each lead an in-app notice, so gk_notices takes a new kind.
CREATE TABLE gk_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  trade TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE gk_team_members (
  team_id TEXT NOT NULL REFERENCES gk_teams(id),
  member_id TEXT NOT NULL REFERENCES gk_members(id),
  added_by TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, member_id)
);

ALTER TABLE gk_work_orders ADD COLUMN team_id TEXT REFERENCES gk_teams(id);
ALTER TABLE gk_work_orders ADD COLUMN trade TEXT;
ALTER TABLE gk_work_orders ADD COLUMN shift TEXT;

CREATE TABLE gk_collaborators (
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  member_id TEXT NOT NULL REFERENCES gk_members(id),
  added_by TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  removed_by TEXT,
  removed_at INTEGER,
  PRIMARY KEY (work_order_id, member_id)
);
CREATE INDEX gk_collaborators_member ON gk_collaborators(member_id) WHERE removed_at IS NULL;

CREATE TABLE gk_handoffs (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  from_id TEXT,
  to_id TEXT,
  from_shift TEXT,
  to_shift TEXT,
  note TEXT,
  by_id TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX gk_handoffs_order ON gk_handoffs(work_order_id, at);

PRAGMA defer_foreign_keys = true;
CREATE TABLE gk_notices_next (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('reminder', 'overdue', 'escalation_lead', 'escalation_supervisor', 'blocker_missed', 'declined')),
  occasion TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (recipient_id, occasion)
);
INSERT INTO gk_notices_next SELECT id, recipient_id, work_order_id, kind, occasion, text, created_at FROM gk_notices;
DROP TABLE gk_notices;
ALTER TABLE gk_notices_next RENAME TO gk_notices;
CREATE INDEX gk_notices_recipient ON gk_notices(recipient_id, created_at);
