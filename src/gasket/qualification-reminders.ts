import type { Bindings } from '../auth.server'
import { automationAuthority } from './automation-context'
import { all, commit, newId, now, stmt, type Row } from './core'
import { addDays } from './dates'
import { QUALIFICATION_PROVENANCE } from './safety'

/** Minimal owner-held evidence captured before the job; no private certificate reference. */
export async function qualificationReminderInputs(env: Bindings) {
  return {
    qualifications: await all(env,`SELECT q.member_id,q.name,q.record_id,q.expires_on,q.remind_days,q.remind_days IS NOT NULL AS consent,m.name AS person
      FROM gk_qualifications q JOIN gk_members m ON m.id=q.member_id WHERE m.status='active' ORDER BY q.member_id,q.name`),
    owners: await all(env,"SELECT m.id FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.status='active' AND m.role='owner' AND o.status='active' AND o.role='owner' ORDER BY m.id"),
  }
}

/** Explicit owner opt-in; execution consumes the exact retained input and rechecks consent. */
export async function remindQualifications(env: Bindings, day: string, input: {qualifications: Row[]; owners: Row[]}) {
  const authority=automationAuthority(), {qualifications:rows,owners}=input
  const statements=rows.flatMap(q=>{
    if(!q.consent||q.remind_days===null||day<addDays(q.expires_on,-q.remind_days))return []
    const stage=q.expires_on<day?'expired':'due'
    const text=`${q.name} for ${q.person} ${stage==='expired'?'expired':'expires'} on ${q.expires_on}. Review renewal evidence. ${QUALIFICATION_PROVENANCE}`
    return owners.map(owner=>stmt(env,`INSERT OR IGNORE INTO gk_qualification_reminders(id,record_id,recipient_id,stage,text,created_at,automation_job_id) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM gk_qualifications q JOIN gk_members m ON m.id=q.member_id WHERE q.member_id=? AND q.name=? AND q.record_id=? AND q.expires_on=? AND q.remind_days=? AND m.status='active') AND EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=? AND m.status='active' AND m.role='owner' AND o.status='active' AND o.role='owner')`,newId(),q.record_id,owner.id,stage,text,now(),authority?.job??null,q.member_id,q.name,q.record_id,q.expires_on,q.remind_days,owner.id))
  })
  if(statements.length)await commit(env,statements,[])
}
