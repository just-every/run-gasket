import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { join } from 'node:path'
import { installation } from './installation.mjs'
import { mkdir } from 'node:fs/promises'
import { harness } from './harness.mjs'

const day='2026-10-20', tomorrow='2026-10-21'
async function fixture() {
  const h=await harness({clockInstant:Date.parse('2026-10-20T16:00:00Z')}),owner=await h.owner()
  await h.api('site.configure',owner,{name:'Lake Erie Works',timezone:'America/New_York'})
  const people={},cookies={owner}
  for(const [key,role] of [['lead','lead'],['maya','maintainer'],['luis','maintainer']]) {
    people[key]=(await h.api('access.give',owner,{name:key==='maya'?'Maya Chen':key==='luis'?'Luis Ortega':'Planning lead',email:`planning-${key}@example.test`,role})).id
    cookies[key]=await h.signIn(`planning-${key}@example.test`)
  }
  const team=(await h.api('team.create',owner,{name:'Electrical',trade:'Electrical',member:[people.maya,people.luis]})).id
  const asset=(await h.api('asset.create',owner,{tag:'HV-1',name:'High voltage drive',location:'Plant room'})).id
  const view=()=>h.api(`planning?from=${day}`,owner)
  const change=async(action,body,status=200,who=owner)=>h.api(action,who,{revision:(await view()).revision,...body},status)
  const work=async(title,assignee=people.maya,extra={})=>(await h.api('workorder.create',owner,{asset,title,due:day,assignee,team,estimateHours:'2',...extra})).id
  const window=(member,date,start='08:00',end='16:00',kind='available')=>change('planning.window',{member,starts:`${date}T${start}`,ends:`${date}T${end}`,kind,reason:kind==='available'?'Published shift':'Approved leave'})
  const slot=(id,date,start,end,extra={})=>({workOrder:id,starts:`${date}T${start}`,ends:`${date}T${end}`,...extra})
  return {h,owner,people,cookies,team,asset,view,change,work,window,slot}
}

