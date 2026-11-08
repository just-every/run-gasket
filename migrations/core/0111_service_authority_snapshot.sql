-- Preserve the authority that authorized the batch before a self-demotion.
ALTER TABLE gk_authority_actor ADD COLUMN role TEXT;

DROP TRIGGER gk_service_invalidation_audit;
CREATE TRIGGER gk_service_invalidation_audit AFTER UPDATE OF revoked_at ON gk_api_credentials
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
  AND EXISTS(SELECT 1 FROM gk_authority_actor WHERE action IN ('operator.role','operator.status','access.role','access.end'))
BEGIN
  INSERT INTO gk_audit(at,actor,role,action,subject,detail)
  SELECT a.at,a.actor,a.role,'service.invalidate',NEW.id,
    json_object('credential',NEW.id,'issuingOwner',NEW.member_id,'cause',a.action)
  FROM gk_authority_actor a;
END;
