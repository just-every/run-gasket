-- BUY-004: receipts pin immutable PO revisions; inspection events never edit history.
CREATE TABLE gk_receipts (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, order_id TEXT NOT NULL REFERENCES gk_purchase_orders(id),
 revision_id TEXT NOT NULL REFERENCES gk_purchase_revisions(id), supplier_id TEXT NOT NULL REFERENCES gk_suppliers(id),
 external_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
 freight_cents INTEGER NOT NULL CHECK(freight_cents>=0), sales_tax_cents INTEGER NOT NULL CHECK(sales_tax_cents>=0),
 note TEXT NOT NULL, backorder_note TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES gk_members(id), created_at INTEGER NOT NULL,
 UNIQUE(supplier_id,external_id)
);
CREATE TABLE gk_receipt_lines (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, receipt_id TEXT NOT NULL REFERENCES gk_receipts(id), line_index INTEGER NOT NULL CHECK(line_index>=0),
 part_id TEXT REFERENCES gk_parts(id), quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),
 quarantine_milli INTEGER NOT NULL CHECK(quarantine_milli>=0 AND quarantine_milli<=quantity_milli),
 bin TEXT NOT NULL, lot TEXT NOT NULL, serial TEXT NOT NULL,
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents>=0), extended_cents INTEGER NOT NULL CHECK(extended_cents>=0),
 freight_cents INTEGER NOT NULL CHECK(freight_cents>=0), tax_cents INTEGER NOT NULL CHECK(tax_cents>=0),
 value_cents INTEGER NOT NULL CHECK(value_cents>=0), quarantine_value_cents INTEGER NOT NULL CHECK(quarantine_value_cents>=0),
 quarantine_freight_cents INTEGER NOT NULL, quarantine_tax_cents INTEGER NOT NULL
);
CREATE INDEX gk_receipt_order ON gk_receipts(order_id,revision_id);
CREATE INDEX gk_receipt_lines_receipt ON gk_receipt_lines(receipt_id,line_index);
CREATE UNIQUE INDEX gk_receipt_serial ON gk_receipt_lines(part_id,serial) WHERE serial<>'';
CREATE TABLE gk_receipt_events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, receipt_line_id TEXT NOT NULL REFERENCES gk_receipt_lines(id),
 kind TEXT NOT NULL CHECK(kind IN ('release','return')), source TEXT NOT NULL CHECK(source IN ('quarantine','usable')),
 quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),
 usable_delta INTEGER NOT NULL, quarantine_delta INTEGER NOT NULL,
 usable_value_cents INTEGER NOT NULL, quarantine_value_cents INTEGER NOT NULL,
 quarantine_freight_cents INTEGER NOT NULL, quarantine_tax_cents INTEGER NOT NULL,
 reason TEXT NOT NULL, actor TEXT NOT NULL REFERENCES gk_members(id), at INTEGER NOT NULL
);
CREATE INDEX gk_receipt_events_line ON gk_receipt_events(receipt_line_id);
CREATE TABLE gk_receipt_evidence (
 id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL REFERENCES gk_receipts(id),
 filename TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, bytes BLOB NOT NULL,
 added_by TEXT NOT NULL REFERENCES gk_members(id), added_at INTEGER NOT NULL
);
ALTER TABLE gk_part_moves ADD COLUMN receipt_line_id TEXT REFERENCES gk_receipt_lines(id);
ALTER TABLE gk_part_moves ADD COLUMN receipt_event TEXT CHECK(receipt_event IS NULL OR receipt_event IN ('receive','release','supplier_return'));
CREATE TRIGGER gk_receipt_update BEFORE UPDATE ON gk_receipts BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_receipt_delete BEFORE DELETE ON gk_receipts BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_receipt_line_update BEFORE UPDATE ON gk_receipt_lines BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_receipt_line_delete BEFORE DELETE ON gk_receipt_lines BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_receipt_event_update BEFORE UPDATE ON gk_receipt_events BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_receipt_event_delete BEFORE DELETE ON gk_receipt_events BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_receipt_evidence_update BEFORE UPDATE ON gk_receipt_evidence BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_receipt_evidence_delete BEFORE DELETE ON gk_receipt_evidence BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
