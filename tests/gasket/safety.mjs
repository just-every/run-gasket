import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { file, harness, exerciseKeyedActions, assertDocumented } from './harness.mjs'
import { png } from './fixtures.mjs'

const provenance='Owner-entered reference — not verified by Gasket with the issuing body.'
const unzip=buffer=>{const b=Buffer.from(buffer),out={};for(let at=0;b.readUInt32LE(at)===0x04034b50;){const size=b.readUInt32LE(at+18),n=b.readUInt16LE(at+26),start=at+30+n+b.readUInt16LE(at+28);out[b.subarray(at+30,at+30+n).toString()]=b.subarray(start,start+size);at=start+size}return out}

export async function safetyJourney() {
 const h=await harness({clockInstant:Date.parse('2026-10-26T16:00:00Z')})
 try {
  const owner=await h.owner();const receipts=exerciseKeyedActions(h,owner,['safety.publish','safety.attest','calibration.create']);await h.api('site.configure',owner,{name:'Erie maintenance',timezone:'America/New_York'})
  const tech=(await h.api('access.give',owner,{name:'Synthetic technician',email:'safety-tech@example.test',role:'maintainer'})).id
  const who=await h.signIn('safety-tech@example.test')
  const supervisor=(await h.api('access.give',owner,{name:'Independent reviewer',email:'safety-review@example.test',role:'supervisor'})).id
  const review=await h.signIn('safety-review@example.test')
  const agentId=(await h.api('access.give',owner,{name:'Synthetic agent',email:'safety-agent@example.test',role:'agent'})).id
  const agent=await h.signIn('safety-agent@example.test')
  const asset=(await h.api('asset.create',owner,{name:'Isolated drive',tag:'SAFE-1',location:'Workshop'})).id
  const checklist=(await h.api('checklist.create',owner,{name:'Required isolation inspection',items:['Inspect guard | number V 0..1']})).id
  const prerequisite={checklist,hazard:'Stored electrical energy',isolation:'Apply the site-approved lockout procedure and verify isolation',qualification:'Isolation training',siteApproved:true}
  await h.api('safety.publish',who,prerequisite,403)
  await h.api('safety.publish',owner,{...prerequisite,siteApproved:false},400)
  await h.api('safety.publish',owner,prerequisite)
  const schedule=(await h.api('calibration.create',owner,{asset,checklist,title:'Required isolation inspection',everyDays:30,firstDue:'2026-10-26',assignee:tech})).id
  const work=(await h.api('workorders.generate',owner,{})).created.find(w=>w.schedule===schedule).id
  const library=await h.api('compliance-templates',who)
  assert.equal(library[0].qualification,'Isolation training')
  assert.equal(JSON.parse(library[0].intervals)[0].everyDays,30)
  const current=()=>h.api(`work/${work}`,who)
  const state=async()=>{const result=await h.api(`v1/work/${work}/safety`,who);assertDocumented('SafetyState',result);return result}
  assert.equal((await h.raw(`/api/gasket/work/${work}/safety`)).status,401)
  await h.api(`work/${work}/safety`,agent,undefined,403)
  await h.api('planning',who,undefined,403)
  await h.api('workorder.results',who,{workOrder:work,value:['0'],note:['Guard inspected']})
  const incomplete=await h.raw(`/app/work/${work}/compliance.zip`,{cookie:owner})
  const incompleteManifest=JSON.parse(unzip(await incomplete.arrayBuffer())['MANIFEST.json'])
  assert.ok(incompleteManifest.missing.some(reason=>reason.includes('sign-off')))
  assert.ok(incompleteManifest.missing.includes('Certificate missing'))
  await h.api('workorder.evidence',who,{workOrder:work,certificate:true,file:file('initial-certificate.png',png,'image/png')})
  let w=await current()
  assert.equal((await h.api('workorder.submit',who,{workOrder:work,version:w.version},409)).error,'safety_evidence_required')
  const sign=async(extra={},status=200)=>{
   const result=await h.api('safety.attest',who,{workOrder:work,version:(await current()).version,isolated:true,permit:'synthetic-gasket-1',expires:'2026-11-01',file:file('permit.txt','Site-approved isolation permit'),...extra},status)
   if(status===200){
    const version=(await current()).version
    await h.api('workorder.sign',who,{workOrder:work,version,role:'technician'})
    await h.api('workorder.sign',who,{workOrder:work,version,role:'customer',name:'Synthetic witness',mark:file('witness.png',png,'image/png')})
   }
   return result
  }
  assert.equal((await sign({},409)).error,'qualification_missing_or_expired')
  const q={member:tech,name:'Isolation training',expires:'2026-10-25',reference:'synthetic-gasket-2'}
  await h.api('planning.qualification',owner,q)
  await sign({},409)
  await h.api('planning.qualification',owner,{...q,expires:'2027-01-01'})
  assert.equal((await sign({expires:'2026-10-25'},409)).error,'permit_expired')
  await sign({isolated:false},400)
  if(process.env.SAFETY_SCREENSHOTS)await browserProof(h,owner,who,checklist,work,'open')
  await sign()
  const receipt=receipts.filter(row=>row.path==='safety.attest').at(-1)
  await h.api('workorder.assign',owner,{workOrder:work,assignee:(await h.api('me',owner)).id})
  const forbiddenReplay=await h.raw('/api/gasket/v1/safety.attest',{cookie:who,body:receipt.body,headers:receipt.headers})
  assert.equal(forbiddenReplay.status,403)
  assert.equal((await forbiddenReplay.json()).error,'not_your_work')
  await h.api('workorder.assign',owner,{workOrder:work,assignee:tech})
  await sign()
  assert.deepEqual((await state()).missing,[])
  assert.equal((await state()).attestations.at(-1).qualification.provenance,provenance)
  await h.api('checklist.revise',owner,{checklist,items:['Inspect guard | number V 0..1','Confirm isolation point'],note:'New isolation point'})
  assert.ok((await state()).missing.includes('Changed evidence requires reapproval'))
  w=await current();await h.api('workorder.submit',who,{workOrder:work,version:w.version},409)
  // Old instructions are retained; a human explicitly reapproves the changed procedure.
  await sign()
  await h.api('workorder.evidence',who,{workOrder:work,certificate:true,file:file('certificate.png',png,'image/png')})
  assert.ok((await state()).missing.length,'new evidence invalidates earlier sign-off')
  await sign()
  const previousQualification=(await state()).attestations.at(-1).qualification
  await h.api('planning.retire',owner,{kind:'qualification',member:tech,name:q.name,reason:'Reference withdrawn',revision:(await h.api('planning',owner)).revision})
  assert.ok((await state()).missing.includes('Qualification missing, expired or changed'))
  assert.equal((await sign({},409)).error,'qualification_missing_or_expired')
  await h.api('planning.qualification',owner,{...q,expires:'2027-01-01'})
  assert.notEqual((await h.api('planning',owner)).qualifications.find(row=>row.member_id===tech).record_id,previousQualification.record_id)
  assert.ok((await state()).missing.includes('Qualification missing, expired or changed'),'identical replacement facts never revive a retired sign-off')
  w=await current();await h.api('workorder.submit',who,{workOrder:work,version:w.version},409)
  await sign()
  await h.api('planning.qualification',owner,{...q,expires:'2027-02-01'})
  assert.ok((await state()).missing.includes('Qualification missing, expired or changed'))
  await sign()
  const document=await h.api('document.add',owner,{asset,kind:'authorization',title:'Site isolation instructions',source:'Site-approved procedure',file:file('isolation.txt','Original isolation instructions')})
  await h.api('document.link',owner,{workOrder:work,document:document.document})
  assert.ok((await state()).missing.includes('Changed evidence requires reapproval'),'linked instructions require reapproval')
  await sign()
  const snapshot=await state()
  assert.equal(snapshot.attestations.at(-1).signer,tech)
  w=await current();await h.api('workorder.submit',who,{workOrder:work,version:w.version})
  await h.api('workorder.review',who,{workOrder:work,version:(await current()).version,decision:'approve'},403)
  await h.api('safety.publish',owner,{...prerequisite,isolation:'Revised site-approved isolation points'})
  assert.equal((await h.api('workorder.review',review,{workOrder:work,version:(await current()).version,decision:'approve'},409)).error,'safety_evidence_required')
  await h.api('workorder.review',review,{workOrder:work,version:(await current()).version,decision:'return',reason:'Reapprove changed isolation'})
  await sign()
  w=await current();await h.api('workorder.submit',who,{workOrder:work,version:w.version})
  await h.api('workorder.review',review,{workOrder:work,version:(await current()).version,decision:'approve'})
  assert.equal((await current()).status,'closed')
  assert.equal((await h.api(`work/${work}/safety`,review)).attestations.at(-1).qualification,undefined,'review does not grant personnel browsing')
  const download=async(cookie,status)=>{const r=await h.raw(`/app/work/${work}/compliance.zip`,{cookie});assert.equal(r.status,status);return r}
  await download(undefined,303);await download(agent,403);await download(who,403)
  const response=await download(owner,200),entries=unzip(await response.arrayBuffer()),manifest=JSON.parse(entries['MANIFEST.json'])
  for(const f of manifest.files)assert.equal(createHash('sha256').update(entries[f.path]).digest('hex'),f.sha256)
  assert.equal(JSON.parse(entries['instructions.json']).number,1)
  assert.equal(JSON.parse(entries['results.json']).items[0].result.outcome,'pass')
  assert.ok(JSON.parse(entries['review.json']).reviews.some(r=>r.decision==='approved'&&r.reviewer==='Independent reviewer'))
  assert.equal(JSON.parse(entries['qualifications.json']).provenance,provenance)
  assert.ok(Object.keys(entries).some(p=>p.startsWith('permits/')))
  assert.ok(Object.keys(entries).some(p=>p.endsWith('certificate.png')))
  assert.ok(Object.keys(entries).some(p=>p.endsWith('isolation.txt')))
  assert.ok(Object.keys(entries).some(p=>p.startsWith('signatures/')))
  assert.ok(JSON.parse(entries['review.json']).signatures.some(s=>s.role==='technician'))
  assert.ok(entries['MANIFEST.csv'])
  const audit=JSON.stringify(await h.api('audit',owner));assert.ok(audit.includes('safety.attest'));assert.ok(audit.includes('compliance.export'))
  if(process.env.SAFETY_SCREENSHOTS)await browserProof(h,owner,who,checklist,work)
  await h.stop()
  const future=await harness({vars:h.vars,installation:h.installation,clockInstant:Date.parse('2026-11-02T16:00:00Z')})
  try {
   const cookie=await future.signIn(h.vars.OWNER_EMAIL)
   const expired=await future.raw(`/app/work/${work}/compliance.zip`,{cookie})
   assert.equal(expired.status,200)
   const expiredManifest=JSON.parse(unzip(await expired.arrayBuffer())['MANIFEST.json'])
   assert.ok(expiredManifest.missing.includes('Permit expired'))
  } finally {await future.close()}
 } finally {await h.close()}
}

