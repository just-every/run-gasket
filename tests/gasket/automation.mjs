// PM-008 through public doors against the built Worker and real D1.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { file, harness } from './harness.mjs'
import { now, zone } from './clock.mjs'

export async function automationJourney() {
  const h = await harness()
  try {
    const cookie = { owner: await h.owner() }, ids = {}, cron = '*/15 * * * *'
    await h.api('site.configure', cookie.owner, { name: 'Automation plant', timezone: zone })
    for (const [key,role] of [['lead','lead'],['max','maintainer'],['sam','supervisor'],['agent','agent']]) {
      ids[key] = (await h.api('access.give',cookie.owner,{name:key,email:`${key}@example.test`,role})).id
      cookie[key] = await h.signIn(`${key}@example.test`)
    }
    const today = (await h.api('me',cookie.owner)).today
    await h.scheduled(cron,now()-60*60_000)
    const assets = []
    for(const tag of ['PUMP-1','PUMP-2']) assets.push((await h.api('asset.create',cookie.lead,{tag,name:tag,location:'Pump room'})).id)
    const checklist=(await h.api('checklist.create',cookie.lead,{name:'Pump check',items:['Listen for bearing noise']})).id
    const schedule=(await h.api('schedule.create',cookie.lead,{asset:assets[0],checklist,title:'Monthly pump inspection',everyDays:30,firstDue:today,assignee:ids.max})).id
    let health=await h.api('automation',cookie.owner)
    const rule=id=>health.rules.find(row=>row.id===id)
    for(const who of ['lead','max','sam','agent']) {
      await h.api('automation.control',cookie[who],{rule:'pm',revision:rule('pm').revision,paused:true,reason:'Hold'},403)
      await h.api('automation.catchup',cookie[who],{rule:'pm',revision:rule('pm').revision},403)
      await h.api(`automation/preview?schedule=${schedule}`,cookie[who],undefined,403)
    }
    await h.api('automation.control',cookie.owner,{rule:'approve_spend',revision:1,paused:false,reason:'Not a maintenance job'},400)
    await h.api('automation.schedule',cookie.owner,{schedule,revision:1,active:false,reason:'Test before enabling'})
    await h.api('automation.control',cookie.owner,{rule:'pm',revision:rule('pm').revision,paused:true,reason:'Maintenance hold'})
    const before={work:await h.api('work',cookie.owner),notices:await h.api('notices',cookie.max),audit:await h.api('audit',cookie.owner),ledger:await h.api('automation/jobs',cookie.owner),purchases:await h.api('purchasing',cookie.owner)}
    const preview=await h.api(`automation/preview?schedule=${schedule}`,cookie.owner)
    assert.equal(preview.preview,true);assert.equal(preview.active,false);assert.equal(preview.created.length,1)
    assert.equal(preview.created[0].schedule,schedule);assert.equal(preview.created[0].revision,2)
    assert.deepEqual({work:await h.api('work',cookie.owner),notices:await h.api('notices',cookie.max),audit:await h.api('audit',cookie.owner),ledger:await h.api('automation/jobs',cookie.owner),purchases:await h.api('purchasing',cookie.owner)},before,'test mode writes no work, notices, purchases, audit or execution rows')
    await h.api('automation.schedule',cookie.owner,{schedule,revision:2,active:true,reason:'Preview accepted'})
    await h.scheduled(cron)
    health=await h.api('automation',cookie.owner)
    assert.equal((await h.api('work',cookie.owner)).length,0)
    assert.ok(rule('pm').paused&&rule('pm').missed&&rule('pm').uncoveredMinutes>=60,'missed execution remains visible while paused')
    assert.equal(health.coverage.find(row=>row.id===schedule).status,'paused')
    assert.ok(health.lastTrigger.ran_at&&health.nextRun>now())
    assert.ok(health.jobs.some(row=>row.rule_id==='pm'&&row.state==='paused'))
    await h.api('automation.control',cookie.owner,{rule:'pm',revision:rule('pm').revision,paused:false,reason:'Resume after planned hold'})
    health=await h.api('automation',cookie.owner)
    const grant=rule('pm').revision
    await h.api('automation.catchup',cookie.owner,{rule:'pm',revision:grant-1},409)
    health=await h.api('automation',cookie.owner)
    assert.ok(health.jobs.some(row=>row.state==='failed'&&row.error==='automation_changed'),'stale execution is retained as a failed job')
    const caught=await h.api('automation.catchup',cookie.owner,{rule:'pm',revision:grant})
    assert.equal(caught.state,'completed');assert.equal(caught.output.created.length,1)
    await h.api('automation.catchup',cookie.owner,{rule:'pm',revision:grant})
    const work=await h.api('work',cookie.owner)
    assert.equal(work.filter(row=>row.title==='Monthly pump inspection').length,1,'catch-up retry creates one occurrence')
    assert.equal((await h.api(`work/${caught.output.created[0].id}`,cookie.owner)).schedule_id,schedule)
    const concurrent=(await h.api('schedule.create',cookie.lead,{asset:assets[0],checklist,title:'Concurrent catch-up',everyDays:30,firstDue:today,assignee:ids.max})).id
    const overlapping=await Promise.all([0,1].map(()=>h.raw('/api/gasket/automation.catchup',{cookie:cookie.owner,body:{rule:'pm',revision:grant}})))
    const outcomes=await Promise.all(overlapping.map(async response=>({status:response.status,body:await response.json()})))
    assert.ok(outcomes.every(row=>[200,409].includes(row.status)))
    assert.equal(outcomes.filter(row=>row.status===200).flatMap(row=>row.body.output.created).filter(row=>row.schedule===concurrent).length,1,'overlapping catch-up never claims work it did not issue')
    assert.equal((await h.api('work',cookie.owner)).filter(row=>row.title==='Concurrent catch-up').length,1)
    const job=await h.api(`automation/jobs?job=${caught.job}`,cookie.owner)
    assert.equal(job.rule_revision,grant);assert.equal(job.input.schedules[0].revision,3)
    const event=(await h.api('audit?action=workorder.schedule',cookie.owner)).rows.find(row=>row.subject===caught.output.created[0].id)
    assert.deepEqual(JSON.parse(event.detail).automation,{job:caught.job,rule:'pm',revision:grant})
    assert.equal(JSON.parse(event.detail).revision,3)
    // Immediate reading triggers obey the same PM pause grant.
    const meter=(await h.api('meter.create',cookie.lead,{asset:assets[1],name:'Run hours',unit:'h',kind:'counter'})).id
    const metered=(await h.api('schedule.create',cookie.lead,{asset:assets[1],checklist,title:'100-hour service',meter,everyUnits:'100',firstDueMeter:'100',assignee:ids.max})).id
    await h.api('automation.control',cookie.owner,{rule:'pm',revision:grant,paused:true,reason:'Hold all automatic generation'})
    await h.api('meter.feed',cookie.lead,{meter,source:'maintenance sensor',value:'100',takenOn:`${today}T10:00`,unit:'h'})
    assert.equal((await h.api('work',cookie.owner)).filter(row=>row.title==='100-hour service').length,0)
    health=await h.api('automation',cookie.owner)
    assert.ok(health.jobs.some(row=>row.rule_id==='pm'&&row.source==='reading'&&row.state==='paused'))
    await h.api('automation.control',cookie.owner,{rule:'pm',revision:rule('pm').revision,paused:false,reason:'Resume meter-based PM'})
    health=await h.api('automation',cookie.owner)
    await h.api('automation.catchup',cookie.owner,{rule:'pm',revision:rule('pm').revision})
    assert.equal((await h.api('work',cookie.owner)).filter(row=>row.title==='100-hour service').length,1)
    // Routes, work reminders and document reminders have independent grants and input evidence.
    const route=(await h.api('route.create',cookie.lead,{name:'Pump-room round',asset:assets,checklist:[checklist,checklist],everyDays:7,firstDue:today,assignee:ids.max})).id
    await h.api('document.add',cookie.lead,{asset:assets[0],kind:'warranty',title:'Pump warranty',source:'Manufacturer warranty',file:file('warranty.txt','Warranty terms','text/plain'),expiresOn:today,owner:ids.max})
    for(const kind of ['routes','chase','expiry']) {
      health=await h.api('automation',cookie.owner)
      await h.api('automation.control',cookie.owner,{rule:kind,revision:rule(kind).revision,paused:true,reason:'Independent control test'})
    }
    const noticesBefore=await h.api('notices',cookie.max)
    await h.scheduled(cron)
    assert.equal((await h.api('routes',cookie.owner)).find(row=>row.id===route).runs.length,0)
    assert.deepEqual(await h.api('notices',cookie.max),noticesBefore)
    for(const kind of ['routes','chase','expiry']) {
      health=await h.api('automation',cookie.owner)
      await h.api('automation.control',cookie.owner,{rule:kind,revision:rule(kind).revision,paused:false,reason:'Resume recorded job'})
      health=await h.api('automation',cookie.owner)
      const result=await h.api('automation.catchup',cookie.owner,{rule:kind,revision:rule(kind).revision})
      const record=await h.api(`automation/jobs?job=${result.job}`,cookie.owner)
      assert.equal(record.state,'completed');assert.ok(record.input.day)
      if(kind==='routes') {assert.ok(record.input.routes.some(row=>row.id===route));assert.equal(result.output.runs.length,1)}
      if(kind==='chase') {assert.ok(record.input.rule);assert.ok(result.output.notices.length)}
      if(kind==='expiry') {assert.ok(record.input.documents.length);assert.ok(result.output.notices.length)}
    }
    health=await h.api('automation',cookie.owner)
    assert.equal(health.delivery.external.state,'unavailable','no provider-delivery success is invented')
    assert.equal(health.delivery.inApp.pendingJobs,0)
    assert.ok(health.delivery.inApp.stored>0)
    for(const path of ['automation','automation/jobs','automation/preview']) assert.equal((await h.raw('/api/gasket/'+path)).status,401)
    await h.api('automation',cookie.max,undefined,403)
    const page=await(await h.raw(`/app/automation?test=${schedule}`,{cookie:cookie.owner})).text()
    assert.ok(page.includes('Monthly pump inspection'))
    assert.ok(page.includes(`href="/api/gasket/automation/jobs?job=${caught.job}"`))
    assert.ok(page.includes('action="/app/do/automation.control"'))
    assert.ok(page.includes('action="/app/automation"'))
    const supervisorPage=await(await h.raw('/app/automation',{cookie:cookie.sam})).text()
    assert.ok(!supervisorPage.includes('/app/do/automation.control'))
  } finally { await h.close() }
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await automationJourney();console.log('PM-008 scheduler controls and retained execution evidence passed')}
