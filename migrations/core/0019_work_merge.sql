-- PLAN-007: a duplicate work order merged into another is cancelled and keeps a
-- link to the work order that carries on; its own evidence and records stay.
ALTER TABLE gk_work_orders ADD COLUMN merged_into TEXT REFERENCES gk_work_orders(id);
