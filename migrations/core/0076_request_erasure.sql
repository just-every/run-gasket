ALTER TABLE gk_requests ADD COLUMN erased_at INTEGER;
-- Erasure may redact private payloads, never attribution or audit structure.
DROP TRIGGER gk_audit_no_update;
CREATE TRIGGER gk_audit_no_update BEFORE UPDATE ON gk_audit
WHEN NOT (
  EXISTS(SELECT 1 FROM gk_guard WHERE code='request_erasure' AND ok=1)
  AND NEW.detail='{}'
  AND OLD.action IN ('request.submit','request.triage','request.reply','request.convert','workorder.create')
  AND NEW.seq=OLD.seq AND NEW.at=OLD.at AND NEW.actor=OLD.actor
  AND NEW.action=OLD.action AND NEW.subject=OLD.subject AND NEW.role IS OLD.role
)
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
