-- PART-003: a damaged work return credits its original issue value, but is
-- held separately from usable stock. The pair shares the return sequence;
-- quantity/value always derive from the immutable original return.
CREATE TABLE gk_work_return_quarantine (
 return_id TEXT PRIMARY KEY REFERENCES gk_part_moves(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) > 0)
);
CREATE TRIGGER gk_work_return_quarantine_source BEFORE INSERT ON gk_work_return_quarantine
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM gk_part_moves WHERE id=NEW.return_id AND kind='return' AND quantity_milli>0 AND work_order_id IS NOT NULL)
 THEN RAISE(ABORT,'gasket_immutable') END;
END;
CREATE TRIGGER gk_work_return_quarantine_keep BEFORE UPDATE ON gk_work_return_quarantine BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_work_return_quarantine_delete BEFORE DELETE ON gk_work_return_quarantine BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
DROP VIEW gk_stock_moves;
CREATE VIEW gk_stock_moves AS SELECT t.seq,t.id,COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=t.part_id),t.part_id) AS part_id,t.kind,t.quantity_milli,t.counted_milli,t.work_order_id,t.note,t.actor,t.at,t.origin,t.value_cents,t.unit_price_cents,t.freight_cents,t.tax_cents,t.reason,t.count_line_id,t.receipt_line_id,t.receipt_event,t.catalog_item_id,t.part_id AS source_part_id FROM gk_part_moves t UNION ALL SELECT t.seq,'quarantine:'||t.id,COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=t.part_id),t.part_id),'quarantine',-t.quantity_milli,NULL,NULL,q.reason,t.actor,t.at,t.origin,-t.value_cents,NULL,NULL,NULL,'damaged',NULL,NULL,NULL,NULL,t.part_id FROM gk_part_moves t JOIN gk_work_return_quarantine q ON q.return_id=t.id;
