// Public-door journey: reviewed time, retained corrections and reconciled repair costs.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { harness } from './harness.mjs'
import { localNow, addDays } from '../../src/gasket/dates.ts'
import { now, zone } from './clock.mjs'

export async function laborJourney(h,cookie,people) {
  const today=localNow(zone,now()).slice(0,10),yesterday=addDays(today,-1)
  const asset=(await h.api('asset.create',cookie.lead,{tag:'LAB-100',name:'Conveyor drive',location:'Packing hall'})).id
  const work=(await h.api('workorder.create',cookie.lead,{asset,title:'Replace conveyor drive bearing',due:today,assignee:people.max})).id
  const other=(await h.api('workorder.create',cookie.lead,{asset,title:'Inspect belt tracking',due:today,assignee:people.mo})).id
  const detail=(who='owner')=>h.api(`work/${work}`,cookie[who])
  const rate={person:people.max,amount:'60.00',overtimeAfterMinutes:60,overtimeMultiplier:150}
  await h.api('labor.rate',cookie.lead,rate,403)
  await h.submit('labor.rate',cookie.owner,rate,`/app/work/${work}`)
  await h.api('labor.rate',cookie.owner,{...rate,person:people.mo,amount:'40.00',overtimeAfterMinutes:480})
  const entered=await h.api('labor.entry',cookie.max,{workOrder:work,category:'wrench',started:`${yesterday}T23:30`,ended:`${today}T01:30`,reason:'Bearing replacement over shift change'})
  assert.equal((await detail()).labor.approvedMinutes,0)
  await h.api('labor.review',cookie.lead,{entry:entered.id,decision:'approve',reason:'Checked'},403)
  await h.api('labor.review',cookie.owner,{entry:entered.id,decision:'approve'},400)
  await h.submit('labor.review',cookie.owner,{entry:entered.id,decision:'approve',reason:'Confirmed shift record'},`/app/work/${work}`)
  let original=(await detail()).labor.entries.find(row=>row.id===entered.id)
  assert.deepEqual([original.state,original.regular_minutes,original.overtime_minutes,original.cents],['approved',90,30,13500])
  // Changing rates never rewrites approved time; later correction snapshots the then-current rate.
  await h.api('labor.rate',cookie.owner,{...rate,amount:'120.00'})
  assert.equal((await detail()).labor.entries.find(row=>row.id===entered.id).cents,13500)
  const correction=await h.api('labor.entry',cookie.max,{workOrder:work,category:'wrench',started:`${yesterday}T23:30`,ended:`${today}T01:00`,reason:'Removed handover wait recorded separately',supersedes:entered.id})
  assert.equal((await detail()).labor.approvedMinutes,120,'unapproved correction removes no approved hours')
  await h.api('labor.review',cookie.owner,{entry:correction.id,decision:'approve',reason:'Correction agrees with log'})
  const corrected=(await detail()).labor.entries.find(row=>row.id===correction.id)
  assert.deepEqual([corrected.regular_minutes,corrected.overtime_minutes,corrected.cents],[90,0,18000])
  assert.equal((await detail()).labor.entries.find(row=>row.id===entered.id).state,'superseded')
  await h.api('labor.review',cookie.owner,{entry:entered.id,decision:'approve',reason:'Duplicate'},409)
  const overlap=await h.api('labor.entry',cookie.max,{workOrder:other,category:'travel',started:`${today}T00:30`,ended:`${today}T01:15`,reason:'Travel entered against wrong work'})
  assert.ok(overlap.pendingFlags.includes('Overlapping time'))
  await h.api('labor.review',cookie.owner,{entry:overlap.id,decision:'reject',reason:'Duplicate interval on other work'})
  const long=await h.api('labor.entry',cookie.max,{workOrder:other,category:'wait',started:`${yesterday}T01:00`,ended:`${yesterday}T19:00`,reason:'Incorrect shift end'})
  assert.ok(long.pendingFlags.includes('More than 16 hours'))
  await h.api('labor.review',cookie.owner,{entry:long.id,decision:'reject',reason:'Shift ended earlier'})
  await h.api('labor.entry',cookie.max,{workOrder:work,person:people.mo,category:'admin',started:`${today}T02:00`,ended:`${today}T03:00`,reason:'Cannot impersonate'},403)
  const second=await h.api('labor.entry',cookie.mo,{workOrder:work,category:'wrench',started:`${today}T00:00`,ended:`${today}T02:00`,reason:'Second technician aligned drive'})
  await h.api('labor.review',cookie.owner,{entry:second.id,decision:'approve',reason:'Crew record checked'})
  // Timer segments retain pause gaps and require review. One timer per person, across work.
  await h.submit('labor.timer',cookie.max,{workOrder:work,operation:'start',category:'admin'},`/app/work/${work}`)
  await h.api('labor.timer',cookie.max,{workOrder:other,operation:'start',category:'travel'},409)
  const paused=await h.api('labor.timer',cookie.max,{workOrder:work,operation:'pause'})
  assert.equal((await detail('max')).labor.timer.state,'paused')
  const pausedEntry=(await detail()).labor.entries.find(row=>row.id===paused.entry)
  await h.api('labor.timer',cookie.max,{workOrder:work,operation:'resume'})
  const stopped=await h.api('labor.timer',cookie.max,{workOrder:work,operation:'stop'})
  assert.equal((await detail('max')).labor.timer,null)
  const stoppedEntry=(await detail()).labor.entries.find(row=>row.id===stopped.entry)
  assert.ok(stoppedEntry.started_at>=pausedEntry.ended_at)
  assert.equal(stoppedEntry.state,'pending')
  const fixedTimer=await h.api('labor.entry',cookie.max,{workOrder:work,category:'admin',started:`${today}T02:00`,ended:`${today}T02:15`,reason:'Timer was left on during documentation',supersedes:paused.entry})
  await h.api('labor.review',cookie.owner,{entry:fixedTimer.id,decision:'approve',reason:'Corrected timer confirmed'})
  await h.api('labor.review',cookie.owner,{entry:stopped.entry,decision:'reject',reason:'Accidental resumed segment'})
  for(const category of ['travel','wait']) {
    const entry=await h.api('labor.entry',cookie.mo,{workOrder:work,category,started:`${today}T${category==='travel'?'03':'04'}:00`,ended:`${today}T${category==='travel'?'03':'04'}:15`,reason:`Recorded ${category}`})
    await h.api('labor.review',cookie.owner,{entry:entry.id,decision:'approve',reason:'Confirmed'})
  }
  await h.api('labor.invoice',cookie.lead,{workOrder:work,contractor:'Drive service',reference:'synthetic-gasket-1',minutes:120,amount:'250.00',note:'Specialist alignment'},403)
  await h.submit('labor.invoice',cookie.owner,{workOrder:work,contractor:'Drive service',reference:'synthetic-gasket-1',minutes:120,amount:'250.00',note:'Specialist alignment'},`/app/work/${work}`)
  await h.api('labor.invoice',cookie.owner,{workOrder:other,contractor:'Drive service',reference:'synthetic-gasket-1',minutes:120,amount:'250.00',note:'Duplicate'},409)
  const owner=await detail(),technician=await detail('max')
  assert.equal(owner.labor.approvedMinutes,255)
  assert.deepEqual(owner.labor.byCategory,{wrench:210,travel:15,wait:15,admin:15})
  assert.ok(owner.labor.rates.length)
  for(const who of ['lead','max','mo','sam']) {
    const view=(await detail(who)).labor
    assert.equal(view.rates,undefined)
    assert.ok(view.entries.every(row=>row.person_id===people[who] && !('cents' in row) && !('rate_id' in row)))
    assert.deepEqual(view.invoices,[])
    assert.equal((await h.raw(`/app/work/${work}`,{cookie:cookie[who]})).status,200)
  }
  assert.equal(technician.labor.approvedMinutes,255)
  const audit=await h.api('audit?action=labor',cookie.sam)
  for(const row of audit.rows) {
    assert.equal('cents_per_hour' in JSON.parse(row.detail),false)
    assert.equal('cents' in JSON.parse(row.detail),false)
  }
  assert.equal((await h.raw(`/api/gasket/work/${work}`)).status,401)
  const metric=await h.api('metrics?metric=labor.approved-hours',cookie.lead)
  assert.equal(metric.definitions[0].sourceDoor,'/api/gasket/work')
  if(process.env.LABOR_SCREENSHOTS) {
    const { laborBrowser }=await import('./labor-costs-browser.mjs')
    await laborBrowser({h,cookie,work,people,today})
  }
  return {work,other,asset,today,people}
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const h=await harness()
  try {
    const cookie={owner:await h.owner()},people={}
    await h.api('site.configure',cookie.owner,{name:'Harbour manufacturing',timezone:zone})
    for(const [key,name,role] of [['lead','Lena Park','lead'],['max','Max Ortiz','maintainer'],['mo','Mo Haddad','maintainer'],['sam','Sam Ito','supervisor']]) {
      people[key]=(await h.api('access.give',cookie.owner,{name,email:`${key}@example.test`,role})).id
      cookie[key]=await h.signIn(`${key}@example.test`)
    }
    const context=await laborJourney(h,cookie,people)
    console.log('Reviewed labor journey passed')
    if(process.env.COSTING_TEST) {const {costingJourney}=await import('./work-costing.mjs');await costingJourney(h,cookie,context);console.log('Reconciled costing journey passed')}
  } finally {await h.close()}
}
