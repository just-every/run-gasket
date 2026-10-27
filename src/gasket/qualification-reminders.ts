import type { Bindings } from '../auth.server'
import { automationAuthority } from './automation-context'
import { all, commit, newId, now, stmt } from './core'
import { addDays } from './dates'
import { QUALIFICATION_PROVENANCE } from './safety'

/** Explicit owner opt-in; no external delivery or automatic renewal. */
export async function remindQualifications(env: Bindings, day: string) {
  const authority=automationAuthority()
  const rows=await all(env,`SELECT q.*,m.name AS person FROM gk_qualifications q JOIN gk_members m ON m.id=q.member_id
    WHERE q.remind_days IS NOT NULL AND m.status='active'`)
  const owners=await all(env,"SELECT m.id FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.status='active' AND m.role='owner' AND o.status='active' AND o.role='owner'")
  const statements=rows.flatMap(q=>{
    if(day<addDays(q.expires_on,-q.remind_days))return []
    const stage=q.expires_on<day?'expired':'due'
    const text=`${q.name} for ${q.person} ${stage==='expired'?'expired':'expires'} on ${q.expires_on}. Review renewal evidence. ${QUALIFICATION_PROVENANCE}`
    return owners.map(owner=>stmt(env,'INSERT OR IGNORE INTO gk_qualification_reminders(id,record_id,recipient_id,stage,text,created_at,automation_job_id) VALUES(?,?,?,?,?,?,?)',newId(),q.record_id,owner.id,stage,text,now(),authority?.job??null))
  })
  if(statements.length)await commit(env,statements,[])
}