async function browserProof(h,owner,who,checklist,work,mode='closed') {
 await mkdir(process.env.SAFETY_SCREENSHOTS,{recursive:true})
 const browser=await chromium.launch({headless:true,executablePath:process.env.SAFETY_CHROMIUM||undefined,args:['--no-sandbox']})
 try {
  const screens=mode==='open'?[['open',who,`/app/work/${work}`]]:[['template',owner,`/app/checklists/${checklist}`],['work',who,`/app/work/${work}`],['library',owner,'/app/schedules']]
  for(const [name,cookie,path] of screens) {
   const context=await browser.newContext({ignoreHTTPSErrors:true})
   await context.addCookies(cookie.split('; ').map(pair=>{const i=pair.indexOf('=');return{name:pair.slice(0,i),value:pair.slice(i+1),url:h.origin}}))
   const page=await context.newPage()
   for(const width of [1440,390]) {
    if(name==='open')await h.api('workorder.results',who,{workOrder:work,value:['0'],note:['Rechecked isolation reading']})
    await page.setViewportSize({width,height:1000})
    assert.equal((await page.goto(h.origin+path)).status(),200)
    await page.getByRole('heading',{name:name==='template'?'Site-approved safety prerequisites':name==='library'?'Compliance templates':'Isolation and permit evidence'}).waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} fits ${width}`)
    if(name==='open'){
     assert.equal(await page.getByRole('button',{name:'Submit for review',exact:true}).isDisabled(),true)
     await page.screenshot({path:`${process.env.SAFETY_SCREENSHOTS}/sign-off-form-${width}.png`,fullPage:true})
     await page.getByLabel('I attest the site-approved isolation prerequisites were performed',{exact:true}).check()
     await page.getByLabel('Permit reference',{exact:true}).fill('synthetic-gasket-3')
     await page.getByLabel('Permit expires',{exact:true}).fill('2026-11-01')
     await page.getByLabel('Permit original',{exact:true}).setInputFiles({name:'browser-permit.txt',mimeType:'text/plain',buffer:Buffer.from('Site-approved isolation permit')})
     await page.getByRole('button',{name:'Record qualified sign-off',exact:true}).click()
     await page.getByText('Required evidence recorded.',{exact:true}).waitFor()
     assert.equal(await page.getByRole('button',{name:'Submit for review',exact:true}).isEnabled(),true)
    }
    if(name==='work'||name==='open')await page.getByText(provenance,{exact:true}).first().waitFor()
    for(const control of await page.locator('button:visible').all())assert.ok((await control.textContent()).trim()||await control.getAttribute('data-tooltip'),'icon control has a tooltip')
    await page.screenshot({path:`${process.env.SAFETY_SCREENSHOTS}/${name}-${width}.png`,fullPage:true})
   }
   await context.close()
  }
 } finally {await browser.close()}
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href){await safetyJourney();console.log('Safety evidence journey passed')}
