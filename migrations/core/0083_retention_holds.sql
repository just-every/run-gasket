CREATE TABLE gk_retention_holds (
  kind TEXT NOT NULL CHECK(kind IN ('request','work')),
  record_id TEXT NOT NULL,
  held INTEGER NOT NULL CHECK(held IN (0,1)),
  reason TEXT NOT NULL,
  revision INTEGER NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  PRIMARY KEY(kind,record_id)
);
CREATE TRIGGER gk_retention_hold_guard BEFORE INSERT ON gk_guard
WHEN NEW.code='retention_hold' AND NEW.ok=0
BEGIN SELECT RAISE(ABORT,'gasket_guard_retention_hold'); END;
