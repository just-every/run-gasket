-- ASSET-007: an asset's lifecycle facts (purchase, commissioning, warranty,
-- replacement value with its basis, and the disposal recorded when it is
-- retired), kept as numbered revisions, and its service agreements. Money is
-- whole US cents. Depreciation stays in the connected ledger.
CREATE TABLE gk_asset_lifecycle (
  asset_id TEXT PRIMARY KEY REFERENCES gk_assets(id),
  purchased_on TEXT,
  purchase_cents INTEGER CHECK (purchase_cents IS NULL OR purchase_cents >= 0),
  supplier TEXT,
  commissioned_on TEXT,
  warranty_until TEXT,
  warranty_terms TEXT,
  replacement_cents INTEGER CHECK (replacement_cents IS NULL OR replacement_cents > 0),
  replacement_basis TEXT,
  disposal_method TEXT CHECK (disposal_method IS NULL OR disposal_method IN ('sold', 'scrapped', 'returned', 'transferred', 'donated', 'other')),
  disposed_on TEXT,
  disposal_cents INTEGER CHECK (disposal_cents IS NULL OR disposal_cents >= 0),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE gk_service_agreements (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  provider TEXT NOT NULL,
  reference TEXT,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL CHECK (ends_on >= starts_on),
  annual_cents INTEGER CHECK (annual_cents IS NULL OR annual_cents >= 0),
  scope TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX gk_service_agreements_asset ON gk_service_agreements(asset_id, starts_on);
