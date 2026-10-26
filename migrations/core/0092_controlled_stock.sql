-- Receipt source and issue identities remain immutable alongside the valued ledger.
ALTER TABLE gk_receipt_lines ADD COLUMN expires_on TEXT NOT NULL DEFAULT '';
CREATE TABLE gk_controlled_moves (
 move_id TEXT PRIMARY KEY REFERENCES gk_part_moves(id),
 receipt_line_id TEXT NOT NULL REFERENCES gk_receipt_lines(id),
 source_issue TEXT REFERENCES gk_part_moves(id),
 identity TEXT UNIQUE
);
CREATE INDEX gk_controlled_source ON gk_controlled_moves(receipt_line_id);
CREATE TRIGGER gk_controlled_move_update BEFORE UPDATE ON gk_controlled_moves BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_controlled_move_delete BEFORE DELETE ON gk_controlled_moves BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;

-- Historic unallocated issues and later count variances cannot invent a source.
CREATE TABLE gk_receipt_trace_holds (
 receipt_line_id TEXT PRIMARY KEY REFERENCES gk_receipt_lines(id), reason TEXT NOT NULL
);
INSERT INTO gk_receipt_trace_holds(receipt_line_id,reason)
 SELECT l.id,'Historical movements require bin reconciliation' FROM gk_stock_receipt_lines l JOIN gk_receipts r ON r.id=l.receipt_id
 WHERE EXISTS(SELECT 1 FROM gk_stock_moves m WHERE m.part_id=l.part_id AND m.at>=r.created_at AND m.kind IN ('issue','count') AND m.quantity_milli<>0);
CREATE TRIGGER gk_count_holds_sources AFTER INSERT ON gk_part_moves WHEN NEW.kind='count' AND NEW.quantity_milli<>0 BEGIN
 INSERT OR IGNORE INTO gk_receipt_trace_holds(receipt_line_id,reason)
 SELECT l.id,'Count variance requires bin reconciliation' FROM gk_stock_receipt_lines l
 WHERE l.part_id=COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=NEW.part_id),NEW.part_id);
END;
