-- BUY-006: owner-configured vendor follow-up, one claimed reminder email per
-- revision and occasion, and its PM-008 automatic job.
PRAGMA defer_foreign_keys = true;
CREATE TABLE gk_automation_rules_next (
 id TEXT PRIMARY KEY CHECK(id IN ('pm','routes','chase','expiry','replenishment','vendor')),
 revision INTEGER NOT NULL DEFAULT 1, paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
 reason TEXT NOT NULL DEFAULT '', changed_by TEXT, changed_at INTEGER NOT NULL
);
INSERT INTO gk_automation_rules_next SELECT * FROM gk_automation_rules;
DROP TABLE gk_automation_rules;
ALTER TABLE gk_automation_rules_next RENAME TO gk_automation_rules;
INSERT INTO gk_automation_rules(id,changed_at) VALUES('vendor',0);
CREATE TABLE gk_vendor_follow_rules (
 number INTEGER PRIMARY KEY CHECK(number>0),
 acknowledgment_days INTEGER NOT NULL CHECK(acknowledgment_days BETWEEN 0 AND 30),
 late_days INTEGER NOT NULL CHECK(late_days BETWEEN 1 AND 30),
 escalation_days INTEGER NOT NULL CHECK(escalation_days BETWEEN 1 AND 60),
 approved_by TEXT NOT NULL REFERENCES gk_members(id), approved_at INTEGER NOT NULL
);
CREATE TABLE gk_vendor_reminders (
 id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES gk_purchase_revisions(id),
 occasion TEXT NOT NULL CHECK(occasion IN ('acknowledgment','late')), rule_number INTEGER NOT NULL REFERENCES gk_vendor_follow_rules(number),
 day TEXT NOT NULL, recipient TEXT NOT NULL, facts TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('unconfirmed','accepted','development','rejected','rate_limited','uncertain','failed')),
 provider TEXT, provider_message_id TEXT, error TEXT, claimed_at INTEGER NOT NULL, finished_at INTEGER,
 automation_job_id TEXT NOT NULL REFERENCES gk_automation_jobs(id), automation_revision INTEGER NOT NULL,
 UNIQUE(revision_id,occasion)
);
CREATE TRIGGER gk_vendor_follow_rules_update BEFORE UPDATE ON gk_vendor_follow_rules BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_vendor_follow_rules_delete BEFORE DELETE ON gk_vendor_follow_rules BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_vendor_reminders_delete BEFORE DELETE ON gk_vendor_reminders BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
