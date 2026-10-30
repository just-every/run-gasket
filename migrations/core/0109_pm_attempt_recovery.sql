-- Interrupted PM jobs retain their input and reconcile effects before catch-up.
ALTER TABLE gk_automation_jobs ADD COLUMN lease_expires_at INTEGER;
ALTER TABLE gk_automation_jobs ADD COLUMN recovered_by TEXT REFERENCES gk_automation_jobs(id);
UPDATE gk_automation_jobs SET lease_expires_at=0 WHERE rule_id='pm' AND state='running';
