-- Direct conversations have two fixed participants and retained original text.
CREATE TABLE gk_conversations (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES gk_sites(id) CHECK (site_id = 'primary'),
  member_low TEXT NOT NULL REFERENCES gk_members(id),
  member_high TEXT NOT NULL REFERENCES gk_members(id),
  created_by TEXT NOT NULL REFERENCES gk_members(id),
  created_at INTEGER NOT NULL,
  CHECK (member_low < member_high),
  CHECK (created_by IN (member_low, member_high)),
  UNIQUE (site_id, member_low, member_high)
);
CREATE TABLE gk_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES gk_conversations(id),
  author_id TEXT NOT NULL REFERENCES gk_members(id),
  author_name TEXT NOT NULL,
  submission_key TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at INTEGER NOT NULL,
  UNIQUE (author_id, submission_key)
);
CREATE INDEX gk_messages_conversation ON gk_messages(conversation_id, seq);
CREATE TABLE gk_message_reads (
  conversation_id TEXT NOT NULL REFERENCES gk_conversations(id),
  member_id TEXT NOT NULL REFERENCES gk_members(id),
  read_seq INTEGER NOT NULL DEFAULT 0 CHECK (read_seq >= 0),
  read_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, member_id)
);
CREATE TRIGGER gk_conversations_no_update BEFORE UPDATE ON gk_conversations BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_conversations_no_delete BEFORE DELETE ON gk_conversations BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_messages_no_update BEFORE UPDATE ON gk_messages BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
CREATE TRIGGER gk_messages_no_delete BEFORE DELETE ON gk_messages BEGIN SELECT RAISE(ABORT, 'gasket_immutable'); END;
