import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { all, insist, one } from './core'
import { resourceGrants } from './resource-authority'
import { planningView } from './planning'
import { QUALIFICATION_PROVENANCE } from './safety'

export async function resourceRecords(env: Bindings, actor: Actor, url: URL) {
  const grants=await resourceGrants(env,actor), own=grants.filter(g=>g.grantee_id===actor.id&&g.effective)
  const planner=can(actor,'work.assign')
  insist(planner||own.length,'forbidden',403)
  const authorized=(kind:string,target:string,name:string)=>actor.role==='owner'||own.some(g=>g.kind===kind&&g.target_id===target&&g.name.toLowerCase()===name.toLowerCase())
  const data:Awaited<ReturnType<typeof planningView>>=planner?await planningView(env,actor,url):{
    revision:(await one(env,'SELECT revision FROM gk_planning_state WHERE singleton=1')).revision,
    people:await all(env,`SELECT id,name FROM gk_members WHERE id IN (SELECT target_id FROM gk_resource_grants WHERE grantee_id=? AND kind='qualification') ORDER BY name`,actor.id),
    qualifications:(await all(env,'SELECT member_id,name,expires_on,recorded_at FROM gk_qualifications ORDER BY name,member_id')).filter(q=>authorized('qualification',q.member_id,q.name)).map(q=>({member_id:q.member_id,name:q.name,expires_on:q.expires_on,recorded_at:q.recorded_at,provenance:QUALIFICATION_PROVENANCE,expired:q.expires_on<actor.today})),
    tools:(await all(env,'SELECT * FROM gk_planning_tools ORDER BY name')).filter(t=>authorized('tool','',t.name)),
    windows:[],work:[],retired:[],from:actor.today,end:actor.today,days:0,utilization:[],teams:[],
    site:{availableMinutes:0,unavailableMinutes:0,capacityMinutes:0,assignedMinutes:0,productiveMinutes:0},
  }
  if(!planner) data.people=data.people.filter(p=>own.some(g=>g.kind==='qualification'&&g.target_id===p.id))
  return {...data,canPlan:planner,grants:actor.role==='owner'?grants:own,ownGrants:own,
    siteName:(await one(env,"SELECT name FROM gk_sites WHERE id='primary'"))?.name,
    stewardPeople:actor.role==='owner'?await all(env,"SELECT id,name FROM gk_members WHERE status='active' AND role IN ('lead','maintainer','supervisor') ORDER BY name"):[],
    qualifications:data.qualifications.map(q=>({...q,maintainable:authorized('qualification',q.member_id,q.name)})),
    tools:data.tools.map(t=>({...t,maintainable:authorized('tool','',t.name)}))}
}
