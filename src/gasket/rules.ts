// PLAN-009: single-site versioned grants, historical read-only preview and bounded event execution.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, commit, GasketError, guard, insist, newId, now, one, stmt, type Row } from './core'
import { siteZone } from './actor'
import { today } from './dates'
import type { Input } from './input'
import { definitionOf, matches, conflictKey, RULE_ACTIONS, RULE_TRIGGERS, type Definition, type RuleEvent, type RuleAction } from './rules-definition'
import { ruleFacts } from './rules-facts'
import { prepareAction } from './rules-actions'
export type { RuleEvent } from './rules-definition'
const MAX_EVENTS=32,MAX_DEPTH=8
export const rulesManager=(actor:Actor)=>insist(['owner','lead'].includes(actor.role),'forbidden',403)
const ownerSql="EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=? AND m.status='active' AND o.status='active' AND (o.role='owner' OR m.role='lead'))"
const activeRules=async(env:Bindings)=> (await all(env,'SELECT r.*,v.definition FROM gk_rules r JOIN gk_rule_revisions v ON v.rule_id=r.id AND v.revision=r.revision')).map(row=>({...row,definition:JSON.parse(row.definition) as Definition})).sort((a,b)=>a.definition.priority-b.definition.priority || a.id.localeCompare(b.id))
async function ownerActor(env:Bindings,id:string):Promise<Actor> {
 const m=await one(env,"SELECT m.*,o.role AS operator_role FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=? AND m.status='active' AND o.status='active'",id)
 insist(m && (m.operator_role==='owner' || m.role==='lead'),'rule_owner_authority_revoked',403)
 const zone=await siteZone(env)
 return {id:m.id,name:m.name,email:m.email,role:m.operator_role==='owner'?'owner':'lead',sessionId:'',zone,today:today(zone)}
}
async function validateReferences(env:Bindings,d:Definition) {
 for(const c of d.conditions)if(c.field.startsWith('custom:')) {
  const id=c.field.slice(7)
  insist(await one(env,'SELECT 1 FROM gk_custom_fields WHERE id=? AND retired=0',id) || await one(env,'SELECT 1 FROM gk_work_fields WHERE id=? AND retired_at IS NULL',id),'field_not_found',404)
 }
 for(const a of d.actions) {
  if(a.team)insist(await one(env,'SELECT 1 FROM gk_teams WHERE id=?',a.team),'team_not_found',404)
  if(a.person)await import('./crew').then(m=>m.assigneeFits(env,a.person!,a.team||null))
  for(const id of a.people??[])insist(await one(env,"SELECT 1 FROM gk_members WHERE id=? AND status='active' AND role<>'agent'",id),'rule_recipient_unavailable')
  if(a.type==='procedure')insist(await one(env,'SELECT 1 FROM gk_checklists WHERE id=?',a.value),'checklist_not_found',404)
 }
}
export async function saveRule(env:Bindings,actor:Actor,input:Input) {
 rulesManager(actor)
 const id=input.text('rule',{optional:true})||newId(),existing=await one(env,'SELECT * FROM gk_rules WHERE id=?',id)
 if(existing)insist(input.integer('revision',{min:1})===existing.revision,'stale',409)
 const definition=definitionOf(input),reason=input.text('reason',{max:1000}),revision=(existing?.revision??0)+1
 await validateReferences(env,definition)
 // Editing never silently adopts someone else's authority; only the owner or the author edits a grant.
 if(existing)insist(actor.role==='owner' || existing.owner_id===actor.id,'rule_not_yours',403)
 const owner=existing?.owner_id??actor.id
 await commit(env,[guard(env,'rule_owner_authority_revoked',ownerSql,owner),
  ...(existing?[guard(env,'stale','EXISTS(SELECT 1 FROM gk_rules WHERE id=? AND revision=?)',id,existing.revision),stmt(env,'UPDATE gk_rules SET revision=?,paused=1,changed_at=? WHERE id=?',revision,now(),id)]:[stmt(env,'INSERT INTO gk_rules(id,owner_id,revision,paused,changed_at) VALUES(?,?,?,1,?)',id,owner,revision,now())]),
  stmt(env,'INSERT INTO gk_rule_revisions(rule_id,revision,definition,paused,reason,actor,at) VALUES(?,?,?,1,?,?,?)',id,revision,JSON.stringify(definition),reason,actor.id,now())],
 {actor:actor.id,action:'rules.save',subject:id,detail:{revision,owner,paused:true,reason,definition}})
 return {id,revision,paused:true}
}
export async function controlRule(env:Bindings,actor:Actor,input:Input) {
 rulesManager(actor)
 const id=input.text('rule'),r=await one(env,'SELECT r.*,v.definition FROM gk_rules r JOIN gk_rule_revisions v ON v.rule_id=r.id AND v.revision=r.revision WHERE r.id=?',id)
 insist(r,'rule_not_found',404);insist(actor.role==='owner'||r.owner_id===actor.id,'rule_not_yours',403)
 const revision=input.integer('revision',{min:1}),reason=input.text('reason',{max:1000})
 if(input.flag('catchUp')) {
  // Catch-up claims precisely the saved grant the operator saw; stale attempts remain visible failures.
  const run=newId(),event=input.text('event'),source=await one(env,'SELECT * FROM gk_rule_events WHERE id=?',event)
  insist(source,'rule_event_not_found',404)
  if(r.revision!==revision || r.paused) {
   const attempt=newId()
   await env.DB.batch([stmt(env,"INSERT INTO gk_rule_events(id,source_id,trigger,entity_type,entity_id,source,occurred_at,input,completed_at,error) VALUES(?,?,?,?,?,'catch-up',?,?,?,?)",attempt,`failed:${attempt}`,source.trigger,source.entity_type,source.entity_id,now(),source.input,now(),r.revision!==revision?'stale':'rule_paused'),stmt(env,"INSERT INTO gk_rule_runs(id,event_id,rule_id,revision,source,input,started_at,finished_at,outcome,error) VALUES(?,?,?,?,'catch-up',?,?,?,'failed',?)",run,attempt,id,revision,source.input,now(),now(),r.revision!==revision?'stale':'rule_paused')])
   throw new GasketError(r.revision!==revision?'stale':'rule_paused',409)
  }
  insist(!await one(env,"SELECT 1 FROM gk_rule_runs WHERE event_id=? AND rule_id=? AND outcome='completed'",event,id),'rule_event_already_completed',409)
  return runRules(env,{trigger:source.trigger,entityType:source.entity_type,entityId:source.entity_id,sourceId:`catch-up:${id}:${revision}:${source.id}`,source:'catch-up',at:source.occurred_at},{only:id,expectedRevision:revision!})
 }
 insist(r.revision===revision,'stale',409)
 const paused=input.flag('paused'),next=revision!+1
 await commit(env,[guard(env,'stale','EXISTS(SELECT 1 FROM gk_rules WHERE id=? AND revision=?)',id,revision),
  ...(!paused?[guard(env,'rule_owner_authority_revoked',ownerSql,r.owner_id)]:[]),
  stmt(env,'UPDATE gk_rules SET revision=?,paused=?,changed_at=? WHERE id=?',next,Number(paused),now(),id),
  stmt(env,'INSERT INTO gk_rule_revisions(rule_id,revision,definition,paused,reason,actor,at) VALUES(?,?,?,?,?,?,?)',id,next,r.definition,Number(paused),reason,actor.id,now())],
 {actor:actor.id,action:'rules.control',subject:id,detail:{revision:next,paused,reason}})
 return {id,revision:next,paused}
}
function candidates(rules:Row[],event:RuleEvent,facts:Row,includePaused=false) {
 const used=new Map<string,string>()
 return rules.filter(r=>r.definition.trigger===event.trigger && (includePaused || !r.paused) && matches(r.definition,facts)).map(rule=>{
  const conflicts:Row[]=[],actions:RuleAction[]=[]
  for(const action of rule.definition.actions) {
   const key=conflictKey(action),winner=key?used.get(key):null
   if(winner)conflicts.push({field:key,winner,loser:rule.id,action})
   else { actions.push(action);if(key)used.set(key,rule.id) }
  }
  return {rule,actions,conflicts}
 })
}
export async function previewRule(env:Bindings,actor:Actor,input:Input) {
 rulesManager(actor)
 const rules=await activeRules(env),id=input.text('rule'),rule=rules.find(r=>r.id===id)
 insist(rule,'rule_not_found',404)
 if(input.has('revision'))insist(input.integer('revision',{min:1})===rule.revision,'stale',409)
 const from=input.integer('from',{min:0,max:9_000_000_000_000,optional:true})??now()-7*86400000,to=input.integer('to',{min:0,max:9_000_000_000_000,optional:true})??now()
 insist(from<=to,'invalid_rule_period')
 const recorded=await all(env,'SELECT * FROM gk_rule_events WHERE occurred_at>=? AND occurred_at<=? AND trigger=? ORDER BY occurred_at DESC,id LIMIT 200',from,to,rule.definition.trigger)
 const rows:Row[]=recorded.map(e=>({event:e.id,entityId:e.entity_id,at:e.occurred_at,basis:'retained_event_snapshot',facts:JSON.parse(e.input),trigger:e.trigger}))
 // Existing requests are inspectable before the engine was installed. Report that their fields are current.
 if(rule.definition.trigger==='request.submitted')for(const r of await all(env,'SELECT id,created_at FROM gk_requests WHERE erased_at IS NULL AND created_at>=? AND created_at<=? ORDER BY created_at DESC,id LIMIT 200',from,to)) {
  if(rows.some(e=>e.entityId===r.id))continue
  rows.push({event:null,entityId:r.id,at:r.created_at,basis:'current_fields_of_recent_request',trigger:rule.definition.trigger,facts:await ruleFacts(env,{trigger:rule.definition.trigger,entityType:'request',entityId:r.id,at:r.created_at})})
 }
 const scope=rules.map(r=>r.id===id?{...r,paused:0}:r)
 return {id,revision:rule.revision,preview:true,writes:0,from,to,limit:200,rows:rows.slice(0,200).map(r=>{
  const proposed=candidates(scope,{trigger:r.trigger,entityType:'request',entityId:r.entityId},r.facts).find(p=>p.rule.id===id)
  return {...r,matched:Boolean(proposed),actions:proposed?.actions??[],conflicts:proposed?.conflicts??[]}
 })}
}
export async function rulesView(env:Bindings,actor:Actor,_url?:URL) {
 rulesManager(actor)
 const [rules,runs,events,revisions,actions,notices]=await Promise.all([activeRules(env),all(env,'SELECT * FROM gk_rule_runs ORDER BY started_at DESC,id LIMIT 100'),all(env,'SELECT * FROM gk_rule_events ORDER BY occurred_at DESC,id LIMIT 100'),all(env,'SELECT * FROM gk_rule_revisions ORDER BY at DESC LIMIT 200'),all(env,'SELECT * FROM gk_rule_actions ORDER BY at DESC LIMIT 200'),all(env,'SELECT * FROM gk_rule_notices ORDER BY created_at DESC LIMIT 100')])
 const decode=(rows:Row[],keys:string[])=>rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,keys.includes(k)&&v?JSON.parse(v):v])))
 const last=runs.filter(r=>r.outcome==='completed').reduce((n,r)=>Math.max(n,r.finished_at??0),0),lastTrigger=events.reduce((n,e)=>Math.max(n,e.occurred_at),0)
 return {site:'current',order:'Ascending priority, then rule id; first action for a conflicting field wins',limits:{events:MAX_EVENTS,depth:MAX_DEPTH},triggers:RULE_TRIGGERS,supportedActions:RULE_ACTIONS,
  rules:rules.map(r=>({...r,paused:Boolean(r.paused)})),runs:decode(runs,['input','conflicts']),events:decode(events,['input']),revisions:decode(revisions,['definition']),actions:decode(actions,['input','output']),notices,
  health:{lastTrigger:lastTrigger||null,nextTrigger:(Math.floor(now()/900000)+1)*900000,lastSuccess:last||null,missed:last?now()-last>45*60000:false,paused:rules.filter(r=>r.paused).length,
   pending:events.filter(e=>!e.completed_at).length,running:runs.filter(r=>r.outcome==='running').length,failed:runs.filter(r=>r.outcome==='failed').length,externalDelivery:'unavailable',inAppDelivery:'synchronous'}}
}
export async function runRules(env:Bindings,event:RuleEvent,options:{only?:string;expectedRevision?:number}={}) {
 insist(Object.hasOwn(RULE_TRIGGERS,event.trigger),'invalid_rule_trigger')
 const types:Record<string,string[]>={'request.submitted':['request'],'work.created':['work'],'work.status_changed':['work'],'work.overdue':['work'],'asset.status_changed':['asset'],'meter.recorded':['reading'],'part.below_minimum':['part'],'checklist.failed':['result','work']}
 insist(types[event.trigger].includes(event.entityType),'invalid_rule_source')
 const queue:{event:RuleEvent;parent:string|null;depth:number;ancestors:Set<string>}[]=[{event,parent:null,depth:0,ancestors:new Set()}],outcomes:Row[]=[]
 let count=0
 while(queue.length) {
  const item=queue.shift()!,e=item.event,id=newId(),source=e.sourceId??`${e.trigger}:${e.entityId}:${e.at??now()}`
  const seen=await one(env,'SELECT id FROM gk_rule_events WHERE source_id=?',source)
  if(seen) {outcomes.push({event:seen.id,replayed:true});continue}
  const facts=await ruleFacts(env,e),input=JSON.stringify(facts)
  await env.DB.batch([stmt(env,'INSERT OR IGNORE INTO gk_rule_events(id,source_id,trigger,entity_type,entity_id,source,occurred_at,input,parent_id,depth) VALUES(?,?,?,?,?,?,?,?,?,?)',id,source,e.trigger,e.entityType,e.entityId,e.source??'event',e.at??now(),input,item.parent,item.depth)])
  if(!(await one(env,'SELECT 1 FROM gk_rule_events WHERE id=?',id)))continue
  if(++count>MAX_EVENTS || item.depth>MAX_DEPTH) {
   await env.DB.batch([stmt(env,'UPDATE gk_rule_events SET completed_at=?,error=? WHERE id=?',now(),'rule_loop_limit',id)])
   outcomes.push({event:id,error:'rule_loop_limit'});continue
  }
  const rules=(await activeRules(env)).filter(r=>!options.only||r.id===options.only)
  const matched=candidates(rules,e,facts,true),winning=candidates(rules,e,facts)
  for(const candidate of matched) {
   const {rule}=candidate,run=newId(),chosen=winning.find(c=>c.rule.id===rule.id),conflicts=chosen?.conflicts??[]
   const signature=`${rule.id}:${e.entityType}:${e.entityId}`
   let error:string|null=null
   await env.DB.batch([stmt(env,'INSERT INTO gk_rule_runs(id,event_id,rule_id,revision,source,input,started_at,outcome,conflicts) VALUES(?,?,?,?,?,?,?,?,?)',run,id,rule.id,rule.revision,e.source??'event',input,now(),rule.paused?'paused':'running',JSON.stringify(conflicts))])
   try {
    if(rule.paused)continue
    insist(!options.expectedRevision||options.expectedRevision===rule.revision,'stale',409)
    insist(!item.ancestors.has(signature),'rule_loop_detected',409)
    const actor=await ownerActor(env,rule.owner_id)
    for(const [position,a] of (chosen?.actions??[]).entries()) {
     const action=newId(),provenance={rule:rule.id,revision:rule.revision,event:id,run,action,source:e.source??'event'}
     const current=await ruleFacts(env,e),prepared=await prepareAction(env,actor,e,current,a,provenance)
     await commit(env,[guard(env,'rule_changed','EXISTS(SELECT 1 FROM gk_rules WHERE id=? AND revision=? AND paused=0)',rule.id,rule.revision),guard(env,'rule_owner_authority_revoked',ownerSql,rule.owner_id),
      stmt(env,'INSERT INTO gk_rule_actions(id,run_id,position,rule_id,revision,input,output,at) VALUES(?,?,?,?,?,?,?,?)',action,run,position,rule.id,rule.revision,JSON.stringify({event:e,facts:current,action:a}),JSON.stringify(prepared.output),now()),...prepared.statements],
      {actor:actor.id,action:'rules.action',subject:current.work?.id??e.entityId,detail:{...provenance,action:a,result:prepared.output,input:current}})
     for(const [i,child] of prepared.events.entries())queue.push({event:{...child,sourceId:`${action}:${i}`,source:e.source??'event',at:e.at??now()},parent:id,depth:item.depth+1,ancestors:new Set([...item.ancestors,signature])})
    }
   } catch(cause) {error=cause instanceof GasketError?cause.code:cause instanceof Error?cause.message:'rule_failed'}
   finally {
    await env.DB.batch([stmt(env,'UPDATE gk_rule_runs SET outcome=?,error=?,finished_at=? WHERE id=?',error?'failed':rule.paused?'paused':'completed',error,now(),run)])
    outcomes.push({event:id,rule:rule.id,revision:rule.revision,run,outcome:error?'failed':rule.paused?'paused':'completed',error,conflicts})
   }
  }
  await env.DB.batch([stmt(env,'UPDATE gk_rule_events SET completed_at=?,error=? WHERE id=?',now(),outcomes.find(r=>r.event===id&&r.error)?.error??null,id)])
 }
 return {outcomes}
}
