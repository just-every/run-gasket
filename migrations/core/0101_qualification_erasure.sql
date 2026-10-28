-- Explicit erasure preserves safety evidence and all audit attribution.
CREATE TABLE gk_qualification_erasure_results (
 resource_id TEXT PRIMARY KEY,
 result_json TEXT NOT NULL CHECK(json_valid(result_json))
);
ALTER TABLE gk_retention_scope_holds RENAME TO gk_retention_scope_holds_old;
CREATE TABLE gk_retention_scope_holds (
 kind TEXT NOT NULL CHECK(kind IN ('attachment','user','qualification')),
 record_id TEXT NOT NULL, held INTEGER NOT NULL CHECK(held IN (0,1)),
 reason TEXT NOT NULL, revision INTEGER NOT NULL, changed_by TEXT NOT NULL, changed_at INTEGER NOT NULL,
 PRIMARY KEY(kind,record_id)
);
INSERT INTO gk_retention_scope_holds SELECT * FROM gk_retention_scope_holds_old;
DROP TABLE gk_retention_scope_holds_old;
DROP TRIGGER gk_retired_resources_delete;
CREATE TRIGGER gk_retired_resources_delete BEFORE DELETE ON gk_retired_resources
WHEN NOT (OLD.kind='qualification' AND EXISTS(SELECT 1 FROM gk_guard WHERE code='qualification_erasure' AND ok=1))
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
-- Preserve both record and qualification erasure after their independent migrations.
DROP TRIGGER gk_audit_no_update;
CREATE TRIGGER gk_audit_no_update BEFORE UPDATE ON gk_audit
WHEN NOT (
 NEW.detail='{}' AND NEW.seq=OLD.seq AND NEW.at=OLD.at AND NEW.actor=OLD.actor
 AND NEW.action=OLD.action AND NEW.subject=OLD.subject AND NEW.role IS OLD.role
 AND (
  (EXISTS(SELECT 1 FROM gk_guard WHERE code='request_erasure' AND ok=1)
   AND OLD.action IN ('request.submit','request.triage','request.reply','request.convert','workorder.create','request.clock','request.escalation'))
  OR (EXISTS(SELECT 1 FROM gk_guard WHERE code='record_erasure' AND ok=1))
  OR (EXISTS(SELECT 1 FROM gk_guard WHERE code='qualification_erasure' AND ok=1)
   AND OLD.action IN ('planning.qualification','planning.retire'))
  OR (EXISTS(SELECT 1 FROM gk_guard WHERE code='attachment_erasure' AND ok=1)
   AND OLD.action IN ('workorder.evidence','workorder.annotate'))
 )
)
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;


-- Opaque evidence identities fence delayed captures without retaining personal facts.
CREATE TABLE gk_erased_qualification_records (record_id TEXT PRIMARY KEY);
