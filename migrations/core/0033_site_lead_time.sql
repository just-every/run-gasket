-- PM-001: each site's lead time, the whole days ahead of its due date that
-- calendar PM work is issued (0 to 90, 7 by default).
ALTER TABLE gk_site ADD COLUMN lead_days INTEGER NOT NULL DEFAULT 7 CHECK (lead_days BETWEEN 0 AND 90);
