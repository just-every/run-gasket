ALTER TABLE gk_parts ADD COLUMN category TEXT;
CREATE TABLE gk_custom_fields (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, entity_type TEXT NOT NULL CHECK(entity_type IN ('asset','part','location')),
 type TEXT NOT NULL CHECK(type IN ('text','number','single','multiple','date','boolean','link')),
 scope TEXT NOT NULL CHECK(scope IN ('organization','site','category')), category TEXT,
 required INTEGER NOT NULL DEFAULT 0, options TEXT, unit TEXT, minimum REAL, maximum REAL,
 retired INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE gk_custom_values (
 entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, field_id TEXT NOT NULL REFERENCES gk_custom_fields(id), value TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, changed_by TEXT NOT NULL, changed_at INTEGER NOT NULL,
 PRIMARY KEY(entity_type,entity_id,field_id)
);
CREATE TABLE gk_custom_history (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 field_id TEXT NOT NULL REFERENCES gk_custom_fields(id), value TEXT NOT NULL, revision INTEGER NOT NULL,
 changed_by TEXT NOT NULL, changed_at INTEGER NOT NULL
);
CREATE INDEX gk_custom_history_record ON gk_custom_history(entity_type,entity_id,seq);
