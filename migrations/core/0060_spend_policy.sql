-- BUY-003: policy and authority are versioned; commitments are obligations, not actual spend.
ALTER TABLE gk_purchase_approvals ADD COLUMN authority_kind TEXT NOT NULL DEFAULT 'manual' CHECK(authority_kind IN ('manual','threshold','emergency'));
CREATE TABLE gk_spend_policies (id TEXT PRIMARY KEY, current_revision INTEGER NOT NULL);
CREATE TABLE gk_spend_policy_revisions (
 id TEXT PRIMARY KEY, policy_id TEXT NOT NULL REFERENCES gk_spend_policies(id), revision INTEGER NOT NULL,
 cost_center_id TEXT REFERENCES gk_cost_centers(id), from_on TEXT NOT NULL, to_on TEXT NOT NULL,
 budget_cents INTEGER NOT NULL CHECK(budget_cents>=0), currency TEXT NOT NULL CHECK(currency='USD'),
 created_by TEXT NOT NULL REFERENCES gk_members(id), created_at INTEGER NOT NULL,
 CHECK(from_on<=to_on), UNIQUE(policy_id,revision)
);
CREATE INDEX gk_spend_policy_scope ON gk_spend_policy_revisions(cost_center_id,from_on,to_on);
CREATE TABLE gk_spend_policy_steps (
 id TEXT PRIMARY KEY, policy_revision_id TEXT NOT NULL REFERENCES gk_spend_policy_revisions(id),
 position INTEGER NOT NULL CHECK(position>=0), threshold_cents INTEGER NOT NULL CHECK(threshold_cents>=0),
 principal_id TEXT NOT NULL REFERENCES gk_members(id), UNIQUE(policy_revision_id,position)
);
CREATE TABLE gk_purchase_delegations (id TEXT PRIMARY KEY, current_revision INTEGER NOT NULL);
CREATE TABLE gk_purchase_delegation_revisions (
 id TEXT PRIMARY KEY, delegation_id TEXT NOT NULL REFERENCES gk_purchase_delegations(id), revision INTEGER NOT NULL,
 principal_id TEXT NOT NULL REFERENCES gk_members(id), delegate_id TEXT NOT NULL REFERENCES gk_members(id),
 from_on TEXT NOT NULL, to_on TEXT NOT NULL, reason TEXT NOT NULL,
 revoked INTEGER NOT NULL CHECK(revoked IN (0,1)), created_by TEXT NOT NULL REFERENCES gk_members(id), created_at INTEGER NOT NULL,
 CHECK(principal_id<>delegate_id AND from_on<=to_on), UNIQUE(delegation_id,revision)
);
CREATE INDEX gk_purchase_delegation_principal ON gk_purchase_delegation_revisions(principal_id,from_on,to_on);
CREATE TABLE gk_purchase_step_approvals (
 id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES gk_purchase_revisions(id),
 step_id TEXT NOT NULL REFERENCES gk_spend_policy_steps(id), authority_key TEXT NOT NULL,
 principal_id TEXT NOT NULL REFERENCES gk_members(id), effective_id TEXT NOT NULL REFERENCES gk_members(id),
 delegation_revision_id TEXT REFERENCES gk_purchase_delegation_revisions(id),
 approved_by TEXT NOT NULL REFERENCES gk_members(id), approved_at INTEGER NOT NULL, note TEXT NOT NULL,
 CHECK(approved_by=effective_id), UNIQUE(revision_id,step_id,authority_key)
);
CREATE TABLE gk_purchase_commitments (
 revision_id TEXT PRIMARY KEY REFERENCES gk_purchase_revisions(id), amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
 cost_center_id TEXT NOT NULL REFERENCES gk_cost_centers(id), booked_on TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES gk_members(id), recorded_at INTEGER NOT NULL
);
CREATE INDEX gk_purchase_commitment_period ON gk_purchase_commitments(booked_on,cost_center_id);
CREATE TABLE gk_purchase_commitment_releases (
 id TEXT PRIMARY KEY, revision_id TEXT NOT NULL UNIQUE REFERENCES gk_purchase_commitments(revision_id),
 reason TEXT NOT NULL, released_by TEXT NOT NULL REFERENCES gk_members(id), released_at INTEGER NOT NULL
);
CREATE TABLE gk_purchase_emergency_overrides (
 id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES gk_purchase_revisions(id), route_key TEXT NOT NULL,
 reason TEXT NOT NULL, budget_impact TEXT NOT NULL,
 approved_by TEXT NOT NULL REFERENCES gk_members(id), confirmed_at INTEGER NOT NULL
);
CREATE INDEX gk_purchase_emergency_revision ON gk_purchase_emergency_overrides(revision_id,route_key);
-- Keep the amount and original booking date, but discard unsent superseded obligations.
-- Every send claim is retained conservatively, including an uncertain provider result.
CREATE VIEW gk_live_purchase_commitments AS
 SELECT c.* FROM gk_purchase_commitments c
 JOIN gk_purchase_revisions r ON r.id=c.revision_id
 JOIN gk_purchase_orders p ON p.id=r.order_id
 JOIN gk_purchase_approvals a ON a.revision_id=r.id
 WHERE (r.revision=p.current_revision OR EXISTS(SELECT 1 FROM gk_purchase_sends s WHERE s.revision_id=r.id))
 AND NOT EXISTS(SELECT 1 FROM gk_purchase_commitment_releases x WHERE x.revision_id=r.id);
CREATE TRIGGER gk_spend_policy_revision_update BEFORE UPDATE ON gk_spend_policy_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_spend_policy_revision_delete BEFORE DELETE ON gk_spend_policy_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_spend_policy_step_update BEFORE UPDATE ON gk_spend_policy_steps BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_spend_policy_step_delete BEFORE DELETE ON gk_spend_policy_steps BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_delegation_revision_update BEFORE UPDATE ON gk_purchase_delegation_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_delegation_revision_delete BEFORE DELETE ON gk_purchase_delegation_revisions BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_step_approval_update BEFORE UPDATE ON gk_purchase_step_approvals BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_step_approval_delete BEFORE DELETE ON gk_purchase_step_approvals BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_commitment_update BEFORE UPDATE ON gk_purchase_commitments BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_commitment_delete BEFORE DELETE ON gk_purchase_commitments BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_commitment_release_update BEFORE UPDATE ON gk_purchase_commitment_releases BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_commitment_release_delete BEFORE DELETE ON gk_purchase_commitment_releases BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_emergency_override_update BEFORE UPDATE ON gk_purchase_emergency_overrides BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
CREATE TRIGGER gk_purchase_emergency_override_delete BEFORE DELETE ON gk_purchase_emergency_overrides BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
