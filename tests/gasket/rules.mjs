import { rulesBrowser } from './rules-browser.mjs'
// Rule authoring and execution through the built Worker's public HTTP doors.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { harness } from './harness.mjs'
import { now } from './clock.mjs'
export async function rulesJourney() {
 const h=await harness(),cookie={owner:await h.owner()},ids={}
 try {
  await h.api('site.configure',cookie.owner,{name:'Great Lakes Assembly',timezone:'UTC'})
  for(const [who,role] of [['lead','lead'],['tech','maintainer'],['supervisor','supervisor']]) {
   ids[who]=(await h.api('access.give',cookie.owner,{name:who==='lead'?'Lena Park':who==='tech'?'Maya Chen':'Sam Ito',email:`${who}@example.test`,role})).id
   cookie[who]=await h.signIn(`${who}@example.test`)
  }
  const asset=(await h.api('asset.create',cookie.lead,{tag:'synthetic-gasket-91',name:'Line 2 conveyor',location:'Line 2',category:'Conveyor'})).id
  const other=(await h.api('asset.create',cookie.lead,{tag:'synthetic-gasket-92',name:'Line 3 pump',location:'Line 3',category:'Pump'})).id
  const team=(await h.api('team.create',cookie.lead,{name:'Electrical response',trade:'Electrical',member:[ids.tech]})).id
  const custom=(await h.api('customfield.save',cookie.lead,{name:'Maintenance trade',entityType:'asset',type:'single',scope:'site',options:'Electrical,Mechanical'})).id
  await h.api('customvalue.set',cookie.lead,{entityType:'asset',entityId:asset,customValues:{[custom]:'Electrical'}})
  const portal=(await h.api('request.portal',cookie.owner,{name:'Line faults',fields:[]})).id
  const targets=[]
  for(const id of [asset,other])targets.push((await h.api('request.target',cookie.owner,{portal,kind:'asset',asset:id,name:'Conveyor fault',publishConsent:true})).id)
  async function request(target,description) {
   const r=await h.raw(`/request/${portal}`,{cookie:cookie.tech,body:{submissionKey:randomUUID(),target,description,urgency:'normal',contact:'synthetic-gasket-96'}})
   assert.equal(r.status,303,await r.text())
   return (await h.api('requests',cookie.owner)).find(r=>r.description===description).id
  }
  const historic=await request(targets[0],'synthetic-gasket-97')
  const definition={name:'Route conveyor electrical faults',trigger:'request.submitted',priority:10,reason:'Route Line 2 electrical faults',conditions:[{field:'location',op:'eq',value:'Line 2'},{field:'category',op:'eq',value:'Conveyor'},{field:`custom:${custom}`,op:'eq',value:'Electrical'}],actions:[{type:'assign',team,person:ids.tech},{type:'priority',value:'high'},{type:'notify',people:[ids.lead],text:'Electrical request received'}]}
  for(const who of ['tech','supervisor'])await h.api('rules.save',cookie[who],definition,403)
  await h.api('rules.save',undefined,definition,401)
  let saved=await h.api('rules.save',cookie.lead,definition)
  const rule=saved.id
  assert.equal(saved.paused,true)
  const state=()=>h.api('rules',cookie.owner)
  const before={request:await h.api(`requests/${historic}`,cookie.lead),audit:await h.api('audit',cookie.owner),work:await h.api('work',cookie.lead),notices:await h.api('notices',cookie.lead),rules:await state(),purchases:await h.api('purchase-orders',cookie.owner)}
  const preview=await h.api('rules.preview',cookie.lead,{rule,revision:saved.revision})
  assert.ok(preview.rows.find(r=>r.entityId===historic)?.matched)
  assert.deepEqual({request:await h.api(`requests/${historic}`,cookie.lead),audit:await h.api('audit',cookie.owner),work:await h.api('work',cookie.lead),notices:await h.api('notices',cookie.lead),rules:await state(),purchases:await h.api('purchase-orders',cookie.owner)},before,'historical preview leaves every live record and ledger unchanged')
  saved=await h.api('rules.control',cookie.lead,{rule,revision:saved.revision,paused:false,reason:'Preview reviewed'})
  const matched=await request(targets[0],'Conveyor motor trips at startup'),unmatched=await request(targets[1],'Pump seal dripping at Line 3')
  const detail=await h.api(`requests/${matched}`,cookie.lead)
  assert.equal(detail.team_id,team);assert.equal(detail.assignee_id,ids.tech);assert.equal(detail.urgency,'high')
  const unchanged=await h.api(`requests/${unmatched}`,cookie.lead)
  assert.equal(unchanged.team_id,null);assert.equal(unchanged.assignee_id,null);assert.equal(unchanged.urgency,'normal')
  const run=(await state()).runs.find(r=>r.rule_id===rule && r.outcome==='completed')
  assert.equal(run.revision,saved.revision)
  const audit=(await h.api('audit?action=rules.action',cookie.owner)).rows.map(r=>JSON.parse(r.detail))
  assert.ok(audit.some(a=>a.rule===rule && a.revision===saved.revision && a.input.custom[custom]==='Electrical'))
  assert.ok((await h.api('notices',cookie.lead)).some(n=>n.text.includes('Electrical request received')))
  assert.ok(!(await state()).actions.some(a=>a.input.facts.record?.id===unmatched))
  for(const type of ['approve_work','approve_spend','close_finding','cancel'])await h.api('rules.save',cookie.lead,{...definition,name:`synthetic-gasket-${type}`,actions:[{type}]},400)
  await h.api('rules.save',cookie.lead,{...definition,actions:[{type:'status',value:'closed'}]},400)
  await h.api('rules.control',cookie.lead,{rule,revision:1,paused:true,reason:'Stale editor'},409)
  saved=await h.api('rules.control',cookie.owner,{rule,revision:saved.revision,paused:true,reason:'Planned pause'})
  const paused=await request(targets[0],'synthetic-gasket-101')
  assert.equal((await h.api(`requests/${paused}`,cookie.lead)).urgency,'normal')
  let view=await state(),event=view.events.find(e=>e.entity_id===paused)
  assert.ok(view.runs.some(r=>r.event_id===event.id && r.outcome==='paused'))
  const snapshot=JSON.stringify(view.events.find(e=>e.entity_id===paused).input)
  assert.ok(!snapshot.includes('synthetic-gasket-96'),'contact is excluded from retained input')
  const previewPaused=await h.api('rules.preview',cookie.lead,{rule,revision:saved.revision})
  assert.ok(previewPaused.rows.find(r=>r.entityId===paused)?.matched)
  saved=await h.api('rules.control',cookie.owner,{rule,revision:saved.revision,paused:false,reason:'Resume reviewed rule'})
  await h.api('rules.control',cookie.owner,{rule,revision:saved.revision,catchUp:true,event:event.id,reason:'Catch up the paused source'})
  assert.equal((await h.api(`requests/${paused}`,cookie.lead)).urgency,'high')
  const once=(await state()).actions.length
  await h.api('rules.control',cookie.owner,{rule,revision:saved.revision,catchUp:true,event:event.id,reason:'Repeated delivery'})
  assert.equal((await state()).actions.length,once,'catch-up source is deduplicated')
  await h.api('rules.control',cookie.owner,{rule,revision:1,catchUp:true,event:event.id,reason:'Stale catch up'},409)
  assert.ok((await state()).runs.some(r=>r.source==='catch-up'&&r.error==='stale'))
  const created=async(name,trigger,conditions,actions,priority=10)=>{
   const r=await h.api('rules.save',cookie.owner,{name,trigger,priority,conditions,actions,reason:'Synthetic rule journey'})
   return h.api('rules.control',cookie.owner,{rule:r.id,revision:r.revision,paused:false,reason:'Enable tested rule'})
  }
  // Two matching rules contend over priority. Stable stated ordering is visible in execution evidence.
  const scoped=[{field:'asset',op:'eq',value:asset}]
  const first=await created('synthetic-gasket-102','work.created',scoped,[{type:'priority',value:'high'}],1)
  const second=await created('synthetic-gasket-103','work.created',scoped,[{type:'priority',value:'low'}],2)
  const work=(await h.api('workorder.create',cookie.lead,{asset,title:'synthetic-gasket-104',due:new Date(now()).toISOString().slice(0,10)})).id
  assert.equal((await h.api(`work/${work}`,cookie.lead)).priority,'high')
  const conflict=(await state()).runs.find(r=>r.rule_id===second.id && r.input.work?.id===work)
  assert.ok(conflict.conflicts.some(c=>c.field==='priority' && c.winner===first.id))
  // A creation starts an alternating status chain, whose second visit to a rule must stop visibly.
  await created('synthetic-gasket-105','work.created',scoped,[{type:'status',value:'in_progress'}])
  await created('synthetic-gasket-106','work.status_changed',[...scoped,{field:'status',op:'eq',value:'in_progress'}],[{type:'status',value:'open'}])
  await created('synthetic-gasket-107','work.status_changed',[...scoped,{field:'status',op:'eq',value:'open'}],[{type:'status',value:'in_progress'}])
  await h.api('workorder.create',cookie.lead,{asset,title:'synthetic-gasket-108',due:new Date(now()).toISOString().slice(0,10)})
  view=await state();assert.ok(view.runs.some(r=>r.error==='rule_loop_detected'))
  assert.ok((await(await h.raw('/app/settings/rules',{cookie:cookie.owner})).text()).includes('rule loop detected'))
  assert.equal((await h.raw('/app/settings/rules',{cookie:cookie.tech})).status,403)
  assert.equal((await h.raw('/app/settings/rules')).status,303)
  if(process.env.RULES_SCREENSHOTS)await rulesBrowser({h,cookie,ids,asset,team,custom,matched,definition})
  // Revoking the author prevents new effects, including when an owner previously enabled that author's rule.
  await h.api('access.end',cookie.owner,{member:ids.lead})
  await request(targets[0],'synthetic-gasket-109')
  view=await state();assert.ok(view.runs.some(r=>r.rule_id===rule && r.error==='rule_owner_authority_revoked'))
  assert.ok(view.revisions.filter(r=>r.rule_id===rule).length>=4)
  assert.equal(view.health.externalDelivery,'unavailable')
  console.log('No-code rules authoring, preview, bounded execution and current authority passed')
 } finally {await h.close()}
}
