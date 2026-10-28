-- Named stewardship is independent of planning, erasure and private documents.
CREATE TABLE gk_resource_grants (
 id TEXT PRIMARY KEY,
 grantee_id TEXT NOT NULL REFERENCES gk_members(id),
 site_id TEXT NOT NULL REFERENCES gk_sites(id),
 kind TEXT NOT NULL CHECK(kind IN ('qualification','tool')),
 target_id TEXT NOT NULL,
 name TEXT NOT NULL COLLATE NOCASE,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 revision INTEGER NOT NULL,
 grantee_version INTEGER NOT NULL,
 membership_revision INTEGER NOT NULL,
 granted_by TEXT NOT NULL REFERENCES gk_members(id),
 issuer_version INTEGER NOT NULL,
 changed_at INTEGER NOT NULL,
 reason TEXT NOT NULL
);
CREATE INDEX gk_resource_grants_scope ON gk_resource_grants(grantee_id,site_id,kind,target_id,name);
DROP TRIGGER gk_audit_no_update;
CREATE TRIGGER gk_audit_no_update BEFORE UPDATE ON gk_audit
WHEN NOT (
 NEW.detail='{}' AND NEW.seq=OLD.seq AND NEW.at=OLD.at AND NEW.actor=OLD.actor
 AND NEW.action=OLD.action AND NEW.subject=OLD.subject AND NEW.role IS OLD.role
 AND (
  (EXISTS(SELECT 1 FROM gk_guard WHERE code='request_erasure' AND ok=1)
   AND OLD.action IN ('request.submit','request.triage','request.reply','request.convert','workorder.create','request.clock','request.escalation'))
  OR (EXISTS(SELECT 1 FROM gk_guard WHERE code='record_erasure' AND ok=1))
  OR (EXISTS(SELECT 1 FROM gk_guard WHERE code='qualification_erasure' AND ok=1)
   AND OLD.action IN ('planning.qualification','planning.retire','resource.grant','resource.grant.revoke'))
  OR (EXISTS(SELECT 1 FROM gk_guard WHERE code='attachment_erasure' AND ok=1)
   AND OLD.action IN ('workorder.evidence','workorder.annotate'))
 )
)
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;



CREATE UNIQUE INDEX gk_resource_grants_active_scope ON gk_resource_grants(grantee_id,site_id,kind,target_id,name) WHERE active=1;
CREATE TRIGGER gk_resource_grant_scope_immutable BEFORE UPDATE ON gk_resource_grants
WHEN (NEW.id<>OLD.id OR NEW.grantee_id<>OLD.grantee_id OR NEW.site_id<>OLD.site_id OR NEW.kind<>OLD.kind OR NEW.target_id<>OLD.target_id OR NEW.name<>OLD.name)
 AND NOT (EXISTS(SELECT 1 FROM gk_guard WHERE code='qualification_erasure' AND ok=1)
  AND OLD.kind='qualification' AND NEW.id=OLD.id AND NEW.grantee_id=OLD.grantee_id
  AND NEW.site_id=OLD.site_id AND NEW.kind=OLD.kind AND NEW.target_id='' AND NEW.name='' AND NEW.active=0)
BEGIN SELECT RAISE(ABORT,'gasket_immutable'); END;
