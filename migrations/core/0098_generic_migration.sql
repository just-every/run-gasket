-- Source custody complements the kit journal; native state is read from the
-- ordinary register and work tables, never substituted by this record.
CREATE TABLE gk_spreadsheet_rows (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, source_id TEXT NOT NULL,
 source_json TEXT NOT NULL, import_revision TEXT NOT NULL,
 UNIQUE(kind,source_id)
);
ALTER TABLE gk_work_history ADD COLUMN source_system TEXT NOT NULL DEFAULT 'MaintainX';
ALTER TABLE gk_work_history ADD COLUMN details_json TEXT;
