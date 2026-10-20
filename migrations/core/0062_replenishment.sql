-- PART-005: location policy revisions, independently approved ordering envelopes,
-- one open document per part, and PM-008 retained replenishment evidence.
PRAGMA defer_foreign_keys = true;
CREATE TABLE gk_automation_rules_next (
 id TEXT PRIMARY KEY CHECK(id IN ('pm','routes','chase','expiry','replenishment')),
 revision INTEGER NOT NULL DEFAULT 1, paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
 reason TEXT NOT NULL DEFAULT '', changed_by TEXT, changed_at INTEGER NOT NULL
);
INSERT INTO gk_automation_rules_next SELECT * FROM gk_automation_rules;
DROP TABLE gk_automation_rules;
ALTER TABLE gk_automation_rules_next RENAME TO gk_automation_rules;
INSERT INTO gk_automation_rules(id,changed_at) VALUES('replenishment',0);
CREATE TABLE gk_replenishment_policies (
 part_id TEXT PRIMARY KEY REFERENCES gk_parts(id), current_revision INTEGER NOT NULL
);
CREATE TABLE gk_replenishment_policy_revisions (
 id TEXT PRIMARY KEY, part_id TEXT NOT NULL REFERENCES gk_parts(id), revision INTEGER NOT NULL,
 snapshot TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES gk_members(id), created_at INTEGER NOT NULL,
 UNIQUE(part_id,revision)
);
CREATE TABLE gk_replenishment_envelopes (
 id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES gk_suppliers(id), cost_center_id TEXT NOT NULL REFERENCES gk_cost_centers(id),
 from_on TEXT NOT NULL, to_on TEXT NOT NULL, per_order_cents INTEGER NOT NULL CHECK(per_order_cents>0),
 period_limit_cents INTEGER NOT NULL CHECK(period_limit_cents>=per_order_cents), reason TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES gk_members(id), created_at INTEGER NOT NULL
);
CREATE TABLE gk_replenishment_envelope_approvals (
 envelope_id TEXT PRIMARY KEY REFERENCES gk_replenishment_envelopes(id), approved_by TEXT NOT NULL REFERENCES gk_members(id),
 approved_at INTEGER NOT NULL, reason TEXT NOT NULL
);
CREATE TABLE gk_replenishment_envelope_revocations (
 envelope_id TEXT PRIMARY KEY REFERENCES gk_replenishment_envelopes(id), revoked_by TEXT NOT NULL REFERENCES gk_members(id), revoked_at INTEGER NOT NULL, reason TEXT NOT NULL
);
CREATE TABLE gk_replenishments (
 id TEXT PRIMARY KEY, part_id TEXT NOT NULL REFERENCES gk_parts(id), policy_revision_id TEXT NOT NULL REFERENCES gk_replenishment_policy_revisions(id),
 order_id TEXT NOT NULL UNIQUE REFERENCES gk_purchase_orders(id), revision_id TEXT NOT NULL REFERENCES gk_purchase_revisions(id),
 quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0), opened_at INTEGER NOT NULL, due_on TEXT NOT NULL, closed_at INTEGER,
 automation_job_id TEXT NOT NULL REFERENCES gk_automation_jobs(id), automation_revision INTEGER NOT NULL
);
CREATE UNIQUE INDEX gk_replenishment_one_open ON gk_replenishments(part_id) WHERE closed_at IS NULL;
CREATE TABLE gk_replenishment_events (
 id TEXT PRIMARY KEY, replenishment_id TEXT NOT NULL REFERENCES gk_replenishments(id), occasion TEXT NOT NULL,
 facts TEXT NOT NULL, at INTEGER NOT NULL, automation_job_id TEXT NOT NULL REFERENCES gk_automation_jobs(id), automation_revision INTEGER NOT NULL,
 UNIQUE(replenishment_id,occasion)
);
CREATE TABLE gk_replenishment_envelope_uses (
 revision_id TEXT PRIMARY KEY REFERENCES gk_purchase_revisions(id), envelope_id TEXT NOT NULL REFERENCES gk_replenishment_envelopes(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0), booked_on TEXT NOT NULL, at INTEGER NOT NULL,
 automation_job_id TEXT NOT NULL REFERENCES gk_automation_jobs(id), automation_revision INTEGER NOT NULL
);
CREATE TABLE gk_notices_next (
 id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, work_order_id TEXT REFERENCES gk_work_orders(id), asset_id TEXT REFERENCES gk_assets(id),
 comment_id TEXT REFERENCES gk_comments(id), part_id TEXT REFERENCES gk_parts(id), purchase_order_id TEXT REFERENCES gk_purchase_orders(id),
 kind TEXT NOT NULL CHECK(kind IN ('reminder','overdue','escalation_lead','escalation_supervisor','blocker_missed','declined','mention','expiry','replenishment')),
 occasion TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL,
 automation_job_id TEXT REFERENCES gk_automation_jobs(id), automation_revision INTEGER,
 UNIQUE(recipient_id,occasion),
 CHECK((kind='replenishment' AND part_id IS NOT NULL AND purchase_order_id IS NOT NULL AND work_order_id IS NULL AND asset_id IS NULL)
 OR (kind<>'replenishment' AND ((work_order_id IS NULL)<>(asset_id IS NULL))))
);
INSERT INTO gk_notices_next(id,recipient_id,work_order_id,asset_id,comment_id,kind,occasion,text,created_at,automation_job_id,automation_revision)
 SELECT id,recipient_id,work_order_id,asset_id,comment_id,kind,occasion,text,created_at,automation_job_id,automation_revision FROM gk_notices;
DROP TABLE gk_notices;
ALTER TABLE gk_notices_next RENAME TO gk_notices;
CREATE INDEX gk_notices_recipient ON gk_notices(recipient_id,created_at);
CREATE TRIGGER gk_replenishment_policy_revisions_update BEFORE UPDATE ON gk_replenishment_policy_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_replenishment_policy_revisions_delete BEFORE DELETE ON gk_replenishment_policy_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_replenishment_envelopes_update BEFORE UPDATE ON gk_replenishment_envelopes BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_replenishment_envelopes_delete BEFORE DELETE ON gk_replenishment_envelopes BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_replenishment_envelope_approvals_update BEFORE UPDATE ON gk_replenishment_envelope_approvals BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_replenishment_envelope_approvals_delete BEFORE DELETE ON gk_replenishment_envelope_approvals BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_replenishment_envelope_revocations_update BEFORE UPDATE ON gk_replenishment_envelope_revocations BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_replenishment_envelope_revocations_delete BEFORE DELETE ON gk_replenishment_envelope_revocations BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_replenishment_envelope_uses_update BEFORE UPDATE ON gk_replenishment_envelope_uses BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_replenishment_envelope_uses_delete BEFORE DELETE ON gk_replenishment_envelope_uses BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_replenishment_events_update BEFORE UPDATE ON gk_replenishment_events BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_replenishment_events_delete BEFORE DELETE ON gk_replenishment_events BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