export async function qualificationPlanningJourney() {
  const f=await fixture(),{h,owner,people,cookies,asset,view,change,work,window,slot}=f
  try {
    assert.equal((await h.raw('/api/gasket/planning')).status,401)
    await h.api('planning',cookies.maya,undefined,403)
    assert.equal((await h.raw('/app/settings/resources',{cookie:cookies.maya})).status,403)
    for(const member of [people.maya,people.luis]) await window(member,day)
    const repair=await work('High voltage repair'),other=await work('Shared tool inspection',people.luis)
    const part=(await h.api('part.create',owner,{number:'HV-SEAL',name:'Drive seal',unit:'each'})).id
    await h.api('bom.revise',owner,{asset,part:[part],quantity:['1'],tool:['Insulation tester']})
    const tool=(await change('planning.tool',{name:'Insulation tester',identifier:'synthetic-gasket-1',calibrationDue:'2026-12-31'})).id
    const qualification={member:people.maya,name:'High voltage',expires:'2026-10-19',reference:'synthetic-gasket-2'}
    await h.api('planning.qualification',cookies.lead,qualification,403)
    await h.api('planning.qualification',owner,qualification)
    await h.api('planning.tool',cookies.lead,{name:'Unauthorized tool',identifier:'synthetic-gasket-3',calibrationDue:'2027-01-01',revision:(await view()).revision},403)
    const unrelated={member:people.luis,name:'Unrelated private reference',expires:'2027-01-01',reference:'synthetic-gasket-4'}
    await h.api('planning.qualification',owner,unrelated)
    const retiredTool=(await change('planning.tool',{name:'Retired meter',identifier:'synthetic-gasket-5',calibrationDue:'2027-01-01'})).id
    for(const body of [{kind:'qualification',member:people.luis,name:unrelated.name,reason:'No longer required'},{kind:'tool',id:retiredTool,reason:'Removed from service'}]) {
      await change('planning.resource.retire',body,403,cookies.lead)
      const form=new FormData();for(const [key,value] of Object.entries({...body,revision:(await view()).revision}))form.set(key,String(value))
      const forbidden=await h.raw('/app/do/planning.resource.retire',{cookie:cookies.lead,form})
      assert.equal(forbidden.status,303)
      assert.equal(new URL(forbidden.headers.get('location'),h.origin).searchParams.get('error'),'forbidden')
      const seen=(await view()).revision
      await change('planning.resource.retire',body)
      assert.equal((await h.api('planning.resource.retire',owner,{...body,revision:seen},409)).error,'resource_retired')
    }
    await h.api('planning.qualification',owner,unrelated,409)
    await change('planning.tool',{id:retiredTool,name:'Retired meter',identifier:'synthetic-gasket-5',calibrationDue:'2027-02-01'},409)

    await change('planning.requirements',{workOrder:repair,qualifications:'High voltage'})
    assert.ok((await change('planning.slot',slot(repair,day,'10:00','12:00',{tool:[tool],preview:true}))).conflicts.includes('parts_reservation_required'))
    await h.api('part.receive',owner,{part,quantity:'4'})
    for(const workOrder of [repair,other])await h.api('workorder.reserve',owner,{workOrder,part,quantity:'1'})
    await change('planning.slot',slot(other,day,'08:00','10:00',{tool:[tool]}))
    const necessary=await h.api(`planning?from=${day}`,cookies.lead)
    assert.deepEqual(necessary.qualifications.map(q=>[q.member_id,q.name]),[[people.maya,'High voltage']])
    assert.equal(necessary.qualifications[0].reference,undefined,'planning authority does not expose private reference text')
    assert.ok(necessary.tools.every(t=>!('retired_by' in t)&&!('retirement_reason' in t)),'planning reads omit private retirement attribution')
    assert.deepEqual(necessary.history,[],'planning authority does not expose private correction history')
    assert.ok(necessary.people.every(p=>Object.keys(p).sort().join(',')==='id,name'))
    await change('planning.window',{member:people.luis,starts:`${tomorrow}T08:00`,ends:`${tomorrow}T16:00`,kind:'available',reason:'Lead shift planning'},200,cookies.lead)
    const proposal=slot(repair,day,'08:00','10:00',{tool:[tool],preview:true})
    let preview=await change('planning.slot',proposal)
    assert.deepEqual(preview.conflicts.sort(),['qualification_required: High voltage','tool_double_booked: Insulation tester'].sort())
    const refused=await change('planning.slot',{...proposal,preview:false},409)
    assert.equal(refused.error,'planning_conflicts')
    assert.equal((await view()).work.find(w=>w.id===repair).starts,null,'a refused booking writes no slot')
    await h.api('planning.qualification',cookies.lead,{...qualification,expires:'2026-12-31'},403)
    await h.api('planning.qualification',owner,{...qualification,expires:'2026-12-31'})
    preview=await change('planning.slot',{...proposal,starts:`${day}T10:00`,ends:`${day}T12:00`})
    assert.deepEqual(preview.conflicts,[],'adjacent tool bookings do not overlap')
    const resolved=slot(repair,day,'10:00','12:00',{tool:[tool]})
    await change('planning.slot',resolved,200,cookies.lead)
    assert.equal((await view()).work.find(w=>w.id===repair).plannedMinutes,120)
    // Later absence and calibration changes expose conflicts on existing slots.
    await window(people.maya,day,'11:00','12:00','absent')
    assert.ok((await view()).work.find(w=>w.id===repair).conflicts.includes('person_absent'))
    await change('planning.tool',{id:tool,name:'Insulation tester',identifier:'synthetic-gasket-1',calibrationDue:'2026-10-19'},403,cookies.lead)
    await change('planning.tool',{id:tool,name:'Insulation tester',identifier:'synthetic-gasket-1',calibrationDue:'2026-10-19'})
    assert.ok((await view()).work.find(w=>w.id===repair).conflicts.includes('tool_calibration_expired: Insulation tester'))
    await change('planning.slot',slot(repair,day,'13:00','14:00',{tool:[tool]}),409)
    await change('planning.tool',{id:tool,name:'Insulation tester',identifier:'synthetic-gasket-1',calibrationDue:'2026-12-31'})
    assert.ok((await change('planning.slot',slot(repair,day,'13:00','14:00',{preview:true}))).conflicts.includes('tool_required: Insulation tester'))
    await change('planning.slot',slot(repair,day,'13:00','14:00',{tool:[tool]}))
    // A stale tab and concurrent competing bookings cannot both claim a tool.
    const third=await work('Tool claim three'),fourth=await work('Tool claim four',people.luis)
    for(const workOrder of [third,fourth])await h.api('workorder.reserve',owner,{workOrder,part,quantity:'1'})
    const rev=(await view()).revision
    const results=await Promise.all([third,fourth].map(workOrder=>h.raw('/api/gasket/planning.slot',{cookie:owner,body:{...slot(workOrder,day,'14:00','15:00',{tool:[tool]}),revision:rev}})))
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409])
    await h.api('planning.slot',owner,{...resolved,revision:rev},409)
    const stock=await h.api(`parts/${part}`,owner)
    await h.api('part.count',owner,{part,counted:'0',seen:stock.seen,note:'Short on shelf'})
    assert.ok((await view()).work.find(w=>w.id===repair).conflicts.includes('reserved_part_shortage'))
    await h.api('part.receive',owner,{part,quantity:'4'})
    const tradeWork=await work('Mechanical repair',people.maya,{trade:'Mechanical'})
    assert.ok((await change('planning.slot',slot(tradeWork,day,'15:00','16:00',{tool:[tool],preview:true}))).conflicts.includes('trade_required: Mechanical'))
    await h.api('team.create',owner,{name:'Mechanical',trade:'Mechanical',member:[people.maya]})
    assert.ok(!(await change('planning.slot',slot(tradeWork,day,'15:00','16:00',{tool:[tool],preview:true}))).conflicts.includes('trade_required: Mechanical'))
    assert.equal((await view()).teams.find(t=>t.name==='Mechanical').assignedMinutes,0,'a shared person does not attribute Electrical work to Mechanical')
    const assigned=(await view()).utilization.find(p=>p.id===people.maya)
    assert.equal(assigned.availableMinutes,480);assert.equal(assigned.unavailableMinutes,60);assert.equal(assigned.capacityMinutes,420)
    await h.api('workorder.assign',owner,{workOrder:repair,assignee:people.luis})
    assert.equal((await view()).work.find(w=>w.id===repair).starts,null,'a handoff releases the old person and tool booking')
    const audit=await h.api('audit',owner)
    assert.ok(JSON.stringify(audit).includes('planning.qualification'))
    await h.api('workorder.assign',owner,{workOrder:repair,assignee:people.maya})
    const renewal={member:people.luis,name:'Renewal reference',expires:'2026-11-01',reference:'synthetic-gasket-6',remindDays:15}
    const catchExpiry=async()=>h.api('automation.catchup',owner,{rule:'expiry',revision:(await h.api('automation'+'/jobs',owner)).rules.find(r=>r.id==='expiry').revision})
    const renewalNotices=async(cookie=owner)=>(await h.api('notices',cookie)).filter(n=>n.text.includes('Renewal reference'))
    await h.api('planning.qualification',owner,{...renewal,remindDays:''})
    await catchExpiry();assert.deepEqual(await renewalNotices(),[],'no reminder without explicit owner opt-in')
    await h.api('planning.qualification',owner,renewal)
    let expiryRule=(await h.api('automation'+'/jobs',owner)).rules.find(r=>r.id==='expiry')
    await h.api('automation.control',owner,{rule:'expiry',revision:expiryRule.revision,paused:true,reason:'Pause reference reminders'})
    await catchExpiry();assert.deepEqual(await renewalNotices(),[],'paused expiry job sends no qualification notice')
    expiryRule=(await h.api('automation'+'/jobs',owner)).rules.find(r=>r.id==='expiry')
    await h.api('automation.control',owner,{rule:'expiry',revision:expiryRule.revision,paused:false,reason:'Resume owner reminders'})
    await h.scheduled('*/15 * * * *',Date.parse('2026-10-20T16:00:00Z'));await catchExpiry()
    let reminders=await renewalNotices()
    assert.equal(reminders.length,1,'repeated expiry runs retain one due notice')
    assert.ok(reminders[0].text.includes('due for renewal by 2026-11-01'))
    assert.ok(reminders[0].text.includes('Owner-entered reference — not verified by Gasket with the issuing body.'))
    assert.equal(reminders[0].link,'/app/settings/resources')
    assert.deepEqual(await renewalNotices(cookies.lead),[],'renewal reminder is private to the consenting owner')
    assert.deepEqual(await renewalNotices(cookies.luis),[])
    assert.ok((await h.api('automation'+'/jobs',cookies.lead)).jobs.every(job=>!('qualificationReminders' in job.input)))
    await h.api('planning.qualification',owner,{...renewal,expires:'2027-01-01'})
    await catchExpiry();assert.equal((await renewalNotices()).length,1,'renewal beyond the reminder window sends nothing')
    await h.api('planning.qualification',owner,{...renewal,expires:'2026-10-19'})
    await catchExpiry();await catchExpiry()
    reminders=await renewalNotices()
    assert.equal(reminders.length,2)
    assert.equal(reminders.filter(n=>n.text.includes('expired after 2026-10-19')).length,1)
    await change('planning.resource.retire',{kind:'qualification',member:people.luis,name:renewal.name,reason:'Renewal no longer required'})
    await catchExpiry();assert.equal((await renewalNotices()).length,2,'retirement suppresses further reminders')
    if(process.env.PLANNING_SCREENSHOTS) await browserProof(f,'resources')
    const retirement={kind:'qualification',member:people.maya,name:'High voltage',reason:'Owner retired superseded training'}
    const stale=(await view()).revision
    await change('planning.requirements',{workOrder:repair,qualifications:'High voltage'})
    assert.equal((await h.api('planning.resource.retire',owner,{...retirement,revision:stale},409)).error,'stale')
    assert.equal((await view()).qualifications.find(q=>q.member_id===people.maya).retired_at,null)
    await h.submit('planning.resource.retire',owner,{...retirement,revision:(await view()).revision},'/app/settings/resources')
    await change('planning.resource.retire',{kind:'tool',id:tool,reason:'Calibration instrument withdrawn'})
    const blocked=await change('planning.slot',slot(repair,day,'13:00','14:00',{tool:[tool],preview:true}))
    assert.deepEqual(blocked.conflicts.sort(),['qualification_required: High voltage','tool_retired: Insulation tester'].sort())
    const beforeSlot=(await view()).work.find(w=>w.id===repair)
    await change('planning.slot',slot(repair,day,'13:00','14:00',{tool:[tool]}),409)
    assert.deepEqual((await view()).work.find(w=>w.id===repair),beforeSlot)
    const history=(await view()).history
    const changes=history.filter(e=>e.kind==='qualification'&&JSON.parse(e.after_json).member_id===people.maya)
    assert.deepEqual(changes.map(e=>[e.action,JSON.parse(e.after_json).expires_on]),[['save','2026-10-19'],['save','2026-12-31'],['retire','2026-12-31']])
    assert.equal(JSON.parse(changes[1].before_json).expires_on,'2026-10-19')
    assert.equal(JSON.parse(changes[2].before_json).retired_at,null)
    assert.equal(JSON.parse(changes[2].after_json).retirement_reason,retirement.reason)
    assert.ok(changes.every(e=>e.actor_name==='Olive Owner'&&e.actor_id&&e.recorded_at))
    if(process.env.PLANNING_SCREENSHOTS) await retirementProof(f,repair,tool)
    const snapshot=data=>({qualifications:data.qualifications,tools:data.tools,history:data.history})
    const beforeNotices=await renewalNotices()
    const before=snapshot(await view())
    await h.stop()
    const archive=join(h.installation.root,'exports','resources.rer')
    await h.installation.rer('export','--output',archive)
    const empty=await installation()
    try {
      await empty.rer('import','--input',archive,'--yes')
      const restored=await harness({vars:h.vars,installation:empty,clockInstant:Date.parse('2026-10-20T16:00:00Z')})
      try {
        const signed=await restored.signIn(h.vars.OWNER_EMAIL)
        await restored.raw('/setup',{cookie:signed,form:new URLSearchParams({confirm:'yes'})})
        const after=await restored.api(`planning?from=${day}`,signed)
        assert.deepEqual((await restored.api('notices',signed)).filter(n=>n.text.includes('Renewal reference')),beforeNotices,'restore retains owner reminder receipts')
        assert.deepEqual(snapshot(after),before,'restore retains retired facts and attributable corrections without revival')
        const refusal=await restored.api('planning.slot',signed,{...slot(repair,day,'13:00','14:00',{tool:[tool],preview:true}),revision:after.revision})
        assert.deepEqual(refusal.conflicts.sort(),blocked.conflicts.sort())
        assert.equal((await restored.api('automation'+'/jobs',signed)).rules.every(r=>r.paused===1),true,'restored automation remains inactive')
      } finally {await restored.close()}
    } finally {await empty.remove()}

  } finally {await h.close()}
}

