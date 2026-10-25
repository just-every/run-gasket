-- Versioned response policy snapshots and reasoned clock transitions.
CREATE TABLE gk_request_response_policies (
  revision INTEGER PRIMARY KEY,
  urgency TEXT NOT NULL CHECK(urgency IN ('normal','high','emergency')),
  policy_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE gk_request_clocks (
  request_id TEXT PRIMARY KEY REFERENCES gk_requests(id),
  policy_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE gk_request_clock_events (
  request_id TEXT NOT NULL REFERENCES gk_requests(id),
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('pause','resume')),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY(request_id,revision)
);
CREATE TABLE gk_request_escalations (
  request_id TEXT NOT NULL REFERENCES gk_requests(id),
  kind TEXT NOT NULL CHECK(kind IN ('acknowledgment','resolution')),
  recipient_id TEXT NOT NULL REFERENCES gk_members(id),
  owner_id TEXT NOT NULL REFERENCES gk_members(id),
  created_at INTEGER NOT NULL,
  automation_job_id TEXT REFERENCES gk_automation_jobs(id),
  automation_rule_revision INTEGER,
  PRIMARY KEY(request_id,kind)
);

-- Extend the existing guarded payload erasure to the new request clock audit.
DROP TRIGGER gk_audit_no_update;
CREATE TRIGGER gk_audit_no_update BEFORE UPDATE ON gk_audit
WHEN NOT (
 EXISTS(SELECT 1 FROM gk_guard WHERE code='request_erasure' AND ok=1)
 AND NEW.detail='{}'
 AND OLD.action IN ('request.submit','request.triage','request.reply','request.convert','workorder.create','request.clock','request.escalation')
 AND NEW.seq=OLD.seq AND NEW.at=OLD.at AND NEW.actor=OLD.actor
 AND NEW.action=OLD.action AND NEW.subject=OLD.subject AND NEW.role IS OLD.role
)
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_response_policy_no_update BEFORE UPDATE ON gk_request_response_policies BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_response_policy_no_delete BEFORE DELETE ON gk_request_response_policies BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_request_clock_event_no_update BEFORE UPDATE ON gk_request_clock_events BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_request_clock_event_no_delete BEFORE DELETE ON gk_request_clock_events
WHEN NOT EXISTS(SELECT 1 FROM gk_guard WHERE code='request_erasure' AND ok=1)
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
