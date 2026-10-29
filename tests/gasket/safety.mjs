import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { installation } from './installation.mjs'
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { file, harness } from './harness.mjs'
import { png } from './fixtures.mjs'

const provenance='Owner-entered reference — not verified by Gasket with the issuing body.'
const unzip=buffer=>{const b=Buffer.from(buffer),out={};for(let at=0;b.readUInt32LE(at)===0x04034b50;){const size=b.readUInt32LE(at+18),n=b.readUInt16LE(at+26),start=at+30+n+b.readUInt16LE(at+28);out[b.subarray(at+30,at+30+n).toString()]=b.subarray(start,start+size);at=start+size}return out}

// Build the actual pre-identity schema, retain an old-format sign-off, then apply the upgrade.
async function upgradeQualificationProof() {
 const old=await installation(), run=promisify(execFile)
 const migrations=['0099_resource_retirement.sql','0100_qualification_identity.sql','0101_qualification_erasure.sql','0102_resource_grants.sql','0103_qualification_hold_erasure.sql']
 const sql=async command=>JSON.parse((await run(join(old.root,'node_modules/.bin/wrangler'),
  ['d1','execute','foundation','--local','--persist-to','.wrangler/state','--config','wrangler.jsonc','--json','--command',command],
  {cwd:old.root,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'},maxBuffer:4*1024*1024})).stdout)
 let before,after
 try {
  for(const name of migrations)await rm(join(old.root,'./migrations/core',name))
  await old.migrate()
  before=await harness({installation:old,clockInstant:Date.parse('2026-10-26T16:00:00Z')})
  const owner=await before.owner()
  await before.api('site.configure',owner,{name:'Upgrade plant',timezone:'America/New_York'})
  const tech=(await before.api('access.give',owner,{name:'Upgrade technician',email:'upgrade-tech@example.test',role:'maintainer'})).id
  const who=await before.signIn('upgrade-tech@example.test')
  await before.api('access.give',owner,{name:'Upgrade reviewer',email:'upgrade-review@example.test',role:'supervisor'})
  const reviewer=await before.signIn('upgrade-review@example.test')
  const checklist=(await before.api('checklist.create',owner,{name:'Upgrade isolation',items:['Verify isolation']})).id
  const prerequisite=await before.api('safety.publish',owner,{checklist,hazard:'Stored energy',isolation:'Site-approved isolation',qualification:'Isolation training',siteApproved:true})
  const template=(await before.api('template.save',owner,{name:'Upgrade repair',title:'Isolated repair',checklist})).id
  const work=(await before.api('workorder.create',owner,{location:'Workshop',template,due:'2026-10-26',assignee:tech})).id
  await before.api('workorder.results',who,{workOrder:work,outcome:['pass'],note:['Verified isolation']})
  const current=await before.api(`work/${work}`,who)
  await before.stop()
  // This fixture is the legacy persisted shape; all post-upgrade assertions use public doors.
  await sql(`INSERT INTO gk_qualifications(member_id,name,expires_on,reference) VALUES ('${tech}','Isolation training','2027-01-01','synthetic-gasket-upgrade'), ('${tech}','Other training','2027-01-01','synthetic-gasket-other');
   INSERT INTO gk_safety_attestations SELECT 'synthetic-gasket-upgrade',w.id,'${prerequisite.requirement}',w.checklist_revision_id,w.version,'${tech}',
    '{"name":"Isolation training","expires_on":"2027-01-01","reference":"synthetic-gasket-upgrade"}',
    'synthetic-gasket-permit','2026-11-01','permit.txt',X'01','${createHash('sha256').update(Buffer.from([1])).digest('hex')}',1 FROM gk_work_orders w WHERE w.id='${work}';`)
  await sql(`INSERT INTO gk_automation_jobs(id,rule_id,rule_revision,source,started_at,finished_at,state,input,output)
   VALUES('synthetic-gasket-legacy-expiry','expiry',1,'cron',1,1,'completed',
    json_object('day','2026-10-26','qualificationReminders',json_object('qualifications',json_array(json_object('member_id','${tech}','name','Other training','record_id','legacy','expires_on','2027-01-01','remind_days',1,'consent',1,'person','Upgrade technician'),json_object('member_id','${tech}','name','Isolation training','record_id','legacy','expires_on','2027-01-01','remind_days',1,'consent',1,'person','Upgrade technician')),'owners',json_array())),
    '{"created":[],"runs":[],"notices":[]}');`)
  await copyFile(new URL('../../migrations/core/'+migrations[0],import.meta.url),join(old.root,'./migrations/core',migrations[0]))
  await old.migrate()
  // The intermediate release saved the shared legacy marker in new snapshots.
  await sql(`INSERT INTO gk_safety_attestations SELECT 'synthetic-gasket-upgrade-with-id',work_order_id,requirement_id,procedure_revision,work_version,signer,json_set(qualification_json,'$.record_id','legacy'),permit,expires_on,filename,bytes,sha256,2 FROM gk_safety_attestations WHERE id='synthetic-gasket-upgrade';`)
  const readSnapshots="SELECT qualification_json FROM gk_safety_attestations ORDER BY id"
  const original=(await sql(readSnapshots)).flatMap(r=>r.results)
  await copyFile(new URL('../../migrations/core/'+migrations[1],import.meta.url),join(old.root,'./migrations/core',migrations[1]))
  await old.migrate()
  assert.deepEqual((await sql(readSnapshots)).flatMap(r=>r.results),original,'upgrade preserves immutable saved evidence bytes')
  for(const name of migrations.slice(2)) await copyFile(new URL('../../migrations/core/'+name,import.meta.url),join(old.root,'./migrations/core',name))
  await old.migrate()
  after=await harness({installation:old,vars:before.vars,clockInstant:Date.parse('2026-10-26T16:00:00Z')})
  const upgradedOwner=owner,upgradedTech=who
  const state=()=>after.api(`work/${work}/safety`,upgradedTech)
  assert.deepEqual((await state()).missing,[],'an unchanged pre-upgrade sign-off stays valid')
  assert.deepEqual((await state()).attestations.map(a=>a.reasons),[[],[]],'both pre-identity and intermediate legacy snapshots stay valid')
  const migrated=(await after.api('planning',upgradedOwner)).qualifications
  assert.deepEqual(migrated.map(q=>q.name),['Isolation training','Other training'])
  assert.equal(new Set(migrated.map(q=>q.record_id)).size,2,'old qualifications receive distinct identities')
  const q={member:tech,name:'Isolation training',expires:'2027-01-01',reference:'synthetic-gasket-upgrade'}
  const identity=(await after.api('planning',upgradedOwner)).qualifications.find(q=>q.member_id===tech).record_id
  await after.api('planning.qualification',upgradedOwner,{...q,remind:true,remindDays:7})
  assert.equal((await after.api('planning',upgradedOwner)).qualifications.find(q=>q.member_id===tech).record_id,identity)
  assert.deepEqual((await state()).missing,[],'reminder consent preserves the legacy sign-off')
  await after.api('workorder.submit',upgradedTech,{workOrder:work,version:current.version})
  await after.api('workorder.review',reviewer,{workOrder:work,version:(await after.api(`work/${work}`,upgradedTech)).version,decision:'approve'})
  assert.equal((await after.api(`work/${work}`,upgradedTech)).status,'closed','unchanged legacy evidence permits independent approval')
  await after.api('planning.retire',upgradedOwner,{kind:'qualification',member:tech,name:q.name,reason:'Withdraw old evidence',revision:(await after.api('planning',upgradedOwner)).revision})
  await after.api('planning.qualification',upgradedOwner,q)
  assert.ok((await state()).missing.includes('Qualification missing, expired or changed'),'identical replacement never revives a pre-upgrade sign-off')
  await after.api('planning.retire',upgradedOwner,{kind:'qualification',member:tech,name:'Other training',reason:'Unused legacy reference withdrawn',revision:(await after.api('planning',upgradedOwner)).revision})
  const retiredLegacy=(await after.api('planning',upgradedOwner)).retired.find(r=>r.snapshot.name==='Other training')
  const legacyPreview=await after.api(`retention-preview?kind=qualification&id=${retiredLegacy.id}`,upgradedOwner)
  assert.equal(legacyPreview.eligible,true)
  assert.equal(legacyPreview.dependencies.reminderInputs,1)
  await after.api('qualification.erase',upgradedOwner,{id:retiredLegacy.id,revision:legacyPreview.revision,confirm:true})
  assert.ok(!JSON.stringify((await after.api('/automation/jobs',upgradedOwner)).jobs).includes('Other training'),'erasure removes pre-identity qualification captures as well as current captures')
  assert.ok(JSON.stringify((await after.api('/automation/jobs',upgradedOwner)).jobs).includes('Isolation training'),'erasure preserves a different qualification capture and its retained safety history')
  const unclassified={member:tech,name:'Unclassified notice guard',expires:'2027-01-01',reference:'synthetic-gasket-unclassified-reference'}
  await after.api('planning.qualification',upgradedOwner,unclassified)
  await after.api('planning.retire',upgradedOwner,{kind:'qualification',member:tech,name:unclassified.name,reason:'Withdraw unused reference',revision:(await after.api('planning',upgradedOwner)).revision})
  const protectedRecord=(await after.api('planning',upgradedOwner)).retired.find(r=>r.snapshot.name===unclassified.name)
  const recipient=(await after.api('me',upgradedOwner)).id
  await after.stop()
  await sql(`INSERT INTO gk_qualification_reminders(id,record_id,recipient_id,stage,text,created_at) VALUES('synthetic-gasket-unattributed-notice','legacy','${recipient}','due','synthetic-gasket-unattributed-old-notice',1);`)
  after=await harness({installation:old,vars:before.vars,clockInstant:Date.parse('2026-10-26T16:00:00Z')})
  const protectedPreview=await after.api(`retention-preview?kind=qualification&id=${protectedRecord.id}`,upgradedOwner)
  assert.equal(protectedPreview.eligible,false)
  assert.equal(protectedPreview.dependencies.legacyNotices,1)
  assert.ok(protectedPreview.blockers.some(b=>b.code==='legacy_notice'))
  await after.api('qualification.erase',upgradedOwner,{id:protectedRecord.id,revision:protectedPreview.revision,confirm:true},409)
  assert.equal((await after.api('planning',upgradedOwner)).retired.find(r=>r.id===protectedRecord.id).snapshot.reference,unclassified.reference)
  assert.equal((await after.api(`retention-preview?kind=qualification&id=${protectedRecord.id}`,upgradedOwner)).dependencies.legacyNotices,1,'unattributed retained notice survives refusal')
 } finally {await before?.close();await after?.close();await old.remove()}
}

export async function safetyJourney() {
 await upgradeQualificationProof()
 const h=await harness({clockInstant:Date.parse('2026-10-26T16:00:00Z')})
 try {
  const owner=await h.owner();await h.api('site.configure',owner,{name:'Erie maintenance',timezone:'America/New_York'})
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
  const state=()=>h.api(`work/${work}/safety`,who)
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
  assert.deepEqual((await state()).missing,[])
  const signedQualification=(await state()).attestations.at(-1).qualification
  for(const preferences of [{remind:true,remindDays:30},{remind:true,remindDays:7},{remind:false}]) {
   await h.api('planning.qualification',owner,{...q,expires:'2027-01-01',...preferences})
   assert.equal((await h.api('planning',owner)).qualifications.find(row=>row.member_id===tech).record_id,signedQualification.record_id,'reminder preferences preserve evidence identity')
   assert.deepEqual((await state()).missing,[],'reminder preferences preserve the qualified sign-off')
  }
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
  const retired=(await h.api('planning',owner)).retired.find(r=>r.kind==='qualification')
  const protectedPreview=await h.api(`retention-preview?kind=qualification&id=${retired.id}`,owner)
  assert.equal(protectedPreview.eligible,false,'retained sign-offs protect retired qualification evidence')
  assert.equal(protectedPreview.dependencies.safetySignoffs,3)
  const signedBefore=await state()
  assert.equal((await h.api('qualification.erase',owner,{id:retired.id,revision:protectedPreview.revision,confirm:true},409)).error,'qualification_retained')
  assert.deepEqual(await state(),signedBefore,'refused erasure preserves every signed snapshot and permit')
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
  const planning=await h.api('planning',owner)
  await h.api('planning.retire',owner,{kind:'qualification',member:tech,name:q.name,reason:'Training reference withdrawn',revision:planning.revision})
  assert.ok((await state()).missing.includes('Qualification missing, expired or changed'),'retirement invalidates prior qualified sign-off without deleting it')
  assert.equal((await state()).attestations.at(-1).qualification.reference,'synthetic-gasket-2')
  const retiredPack=await download(owner,200)
  assert.ok(JSON.parse(unzip(await retiredPack.arrayBuffer())['MANIFEST.json']).missing.includes('Qualification missing, expired or changed'))
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
