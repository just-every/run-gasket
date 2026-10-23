-- Membership authority follows the account; email is contact information.
ALTER TABLE gk_members ADD COLUMN operator_id TEXT REFERENCES oa_operators(id);
CREATE UNIQUE INDEX gk_members_operator ON gk_members(operator_id);
UPDATE gk_members SET operator_id = (
  SELECT o.id FROM oa_operators o WHERE lower(o.email) = gk_members.email
  AND (gk_members.role <> 'owner' OR o.role = 'owner')
);

CREATE TRIGGER gk_member_identity_fixed BEFORE UPDATE OF operator_id ON gk_members
WHEN OLD.operator_id IS NOT NULL AND NEW.operator_id IS NOT OLD.operator_id
BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TRIGGER gk_member_contact AFTER UPDATE OF email ON oa_operators
BEGIN
  UPDATE gk_members SET email = lower(NEW.email) WHERE operator_id = NEW.id;
END;
