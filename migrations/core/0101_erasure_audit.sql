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
