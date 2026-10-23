// Operator intake through the built Worker's HTTP doors; no direct DB writes.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness, file } from './harness.mjs'
import { png } from './fixtures.mjs'
import { draftPrivacy } from './request-draft-privacy.mjs'
import { photoPrivacy, installationLimit, erasePrivateRequest } from './request-privacy.mjs'

export async function requestFixture() {
  const h=await harness(),cookie={owner:await h.owner()}
  await h.api('site.configure',cookie.owner,{name:'Great Lakes Assembly',timezone:'America/New_York'})
  for(const [person,role] of [['lead','lead'],['tech','maintainer'],['other','maintainer'],['agent','agent']]) {
    await h.api('access.give',cookie.owner,{name:person,email:`${person}@example.test`,role});cookie[person]=await h.signIn(`${person}@example.test`)
  }
  const asset=(await h.api('asset.create',cookie.lead,{tag:'PUMP-22',name:'Private financial pump name',location:'Private room',notes:'Private maintenance notes',criticality:'critical'})).id
  const fields=[{key:'stopped',label:'Is the line stopped?',type:'choice',required:true,options:['Yes','No']},{key:'reading',label:'Gauge reading',type:'number',required:false},{key:'noticed',label:'First noticed',type:'date',required:false},{key:'detail',label:'Shift detail',type:'text',required:false},{key:'nameplate',label:'Nameplate photo',type:'photo',required:false}]
  const portal=(await h.api('request.portal',cookie.owner,{name:'Assembly fault report',fields})).id
  const target=(await h.api('request.target',cookie.owner,{portal,kind:'asset',asset,name:'PUMP-22 · Assembly pump',publishConsent:true})).id
  const payload={submissionKey:randomUUID(),target,description:'Noisy motor at startup',urgency:'high',contact:'Operator at extension 22',field_stopped:'Yes',field_reading:'12.50',field_noticed:'2026-10-22',field_detail:'Night shift <unaltered>',photo:file('leak.png',png,'image/png'),field_nameplate:file('铭牌.png',png,'image/png')}
  async function post(data=payload,who=cookie.tech,status=200,pid=portal) {
    const response=await h.raw(`/request/${pid}`,{cookie:who,body:data})
    // The native form falls back to a redirect; API-like clients ask JSON below.
    if(status===200) {assert.equal(response.status,303,await response.clone().text());return {receipt:response.headers.get('location')}}
    assert.equal(response.status,status,(await response.text()).slice(0,200));return response
  }
  return {h,cookie,asset,fields,portal,target,payload,post}
}
export async function requestPortalJourney() {
  const f=await requestFixture(),{h,cookie,asset,fields,portal,target,payload,post}=f
  try {
    await h.api('request.portal',cookie.lead,{name:'Rogue'},403)
    await h.api('request.target',cookie.tech,{portal,kind:'asset',asset,name:'Rogue',publishConsent:true},403)
    await h.api('request.portal',cookie.owner,{name:'No consent',mode:'public'},400)
    assert.equal((await h.raw(`/request/${portal}?target=${target}`)).status,303,'authenticated default')
    await post({...payload,field_stopped:''},cookie.tech,400)
    await post({...payload,field_stopped:'Invented'},cookie.tech,400)
    await post({...payload,field_reading:'NaN'},cookie.tech,400)
    await post({...payload,field_noticed:'2026-02-30'},cookie.tech,400)
    await post({...payload,target:randomUUID()},cookie.tech,404)
    await post({...payload,photo:file('big.png',Buffer.alloc(1_500_001))},cookie.tech,400)
    await post({...payload,photo:file('fake.png','not an image','image/png')},cookie.tech,400)
    await post(payload,cookie.agent,403)
    const first=await post()
    const rows=await h.api('requests',cookie.lead),r=rows.find(r=>r.description===payload.description)
    assert.ok(r);assert.equal(r.asset_id,asset)
    const record=await h.api(`requests/${r.id}`,cookie.lead)
    assert.deepEqual(record.answers,{stopped:'Yes',reading:'12.50',noticed:'2026-10-22',detail:'Night shift <unaltered>'})
    assert.deepEqual(record.form,fields);assert.equal(record.contact,payload.contact)
    assert.equal(record.files.length,2)
    for(const photo of record.files) {
      assert.equal(photo.sha256,createHash('sha256').update(png).digest('hex'),'independent original-file digest')
      const response=await h.raw(`/app/request-files/${photo.id}`,{cookie:cookie.tech})
      assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png)
      assert.ok(response.headers.get('content-disposition').includes(encodeURIComponent(photo.filename)),'original UTF-8 filename is downloadable')
      assert.equal((await h.raw(`/app/request-files/${photo.id}`,{cookie:cookie.other})).status,403)
      assert.equal((await h.raw(`/app/request-files/${photo.id}`)).status,303)
    }
    await h.api(`requests/${r.id}`,cookie.other,undefined,403)
    await h.api('requests',cookie.tech,undefined,403)
    assert.equal((await h.raw(`/api/gasket/requests/${r.id}`)).status,401)
    assert.equal((await h.raw(first.receipt)).status,200)
    const receipt=await (await h.raw(first.receipt)).text()
    assert.ok(!receipt.includes(payload.contact)&&!receipt.includes(payload.description),'receipt contains no private fault or contact')
    assert.equal((await post()).receipt,first.receipt,'retry keeps the receipt')
    await post({...payload,description:'Changed payload'},cookie.tech,409)
    assert.equal((await h.api('requests',cookie.lead)).length,1)
    // Explicitly open bounded public intake, retaining the required site form.
    await h.api('request.portal',cookie.owner,{portal,revision:1,name:'Assembly fault report',mode:'public',publicConsent:true,fields:fields.map(f=>f.key==='nameplate'?{...f,required:true}:f)})
    await post({...payload,submissionKey:randomUUID(),field_nameplate:undefined},null,400)
    assert.equal((await h.raw(`/request/${portal}`,{method:'POST'})).status,403,'missing same-origin proof is refused')
    const publicPage=await (await h.raw(`/request/${portal}?target=${target}`)).text()
    for(const privateText of ['Private financial pump name','Private room','Private maintenance notes','gk_assets'])assert.ok(!publicPage.includes(privateText))
    const noCode=await (await h.raw(`/request/${portal}`)).text();assert.ok(!noCode.includes('PUMP-22'),'public portal never enumerates targets')
    await post({...payload,submissionKey:randomUUID(),target:asset},null,404)
    await post({...payload,submissionKey:randomUUID(),field_stopped:''},null,400)
    const publicRequest=await post({...payload,submissionKey:randomUUID(),description:'Public noisy motor'},null)
    assert.equal((await h.raw(publicRequest.receipt)).status,200)
    const publicRecord=(await h.api('requests',cookie.lead)).find(r=>r.description==='Public noisy motor')
    assert.equal((await h.api(`requests/${publicRecord.id}`,cookie.lead)).requester_id,null,'contact is never an authenticated identity')
    await post({...payload,submissionKey:randomUUID(),website:'spam'},null,429)
    // Network bucket is atomic: the two stored submissions count once each;
    // concurrent additional distinct submissions cannot exceed five per hour.
    const results=await Promise.all(Array.from({length:7},(_,i)=>h.raw(`/request/${portal}`,{body:{...payload,submissionKey:randomUUID(),description:`Another fault ${i}`}})))
    assert.equal(results.filter(r=>r.status===303).length,3)
    assert.ok(results.filter(r=>r.status===429).length===4)
    for(const result of results.filter(r=>r.status===429))assert.match(await result.text(),/intake rate limited/)
    const refusals=(await h.api('audit?action=request.limit',cookie.owner)).rows
    assert.equal(refusals.length,4)
    for(const entry of refusals)assert.deepEqual(JSON.parse(entry.detail),{code:'intake_rate_limited'})
    assert.equal((await h.api('requests',cookie.lead)).length,5)
    assert.equal((await post()).receipt,first.receipt,'an already accepted submission can retry after the rate ceiling')
    await h.api('request.portal',cookie.owner,{portal,revision:2,name:'Assembly fault report',mode:'public',publicConsent:true,fields:[...fields,{key:'safe_access',label:'Is access safe?',type:'text',required:true}]})
    assert.equal((await post()).receipt,first.receipt,'accepted retries use the original form after required fields change')
    await post({...payload,submissionKey:randomUUID()},cookie.tech,400)
    if(process.env.REQUEST_SCREENSHOTS)await requestScreens(f,r.id)
    const camera=await browserContext(h)
    let jpeg
    try {jpeg=Buffer.from(await camera.page.evaluate(()=>{const c=document.createElement('canvas');c.width=2;c.height=2;return c.toDataURL('image/jpeg').split(',')[1]}),'base64')} finally {await camera.context.close();await camera.browser.close()}
    await photoPrivacy(f,jpeg)
    await installationLimit(f)
    const erasure=await browserContext(h,cookie.owner)
    try {await erasePrivateRequest(f,r.id,null,erasure.page)} finally {await erasure.context.close();await erasure.browser.close()}
    await post(payload,cookie.tech,410)
    console.log('REQ-001 typed authenticated/public intake, required answers, originals, privacy, consent and concurrent abuse limits passed')
  } finally {await h.close()}
}
async function browserContext(h,cookie) {
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  const context=await browser.newContext({ignoreHTTPSErrors:true,deviceScaleFactor:3})
  if(cookie)await context.addCookies(cookie.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
  return {browser,context,page:await context.newPage()}
}
async function capture(page,h,path,name) {
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1100});assert.equal((await page.goto(h.origin+path)).status(),200)
    await page.evaluate(()=>document.fonts.ready)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} fits ${width}`)
    // All controls on these screens have visible text labels. Catch an icon-only
    // regression unless its tooltip describes the control on hover and focus.
    const unlabelled=await page.locator('button,a,[role=button]').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim() && !n.querySelector('img[alt]') && !n.getAttribute('data-tooltip')).map(n=>n.outerHTML))
    assert.deepEqual(unlabelled,[],`${name}: icon-only controls have tooltips`)
    await page.screenshot({path:`${process.env.REQUEST_SCREENSHOTS}/${name}-${width}.png`,fullPage:true})
  }
}
async function requestScreens(f,requestId) {
  await mkdir(process.env.REQUEST_SCREENSHOTS,{recursive:true})
  const {browser,context,page}=await browserContext(f.h,f.cookie.owner)
  try {for(const [path,name] of [[`/app/request-portals`,'request-settings'],[`/app/requests`,'request-queue'],[`/app/requests/${requestId}`,'request-detail'],[`/request/${f.portal}?target=${f.target}`,'fault-form']])await capture(page,f.h,path,name)}
  finally {await context.close();await browser.close()}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const journeys={portal:requestPortalJourney,drafts:requestDraftJourney,labels:labelsJourney,triage:requestTriageJourney}
  const task=process.env.REQUEST_JOURNEY || 'all'
  assert.ok(task==='all' || Object.hasOwn(journeys,task),`Unknown request journey: ${task}`)
  for(const journey of task==='all'?Object.values(journeys):[journeys[task]])await journey()
}

async function decodeSymbol(page,selector,format) {
  const {PNG}=await import('pngjs'),{RGBLuminanceSource,BinaryBitmap,HybridBinarizer,MultiFormatReader,DecodeHintType,BarcodeFormat}=await import('@zxing/library')
  const image=PNG.sync.read(await page.locator(selector).screenshot({scale:'device'}))
  if(format==='QR_CODE') {
    // jsQR scans the rendered RGBA pixels without an expected payload or an
    // aligned-image hint. ZXing 0.21's finder can miss valid QR masks; retain
    // its independent Code128 reader for the printed keyboard-scanner code.
    const {default:jsQR}=await import('jsqr')
    const scanned=jsQR(new Uint8ClampedArray(image.data),image.width,image.height)
    assert.ok(scanned,'a general QR scanner reads the printed pixels')
    return scanned.data
  }
  const pixels=new Uint8ClampedArray(image.width*image.height)
  for(let i=0;i<pixels.length;i++)pixels[i]=(image.data[i*4]*299+image.data[i*4+1]*587+image.data[i*4+2]*114)/1000
  const reader=new MultiFormatReader();reader.setHints(new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat[format]]]]))
  return reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,image.width,image.height)))).getText()
}
export async function requestDraftJourney() {
  const f=await requestFixture(),{h,cookie,portal,target,asset}=f
  let browser,context
  try {
    await h.api('request.portal',cookie.owner,{portal,revision:1,name:'Assembly fault report',mode:'public',publicConsent:true})
    const signed=await browserContext(h,cookie.lead)
    let scanned
    try {
      await signed.page.goto(`${h.origin}/app/labels?target=${target}`)
      scanned=await decodeSymbol(signed.page,'.gk-label-qr svg','QR_CODE')
      assert.equal(new URL(scanned).pathname,`/scan/${target}`,'a real decoder reads the printed QR')
    } finally {await signed.context.close();await signed.browser.close()}
    ;({browser,context}=await browserContext(h))
    let page=await context.newPage();await page.setViewportSize({width:390,height:1100});await page.goto(scanned)
    assert.equal(new URL(page.url()).pathname,`/request/${portal}`)
    await page.locator('[name=description]').fill('Leak around the pump seal')
    await page.locator('[name=contact]').fill('Night shift operator')
    await page.locator('[name=field_stopped]').selectOption('Yes')
    await page.locator('[name=photo]').setInputFiles({name:'leak.png',mimeType:'image/png',buffer:png})
    assert.equal(await page.locator('[name=photo]').getAttribute('capture'),'environment')
    await page.getByLabel('Save this draft and photos on this private device').check()
    await page.getByRole('button',{name:'Save draft',exact:true}).click()
    await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor()
    const submissionKey=await page.locator('[name=submissionKey]').inputValue()
    if(process.env.REQUEST_SCREENSHOTS){await mkdir(process.env.REQUEST_SCREENSHOTS,{recursive:true});await capture(page,h,`/request/${portal}?target=${target}`,'phone-draft')}
    await context.setOffline(true)
    await page.getByRole('button',{name:'Send request',exact:true}).click()
    await page.getByRole('status').filter({hasText:'Not confirmed'}).waitFor()
    assert.equal((await h.api('requests',cookie.lead)).length,0,'offline send stores no request')
    // Close/reopen the tab, restoring original File bytes and the immutable key.
    await page.close();await context.setOffline(false);page=await context.newPage();await page.setViewportSize({width:390,height:1100});await page.goto(scanned)
    await page.getByRole('status').filter({hasText:'Saved draft restored'}).waitFor()
    assert.equal(await page.locator('[name=description]').inputValue(),'Leak around the pump seal')
    assert.equal(await page.locator('[name=submissionKey]').inputValue(),submissionKey)
    assert.equal(await page.locator('[name=target]').inputValue(),target)
    assert.equal(await page.locator('[name=photo]').evaluate(n=>n.files[0].name),'leak.png')
    // The server accepts the request but its response is lost before the phone
    // receives it. This is an edge failure, never a product test bypass.
    let lost=false
    await page.route(`**/request/${portal}`,async route=>{if(route.request().method()==='POST'&&!lost){lost=true;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed')}else await route.continue()})
    await page.getByRole('button',{name:'Send request',exact:true}).click();await page.getByRole('status').filter({hasText:'Not confirmed'}).waitFor()
    assert.equal((await h.api('requests',cookie.lead)).length,1,'the response was lost after persistence')
    await Promise.all([page.waitForURL(`**/received/${submissionKey}`),page.getByRole('button',{name:'Send request',exact:true}).click()])
    await page.reload();assert.match(await page.getByRole('status').textContent(),/R-1 is saved/)
    const rows=await h.api('requests',cookie.lead);assert.equal(rows.length,1);assert.equal(rows[0].asset_id,asset)
    const r=await h.api(`requests/${rows[0].id}`,cookie.lead);assert.equal(r.files.length,1)
    assert.deepEqual(Buffer.from(await (await h.raw(`/app/request-files/${r.files[0].id}`,{cookie:cookie.lead})).arrayBuffer()),png)
    if(process.env.REQUEST_SCREENSHOTS)await capture(page,h,new URL(page.url()).pathname,'phone-confirmation')
    await page.goto(scanned);await page.getByRole('link',{name:'Open confirmation',exact:true}).waitFor()
    assert.equal(await page.locator('[name=contact]').inputValue(),'','confirmed drafts retain no private contact')
    await draftPrivacy(f,context,page,scanned,process.env.REQUEST_SCREENSHOTS?capture:null)
    console.log('REQ-002 decoded QR, camera photo, durable offline draft, lost-response retry, one original-mapped request and durable confirmation passed')
  } finally {await context?.close();await browser?.close();await h.close()}
}

export async function labelsJourney() {
  const f=await requestFixture(),{h,cookie,portal,target,asset,payload}=f
  let browser,context
  try {
    await h.api('request.portal',cookie.owner,{portal,revision:1,name:'Assembly fault report',mode:'public',publicConsent:true})
    const location=(await h.api('request.target',cookie.owner,{portal,kind:'location',name:'West loading bay',publishConsent:true})).id
    const bin=(await h.api('request.target',cookie.owner,{portal,kind:'bin',name:'Stores bin B-22',publishConsent:true})).id
    assert.equal((await h.raw('/app/labels')).status,303)
    assert.equal((await h.raw('/app/labels',{cookie:cookie.tech})).status,403)
    ;({browser,context}=await browserContext(h,cookie.lead));let page=await context.newPage()
    await page.goto(`${h.origin}/app/labels`)
    assert.equal(await page.locator('.gk-label').count(),3)
    const label=page.locator('.gk-label').filter({has:page.getByRole('link',{name:'Open PUMP-22 · Assembly pump',exact:true})})
    const index=await label.evaluate(n=>[...n.parentElement.children].indexOf(n)+1)
    const qr=await decodeSymbol(page,`.gk-label:nth-child(${index}) .gk-label-qr svg`,'QR_CODE')
    const barcode=await decodeSymbol(page,`.gk-label:nth-child(${index}) .gk-label-barcode svg`,'CODE_128')
    assert.equal(new URL(qr).pathname,`/scan/${target}`);assert.equal(barcode,target)
    // A scanner keyboard and a phone camera resolve the same published identity.
    await page.goto(`${h.origin}/scan`);await page.getByLabel('Label code').fill(barcode)
    await Promise.all([page.waitForURL(url=>url.searchParams.get('code')===target),page.getByRole('button',{name:'Open label',exact:true}).click()])
    assert.equal(await page.getByRole('heading',{name:'PUMP-22 · Assembly pump',exact:true}).count(),1)
    if(process.env.REQUEST_SCREENSHOTS) {
      await mkdir(process.env.REQUEST_SCREENSHOTS,{recursive:true})
      await capture(page,h,'/app/labels','print-labels');await capture(page,h,`/scan/${target}`,'authorized-scan');await capture(page,h,'/scan','scanner-code')
    }
    await context.close();await browser.close();({browser,context}=await browserContext(h,cookie.tech));page=await context.newPage();await page.setViewportSize({width:390,height:1100});await page.goto(qr)
    assert.equal(await page.getByRole('link',{name:'Open authorized asset record'}).getAttribute('href'),`/app/assets/${asset}`)
    const form=page.locator('form[action="/app/do/label.work"]')
    await form.locator('[name=title]').fill('Inspect leaking pump seal');await form.locator('[name=description]').fill('Seal leak photographed at the label');await form.locator('[name=priority]').selectOption('high')
    await form.locator('[name=photo]').setInputFiles({name:'seal.png',mimeType:'image/png',buffer:png})
    await Promise.all([page.waitForURL('**/app/work/*'),form.getByRole('button',{name:'Create corrective work'}).click()])
    const workId=new URL(page.url()).pathname.split('/').pop(),work=await h.api(`work/${workId}`,cookie.lead)
    assert.equal(work.asset_id,asset);assert.equal(work.priority,'high');assert.equal(work.description,'Seal leak photographed at the label');assert.equal(work.assignee_id,work.created_by);assert.equal(work.created_via,'web');assert.equal(work.evidence.length,1)
    await h.api('site.technicianWork',cookie.owner,{allowed:false})
    await h.api('label.work',cookie.tech,{target,title:'Must fail',due:work.due_date},403)
    const denied=await (await h.raw(`/scan/${target}`,{cookie:cookie.tech})).text();assert.ok(!denied.includes('Create corrective work'))
    await h.api('label.work',cookie.agent,{target,title:'Must fail',due:work.due_date},403)
    await h.api('site.technicianWork',cookie.owner,{allowed:true})
    const rogue=(await h.api('asset.create',cookie.lead,{tag:'OTHER-22',name:'Other asset',location:'Elsewhere'})).id
    const bound=await h.api('label.work',cookie.tech,{target,asset:rogue,title:'Still the scanned pump',due:work.due_date,unassigned:true})
    assert.equal((await h.api(`work/${bound.id}`,cookie.lead)).asset_id,asset,'forged asset input cannot change scan mapping')
    // A location label, without an asset, really submits a persisted fault.
    const reported=await h.raw(`/request/${portal}`,{body:{...payload,target:location,submissionKey:randomUUID(),description:'Loading bay drain blocked'}});assert.equal(reported.status,303)
    const request=(await h.api('requests',cookie.lead)).find(r=>r.description==='Loading bay drain blocked');assert.equal(request.asset_id,null);assert.equal(request.location,'West loading bay')
    assert.equal((await h.raw(`/scan/${bin}`)).status,303)
    const binWork=await h.api('label.work',cookie.tech,{target:bin,title:'Inspect stores bin',due:work.due_date,unassigned:true});assert.equal((await h.api(`work/${binWork.id}`,cookie.lead)).location,'Stores bin B-22')
    for(const id of [workId,bound.id])await h.api('workorder.cancel',cookie.lead,{workOrder:id,reason:'Inspection cancelled before retirement'})
    await h.api('asset.retire',cookie.lead,{asset,reason:'Pump removed from service'})
    await page.goto(`${h.origin}/app/labels?target=${target}`) // technician cannot print
    assert.equal((await h.raw(`/scan/${target}`)).status,410)
    assert.match(await (await h.raw(`/scan/${target}`)).text(),/Retired label/)
    assert.equal((await h.raw(`/scan/${randomUUID()}`)).status,404)
    await h.api('label.work',cookie.tech,{target,title:'Retired',due:work.due_date},410)
    await context.close();await browser.close();({browser,context}=await browserContext(h,cookie.lead));page=await context.newPage();await page.goto(`${h.origin}/app/labels?target=${target}`)
    assert.equal(await decodeSymbol(page,'.gk-label-qr svg','QR_CODE'),qr,'retired reprint preserves original QR')
    assert.equal(await decodeSymbol(page,'.gk-label-barcode svg','CODE_128'),barcode)
    if(process.env.REQUEST_SCREENSHOTS) {
      await capture(page,h,`/app/labels?target=${target}`,'retired-reprint')
      for(const [path,name,status] of [[`/scan/${target}`,'retired-label',410],[`/scan/${randomUUID()}`,'unknown-label',404]])for(const width of [1440,390]){await page.setViewportSize({width,height:1100});assert.equal((await page.goto(h.origin+path)).status(),status);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${process.env.REQUEST_SCREENSHOTS}/${name}-${width}.png`,fullPage:true})}
    }
    console.log('ASSET-002 independently decoded QR/Code128, asset/location/bin print and scan, public scope, authorized mapped work, revocation and stable retired/unknown states passed')
  } finally {await context?.close();await browser?.close();await h.close()}
}

