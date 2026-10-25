import assert from 'node:assert/strict'
import { harness, file } from './harness.mjs'
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
export async function customFieldsJourney() {
  const h=await harness(), owner=await h.owner()
  try {
    await h.api('site.configure',owner,{name:'Great Lakes Assembly',timezone:'America/New_York'})
    const techId=(await h.api('access.give',owner,{name:'Maya Chen',email:'customtech@example.test',role:'maintainer'})).id,tech=await h.signIn('customtech@example.test')
    const define=values=>h.api('customfield.save',owner,{entityType:'asset',scope:'organization',type:'text',...values})
    await h.api('customfield.save',tech,{name:'Unauthorized',entityType:'asset',type:'text',scope:'site'},403)
    const refrigerant=(await define({name:'Refrigerant type',scope:'category',category:'HVAC',type:'single',required:true,options:'R-32,R-410A'})).id
    const voltage=(await define({name:'Voltage',entityType:'part',type:'number',unit:'V',minimum:'0',maximum:'600'})).id
    const base={tag:'HVAC-22',name:'Line 2 cooling unit',category:'HVAC',location:'Line 2'}
    await h.api('asset.create',owner,base,400)
    await h.api('asset.create',owner,{...base,customValues:{[refrigerant]:'Invented'}},400)
    const asset=(await h.api('asset.create',owner,{...base,customValues:{[refrigerant]:'R-32'}})).id
    const other=(await h.api('asset.create',owner,{tag:'CV-12',name:'Line 2 conveyor',category:'Conveyor',location:'Line 2'})).id
    const part=(await h.api('part.create',owner,{number:'MOTOR-480',name:'Conveyor drive motor',unit:'each',customValues:{[voltage]:480}})).id
    const categoryField=(await define({name:'Motor enclosure',entityType:'part',scope:'category',category:'Motor',required:true})).id
    let partState=await h.api(`parts/${part}`,owner)
    await h.api('part.category',owner,{part,revision:partState.revision,category:'Motor'},400)
    await h.api('part.category',owner,{part,revision:partState.revision,category:'Motor',customValues:{[categoryField]:'IP66'}})
    assert.equal((await h.api(`parts/${part}`,tech)).customFields.find(f=>f.id===categoryField).value,'IP66')
    const update={entityType:'asset',entityId:asset,customValues:{[refrigerant]:'R-410A'}}
    await h.api('customvalue.set',tech,update,403)
    await h.submit('customvalue.set',owner,{entityType:'asset',entityId:asset,[`cf.${refrigerant}`]:'R-410A'},`/app/assets/${asset}`)
    await h.api('customvalue.set',owner,{...update,customValues:{[refrigerant]:null}},400)
    await h.api('customvalue.set',owner,{entityType:'part',entityId:part,customValues:{[voltage]:800}},400)
    const kinds=[['text','Service note','Check seal'],['multiple','Compatible gases',['R-32','R-410A']],['date','Commissioned','2026-10-20'],['boolean','Isolation fitted',false],['link','Manual','https://example.test/manual']]
    for(const [type,name,value] of kinds) {
      const id=(await define({name,type,options:type==='multiple'?'R-32,R-410A':undefined})).id
      await h.api('customvalue.set',owner,{entityType:'asset',entityId:asset,customValues:{[id]:value}})
      assert.deepEqual((await h.api(`assets/${asset}`,tech)).customFields.find(f=>f.id===id).value,value)
    }
    const details=await h.api(`assets/${asset}`,tech),values=details.customFields.find(f=>f.id===refrigerant)
    assert.equal(values.value,'R-410A');assert.equal(values.history.length,2);assert.equal(values.history[0].actor,'Olive Owner');assert.ok(values.history[0].changed_at)
    assert.deepEqual((await h.api(`search?kind=asset&field=${refrigerant}&value=R-410A`,tech)).rows.map(r=>r.id),[asset])
    const saved=(await h.api('search.save',owner,{name:'Cooling on R-410A',filters:{kind:'asset',field:refrigerant,value:'R-410A'}})).id
    assert.deepEqual((await h.api(`search?view=${saved}`,owner)).rows.map(r=>r.id),[asset])
    assert.deepEqual((await h.api(`search?kind=part&field=${voltage}&value=480`,tech)).rows.map(r=>r.id),[part])
    assert.deepEqual((await h.api(`assets?field=${refrigerant}&value=R-410A`,tech)).map(r=>r.id),[asset])
    const csv=await (await h.raw(`/app/assets.csv?field=${refrigerant}&value=R-410A`,{cookie:owner})).text()
    assert.ok(csv.includes('Refrigerant type')&&csv.includes('R-410A')&&csv.includes('HVAC-22')&&!csv.includes('CV-12'))
    assert.ok((await (await h.raw('/app/parts.csv',{cookie:owner})).text()).includes('480'))
    assert.equal((await h.raw('/app/assets.csv',{cookie:tech})).status,403)
    const portal=(await h.api('request.portal',owner,{name:'Line 2 faults',fields:[]})).id
    const target=(await h.api('request.target',owner,{portal,kind:'asset',asset,name:'HVAC-22',publishConsent:true})).id
    const location=(await h.api('request.target',owner,{portal,kind:'location',name:'Line 2',publishConsent:true})).id
    const access=(await define({name:'Access instructions',entityType:'location'})).id
    await h.api('customvalue.set',owner,{entityType:'location',entityId:location,customValues:{[access]:'Ask shift lead'}})
    assert.equal((await h.api(`locations/${location}/fields`,tech)).find(f=>f.id===access).value,'Ask shift lead')
    assert.ok((await (await h.raw(`/scan/${target}`,{cookie:tech})).text()).includes('R-410A'))
    assert.ok(!(await (await h.raw(`/request/${portal}?target=${target}`)).text()).includes('R-410A'),'public intake never exposes custom values')
    if(process.env.CUSTOM_SCREENSHOTS)await customBrowser({h,owner,asset,part,target,location,refrigerant})
    await h.api('customfield.save',owner,{id:refrigerant,revision:1,name:'Cooling refrigerant',entityType:'asset',scope:'category',category:'HVAC',type:'single',required:true,options:'R-32,R-410A'})
    assert.equal((await h.api(`assets/${asset}`,tech)).customFields.find(f=>f.id===refrigerant).value,'R-410A')
    await h.api('customfield.retire',owner,{id:voltage,revision:1})
    const archived=(await h.api(`parts/${part}`,tech)).customFields.find(f=>f.id===voltage)
    assert.equal(archived.retired,1);assert.equal(archived.value,480);assert.equal(archived.history.length,1)
    assert.ok((await (await h.raw('/app/parts.csv',{cookie:owner})).text()).includes('Voltage (archived)'))
    const imported='Name,ID,Location,Types,Refrigerant type\r\nRoof cooler,synthetic-gasket-1,Roof,HVAC,R-32\r\n'
    const input={assets:file('assets.csv',imported),dateOrder:'MDY',customMapping:{'Refrigerant type':refrigerant}}
    const preview=await h.api('import.preview',owner,input)
    const applied=await h.api('import.apply',owner,{...input,fingerprint:preview.fingerprint})
    assert.equal(applied.state,'completed')
    const moved=(await h.api('assets',owner)).filter(r=>r.origin==='import')
    assert.ok(moved.length>0)
    const mapped=await Promise.all(moved.map(r=>h.api(`assets/${r.id}`,owner)))
    assert.ok(mapped.some(r=>r.customFields.some(f=>f.id===refrigerant&&f.value==='R-32')))
    assert.equal((await h.api('import.apply',owner,{...input,fingerprint:preview.fingerprint})).job,applied.job)
    await h.api('customvalue.set',owner,{entityType:'asset',entityId:moved[0].id,customValues:{[refrigerant]:'R-410A'}})
    await h.api('import.job',owner,{job:applied.job,action:'undo'},409)
    console.log('Custom field register, typed validation, scopes, scan privacy, history, search, CSV and MaintainX mapping passed')
  } finally {await h.close()}
}
async function customBrowser({h,owner,asset,part,target,location,refrigerant}) {
  await mkdir(process.env.CUSTOM_SCREENSHOTS,{recursive:true})
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(owner.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    for(const [name,path] of [['fields','/app/settings/fields'],['asset-register','/app/assets'],['request-portals','/app/request-portals'],['move-in','/app/move-in'],['asset',`/app/assets/${asset}`],['parts','/app/parts'],['part',`/app/parts/${part}`],['scan',`/scan/${target}`],['location',`/app/locations/${location}`],['filter',`/app/assets?field=${refrigerant}&value=R-410A`]])for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});assert.equal((await page.goto(h.origin+path)).status(),200)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} fits ${width}`)
      assert.deepEqual(await page.locator('button,a,[role=button]').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&!n.querySelector('img[alt]')&&!n.getAttribute('data-tooltip')).map(n=>n.outerHTML)),[],`${name} icon-only controls have tooltips`)
      if(['asset','part','scan','location'].includes(name))await page.locator('#custom-fields').scrollIntoViewIfNeeded()
      await page.screenshot({path:`${process.env.CUSTOM_SCREENSHOTS}/${name}-${width}.png`,fullPage:!['asset','part'].includes(name)})
    }
    await page.goto(`${h.origin}/scan/${target}`)
    await page.getByText('Edit custom fields',{exact:true}).click()
    await page.locator(`[name="cf.${refrigerant}"]`).selectOption('R-32')
    await page.getByRole('button',{name:'Update values'}).click()
    assert.equal((await h.api(`assets/${asset}`,owner)).customFields.find(f=>f.id===refrigerant).value,'R-32')
    await page.locator('summary').filter({hasText:'Edit custom fields'}).click()
    await page.locator(`[name="cf.${refrigerant}"]`).selectOption('R-410A')
    await page.getByRole('button',{name:'Update values'}).click()
    await page.goto(h.origin+'/app/move-in')
    await page.locator('input[name=assets]').setInputFiles({name:'maintainx-assets.csv',mimeType:'text/csv',buffer:Buffer.from('Name,ID,Location,Types,Refrigerant type\r\nWorkshop cooler,synthetic-gasket-8,Workshop,HVAC,R-32\r\n')})
    await page.getByRole('button',{name:'Dry run',exact:true}).click()
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      await page.getByText('Map asset columns',{exact:true}).click()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`import mapping fits ${width}`)
      await page.screenshot({path:`${process.env.CUSTOM_SCREENSHOTS}/import-mapping-${width}.png`,fullPage:true})
      await page.getByText('Map asset columns',{exact:true}).click()
    }
    await context.close()
  } finally {await browser.close()}
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href)await customFieldsJourney()
