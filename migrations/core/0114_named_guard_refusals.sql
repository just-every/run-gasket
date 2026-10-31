-- Specific refusals must not depend on SQLite trigger execution order.
-- A temporary guard rejects every false condition during replacement.
CREATE TRIGGER gk_guard_refusal_repair BEFORE INSERT ON gk_guard
WHEN NEW.ok IS NOT 1
BEGIN SELECT RAISE(ABORT,'gasket_guard_failed'); END;
DROP TRIGGER gk_guard_other;
-- Ordinary boolean failures use their existing specific guards. Unregistered
-- codes and malformed flags still abort through the generic guard.
CREATE TRIGGER gk_guard_other BEFORE INSERT ON gk_guard
WHEN NEW.ok IS NOT 1 AND (NEW.ok IS NOT 0 OR NEW.code NOT IN (
  'stale',
  'insufficient_stock',
  'return_exceeds_issue',
  'supplier_inactive',
  'automation_changed',
  'intake_rate_limited',
  'portal_changed',
  'label_retired',
  'retention_hold',
  'dependencies_blocked',
  'dependency_cycle'
))
BEGIN SELECT RAISE(ABORT,'gasket_guard_failed'); END;
DROP TRIGGER gk_guard_refusal_repair;
