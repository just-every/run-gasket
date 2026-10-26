-- Retry receipts keep only hashes and bounded action results, never input bodies.
CREATE TABLE gk_api_writes (
  actor_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  role TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'completed', 'failed')),
  result_json TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (actor_id, key_hash)
);
