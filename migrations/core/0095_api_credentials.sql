CREATE TABLE gk_api_credentials (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES gk_members(id),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
