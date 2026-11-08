-- Only a live mutation batch supplies this context; no authority survives it.
CREATE TABLE gk_authority_actor (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TRIGGER gk_service_invalidation_audit AFTER UPDATE OF revoked_at ON gk_api_credentials
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
  AND EXISTS(SELECT 1 FROM gk_authority_actor WHERE action IN ('operator.role','operator.status','access.role','access.end'))
BEGIN
  INSERT INTO gk_audit(at,actor,role,action,subject,detail)
  SELECT a.at,a.actor,
    (SELECT CASE WHEN o.role='owner' THEN 'owner' ELSE m.role END
      FROM gk_members m LEFT JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=a.actor),
    'service.invalidate',NEW.id,
    json_object('credential',NEW.id,'issuingOwner',NEW.member_id,'cause',a.action)
  FROM gk_authority_actor a;
END;
