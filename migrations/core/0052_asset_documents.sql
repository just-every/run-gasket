-- ASSET-003: an asset's documents (OEM manuals, diagrams, warranties,
-- authorizations such as permits, licences and certificates, and others), each
-- a series of numbered revisions that never change, with the publisher and
-- reference the file came from. A document may expire: its named owner gets an
-- in-app notice when it is within its reminder days and again when it has
-- expired. Work pins the revision it was given, so a later revision of the
-- master never changes what issued work shows or packs. Supplier and service
-- contacts sit on the asset; commissioning stays in gk_asset_lifecycle.
CREATE TABLE gk_documents (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  kind TEXT NOT NULL CHECK (kind IN ('manual', 'diagram', 'warranty', 'authorization', 'other')),
  title TEXT NOT NULL,
  current_revision INTEGER NOT NULL DEFAULT 1,
  expires_on TEXT,
  owner_id TEXT REFERENCES gk_members(id),
  remind_days INTEGER NOT NULL DEFAULT 30 CHECK (remind_days BETWEEN 0 AND 365),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (expires_on IS NULL OR owner_id IS NOT NULL)
);
CREATE INDEX gk_documents_asset ON gk_documents(asset_id, kind, title);
CREATE INDEX gk_documents_expiry ON gk_documents(expires_on) WHERE expires_on IS NOT NULL;

CREATE TABLE gk_document_revisions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES gk_documents(id),
  revision INTEGER NOT NULL,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  bytes BLOB NOT NULL,
  source TEXT NOT NULL,
  note TEXT,
  added_by TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  UNIQUE (document_id, revision)
);
CREATE TRIGGER gk_document_revisions_keep BEFORE UPDATE ON gk_document_revisions BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_document_revisions_stay BEFORE DELETE ON gk_document_revisions BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_work_documents (
  work_order_id TEXT NOT NULL REFERENCES gk_work_orders(id),
  document_id TEXT NOT NULL REFERENCES gk_documents(id),
  revision_id TEXT NOT NULL REFERENCES gk_document_revisions(id),
  linked_by TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (work_order_id, document_id)
);

CREATE TABLE gk_asset_contacts (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES gk_assets(id),
  role TEXT NOT NULL CHECK (role IN ('supplier', 'manufacturer', 'service', 'other')),
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX gk_asset_contacts_asset ON gk_asset_contacts(asset_id, role, name);

-- The owner's expiry reminder is an asset notice of a new kind.
PRAGMA defer_foreign_keys = true;
CREATE TABLE gk_notices_next (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  work_order_id TEXT REFERENCES gk_work_orders(id),
  asset_id TEXT REFERENCES gk_assets(id),
  comment_id TEXT REFERENCES gk_comments(id),
  kind TEXT NOT NULL CHECK (kind IN ('reminder', 'overdue', 'escalation_lead', 'escalation_supervisor', 'blocker_missed', 'declined', 'mention', 'expiry')),
  occasion TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (recipient_id, occasion),
  CHECK ((work_order_id IS NULL) <> (asset_id IS NULL))
);
INSERT INTO gk_notices_next (id, recipient_id, work_order_id, asset_id, comment_id, kind, occasion, text, created_at) SELECT id, recipient_id, work_order_id, asset_id, comment_id, kind, occasion, text, created_at FROM gk_notices;
DROP TABLE gk_notices;
ALTER TABLE gk_notices_next RENAME TO gk_notices;
CREATE INDEX gk_notices_recipient ON gk_notices(recipient_id, created_at);
