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
if(process.argv[1]===fileURLToPath(import.meta.url)&&!process.argv.includes('--connectors')){await automationJourney();console.log('PM-008 scheduler controls and retained execution evidence passed')}

// INT-002 uses the actual emitted Worker/D1 and public source, subscription,
// automation and inspection doors. Only the receiver network edge is fake.
export async function connectorJourney() {
  const { receiveWebhook } = await import('../../scripts/webhooks/receiver.mjs')
  const { createHmac } = await import('node:crypto')
  const { installation: makeInstallation } = await import('./installation.mjs')
  const { offset } = await import('./clock.mjs')
  const install=await makeInstallation();await install.migrate()
  let activeInstall=install
  const restoredInstalls=[]
  const keys=new Map(), modes=new Map(), received=[], applied=new Map(), effects={work:[],stock:[],bills:[],notices:[]}
  let receiverClock=now(), runtimeOffset=offset, h, cookie, captured, inFlight=0, maxInFlight=0
  const outbound=async request=>{
    const name=new URL(request.url).pathname.slice(1), config=keys.get(name)
    assert.ok(config,`expected receiver ${name}`)
    inFlight++;maxInFlight=Math.max(maxInFlight,inFlight)
    try {
      const body=await request.clone().text(), headers=Object.fromEntries(request.headers)
      const expected=createHmac('sha256',config.secret).update(`${headers['gasket-timestamp']}.${headers['gasket-id']}.${body}`).digest('hex')
      assert.equal(headers['gasket-signature'],`v1=${expected}`,'receiver independently verifies exact signed bytes')
      const mode=modes.get(name)
      received.push({name,body:JSON.parse(body),headers})
      captured={body,headers}
      if(mode==='rate')return new Response('Synthetic rate limit',{status:429,headers:{'retry-after':'120'}})
      if(mode==='reject')return new Response('Synthetic invalid receiver configuration',{status:422})
      if(mode==='redirect')return new Response(null,{status:307,headers:{location:'https://other.example.test/receiver'}})
      if(mode==='unavailable')return new Response('Synthetic unavailable receiver',{status:503})
      const response=await receiveWebhook(request,{...config,now:Date.now()+runtimeOffset,acceptOnce:async(id,event)=>{
        if(applied.has(id))return{duplicate:true}
        // Synthetic receiver transaction: persist identity and all four kinds
        // of external effect together. It survives a sender Worker restart.
        applied.set(id,event)
        if(event.type==='work.changed')effects.work.push(event.id)
        if(event.type==='receipt.created'){effects.stock.push(event.id);effects.bills.push(event.id)}
        effects.notices.push(event.id)
        return{duplicate:false}
      }})
      assert.equal(response.status,200,'receiver accepts the signature, version and replay age')
      if(mode==='timeout')await new Promise(resolve=>setTimeout(resolve,6000))
      if(mode==='disconnect')throw new Error('Synthetic connection lost after receiver commit')
      return response
    }finally{inFlight--}
  }
  const vars={OWNER_EMAIL:'owner@example.test',SESSION_SECRET:'synthetic-gasket-1'.repeat(3),SETUP_TOKEN:'synthetic-gasket-2'.repeat(3)}
  const start=async()=>{h=await harness({vars,installation:activeInstall,clockOffset:runtimeOffset,outbound})}
  try {
    await start();cookie={owner:await h.owner()}
    await h.api('site.configure',cookie.owner,{name:'Connector plant',timezone:zone})
    const ids={}
    for(const [who,role]of[['lead','lead'],['max','maintainer'],['sam','supervisor'],['agent','agent']]){
      ids[who]=(await h.api('access.give',cookie.owner,{name:who,email:`${who}@example.test`,role})).id
      cookie[who]=await h.signIn(`${who}@example.test`)
    }
    const today=(await h.api('me',cookie.owner)).today
    const asset=(await h.api('asset.create',cookie.lead,{tag:'CON-1',name:'Conveyor',location:'Line 1'})).id
    const other=(await h.api('asset.create',cookie.lead,{tag:'CON-2',name:'Other conveyor',location:'Line 2'})).id
    const state=()=>h.api('connectors',cookie.owner)
    const grant=async()=>(await h.api('automation',cookie.owner)).rules.find(row=>row.id==='connectors')
    const sub=async name=>(await state()).subscriptions.find(row=>row.name===name)
    const control=async(name,paused)=>{const row=await sub(name);return h.api('webhook.control',cookie.owner,{subscription:row.id,revision:row.revision,paused,reason:paused?'Receiver maintenance':'Receiver verified'})}
    const subscribe=async(name,events,extra={})=>{
      const row=await h.api('webhook.subscribe',cookie.owner,{name,endpoint:`https://receiver.example.test/${name}`,events,asset,...extra})
      keys.set(name,{secret:row.secret,keyVersion:row.secretVersion})
      assert.equal(row.paused,true,'subscription must be tested before enabling')
      return row
    }
    const run=async at=>{await h.stop();runtimeOffset=at-Date.now();receiverClock=at;await start();await h.scheduled('*/15 * * * *',at)}
    await h.api('connectors',undefined,undefined,401)
    for(const who of ['lead','max','sam','agent']) {
      await h.api('connectors',cookie[who],undefined,403)
      for(const action of ['webhook.subscribe','webhook.control','webhook.rotate','webhook.resume','webhook.retry'])await h.api(action,cookie[who],{},403)
    }
    for(const endpoint of ['http://receiver.example.test/work','https://127.0.0.1/work','https://localhost/work','https://receiver.internal/work','https://user:pass@receiver.example.test/work','https://receiver.example.test/work?token=synthetic-gasket-3'])await h.api('webhook.subscribe',cookie.owner,{name:'invalid',endpoint,events:['work.changed']},400)
    await h.api('webhook.subscribe',cookie.owner,{name:'invalid',endpoint:'https://receiver.example.test/work',events:['bill.paid']},400)
    const workSub=await subscribe('work',['work.changed']), receiptSub=await subscribe('receipt',['receipt.created'])
    const work=(await h.api('workorder.create',cookie.lead,{asset,title:'Replace conveyor bearing',due:today,assignee:ids.max})).id
    await h.api('workorder.create',cookie.lead,{asset:other,title:'Outside this scope',due:today,assignee:ids.max})
    const unchanged=await state(),ledger=await h.api('automation/jobs',cookie.owner),audit=await h.api('audit',cookie.owner)
    assert.equal(unchanged.preview.find(row=>row.subscription===workSub.id).events.length,1)
    assert.equal(unchanged.preview.find(row=>row.subscription===receiptSub.id).events.length,0)
    assert.deepEqual(await state(),unchanged,'preview never enqueues or sends')
    assert.deepEqual(await h.api('automation/jobs',cookie.owner),ledger)
    assert.deepEqual(await h.api('audit',cookie.owner),audit)
    await run(now());assert.equal(received.length,0,'paused subscriptions retain source events')
    await control('work',false);await control('receipt',false)
    const rule=await grant()
    await h.api('automation.control',cookie.owner,{rule:'connectors',revision:rule.revision,paused:true,reason:'Test global pause'})
    await run(now()+1000);assert.equal(received.length,0,'automation pause also prevents delivery')
    await h.api('automation.control',cookie.owner,{rule:'connectors',revision:(await grant()).revision,paused:false,reason:'Ready'})
    await h.api('automation.catchup',cookie.owner,{rule:'connectors',revision:1},409)
    await Promise.all([h.api('automation.catchup',cookie.owner,{rule:'connectors',revision:(await grant()).revision}),h.api('automation.catchup',cookie.owner,{rule:'connectors',revision:(await grant()).revision})])
    assert.equal(received.length,1,'overlapping jobs claim exactly one attempt')
    assert.equal(received[0].body.sourceId,work);assert.equal(received[0].body.sourceVersion,1)
    assert.equal(maxInFlight,1)
    let current=await state()
    assert.equal(current.deliveries[0].state,'delivered')
    assert.ok(current.subscriptions.find(row=>row.id===workSub.id).last_success)
    assert.ok(!JSON.stringify(current).includes(workSub.secret),'secret is absent from GET state')
    assert.ok(!JSON.stringify(await h.api('automation/jobs',cookie.owner)).includes(workSub.secret))
    assert.ok(!JSON.stringify(await h.api('audit',cookie.owner)).includes(workSub.secret))
    await h.api('webhook.resume',cookie.owner,{subscription:workSub.id,revision:(await sub('work')).revision,cursor:0,reason:'Reconcile from start'})
    await run(now()+2000);assert.equal(received.length,1,'cursor rewind does not resend delivered events')
    await h.api('webhook.resume',cookie.owner,{subscription:workSub.id,revision:(await sub('work')).revision,cursor:999999,reason:'Cannot skip accepted events'},400)
    // A real approved purchase and idempotent receipt supply the other source.
    const supplier=(await h.api('supplier.save',cookie.owner,{name:'Bearing supplier',contact:'Nia',email:'orders@example.test',phone:'+1 216 555 0177',street:'2200 Superior Avenue',city:'Cleveland',state:'OH',zip:'44114',taxTreatment:'sales_tax',taxNote:'Destination tax',paymentTerms:'Net 30',leadDays:3,active:true})).id
    const costCenter=(await h.api('costcenter.save',cookie.owner,{code:'CON',name:'Connectors',active:true})).id
    const part=(await h.api('part.create',cookie.lead,{number:'CON-P1',name:'Bearing',unit:'each',minimum:'0',location:'Stores'})).id
    const order=(await h.api('purchase.save',cookie.owner,{supplier,costCenter,asset,workOrder:work,deliveryOn:today,taxTreatment:'sales_tax',kind:['part'],description:['Bearing'],quantity:['10'],unit:['each'],unitPrice:['12.00'],reason:'Conveyor repair'})).id
    await h.api('purchase.approve',cookie.sam,{order,revision:1})
    const revisionId=(await h.api(`purchase-orders/${order}`,cookie.owner)).current.id
    const receiptInput={order,revisionId,externalId:'synthetic-gasket-4',freight:'0',salesTax:'0',lines:[{line:0,part,quantity:'6',quarantine:'0',bin:'A1'}]}
    const receipt=await h.api('receipt.receive',cookie.lead,receiptInput)
    assert.equal((await h.api('receipt.receive',cookie.lead,receiptInput)).replayed,true)
    await h.api('receipt.receive',cookie.lead,{...receiptInput,lines:[{line:0,part,quantity:'5',quarantine:'0',bin:'A1'}]},409)
    await run(now()+3000)
    const receiptEvent=received.find(row=>row.name==='receipt')
    assert.equal(receiptEvent.body.sourceId,receipt.receipt)
    assert.deepEqual(receiptEvent.body.data,{orderId:order,revisionId,externalId:'synthetic-gasket-4'})
    assert.equal(received.filter(row=>row.name==='receipt').length,1)
    assert.deepEqual([effects.stock.length,effects.bills.length],[1,1])
    const domainBefore={work:await h.api(`work/${work}`,cookie.lead),part:await h.api(`parts/${part}`,cookie.lead),orders:await h.api('purchase-orders',cookie.owner),notices:await h.api('notices',cookie.max)}
    // Rate-limit this real work revision, honor Retry-After, then rotate while
    // pending. The retained payload and source ID survive a Worker restart.
    modes.set('work','rate')
    await h.api('workorders.bulk',cookie.lead,{workOrder:[work],version:['1'],action:'reschedule',due:today})
    await run(now()+4000)
    current=await state();let pending=current.deliveries.find(row=>row.state==='retry')
    assert.equal(pending.error,'rate_limited');assert.equal(pending.attempts,1)
    const count=received.length
    await run(now()+60_000);assert.equal(received.length,count,'no retry before receiver Retry-After')
    const rotated=await h.api('webhook.rotate',cookie.owner,{subscription:workSub.id,revision:(await sub('work')).revision,reason:'Planned receiver key rotation'})
    keys.set('work',{secret:rotated.secret,keyVersion:2});modes.delete('work')
    assert.notEqual(rotated.secret,workSub.secret)
    await h.api('webhook.control',cookie.owner,{subscription:workSub.id,revision:1,paused:false,reason:'Stale control'},409)
    const beforeRestore=await state()
    await h.stop()
    const {join}=await import('node:path'), archive=join(install.root,'exports','connectors.rer')
    await install.rer('export','--output',archive)
    const destination=await makeInstallation();restoredInstalls.push(destination)
    await destination.rer('import','--input',archive,'--yes')
    activeInstall=destination;await start()
    for(const who of Object.keys(cookie))cookie[who]=await h.signIn(`${who}@example.test`)
    assert.equal((await h.raw('/setup',{cookie:cookie.owner,form:new URLSearchParams({confirm:'yes'})})).status,303)
    const afterRestore=await state(), expectedRestore=structuredClone(beforeRestore)
    for(const sub of expectedRestore.subscriptions)sub.paused=true
    for(const preview of expectedRestore.preview)preview.paused=true
    assert.notEqual(afterRestore.inputFingerprint,beforeRestore.inputFingerprint,'restored pause state changes the source fingerprint')
    expectedRestore.inputFingerprint=afterRestore.inputFingerprint
    assert.deepEqual(afterRestore,expectedRestore,'source IDs, pending delivery and all attempt evidence survive inactive restore')
    const sentBeforeReconnect=received.length
    await run(now()+125_000)
    assert.equal(received.length,sentBeforeReconnect,'restored connectors stay inactive until intentional reconnection')
    for(const name of ['work','receipt']) {
      const row=await sub(name)
      const reconnected=await h.api('webhook.rotate',cookie.owner,{subscription:row.id,revision:row.revision,reason:'Reconnect restored installation'})
      keys.set(name,{secret:reconnected.secret,keyVersion:reconnected.secretVersion})
      await control(name,false)
    }
    const connectorRule=(await h.api('automation' + '/jobs',cookie.owner)).rules.find(row=>row.id==='connectors')
    await h.api('automation.control',cookie.owner,{rule:'connectors',revision:connectorRule.revision,paused:false,reason:'Restored receiver keys intentionally reconnected'})
    assert.equal((await state()).deliveries.find(row=>row.id===pending.id).state,'retry')
    await run(now()+130_000)
    const retried=received.at(-1)
    assert.equal(retried.headers['gasket-id'],pending.id)
    assert.equal(retried.headers['gasket-key-version'],'3')
    assert.equal(retried.body.sourceVersion,2)
    assert.equal((await state()).deliveries.find(row=>row.id===pending.id).state,'delivered')
    const oldKey=await receiveWebhook(new Request('https://receiver.example.test/work',{method:'POST',headers:captured.headers,body:captured.body}),{secret:workSub.secret,keyVersion:1,acceptOnce:()=>{throw Error('must not apply')},now:receiverClock})
    assert.equal(oldKey.status,401)
    const expired=await receiveWebhook(new Request('https://receiver.example.test/work',{method:'POST',headers:captured.headers,body:captured.body}),{...keys.get('work'),acceptOnce:()=>{throw Error('must not apply')},now:Number(captured.headers['gasket-timestamp'])*1000+301_000})
    assert.equal(expired.status,401);assert.equal((await expired.json()).error,'expired_replay')
    const forged=await receiveWebhook(new Request('https://receiver.example.test/work',{method:'POST',headers:captured.headers,body:captured.body+' '}),{...keys.get('work'),acceptOnce:()=>{throw Error('must not apply')},now:receiverClock})
    assert.equal(forged.status,401)
    // Simulate a timeout after the receiver commits. A new signed attempt has
    // the same event identity and is deduplicated by the durable receiver edge.
    await control('work',true);await control('receipt',true)
    await subscribe('timeout',['receipt.created'],{cursor:0});await control('timeout',false);modes.set('timeout','timeout')
    const effectsBefore=[effects.work.length,effects.stock.length,effects.bills.length,effects.notices.length]
    await run(now()+140_000)
    const timeoutSub=await sub('timeout')
    pending=(await state()).deliveries.find(row=>row.subscription_id===timeoutSub.id)
    assert.equal(pending.state,'retry');assert.equal(pending.error,'receiver_timeout')
    const firstTimeout=received.at(-1)
    await h.stop();await start();modes.delete('timeout')
    await run(now()+150_000)
    assert.equal(received.at(-1).headers['gasket-id'],firstTimeout.headers['gasket-id'])
    assert.equal((await state()).deliveries.find(row=>row.id===pending.id).state,'delivered')
    assert.deepEqual([effects.work.length,effects.stock.length,effects.bills.length,effects.notices.length],effectsBefore,'neither source replay nor network timeout duplicates external effects')
    await control('timeout',true)
    // Bounded retries produce an actionable dead letter; explicit repair
    // starts another bounded cycle with the same event/delivery IDs.
    await subscribe('dead',['receipt.created'],{cursor:0});await control('dead',false);modes.set('dead','unavailable')
    for(const advance of [160_000,170_000,180_000])await run(now()+advance)
    const deadSub=await sub('dead');let dead=(await state()).deliveries.find(row=>row.subscription_id===deadSub.id)
    assert.deepEqual([dead.state,dead.attempts,dead.error],['dead',3,'receiver_http_503'])
    const deadCount=received.length;await run(now()+190_000);assert.equal(received.length,deadCount)
    const html=await(await h.raw('/app/automation',{cookie:cookie.owner})).text()
    for(const text of ['Maintenance webhooks','Dead letter:','receiver http 503','Reason for retry','Retry delivery','Cursor'])assert.ok(html.includes(text),text)
    assert.ok(!(await(await h.raw('/app/automation',{cookie:cookie.sam})).text()).includes('Dead letter:'))
    if(process.env.CONNECTOR_SCREENSHOTS)await connectorBrowser({h,cookie})
    modes.delete('dead')
    if(!process.env.CONNECTOR_SCREENSHOTS)await h.api('webhook.retry',cookie.owner,{delivery:dead.id,reason:'Receiver repaired'})
    assert.equal((await state()).deliveries.find(row=>row.id===dead.id).state,'retry')
    await run(now()+200_000)
    dead=(await state()).deliveries.find(row=>row.id===dead.id)
    assert.equal(dead.state,'delivered');assert.equal(dead.attempts,1)
    assert.equal((await state()).attempts.filter(row=>row.delivery_id===dead.id).length,4,'all retry cycles keep their attempt history')
    await control('dead',true)
    // Quota persists across runs and never drops queued events. Rewinding
    // keeps every already delivered job; exhausted quota resets after an hour.
    await subscribe('quota',['work.changed'],{cursor:0,quota:1});await control('quota',false)
    await run(now()+210_000)
    const quotaSub=await sub('quota')
    assert.equal(quotaSub.quota_used,1);assert.equal(quotaSub.last_error,'quota_exhausted')
    assert.equal((await state()).deliveries.filter(row=>row.subscription_id===quotaSub.id&&row.state==='pending').length,1)
    const quotaCount=received.filter(row=>row.name==='quota').length
    await run(now()+220_000);assert.equal(received.filter(row=>row.name==='quota').length,quotaCount)
    await run(now()+3_820_000);assert.equal(received.filter(row=>row.name==='quota').length,quotaCount+1)
    // A delayed Cron keeps its historical business source time, while the
    // transport signs now and cannot reset quota by replaying older slots.
    await subscribe('delayed',['work.changed'],{cursor:0,quota:1});await control('delayed',false)
    const delayedBefore=received.length
    await h.scheduled('*/15 * * * *',Date.now()+runtimeOffset-3_600_000)
    assert.equal(received.length,delayedBefore+1)
    assert.ok(Math.abs(Number(received.at(-1).headers['gasket-timestamp'])*1000-(Date.now()+runtimeOffset))<10_000,'delayed Cron signs at current transport time')
    await h.scheduled('*/15 * * * *',Date.now()+runtimeOffset)
    assert.equal(received.length,delayedBefore+1,'old source slots cannot reset the live hourly quota')
    const record=(await h.api('automation/jobs',cookie.owner)).jobs.find(row=>row.rule_id==='connectors'&&row.output?.deliveries?.length)
    assert.ok(record.input.connectors.highWater>0&&record.input.connectors.limits.attempts===3)
    current=await state()
    assert.ok(current.sourceRevision>0&&current.latestChangeAt>0&&/^[a-f0-9]{64}$/.test(current.inputFingerprint))
    assert.ok(current.attempts.every(row=>row.automation_job_id&&row.automation_revision>0&&row.subscription_revision>0&&row.finished_at))
    assert.ok((await h.api('metrics?metric=connectors.quota',cookie.owner)).definitions[0].sourceDoor==='/api/gasket/connectors')
    assert.equal((await h.api('work',cookie.lead)).length,2)
    assert.deepEqual(await h.api(`parts/${part}`,cookie.lead),domainBefore.part)
    assert.deepEqual(await h.api('purchase-orders',cookie.owner),domainBefore.orders)
    assert.deepEqual(await h.api('notices',cookie.max),domainBefore.notices)
    console.log('INT-002 signed events and durable connector delivery passed')
  }finally{if(h)await h.close();for(const destination of restoredInstalls)await destination.remove();await install.remove()}
}

async function connectorBrowser({h,cookie}) {
  const {chromium}=await import('@playwright/test')
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.owner.split('; ').map(pair=>{const at=pair.indexOf('=');return{name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      await page.goto(h.origin+'/app/automation')
      const card=page.locator('#webhooks')
      await card.locator('summary').click()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`connector card fits ${width}`)
      await card.screenshot({path:`${process.env.CONNECTOR_SCREENSHOTS}/webhooks-${width}.png`})
      await page.screenshot({path:`${process.env.CONNECTOR_SCREENSHOTS}/automation-${width}.png`,fullPage:true})
      assert.ok(await card.getByRole('link',{name:'Open source record'}).isVisible())
      const form=card.locator('form[action="/app/do/webhook.retry"]')
      await form.locator('[name=reason]').fill('Receiver configuration inspected')
      assert.ok(await form.getByRole('button',{name:'Retry delivery'}).isEnabled())
      if(width===390)await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Retry delivery'}).click()])
    }
    await context.close()
  }finally{await browser.close()}
}
if(process.argv.includes('--connectors'))await connectorJourney()
