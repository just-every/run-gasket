// AGENT-004: human-agreed windows, matched exposure, gaps and approved reversal.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { harness } from './harness.mjs'
import { offset, zone } from './clock.mjs'

export async function outcomeJourney({ bindings, investigate, proposalGate = false } = {}) {
  const initial=await harness({bindings,proposalGate,clockOffset:offset-8*86_400_000});let h=initial
  try {
    const cookie={owner:await h.owner()},ids={},assets=[],meters=[],plans={},baselineJobs=[]
    await h.api('site.configure',cookie.owner,{name:'Lake Erie Compressor Works',timezone:zone})
    for(const [key,role,name] of [['lead','lead','Mara Chen'],['max','maintainer','Luis Ortega'],['agent','agent','Reliability agent']]) {
      ids[key]=(await h.api('access.give',cookie.owner,{name,email:`${key}@example.test`,role})).id;cookie[key]=await h.signIn(`${key}@example.test`)
    }
    const base=(await h.api('me',cookie.owner)).today
    const day=n=>{const d=new Date(`${base}T12:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
    const reopen=async n=>{await h.stop();h=await harness({installation:initial.installation,vars:initial.vars,proposalGate,clockOffset:offset+(n-8)*86_400_000});cookie.owner=await h.signIn(initial.vars.OWNER_EMAIL);for(const key of ['lead','max','agent'])cookie[key]=await h.signIn(`${key}@example.test`)}
    for(let i=0;i<3;i++) {
      assets.push((await h.api('asset.create',cookie.lead,{tag:`OUT-CMP-${i+1}`,name:`Compressor ${i+1} for packaging hall production`,location:'Lake Erie plant',category:'Air compressor'})).id)
      meters.push((await h.api('meter.create',cookie.lead,{asset:assets[i],name:'Operating hours',kind:'counter',unit:'h'})).id)
    }
    const checklist=(await h.api('checklist.create',cookie.lead,{name:'Bearing and lubrication',items:['Inspect bearing']})).id
    const schedule=(await h.api('schedule.create',cookie.lead,{asset:assets[0],checklist,title:'Compressor bearing lubrication program',everyDays:30,firstDue:day(30),assignee:ids.max})).id
    const limit=source=>({schedule,source,revision:0,minDays:7,maxDays:60,reference:`Lead-entered ${source} maintenance limit`})
    for(const source of ['oem','legal','site'])await h.api('interval.limit',cookie.lead,limit(source))
    const reading=async(i,on,value)=>h.api('meter.feed',cookie.lead,{meter:meters[i],value:String(value),takenOn:on,source:'Owner-operated hour counter',quality:'good'})
    // A wide declared feed window retains these timely readings as good. No stale reading is relabelled.
    for(const meter of meters)await h.api('meter.window',cookie.lead,{meter,feedWindowHours:168})
    const periodWork=async(i,start,end,failures,amount)=>{
      const work=(await h.api('workorder.create',cookie.lead,{asset:assets[i],title:`Recorded bearing maintenance ${day(start)}`,due:day(start),assignee:ids.max})).id
      for(let k=0;k<failures;k++) {
        const hh=String(3+k*2).padStart(2,'0')
        await h.api('downtime.start',cookie.max,{workOrder:work,startedOn:`${day(start)}T${hh}:00`,reason:'Oil-feed bearing trip'})
        await h.api('downtime.end',cookie.max,{workOrder:work,endedOn:`${day(start)}T${hh}:30`})
      }
      await h.api('work.cost',cookie.lead,{workOrder:work,category:'labor',amount:String(amount),note:'Posted maintenance cost, no pay rate'})
      return work
    }
    for(let i=0;i<3;i++){await reading(i,`${day(0)}T00:00`,0);baselineJobs.push(await periodWork(i,0,1,2,100))}
    await reopen(3)
    for(let i=0;i<3;i++)await reading(i,`${day(2)}T00:00`,20)
    await h.api('finding.record',cookie.max,{workOrder:baselineJobs[0],severity:'low',text:'Bearing oil feed cleaned and tested under load'})
    await h.api('workorder.submit',cookie.max,{workOrder:baselineJobs[0],version:(await h.api(`work/${baselineJobs[0]}`,cookie.max)).version})
    await h.api('workorder.review',cookie.owner,{workOrder:baselineJobs[0],version:(await h.api(`work/${baselineJobs[0]}`,cookie.owner)).version,decision:'approve'})
    const interval=await h.api('proposal.prepare',cookie.agent,{kind:'interval',payload:{schedule,everyDays:'14',from:day(0),to:day(1),peers:assets.slice(1).join(','),rollbackPlan:'If normalized failures worsen, review restoring 30 days independently.'},reasoning:'Bearing failures in measured compressor cohort justify reviewing a shorter interval.'})
    await h.api('proposal.decide',cookie.lead,{proposal:interval.id,hash:interval.hash,decision:'approve'})
    const window=(start,end)=>({proposal:interval.id,baselineFrom:day(0),baselineTo:day(1),postFrom:day(start),postTo:day(end),peers:assets.slice(1).join(',')})
    await h.api('outcome.window',cookie.agent,window(4,5),403)
    await h.api('outcome.window',cookie.lead,window(1,5),400)
    for(const [key,start] of [['improvement',4],['reduction',6],['worsening',8],['gap',10]])plans[key]=(await h.api('outcome.window',cookie.lead,window(start,start+1))).id
    plans.repair=(await h.api('outcome.window',cookie.lead,{...window(4,5),proposal:undefined,workOrder:baselineJobs[0]})).id
    await h.api('outcome.assess',cookie.agent,{window:plans.improvement},400)
    let values=[20,20,20],pending=[]
    for(const [key,start] of [['improvement',4],['reduction',6],['worsening',8],['gap',10]]) {
      await reopen(start+1)
      for(const [i,on,value]of pending)await reading(i,on,value);pending=[]
      for(let i=0;i<3;i++) {
        await reading(i,`${day(start)}T00:00`,values[i])
        const hours=i===0&&['reduction','worsening'].includes(key)?10:20
        const failures=i===0?(key==='worsening'?3:1):2
        const amount=i===0?(key==='worsening'?200:50):100
        await periodWork(i,start,start+1,failures,amount)
        values[i]+=hours
        if(!(i===0&&key==='gap'))pending.push([i,`${day(start+2)}T00:00`,values[i]])
      }
    }
    await reopen(12)
    for(const[i,on,value]of pending)await reading(i,on,value)
    const assess=window=>h.api('outcome.assess',cookie.agent,{window})
    const improved=await assess(plans.improvement)
    assert.equal(improved.status,'observational_improvement','AGENT-004 measured relative improvement remains observational')
    assert.deepEqual([improved.subject.baseline.failures,improved.subject.post.failures,improved.subject.baseline.operatingHours,improved.subject.post.operatingHours],[2,1,20,20])
    assert.deepEqual([improved.subject.baseline.downtimeMinutes,improved.subject.post.downtimeMinutes,improved.subject.baseline.costCents,improved.subject.post.costCents],[60,30,10000,5000])
    assert.equal(improved.peers.length,2)
    assert.ok(improved.comparison.subjectMinusPeerDelta.failuresPerHour<0)
    assert.ok(improved.uncertainty.length&&improved.citations.readings.length)
    assert.deepEqual(await h.api(`outcomes/${improved.id}`,cookie.lead),improved)
    assert.deepEqual(await h.api(`outcomes/${improved.id}`,cookie.max),improved,'AGENT-004 internal readers retain the source-work read scope')
    await h.api('outcome.assess',cookie.max,{window:plans.improvement},403)
    assert.equal((await h.raw(`/api/gasket/outcomes/${improved.id}`)).status,401)
    const repair=await assess(plans.repair)
    assert.equal(repair.workOrder,baselineJobs[0],'AGENT-004 completed independently reviewed repair is also an intervention')
    assert.equal(repair.status,'observational_improvement')
    const reduced=await assess(plans.reduction)
    assert.equal(reduced.status,'no_improvement','AGENT-004 fewer events from half the operation is not success')
    assert.equal(reduced.subject.productionReduction,true)
    assert.equal(reduced.subject.delta.failuresPerHour,0)
    const gap=await assess(plans.gap)
    assert.equal(gap.status,'unproven')
    assert.equal(gap.subject.post.operatingHours,null)
    assert.ok(gap.subject.post.unknownHours>0)
    const worse=await assess(plans.worsening)
    assert.equal(worse.status,'worsening')
    assert.ok(worse.subject.post.rates.failuresPerHour>worse.subject.baseline.rates.failuresPerHour)
    assert.equal((await assess(plans.worsening)).id,worse.id,'AGENT-004 unchanged evidence retains one assessment')
    const notices=await h.api('notices',cookie.lead)
    assert.equal(notices.filter(n=>n.outcome_id===worse.id).length,1,'AGENT-004 lead receives one worsening alert')
    assert.equal(notices.filter(n=>n.outcome_id===gap.id).length,1,'AGENT-004 lead receives missing-evidence alert')
    assert.equal(notices.find(n=>n.outcome_id===worse.id).link,`/api/gasket/outcomes/${worse.id}`,'AGENT-004 notice opens the exact retained comparison')
    const investigation=await h.api('outcome.investigate',cookie.agent,{outcome:gap.id})
    assert.equal((await h.api('proposals',cookie.lead)).find(p=>p.id===investigation.id).status,'pending')
    const reversal=await h.api('outcome.reversal',cookie.agent,{outcome:worse.id,rollbackPlan:'Restore 30-day interval only after this independent decision; investigate the oil-feed fault and continue measurement.'})
    assert.equal((await h.api('schedules',cookie.lead)).find(s=>s.id===schedule).every_days,14,'AGENT-004 proposal makes no autonomous standard change')
    await h.api('proposal.decide',cookie.agent,{proposal:reversal.id,hash:reversal.hash,decision:'approve'},403)
    if(process.env.OUTCOME_SCREENSHOTS) {
      const {outcomeBrowser}=await import('./outcomes-browser.mjs');await outcomeBrowser(h,cookie,reversal)
    } else await h.api('proposal.decide',cookie.lead,{proposal:reversal.id,hash:reversal.hash,decision:'approve'})
    assert.equal((await h.api('schedules',cookie.lead)).find(s=>s.id===schedule).every_days,30)
    assert.deepEqual(await h.api(`outcomes/${worse.id}`,cookie.lead),worse,'AGENT-004 retained assessment is immutable')
    // REPORT-009: discover every retained comparison through the definition's public source list.
    const registry=await h.api('metrics?metric=outcome.rates',cookie.lead)
    const definition=registry.definitions[0]
    for(const key of ['formula','eventTime','exclusions','freshness'])assert.ok(definition[key])
    assert.deepEqual((await h.api(`metrics?metric=outcome.rates&version=${definition.version}`,cookie.lead)).definitions,[definition])
    const source=await h.raw(definition.sourceDoor,{cookie:cookie.lead})
    assert.equal(source.status,200)
    const assessments=await source.json()
    for(const expected of [improved,reduced,gap,worse,repair]) {
      const retained=assessments.find(row=>row.id===expected.id)
      assert.ok(retained,'REPORT-009 source list includes interval and work interventions, missing telemetry and worsening')
      assert.deepEqual(await (await h.raw(retained.sourceDoor,{cookie:cookie.lead})).json(),expected)
    }
    assert.equal(improved.subject.post.rates.failuresPerHour,improved.subject.post.rateInputs.failures/improved.subject.post.operatingHours)
    assert.equal(improved.comparison.post.failuresPerHour,improved.peers.reduce((sum,p)=>sum+p.post.rateInputs.failures,0)/improved.peers.reduce((sum,p)=>sum+p.post.operatingHours,0))
    assert.equal(gap.subject.post.rates.failuresPerHour,null,'REPORT-009 missing counter coverage remains unknown in retained sources')
    await h.api('outcomes',undefined,undefined,401)
    assert.deepEqual(await h.api('outcomes',cookie.max),assessments,'REPORT-009 source directory retains the source-record read scope')
    if(process.env.OUTCOME_SCREENSHOTS) {
      const {registryBrowser}=await import('./outcomes-browser.mjs')
      await registryBrowser(h,cookie,improved)
    }

    const fresh = await assess(plans.worsening)
    const nativeInvestigation = await h.api('outcome.investigate', cookie.agent, { outcome: fresh.id })
    const retained = (await h.api('proposals', cookie.lead)).find(row => row.id === nativeInvestigation.id)
    assert.equal(retained.basis.outcome, fresh.id)
    assert.equal(retained.basis.sourceHash, fresh.source.sourceHash)
    assert.equal(retained.basis.window, plans.worsening)
    await h.api('proposal.decide', cookie.agent, { proposal: retained.id, hash: retained.payload_hash, decision: 'approve' }, 403)
    const investigated = await h.api('proposal.decide', cookie.lead, { proposal: retained.id, hash: retained.payload_hash, decision: 'approve' })
    const corrective = await h.api(`work/${investigated.result}`, cookie.lead)
    assert.deepEqual([corrective.kind, corrective.asset_id, corrective.status], ['corrective', assets[0], 'open'])
    assert.equal(corrective.description, fresh.uncertainty.join(' '))
    assert.equal((await h.api('proposals', cookie.lead)).find(row => row.id === retained.id).decided_by, ids.lead)
    assert.deepEqual(await h.api(`outcomes/${fresh.id}`, cookie.lead), fresh)
    console.log('PROBE AGENT-004 native decision: outcome.investigate then independent proposal.decide -> one open corrective investigation with retained source fingerprint')
    if (investigate) await investigate({ h, cookie, ids, assets, meters, plans, day, gap, worse, reading, periodWork, assess, schedule, baselineJobs })
    console.log('AGENT-004 approved intervention, matched exposure, telemetry gap, production reduction, notices and human-approved reversal passed')
  } finally {await h.close();if(h!==initial)await initial.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await outcomeJourney()
