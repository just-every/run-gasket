-- REPORT-001: preserve retained repair entries while adding tool costs.
CREATE TABLE gk_work_costs_next (
 id TEXT PRIMARY KEY,
 work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
 category TEXT NOT NULL CHECK(category IN ('parts','labor','contractor','tools','other')),
 cents INTEGER NOT NULL, note TEXT NOT NULL, recorded_by TEXT NOT NULL, recorded_at INTEGER NOT NULL
);
INSERT INTO gk_work_costs_next SELECT * FROM gk_work_costs;
DROP TABLE gk_work_costs;
ALTER TABLE gk_work_costs_next RENAME TO gk_work_costs;
CREATE INDEX gk_work_costs_work ON gk_work_costs(work_order_id,recorded_at);
CREATE TRIGGER gk_work_costs_keep BEFORE UPDATE ON gk_work_costs BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_work_costs_stay BEFORE DELETE ON gk_work_costs BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;

ALTER TABLE gk_work_orders ADD COLUMN cost_center_id TEXT REFERENCES gk_cost_centers(id);
CREATE INDEX gk_work_orders_cost_center ON gk_work_orders(cost_center_id);
CREATE TABLE gk_cost_comparisons (
 id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
 kind TEXT NOT NULL CHECK(kind IN ('estimate','commitment','posted')),
 category TEXT NOT NULL CHECK(category IN ('parts','labor','contractor','tools','other')),
 cents INTEGER NOT NULL CHECK(cents<>0), source_reference TEXT NOT NULL, note TEXT NOT NULL,
 corrects_id TEXT REFERENCES gk_cost_comparisons(id),
 recorded_by TEXT NOT NULL REFERENCES gk_members(id), recorded_at INTEGER NOT NULL,
 CHECK(cents>0 OR corrects_id IS NOT NULL), CHECK(kind<>'posted' OR length(trim(source_reference))>0)
);
CREATE INDEX gk_cost_comparisons_work ON gk_cost_comparisons(work_order_id,recorded_at);
CREATE TRIGGER gk_cost_comparisons_keep BEFORE UPDATE ON gk_cost_comparisons BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_cost_comparisons_stay BEFORE DELETE ON gk_cost_comparisons BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_cost_comparison_correction BEFORE INSERT ON gk_cost_comparisons WHEN NEW.cents<0
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM gk_cost_comparisons c WHERE c.id=NEW.corrects_id AND c.cents>0
 AND c.work_order_id=NEW.work_order_id AND c.kind=NEW.kind AND c.category=NEW.category
 AND c.cents+COALESCE((SELECT SUM(x.cents) FROM gk_cost_comparisons x WHERE x.corrects_id=c.id),0)+NEW.cents>=0)
 THEN RAISE(ABORT,'gasket_guard_invalid_cost_correction') END;
END;

-- Each actual source appears exactly once. Returns negate their retained value;
-- the separate quarantine stock adjustment has no work link and is excluded.
CREATE VIEW gk_work_actual_costs AS
 SELECT id,work_order_id,category,cents,note,recorded_by,recorded_at,'entry' AS source FROM gk_work_costs
 UNION ALL SELECT id,work_order_id,'parts',-value_cents,note,actor,at,'stock_'||kind FROM gk_stock_moves WHERE kind IN ('issue','return') AND work_order_id IS NOT NULL
 UNION ALL SELECT id,work_order_id,'labor',cents,reason,recorded_by,reviewed_at,'approved_labor' FROM gk_labor_entries WHERE state='approved'
 UNION ALL SELECT id,work_order_id,'contractor',cents,note,recorded_by,recorded_at,'contractor_invoice' FROM gk_contractor_invoices;
