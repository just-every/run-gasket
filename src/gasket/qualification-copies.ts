// Qualification erasure also removes retained job inputs. Opaque record fences
// prevent a delayed scheduler capture from writing an erased reference again.
export const qualificationInputSql = (source: string) => `CASE
 WHEN json_type(${source},'$.qualificationReminders.qualifications')='array'
 THEN json_set(${source},'$.qualificationReminders.qualifications',json(
  (SELECT json_group_array(json(q.value)) FROM json_each(${source},'$.qualificationReminders.qualifications') q
   WHERE NOT EXISTS(SELECT 1 FROM gk_erased_qualification_records e WHERE e.record_id=json_extract(q.value,'$.record_id')))))
 ELSE ${source} END`
