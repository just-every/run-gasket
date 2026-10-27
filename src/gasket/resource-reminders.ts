// Explicit owner opt-in; in-app renewal reminders never renew a reference or send externally.
import { QUALIFICATION_PROVENANCE } from './safety'
import type { Bindings } from '../auth.server'
import { automationAuthority } from './automation-context'
import { all, commit, newId, now, stmt, type Row } from './core'
import { addDays } from './dates'

export const qualificationReminderInputs = (env: Bindings) => all(env, `SELECT q.member_id,q.name,q.expires_on,q.remind_days,q.reminder_owner_id,m.name AS person
 FROM gk_qualifications q JOIN gk_members m ON m.id=q.member_id
 JOIN gk_members o ON o.id=q.reminder_owner_id JOIN oa_operators a ON a.id=o.operator_id
 WHERE q.retired_at IS NULL AND q.remind_days IS NOT NULL AND m.status='active' AND o.status='active' AND o.role='owner' AND a.status='active' AND a.role='owner'`)

export async function remindQualifications(env: Bindings, day: string, rows: Row[]) {
  const authority=automationAuthority()
  const statements=rows.flatMap(q=>{
    const state=day>q.expires_on?'expired':day>=addDays(q.expires_on,-q.remind_days)?'due':null
    if(!state)return []
    const text=`Qualification reference ${q.name} for ${q.person} ${state==='expired'?'expired after':'is due for renewal by'} ${q.expires_on}. ${QUALIFICATION_PROVENANCE}`
    return [stmt(env, `INSERT INTO gk_resource_notices(id,recipient_id,member_id,qualification_name,expires_on,state,text,created_at,automation_job_id,automation_revision)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM gk_qualifications q JOIN gk_members m ON m.id=q.member_id JOIN gk_members o ON o.id=q.reminder_owner_id JOIN oa_operators a ON a.id=o.operator_id
       WHERE q.member_id=? AND q.name=? AND q.expires_on=? AND q.remind_days=? AND q.reminder_owner_id=? AND q.retired_at IS NULL AND m.status='active' AND o.status='active' AND o.role='owner' AND a.status='active' AND a.role='owner') ON CONFLICT(recipient_id,member_id,qualification_name,expires_on,state) DO NOTHING`,
      newId(),q.reminder_owner_id,q.member_id,q.name,q.expires_on,state,text,now(),authority?.job??null,authority?.revision??null,q.member_id,q.name,q.expires_on,q.remind_days,q.reminder_owner_id)]
  })
  if(statements.length)await commit(env,statements,[])
}
