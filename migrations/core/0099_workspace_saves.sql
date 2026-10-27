CREATE TABLE gk_form_saves (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  action TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  state TEXT NOT NULL CHECK (state IN ('running', 'saved', 'failed')),
  batches INTEGER NOT NULL DEFAULT 0,
  destination TEXT NOT NULL DEFAULT ''
);
CREATE INDEX gk_form_saves_member ON gk_form_saves(member_id);
