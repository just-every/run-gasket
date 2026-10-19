-- REPORT-005: repair cost entries a lead records on a work order (USD cents; a
-- correction is a further entry, never an edit), and documented lost-production
-- rates per register entry (USD cents per production hour; a NULL rate records
-- that the loss is unknown). The latest rate of an entry counts.
CREATE TABLE gk_work_costs (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  category TEXT NOT NULL CHECK (category IN ('parts', 'labor', 'contractor', 'other')),
  cents INTEGER NOT NULL,
  note TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX gk_work_costs_work ON gk_work_costs(work_order_id, recorded_at);
CREATE TRIGGER gk_work_costs_keep BEFORE UPDATE ON gk_work_costs BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_work_costs_stay BEFORE DELETE ON gk_work_costs BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_loss_rates (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  cents_per_hour INTEGER CHECK (cents_per_hour IS NULL OR cents_per_hour >= 0),
  basis TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX gk_loss_rates_asset ON gk_loss_rates(asset_id, recorded_at);
CREATE TRIGGER gk_loss_rates_keep BEFORE UPDATE ON gk_loss_rates BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_loss_rates_stay BEFORE DELETE ON gk_loss_rates BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
