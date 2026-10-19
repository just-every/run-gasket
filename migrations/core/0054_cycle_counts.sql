-- PART-004: planned blind cycle counts. A lead or the owner plans a count of
-- one shelf location (or chosen parts) for one counter; the count sheet never
-- shows its counter the expected quantity. Each line keeps the on-hand and
-- movement sequence at the moment the count was submitted, so movements during
-- and after the count reconcile instead of being undone: an approved variance
-- posts counted minus that expected quantity. Variances valued at or above
-- the site's approval threshold wait for a lead or owner other than the
-- counter; smaller ones post at submission. Lost, found and damaged stock
-- carry their reason on the movement, valued by PART-007.
CREATE TABLE gk_counts (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  location TEXT,
  counter_id TEXT NOT NULL REFERENCES gk_members(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted')),
  planned_by TEXT NOT NULL,
  planned_at INTEGER NOT NULL,
  submitted_at INTEGER
);

CREATE TABLE gk_count_lines (
  id TEXT PRIMARY KEY,
  count_id TEXT NOT NULL REFERENCES gk_counts(id),
  part_id TEXT NOT NULL REFERENCES gk_parts(id),
  position INTEGER NOT NULL,
  counted_milli INTEGER,
  expected_milli INTEGER,
  seen_seq INTEGER,
  reason TEXT CHECK (reason IS NULL OR reason IN ('lost', 'found', 'damaged')),
  note TEXT,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'matched', 'posted', 'waiting', 'approved', 'rejected')),
  move_id TEXT,
  decided_by TEXT,
  decided_at INTEGER,
  decision_note TEXT,
  UNIQUE (count_id, part_id),
  UNIQUE (count_id, position)
);
CREATE INDEX gk_count_lines_part ON gk_count_lines(part_id);

ALTER TABLE gk_part_moves ADD COLUMN reason TEXT CHECK (reason IS NULL OR reason IN ('lost', 'found', 'damaged'));
ALTER TABLE gk_part_moves ADD COLUMN count_line_id TEXT;
ALTER TABLE gk_site ADD COLUMN count_approval_cents INTEGER NOT NULL DEFAULT 0 CHECK (count_approval_cents >= 0);