export async function calendarPlanningJourney() {
  const f=await fixture(),{h,owner,people,cookies,view,change,work,window,slot,asset}=f
  try {
    await window(people.maya,day);await window(people.luis,day)
    await window(people.maya,tomorrow);await window(people.luis,tomorrow)
    const repairs=[]
    for(let i=0;i<5;i++) repairs.push(await work(`Repair ${i+1}`,i<3?people.maya:people.luis,{due:'2026-10-19'}))
    for(const [i,id] of repairs.entries())await change('planning.slot',slot(id,day,`${8+(i%3)*2}:00`.padStart(5,'0'),`${10+(i%3)*2}:00`,{}))
    const unassigned=await work('Awaiting assignment','')
    const initial=await h.api(`planning?from=${day}&view=day`,owner)
    assert.equal(initial.site.capacityMinutes,960,'two eight-hour shifts give the 16-hour team window')
    assert.equal(initial.teams.find(t=>t.name==='Electrical').capacityMinutes,960)
    assert.equal(initial.site.assignedMinutes,600,'five two-hour repairs')
    assert.ok(initial.work.find(w=>w.id===unassigned).assignee_id===null)
    assert.ok(initial.work.find(w=>w.id===repairs[0]).overdue)
    await window(people.maya,day,'08:00','16:00','absent')
    const absent=await h.api(`planning?from=${day}&view=day`,owner)
    assert.equal(absent.site.capacityMinutes,480);assert.equal(absent.site.unavailableMinutes,480)
    assert.equal(absent.work.filter(w=>w.conflicts.includes('person_absent')).length,3)
    const clash=await change('planning.slot',slot(repairs[1],tomorrow,'08:00','10:00'))
    assert.ok(clash.id)
    const conflict=await change('planning.slot',slot(repairs[0],tomorrow,'08:00','10:00',{preview:true}))
    assert.ok(conflict.conflicts.includes('person_double_booked'))
    const checklist=(await h.api('checklist.create',owner,{name:'Drive PM',items:['Inspect guard']})).id
    const schedule=(await h.api('schedule.create',owner,{asset,checklist,title:'Drive PM',everyDays:30,firstDue:day,assignee:people.luis})).id
    const pm=(await h.api('workorders.generate',owner,{})).created.find(w=>w.schedule===schedule)
    assert.ok(pm,'PM issued through scheduler door')
    const dueBefore=await h.api(`work/${pm.id}`,owner),scheduleBefore=(await h.api('schedules',owner)).find(s=>s.id===schedule)
    await change('planning.slot',slot(pm.id,tomorrow,'12:00','13:00'))
    const dueAfter=await h.api(`work/${pm.id}`,owner),scheduleAfter=(await h.api('schedules',owner)).find(s=>s.id===schedule)
    assert.equal(dueAfter.due_date,dueBefore.due_date)
    assert.equal(scheduleAfter.next_due_date,scheduleBefore.next_due_date)
    assert.equal(scheduleAfter.cadence,scheduleBefore.cadence)
    // Productive time is retained separately from reservations and availability.
    const current=await h.api(`work/${repairs[0]}`,cookies.maya)
    await h.api('workorder.time',cookies.maya,{workOrder:repairs[0],version:current.version,workedOn:day,minutes:45,note:'Drive repair'})
    assert.equal((await view()).utilization.find(p=>p.id===people.maya).legacyRecordedMinutes,45)
    assert.equal((await view()).utilization.find(p=>p.id===people.maya).productiveMinutes,0,'legacy unclassified time is not guessed productive')
    await h.api('labor.rate',owner,{person:people.maya,amount:'30',overtimeAfterMinutes:480,overtimeMultiplier:150})
    const labor=(await h.api('labor.entry',cookies.maya,{workOrder:repairs[0],category:'wrench',started:`${day}T08:00`,ended:`${day}T08:45`,reason:'Drive repair'})).id
    assert.equal((await view()).utilization.find(p=>p.id===people.maya).productiveMinutes,0,'pending time is excluded')
    await h.api('labor.review',owner,{entry:labor,decision:'approve',reason:'Checked source time'})
    assert.equal((await view()).utilization.find(p=>p.id===people.maya).productiveMinutes,45)
    const travel=(await h.api('labor.entry',cookies.maya,{workOrder:repairs[0],category:'travel',started:`${day}T09:00`,ended:`${day}T09:30`,reason:'Travel to drive'})).id
    await h.api('labor.review',owner,{entry:travel,decision:'approve',reason:'Checked travel'})
    assert.equal((await view()).utilization.find(p=>p.id===people.maya).productiveMinutes,45,'approved travel is not productive wrench time')
    await window(people.luis,'2026-10-19')
    const old=await work('Overdue booked repair',people.luis,{due:'2026-10-18'})
    await change('planning.slot',slot(old,'2026-10-19','08:00','09:00'))
    if(process.env.PLANNING_SCREENSHOTS) await browserProof(f,'calendar',repairs[0])
  } finally {await h.close()}
}

