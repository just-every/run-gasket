// Settings surface built from Gasket's shared form and table components.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, type Row } from '../core'
import { showInstant } from '../dates'
import { Input } from '../input'
import { previewRule, rulesView } from '../rules'
import { RULE_ACTIONS, RULE_TRIGGERS, CONDITION_FIELDS, type Definition, type RuleAction } from '../rules-definition'
import { card, field, form, h, hidden, select, table, tag } from './html'
import { page } from './shell'
const options=(rows:Row[])=>rows.map(r=>({value:r.id,label:r.name??r.label}))
const words=(value:string)=>value.replace(/_/g,' ')
const path='/app/settings/rules'
export async function rulesPage(env:Bindings,actor:Actor,url:URL) {
 const view=await rulesView(env,actor,url)
 const [assets,teams,people,checklists,custom,workFields]=await Promise.all([
  all(env,'SELECT id,name FROM gk_assets WHERE retired_at IS NULL ORDER BY name'),all(env,'SELECT id,name FROM gk_teams ORDER BY name'),
  all(env,"SELECT id,name FROM gk_members WHERE status='active' AND role<>'agent' ORDER BY name"),all(env,'SELECT id,name FROM gk_checklists ORDER BY name'),
  all(env,'SELECT id,name FROM gk_custom_fields WHERE retired=0 ORDER BY name'),all(env,'SELECT id,label FROM gk_work_fields WHERE retired_at IS NULL ORDER BY label'),
 ])
 const chosen=view.rules.find(r=>r.id===url.searchParams.get('rule')),d=chosen?.definition as Definition|undefined
 const edit=(!chosen || actor.role==='owner'||chosen.owner_id===actor.id)
 const fields=[...CONDITION_FIELDS.map(value=>({value,label:words(value)})),...custom.map(f=>({value:`custom:${f.id}`,label:f.name})),...workFields.map(f=>({value:`custom:${f.id}`,label:f.label}))]
 const triggers=Object.entries(RULE_TRIGGERS).map(([value,label])=>({value,label})),actions=Object.entries(RULE_ACTIONS).map(([value,label])=>({value,label}))
 const builder=edit?card(chosen?'Publish a revision':'Create a rule',form('rules.save',path+'?rule={id}',h`
  ${chosen?h`${hidden('rule',chosen.id)}${hidden('revision',chosen.revision)}`:''}
  <div class="gk-grid">${field('Name','name',{value:d?.name??''})}${select('When','trigger',triggers,d?.trigger??'request.submitted')}${field('Order priority','priority',{type:'number',value:d?.priority??100,attrs:'min="0" max="10000"'})}</div>
  <details class="gk-details" open><summary>Conditions · every condition must match</summary>
  ${[0,1,2,3].map(i=>{
   const c=d?.conditions[i]
   return h`<fieldset><legend>Condition ${i+1}</legend><div class="gk-grid">${select('Field',`conditionField${i}`,fields,c?.field??'',{required:false,blank:'No condition'})}${select('Comparison',`conditionOp${i}`,['eq','ne','contains','gte','lte','between'].map(value=>({value,label:{eq:'Equals',ne:'Does not equal',contains:'Contains',gte:'At least',lte:'At most',between:'Time between'}[value]!})),c?.op??'eq')}${field('Value',`conditionValue${i}`,{value:c?.value??'',required:false})}${field('End time',`conditionUntil${i}`,{type:'time',required:false,value:c?.until??''})}</div></fieldset>`
  })}</details>
  <details class="gk-details" open><summary>Actions</summary>${[0,1,2,3].map(i=>{
   const a=d?.actions[i] as RuleAction|undefined
   return h`<fieldset><legend>Action ${i+1}</legend><div class="gk-grid">${select('Action',`actionType${i}`,actions,a?.type??'',{required:false,blank:'No action'})}${field('Value or days from event',`actionValue${i}`,{value:a?.value??(a?.type==='due'?a.days:undefined)??a?.text??a?.title??'',required:false})}${field('Follow-up due in days',`actionDays${i}`,{type:'number',value:a?.type==='follow_up'?a.days??0:0,required:false,attrs:'min="0" max="365"'})}${select('Team',`actionTeam${i}`,options(teams),a?.team??'',{required:false,blank:'No team'})}${select('Assignee',`actionPerson${i}`,options(people),a?.person??'',{required:false,blank:'No person'})}${select('Notify person',`actionPeople${i}`,options(people),a?.people?.[0]??'',{required:false,blank:'No person'})}</div></fieldset>`
  })}</details>
  ${field('Reason for this revision','reason')}`,'Publish paused revision')):''
 let preview=h``
 if(chosen && url.searchParams.get('preview')==='yes') {
  const result=await previewRule(env,actor,Input.of({rule:chosen.id,revision:chosen.revision}))
  preview=card('Preview · no changes written',h`<p>${result.rows.filter(r=>r.matched).length} matching records in the last seven days. No work, notices, purchasing, audit or execution rows were written.</p>${table(['Record','Basis','Match','Proposed actions','Conflicts'],result.rows.map((r:Row)=>[r.entityId,words(r.basis),r.matched?'Matches':'No match',r.actions.map((a:RuleAction)=>h`<p>${RULE_ACTIONS[a.type as keyof typeof RULE_ACTIONS]} ${a.value??a.team??a.title??''}</p>`).concat((r.checks??[]).filter((c:Row)=>c.error).map((c:Row)=>h`<p role="alert">${words(c.error)}</p>`)),r.conflicts.map((c:Row)=>h`<p>${c.field}: rule ${c.winner} wins</p>`)]),'Historical preview',{wrap:[0,1,3,4]})}`)
 }
 const list=card('Rules',view.rules.length?table(['Rule','State','Control'],view.rules.map(r=>[
  h`<a href="${path}?rule=${r.id}">${r.definition.name}</a><span class="gk-sub">${RULE_TRIGGERS[r.definition.trigger as keyof typeof RULE_TRIGGERS]} · order ${r.definition.priority} · revision ${r.revision}</span>`,tag(r.paused?'Paused':'Active'),
  h`<a href="${path}?rule=${r.id}&preview=yes">Preview recent records</a>${actor.role==='owner'||r.owner_id===actor.id?form('rules.control',path,h`${hidden('rule',r.id)}${hidden('revision',r.revision)}${hidden('paused',r.paused?'false':'true')}${field('Reason','reason')}`,r.paused?'Enable rule':'Pause rule',{secondary:true}):''}`]),'Rules',{wrap:[0,2]}):h`<p>No rules yet. Publish one below, preview recent records, then enable it.</p>`)
 const executions=card('Executions',h`${view.events.filter(e=>e.error).map(e=>h`<p role="alert">${words(e.error)} · ${e.entity_id}</p>`)}${table(['Started','Rule','Outcome','Details'],view.runs.map(r=>[
  showInstant(r.started_at,actor.zone),h`${view.rules.find(v=>v.id===r.rule_id)?.definition.name??r.rule_id}<span class="gk-sub">Revision ${r.revision} · ${r.source}</span>`,tag(r.outcome),
  h`${r.error?h`<p role="alert">${words(r.error)}</p>`:''}${r.conflicts.map((c:Row)=>h`<p>Conflict on ${c.field}: ${c.winner} wins before ${c.loser}.</p>`)}<details><summary>Input evidence</summary><pre>${JSON.stringify(r.input,null,2)}</pre></details>`]),'Executions',{wrap:[1,3]})}`)
 const health=card('Health',h`<dl><dt>Last event</dt><dd>${showInstant(view.health.lastTrigger,actor.zone)}</dd><dt>Next UTC quarter hour</dt><dd>${new Date(view.health.nextTrigger).toISOString()}</dd><dt>Last successful execution</dt><dd>${showInstant(view.health.lastSuccess,actor.zone)} ${view.health.missed?tag('Missed'):''}</dd><dt>Paused rules</dt><dd>${view.health.paused}</dd><dt>Running executions</dt><dd>${view.health.running}</dd><dt>Pending events</dt><dd>${view.health.pending}</dd><dt>Failed executions</dt><dd>${view.health.failed}</dd><dt>Notifications</dt><dd>Stored in app synchronously. External delivery unavailable.</dd></dl>`)
 const history=chosen?card('Revision history',table(['Revision','When','Reason'],view.revisions.filter(r=>r.rule_id===chosen.id).map(r=>[`${r.revision} · ${r.paused?'paused':'enabled'}`,showInstant(r.at,actor.zone),r.reason]),'Revision history',{wrap:[2]})):''
 const catchup=chosen?card('Catch up a retained event',form('rules.control',path,h`${hidden('rule',chosen.id)}${hidden('revision',chosen.revision)}${hidden('catchUp','true')}${select('Event','event',view.events.filter(e=>e.trigger===chosen.definition.trigger).map(e=>({value:e.id,label:`${e.entity_id} · ${showInstant(e.occurred_at,actor.zone)}`})),'',{blank:'Choose a retained event'})}${field('Reason','reason')}`,'Catch up under this revision',{secondary:true})):''
 const documentation=card('Rule reference',h`<details class="gk-details"><summary>Triggers, values and limits</summary><p>Rules apply to this site. Lower order priority runs first, then rule id. The first action for a conflicting field wins; later conflicts appear in executions and preview.</p><p>Time conditions use the site clock, with an inclusive start and exclusive end; crossing midnight is supported. Other conditions compare exact ids or values. Custom fields use their retained ids.</p><p>Priority values: emergency, high, normal, low. Request priority excludes low. Work status: open or in_progress. Request status: new or needs_details. Due dates use whole days from the event date. Follow-up titles use the Value field; follow-up due dates use the separate days field. Procedure values use a checklist id. Notifications stay in app and name a person or team.</p><p>Request approval submits complete work held by the rule owner through the ordinary readiness checks. Rules cannot approve work, approve spend, cancel work or close findings. Every action rechecks its owner's current rights and enabled revision.</p><p>Chains stop after ${view.limits.depth} generations or ${view.limits.events} events, and a repeated rule on the same record stops with a visible loop error.</p>${assets.length?h`<h3>Asset ids</h3>${table(['Asset','Id'],assets.map(a=>[a.name,a.id]))}`:''}<h3>Procedure ids</h3>${table(['Checklist','Id'],checklists.map(c=>[c.name,c.id]))}</details>`)
 return page(env,'Automation rules',actor,h`<div class="gk-head"><div><h1>Automation rules</h1><p class="gk-lede">Route work under a versioned, pausable grant.</p></div></div><p><a href="/app/automation">Automation health</a> · <a href="${path}">New rule</a></p>${preview}${list}<div class="gk-columns"><div class="gk-col-main">${builder}${executions}</div><div class="gk-col-side">${health}${history}${catchup}${documentation}</div></div>`,{url})
}
