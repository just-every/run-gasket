import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import * as XLSX from 'xlsx/xlsx.mjs'
import { file, harness, exerciseKeyedActions } from './harness.mjs'

const csv = rows => rows.map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n')+'\r\n'
function workbook(rows,format='xlsx',name='work') {
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name)
  return XLSX.write(book,{type:'buffer',bookType:format==='xls'?'biff8':'xlsx'})
}
export async function genericMigrationJourney(){
  const h=await harness({clockInstant:Date.parse('2027-03-07T13:59:00Z')})
  try{
    const owner=await h.owner()
    exerciseKeyedActions(h, owner, ['spreadsheet.apply', 'spreadsheet.job'], { once: true })
    await h.api('site.configure',owner,{name:'Lakeside maintenance',timezone:'America/New_York'})
    const techId=(await h.api('access.give',owner,{name:'Sam Mechanic',email:'sam@example.test',role:'maintainer'})).id
    const tech=await h.signIn('sam@example.test')
    await h.api('access.give',owner,{name:'Lee Planner',email:'planner@example.test',role:'lead'})
    const importer=await h.signIn('planner@example.test')
    const team=(await h.api('team.create',owner,{name:'Utilities',trade:'Mechanical',member:[techId]})).id
    const field=(await h.api('workfield.save',owner,{label:'Inspection type',kind:'choice',option:['Mechanical','Electrical'],required:true})).id
    const refrigerant=(await h.api('customfield.save',owner,{name:'Refrigerant type',entityType:'asset',type:'single',scope:'category',category:'HVAC',required:true,options:'R134a,R32'})).id
    const voltage=(await h.api('customfield.save',owner,{name:'Voltage',entityType:'part',type:'number',scope:'organization',unit:'V'})).id
    const preview=(entity,rows,format='csv',extra={})=>h.api('spreadsheet.preview',importer,{entity,dateFormat:'MDY',spreadsheet:file(`synthetic-gasket-1.${format}`,format==='csv'?csv(rows):workbook(rows,format,entity)),...extra})
    async function apply(p){
      let job=await h.api('spreadsheet.apply',importer,{...p.carry,fingerprint:p.fingerprint})
      for(let n=0;n<100&&job.state!=='completed';n++)job=await h.api('spreadsheet.job',importer,{job:job.job,action:'resume'})
      assert.equal(job.state,'completed')
      return job.job
    }
    const assets=[['Source ID','Tag','Name','Location','Category','Cooling type'],['00017','00017','Chiller 17','Cold room','HVAC','R134a']]
    const unmappedAsset=await preview('assets',assets)
    assert.equal(unmappedAsset.accepted.length,0);assert.ok(unmappedAsset.rejected[0].reason.includes('required'))
    const assetPreview=await preview('assets',assets,'csv',{customMapping:{'Cooling type':refrigerant}})
    assert.deepEqual(assetPreview.rejected,[]);assert.equal(assetPreview.accepted[0].customValues[refrigerant],'R134a')
    await apply(assetPreview)
    const asset=assetPreview.accepted[0].targetId
    assert.equal((await h.api(`assets/${asset}`,owner)).tag,'00017')
    const parts=[['Source ID','Number','Name','Unit','Quantity','Minimum','Category','Voltage'],['00021','00021','Motor','each','3','1','Electrical','240'],['00022','00022','Grease','lb','2.5','0.5','','12'],['00023','00023','Lubricant','kg','1.25','0.25','','24']]
    const partPreview=await preview('parts',parts,'xls');assert.deepEqual(partPreview.rejected,[])
    await apply(partPreview)
    const part=partPreview.accepted[0].targetId
    assert.equal((await h.api(`parts/${part}`,owner)).number,'00021')
    assert.equal((await h.api(`parts/${part}`,owner)).customFields.find(f=>f.id===voltage).value,240)
    assert.equal((await h.api(`parts/${partPreview.accepted[1].targetId}`,owner)).unit,'lb')
    const si=await h.api(`parts/${partPreview.accepted[2].targetId}`,owner)
    assert.deepEqual([si.unit,si.onHand],['kg','1.25'])
    const portal=(await h.api('request.portal',owner,{name:'Internal maintenance',fields:[]})).id
    const publicPortal=(await h.api('request.portal',owner,{name:'Visitor faults',mode:'public',publicConsent:true,fields:[]})).id
    const locationField=(await h.api('customfield.save',owner,{name:'Zone reference',entityType:'location',type:'text',scope:'organization',required:true})).id
    const locationRows=[['Source ID','Name','Portal','Zone reference'],['00031','Cold room',portal,'NW-03']]
    const wrongLocation=await preview('locations',[locationRows[0],['00032','Visitor bay',publicPortal,'NW-04']])
    assert.equal(wrongLocation.accepted.length,0);assert.equal(wrongLocation.rejected[0].reason,'authenticated_portal_required')
    const locationPreview=await preview('locations',locationRows,'xlsx');assert.deepEqual(locationPreview.rejected,[])
    await apply(locationPreview)
    const location=locationPreview.accepted[0].targetId
    const locationValues=await h.api(`locations/${location}/fields`,owner)
    assert.equal(locationValues.find(f=>f.id===locationField).value,'NW-03')
    const checklist=(await h.api('checklist.create',owner,{name:'Compressor inspection',items:['Inspect bearings']})).id
    const pmRows=[['Source ID','Title','Asset ID','Checklist','Every days','First due','Assignee','Team','Active'],['00041','Inspect chiller monthly','00017',checklist,'30','2027-03-15','legacy-user','Utilities','no']]
    const pmPreview=await preview('pms',pmRows,'xls',{userMapping:{'legacy-user':techId}})
    assert.deepEqual(pmPreview.rejected,[]);const pmJob=await apply(pmPreview)
    const pm=(await h.api('schedules',owner)).find(s=>s.id===pmPreview.accepted[0].targetId)
    assert.deepEqual([pm.title,pm.every_days,pm.next_due_date,pm.assignee,pm.active],['Inspect chiller monthly',30,'2027-03-15','Sam Mechanic',0])
    assert.equal((await h.api(`spreadsheet-imports/${pmJob}/rows`,owner)).rows[0].value.native.team_id,team)
    assert.equal((await h.api('spreadsheet.job',owner,{job:pmJob,action:'undo'})).state,'undone')
    assert.equal((await h.api('schedules',owner)).some(s=>s.id===pmPreview.accepted[0].targetId),false)
    assert.notEqual(await apply(pmPreview),pmJob,'reapply after undo creates a new durable job')
    const beforeStock=await h.api(`parts/${part}`,owner),beforeNotices=await h.api('notices',owner)
    const header=['Source ID','Status','Asset ID','Title','Work type','Created on','Due date','Completed on','Completed by','Assignee','Team','Priority','Estimate hours','Parts cost USD','Labor cost USD','Other cost USD','Historical consumption','Custom: Inspection type']
    const count=Number(process.env.GASKET_MIGRATION_ROWS??8)
    const rows=Array.from({length:count},(_,n)=>[String(n+1).padStart(6,'0'),n%2?'completed':'open','00317',`Inspect chiller ${n+1}`,'corrective',n%3?'03/01/2027':'2027-03-01','03/15/2027',n%2?'2027-03-02T11:45':'',n%2?'Former technician':'',n%2?'Retired person':'legacy-user',n%2?'Legacy team':'legacy-crew','normal','1.5',n%2?'12.34':'',n%2?'56.78':'',n%2?'9.00':'',n%2?'00021: 2 each':'','Mechanical'])
    const broken=rows.map(r=>[...r]);broken[0][6]='not a date';broken[1][17]='Invalid choice'
    const bad=await preview('work',[header,...broken],'xlsx',{assetMapping:{'00317':asset}})
    assert.ok(bad.rejected.some(r=>r.reason.includes('assignee')))
    assert.ok(bad.rejected.some(r=>r.reason.includes('choice')))
    const mappings={assetMapping:{'00317':asset},userMapping:{'legacy-user':techId},teamMapping:{'legacy-crew':team}}
    const mappedBad=await preview('work',[header,...broken],'xlsx',mappings)
    assert.ok(mappedBad.rejected.some(r=>r.reason.includes('due date')))
    const fixed=await preview('work',[header,...rows],'xlsx',mappings)
    assert.deepEqual(fixed.rejected,[]);assert.equal(fixed.accepted.length,count)
    const csvEquivalent=await preview('work',[header,...rows],'csv',mappings)
    assert.deepEqual(csvEquivalent.accepted,fixed.accepted,'CSV and Excel normalize identical source values')
    const legacyEquivalent=await preview('work',[header,...rows],'xls',mappings)
    assert.deepEqual(legacyEquivalent.accepted,fixed.accepted,'legacy Excel preserves the same source values')
    const job=await apply(fixed)
    const reconciled=[];let after=0
    do{const page=await h.api(`spreadsheet-imports/${job}/rows?after=${after}`,owner);reconciled.push(...page.rows);after=page.next}while(after!==null)
    assert.equal(reconciled.length,count)
    const actual=new Map(reconciled.map(r=>[r.value.sourceId,r]))
    for(const [n,row]of rows.entries()){
      const value=actual.get(row[0]).value
      assert.deepEqual(value.source,Object.fromEntries(header.map((key,i)=>[key,row[i]])))
      assert.equal(value.native.title,`Inspect chiller ${n+1}`)
      if(n%2){assert.equal(value.native.asset,asset);assert.equal(value.native.completedOn,'2027-03-02T11:45');assert.equal(value.native.completedBy,'Former technician');assert.equal(value.native.sourceSystem,'Spreadsheet');assert.deepEqual([value.native.partsCents,value.native.laborCents,value.native.otherCents],[1234,5678,900]);assert.deepEqual(value.native.details,{customValues:{[field]:'Mechanical'},team:'Legacy team',consumption:'00021: 2 each'})}
      else {assert.equal(value.native.asset_id,asset);assert.equal(value.native.status,'open');assert.equal(value.native.created_at,Date.parse('2027-03-01T05:00:00Z'));assert.equal(value.native.assignee_id,techId);assert.equal(value.native.team_id,team);assert.equal(value.native.due_date,'2027-03-15');assert.equal(value.native.estimate_minutes,90);assert.deepEqual(value.customValues,{[field]:'Mechanical'})}
    }
    assert.equal(await apply(fixed),job,'replay returns the original job')
    assert.deepEqual(await h.api(`parts/${part}`,owner),beforeStock,'historical consumption does not change any stock state')
    assert.deepEqual(await h.api('notices',owner),beforeNotices,'history sends no notices')
    const history=await h.api(`assets/${asset}/history`,owner)
    assert.equal(history.events.filter(e=>e.kind==='history').length,count/2)
    assert.ok(history.events.some(e=>e.what.includes('Completed in Spreadsheet')&&e.who==='Former technician'))
    const firstOpen=fixed.accepted.find(r=>r.kind==='open').targetId
    const work=await h.api(`work/${firstOpen}`,owner)
    assert.equal(work.title,'Inspect chiller 1')
    assert.equal(work.fields.find(f=>f.id===field).value,'Mechanical')
    for(const format of ['csv','xls','xlsx']){
      const response=await h.raw(`/app/move-in/templates/work.${format}`,{cookie:owner});assert.equal(response.status,200)
      assert.ok((await response.arrayBuffer()).byteLength>100)
      assert.equal((await h.raw(`/app/move-in/templates/work.${format}`,{cookie:tech})).status,403)
    }
    for(const route of ['spreadsheet.preview','spreadsheet.apply','spreadsheet.job'])await h.api(route,tech,{...fixed.carry,fingerprint:fixed.fingerprint,job,action:'resume'},403)
    await h.api(`spreadsheet-imports/${job}/rows`,tech,undefined,403)
    assert.equal((await h.raw(`/app/move-in/reconciliation/${job}`,{cookie:tech})).status,403)
    assert.equal((await h.raw(`/api/gasket/spreadsheet-imports/${job}/rows`)).status,401)
    if(process.env.MIGRATION_SCREENSHOTS){
      await mkdir(process.env.MIGRATION_SCREENSHOTS,{recursive:true})
      const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
      try{
        const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies(importer.split('; ').map(pair=>{const i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),url:h.origin}}))
        const page=await context.newPage()
        for(const width of [1440,390]){
          await page.setViewportSize({width,height:1100})
          for(const [name,path]of [['migration-journal','/app/move-in'],['migration-reconciliation',`/app/move-in/reconciliation/${job}`],['migration-work',`/app/work/${firstOpen}`]]){
            await page.goto(h.origin+path)
            if(name==='migration-reconciliation')await page.getByText('Inspect values',{exact:true}).first().click()
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} fits ${width}`)
            await page.screenshot({path:`${process.env.MIGRATION_SCREENSHOTS}/${name}-${width}.png`,fullPage:true})
          }
          await page.goto(h.origin+'/app/move-in');await page.getByText('Templates and upload',{exact:true}).click()
          await page.getByLabel('Spreadsheet',{exact:true}).setInputFiles({name:'synthetic-gasket-1.xlsx',mimeType:['application','octet-stream'].join('/'),buffer:workbook([header,...broken])})
          await page.getByRole('button',{name:'Preview spreadsheet',exact:true}).click();await page.getByRole('heading',{name:'Spreadsheet preview',exact:true}).waitFor()
          assert.ok((await page.getByRole('table',{name:'Spreadsheet errors'}).innerText()).includes('Unknown or ambiguous asset'))
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
          await page.screenshot({path:`${process.env.MIGRATION_SCREENSHOTS}/migration-errors-${width}.png`,fullPage:true})
          await page.goto(h.origin+'/app/move-in');await page.getByText('Templates and upload',{exact:true}).click()
          await page.getByLabel('Spreadsheet',{exact:true}).setInputFiles({name:'synthetic-gasket-1.xlsx',mimeType:['application','octet-stream'].join('/'),buffer:workbook([header,...rows])})
          await page.getByRole('button',{name:'Preview spreadsheet',exact:true}).click();await page.getByRole('heading',{name:'Spreadsheet preview',exact:true}).waitFor()
          await page.getByText('Map assets, assignees and teams',{exact:true}).click()
          await page.getByLabel('Asset: 00317',{exact:true}).selectOption(asset)
          await page.getByLabel('Assignee: legacy-user',{exact:true}).selectOption(techId)
          await page.getByLabel('Team: legacy-crew',{exact:true}).selectOption(team)
          await page.getByRole('button',{name:'Review mappings',exact:true}).click()
          assert.equal(await page.getByRole('table',{name:'Spreadsheet errors'}).count(),0)
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
          assert.deepEqual(await page.locator('button,a,[role=button]').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&!n.querySelector('img[alt]')&&!n.getAttribute('data-tooltip')).map(n=>n.outerHTML)),[],'icon-only controls have tooltips')
          await page.screenshot({path:`${process.env.MIGRATION_SCREENSHOTS}/migration-reviewed-${width}.png`,fullPage:true})
          await page.getByRole('button',{name:'Apply accepted rows',exact:true}).click();await page.waitForURL(url=>url.pathname==='/app/move-in')
          assert.equal((await h.api('spreadsheet-imports',owner)).jobs.find(j=>j.id===job).state,'completed')
        }
        await context.close()
      }finally{await browser.close()}
    }
    console.log(`MIG-007 reconciled ${count} accepted rows, dates, fields, assignments, replay and no historical stock or notices`)
  }finally{await h.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await genericMigrationJourney()
