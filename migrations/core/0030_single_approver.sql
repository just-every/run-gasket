-- PM-003 (ct 19 Oct 02:55Z): on a site with one owner and no supervisor, the
-- owner may approve their own skip or deferral after an explicit second
-- confirmation; the decision is labelled single-approver.
ALTER TABLE gk_schedule_exceptions ADD COLUMN single_approver INTEGER NOT NULL DEFAULT 0;
