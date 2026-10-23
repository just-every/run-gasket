// Work retains its original operator reports without publishing private contact
// details. Necessary fault evidence is admitted only to its planners/reviewers,
// assignee and collaborators; unrelated members learn nothing from this door.
import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { all, one } from './core'
export async function requestWorkAccess(env:Bindings,actor:Actor,workId:string) {
  if(can(actor,'work.assign') || can(actor,'work.review'))return true
  return Boolean(await one(env,`SELECT 1 FROM gk_work_orders w WHERE w.id=? AND (w.assignee_id=? OR EXISTS(SELECT 1 FROM gk_collaborators c WHERE c.work_order_id=w.id AND c.member_id=? AND c.removed_at IS NULL))`,workId,actor.id,actor.id))
}
export async function requestSources(env:Bindings,actor:Actor,workId:string) {
  if(!await requestWorkAccess(env,actor,workId))return []
  const requests=await all(env,`SELECT r.id,r.number,r.description,r.created_at,r.requester_id,r.duplicate_of,r.answers_json,r.form_json,m.name AS requester_name,t.name AS target FROM gk_requests r LEFT JOIN gk_members m ON m.id=r.requester_id JOIN gk_request_targets t ON t.id=r.target_id WHERE r.work_order_id=? ORDER BY r.number`,workId)
  return await Promise.all(requests.map(async r=>({...r,answers:JSON.parse(r.answers_json),form:JSON.parse(r.form_json),files:await all(env,'SELECT id,filename,sha256,media_type,size FROM gk_request_files WHERE request_id=? ORDER BY id',r.id)})))
}
