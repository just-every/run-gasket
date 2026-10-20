-- Catalog review is read-only; applied source and undo evidence remain retained.
CREATE TABLE gk_catalog_imports (
 id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES gk_suppliers(id),
 digest TEXT NOT NULL, fingerprint TEXT NOT NULL, filename TEXT NOT NULL, source_bytes BLOB NOT NULL,
 scope_json TEXT NOT NULL, before_snapshot TEXT NOT NULL, after_snapshot TEXT NOT NULL,
 result_json TEXT NOT NULL, applied_by TEXT NOT NULL, applied_at INTEGER NOT NULL,
 undone_by TEXT, undone_at INTEGER,
 UNIQUE(supplier_id,digest,fingerprint)
);
CREATE TRIGGER gk_catalog_import_source_keep BEFORE UPDATE ON gk_catalog_imports
 WHEN NEW.id IS NOT OLD.id OR NEW.supplier_id IS NOT OLD.supplier_id OR NEW.digest IS NOT OLD.digest
 OR NEW.fingerprint IS NOT OLD.fingerprint OR NEW.filename IS NOT OLD.filename OR NEW.source_bytes IS NOT OLD.source_bytes
 OR NEW.scope_json IS NOT OLD.scope_json OR NEW.before_snapshot IS NOT OLD.before_snapshot OR NEW.after_snapshot IS NOT OLD.after_snapshot
 OR NEW.result_json IS NOT OLD.result_json OR NEW.applied_by IS NOT OLD.applied_by OR NEW.applied_at IS NOT OLD.applied_at
 OR OLD.undone_at IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_catalog_import_delete BEFORE DELETE ON gk_catalog_imports BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
