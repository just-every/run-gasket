-- ADMIN-006: each audit entry keeps the role its actor held when it was written,
-- so the authority it names does not change when the person's role changes later.
ALTER TABLE gk_audit ADD COLUMN role TEXT;
