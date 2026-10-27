-- Additional sites remain planned until every operational record door is scoped.
CREATE TABLE gk_sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'planned')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (state = 'planned' OR id = 'primary')
);
INSERT INTO gk_sites (id, name, timezone, state, created_at, updated_at)
  SELECT 'primary', name, timezone, 'active', created_at, updated_at FROM gk_site;
CREATE TRIGGER gk_site_registry_insert AFTER INSERT ON gk_site BEGIN
  INSERT INTO gk_sites (id, name, timezone, state, created_at, updated_at)
    VALUES ('primary', NEW.name, NEW.timezone, 'active', NEW.created_at, NEW.updated_at);
END;
CREATE TRIGGER gk_site_registry_update AFTER UPDATE OF name, timezone ON gk_site BEGIN
  UPDATE gk_sites SET name = NEW.name, timezone = NEW.timezone, revision = revision + 1,
    updated_at = NEW.updated_at WHERE id = 'primary';
END;
CREATE TABLE gk_site_memberships (
  site_id TEXT NOT NULL REFERENCES gk_sites(id),
  member_id TEXT NOT NULL REFERENCES gk_members(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
  manager INTEGER NOT NULL DEFAULT 0 CHECK (manager IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (site_id, member_id)
);
INSERT INTO gk_site_memberships (site_id, member_id, status, updated_at)
  SELECT 'primary', m.id, m.status, m.created_at FROM gk_members m JOIN gk_sites s ON s.id = 'primary';
CREATE TRIGGER gk_site_initial_members AFTER INSERT ON gk_sites WHEN NEW.id = 'primary' BEGIN
  INSERT INTO gk_site_memberships (site_id, member_id, status, updated_at)
    SELECT NEW.id, id, status, created_at FROM gk_members;
END;
CREATE TRIGGER gk_site_new_member AFTER INSERT ON gk_members BEGIN
  INSERT INTO gk_site_memberships (site_id, member_id, status, updated_at)
    SELECT id, NEW.id, NEW.status, NEW.created_at FROM gk_sites WHERE id = 'primary';
END;
CREATE TRIGGER gk_site_returning_member AFTER UPDATE OF status ON gk_members
  WHEN NEW.status = 'active' AND OLD.status = 'ended' BEGIN
  UPDATE gk_site_memberships SET status = 'active', revision = revision + 1,
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
    WHERE site_id = 'primary' AND member_id = NEW.id;
END;
CREATE TRIGGER gk_site_ended_member AFTER UPDATE OF status ON gk_members
  WHEN NEW.status = 'ended' BEGIN
  UPDATE gk_site_memberships SET status = 'ended', revision = revision + 1,
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE member_id = NEW.id;
END;
