// Operator intake through the built Worker's HTTP doors; no direct DB writes.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness, file } from './harness.mjs'
import { png } from './fixtures.mjs'

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
  const payload={submissionKey:randomUUID(),target,description:'Noisy motor at startup',urgency:'high',contact:'Operator at extension 22',field_stopped:'Yes',field_reading:'12.50',field_noticed:'2026-10-22',field_detail:'Night shift <unaltered>',photo:file('leak.png',png,'image/png'),field_nameplate:file('nameplate.png',png,'image/png')}
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
      const response=await h.raw(`/app/request-files/${photo.id}`,{cookie:cookie.tech})
      assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png)
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
    await h.api('request.portal',cookie.owner,{portal,revision:1,name:'Assembly fault report',mode:'public',publicConsent:true})
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
    assert.equal((await h.api('requests',cookie.lead)).length,5)
    if(process.env.REQUEST_SCREENSHOTS)await requestScreens(f,r.id)
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
if(process.argv[1]===fileURLToPath(import.meta.url)){const task=process.env.REQUEST_JOURNEY || 'portal';if(task==='portal')await requestPortalJourney();else if(task==='drafts')await requestDraftJourney();}

async function decodeSymbol(page,selector,format) {
  const {PNG}=await import('pngjs'),{RGBLuminanceSource,BinaryBitmap,HybridBinarizer,MultiFormatReader,DecodeHintType,BarcodeFormat}=await import('@zxing/library')
  const image=PNG.sync.read(await page.locator(selector).screenshot({scale:'device'}))
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
    console.log('REQ-002 decoded QR, camera photo, durable offline draft, lost-response retry, one original-mapped request and durable confirmation passed')
  } finally {await context?.close();await browser?.close();await h.close()}
}
