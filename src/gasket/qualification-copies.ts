// Keep unrelated historical inputs. Erasure also matches the recorded family
// because pre-identity captures can share the old legacy marker.
export const qualificationInputSql = (source: string, mode: 'capture' | 'erase') => `CASE
 WHEN json_type(${source},'$.qualificationReminders.qualifications')='array'
 THEN json_set(${source},'$.qualificationReminders.qualifications',json(
  (SELECT json_group_array(json(q.value)) FROM json_each(${source},'$.qualificationReminders.qualifications') q
   WHERE NOT EXISTS(SELECT 1 FROM gk_erased_qualification_records e WHERE e.record_id=json_extract(q.value,'$.record_id'))
   ${mode==='erase'?`AND NOT COALESCE(json_extract(q.value,'$.member_id')=? AND json_extract(q.value,'$.name')=? COLLATE NOCASE,0)`:
     `AND json_type(q.value,'$.record_id')='text' AND json_extract(q.value,'$.record_id') NOT IN ('legacy','')`})))
 ELSE ${source} END`
