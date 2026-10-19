-- REPORT-009: retain the reviewed omissions alongside each applied import.
CREATE TABLE gk_import_quality (
 job_id TEXT PRIMARY KEY REFERENCES ik_jobs(id),
 reviewed_json TEXT NOT NULL, recorded_at INTEGER NOT NULL
);
CREATE TRIGGER gk_import_quality_immutable_update BEFORE UPDATE ON gk_import_quality BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_import_quality_immutable_delete BEFORE DELETE ON gk_import_quality BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
