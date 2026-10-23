-- Explicit dispositions keep the original work return and its credit immutable.
CREATE TABLE gk_work_quarantine_dispositions (
 id TEXT PRIMARY KEY,
 return_id TEXT NOT NULL REFERENCES gk_work_return_quarantine(return_id),
 kind TEXT NOT NULL CHECK(kind IN ('release','write_off')),
 quantity_milli INTEGER NOT NULL CHECK(quantity_milli > 0),
 value_cents INTEGER NOT NULL CHECK(value_cents >= 0),
 reason TEXT NOT NULL CHECK(length(trim(reason)) > 0),
 fingerprint TEXT NOT NULL,
 actor TEXT NOT NULL REFERENCES gk_members(id),
 at INTEGER NOT NULL,
 move_id TEXT UNIQUE REFERENCES gk_part_moves(id),
 CHECK((kind='release' AND move_id IS NOT NULL) OR (kind='write_off' AND move_id IS NULL))
);
CREATE INDEX gk_work_quarantine_dispositions_return ON gk_work_quarantine_dispositions(return_id);
CREATE TRIGGER gk_work_quarantine_dispositions_update BEFORE UPDATE ON gk_work_quarantine_dispositions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_work_quarantine_dispositions_delete BEFORE DELETE ON gk_work_quarantine_dispositions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
-- Released goods reverse the quarantine adjustment; they are not new purchases.
DROP VIEW gk_stock_moves;

CREATE VIEW gk_stock_moves AS SELECT t.seq,t.id,COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=t.part_id),t.part_id) AS part_id,CASE WHEN EXISTS(SELECT 1 FROM gk_work_quarantine_dispositions d WHERE d.move_id=t.id) THEN 'quarantine' ELSE t.kind END AS kind,t.quantity_milli,t.counted_milli,t.work_order_id,t.note,t.actor,t.at,t.origin,t.value_cents,t.unit_price_cents,t.freight_cents,t.tax_cents,t.reason,t.count_line_id,t.receipt_line_id,t.receipt_event,t.catalog_item_id,t.part_id AS source_part_id FROM gk_part_moves t UNION ALL SELECT t.seq,'quarantine:'||t.id,COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=t.part_id),t.part_id),'quarantine',-t.quantity_milli,NULL,NULL,q.reason,t.actor,t.at,t.origin,-t.value_cents,NULL,NULL,NULL,'damaged',NULL,NULL,NULL,NULL,t.part_id FROM gk_part_moves t JOIN gk_work_return_quarantine q ON q.return_id=t.id;
