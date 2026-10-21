-- INT-002: events commit with their source mutation, never in a later HTTP task.
PRAGMA defer_foreign_keys = true;
CREATE TABLE gk_automation_rules_next (
 id TEXT PRIMARY KEY CHECK(id IN ('pm','routes','chase','expiry','replenishment','vendor','connectors')),
 revision INTEGER NOT NULL DEFAULT 1, paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
 reason TEXT NOT NULL DEFAULT '', changed_by TEXT, changed_at INTEGER NOT NULL
);
INSERT INTO gk_automation_rules_next SELECT * FROM gk_automation_rules;
DROP TABLE gk_automation_rules;
ALTER TABLE gk_automation_rules_next RENAME TO gk_automation_rules;
INSERT INTO gk_automation_rules(id,changed_at) VALUES('connectors',0);
CREATE TABLE gk_connector_events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE, type TEXT NOT NULL CHECK(type IN ('work.changed','receipt.created')),
 source_id TEXT NOT NULL, source_version INTEGER NOT NULL, asset_id TEXT,
 occurred_at INTEGER NOT NULL, data TEXT NOT NULL,
 UNIQUE(type,source_id,source_version)
);
CREATE TRIGGER gk_connector_work_create AFTER INSERT ON gk_work_orders BEGIN
 INSERT INTO gk_connector_events(id,type,source_id,source_version,asset_id,occurred_at,data)
 VALUES(lower(hex(randomblob(16))),'work.changed',NEW.id,NEW.version,NEW.asset_id,NEW.created_at,
 json_object('number',NEW.number,'status',NEW.status));
END;
CREATE TRIGGER gk_connector_work_change AFTER UPDATE ON gk_work_orders WHEN NEW.version<>OLD.version BEGIN
 INSERT INTO gk_connector_events(id,type,source_id,source_version,asset_id,occurred_at,data)
 VALUES(lower(hex(randomblob(16))),'work.changed',NEW.id,NEW.version,NEW.asset_id,CAST(strftime('%s','now') AS INTEGER)*1000,
 json_object('number',NEW.number,'status',NEW.status));
END;
CREATE TRIGGER gk_connector_receipt AFTER INSERT ON gk_receipts BEGIN
 INSERT INTO gk_connector_events(id,type,source_id,source_version,asset_id,occurred_at,data)
 VALUES(lower(hex(randomblob(16))),'receipt.created',NEW.id,1,
 (SELECT json_extract(snapshot,'$.asset.id') FROM gk_purchase_revisions WHERE id=NEW.revision_id),NEW.created_at,
 json_object('orderId',NEW.order_id,'revisionId',NEW.revision_id,'externalId',NEW.external_id));
END;
CREATE TRIGGER gk_connector_events_update BEFORE UPDATE ON gk_connector_events BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_connector_events_delete BEFORE DELETE ON gk_connector_events BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TABLE gk_connector_subscriptions (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, endpoint TEXT NOT NULL, event_types TEXT NOT NULL,
 asset_id TEXT REFERENCES gk_assets(id), secret_cipher TEXT NOT NULL, secret_version INTEGER NOT NULL DEFAULT 1,
 revision INTEGER NOT NULL DEFAULT 1, paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1)),
 cursor INTEGER NOT NULL CHECK(cursor>=0), quota INTEGER NOT NULL CHECK(quota BETWEEN 1 AND 1000),
 quota_start INTEGER NOT NULL DEFAULT 0, quota_used INTEGER NOT NULL DEFAULT 0,
 last_success INTEGER, last_error TEXT, created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE gk_connector_deliveries (
 id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES gk_connector_subscriptions(id),
 event_seq INTEGER NOT NULL REFERENCES gk_connector_events(seq),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','retry','delivered','dead')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 available_at INTEGER NOT NULL, lease_until INTEGER, claim TEXT,
 error TEXT, http_status INTEGER, delivered_at INTEGER,
 UNIQUE(subscription_id,event_seq)
);
CREATE INDEX gk_connector_pending ON gk_connector_deliveries(subscription_id,state,available_at);
CREATE TABLE gk_connector_attempts (
 id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES gk_connector_deliveries(id),
 attempt INTEGER NOT NULL, subscription_revision INTEGER NOT NULL, secret_version INTEGER NOT NULL,
 automation_job_id TEXT NOT NULL REFERENCES gk_automation_jobs(id), automation_revision INTEGER NOT NULL,
 started_at INTEGER NOT NULL, finished_at INTEGER, outcome TEXT NOT NULL, http_status INTEGER,
 UNIQUE(delivery_id,attempt)
);
