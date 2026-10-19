-- PLAN-006: comments, mentions and shift handoff on work orders and assets.
-- A comment belongs to one work order or one asset and keeps a site-wide
-- sequence (the order threads list in and unread state counts by). Every
-- version of its text is a kept revision; photos keep their bytes and digest;
-- mentions give the person an in-app notice that links to the comment, so
-- gk_notices takes asset and comment links and a new kind. Each person's read
-- marker per record is the highest comment sequence they have read there.
CREATE TABLE gk_comments (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL UNIQUE,
  work_order_id TEXT REFERENCES gk_work_orders(id),
  asset_id TEXT REFERENCES gk_assets(id),
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'handoff')),
  body TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES gk_members(id),
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  CHECK ((work_order_id IS NULL) <> (asset_id IS NULL))
);
CREATE INDEX gk_comments_work ON gk_comments(work_order_id, seq);
CREATE INDEX gk_comments_asset ON gk_comments(asset_id, seq);

CREATE TABLE gk_comment_revisions (
  comment_id TEXT NOT NULL REFERENCES gk_comments(id),
  number INTEGER NOT NULL,
  body TEXT NOT NULL,
  edited_by TEXT NOT NULL,
  edited_at INTEGER NOT NULL,
  PRIMARY KEY (comment_id, number)
);
CREATE TRIGGER gk_comment_revisions_keep BEFORE UPDATE ON gk_comment_revisions BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_comment_mentions (
  comment_id TEXT NOT NULL REFERENCES gk_comments(id),
  member_id TEXT NOT NULL REFERENCES gk_members(id),
  PRIMARY KEY (comment_id, member_id)
);

CREATE TABLE gk_comment_photos (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES gk_comments(id),
  position INTEGER NOT NULL,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  bytes BLOB NOT NULL,
  uploaded_at INTEGER NOT NULL,
  UNIQUE (comment_id, position)
);
CREATE TRIGGER gk_comment_photos_keep BEFORE UPDATE ON gk_comment_photos BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;

CREATE TABLE gk_comment_reads (
  member_id TEXT NOT NULL REFERENCES gk_members(id),
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('work', 'asset')),
  subject_id TEXT NOT NULL,
  read_seq INTEGER NOT NULL,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, subject_kind, subject_id)
);

PRAGMA defer_foreign_keys = true;
CREATE TABLE gk_notices_next (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  work_order_id TEXT REFERENCES gk_work_orders(id),
  asset_id TEXT REFERENCES gk_assets(id),
  comment_id TEXT REFERENCES gk_comments(id),
  kind TEXT NOT NULL CHECK (kind IN ('reminder', 'overdue', 'escalation_lead', 'escalation_supervisor', 'blocker_missed', 'declined', 'mention')),
  occasion TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (recipient_id, occasion),
  CHECK ((work_order_id IS NULL) <> (asset_id IS NULL))
);
INSERT INTO gk_notices_next (id, recipient_id, work_order_id, kind, occasion, text, created_at) SELECT id, recipient_id, work_order_id, kind, occasion, text, created_at FROM gk_notices;
DROP TABLE gk_notices;
ALTER TABLE gk_notices_next RENAME TO gk_notices;
CREATE INDEX gk_notices_recipient ON gk_notices(recipient_id, created_at);
