-- BUY-001: supplier master, catalogs and attributable maintenance requisitions.
-- A requisition requests purchasing; it never authorizes spend or moves stock.
CREATE TABLE gk_suppliers (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  ship_to TEXT NOT NULL,
  tax_treatment TEXT NOT NULL CHECK (tax_treatment IN ('sales_tax', 'use_tax', 'exempt')),
  tax_note TEXT NOT NULL,
  payment_terms TEXT NOT NULL,
  lead_days INTEGER NOT NULL CHECK (lead_days >= 0),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  updated_by TEXT NOT NULL REFERENCES gk_members(id),
  updated_at INTEGER NOT NULL
);
CREATE TABLE gk_supplier_items (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES gk_suppliers(id),
  sku TEXT NOT NULL,
  description TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('part', 'service', 'repair')),
  unit TEXT NOT NULL,
  price_cents INTEGER CHECK (price_cents >= 0),
  UNIQUE (supplier_id, sku)
);
CREATE TABLE gk_cost_centers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE TABLE gk_requisitions (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL REFERENCES gk_suppliers(id),
  supplier_revision INTEGER NOT NULL,
  supplier_snapshot TEXT NOT NULL,
  asset_id TEXT REFERENCES gk_assets(id),
  work_order_id TEXT REFERENCES gk_work_orders(id),
  cost_center_id TEXT NOT NULL REFERENCES gk_cost_centers(id),
  purchaser_id TEXT NOT NULL REFERENCES gk_members(id),
  requested_by TEXT NOT NULL REFERENCES gk_members(id),
  requested_at INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending'))
);
CREATE TABLE gk_requisition_lines (
  id TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL REFERENCES gk_requisitions(id),
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('part', 'service', 'repair')),
  description TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
  unit TEXT NOT NULL,
  UNIQUE (requisition_id, position)
);
CREATE TRIGGER gk_supplier_active_guard BEFORE INSERT ON gk_guard
WHEN NEW.code = 'supplier_inactive' AND NEW.ok = 0
BEGIN SELECT RAISE(ABORT, 'gasket_guard_supplier_inactive'); END;