export async function requestTriageJourney() {
  const f=await requestFixture(),{h,cookie,portal,target,asset,payload,post}=f
  let browser,context
  try {
    await post();await post({...payload,submissionKey:randomUUID(),description:'Same noisy motor reported by second shift'},cookie.other)
    await post({...payload,submissionKey:randomUUID(),description:'Third unrelated report'},cookie.tech)
    let rows=await h.api('requests',cookie.lead)
    const root=rows.find(r=>r.description===payload.description).id,duplicate=rows.find(r=>r.description.startsWith('Same')).id,third=rows.find(r=>r.description.startsWith('Third')).id
    const detail=id=>h.api(`requests/${id}`,cookie.lead)
    const decide=async(id,decision,extra={})=>h.api('request.triage',cookie.lead,{request:id,version:(await detail(id)).version,decision,reason:'Recorded lead decision',...extra})
    await h.api('request.triage',cookie.tech,{request:root,version:1,decision:'approve',reason:'Unauthorized'},403)
    await h.api('request.convert',cookie.tech,{request:root,version:1},403)
    await h.api('request.convert',cookie.lead,{request:root,version:1},409)
    await h.api('request.triage',cookie.lead,{request:root,version:1,decision:'decline'},400)
    await decide(root,'ask_details',{reason:'Does the noise continue after warmup?',impact:'stopped'})
    assert.equal((await detail(root)).status,'needs_details')
    await h.api('request.reply',cookie.other,{request:root,version:2,text:'Pretended answer'},403)
    const creator=await h.api(`requests/${root}`,cookie.tech)
    assert.ok(creator.timeline.some(e=>e.kind==='ask_details' && e.text==='Does the noise continue after warmup?'))
    await h.api('request.reply',cookie.tech,{request:root,version:creator.version,text:'Yes, the noise continues and the line is stopped.'})
    assert.equal((await detail(root)).status,'new')
    await h.api('request.triage',cookie.lead,{request:root,version:1,decision:'approve',reason:'Stale decision'},409)
    // Reject self/chain/cross-target linking before linking the two real reports.
    await h.api('request.triage',cookie.lead,{request:root,version:(await detail(root)).version,decision:'duplicate',canonical:root,reason:'Self link'},409)
    const otherLocation=(await h.api('request.target',cookie.owner,{portal,kind:'location',name:'Other room',publishConsent:true})).id
    await post({...payload,target:otherLocation,submissionKey:randomUUID(),description:'Other target'})
    const elsewhere=(await h.api('requests',cookie.lead)).find(r=>r.description==='Other target').id
    await h.api('request.triage',cookie.lead,{request:elsewhere,version:1,decision:'duplicate',canonical:root,reason:'Wrong target'},409)
    await decide(duplicate,'duplicate',{canonical:root,reason:'Both shifts describe the same pump bearing noise'})
    assert.equal((await detail(duplicate)).duplicate_of,root)
    assert.ok((await detail(root)).timeline.some(e=>e.kind==='duplicate_linked'))
    await h.api('request.triage',cookie.lead,{request:root,version:(await detail(root)).version,decision:'duplicate',canonical:elsewhere,reason:'Cannot turn a root with children into a duplicate'},409)
    await decide(root,'approve',{reason:'Confirmed bearing fault; repair is authorized for scheduling',impact:'stopped'})
    assert.equal((await h.api('requests?criticality=critical&urgency=high&impact=stopped',cookie.lead)).find(r=>r.id===root).impact,'stopped')
    await decide(third,'decline',{reason:'Explained: this report describes the already scheduled cosmetic repair'})
    assert.equal((await detail(third)).status,'declined');assert.match((await detail(third)).timeline.at(-1).text,/Explained/)
    await h.api('request.convert',cookie.lead,{request:third,version:(await detail(third)).version},409)
    await h.api('request.convert',cookie.lead,{request:duplicate,version:(await detail(duplicate)).version},409)
    // Concurrent conversion claims still create exactly one corrective record.
    await post({...payload,submissionKey:randomUUID(),description:'Separate bearing fault for concurrent conversion'})
    const race=(await h.api('requests',cookie.lead)).find(r=>r.description.startsWith('Separate')).id
    await decide(race,'approve',{reason:'Independent fault accepted'})
    const raceBody={request:race,version:(await detail(race)).version}
    const raceBefore=(await h.api('work?state=open',cookie.lead)).length
    const conversions=await Promise.all([1,2].map(()=>h.raw('/api/gasket/request.convert',{cookie:cookie.lead,body:raceBody})))
    assert.ok(conversions.some(r=>r.status===200));assert.ok(conversions.every(r=>[200,409].includes(r.status)))
    assert.equal((await h.api('work?state=open',cookie.lead)).length,raceBefore+1)
    const before=(await h.api('work?state=open',cookie.lead)).length
    ;({browser,context}=await browserContext(h,cookie.lead));const page=await context.newPage()
    if(process.env.REQUEST_SCREENSHOTS){await mkdir(process.env.REQUEST_SCREENSHOTS,{recursive:true});await capture(page,h,'/app/requests?impact=stopped','triage-queue');await capture(page,h,`/app/requests/${root}`,'approved-request')}
    await page.goto(`${h.origin}/app/requests/${root}`)
    const convert=page.locator('form[action="/app/do/request.convert"]')
    await Promise.all([page.waitForURL('**/app/work/*'),convert.getByRole('button',{name:'Create one corrective order'}).click()])
    const workId=new URL(page.url()).pathname.split('/').pop()
    assert.equal((await h.api('request.convert',cookie.lead,{request:root,version:1})).id,workId,'retry returns existing work')
    assert.equal((await h.api('work?state=open',cookie.lead)).length,before+1)
    for(const id of [root,duplicate]) {
      const r=await detail(id);assert.equal(r.work_order_id,workId);assert.ok(r.timeline.some(e=>e.kind==='work_created'))
      assert.equal(r.files.length,2,'neither report loses any original photo')
    }
    let work=await h.api(`work/${workId}`,cookie.lead)
    assert.equal(work.asset_id,asset);assert.equal(work.description,payload.description);assert.equal(work.priority,payload.urgency)
    assert.equal(work.requestSources.length,2);assert.equal(work.requestSources.flatMap(r=>r.files).length,4)
    assert.ok(work.requestSources.some(r=>r.requester_name==='tech'));assert.ok(work.requestSources.some(r=>r.requester_name==='other'))
    assert.equal(work.requestSources[0].answers.stopped,'Yes')
    // The converted work authorizes necessary source evidence for its assigned
    // technician, never private contacts or an unrelated member's browsing.
    const tech=(await h.api('me',cookie.tech)).id
    await h.api('workorder.assign',cookie.lead,{workOrder:workId,assignee:tech})
    const assigned=await h.api(`work/${workId}`,cookie.tech);assert.equal(assigned.requestSources.length,2)
    const secondFile=assigned.requestSources.find(r=>r.id===duplicate).files[0]
    const response=await h.raw(`/app/request-files/${secondFile.id}`,{cookie:cookie.tech});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png)
    assert.equal((await h.api(`work/${workId}`,cookie.agent)).requestSources.length,0)
    assert.equal((await h.raw(`/app/request-files/${secondFile.id}`,{cookie:cookie.agent})).status,403)
    assert.ok(!JSON.stringify(assigned.requestSources).includes(payload.contact),'necessary work evidence exposes no contact')
    const audit=await h.api('audit?action=request.convert',cookie.owner);assert.ok(audit.rows.some(e=>e.subject===root))
    if(process.env.REQUEST_SCREENSHOTS){await capture(page,h,`/app/requests/${root}`,'converted-request');await capture(page,h,`/app/requests/${duplicate}`,'duplicate-timeline');await capture(page,h,`/app/requests/${third}`,'declined-request');await capture(page,h,`/app/work/${workId}`,'corrective-source-evidence')}
    await erasePrivateRequest(f,root,workId)
    if(process.env.REQUEST_SCREENSHOTS)await capture(page,h,`/app/requests/${root}`,'erased-converted-request')
    console.log('REQ-003 lead triage/filtering, request/reply, reasoned rejection, duplicate preservation and one no-retyping corrective order with original linked evidence passed')
  } finally {await context?.close();await browser?.close();await h.close()}
}
