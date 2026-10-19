-- FIELD-009: technician-created and after-the-fact work. A work order records
-- the door it was created through (web form or JSON API), and work recorded
-- after it was done carries its past start and end (site-local minutes). A
-- template may name a checklist whose current revision its work pins. The
-- owner turns the technician create-work right off or on for the site.
ALTER TABLE gk_work_orders ADD COLUMN created_via TEXT;
ALTER TABLE gk_work_orders ADD COLUMN work_started_on TEXT;
ALTER TABLE gk_work_orders ADD COLUMN work_ended_on TEXT;
ALTER TABLE gk_work_templates ADD COLUMN checklist_id TEXT REFERENCES gk_checklists(id);
ALTER TABLE gk_site ADD COLUMN technician_create_work INTEGER NOT NULL DEFAULT 1 CHECK (technician_create_work IN (0, 1));
