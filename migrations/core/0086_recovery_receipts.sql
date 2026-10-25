-- Successful local archive operations; never inferred from staged snapshots.
CREATE TABLE gk_recovery_receipts (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('backup','restore')),
 recorded_at INTEGER NOT NULL,
 recovery_point TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 archive_hash TEXT NOT NULL,
 tables_json TEXT NOT NULL CHECK(json_valid(tables_json)),
 drill_by TEXT,
 drill_at INTEGER
);
CREATE TABLE gk_request_erasure_results (
 request_id TEXT PRIMARY KEY REFERENCES gk_requests(id),
 result_json TEXT NOT NULL CHECK(json_valid(result_json))
);

CREATE TABLE gk_attachment_erasure_results (
 evidence_id TEXT PRIMARY KEY,
 work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
 result_json TEXT NOT NULL CHECK(json_valid(result_json))
);
-- Only the explicit owner erasure batch may anonymize attachment audit details.
DROP TRIGGER gk_audit_no_update;
CREATE TRIGGER gk_audit_no_update BEFORE UPDATE ON gk_audit
WHEN NOT (
 NEW.detail='{}' AND NEW.seq=OLD.seq AND NEW.at=OLD.at AND NEW.actor=OLD.actor
 AND NEW.action=OLD.action AND NEW.subject=OLD.subject AND NEW.role IS OLD.role
 AND (
  (EXISTS(SELECT 1 FROM gk_guard WHERE code='request_erasure' AND ok=1)
   AND OLD.action IN ('request.submit','request.triage','request.reply','request.convert','workorder.create','request.clock','request.escalation'))
  OR (EXISTS(SELECT 1 FROM gk_guard WHERE code='attachment_erasure' AND ok=1)
   AND OLD.action IN ('workorder.evidence','workorder.annotate'))
 )
)
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
