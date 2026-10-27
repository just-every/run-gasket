import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { harness, exerciseKeyedActions, assertDocumented } from './harness.mjs'

const day='2026-10-20', tomorrow='2026-10-21'
async function fixture() {
  const h=await harness({clockInstant:Date.parse('2026-10-20T16:00:00Z')}),owner=await h.owner()
  exerciseKeyedActions(h, owner, ['planning.qualification','planning.tool','planning.retire','planning.window','planning.window.remove','planning.requirements','planning.slot','automation.control'])
  await h.api('site.configure',owner,{name:'Lake Erie Works',timezone:'America/New_York'})
  const people={},cookies={owner}
  for(const [key,role] of [['lead','lead'],['maya','maintainer'],['luis','maintainer'],['supervisor','supervisor'],['agent','agent']]) {
    people[key]=(await h.api('access.give',owner,{name:key==='maya'?'Maya Chen':key==='luis'?'Luis Ortega':'Planning lead',email:`planning-${key}@example.test`,role})).id
    cookies[key]=await h.signIn(`planning-${key}@example.test`)
  }
  const team=(await h.api('team.create',owner,{name:'Electrical',trade:'Electrical',member:[people.maya,people.luis]})).id
  const asset=(await h.api('asset.create',owner,{tag:'HV-1',name:'High voltage drive',location:'Plant room'})).id
  const view=async()=>{const result=await h.api(`/v1/planning?from=${day}`,owner);assertDocumented('PlanningView',result);return result}
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
    await change('planning.requirements',{workOrder:repair,qualifications:'High voltage'})
    assert.ok((await change('planning.slot',slot(repair,day,'10:00','12:00',{tool:[tool],preview:true}))).conflicts.includes('parts_reservation_required'))
    await h.api('part.receive',owner,{part,quantity:'4'})
    for(const workOrder of [repair,other])await h.api('workorder.reserve',owner,{workOrder,part,quantity:'1'})
    await change('planning.slot',slot(other,day,'08:00','10:00',{tool:[tool]}))
    const proposal=slot(repair,day,'08:00','10:00',{tool:[tool],preview:true})
    let preview=await change('planning.slot',proposal)
    assert.deepEqual(preview.conflicts.sort(),['qualification_required: High voltage','tool_double_booked: Insulation tester'].sort())
    const refused=await change('planning.slot',{...proposal,preview:false},409)
    assert.equal(refused.error,'planning_conflicts')
    assert.equal((await view()).work.find(w=>w.id===repair).starts,null,'a refused booking writes no slot')
    await h.api('planning.qualification',owner,{...qualification,expires:'2026-12-31'})
    preview=await change('planning.slot',{...proposal,starts:`${day}T10:00`,ends:`${day}T12:00`})
    assert.deepEqual(preview.conflicts,[],'adjacent tool bookings do not overlap')
    const resolved=slot(repair,day,'10:00','12:00',{tool:[tool]})
    await change('planning.slot',resolved)
    assert.equal((await view()).work.find(w=>w.id===repair).plannedMinutes,120)
    // Later absence and calibration changes expose conflicts on existing slots.
    await window(people.maya,day,'11:00','12:00','absent')
    assert.ok((await view()).work.find(w=>w.id===repair).conflicts.includes('person_absent'))
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
    // Custody is enforced by both write doors; planning reads expose only needed facts.
    const leadView=await h.api(`planning?from=${day}`,cookies.lead)
    assert.equal(leadView.qualifications.find(q=>q.member_id===people.maya).reference,undefined)
    assert.equal(leadView.qualifications.find(q=>q.member_id===people.maya).provenance,'Owner-entered reference — not verified by Gasket with the issuing body.')
    assert.deepEqual(leadView.retired,[])
    const leadPage=await (await h.raw(`/app/settings/resources?from=${day}`,{cookie:cookies.lead})).text()
    assert.ok(!leadPage.includes(qualification.reference),'planning access does not disclose owner-held reference text')
    assert.ok(!JSON.stringify(leadView.people).includes('@example.test'),'planning people omit private contacts')
    const retirement={kind:'qualification',member:people.maya,name:'High voltage',reason:'Evidence withdrawn'}
    for(const who of [cookies.lead,cookies.maya,cookies.supervisor,cookies.agent]) {
      await h.api('planning.qualification',who,{...qualification,expires:'2027-01-01'},403)
      await change('planning.tool',{name:'Forbidden tool',identifier:'synthetic-gasket-9',calibrationDue:'2027-01-01'},403,who)
      await change('planning.tool',{id:tool,name:'Insulation tester',identifier:'synthetic-gasket-9',calibrationDue:'2027-01-01'},403,who)
      await change('planning.retire',retirement,403,who)
      const denied=await h.submit('planning.retire',who,{...retirement,revision:(await view()).revision},'/app/settings/resources')
      assert.equal(denied.searchParams.get('error'),'forbidden')
    }
    const beforeRetirement=await view(), oldQualification=beforeRetirement.qualifications.find(q=>q.member_id===people.maya)
    await change('planning.retire',{...retirement,reason:''},400)
    await h.api('planning.retire',owner,{...retirement,revision:beforeRetirement.revision-1},409)
    assert.deepEqual((await view()).qualifications,beforeRetirement.qualifications,'failed retirement preserves evidence')
    const retiredForm=await h.submit('planning.retire',owner,{...retirement,revision:beforeRetirement.revision},'/app/settings/resources')
    assert.equal(retiredForm.searchParams.has('error'),false)
    const retiredQualification=(await view()).retired.find(r=>r.kind==='qualification')
    assert.equal(retiredQualification.snapshot.reference,qualification.reference)
    assert.equal(retiredQualification.snapshot.record_id,oldQualification.record_id)
    assert.equal(retiredQualification.retired_by,(await h.api('me',owner)).id)
    assert.equal(retiredQualification.reason,'Evidence withdrawn')
    assert.equal(retiredQualification.retired_at,Date.parse('2026-10-20T16:00:00Z'))
    assert.deepEqual((await change('planning.slot',slot(repair,day,'13:00','14:00',{tool:[tool],preview:true}))).conflicts,['qualification_required: High voltage'])
    await change('planning.slot',slot(repair,day,'13:00','14:00',{tool:[tool],override:true}),409)
    await h.api('planning.qualification',owner,{...qualification,expires:'2026-12-31'})
    assert.notEqual((await view()).qualifications.find(q=>q.member_id===people.maya).record_id,oldQualification.record_id,'replacement is new evidence')
    await change('planning.slot',slot(repair,day,'13:00','14:00',{tool:[tool]}))
    const oldBookings=(await view()).work.filter(w=>w.toolIds.includes(tool)).map(w=>w.id).sort()
    assert.deepEqual(oldBookings,[repair,other,[third,fourth][results.findIndex(r=>r.status===200)]].sort(),'the retained booking fixture is the exact occupied set')
    await change('planning.retire',{kind:'tool',id:tool,reason:'Tool withdrawn from service'})
    const retiredTool=(await view()).retired.find(r=>r.kind==='tool')
    assert.deepEqual(retiredTool.snapshot.bookings.map(b=>b.work_order_id).sort(),oldBookings)
    assert.equal(retiredTool.snapshot.identifier,'synthetic-gasket-1')
    assert.equal((await view()).tools.some(t=>t.id===tool),false)
    assert.ok((await view()).work.find(w=>w.id===repair).conflicts.includes('tool_required: Insulation tester'))
    assert.equal((await change('planning.slot',slot(repair,day,'13:00','14:00',{tool:[tool],override:true}),409)).error,'planning_conflicts')
    await change('planning.tool',{id:tool,name:'Insulation tester',identifier:'synthetic-gasket-1',calibrationDue:'2026-12-31'},404)
    const replacement=(await change('planning.tool',{name:'Insulation tester',identifier:'synthetic-gasket-3',calibrationDue:'2026-12-31'})).id
    assert.notEqual(replacement,tool)
    await change('planning.slot',slot(repair,day,'13:00','14:00',{tool:[replacement]}))
    assert.deepEqual((await view()).work.find(w=>w.id===repair).conflicts,[])
    const retirementAudit=(await h.api('audit?action=planning.retire',owner)).rows
    assert.equal(retirementAudit.length,2)
    assert.ok(retirementAudit.every(row=>row.actor===retiredQualification.retired_by&&row.role==='owner'&&row.site==='Lake Erie Works'))
    assert.deepEqual(retirementAudit.map(row=>JSON.parse(row.detail).kind).sort(),['qualification','tool'])
    const correctionAudit=(await h.api('audit?action=planning.qualification',owner)).rows
    assert.equal(correctionAudit.find(row=>JSON.parse(row.detail).previous?.expires_on==='2026-10-19')!==undefined,true,'correction retains prior expiry')
    const afterLead=await h.api(`planning?from=${day}`,cookies.lead)
    assert.deepEqual(afterLead.retired,[],'retired private evidence remains owner-only')
    // The real scheduler uses the pinned site clock, opt-in and current expiry grant.
    const reminderReference={member:people.luis,name:'Switchgear training',expires:'2026-10-21',reference:'synthetic-gasket-renewal'}
    const reminders=async who=>(await h.api('notices',who)).filter(n=>n.kind==='qualification_expiry')
    const tick=date=>h.scheduled('*/15 * * * *',Date.parse(`${date}T16:00:00Z`))
    await h.api('planning.qualification',owner,reminderReference)
    await tick(day)
    assert.deepEqual(await reminders(owner),[],'no reminders without owner opt-in')
    await h.api('planning.qualification',owner,{...reminderReference,remind:true,remindDays:1})
    await tick('2026-10-19')
    assert.deepEqual(await reminders(owner),[],'nothing before the selected lead window')
    await tick(day);await tick(day);await tick('2026-10-21')
    assert.deepEqual((await reminders(owner)).map(n=>n.stage),['due'],'the inclusive expiry day is due, with no duplicate')
    assert.ok((await reminders(owner))[0].text.includes('Switchgear training for Luis Ortega expires on 2026-10-21'))
    const expiryRule=async()=>(await h.api('automation',owner)).rules.find(r=>r.id==='expiry')
    await h.api('automation.control',owner,{rule:'expiry',revision:(await expiryRule()).revision,paused:true,reason:'Pause qualification reminders'})
    await tick('2026-10-22')
    assert.deepEqual((await reminders(owner)).map(n=>n.stage),['due'],'paused expiry automation produces no expired notice')
    await h.api('automation.control',owner,{rule:'expiry',revision:(await expiryRule()).revision,paused:false,reason:'Resume qualification reminders'})
    await tick('2026-10-22');await tick('2026-10-22')
    assert.deepEqual((await reminders(owner)).map(n=>n.stage).sort(),['due','expired'])
    assert.ok((await reminders(owner)).find(n=>n.stage==='expired').text.includes('expired on 2026-10-21. Review renewal evidence.'))
    for(const who of [cookies.lead,cookies.maya,cookies.luis,cookies.supervisor,cookies.agent])assert.deepEqual(await reminders(who),[],'personal renewal notices are owner-only')
    await h.api('planning.qualification',owner,{...reminderReference,expires:'2026-12-01',remind:true,remindDays:1})
    await tick('2026-10-22')
    assert.deepEqual(await reminders(owner),[],'renewal replaces stale active notices without renewing evidence automatically')
    await tick('2026-11-30')
    assert.deepEqual((await reminders(owner)).map(n=>n.stage),['due'],'renewed reference has its own reminder occasion')
    assert.ok((await reminders(owner))[0].text.includes('expires on 2026-12-01'))
    if(process.env.PLANNING_SCREENSHOTS) await browserProof(f,'resources')
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
        if(width===1440) {
          assert.equal(await page.getByRole('table',{name:'Retired resources',exact:true}).getByRole('row').count(),3)
          const qualificationText=await page.getByRole('table',{name:'Qualifications',exact:true}).textContent()
          assert.ok(qualificationText.includes('Dec 31, 2026')&&qualificationText.includes('In date (calculated)'))
          assert.ok(qualificationText.includes('Owner-entered reference — not verified by Gasket with the issuing body.'))
        }
        const leadContext=await browser.newContext({ignoreHTTPSErrors:true})
        await leadContext.addCookies(f.cookies.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
        const leadPage=await leadContext.newPage()
        await leadPage.setViewportSize({width,height:1000})
        await leadPage.goto(`${h.origin}/app/settings/resources?from=${day}`)
        assert.equal(await leadPage.getByRole('button',{name:'Retire record',exact:true}).count(),0)
        assert.equal(await leadPage.getByRole('table',{name:'Retired resources',exact:true}).count(),0)
        assert.ok((await leadPage.getByRole('table',{name:'Qualifications',exact:true}).textContent()).includes('Reference held by the owner'))
        await leadPage.screenshot({path:`${process.env.PLANNING_SCREENSHOTS}/permitted-planning-${width}.png`,fullPage:true})
        await leadContext.close()
        const data=await view(),repair=data.work.find(w=>w.title==='High voltage repair'),tool=data.tools.find(t=>t.name==='Insulation tester')
        await page.goto(`${h.origin}/app/planning?from=${day}&workOrder=${repair.id}&starts=${day}T13:00&ends=${day}T14:00&tool=${tool.id}`)
        await page.getByRole('heading',{name:'Slot is schedulable'}).waitFor()
        const acceptedUrl=page.url()
        await page.goto(acceptedUrl.replace('T13:00','T11:00').replace('T14:00','T12:00'))
        await page.getByRole('heading',{name:'Resolve constraints'}).waitFor()
        assert.ok((await page.locator('#slot-preview').textContent()).includes('person absent'))
        assert.equal(await page.getByRole('button',{name:'Confirm slot',exact:true}).count(),0)
        await page.screenshot({path:`${process.env.PLANNING_SCREENSHOTS}/refused-slot-${width}.png`,fullPage:true})
        await page.goto(acceptedUrl)
        await page.goto(h.origin+'/app/notices')
        if(width===1440)assert.ok((await page.getByRole('table',{name:'Notices',exact:true}).textContent()).includes('Switchgear training for Luis Ortega expires on 2026-12-01'))
        await page.screenshot({path:`${process.env.PLANNING_SCREENSHOTS}/renewal-notices-${width}.png`,fullPage:true})
        await page.goto(acceptedUrl)
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
