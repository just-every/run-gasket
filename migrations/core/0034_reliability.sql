-- REPORT-003: every stop (downtime on a work order) is either a planned stop or
-- a failure, optionally with a failure mode code, as recorded when the asset
-- went down. A lead corrects that classification by appending an entry with a
-- reason; the stop and every earlier classification stay as they were, and the
-- latest entry is the one the reliability report uses.
ALTER TABLE gk_downtime ADD COLUMN planned INTEGER NOT NULL DEFAULT 0 CHECK (planned IN (0, 1));
ALTER TABLE gk_downtime ADD COLUMN failure_mode TEXT REFERENCES gk_codes(id);

CREATE TABLE gk_downtime_classes (
  id TEXT PRIMARY KEY,
  downtime_id TEXT NOT NULL REFERENCES gk_downtime(id),
  planned INTEGER NOT NULL CHECK (planned IN (0, 1)),
  failure_mode TEXT REFERENCES gk_codes(id),
  reason TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  CHECK (planned = 0 OR failure_mode IS NULL)
);
CREATE INDEX gk_downtime_classes_stop ON gk_downtime_classes(downtime_id, recorded_at);
CREATE TRIGGER gk_downtime_classes_keep BEFORE UPDATE ON gk_downtime_classes BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_downtime_classes_stay BEFORE DELETE ON gk_downtime_classes BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
