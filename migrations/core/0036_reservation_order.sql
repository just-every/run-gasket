-- PART-002: reservations made in one write, and a kit's lines, keep the order
-- they were given in an explicit column, so they list the same way after an
-- archive is restored (row ids are not carried over).
ALTER TABLE gk_reservations ADD COLUMN line INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gk_kit_lines ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
