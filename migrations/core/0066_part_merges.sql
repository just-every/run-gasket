-- PART-008: canonical identity is a retained link, never a rewrite of evidence.
CREATE TABLE gk_part_canonical (
 part_id TEXT PRIMARY KEY REFERENCES gk_parts(id), canonical_id TEXT NOT NULL REFERENCES gk_parts(id),
 CHECK(part_id<>canonical_id)
);
CREATE TABLE gk_part_merges (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES gk_parts(id), canonical_id TEXT NOT NULL REFERENCES gk_parts(id),
 preview TEXT NOT NULL, fingerprint TEXT NOT NULL, reason TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at INTEGER NOT NULL
);
CREATE TRIGGER gk_part_merges_keep BEFORE UPDATE ON gk_part_merges BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_part_merges_delete BEFORE DELETE ON gk_part_merges BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_part_photos (
 id TEXT PRIMARY KEY, part_id TEXT NOT NULL REFERENCES gk_parts(id), filename TEXT NOT NULL, media_type TEXT NOT NULL,
 sha256 TEXT NOT NULL, bytes BLOB NOT NULL, added_by TEXT NOT NULL, added_at INTEGER NOT NULL
);
ALTER TABLE gk_part_moves ADD COLUMN catalog_item_id TEXT REFERENCES gk_supplier_items(id);
CREATE VIEW gk_stock_moves AS SELECT t.seq,t.id,COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=t.part_id),t.part_id) AS part_id,t.kind,t.quantity_milli,t.counted_milli,t.work_order_id,t.note,t.actor,t.at,t.origin,t.value_cents,t.unit_price_cents,t.freight_cents,t.tax_cents,t.reason,t.count_line_id,t.receipt_line_id,t.receipt_event,t.catalog_item_id,t.part_id AS source_part_id FROM gk_part_moves t;
CREATE VIEW gk_stock_reservations AS SELECT t.id,t.work_order_id,COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=t.part_id),t.part_id) AS part_id,t.requested_part_id,t.kit_id,t.quantity_milli,t.reserved_by,t.reserved_at,t.released_by,t.released_at,t.release_reason,t.line,t.part_id AS source_part_id FROM gk_reservations t;
CREATE VIEW gk_stock_receipt_lines AS SELECT t.seq,t.id,t.receipt_id,t.line_index,COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=t.part_id),t.part_id) AS part_id,t.quantity_milli,t.quarantine_milli,t.bin,t.lot,t.serial,t.unit_price_cents,t.extended_cents,t.freight_cents,t.tax_cents,t.value_cents,t.quarantine_value_cents,t.quarantine_freight_cents,t.quarantine_tax_cents,t.part_id AS source_part_id FROM gk_receipt_lines t;
CREATE VIEW gk_stock_replenishments AS SELECT t.id,COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=t.part_id),t.part_id) AS part_id,t.policy_revision_id,t.order_id,t.revision_id,t.quantity_milli,t.opened_at,t.due_on,t.closed_at,t.automation_job_id,t.automation_revision,t.part_id AS source_part_id FROM gk_replenishments t;

CREATE TRIGGER gk_part_photos_keep BEFORE UPDATE ON gk_part_photos BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_part_photos_delete BEFORE DELETE ON gk_part_photos BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
