// AGENT-003: cited comparisons, mandatory bounds, independent approval and rollback.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { harness } from './harness.mjs'
import { offset, zone } from './clock.mjs'

export async function intervalJourney() {
  const initial = await harness(); let h = initial
  try {
    const cookie = { owner: await h.owner() }, ids = {}, assets = [], schedules = [], meters = [], jobs = []
    await h.api('site.configure', cookie.owner, { name: 'Great Lakes Packaging and Compressor Works', timezone: zone })
    for (const [key, role, name] of [['lead','lead','Mara Chen'],['max','maintainer','Luis Ortega'],['sam','supervisor','Rosa Alvarez'],['agent','agent','Reliability agent']]) {
      ids[key] = (await h.api('access.give',cookie.owner,{name,email:`${key}@example.test`,role})).id
      cookie[key] = await h.signIn(`${key}@example.test`)
    }
    const day = (await h.api('me',cookie.owner)).today
    const shift = n => { const d = new Date(`${day}T12:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10) }
    const from = shift(-2), to = day
    const checklist = (await h.api('checklist.create',cookie.lead,{name:'Compressor bearing condition and guard check',items:['Inspect bearing and guard']})).id
    for (let i=0;i<3;i++) {
      const asset = (await h.api('asset.create',cookie.lead,{tag:`CMP-${i+1}`,name:`Production air compressor ${i+1} with remote intake and access platform`,location:'West production hall',category:'Air compressor'})).id
      assets.push(asset)
      const meter = (await h.api('meter.create',cookie.lead,{asset,name:'Run hours',kind:'counter',unit:'h'})).id; meters.push(meter)
      schedules.push((await h.api('schedule.create',cookie.lead,{asset,checklist,title:`Inspect compressor ${i+1} bearing condition before production`,everyDays:30,meter,everyUnits:'100',firstDue:shift(-29),firstDueMeter:'200',assignee:ids.max})).id)
    }
    const generated=await h.api('workorders.generate',cookie.lead,{})
    for (let i=0;i<3;i++) {
      const work = generated.created.find(w=>w.schedule===schedules[i]); jobs.push(work.id)
      await h.api('workorder.results',cookie.max,{workOrder:work.id,item:['0'],outcome:['pass'],note:['Bearing quiet; guard fasteners secure']})
      await h.api('workorder.readings',cookie.max,{workOrder:work.id,takenOn:`${from}T08:00`,meter:[meters[i]],value:['100']})
      await h.api('workorder.readings',cookie.max,{workOrder:work.id,takenOn:`${day}T09:00`,meter:[meters[i]],value:[String(120+i*5)]})
      if(i===0) {
        await h.api('downtime.start',cookie.max,{workOrder:work.id,startedOn:`${day}T08:00`,reason:'Bearing oil feed blockage'})
        await h.api('downtime.end',cookie.max,{workOrder:work.id,endedOn:`${day}T08:30`})
      }
      await h.api('work.cost',cookie.lead,{workOrder:work.id,category:'labor',amount:String(100+i*10),note:'Recorded repair labor, not a pay rate'})
      await h.api('workorder.submit',cookie.max,{workOrder:work.id,version:(await h.api(`work/${work.id}`,cookie.max)).version})
      await h.api('workorder.review',cookie.sam,{workOrder:work.id,version:(await h.api(`work/${work.id}`,cookie.sam)).version,decision:'approve'})
    }
    const limit = (schedule, source, extra={}) => ({schedule,source,revision:0,minDays:7,maxDays:60,minUnits:'25',maxUnits:'200',reference:`Lead-entered ${source} maintenance reference; not verified by Gasket`,...extra})
    for(const schedule of schedules) for(const source of ['oem','legal','site']) await h.api('interval.limit',cookie.lead,limit(schedule,source,source==='oem'&&schedule===schedules[0]?{minDays:14}:{}))
    await h.api('interval.limit',cookie.agent,limit(schedules[0],'site',{revision:1}),403)
    await h.api('interval.limit',cookie.lead,limit(schedules[0],'site'),409)
    const issued = await h.api('workorders.generate',cookie.lead,{})
    assert.equal(issued.created.length,3,'AGENT-003 pending issued orders exercise preservation')
    const issuedBefore = await Promise.all(issued.created.map(w=>h.api(`work/${w.id}`,cookie.lead)))
    await h.stop()
    h = await harness({installation:initial.installation,vars:initial.vars,clockOffset:offset+86_400_000})
    cookie.owner=await h.signIn(initial.vars.OWNER_EMAIL)
    for(const key of ['lead','max','sam','agent']) cookie[key]=await h.signIn(`${key}@example.test`)
    const payload={schedule:schedules[0],everyDays:'14',everyUnits:'50',from,to,peers:assets.slice(1).join(','),rollbackPlan:'If failure rate worsens, pause further rollout and submit a human-reviewed return to the original 30 days / 100 h cadence.'}
    const prepare=async(p=payload,status=200)=>h.api('proposal.prepare',cookie.agent,{kind:'interval',payload:p,reasoning:'Compare the recorded compressor cohort and shorten the interval after the bearing oil-feed failure.'},status)
    const decide=async(p,who='lead',decision='approve',status=200)=>h.api('proposal.decide',cookie[who],{proposal:p.id,hash:p.hash,decision,...(decision==='reject'?{note:'Coverage does not justify this change'}:{})},status)
    await h.api('proposal.prepare',cookie.max,{kind:'interval',payload,reasoning:'No authority'},403)
    await prepare({...payload,everyDays:'6'},409)
    await prepare({...payload,everyDays:'90'},409)
    await prepare({...payload,everyUnits:'201'},409)
    await prepare({...payload,everyDays:'0'},400)
    await prepare({...payload,everyDays:'45',everyUnits:'150'},409)
    // Each independent source is a hard bound, rather than an advisory label.
    for(const source of ['legal','site']) {
      await h.api('interval.limit',cookie.lead,limit(schedules[0],source,{revision:1,maxDays:10}))
      assert.equal((await prepare(payload,409)).error,'interval_outside_limits')
      await h.api('interval.limit',cookie.lead,limit(schedules[0],source,{revision:2}))
    }
    const p=await prepare()
    let row=(await h.api('proposals',cookie.lead)).find(p1=>p1.id===p.id)
    assert.equal(row.basis.assets.length,3,'AGENT-003 matched cohort is retained')
    assert.equal(row.basis.assets[0].failures,1)
    assert.equal(row.basis.assets[0].downtimeMinutes,30)
    assert.equal(row.basis.assets[0].operatingHours,20)
    assert.equal(row.basis.assets[0].completedPMs,1)
    assert.equal(row.basis.assets[0].latePMs,1)
    assert.equal(row.basis.assets[0].actualCostCents,10000)
    assert.ok(row.basis.uncertainty.length,'AGENT-003 uncertainty remains explicit')
    assert.ok(row.basis.expectedEffect)
    assert.equal(row.basis.calendarFrequencyChangePercent,114.3,'AGENT-003 exact nominal frequency comparison')
    assert.equal(row.basis.assets[0].failuresPer1000Hours,50,'AGENT-003 exposure-normalized comparison')
    assert.ok(JSON.stringify(row.basis).includes(jobs[0]),'AGENT-003 source work is cited')
    assert.equal(row.basis.limits.length,3)
    // REPORT-009: a lead opens the numbered definition and follows it to the retained cohort.
    const registry = await h.api('metrics?metric=interval.failure-rate',cookie.lead)
    for (const key of ['formula','eventTime','exclusions','freshness']) assert.ok(registry.definitions[0][key])
    const numbered = await h.api(`metrics?metric=interval.failure-rate&version=${registry.definitions[0].version}`,cookie.lead)
    assert.deepEqual(numbered.definitions,registry.definitions)
    const source = await h.raw(registry.definitions[0].sourceDoor,{cookie:cookie.lead})
    assert.equal(source.status,200)
    const retained = (await source.json()).find(item=>item.id===p.id).basis
    assert.deepEqual(retained,row.basis,'REPORT-009 source opens the unchanged evidence snapshot')
    assert.equal(retained.assets[0].failuresPer1000Hours,Math.round(retained.assets[0].coveredFailures / retained.assets[0].operatingHours * 10000)/10)

    await decide(p,'agent','approve',403)
    await h.api('proposal.decide',cookie.lead,{proposal:p.id,hash:'altered',decision:'approve'},409)
    // Any source change makes this human decision stale, even when work is closed.
    await h.api('work.cost',cookie.lead,{workOrder:jobs[0],category:'other',amount:'25',note:'Additional oil-feed repair cost'})
    await decide(p,'lead','approve',409)
    const rejected=await prepare();await decide(rejected,'lead','reject')
    assert.equal((await h.api('schedules',cookie.lead)).find(s=>s.id===schedules[0]).every_days,30)
    const own=await h.api('proposal.prepare',cookie.lead,{kind:'interval',payload,reasoning:'Lead-authored change still needs another human'})
    await decide(own,'lead','approve',403)
    const approved=await prepare()
    {
      const { intervalBrowser }=await import('./intervals-browser.mjs')
      await intervalBrowser(h,cookie,approved)
    }
    const changed=(await h.api('schedules',cookie.lead)).find(s=>s.id===schedules[0])
    assert.deepEqual([changed.every_days,changed.every_units],[14,'50'])
    await decide(approved,'owner','approve',409)
    for(let i=0;i<issued.created.length;i++) assert.deepEqual(await h.api(`work/${issued.created[i].id}`,cookie.lead),issuedBefore[i],'AGENT-003 issued work remains unchanged')
    await h.api('schedule.edit',cookie.lead,{schedule:schedules[0],revision:changed.revision,everyDays:90},409)
    const rollback=await prepare({...payload,everyDays:'30',everyUnits:'100',rollbackOf:approved.id,rollbackPlan:'Restore original cadence after reviewing the recorded uncertainty and bearing repair.'})
    await decide(rollback)
    assert.deepEqual(((s)=>[s.every_days,s.every_units])((await h.api('schedules',cookie.lead)).find(s=>s.id===schedules[0])),[30,'100'])
    await prepare({...payload,everyDays:'30',everyUnits:'100',rollbackOf:approved.id},409)
    const unobserved=(await h.api('asset.create',cookie.lead,{tag:'CMP-UNKNOWN',name:'Unobserved compressor',location:'Stores',category:'Air compressor'})).id
    await prepare({...payload,schedule:schedules[1],everyDays:'45',everyUnits:'150',peers:unobserved},409)
    await prepare({...payload,rollbackPlan:''},400)
    // A healthy peer still needs evidence and current bounds before an extension.
    const extension=await prepare({...payload,schedule:schedules[1],everyDays:'45',everyUnits:'150',peers:assets[2]})
    await h.api('interval.limit',cookie.lead,limit(schedules[1],'oem',{revision:1,maxDays:30}))
    await decide(extension,'lead','approve',409)
    const fresh=await prepare({...payload,schedule:schedules[1],everyDays:'21',everyUnits:'75',peers:assets[2]})
    await decide(fresh)
    const audit=(await h.api('audit?action=schedule',cookie.owner)).rows
    assert.ok(audit.some(r=>r.action==='schedule.interval'&&JSON.parse(r.detail).proposal===approved.id))
    assert.ok(audit.some(r=>r.action==='schedule.interval'&&JSON.parse(r.detail).rollbackOf===approved.id))
    console.log('AGENT-003 cited cohort, uncertainty, calendar/meter bounds, approval, stale evidence and rollback passed')
  } finally {await h.close();if(h!==initial)await initial.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await intervalJourney()
