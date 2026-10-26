import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { chromium } from '@playwright/test'
import { harness } from './harness.mjs'
import { installation } from './installation.mjs'

function readCsv(text){
  const rows=[];let row=[],value='',quoted=false
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(value);value=''}else if(c==='\n'&&!quoted){row.push(value.replace(/\r$/,''));rows.push(row);row=[];value=''}else value+=c}
  return rows
}
function dataset(text){
  const root={}
  for(const [path,type,raw]of readCsv(text).slice(1)){
    const keys=[...path.matchAll(/\[("(?:\\.|[^"\\])*")\]/g)].map(m=>JSON.parse(m[1]))
    const value=raw.startsWith("'")&&/^[=+\-@\t]/.test(raw.slice(1))?raw.slice(1):raw
    let current=root
    for(let n=0;n<keys.length;n++){
      const key=keys[n]
      if(n===keys.length-1)current[key]=type==='null'?null:type==='number'?Number(value):type==='boolean'?value==='true':type==='array'?[]:type==='object'?{}:value
      else current=current[key]??=(/^\d+$/.test(keys[n+1])?[]:{})
    }
  }
  return root
}

// A single weekly delivery journey through real scheduled events and the provider edge.
export async function reportSchedulesJourney(){
  const store=await installation();await store.migrate()
  const vars={OWNER_EMAIL:'owner@example.test',SESSION_SECRET:'synthetic-gasket-session-secret-123456789',SETUP_TOKEN:'synthetic-gasket-setup-token-123456789'}
  const before=Date.parse('2027-03-07T13:59:00Z'),first=Date.parse('2027-03-07T14:00:00Z'),after=Date.parse('2027-03-14T13:00:00Z')
  let h=await harness({installation:store,vars,clockInstant:before})
  try{
    const cookie={owner:await h.owner()},ids={}
    await h.api('site.configure',cookie.owner,{name:'Great Lakes report plant',timezone:'America/New_York'})
    for(const [key,role] of [['lead','lead'],['supervisor','supervisor'],['tech','maintainer'],['agent','agent'],['delegate','lead'],['other','supervisor']]){
      ids[key]=(await h.api('access.give',cookie.owner,{name:key,email:`${key}@example.test`,role})).id
      cookie[key]=await h.signIn(`${key}@example.test`)
    }
    const asset=(await h.api('asset.create',cookie.lead,{tag:'PACK-1',name:'Conveyor motor',location:'Line 1'})).id
    const team=(await h.api('team.create',cookie.lead,{name:'Utilities',trade:'Mechanical',member:[ids.tech]})).id
    const work=(await h.api('workorder.create',cookie.lead,{asset,title:'Repair conveyor motor',due:'2027-03-01',estimateHours:'2',team,assignee:ids.tech})).id
    await h.api('downtime.start',cookie.tech,{workOrder:work,startedOn:'2027-03-06T12:00',reason:'Synthetic conveyor stop'})
    await h.api('downtime.end',cookie.tech,{workOrder:work,endedOn:'2027-03-06T13:00'})
    await h.api('work.cost',cookie.owner,{workOrder:work,category:'labor',amount:'123.45',note:'synthetic-gasket-private-rate-1'})
    const body={team,name:'Weekly supervisor pack',report:'performance',revision:0,weekday:0,clock:'09:00',firstDay:'2027-03-07',recipients:[ids.supervisor,ids.lead],consent:true}
    for(const role of ['lead','supervisor','tech','agent'])await h.api('report.schedule',cookie[role],body,403)
    await h.api('report.schedule',cookie.owner,{...body,consent:false},400)
    await h.api('report.schedule',cookie.owner,{...body,recipients:[ids.agent]},403)
    await h.api('report.schedule',cookie.owner,{...body,clock:'24:00'},400)
    const schedule=(await h.api('report.schedule',cookie.owner,body)).id
    for(const role of ['lead','supervisor','tech','agent']){
      await h.api('report-schedules',cookie[role],undefined,403)
      for(const ext of ['pdf','csv'])assert.equal((await h.raw(`/app/report-packs/${schedule}.${ext}`,{cookie:cookie[role]})).status,403)
      assert.equal((await h.raw('/app/settings/reports',{cookie:cookie[role]})).status,403)
    }
    const packs=()=>h.mails.filter(m=>m.subject==='Gasket report: Weekly supervisor pack')
    await h.scheduled('*/15 * * * *',before);assert.equal(packs().length,0)
    await h.api('access.role',cookie.owner,{member:ids.lead,role:'maintainer'})
    await h.scheduled('*/15 * * * *',first)
    assert.equal(packs().length,1)
    assert.deepEqual(packs()[0].to,['supervisor@example.test'])
    const mail=packs()[0];assert.equal(mail.attachments.length,2)
    const csv=Buffer.from(mail.attachments.find(a=>a.filename==='dataset.csv').content,'base64').toString()
    assert.ok(csv.includes(work));assert.ok(csv.includes('Repair conveyor motor'));assert.ok(csv.includes('performance.pm-compliance'));assert.ok(csv.includes('2027-02-28'))
    assert.ok(csv.includes('freshness'));assert.ok(csv.includes('sourceRevision'));assert.ok(csv.includes('supervisor'))
    const pdfBytes=Buffer.from(mail.attachments.find(a=>a.filename==='report.pdf').content,'base64')
    const task=getDocument({data:new Uint8Array(pdfBytes),isEvalSupported:false,disableFontFace:true}),pdf=await task.promise
    let text='';for(let page=1;page<=pdf.numPages;page++)text+=(await(await pdf.getPage(page)).getTextContent()).items.map(i=>i.str??'').join(' ')
    await task.destroy();assert.ok(text.includes('Repair conveyor motor'));assert.ok(text.includes('2027-03-06'));assert.ok(text.includes('PM on-time compliance'))
    const dashboard=await h.api(`performance?from=2027-02-28&to=2027-03-06&team=${team}`,cookie.supervisor)
    assert.deepEqual(dataset(csv).data,dashboard,'every exported dataset value reconciles to the dashboard');assert.equal(csv.includes('synthetic-gasket-private-rate-1'),false);assert.equal(dashboard.backlog.count,1);assert.equal(dashboard.backlog.hours,2)
    assert.match(csv,/backlog/);assert.match(csv,/count/)
    let deliveries=(await h.api('report-schedules',cookie.owner)).deliveries
    assert.deepEqual(deliveries.map(d=>d.state).sort(),['accepted','excluded'])
    assert.equal(deliveries.find(d=>d.state==='excluded').error,'access_ended')
    assert.equal((await h.api('report-schedules',cookie.owner)).schedules[0].next_day,'2027-03-14')
    await h.scheduled('*/15 * * * *',first+60_000);assert.equal(packs().length,1)
    const varsSaved=h.vars;await h.stop()
    h=await harness({installation:store,vars:varsSaved,clockInstant:before})
    await h.scheduled('*/15 * * * *',Date.parse('2027-03-14T12:59:00Z'));assert.equal(packs().length,0)
    await h.scheduled('*/15 * * * *',after);assert.equal(packs().length,1,'09:00 site time moves one hour in UTC after daylight saving')
    await h.scheduled('*/15 * * * *',after+60_000);assert.equal(packs().length,1,'restart cannot replay a claimed occurrence')
    await h.api('access.end',cookie.owner,{member:ids.supervisor})
    await h.scheduled('*/15 * * * *',Date.parse('2027-03-21T13:00:00Z'));assert.equal(packs().length,1,'ended recipient is excluded')
    deliveries=(await h.api('report-schedules',cookie.owner)).deliveries
    assert.equal(deliveries.filter(d=>d.state==='excluded').length,4)
    // Provider failures are visible and never automatically retried.
    const ownerId=(await h.api('me',cookie.owner)).id
    const failure={...body,schedule:'',name:'Failure pack',firstDay:'2027-03-07',recipients:[ownerId]}
    const failed=(await h.api('report.schedule',cookie.owner,failure)).id
    h.setMailOutcome('rejected');await h.scheduled('*/15 * * * *',first)
    h.setMailOutcome('accepted');const failures=()=>h.mails.filter(m=>m.subject==='Gasket report: Failure pack')
    assert.equal(failures().length,1);await h.scheduled('*/15 * * * *',first+60_000);assert.equal(failures().length,1)
    assert.equal((await h.api('report-schedules',cookie.owner)).deliveries.find(d=>d.schedule_id===failed).state,'rejected')
    const uncertain=(await h.api('report.schedule',cookie.owner,{...failure,name:'Uncertain pack'})).id
    h.setMailOutcome('uncertain');await h.scheduled('*/15 * * * *',first)
    h.setMailOutcome('accepted');await h.scheduled('*/15 * * * *',first+60_000)
    assert.equal(h.mails.filter(m=>m.subject==='Gasket report: Uncertain pack').length,1)
    assert.equal((await h.api('report-schedules',cookie.owner)).deliveries.find(d=>d.schedule_id===uncertain).state,'uncertain')
    const changed=await h.api('report.schedule',cookie.owner,{...failure,schedule:failed,revision:1,paused:true})
    assert.equal(changed.revision,2);await h.api('report.schedule',cookie.owner,{...failure,schedule:failed,revision:1},409)
    const preview=await h.raw(`/app/report-packs/${schedule}.csv`,{cookie:cookie.owner});assert.equal(preview.status,200);assert.match(preview.headers.get('cache-control'),/no-store/)
    // A spring gap runs at the first valid minute; a repeated autumn hour runs once at its later occurrence.
    const gap=(await h.api('report.schedule',cookie.owner,{...failure,name:'Spring gap',clock:'02:30',firstDay:'2027-03-14'})).id
    await h.scheduled('*/15 * * * *',Date.parse('2027-03-14T06:59:00Z'))
    assert.equal(h.mails.filter(m=>m.subject==='Gasket report: Spring gap').length,0)
    await h.scheduled('*/15 * * * *',Date.parse('2027-03-14T07:00:00Z'))
    assert.equal(h.mails.filter(m=>m.subject==='Gasket report: Spring gap').length,1)
    const fall=(await h.api('report.schedule',cookie.owner,{...failure,name:'Autumn repeat',clock:'01:30',firstDay:'2027-11-07'})).id
    await h.scheduled('*/15 * * * *',Date.parse('2027-11-07T05:30:00Z'))
    assert.equal(h.mails.filter(m=>m.subject==='Gasket report: Autumn repeat').length,0)
    await h.scheduled('*/15 * * * *',Date.parse('2027-11-07T06:30:00Z'))
    await h.scheduled('*/15 * * * *',Date.parse('2027-11-07T06:45:00Z'))
    assert.equal(h.mails.filter(m=>m.subject==='Gasket report: Autumn repeat').length,1)
    // Editing does not duplicate past deliveries, and a paused schedule sends nothing.
    assert.equal((await h.api('report-schedules',cookie.owner)).deliveries.filter(d=>d.schedule_id===fall).length,1)
    const count=failures().length;await h.scheduled('*/15 * * * *',Date.parse('2027-11-14T14:00:00Z'));assert.equal(failures().length,count)
    for(const kind of ['reliability','availability','bad-actors']){
      const saved=await h.api('report.schedule',cookie.owner,{...failure,name:kind,report:kind,team:'',asset,paused:true})
      const downloaded=await h.raw(`/app/report-packs/${saved.id}.csv`,{cookie:cookie.owner})
      assert.equal(downloaded.status,200)
      const pack=dataset(await downloaded.text())
      const expected=await h.api(`${kind}?from=2027-02-28&to=2027-03-06&asset=${asset}`,cookie.owner)
      assert.deepEqual(pack.data,expected,`${kind} retains every source value with saved asset scope`)
      assert.ok(pack.metadata.definitions.length>0)
      assert.equal(JSON.stringify(pack).includes('synthetic-gasket-private-rate-1'),false)
    }
    // History and valuation preserve nonempty, independently checked source values.
    const part=(await h.api('part.create',cookie.owner,{number:'PACK-PART',name:'Synthetic gasket bearing',unit:'each'})).id
    await h.api('part.receive',cookie.owner,{part,quantity:'3',unitPrice:'7.25'})
    const familyIds={}
    for(const kind of ['history','valuation']){
      const body2={...failure,name:`Family ${kind}`,report:kind,team:'',asset:kind==='history'?asset:'',firstDay:'2027-03-14',paused:true}
      familyIds[kind]=(await h.api('report.schedule',cookie.owner,body2)).id
      const response=await h.raw(`/app/report-packs/${familyIds[kind]}.csv`,{cookie:cookie.owner})
      assert.equal(response.status,200)
      const csv2=await response.text(),pack=dataset(csv2)
      const expected=await h.api(`${kind}?from=2027-03-07&to=2027-03-13${kind==='history'?`&asset=${asset}`:''}`,cookie.owner)
      assert.deepEqual(pack.data,expected,`${kind} complete dataset matches its public read door`)
      assert.ok(pack.metadata.definitions.length>0)
      assert.equal(csv2.includes('synthetic-gasket-private-rate-1'),false)
      if(kind==='history')assert.deepEqual(Object.keys(pack.data.asset).sort(),['id','name','tag'])
      if(kind==='history'){
        assert.equal(pack.data.asset.tag,'PACK-1')
        assert.ok(pack.data.events.some(e=>e.what==='Work order created'))
        assert.ok(pack.data.events.some(e=>e.what.includes('Synthetic conveyor stop')))
      }else{
        assert.equal(pack.data.parts.find(p=>p.id===part).closing.quantity,'3')
        assert.equal(pack.data.parts.find(p=>p.id===part).closing.valueCents,2175)
        assert.equal(pack.data.totals.closing,2175)
      }
      const pdfResponse=await h.raw(`/app/report-packs/${familyIds[kind]}.pdf`,{cookie:cookie.owner})
      assert.equal(pdfResponse.status,200)
      const task2=getDocument({data:new Uint8Array(await pdfResponse.arrayBuffer()),isEvalSupported:false,disableFontFace:true}),pdf2=await task2.promise
      let text2='';for(let page=1;page<=pdf2.numPages;page++)text2+=(await(await pdf2.getPage(page)).getTextContent()).items.map(i=>i.str??'').join(' ')
      await task2.destroy();assert.ok(text2.includes(kind==='history'?'Work order created':'2175'))
      await h.api('report.schedule',cookie.owner,{...body2,schedule:familyIds[kind],revision:1,paused:false})
    }
    await h.api('report.schedule',cookie.owner,{...failure,report:'history',team:'',asset:''},400)
    await h.api('report.schedule',cookie.owner,{...failure,report:'valuation',team:'',asset},400)
    for(const role of ['tech','agent'])await h.api(`history?from=2027-03-07&to=2027-03-13&asset=${asset}`,cookie[role],undefined,403)
    await h.scheduled('*/15 * * * *',after)
    for(const kind of ['history','valuation']){
      const delivered=h.mails.filter(m=>m.subject===`Gasket report: Family ${kind}`)
      assert.equal(delivered.length,1);assert.deepEqual(delivered[0].to,['owner@example.test'])
      const csv2=Buffer.from(delivered[0].attachments.find(a=>a.filename==='dataset.csv').content,'base64').toString()
      assert.equal(dataset(csv2).metadata.report,kind)
      assert.ok(kind==='history'?csv2.includes('Work order created'):csv2.includes('2175'))
    }
    // Owners delegate preparation for one schedule; editing can never authorize outbound delivery.
    const delegatedBody={...failure,name:'Delegated pack',editor:ids.delegate,paused:true}
    const delegatedId=(await h.api('report.schedule',cookie.owner,delegatedBody)).id
    await h.api('report.schedule',cookie.owner,{...delegatedBody,editor:ids.tech},403)
    const own=await h.api('report-schedules',cookie.delegate)
    assert.deepEqual(own.schedules.map(s=>s.id),[delegatedId]);assert.deepEqual(own.deliveries,[])
    await h.api('report.schedule',cookie.other,{...delegatedBody,schedule:delegatedId,revision:1},403)
    assert.equal((await h.raw(`/app/report-packs/${schedule}.csv`,{cookie:cookie.delegate})).status,403)
    const draft={...delegatedBody,schedule:delegatedId,revision:1,name:'Delegated revised',paused:false,editor:ids.other}
    assert.equal((await h.api('report.schedule',cookie.delegate,draft)).revision,2)
    const row=(await h.api('report-schedules',cookie.owner)).schedules.find(s=>s.id===delegatedId)
    assert.equal(row.paused,1);assert.equal(row.editor_id,ids.delegate)
    assert.equal((await h.raw(`/app/report-packs/${delegatedId}.csv`,{cookie:cookie.delegate})).status,200)
    await h.api('report.schedule',cookie.delegate,draft,409)
    await h.scheduled('*/15 * * * *',first)
    assert.equal(h.mails.filter(m=>m.subject==='Gasket report: Delegated revised').length,0)
    await h.api('report.schedule',cookie.owner,{...draft,revision:2,editor:ids.delegate})
    await h.scheduled('*/15 * * * *',first)
    assert.equal(h.mails.filter(m=>m.subject==='Gasket report: Delegated revised').length,1)
    await h.api('access.role',cookie.owner,{member:ids.delegate,role:'maintainer'})
    await h.api('report-schedules',cookie.delegate,undefined,403)
    assert.equal((await h.raw(`/app/report-packs/${delegatedId}.csv`,{cookie:cookie.delegate})).status,403)
    await h.api('report.schedule',cookie.delegate,{...draft,revision:3},403)
    await h.api('access.role',cookie.owner,{member:ids.delegate,role:'lead'})
    await h.api('report.schedule',cookie.owner,{...draft,revision:3,editor:ids.other,paused:true})
    await h.api('report-schedules',cookie.delegate,undefined,403)
    assert.equal((await h.raw(`/app/report-packs/${delegatedId}.csv`,{cookie:cookie.delegate})).status,403)
    if(process.env.REPORT_SCREENSHOTS){
      await mkdir(process.env.REPORT_SCREENSHOTS,{recursive:true})
      const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
      try{
        const context=await browser.newContext({ignoreHTTPSErrors:true})
        await context.addCookies(cookie.owner.split('; ').map(pair=>{const i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),url:h.origin}}))
        const page=await context.newPage()
        for(const width of [1440,390])for(const [name,path]of [['report-schedules','/app/settings/reports'],['report-edit',`/app/settings/reports?edit=${schedule}`],['report-history',`/app/settings/reports?edit=${familyIds.history}`],['report-valuation',`/app/settings/reports?edit=${familyIds.valuation}`]]){
          await page.setViewportSize({width,height:1100});await page.goto(h.origin+path)
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} fits ${width}`)
          assert.equal(await page.getByRole('heading',{name:'Scheduled reports',exact:true}).count(),1)
          if(name==='report-history'||name==='report-valuation')assert.equal(await page.getByLabel('Report',{exact:true}).inputValue(),name.slice(7))
          await page.screenshot({path:`${process.env.REPORT_SCREENSHOTS}/${name}-${width}.png`,fullPage:true})
        }
        await context.clearCookies()
        await context.addCookies(cookie.other.split('; ').map(pair=>{const i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),url:h.origin}}))
        for(const width of [1440,390]){
          await page.setViewportSize({width,height:1100});await page.goto(`${h.origin}/app/settings/reports?edit=${delegatedId}`)
          assert.equal(await page.getByRole('button',{name:'Save for owner review'}).count(),1)
          assert.equal(await page.getByLabel('Delegated author').count(),0)
          if(width===1440){
            await page.getByLabel('Pack name',{exact:true}).fill('Browser authored draft')
            await page.getByRole('checkbox',{name:'I submit this draft for owner review.',exact:false}).check()
            await page.getByRole('button',{name:'Save for owner review'}).click()
            await page.waitForURL(url=>!url.searchParams.has('edit'))
            const savedRow=(await h.api('report-schedules',cookie.owner)).schedules.find(s=>s.id===delegatedId)
            assert.equal(savedRow.name,'Browser authored draft');assert.equal(savedRow.paused,1)
            await page.goto(`${h.origin}/app/settings/reports?edit=${delegatedId}`)
          }
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
          await page.screenshot({path:`${process.env.REPORT_SCREENSHOTS}/report-delegate-${width}.png`,fullPage:true})
        }
        await context.close()
      }finally{await browser.close()}
    }
    console.log('REPORT-006 weekly packs: DST, provider PDF and complete CSV, dispatch authorization, failure and restart passed')
  }finally{await h.close();await store.remove()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await reportSchedulesJourney()
