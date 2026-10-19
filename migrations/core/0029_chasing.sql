-- PM-006: chasing overdue work. The site's chase rule (appended revisions),
-- in-app notices (one per recipient and occasion), the assignee's responses,
-- blockers with an owner, next action and promised date, and the day a work
-- order first became overdue, which no reassignment or reschedule resets.
CREATE TABLE gk_chase_rules (
  number INTEGER PRIMARY KEY,
  remind_before_days INTEGER NOT NULL CHECK (remind_before_days BETWEEN 0 AND 30),
  response_within_days INTEGER NOT NULL CHECK (response_within_days BETWEEN 0 AND 30),
  lead_after_days INTEGER NOT NULL CHECK (lead_after_days BETWEEN 0 AND 90),
  supervisor_after_days INTEGER NOT NULL CHECK (supervisor_after_days BETWEEN 0 AND 180),
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL
);

CREATE TABLE gk_notices (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('reminder', 'overdue', 'escalation_lead', 'escalation_supervisor', 'blocker_missed')),
  occasion TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (recipient_id, occasion)
);
CREATE INDEX gk_notices_recipient ON gk_notices(recipient_id, created_at);

CREATE TABLE gk_chase_responses (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  response TEXT NOT NULL CHECK (response IN ('on_it', 'blocked')),
  note TEXT,
  member_id TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE gk_blockers (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('parts', 'access', 'skill', 'production')),
  owner_id TEXT NOT NULL,
  next_action TEXT NOT NULL,
  promised_on TEXT NOT NULL,
  raised_by TEXT NOT NULL,
  raised_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT,
  resolution TEXT
);
ALTER TABLE gk_work_orders ADD COLUMN overdue_since TEXT;
