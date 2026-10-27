-- Give each original qualification a distinct identity without changing immutable sign-offs.
UPDATE gk_qualifications
SET record_id='legacy-' || hex(member_id) || '-' || hex(name)
WHERE record_id='legacy';
