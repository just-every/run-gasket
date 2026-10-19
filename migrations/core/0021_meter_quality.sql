-- ASSET-005: every reading keeps its unit, where it came from (a person on a
-- work order or a named feed) and its quality. taken_on is the source time,
-- entered_at the receipt time. Counter resets, replacements, rollovers and
-- corrected readings are explained, append-only adjustments: the reading they
-- correct is never rewritten.
ALTER TABLE gk_readings ADD COLUMN unit TEXT;
ALTER TABLE gk_readings ADD COLUMN provenance TEXT NOT NULL DEFAULT 'manual' CHECK (provenance IN ('manual', 'feed'));
ALTER TABLE gk_readings ADD COLUMN source TEXT;
ALTER TABLE gk_readings ADD COLUMN quality TEXT NOT NULL DEFAULT 'good' CHECK (quality IN ('good', 'suspect', 'stale'));

CREATE TABLE gk_meter_adjustments (
  id TEXT PRIMARY KEY,
  meter_id TEXT NOT NULL REFERENCES gk_meters(id),
  kind TEXT NOT NULL CHECK (kind IN ('reset', 'replacement', 'rollover', 'correction')),
  effective_on TEXT NOT NULL,
  last_value TEXT,
  start_value TEXT,
  reading_id TEXT REFERENCES gk_readings(id),
  value TEXT,
  reason TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  CHECK ((kind = 'correction') = (reading_id IS NOT NULL AND value IS NOT NULL)),
  CHECK ((kind <> 'correction') = (last_value IS NOT NULL AND start_value IS NOT NULL))
);
CREATE INDEX gk_meter_adjustments_meter ON gk_meter_adjustments(meter_id, effective_on);
CREATE TRIGGER gk_meter_adjustments_keep BEFORE UPDATE ON gk_meter_adjustments BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_meter_adjustments_stay BEFORE DELETE ON gk_meter_adjustments BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
