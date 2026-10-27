-- Owner authority loss permanently revokes the affected service credentials.
-- Reinstatement requires deliberate replacement issuance, never bearer revival.
CREATE TRIGGER gk_service_operator_authority AFTER UPDATE OF role,status ON oa_operators
WHEN (OLD.role = 'owner' AND NEW.role <> 'owner') OR (OLD.status = 'active' AND NEW.status <> 'active')
BEGIN
  UPDATE gk_api_credentials SET revoked_at = COALESCE(revoked_at, CAST(strftime('%s','now') AS INTEGER) * 1000)
  WHERE member_id IN (SELECT id FROM gk_members WHERE operator_id = NEW.id);
END;

CREATE TRIGGER gk_service_member_authority AFTER UPDATE OF role,status ON gk_members
WHEN (OLD.role = 'owner' AND NEW.role <> 'owner') OR (OLD.status = 'active' AND NEW.status <> 'active')
BEGIN
  UPDATE gk_api_credentials SET revoked_at = COALESCE(revoked_at, CAST(strftime('%s','now') AS INTEGER) * 1000)
  WHERE member_id = NEW.id;
END;
