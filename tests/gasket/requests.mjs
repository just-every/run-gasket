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

export async function requestFixture(options) {
  const h=await harness(options),cookie={owner:await h.owner()}
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
    const publicConsent=(await h.api('audit?action=request.portal',cookie.owner)).rows.find(e=>e.subject===portal)
    assert.equal(publicConsent.role,'owner');assert.equal(JSON.parse(publicConsent.detail).publicConsent,true)
    const publishedName=(await h.api('audit?action=request.target',cookie.owner)).rows.find(e=>e.subject===target)
    assert.equal(publishedName.role,'owner');assert.equal(JSON.parse(publishedName.detail).name,'PUMP-22 · Assembly pump');assert.equal(JSON.parse(publishedName.detail).publishConsent,true)
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
  const browser=await chromium.launch({headless:true,...(process.env.GASKET_CHROMIUM?{executablePath:process.env.GASKET_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
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
  const journeys={portal:requestPortalJourney,drafts:requestDraftJourney,labels:labelsJourney,triage:requestTriageJourney,report:requestReportJourney,response:requestResponseJourney,strategy:strategyRolloutJourney}
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
    await page.getByRole('alert').filter({hasText:'Not confirmed'}).waitFor()
    assert.equal((await h.api('requests',cookie.lead)).length,0,'offline send stores no request')
    // Close/reopen the tab, restoring original File bytes and the immutable key.
    await page.close();await context.setOffline(false);page=await context.newPage();await page.setViewportSize({width:390,height:1100});await page.goto(scanned)
    await page.getByRole('status').filter({hasText:'Saved draft restored'}).waitFor()
    assert.equal(await page.locator('[name=description]').inputValue(),'Leak around the pump seal')
    assert.equal(await page.locator('[name=submissionKey]').inputValue(),submissionKey)
    const restoredReceipt = new URL(await page.locator('[data-request-receipt]').getAttribute('href'),h.origin).pathname
    assert.equal(new URL(restoredReceipt,h.origin).pathname,`/request/${portal}/received/${submissionKey}`,'restored portal advertises the retained submission identity')
    assert.equal(await page.locator('[name=target]').inputValue(),target)
    assert.equal(await page.locator('[name=photo]').evaluate(n=>n.files[0].name),'leak.png')
    // The server accepts the request but its response is lost before the phone
    // receives it. This is an edge failure, never a product test bypass.
    let lost=false
    await page.route(`**/request/${portal}`,async route=>{if(route.request().method()==='POST'&&!lost){lost=true;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed')}else await route.continue()})
    await page.getByRole('button',{name:'Send request',exact:true}).click();await page.getByRole('alert').filter({hasText:'Not confirmed'}).waitFor()
    assert.equal((await h.api('requests',cookie.lead)).length,1,'the response was lost after persistence')
    assert.equal((await h.raw(restoredReceipt)).status,200,'the advertised restored receipt confirms a lost response')
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


// Reconcile every measure to ordinary intake, triage and work public doors.
export async function requestReportJourney() {
  const f=await requestFixture({clockOffset:Date.parse('2026-10-25T16:00:00Z')-Date.now()}),{h,cookie,asset,portal,target,payload,post}=f
  let browser,context
  try {
    const ids=[]
    for(const name of ['root','duplicate','declined','unanswered','untriaged']) {
      await post({...payload,submissionKey:randomUUID(),description:`synthetic-gasket-${name}`})
      ids.push((await h.api('requests',cookie.lead)).find(r=>r.description===`synthetic-gasket-${name}`).id)
    }
    const [root,duplicate,declined,unanswered,untriaged]=ids
    const detail=id=>h.api(`requests/${id}`,cookie.lead)
    const decide=async(id,decision,reason,extra={})=>h.api('request.triage',cookie.lead,{request:id,version:(await detail(id)).version,decision,reason,...extra})
    await decide(duplicate,'duplicate','Same bearing fault',{canonical:root})
    await decide(declined,'decline','No equipment fault, cosmetic mark')
    await decide(unanswered,'ask_details','Which operating cycle?')
    await decide(root,'approve','Bearing inspection confirmed')
    const work=(await h.api('request.convert',cookie.lead,{request:root,version:(await detail(root)).version})).id
    const tech=(await h.api('me',cookie.tech)).id
    await h.api('workorder.assign',cookie.lead,{workOrder:work,assignee:tech})
    let w=await h.api(`work/${work}`,cookie.tech)
    await h.api('workorder.submit',cookie.tech,{workOrder:work,version:w.version})
    w=await h.api(`work/${work}`,cookie.owner)
    await h.api('workorder.review',cookie.owner,{workOrder:work,version:w.version,decision:'approve'})
    const closed=await h.api(`work/${work}`,cookie.owner)
    const publicPortal=(await h.api('request.portal',cookie.owner,{name:'Public reporting group',mode:'public',publicConsent:true,fields:[]})).id
    const publicTarget=(await h.api('request.target',cookie.owner,{portal:publicPortal,kind:'location',name:'Public loading bay',publishConsent:true})).id
    await post({...payload,target:publicTarget,submissionKey:randomUUID(),description:'synthetic-gasket-public'},null,200,publicPortal)
    await post({...payload,target:publicTarget,submissionKey:randomUUID(),description:'synthetic-gasket-abandoned'},cookie.tech,200,publicPortal)
    const abandoned=(await h.api('requests',cookie.lead)).find(r=>r.description==='synthetic-gasket-abandoned').id
    await decide(abandoned,'abandon','Operator withdrew the report; evidence retained')
    const query='?from=2026-10-25&to=2026-10-25'
    const report=()=>h.api(`request-report${query}`,cookie.lead)
    const r=await report()
    assert.deepEqual([r.summary.total,r.summary.untriaged,r.summary.awaitingDetails,r.summary.unresolved,r.summary.duplicates,r.summary.converted,r.summary.declined,r.summary.abandoned],[7,2,1,5,1,2,1,1])
    const source=await Promise.all(r.rows.map(row=>detail(row.id)))
    const ackKinds=['assess','ask_details','approve','decline','abandon','duplicate']
    const ackTotal=source.reduce((sum,row)=>{const e=row.timeline.find(e=>ackKinds.includes(e.kind));return sum+(e?e.at-row.created_at:0)},0)
    const resolutionTotal=source.filter(row=>row.work_order_id===work).reduce((sum,row)=>sum+closed.closed_at-row.created_at,0)
    assert.deepEqual(r.summary.acknowledgment,{totalMs:ackTotal,measured:5,all:7,missing:2,meanMs:ackTotal/5})
    assert.deepEqual(r.summary.resolution,{totalMs:resolutionTotal,measured:2,all:7,missing:5,meanMs:resolutionTotal/2})
    assert.equal(r.rows.find(row=>row.id===declined).rejectionReason,'No equipment fault, cosmetic mark')
    assert.equal(r.rows.find(row=>row.id===abandoned).abandonmentReason,'Operator withdrew the report; evidence retained')
    assert.equal(r.rows.find(row=>row.id===root).conversionReason,'Bearing inspection confirmed')
    assert.ok(r.rows.find(row=>row.id===untriaged).acknowledgedAt===null)
    assert.equal(r.bySite[0].summary.total,7)
    assert.equal(r.byAsset.find(g=>g.value===asset).summary.total,5)
    assert.equal(r.byRequesterGroup.find(g=>g.value==='public').summary.total,1)
    for(const row of r.rows) {
      assert.equal((await h.raw(row.recordDoor,{cookie:cookie.lead})).status,200)
      assert.equal((await h.api(row.sourceDoor.replace('/api/gasket/',''),cookie.lead)).id,row.id)
      assert.ok(!JSON.stringify(row).includes(payload.contact))
    }
    // Independent CSV decoding keeps the download assertion outside product code.
    const readCsv=bytes=>{
      const text=new TextDecoder().decode(bytes),rows=[];let row=[],value='',quoted=false
      for(let i=0;i<text.length;i++) {
        const c=text[i]
        if(c==='"') {if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted}
        else if(c===','&&!quoted){row.push(value);value=''}
        else if(c==='\n'&&!quoted){row.push(value.replace(/\r$/,''));rows.push(row);row=[];value=''}
        else value+=c
      }
      assert.equal(quoted,false);return {rows}
    }
    for(const filter of ['',`&site=${encodeURIComponent(r.site)}&asset=${asset}&group=signed-in`,'&group=public','&status=needs_details','&site=Other']) {
      const selected=await h.api(`request-report${query}${filter}`,cookie.lead)
      const csv=await h.raw(`/app/request-report.csv${query}${filter}`,{cookie:cookie.lead})
      assert.equal(csv.status,200);assert.match(csv.headers.get('cache-control'),/no-store/)
      const [header,...lines]=readCsv(new Uint8Array(await csv.arrayBuffer())).rows
      assert.deepEqual(lines.map(row=>row[header.indexOf('id')]),selected.rows.map(row=>row.id))
      for(const [index,line] of lines.entries())for(const field of ['createdAt','acknowledgedAt','acknowledgmentMs','resolvedAt','resolutionMs','rejectionReason','conversionReason'])assert.equal(line[header.indexOf(field)],String(selected.rows[index][field]??''))
      assert.equal(lines.length,selected.summary.total)
    }
    assert.equal((await h.api(`request-report${query}&asset=${asset}&group=signed-in`,cookie.lead)).summary.total,5)
    assert.equal((await h.api(`request-report${query}&group=public`,cookie.lead)).summary.total,1)
    const defs=await h.api('metrics?metric=requests.volume',cookie.lead)
    assert.equal(defs.definitions[0].sourceDoor,'/api/gasket/request-report')
    assert.equal((await report()).inputFingerprint,r.inputFingerprint)
    const empty=await h.api('request-report?from=2026-10-26&to=2026-10-26',cookie.lead)
    assert.equal(empty.summary.total,0);assert.equal(empty.summary.acknowledgment.meanMs,null);assert.equal(empty.summary.resolution.meanMs,null)
    for(const who of [cookie.tech,cookie.other,cookie.agent])for(const door of ['/api/gasket/request-report','/app/request-report','/app/request-report.csv'])assert.equal((await h.raw(door,{cookie:who})).status,403)
    for(const door of ['/api/gasket/request-report','/app/request-report','/app/request-report.csv'])assert.ok([401,303].includes((await h.raw(door)).status))
    await h.api('request-report?from=2026-02-30',cookie.lead,undefined,400)
    ;({browser,context}=await browserContext(h,cookie.lead));const page=await context.newPage()
    await page.goto(`${h.origin}/app/requests`)
    await page.getByRole('link',{name:'Request reporting',exact:true}).click()
    await page.getByLabel('From',{exact:true}).fill('2026-10-25');await page.getByLabel('To',{exact:true}).fill('2026-10-25')
    await page.getByLabel('Asset',{exact:true}).selectOption(asset)
    await Promise.all([page.waitForURL(/asset=/),page.getByRole('button',{name:'Show requests'}).click()])
    assert.match(await page.locator('main').innerText(),/5 requests/)
    const download=page.getByRole('link',{name:'Download selected requests'})
    assert.equal((await h.raw(await download.getAttribute('href'),{cookie:cookie.lead})).status,200)
    if(process.env.REQUEST_SCREENSHOTS) {
      await mkdir(process.env.REQUEST_SCREENSHOTS,{recursive:true})
      await capture(page,h,`/app/request-report${query}`,'request-report')
      await capture(page,h,`/app/request-report${query}&asset=${asset}&group=signed-in`,'request-report-filtered')
      await capture(page,h,`/app/requests`,'request-report-entry')
      await capture(page,h,`/app/requests/${untriaged}`,'request-report-triage')
      await capture(page,h,`/app/requests/${abandoned}`,'request-report-abandoned')
      await capture(page,h,`/app/metrics?metric=requests.volume`,'request-report-definition')
    }
    await h.api('request.erase',cookie.owner,{request:untriaged,version:(await detail(untriaged)).version,confirm:true})
    const erased=await report()
    assert.equal(erased.summary.total,7);assert.equal(erased.coverage.erased,1)
    assert.equal(erased.summary.declined,1,'erasure is not a new rejection')
    assert.equal(erased.rows.find(row=>row.id===untriaged).group,'erased')
    assert.deepEqual(erased.rows.find(row=>row.id===untriaged).timeline,[])
    assert.equal(erased.byRequesterGroup.find(g=>g.value==='erased').summary.total,1)
    assert.notEqual(erased.inputFingerprint,r.inputFingerprint)
    // Every read rechecks current membership; an existing session loses report access.
    const lead=(await h.api('me',cookie.lead)).id
    await h.api('access.role',cookie.owner,{member:lead,role:'maintainer'})
    for(const door of ['/api/gasket/request-report','/app/request-report','/app/request-report.csv'])assert.equal((await h.raw(door,{cookie:cookie.lead})).status,403)
    assert.ok(lead)
    console.log('REQ-007 requestReportJourney: lifecycle denominators, source timestamps, scoped filters and CSV, reasons, definitions, responsive pages and access revocation passed')
  } finally {await context?.close();await browser?.close();await h.close()}
}

export async function requestResponseJourney() {
  const f=await requestFixture({clockInstant:Date.parse('2026-10-23T20:30:00Z')}),{cookie,portal,target,payload,post}=f
  let h=f.h,browser,context
  const advance=async at=>{await h.stop();h=await harness({installation:f.h.installation,vars:f.h.vars,clockInstant:Date.parse(at)})}
  const detail=id=>h.api(`requests/${id}`,cookie.lead)
  try {
    const owner=(await h.api('me',cookie.owner)).id,lead=(await h.api('me',cookie.lead)).id
    await h.api('closure.add',cookie.lead,{kind:'holiday',label:'Synthetic site holiday',startsOn:'2026-10-26'})
    const policy={urgency:'normal',acknowledgmentMinutes:60,resolutionMinutes:240,owner,escalation:lead,afterHours:'business',weekdays:['1','2','3','4','5'],opens:540,closes:1020}
    for(const who of [cookie.tech,cookie.agent])await h.api('request.responsePolicy',who,policy,403)
    await h.api('request.responsePolicy',cookie.lead,{...policy,escalation:(await h.api('me',cookie.tech)).id},400)
    await h.api('request.responsePolicy',cookie.lead,policy)
    await h.api('request.responsePolicy',cookie.lead,{...policy,urgency:'emergency',afterHours:'elapsed',acknowledgmentMinutes:15,resolutionMinutes:60})
    const ids=[]
    for(const [name,urgency] of [['routine','normal'],['paused','normal'],['urgent','emergency'],['no-policy','high']]) {
      await post({...payload,urgency,submissionKey:randomUUID(),description:`synthetic-gasket-${name}`})
      ids.push((await h.api('requests',cookie.lead)).find(r=>r.description===`synthetic-gasket-${name}`).id)
    }
    const [routine,paused,urgent,unconfigured]=ids
    assert.equal((await detail(unconfigured)).clock,null)
    assert.equal((await detail(routine)).clock.policy.holidays[0].starts_on,'2026-10-26')
    await h.api('request.clock',cookie.tech,{request:paused,revision:1,kind:'pause',reason:'Access unavailable'},403)
    await h.api('request.clock',cookie.lead,{request:paused,revision:1,kind:'pause',reason:''},400)
    await h.api('request.clock',cookie.lead,{request:paused,revision:1,kind:'pause',reason:'Access unavailable'})
    await h.api('request.clock',cookie.lead,{request:paused,revision:1,kind:'resume',reason:'Old tab'},409)
    // A new policy never silently resets existing clocks or holiday snapshots.
    await h.api('request.responsePolicy',cookie.lead,{...policy,acknowledgmentMinutes:600})
    assert.equal((await detail(routine)).clock.acknowledgment.targetMinutes,60)
    await advance('2026-10-26T16:00:00Z')
    await h.scheduled('*/15 * * * *')
    let r=await detail(routine),u=await detail(urgent),p=await detail(paused)
    assert.ok(Math.abs(r.clock.acknowledgment.elapsedMinutes-30)<1,'only Friday business time counts across the holiday and weekend')
    assert.equal(r.clock.notices.length,0);assert.equal(p.clock.paused,true);assert.ok(p.clock.acknowledgment.elapsedMinutes<1)
    assert.equal(u.clock.notices.length,2);assert.ok(Math.abs(u.clock.acknowledgment.elapsedMinutes-(Date.parse('2026-10-26T16:00:00Z')-u.created_at)/60000)<1,'urgent after-hours clock reconciles to source timestamps (4050 minutes from Friday 20:30 UTC to Monday 16:00 UTC)')
    for(const notice of u.clock.notices){assert.equal(notice.recipient_id,lead);assert.equal(notice.owner_id,owner);assert.ok(notice.automation_job_id);assert.equal(notice.automation_rule_revision,1)}
    assert.match(await (await h.raw('/app/requests',{cookie:cookie.lead})).text(),/Your request escalations/)
    await h.api('request.triage',cookie.lead,{request:urgent,version:u.version,decision:'assess',reason:'Lead accepted ownership'})
    await advance('2026-10-27T13:30:00Z')
    await h.scheduled('*/15 * * * *')
    r=await detail(routine);p=await detail(paused);u=await detail(urgent)
    assert.ok(Math.abs(r.clock.acknowledgment.elapsedMinutes-60)<1);assert.equal(r.clock.acknowledgment.overdue,true)
    assert.equal(r.clock.notices.length,1);assert.equal(r.clock.notices[0].kind,'acknowledgment')
    assert.equal(u.clock.acknowledgment.overdue,false);assert.equal(u.clock.resolution.overdue,true)
    assert.equal(p.clock.notices.length,0);assert.equal((await h.api('requests',cookie.lead)).length,4,'paused reports remain in backlog')
    await h.api('request.clock',cookie.lead,{request:paused,revision:2,kind:'resume',reason:'Access restored'})
    await advance('2026-10-27T14:31:00Z')
    // The existing owner-controlled chase grant governs this job too.
    await h.api('automation.control',cookie.owner,{rule:'chase',revision:1,paused:true,reason:'Hold all reminders'})
    await h.scheduled('*/15 * * * *')
    assert.equal((await detail(paused)).clock.notices.length,0)
    await h.api('automation.control',cookie.owner,{rule:'chase',revision:2,paused:false,reason:'Resume request escalation'})
    await h.api('automation.catchup',cookie.owner,{rule:'chase',revision:3})
    p=await detail(paused)
    assert.ok(Math.abs(p.clock.acknowledgment.elapsedMinutes-61)<1,'pause excludes only the paused interval')
    assert.equal(p.clock.notices.length,1);assert.equal(p.clock.notices[0].automation_rule_revision,3)
    const before=(await detail(urgent)).clock.notices
    await h.scheduled('*/15 * * * *');await h.scheduled('*/15 * * * *')
    assert.deepEqual((await detail(urgent)).clock.notices,before,'replays never duplicate notices or change their ownership')
    await h.api('request.triage',cookie.lead,{request:paused,version:p.version,decision:'decline',reason:'Access check confirmed no fault'})
    p=await detail(paused);assert.ok(p.clock.resolvedAt);assert.equal(p.clock.resolution.overdue,false)
    assert.equal((await h.api(`requests/${routine}`,cookie.tech)).clock,null,'requester never gains internal response policy or escalation details')
    for(const who of [cookie.tech,cookie.agent])for(const door of ['/api/gasket/request-response','/app/request-response'])assert.equal((await h.raw(door,{cookie:who})).status,403)
    assert.ok(!(await h.api('automation'+'/jobs',cookie.owner)).jobs.every(j=>!j.input.requestResponse))
    await h.api('access.give',cookie.owner,{name:'Reviewer',email:'reviewer@example.test',role:'supervisor'})
    const reviewer=await h.signIn('reviewer@example.test')
    assert.ok((await h.api('automation'+'/jobs',reviewer)).jobs.every(j=>!j.input.requestResponse&&!(j.output?.notices??[]).some(n=>n.request_id)),'request input evidence and notice sources remain restricted to triagers')
    ;({browser,context}=await browserContext(h,cookie.lead));const page=await context.newPage()
    await page.goto(h.origin+'/app/request-response')
    await page.getByLabel('Acknowledgment target minutes',{exact:true}).fill('90')
    await Promise.all([page.waitForURL(/notice=/),page.getByRole('button',{name:'Approve response policy',exact:true}).click()])
    assert.equal((await h.api('request-response',cookie.lead)).policies[0].acknowledgmentMinutes,90)
    if(process.env.REQUEST_SCREENSHOTS) {
      await mkdir(process.env.REQUEST_SCREENSHOTS,{recursive:true})
      await capture(page,h,'/app/request-response','response-policy')
      await capture(page,h,'/app/requests','response-queue')
      await capture(page,h,`/app/requests/${urgent}`,'response-acknowledged')
      await capture(page,h,`/app/requests/${paused}`,'response-resumed')
      await capture(page,h,'/app/automation','response-automation')
    }
    await h.api('request.clock',cookie.lead,{request:routine,revision:1,kind:'pause',reason:'Private access detail'})
    if(process.env.REQUEST_SCREENSHOTS)await capture(page,h,`/app/requests/${routine}`,'response-paused')
    await h.api('request.erase',cookie.owner,{request:routine,version:(await detail(routine)).version,confirm:true})
    assert.equal((await detail(routine)).clock,null)
    assert.equal(JSON.parse((await h.api('audit?action=request.clock',cookie.owner)).rows.find(e=>e.subject===routine).detail).reason,undefined)
    // A retained policy grants no right to a recipient whose access changes.
    await h.api('request.responsePolicy',cookie.owner,{...policy,urgency:'high',afterHours:'elapsed',acknowledgmentMinutes:1,resolutionMinutes:1})
    await h.api('access.role',cookie.owner,{member:lead,role:'maintainer'})
    for(const door of ['/api/gasket/request-response','/app/request-response','/app/requests'])assert.equal((await h.raw(door,{cookie:cookie.lead})).status,403)
    await h.scheduled('*/15 * * * *')
    assert.equal((await h.api(`requests/${unconfigured}`,cookie.owner)).clock,null)
    // Create under the retained policy through the current worker after its restart.
    const deniedPayload={...payload,urgency:'high',submissionKey:randomUUID(),description:'synthetic-gasket-denied-recipient'}
    assert.equal((await h.raw(`/request/${portal}`,{cookie:cookie.tech,body:deniedPayload})).status,303)
    const denied=(await h.api('requests',cookie.owner)).find(r=>r.description===deniedPayload.description).id
    await advance('2026-10-27T14:35:00Z')
    await h.scheduled('*/15 * * * *')
    assert.equal((await h.api(`requests/${denied}`,cookie.owner)).clock.notices.length,0,'demoted recipient receives no escalation')
    await h.api('request.responsePolicy',cookie.owner,{...policy,escalation:lead},400)
    await h.api('access.role',cookie.owner,{member:lead,role:'lead'})
    await h.api('access.end',cookie.owner,{member:lead})
    await h.scheduled('*/15 * * * *')
    assert.equal((await h.api(`requests/${denied}`,cookie.owner)).clock.notices.length,0,'inactive recipient receives no escalation')
    await h.api('request.responsePolicy',cookie.owner,{...policy,escalation:lead},400)
    for(const mail of h.mails)assert.ok(!JSON.stringify(mail).includes(deniedPayload.description),'no request field leaks into outbound mail')
    assert.equal((await h.raw('/api/gasket/request-response',{cookie:cookie.lead})).status,401)
    for(const door of ['/app/request-response','/app/requests'])assert.equal((await h.raw(door,{cookie:cookie.lead})).status,303)
    console.log('REQ-005 requestResponseJourney: priority clocks, holiday, after-hours, retained policy, accountable escalation, reasoned pause and resume, acknowledgment, resolution, grant controls, replay, erasure and responsive public doors passed')
  } finally {await context?.close();await browser?.close();await h.close();await f.h.close()}
}

export async function strategyRolloutJourney() {
  const f=await requestFixture({clockInstant:Date.parse('2026-10-23T16:00:00Z')}),{h,cookie}=f
  let browser,context
  try {
    const original=(await h.api('checklist.create',cookie.lead,{name:'Existing compressor procedure',items:['Existing guard inspection']})).id
    const assets=[],schedules=[]
    for(let index=0;index<2;index++) {
      assets.push((await h.api('asset.create',cookie.lead,{tag:`CMP-${index}`,name:`Synthetic compressor ${index}`,location:'Assembly',category:'Air compressor'})).id)
      schedules.push((await h.api('schedule.create',cookie.lead,{asset:assets[index],checklist:original,title:`Compressor ${index} preventive check`,everyDays:30,firstDue:'2026-10-23'})).id)
    }
    const issued=(await h.api('workorders.generate',cookie.lead,{})).created
    assert.equal(issued.length,2)
    const issuedBefore=await Promise.all(issued.map(w=>h.api(`work/${w.id}`,cookie.lead)))
    const library=(await h.api('pm-strategies',cookie.lead)).library
    const template=library.find(t=>t.id==='air-compressor')
    const payload={template:template.id,name:'Compressor strategy',category:'Air compressor'}
    await h.api('pm.copy',cookie.agent,payload,403)
    const strategy=(await h.api('pm.copy',cookie.lead,payload)).id
    const current=async()=> (await h.api('pm-strategies',cookie.lead)).strategies.find(s=>s.id===strategy)
    let revision=await current()
    assert.equal(revision.library_key,template.id);assert.equal(revision.library_version,template.version)
    await h.api('pm.approve',cookie.owner,{strategy,revision:revision.revision_id,reason:'Unadapted'},409)
    await h.api('pm.preview',cookie.lead,{strategy,schedules},409)
    const steps=[...JSON.parse(revision.items_json).map(s=>s.text),'Record the site-specific drain inspection']
    await h.api('pm.adapt',cookie.lead,{strategy,number:revision.number,items:steps,everyDays:14,reference:'Synthetic equipment manual revision 1 and site isolation procedure',note:'Adapt to equipment and site'})
    revision=await current()
    const author=(await h.api('me',cookie.lead)).id
    await h.api('access.role',cookie.owner,{member:author,role:'supervisor'})
    await h.api('pm.approve',cookie.lead,{strategy,revision:revision.revision_id,reason:'Self approval'},409)
    await h.api('access.role',cookie.owner,{member:author,role:'lead'})
    await h.api('pm.approve',cookie.owner,{strategy,revision:revision.revision_id,reason:'Reviewed isolation and manufacturer instructions'})
    const dueBefore=(await h.api('schedules',cookie.lead)).filter(s=>schedules.includes(s.id)).map(s=>[s.id,s.next_due_date])
    let preview=await h.api('pm.preview',cookie.lead,{strategy,schedules})
    assert.equal((await h.api('pm-strategies',cookie.lead)).rollouts.length,0,'preview does not create rollout records')
    assert.ok(preview.rows.every(r=>r.issued.length===1&&r.current.everyDays===30&&r.proposed.everyDays===14))
    await h.api('access.role',cookie.owner,{member:author,role:'supervisor'})
    await h.api('pm.rollout',cookie.lead,{strategy,schedules,hash:preview.hash,occurrencePlan:'preserve_issued_and_due'},409)
    await h.api('access.role',cookie.owner,{member:author,role:'lead'})
    preview=await h.api('pm.preview',cookie.lead,{strategy,schedules})
    await h.api('pm.rollout',cookie.owner,{strategy,schedules,hash:preview.hash,occurrencePlan:'cancel'},400)
    await h.api('pm.rollout',cookie.owner,{strategy,schedules,hash:preview.hash,occurrencePlan:'preserve_issued_and_due'})
    let rows=await h.api('schedules',cookie.lead)
    assert.deepEqual(rows.filter(s=>schedules.includes(s.id)).map(s=>[s.id,s.next_due_date]),dueBefore,'rollout preserves due occurrences')
    assert.ok(schedules.every(id=>rows.find(s=>s.id===id).every_days===14))
    assert.deepEqual(await Promise.all(issued.map(w=>h.api(`work/${w.id}`,cookie.lead))),issuedBefore,'rollout leaves every issued-work field unchanged')
    // A local interval and procedure override are retained when the next
    // program changes another field; conflicting edits demand a local decision.
    let local=rows.find(s=>s.id===schedules[1])
    await h.api('schedule.edit',cookie.lead,{schedule:local.id,revision:local.revision,everyDays:10})
    const adapted=JSON.parse((await current()).items_json).map(s=>s.text)
    await h.api('pm.adapt',cookie.lead,{strategy,number:(await current()).number,items:[...adapted,'Inspect additional OEM guard'],everyDays:14,reference:'Synthetic manual revision 2',note:'Add a guard inspection; retain local interval'})
    await h.api('pm.approve',cookie.owner,{strategy,revision:(await current()).revision_id,reason:'Independent safety review of added guard'})
    const preserve=await h.api('pm.preview',cookie.lead,{strategy,schedules})
    assert.deepEqual(preserve.rows[1].conflicts,[]);assert.equal(preserve.rows[1].merged.everyDays,10)
    await h.api('pm.rollout',cookie.owner,{strategy,schedules,hash:preserve.hash,occurrencePlan:'preserve_issued_and_due'})
    local=(await h.api('schedules',cookie.lead)).find(s=>s.id===schedules[1])
    assert.equal(local.every_days,10)
    await h.api('pm.adapt',cookie.lead,{strategy,number:(await current()).number,items:JSON.parse((await current()).items_json).map(s=>s.text),everyDays:7,reference:'Synthetic manual revision 3',note:'Revise preventive interval'})
    await h.api('pm.approve',cookie.owner,{strategy,revision:(await current()).revision_id,reason:'Independent interval review'})
    const conflict=await h.api('pm.preview',cookie.lead,{strategy,schedules})
    assert.deepEqual(conflict.rows[1].conflicts,['everyDays'])
    await h.api('pm.rollout',cookie.owner,{strategy,schedules,hash:conflict.hash,occurrencePlan:'preserve_issued_and_due',decisions:{}},409)
    ;({browser,context}=await browserContext(h,cookie.owner));const page=await context.newPage()
    const query=new URLSearchParams({strategy});for(const id of schedules)query.append('schedules',id)
    if(process.env.REQUEST_SCREENSHOTS) {
      await mkdir(process.env.REQUEST_SCREENSHOTS,{recursive:true})
      await capture(page,h,`/app/schedules?${query}`,'strategy-conflict')
    }
    const decisions={[schedules[1]]:{choice:'keep_local',reason:'Local duty cycle requires the retained 10-day interval; explicitly reviewed'}}
    await h.api('pm.rollout',cookie.owner,{strategy,schedules,hash:conflict.hash,occurrencePlan:'preserve_issued_and_due',decisions})
    rows=await h.api('schedules',cookie.lead)
    assert.equal(rows.find(s=>s.id===schedules[0]).every_days,7);assert.equal(rows.find(s=>s.id===schedules[1]).every_days,10)
    assert.deepEqual(await Promise.all(issued.map(w=>h.api(`work/${w.id}`,cookie.lead))),issuedBefore)
    const history=await h.api('pm-strategies',cookie.owner)
    const retained=JSON.parse(history.rollouts.at(-1).preview_json)
    assert.match(retained.approvalDigest,/^[a-f0-9]{64}$/)
    const {approvalDigest,...approvedPreview}=retained
    assert.equal(approvalDigest,createHash('sha256').update(JSON.stringify({preview:approvedPreview,decisions:JSON.parse(history.rollouts.at(-1).decisions_json),occurrencePlan:history.rollouts.at(-1).occurrence_plan})).digest('hex'),'digest binds the exact preview, both conflict sides, decisions and plans')
    await h.api('pm.rollout',cookie.owner,{strategy,schedules,hash:conflict.hash,occurrencePlan:'preserve_issued_and_due',decisions:{[schedules[1]]:{choice:'use_program',reason:'Changed after approval'}}},409)
    assert.equal(history.rollouts.at(-1).applied_by,(await h.api('me',cookie.owner)).id)
    assert.equal(retained.rows[1].current.everyDays,10);assert.equal(retained.rows[1].proposed.everyDays,7)
    const approvalAudit=(await h.api('audit?action=pm.rollout',cookie.owner)).rows.find(r=>r.subject===strategy)
    assert.equal(JSON.parse(approvalAudit.detail).digest,retained.approvalDigest)
    assert.equal(JSON.parse(history.rollouts.at(-1).decisions_json)[schedules[1]].reason,decisions[schedules[1]].reason)
    const tech=(await h.api('me',cookie.tech)).id,oldIssued=issued.find(w=>w.schedule===schedules[0]).id
    await h.api('workorder.assign',cookie.lead,{workOrder:oldIssued,assignee:tech})
    await h.api('workorder.results',cookie.tech,{workOrder:oldIssued,item:['0'],outcome:['pass'],note:['Original issued procedure completed']})
    await h.api('workorder.submit',cookie.tech,{workOrder:oldIssued,version:(await h.api(`work/${oldIssued}`,cookie.tech)).version})
    await h.api('workorder.review',cookie.owner,{workOrder:oldIssued,version:(await h.api(`work/${oldIssued}`,cookie.owner)).version,decision:'approve'})
    const future=(await h.api('workorders.generate',cookie.lead,{})).created.find(w=>w.schedule===schedules[0])
    assert.ok(future,'the next occurrence is issued through the ordinary generation door')
    const nextWork=await h.api(`work/${future.id}`,cookie.lead)
    assert.equal(nextWork.due_date,'2026-10-30')
    assert.deepEqual(nextWork.items.map(i=>i.text),JSON.parse((await current()).items_json).map(i=>i.text),'future work uses the approved rollout procedure')
    assert.notEqual(nextWork.checklist_revision_id,issuedBefore[0].checklist_revision_id)
    // Procedure rollout also covers non-calendar meters without rewriting their
    // independently configured trigger or due occurrence.
    const meter=(await h.api('meter.create',cookie.lead,{asset:assets[0],name:'Synthetic hours',unit:'h',kind:'counter'})).id
    const metered=(await h.api('schedule.create',cookie.lead,{asset:assets[0],checklist:original,title:'Synthetic meter service',meter,everyUnits:'500',firstDueMeter:'500'})).id
    const meterBefore=(await h.api('schedules',cookie.lead)).find(s=>s.id===metered)
    const meterPreview=await h.api('pm.preview',cookie.lead,{strategy,schedules:[metered]})
    assert.equal(meterPreview.rows[0].proposed.everyDays,null)
    assert.equal(meterPreview.rows[0].trigger.nextDueMeter,'500')
    await h.api('pm.rollout',cookie.owner,{strategy,schedules:[metered],hash:meterPreview.hash,occurrencePlan:'preserve_issued_and_due'})
    const meterAfter=(await h.api('schedules',cookie.lead)).find(s=>s.id===metered)
    for(const key of ['meter_id','every_units','next_due_meter','next_due_date','trigger_when','trigger_value','reset_value','sustain_minutes','combine'])assert.equal(meterAfter[key],meterBefore[key],`non-calendar rollout preserves ${key}`)
    assert.notEqual(meterAfter.checklist,meterBefore.checklist)
    const installed=await h.api('pm.preview',cookie.lead,{strategy,schedules:[metered]})
    assert.deepEqual(installed.rows[0].current.items,JSON.parse((await current()).items_json),'meter schedule uses the approved strategy procedure')
    const stale=await h.api('pm.preview',cookie.lead,{strategy,schedules})
    local=rows.find(s=>s.id===schedules[1])
    await h.api('schedule.edit',cookie.lead,{schedule:local.id,revision:local.revision,everyDays:9})
    await h.api('pm.rollout',cookie.owner,{strategy,schedules,hash:stale.hash,occurrencePlan:'preserve_issued_and_due',decisions},409)
    // Existing OEM bounds apply even when the selected conflict decision would
    // otherwise preserve a local interval.
    await h.api('interval.limit',cookie.lead,{schedule:schedules[0],source:'oem',revision:0,minDays:14,maxDays:60,reference:'Synthetic minimum maintenance interval'})
    const bounded=await h.api('pm.preview',cookie.lead,{strategy,schedules})
    await h.api('pm.rollout',cookie.owner,{strategy,schedules,hash:bounded.hash,occurrencePlan:'preserve_issued_and_due',decisions},409)
    if(process.env.REQUEST_SCREENSHOTS)await capture(page,h,'/app/schedules','strategy-retained')
    console.log('PM-007 strategyRolloutJourney: copied library provenance, adaptation, independent approval, source-bound current-site rollout, local override merge and conflict, declared bounds, stale refusal and unchanged issued work passed')
  } finally {await context?.close();await browser?.close();await h.close()}
}
