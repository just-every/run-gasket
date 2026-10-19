-- ASSET-005: each meter's feed declares how late a reading may arrive before it
-- is kept as stale: whole hours from source time to receipt, 24 by default (a
-- daily export can declare 36). Manual readings are attested and never aged.
ALTER TABLE gk_meters ADD COLUMN feed_window_hours INTEGER NOT NULL DEFAULT 24 CHECK (feed_window_hours BETWEEN 1 AND 168);
