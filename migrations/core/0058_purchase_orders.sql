-- BUY-002: immutable quote/order revisions, exact approval, one email attempt.
CREATE TABLE gk_quotes (
 id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES gk_suppliers(id),
 reference TEXT NOT NULL, snapshot TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES gk_members(id), created_at INTEGER NOT NULL
);
CREATE TABLE gk_purchase_orders (
 id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, current_revision INTEGER NOT NULL,
 created_by TEXT NOT NULL REFERENCES gk_members(id), created_at INTEGER NOT NULL
);
CREATE TABLE gk_purchase_revisions (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES gk_purchase_orders(id),
 revision INTEGER NOT NULL, snapshot TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES gk_members(id), created_at INTEGER NOT NULL,
 UNIQUE(order_id,revision)
);
CREATE TABLE gk_purchase_files (
 id TEXT PRIMARY KEY, order_id TEXT REFERENCES gk_purchase_orders(id), quote_id TEXT REFERENCES gk_quotes(id),
 filename TEXT NOT NULL, media_type TEXT NOT NULL, sha256 TEXT NOT NULL, bytes BLOB NOT NULL,
 added_by TEXT NOT NULL REFERENCES gk_members(id), added_at INTEGER NOT NULL,
 CHECK ((order_id IS NULL) <> (quote_id IS NULL))
);
CREATE TABLE gk_purchase_approvals (
 id TEXT PRIMARY KEY, revision_id TEXT NOT NULL UNIQUE REFERENCES gk_purchase_revisions(id),
 approved_by TEXT NOT NULL REFERENCES gk_members(id), approved_at INTEGER NOT NULL, note TEXT NOT NULL
);
CREATE TABLE gk_purchase_sends (
 id TEXT PRIMARY KEY, revision_id TEXT NOT NULL UNIQUE REFERENCES gk_purchase_revisions(id),
 approval_id TEXT NOT NULL REFERENCES gk_purchase_approvals(id), recipient TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('unconfirmed','accepted','development','rejected','rate_limited','uncertain','failed')),
 provider TEXT, provider_message_id TEXT, error TEXT,
 claimed_by TEXT NOT NULL REFERENCES gk_members(id), claimed_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE TABLE gk_purchase_acknowledgments (
 id TEXT PRIMARY KEY, send_id TEXT NOT NULL REFERENCES gk_purchase_sends(id),
 contact TEXT NOT NULL, reference TEXT NOT NULL, note TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES gk_members(id), recorded_at INTEGER NOT NULL
);
CREATE TRIGGER gk_quote_immutable_update BEFORE UPDATE ON gk_quotes BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_quote_immutable_delete BEFORE DELETE ON gk_quotes BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_revision_immutable_update BEFORE UPDATE ON gk_purchase_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_revision_immutable_delete BEFORE DELETE ON gk_purchase_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_file_immutable_update BEFORE UPDATE ON gk_purchase_files BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_file_immutable_delete BEFORE DELETE ON gk_purchase_files BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_approval_immutable_update BEFORE UPDATE ON gk_purchase_approvals BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_approval_immutable_delete BEFORE DELETE ON gk_purchase_approvals BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_ack_immutable_update BEFORE UPDATE ON gk_purchase_acknowledgments BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_ack_immutable_delete BEFORE DELETE ON gk_purchase_acknowledgments BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
