-- GAS-09: a corrective finding names the checklist step it answers (its index in
-- the work order's pinned revision); NULL is a finding on the whole work order.
-- Submission needs a linked finding for every failed or needs-attention step.
ALTER TABLE gk_findings ADD COLUMN item INTEGER;
