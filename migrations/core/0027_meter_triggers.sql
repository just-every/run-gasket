-- PM-002: a schedule on a gauge or condition meter fires on its trigger
-- (above or below a threshold, or in chosen conditions, sustained for some
-- minutes) and re-arms past its reset value; trigger_fired_on is the source
-- time of the reading that last fired it. A schedule with a calendar and a
-- meter is due on whichever comes first, or only when both are due. Work a
-- trigger raised names the reading that raised it.
ALTER TABLE gk_schedules ADD COLUMN combine TEXT NOT NULL DEFAULT 'first' CHECK (combine IN ('first', 'both'));
ALTER TABLE gk_schedules ADD COLUMN trigger_when TEXT CHECK (trigger_when IS NULL OR trigger_when IN ('above', 'below', 'is'));
ALTER TABLE gk_schedules ADD COLUMN trigger_value TEXT;
ALTER TABLE gk_schedules ADD COLUMN reset_value TEXT;
ALTER TABLE gk_schedules ADD COLUMN sustain_minutes INTEGER NOT NULL DEFAULT 0 CHECK (sustain_minutes BETWEEN 0 AND 10080);
ALTER TABLE gk_schedules ADD COLUMN trigger_fired_on TEXT;
ALTER TABLE gk_work_orders ADD COLUMN trigger_reading_id TEXT REFERENCES gk_readings(id);