async function retirementProof(f,repair,tool) {
  const {h,owner,cookies}=f
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLANNING_CHROMIUM||undefined,args:['--no-sandbox']})
  try {
    for(const [role,cookie] of [['owner',owner],['lead',cookies.lead]]) {
      const context=await browser.newContext({ignoreHTTPSErrors:true})
      await context.addCookies(cookie.split('; ').map(pair=>{const at=pair.indexOf('=');return{name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
      const page=await context.newPage()
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:1000})
        await page.goto(`${h.origin}/app/settings/resources?from=${day}`)
        await page.getByRole('table',{name:'Qualifications',exact:true}).getByText('Retired',{exact:true}).first().waitFor()
        if(role==='owner') {
          await page.locator('summary').filter({hasText:'Resource history'}).click()
          await page.getByRole('table',{name:'Resource history',exact:true}).getByText('Owner retired superseded training',{exact:false}).waitFor()
          assert.ok(await page.getByText('Owner-entered reference — not verified by Gasket with the issuing body.',{exact:false}).count())
        } else {
          assert.equal(await page.getByRole('button',{name:'Retire record',exact:true}).count(),0)
          assert.equal(await page.getByText('synthetic-gasket-2',{exact:false}).count(),0)
          assert.equal(await page.getByText('Unrelated private reference',{exact:false}).count(),0)
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
        await page.screenshot({path:`${process.env.PLANNING_SCREENSHOTS}/retired-${role}-${width}.png`,fullPage:true})
        await page.goto(`${h.origin}/app/planning?from=${day}&workOrder=${repair}&starts=${day}T13:00&ends=${day}T14:00&tool=${tool}`)
        await page.getByRole('heading',{name:'Resolve constraints'}).waitFor()
        await page.locator('#slot-preview').getByText('qualification required: High voltage',{exact:true}).waitFor()
        await page.locator('#slot-preview').getByText('tool retired: Insulation tester',{exact:true}).waitFor()
        assert.equal(await page.getByRole('button',{name:'Confirm slot',exact:true}).count(),0)
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
        await page.screenshot({path:`${process.env.PLANNING_SCREENSHOTS}/retirement-refusal-${role}-${width}.png`,fullPage:true})
        if(role==='owner') {
          await page.goto(`${h.origin}/app/notices`)
          await page.getByRole('link',{name:/Renewal reference.*expired after 2026-10-19/}).waitFor()
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
          await page.screenshot({path:`${process.env.PLANNING_SCREENSHOTS}/renewal-notices-${width}.png`,fullPage:true})
        }
      }
      await context.close()
    }
  } finally {await browser.close()}
}

async function browserProof(f,name,move) {
  const {h,owner,view}=f
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLANNING_CHROMIUM||undefined,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
  try {
    await mkdir(process.env.PLANNING_SCREENSHOTS,{recursive:true})
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(owner.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      const path=name==='resources'?`/app/settings/resources?from=${day}`:`/app/planning?from=${day}`
      assert.equal((await page.goto(h.origin+path)).status(),200)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} fits ${width}`)
      if(name==='calendar') {
        await page.getByRole('table',{name:'Unscheduled work',exact:true}).getByRole('link',{name:/Overdue booked repair/}).waitFor()
        await page.getByLabel('Calendar view',{exact:true}).selectOption('day')
        await page.getByRole('button',{name:'Show calendar',exact:true}).click()
        assert.equal(await page.locator('[data-day]').count(),1)
        await page.screenshot({path:`${process.env.PLANNING_SCREENSHOTS}/calendar-day-${width}.png`,fullPage:true})
        await page.getByLabel('Calendar view',{exact:true}).selectOption('week')
        await page.getByRole('button',{name:'Show calendar',exact:true}).click()
        assert.equal(await page.locator('[data-day]').count(),7)
      }
      // Every button has text; shared shell links also have text labels.
      for(const button of await page.locator('button:visible').all())assert.ok((await button.textContent()).trim(),JSON.stringify(await button.evaluate(b=>({label:b.getAttribute('aria-label'),title:b.getAttribute('title'),html:b.outerHTML}))))
      await page.screenshot({path:`${process.env.PLANNING_SCREENSHOTS}/${name}-${width}.png`,fullPage:true})
      if(name==='resources') {
        const data=await view(),repair=data.work.find(w=>w.title==='High voltage repair'),tool=data.tools.find(t=>t.name==='Insulation tester')
        await page.goto(`${h.origin}/app/planning?from=${day}&workOrder=${repair.id}&starts=${day}T13:00&ends=${day}T14:00&tool=${tool.id}`)
        await page.getByRole('heading',{name:'Slot is schedulable'}).waitFor()
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
        await page.screenshot({path:`${process.env.PLANNING_SCREENSHOTS}/qualified-slot-${width}.png`,fullPage:true})
      }
      if(move) {
        const target=width===1440?'2026-10-22':'2026-10-23'
        await f.window(f.people.maya,target)
        await page.reload()
        if(width===1440) {
          await page.setViewportSize({width,height:2400})
          await page.locator(`[data-work="${move}"]`).dragTo(page.locator(`[data-day="${target}"]`),{sourcePosition:{x:30,y:15}})
        } else {
          await page.getByLabel('Work order',{exact:true}).selectOption(move)
          await page.getByLabel('Starts',{exact:true}).fill(`${target}T08:00`)
          await page.getByLabel('Ends',{exact:true}).fill(`${target}T10:00`)
          await page.getByRole('button',{name:'Preview slot',exact:true}).click()
        }
        await page.getByRole('heading',{name:'Slot is schedulable'}).waitFor({timeout:10000}).catch(async error=>{await page.screenshot({path:`${process.env.PLANNING_SCREENSHOTS}/preview-failure-${width}.png`,fullPage:true});throw new Error(`${error.message}; url=${page.url()}; browser=${errors.join('; ')}; preview=${await page.locator('#slot-preview').count()?await page.locator('#slot-preview').textContent():'(missing)'}`)})
        const before=(await view()).work.find(w=>w.id===move)
        assert.notEqual(before.starts.slice(0,10),target,'preview does not write')
        await page.getByRole('button',{name:'Confirm slot',exact:true}).click()
        assert.equal((await view()).work.find(w=>w.id===move).starts,`${target}T08:00`)
        assert.equal((await view()).work.find(w=>w.id===move).due_date,'2026-10-19')
        await page.screenshot({path:`${process.env.PLANNING_SCREENSHOTS}/moved-${width}.png`,fullPage:true})
      }
    }
    await context.close()
  } finally {await browser.close()}
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href){await qualificationPlanningJourney();await calendarPlanningJourney();console.log('Planning journeys passed')}
