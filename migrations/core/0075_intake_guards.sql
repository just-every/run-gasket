-- Distinguish public-intake preconditions so a changed form/retired target is
-- never misreported as a rate limit. All guards still abort the atomic batch.
CREATE TRIGGER gk_intake_rate_guard BEFORE INSERT ON gk_guard
WHEN NEW.ok IS NOT 1 AND NEW.code='intake_rate_limited'
BEGIN SELECT RAISE(ABORT,'gasket_guard_intake_rate_limited'); END;
CREATE TRIGGER gk_intake_portal_guard BEFORE INSERT ON gk_guard
WHEN NEW.ok IS NOT 1 AND NEW.code='portal_changed'
BEGIN SELECT RAISE(ABORT,'gasket_guard_portal_changed'); END;
CREATE TRIGGER gk_intake_label_guard BEFORE INSERT ON gk_guard
WHEN NEW.ok IS NOT 1 AND NEW.code='label_retired'
BEGIN SELECT RAISE(ABORT,'gasket_guard_label_retired'); END;
