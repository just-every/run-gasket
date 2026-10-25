import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
export async function ruleSourcesJourney() {
  const h=await harness({clockInstant:Date.parse('2026-10-21T12:00:00Z')}),owner=await h.owner()
  try {
    await h.api('site.configure',owner,{name:'Great Lakes Assembly',timezone:'UTC'})
    const me=(await h.api('me',owner)).id
    const asset=(await h.api('asset.create',owner,{tag:'PRESS-2',name:'Line 2 press',location:'Line 2',category:'Press'})).id
    const rule=async(trigger,actions,conditions=[{field:'asset',op:'eq',value:asset}])=>{
      const saved=await h.api('rules.save',owner,{name:`Respond to ${trigger}`,trigger,priority:10,conditions,actions,reason:'Current site maintenance response'})
      return h.api('rules.control',owner,{rule:saved.id,revision:saved.revision,paused:false,reason:'Enable response'})
    }
    const notify=text=>[{type:'notify',people:[me],text}]
    const definitions=new Map()
    for(const trigger of ['asset.status_changed','meter.recorded','checklist.failed','work.overdue','work.status_changed'])definitions.set(trigger,await rule(trigger,notify(`Response to ${trigger}`)))
    const checklist=await h.api('checklist.create',owner,{name:'Press safety inspection',items:['Check guard interlock']})
    const dueRule=await rule('work.created',[{type:'due',days:3},{type:'procedure',value:checklist.id}], [{field:'asset',op:'eq',value:asset},{field:'time',op:'between',value:'11:00',until:'13:00'}])
    const work=(await h.api('workorder.create',owner,{asset,title:'Check Line 2 press guard',due:'2026-10-20',assignee:me,description:'Request contact must never be copied into rule evidence'})).id
    const planned=await h.api(`work/${work}`,owner)
    assert.equal(planned.due_date,'2026-10-24');assert.equal(planned.checklist_revision_id,checklist.revision)
    let view=await h.api('rules',owner)
    assert.ok(!JSON.stringify(view.events).includes('Request contact must never'),'execution snapshots retain routing facts only')
    await h.api('rules.control',owner,{rule:dueRule.id,revision:dueRule.revision,paused:true,reason:'Separate overdue source'})
    const overdue=(await h.api('workorder.create',owner,{asset,title:'Inspect retained overdue press work',due:'2026-10-20',assignee:me})).id
    await h.api('workorder.results',owner,{workOrder:work,outcome:['fail'],note:['Interlock inspection failed']})
    await h.api('asset.state',owner,{asset,state:'degraded',effectiveOn:'2026-10-21T11:00',reason:'Guard interlock unreliable'})
    const meter=(await h.api('meter.create',owner,{asset,name:'Cycles',unit:'cycles',kind:'counter'})).id
    await h.api('meter.feed',owner,{meter,source:'synthetic-gasket-7',value:'100',unit:'cycles',takenOn:'2026-10-21T11:30'})
    await h.api('workorder.readings',owner,{workOrder:work,meter:[meter],value:['110'],takenOn:'2026-10-21T11:45'})
    await h.scheduled(Date.parse('2026-10-21T12:15:00Z'))
    view=await h.api('rules',owner)
    for(const [trigger,definition] of definitions) {
      const completed=view.runs.filter(r=>r.rule_id===definition.id&&r.outcome==='completed')
      assert.ok(completed.length>0,`${trigger} runs from the ordinary source door`)
      assert.ok(view.actions.some(a=>a.rule_id===definition.id&&a.revision===definition.revision),`${trigger} retains its action revision`)
    }
    assert.ok(view.events.filter(e=>e.trigger==='meter.recorded').length>=2,'feed and work reading doors emit source events')
    const partRule=await rule('part.below_minimum',notify('Low press seal stock'),[{field:'category',op:'eq',value:'Seal'}])
    const part=(await h.api('part.create',owner,{number:'SEAL-P2',name:'Press seal',unit:'each',minimum:'5',category:'Seal'})).id
    await h.api('part.receive',owner,{part,quantity:'10'})
    let stock=await h.api(`parts/${part}`,owner)
    await h.api('part.count',owner,{part,revision:stock.revision,seen:stock.seen,counted:'2',note:'Physical count'})
    view=await h.api('rules',owner)
    assert.ok(view.runs.some(r=>r.rule_id===partRule.id&&r.outcome==='completed'))
    assert.ok((await h.api('notices',owner)).some(n=>n.text.includes('Low press seal stock')),'part-triggered in-app notices reach the recipient door')
    const follow=await rule('asset.status_changed',[{type:'follow_up',title:'Inspect guard after state change',days:1}],[{field:'asset',op:'eq',value:asset},{field:'status',op:'eq',value:'down'}])
    await h.api('asset.state',owner,{asset,state:'down',effectiveOn:'2026-10-21T11:10',reason:'Guard failed closed'})
    assert.ok((await h.api('work',owner)).some(w=>w.title==='Inspect guard after state change'))
    const approvalAsset=(await h.api('asset.create',owner,{tag:'FAN-4',name:'Line 4 extractor',location:'Line 4'})).id
    const approval=await rule('work.created',[{type:'request_approval'}],[{field:'asset',op:'eq',value:approvalAsset}])
    const submitted=(await h.api('workorder.create',owner,{asset:approvalAsset,title:'Completed extractor check',due:'2026-10-21',assignee:me})).id
    assert.equal((await h.api(`work/${submitted}`,owner)).status,'submitted','requesting approval never approves work')
    await h.api('rules.control',owner,{rule:approval.id,revision:approval.revision,paused:true,reason:'Keep later scope scenario open'})
    const tech=(await h.api('access.give',owner,{name:'Maya Chen',email:'scope@example.test',role:'maintainer'})).id
    const scopeRule=await rule('work.created',[{type:'assign',person:tech}],[{field:'asset',op:'eq',value:approvalAsset}])
    const protectedWork=(await h.api('workorder.create',owner,{asset:approvalAsset,title:'Keep original access boundary',due:'2026-10-21',assignee:me})).id
    assert.equal((await h.api(`work/${protectedWork}`,owner)).assignee_id,me)
    view=await h.api('rules',owner)
    assert.ok(view.runs.some(r=>r.rule_id===scopeRule.id&&r.error==='rule_action_would_widen_access'))
    console.log('Documented maintenance trigger sources and bounded actions passed')
  } finally {await h.close()}
}
