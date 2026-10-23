ALTER TABLE gk_requests ADD COLUMN impact TEXT NOT NULL DEFAULT 'unknown' CHECK(impact IN ('unknown','running','reduced','stopped'));
