-- D1 read cost: what the 15-minute scheduler and the Today page read stays flat as history grows.
-- A run that did nothing is marked idle, and past 30 days it is removed. A run that did something is kept.
ALTER TABLE gk_automation_jobs ADD COLUMN idle INTEGER NOT NULL DEFAULT 0 CHECK (idle IN (0,1));
UPDATE gk_automation_jobs SET idle=1
 WHERE state IN ('completed','paused') AND recovered_by IS NULL
  AND (output IS NULL OR NOT EXISTS (SELECT 1 FROM json_each(output) o
   WHERE NOT (o.type IN ('null','false') OR (o.type='array' AND json_array_length(o.value)=0) OR (o.type='object' AND o.value='{}')
    OR (o.type IN ('integer','real') AND o.value=0) OR (o.type='text' AND o.value=''))));
-- The interrupted-attempt check and its recovery look only at running PM jobs and at the jobs that recovered.
CREATE INDEX gk_automation_jobs_state ON gk_automation_jobs(rule_id,state);
CREATE INDEX gk_automation_jobs_recovered ON gk_automation_jobs(recovered_by) WHERE recovered_by IS NOT NULL;
-- The ledger page and Recent executions walk newest first; retention walks oldest first.
CREATE INDEX gk_automation_jobs_started ON gk_automation_jobs(started_at,id);
-- Each run's own notices, reminders and events are found by job, never by scanning the table.
CREATE INDEX gk_notices_job ON gk_notices(automation_job_id) WHERE automation_job_id IS NOT NULL;
CREATE INDEX gk_qualification_reminders_job ON gk_qualification_reminders(automation_job_id) WHERE automation_job_id IS NOT NULL;
CREATE INDEX gk_request_escalations_job ON gk_request_escalations(automation_job_id) WHERE automation_job_id IS NOT NULL;
CREATE INDEX gk_replenishments_job ON gk_replenishments(automation_job_id);
CREATE INDEX gk_replenishment_events_job ON gk_replenishment_events(automation_job_id);
CREATE INDEX gk_replenishment_envelope_uses_job ON gk_replenishment_envelope_uses(automation_job_id);
CREATE INDEX gk_vendor_reminders_job ON gk_vendor_reminders(automation_job_id);
CREATE INDEX gk_connector_attempts_job ON gk_connector_attempts(automation_job_id);
-- Today's latest changes read the newest audit rows, not the whole trail.
CREATE INDEX gk_audit_recent ON gk_audit(at DESC,seq DESC);
