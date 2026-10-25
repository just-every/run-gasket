-- Site-local no-code rules. Each pointer names an immutable numbered grant.
CREATE TABLE gk_rules (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES gk_members(id), revision INTEGER NOT NULL,
 paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1)), changed_at INTEGER NOT NULL
);
CREATE TABLE gk_rule_revisions (
 rule_id TEXT NOT NULL REFERENCES gk_rules(id), revision INTEGER NOT NULL, definition TEXT NOT NULL,
 paused INTEGER NOT NULL CHECK(paused IN (0,1)), reason TEXT NOT NULL, actor TEXT NOT NULL, at INTEGER NOT NULL,
 PRIMARY KEY(rule_id,revision)
);
CREATE TABLE gk_rule_events (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL UNIQUE, trigger TEXT NOT NULL, entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL, source TEXT NOT NULL, occurred_at INTEGER NOT NULL, input TEXT NOT NULL,
 parent_id TEXT REFERENCES gk_rule_events(id), depth INTEGER NOT NULL DEFAULT 0,
 completed_at INTEGER, error TEXT
);
CREATE TABLE gk_rule_runs (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES gk_rule_events(id), rule_id TEXT NOT NULL REFERENCES gk_rules(id),
 revision INTEGER NOT NULL, source TEXT NOT NULL, input TEXT NOT NULL, started_at INTEGER NOT NULL,
 finished_at INTEGER, outcome TEXT NOT NULL, error TEXT, conflicts TEXT NOT NULL DEFAULT '[]',
 UNIQUE(event_id,rule_id,revision)
);
CREATE TABLE gk_rule_actions (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES gk_rule_runs(id), position INTEGER NOT NULL,
 rule_id TEXT NOT NULL, revision INTEGER NOT NULL, input TEXT NOT NULL, output TEXT NOT NULL,
 at INTEGER NOT NULL, UNIQUE(run_id,position)
);
ALTER TABLE gk_requests ADD COLUMN team_id TEXT REFERENCES gk_teams(id);
ALTER TABLE gk_requests ADD COLUMN assignee_id TEXT REFERENCES gk_members(id);
ALTER TABLE gk_requests ADD COLUMN due_date TEXT;
CREATE INDEX gk_rule_events_recent ON gk_rule_events(occurred_at DESC);
CREATE INDEX gk_rule_runs_recent ON gk_rule_runs(started_at DESC);
CREATE TRIGGER gk_rule_revision_no_update BEFORE UPDATE ON gk_rule_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_rule_revision_no_delete BEFORE DELETE ON gk_rule_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_rule_action_no_update BEFORE UPDATE ON gk_rule_actions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_rule_action_no_delete BEFORE DELETE ON gk_rule_actions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_rule_notices (
 id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES gk_members(id), request_id TEXT REFERENCES gk_requests(id),
 part_id TEXT REFERENCES gk_parts(id), text TEXT NOT NULL, created_at INTEGER NOT NULL,
 rule_id TEXT NOT NULL, revision INTEGER NOT NULL, action_id TEXT NOT NULL REFERENCES gk_rule_actions(id)
);
