CREATE TABLE gk_report_schedules (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES gk_members(id), name TEXT NOT NULL,
 report TEXT NOT NULL, filters_json TEXT NOT NULL, recipients_json TEXT NOT NULL,
 weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6), clock TEXT NOT NULL,
 zone TEXT NOT NULL, next_day TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 paused INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE gk_report_deliveries (
 id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL REFERENCES gk_report_schedules(id),
 revision INTEGER NOT NULL, occasion TEXT NOT NULL, recipient_id TEXT NOT NULL REFERENCES gk_members(id),
 state TEXT NOT NULL, error TEXT, claimed_at INTEGER NOT NULL, finished_at INTEGER,
 provider TEXT, provider_message_id TEXT, fingerprint TEXT, scope_json TEXT,
 UNIQUE(schedule_id,occasion,recipient_id)
);
