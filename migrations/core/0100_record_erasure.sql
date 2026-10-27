-- Results retain opaque ids and counts, never the erased payload.
CREATE TABLE gk_record_erasure_results (
 kind TEXT NOT NULL CHECK(kind IN ('work','user')),
 record_id TEXT NOT NULL,
 result_json TEXT NOT NULL,
 erased_at INTEGER NOT NULL,
 PRIMARY KEY(kind,record_id)
);
DROP TRIGGER gk_audit_no_update;
CREATE TRIGGER gk_audit_no_update BEFORE UPDATE ON gk_audit
WHEN NOT (
 NEW.detail='{}' AND NEW.seq=OLD.seq AND NEW.at=OLD.at AND NEW.actor=OLD.actor
 AND NEW.action=OLD.action AND NEW.subject=OLD.subject AND NEW.role IS OLD.role
 AND (
  (EXISTS(SELECT 1 FROM gk_guard WHERE code='request_erasure' AND ok=1)
   AND OLD.action IN ('request.submit','request.triage','request.reply','request.convert','workorder.create','request.clock','request.escalation'))
  OR (EXISTS(SELECT 1 FROM gk_guard WHERE code='record_erasure' AND ok=1))
  OR (EXISTS(SELECT 1 FROM gk_guard WHERE code='attachment_erasure' AND ok=1)
   AND OLD.action IN ('workorder.evidence','workorder.annotate'))
 )
)
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;

-- A retained tombstone cannot regain authority through an older identity.
CREATE TRIGGER gk_erased_member_stays_ended BEFORE UPDATE ON gk_members
WHEN NEW.status<>'ended' AND EXISTS(SELECT 1 FROM gk_record_erasure_results WHERE kind='user' AND record_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_erased_operator_stays_inactive BEFORE UPDATE ON oa_operators
WHEN NEW.status<>'inactive' AND EXISTS(SELECT 1 FROM gk_members m JOIN gk_record_erasure_results r ON r.kind='user' AND r.record_id=m.id WHERE m.operator_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
