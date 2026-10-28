-- Printed identifiers confer no authority; all retrieval and capture uses live human work authority.
CREATE TABLE gk_print_packs (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  work_version INTEGER NOT NULL,
  checklist_revision_id TEXT NOT NULL REFERENCES gk_checklist_revisions(id),
  issued_by TEXT NOT NULL REFERENCES gk_members(id),
  issued_at INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  pdf_bytes BLOB NOT NULL,
  pdf_sha256 TEXT NOT NULL
);
CREATE TABLE gk_print_previews (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES gk_print_packs(id),
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  entrant_id TEXT NOT NULL REFERENCES gk_members(id),
  submission_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  original_name TEXT NOT NULL,
  original_type TEXT NOT NULL,
  original_bytes BLOB NOT NULL,
  original_sha256 TEXT NOT NULL,
  performed_on TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(entrant_id, submission_key)
);
CREATE TABLE gk_print_entries (
  id TEXT PRIMARY KEY REFERENCES gk_print_previews(id),
  pack_id TEXT NOT NULL REFERENCES gk_print_packs(id),
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  entrant_id TEXT NOT NULL REFERENCES gk_members(id),
  evidence_id TEXT NOT NULL REFERENCES gk_evidence(id),
  accepted_version INTEGER NOT NULL,
  accepted_at INTEGER NOT NULL,
  receipt_json TEXT NOT NULL
);
CREATE INDEX gk_print_packs_work ON gk_print_packs(work_order_id);
CREATE INDEX gk_print_previews_work ON gk_print_previews(work_order_id);
CREATE TRIGGER gk_print_packs_no_update BEFORE UPDATE ON gk_print_packs BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_print_packs_no_delete BEFORE DELETE ON gk_print_packs BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_print_previews_no_update BEFORE UPDATE ON gk_print_previews BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_print_previews_no_delete BEFORE DELETE ON gk_print_previews BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_print_entries_no_update BEFORE UPDATE ON gk_print_entries BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_print_entries_no_delete BEFORE DELETE ON gk_print_entries BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
