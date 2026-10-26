-- Immutable site-approved prerequisites and attributed sign-offs.
CREATE TABLE gk_safety_requirements (
 id TEXT PRIMARY KEY, checklist_id TEXT NOT NULL REFERENCES gk_checklists(id),
 revision INTEGER NOT NULL, hazard TEXT NOT NULL, isolation TEXT NOT NULL,
 qualification TEXT NOT NULL, published_by TEXT NOT NULL REFERENCES gk_members(id),
 published_at INTEGER NOT NULL, UNIQUE(checklist_id, revision)
);
CREATE TABLE gk_safety_attestations (
 id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
 requirement_id TEXT NOT NULL REFERENCES gk_safety_requirements(id),
 procedure_revision TEXT NOT NULL REFERENCES gk_checklist_revisions(id),
 work_version INTEGER NOT NULL, signer TEXT NOT NULL REFERENCES gk_members(id),
 qualification_json TEXT NOT NULL, permit TEXT NOT NULL, expires_on TEXT NOT NULL,
 filename TEXT NOT NULL, bytes BLOB NOT NULL, sha256 TEXT NOT NULL, recorded_at INTEGER NOT NULL
);
CREATE INDEX gk_safety_work ON gk_safety_attestations(work_order_id);
CREATE TRIGGER gk_safety_requirements_immutable BEFORE UPDATE ON gk_safety_requirements BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_safety_attestations_immutable BEFORE UPDATE ON gk_safety_attestations BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
