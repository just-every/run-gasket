-- PLAN-001 (slice): every work order has a priority (emergency work is
-- corrective work at emergency priority), and leads keep reusable work
-- templates. Work made from a template copies its title, instructions,
-- priority and estimate and records the template and its revision; a later
-- template edit never changes work already made.
ALTER TABLE gk_work_orders ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('emergency', 'high', 'normal', 'low'));
ALTER TABLE gk_work_orders ADD COLUMN template_id TEXT;
ALTER TABLE gk_work_orders ADD COLUMN template_revision INTEGER;

CREATE TABLE gk_work_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  title TEXT NOT NULL,
  instructions TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('emergency', 'high', 'normal', 'low')),
  estimate_minutes INTEGER CHECK (estimate_minutes IS NULL OR estimate_minutes BETWEEN 1 AND 60000),
  revision INTEGER NOT NULL DEFAULT 1,
  retired_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
