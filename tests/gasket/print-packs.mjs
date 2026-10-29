// A sanity journey through real issuance, downloads, preview and confirmed paper capture.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { file, harness } from './harness.mjs'
import { png } from './fixtures.mjs'

const sha=value=>createHash('sha256').update(value).digest('hex')
const address=name=>[name,'example.test'].join(String.fromCharCode(64))
const instant=Date.parse('2026-10-15T12:00:00Z')
export async function printPackFixture(h,owner,assignee,{rich=false}={}) {
  const label=randomUUID().slice(0,8),today=(await h.api('me',owner)).today
  const steps=rich?['Inspect guard','Describe the work | text','Measure clearance | number mm 0..10','Photograph fitted guard | photo','Choose condition | options Ready as authored, Inspect again | fail on Inspect again | when step 3 is pass']:['Inspect guard']
  const checklist=(await h.api('checklist.create',owner,{name:`Paper inspection ${label}`,items:steps})).id
  const instructions=rich?('Inspect without altering the authored instruction: válvula, 12 USD, 7 mm.\n'.repeat(22)).trim():'Keep the authored instruction: válvula, 12 USD, 7 mm.'
  const template=(await h.api('template.save',owner,{name:`Paper template ${label}`,title:'Synthetic paper inspection',instructions,checklist})).id
  const work=(await h.api('workorder.create',owner,{location:'Primary plant room',template,due:today,assignee})).id
  const detail=await h.api(`work/${work}`,owner)
  return {work,checklist,template,instructions,detail}
}
export function paperPayload(fixture,pack,performedOn) {
  const count=fixture.detail.items.length
  return {pack,workOrder:fixture.work,version:fixture.detail.version,submissionKey:randomUUID(),performedOn,
    outcome:Array.from({length:count},(_,i)=>i===0?'pass':''),value:Array.from({length:count},(_,i)=>i===1?'Authored paper result: válvula.':i===2?'5':i===4?'Ready as authored':''),
    note:Array.from({length:count},(_,i)=>i===0?'Original paper note.':''),original:file('synthetic-gasket-paper.png',png,['image','png'].join('/'))}
}
async function pdfText(bytes) {
  const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true}),pdf=await task.promise
  try {
    const pages=[]
    for(let n=1;n<=pdf.numPages;n++)pages.push((await (await pdf.getPage(n)).getTextContent()).items.map(item=>item.str??'').join(' '))
    return pages
  } finally {await task.destroy()}
}
export async function printPacksJourney() {
  let h=await harness({clockInstant:instant,formSaveFault:true})
  const installation=h.installation,vars=h.vars
  try {
    let owner=await h.owner()
    await h.api('site.configure',owner,{name:'Synthetic maintenance site',timezone:'UTC'})
    const people={},cookies={}
    for(const [key,role] of [['tech','maintainer'],['peer','maintainer'],['lead','lead'],['reviewer','supervisor'],['agent','agent']]) {
      people[key]=(await h.api('access.give',owner,{name:`Synthetic ${key}`,email:address(`synthetic-gasket-paper-${key}`),role})).id
      cookies[key]=await h.signIn(address(`synthetic-gasket-paper-${key}`))
    }
    const f=await printPackFixture(h,owner,people.tech,{rich:true})
    await h.api('rule.set',owner,{checklist:f.checklist,outcome:['fail'],severity:'medium',dueDays:2})
    await h.api('language.preference',cookies.tech,{locale:'es-US'})
    const issued=await h.api('printpack.issue',cookies.tech,{workOrder:f.work,version:1})
    const pack=await h.api(`print-packs/${issued.id}`,cookies.tech)
    assert.equal(pack.content.instructions,f.instructions)
    assert.deepEqual([pack.content.workVersion,pack.content.checklistNumber,pack.content.issuer,pack.content.locale],[1,1,people.tech,'es-US'])
    assert.equal(sha(JSON.stringify(pack.content)),pack.contentDigest)
    assert.deepEqual((await h.api(`work/${f.work}/print-packs`,cookies.tech)).map(row=>[row.id,row.issuer_name,row.issued_at,row.content_sha256]),[[issued.id,'Synthetic tech',instant,pack.contentDigest]],'the native work history exposes immutable issuance provenance')
    const pdfPath=`/app/print-packs/${issued.id}/pack.pdf`
    const response=await h.raw(pdfPath,{cookie:cookies.tech})
    assert.equal(response.status,200)
    assert.match(response.headers.get('cache-control'),/no-store/)
    const bytes=Buffer.from(await response.arrayBuffer())
    assert.equal(sha(bytes),pack.pdfDigest)
    const pages=await pdfText(bytes)
    assert.ok(pages.length>1,'long instructions really paginate')
    for(const page of pages) {
      assert.ok(page.includes(issued.id)&&page.includes(pack.content.workNumber),'every printed page identifies this pack and work')
      assert.ok(page.includes('Versión del trabajo 1')&&page.includes('Revisión de la lista 1'))
      assert.ok(page.includes(pack.contentDigest))
    }
    assert.ok(pages.join(' ').includes('válvula, 12 USD, 7 mm.'))
    assert.ok(pages.join(' ').includes('no concede acceso'))
    const spanishHints=['Aprobado, requiere atención o falló','Texto','Número en mm, de 0 a 10','Foto obligatoria','Una de: Ready as authored, Inspect again; falla: Inspect again; condición del paso 3: dentro de sus límites']
    for(const hint of spanishHints)assert.ok(pages.join(' ').replace(/\s/g,'').includes(hint.replace(/\s/g,'')),`the issued Spanish PDF explains ${hint} without translating authored choices`)
    const packPage=await (await h.raw(`/app/print-packs/${issued.id}`,{cookie:cookies.tech})).text()
    for(const hint of spanishHints)assert.ok(packPage.includes(hint),'Spanish online re-entry explains each supported checklist kind')
    await h.api('language.preference',cookies.tech,{locale:'en-US'})
    const englishPage=await (await h.raw(`/app/print-packs/${issued.id}`,{cookie:cookies.tech})).text()
    assert.ok(englishPage.includes('Number in mm, 0 to 10')&&englishPage.includes('only when step 3 is within its limits'))
    assert.deepEqual(Buffer.from(await (await h.raw(pdfPath,{cookie:cookies.tech})).arrayBuffer()),bytes,'a later display preference never changes issued printable content')
    await h.api('language.preference',cookies.tech,{locale:'es-US'})
    await h.api('checklist.revise',owner,{checklist:f.checklist,items:['Replacement instruction'],note:'New master revision'})
    await h.api('template.save',owner,{template:f.template,revision:1,name:(await h.api('templates',owner)).find(t=>t.id===f.template).name,title:'Replacement title',instructions:'Replacement instructions',checklist:f.checklist})
    assert.deepEqual(Buffer.from(await (await h.raw(pdfPath,{cookie:cookies.tech})).arrayBuffer()),bytes,'master edits never change issued printable bytes')
    assert.deepEqual((await h.api(`print-packs/${issued.id}`,cookies.tech)).content,pack.content)
    await nativePrintBrowser(h,cookies.tech,issued.id,pack,pages.length)
    const meterChecklist=(await h.api('checklist.create',owner,{name:'Synthetic meter-only checklist',items:['Read clearance | number mm | meter Clearance']})).id
    const meterTemplate=(await h.api('template.save',owner,{name:'Synthetic meter template',title:'Meter work',checklist:meterChecklist})).id
    const meterWork=(await h.api('workorder.create',owner,{location:'Plant',template:meterTemplate,due:'2026-10-15',assignee:people.tech})).id
    await h.api('printpack.issue',cookies.tech,{workOrder:meterWork,version:1},409)
    const payload=paperPayload(f,issued.id,'2026-10-15T10:30');payload.outcome[0]='fail'
    const invalid=await h.api('printpack.preview',cookies.tech,{...payload,performedOn:'2099-12-31T12:00'},400)
    assert.match(invalid.message,/Revise los resultados/)
    const preview=(await h.api('printpack.preview',cookies.tech,payload)).id
    assert.equal((await h.api('printpack.preview',cookies.tech,payload)).id,preview)
    await h.api('printpack.preview',cookies.tech,{...payload,note:payload.note.map((note,i)=>i===0?'changed':note)},409)
    await h.api('printpack.preview',cookies.tech,{...payload,original:file('synthetic-gasket-paper.png',Buffer.from('different paper'))},409)
    const draft=await h.api(`print-previews/${preview}`,cookies.tech)
    assert.equal(draft.originalDigest,sha(png));assert.equal(draft.payload.performedOn,'2026-10-15T10:30')
    assert.equal(draft.receipt,null)
    assert.deepEqual(await h.api(`work/${f.work}`,owner),f.detail,'preview changes no work results, evidence or follow-ups')
    assert.deepEqual(Buffer.from(await (await h.raw(`/app/print-previews/${preview}/original`,{cookie:cookies.tech})).arrayBuffer()),png)
    const acceptance={preview,digest:draft.digest,confirm:true}
    await h.api('printpack.accept',cookies.tech,{...acceptance,digest:'0'.repeat(64)},409)
    await h.api('printpack.accept',cookies.tech,{...acceptance,confirm:false},400)
    await h.api('printpack.accept',cookies.tech,{...acceptance,entrant:people.lead},400)
    h.setSaveFault('before')
    const refused=await h.raw('/app/do/printpack.accept',{cookie:cookies.tech,form:new URLSearchParams({preview,digest:draft.digest,confirm:'yes'}),headers:{accept:['application','json'].join('/')}})
    assert.equal(refused.status,500)
    assert.equal((await h.api(`print-previews/${preview}`,cookies.tech)).receipt,null)
    assert.deepEqual(await h.api(`work/${f.work}`,owner),f.detail,'a failed transaction retains no result, original, follow-up or receipt')
    // A retry identity never borrows another person's receipt or another action's result.
    for(const [member,expected] of [[owner,404],[cookies.tech,409]]) {
      const save=randomUUID()
      await h.raw('/app/do/language.preference',{cookie:member,form:new URLSearchParams({locale:member===owner?'en-US':'es-US',__gk_save:save,returnTo:'/app/settings/language'}),headers:{accept:['application','json'].join('/')}})
      const before=await (await h.raw(`/app/save-receipts/${save}`,{cookie:member,headers:{accept:['application','json'].join('/')}})).json()
      const forged=await h.raw('/app/do/printpack.accept',{cookie:cookies.tech,form:new URLSearchParams({preview,digest:draft.digest,confirm:'yes',__gk_save:save}),headers:{accept:['application','json'].join('/')}})
      assert.equal(forged.status,expected,'a paper retry cannot overwrite a foreign or differently bound save receipt')
      assert.deepEqual(await (await h.raw(`/app/save-receipts/${save}`,{cookie:member,headers:{accept:['application','json'].join('/')}})).json(),before)
      assert.equal((await h.api(`print-previews/${preview}`,cookies.tech)).receipt,null)
      assert.deepEqual(await h.api(`work/${f.work}`,owner),f.detail)
    }
    // Lose the reply after the actual transaction, then retry the same public form.
    h.setSaveFault('after')
    const form=new URLSearchParams({preview,digest:draft.digest,confirm:'yes',returnTo:`/app/print-previews/${preview}`,__gk_save:randomUUID()})
    const lost=await h.raw('/app/do/printpack.accept',{cookie:cookies.tech,form,headers:{accept:['application','json'].join('/')}})
    assert.equal(lost.status,500)
    const receipt=(await h.api(`print-previews/${preview}`,cookies.tech)).receipt
    assert.ok(receipt,'accepted provenance survives a lost response')
    const retry=await h.raw('/app/do/printpack.accept',{cookie:cookies.tech,form,headers:{accept:['application','json'].join('/')}})
    assert.equal(retry.status,200)
    const captured=await h.api(`work/${f.work}`,owner)
    assert.equal(captured.version,2);assert.equal(captured.status,'in_progress')
    assert.equal(captured.items[0].result.outcome,'fail');assert.equal(captured.items[1].result.value,payload.value[1])
    assert.equal(captured.evidence.length,1);assert.equal(captured.evidence[0].sha256,sha(png))
    assert.equal(captured.findings.length,1);assert.ok(captured.findings[0].follow_up_id)
    assert.deepEqual([receipt.entrant,receipt.performedOn,receipt.enteredAt,receipt.originalDigest],[people.tech,'2026-10-15T10:30',instant,sha(png)])
    assert.equal((await h.api('audit?action=printpack.accept',owner)).rows.length,1)
    const paperRetention=await h.api(`retention-preview?kind=attachment&id=${receipt.evidence}`,owner)
    assert.equal(paperRetention.eligible,false)
    assert.equal(paperRetention.dependencies.paperEntries,1)
    await h.api('attachment.erase',owner,{evidence:receipt.evidence,version:2,confirm:true},409)
    assert.deepEqual(Buffer.from(await (await h.raw(`/app/print-previews/${preview}/original`,{cookie:cookies.tech})).arrayBuffer()),png,'retained paper originals survive attachment erasure refusal')

    await h.api('workorder.submit',cookies.tech,{workOrder:f.work,version:2},409)
    assert.ok(captured.missing.some(message=>message.includes('photo')),'paper is not a step photo or a safety attestation')
    await h.api('printpack.preview',cookies.tech,{...payload,submissionKey:randomUUID()},409)
    const foreign=await printPackFixture(h,owner,people.tech)
    await h.api('printpack.preview',cookies.tech,{...payload,submissionKey:randomUUID(),workOrder:foreign.work},409)
    const optional=(await h.api('workorder.evidence',cookies.tech,{workOrder:foreign.work,version:1,file:file('synthetic-gasket-optional.png',png)})).evidence
    assert.equal((await h.api(`retention-preview?kind=attachment&id=${optional}`,owner)).eligible,true)
    await h.api('attachment.erase',owner,{evidence:optional,version:2,confirm:true})
    assert.equal((await h.raw(`/app/evidence/${optional}`,{cookie:owner})).status,404,'ordinary optional attachment erasure still completes')

    await h.api('printpack.preview',cookies.tech,{...payload,submissionKey:randomUUID(),version:2},409)
    await h.api('workorder.evidence',cookies.tech,{workOrder:f.work,version:2,item:3,file:file('synthetic-gasket-step.png',png)})
    await h.api('workorder.submit',cookies.tech,{workOrder:f.work,version:3})
    await h.api('workorder.review',cookies.tech,{workOrder:f.work,version:4,decision:'approve'},403)
    await h.api('workorder.review',cookies.reviewer,{workOrder:f.work,version:4,decision:'approve'})
    assert.match(await (await h.raw(`/app/work/${f.work}`,{cookie:cookies.tech})).text(),new RegExp(`/app/print-packs/${issued.id}`),'completed work keeps the controlled pack and provenance discoverable')
    const completed=await h.api(`work/${f.work}`,owner)
    assert.equal(completed.status,'closed');assert.equal(completed.reviews.length,1)
    await printBrowser(h,cookies.tech,owner,people.tech)
    const ownerWork=await printPackFixture(h,owner,(await h.api('me',owner)).id)
    const ownerPack=(await h.api('printpack.issue',owner,{workOrder:ownerWork.work,version:1})).id
    const ownerPreview=(await h.api('printpack.preview',owner,paperPayload(ownerWork,ownerPack,'2026-10-15T09:00'))).id
    const ownerDraft=await h.api(`print-previews/${ownerPreview}`,owner)
    await h.api('printpack.accept',owner,{preview:ownerPreview,digest:ownerDraft.digest,confirm:true})
    await h.api('workorder.submit',owner,{workOrder:ownerWork.work,version:2})
    await h.api('workorder.review',owner,{workOrder:ownerWork.work,version:3,decision:'approve'},403)
    await h.api('workorder.review',cookies.reviewer,{workOrder:ownerWork.work,version:3,decision:'approve'})
    assert.equal((await h.api(`work/${ownerWork.work}`,owner)).status,'closed','even an owner who enters paper results cannot self-review')


    // Worker restart reconciles the same receipt and never repeats effects.
    await h.stop();h=await harness({installation,vars,clockInstant:instant})
    owner=await h.signIn(vars.OWNER_EMAIL);cookies.tech=await h.signIn(address('synthetic-gasket-paper-tech'))
    assert.deepEqual((await h.api('printpack.accept',cookies.tech,acceptance)).receipt,receipt)
    assert.deepEqual(await h.api(`work/${f.work}`,owner),completed)
    await h.api('language.preference',cookies.tech,{locale:'en-US'})
    const active=await printPackFixture(h,owner,people.tech)
    const activePack=(await h.api('printpack.issue',cookies.tech,{workOrder:active.work,version:1})).id
    const activePayload=paperPayload(active,activePack,'2026-10-15T10:00')
    const activePreview=(await h.api('printpack.preview',cookies.tech,activePayload)).id
    const activeDraft=await h.api(`print-previews/${activePreview}`,cookies.tech)
    const doors=[`/api/gasket/print-packs/${activePack}`,`/app/print-packs/${activePack}`,`/app/print-packs/${activePack}/pack.pdf`,`/api/gasket/print-previews/${activePreview}`,`/app/print-previews/${activePreview}/original`]
    const refuse=async(cookie,headers={})=>{
      for(const path of doors) {
        const res=await h.raw(path,{cookie,headers});assert.ok([303,401,403,404,409].includes(res.status),`${path}: ${res.status}`)
        const text=await res.text();assert.ok(!text.includes(active.instructions)&&!text.includes(sha(png)),'no private paper content leaks')
      }
      for(const [action,body] of [['printpack.issue',{workOrder:active.work,version:1}],['printpack.preview',activePayload],['printpack.accept',{preview:activePreview,digest:activeDraft.digest,confirm:true}]]) {
        const res=await h.raw(`/api/gasket/${action}`,{cookie,headers,body});assert.ok([401,403,404,409].includes(res.status),`${action}: ${res.status}`)
      }
    }
    for(const cookie of [undefined,owner,cookies.peer,cookies.agent])await refuse(cookie)
    const service=await h.api('service.create',owner,{name:'Synthetic paper service',scopes:['work:read'],expiresAt:instant+86400000,consent:true})
    await refuse(undefined,{authorization:`Bearer ${service.token}`})
    const planned=(await h.api('site.create',owner,{name:'Planned paper site',timezone:'UTC'})).id
    await refuse(cookies.tech,{'x-gasket-site':planned})
    await h.api('workorder.assign',owner,{workOrder:active.work,assignee:people.peer})
    await refuse(cookies.tech)
    assert.equal((await h.api(`work/${active.work}`,owner)).evidence.length,0)
    await h.api('workorder.collaborate',owner,{workOrder:active.work,member:people.tech})
    assert.match(await (await h.raw(`/app/work/${active.work}`,{cookie:cookies.tech})).text(),/action="\/app\/do\/printpack.issue"/,'the collaborator has the same native print door')
    const v=(await h.api(`work/${active.work}`,owner)).version
    assert.equal((await h.api(`print-packs/${activePack}`,cookies.tech)).canEnter,false)
    await h.api('printpack.accept',cookies.tech,{preview:activePreview,digest:activeDraft.digest,confirm:true},409)
    const collaboratorPack=(await h.api('printpack.issue',cookies.tech,{workOrder:active.work,version:v})).id
    assert.equal((await h.api(`print-packs/${collaboratorPack}`,cookies.tech)).content.issuer,people.tech)
    await h.api('workorder.collaborate',owner,{workOrder:active.work,member:people.tech,remove:true})
    await refuse(cookies.tech)
    await h.api('workorder.assign',owner,{workOrder:active.work,assignee:people.tech})
    const session=await (await h.raw('/auth/session',{cookie:cookies.tech})).json()
    assert.equal((await h.raw('/auth/session/revoke',{cookie:owner,body:{sessionId:session.id}})).status,204)
    await refuse(cookies.tech)
    cookies.tech=await h.signIn(address('synthetic-gasket-paper-tech'))
    await h.api('site.membership',owner,{site:'primary',member:people.tech,status:'ended',manager:false,revision:1},409)
    await h.api('access.role',owner,{member:people.tech,role:'agent'})
    await refuse(cookies.tech)
    await h.api('access.role',owner,{member:people.tech,role:'maintainer'})
    assert.equal((await h.raw('/auth/signout',{cookie:cookies.tech,body:{}})).status,204)
    await refuse(cookies.tech)
    cookies.tech=await h.signIn(address('synthetic-gasket-paper-tech'))
    await h.api('access.end',owner,{member:people.tech})
    await refuse(cookies.tech)
    const erasure=await h.api(`record-erasure-preview?kind=user&id=${people.tech}`,owner)
    assert.equal(erasure.eligible,false);assert.ok(erasure.dependencies.gk_print_packs&&erasure.dependencies.gk_print_previews&&erasure.dependencies.gk_print_entries)
    await h.api('record.erase',owner,{kind:'user',id:people.tech,token:erasure.token,confirm:true},409)
    const workErasure=await h.api(`record-erasure-preview?kind=work&id=${f.work}`,owner)
    assert.equal(workErasure.eligible,false);assert.ok(workErasure.dependencies.gk_print_packs)
    assert.deepEqual(await h.api(`work/${f.work}`,owner),{...completed,labor:{...completed.labor,people:completed.labor.people.filter(person=>person.id!==people.tech)}},'ended people leave the active labor picker while refused erasure retains all server history')
    console.log('Controlled paper packs: immutable PDF, preview, atomic capture, retry, restart, current human authority and retained erasure dependencies passed')
  } finally {await h.stop();await installation.remove()}
}
async function nativePrintBrowser(h,cookie,id,pack) {
  const {chromium}=await import('@playwright/test')
  const browser=await chromium.launch({headless:true,...(process.env.GASKET_CHROMIUM?{executablePath:process.env.GASKET_CHROMIUM}:{}),args:['--no-sandbox']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
    await context.addCookies(cookie.split('; ').map(pair=>{const at=pair.indexOf('=');return{name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage();await page.goto(h.origin+`/app/print-packs/${id}/print`)
    assert.equal(await page.locator('.gk-paper-authored').allTextContents().then(lines=>lines.join('\n')),pack.content.instructions)
    assert.match(await page.locator('tbody').innerText(),/Número en mm, de 0 a 10/)
    assert.match(await page.locator('tbody').innerText(),/condición del paso 3: dentro de sus límites/)
    const printed=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true}),pages=await pdfText(printed)
    assert.ok(pages.length>1)
    for(const text of pages)assert.ok(text.includes(id)&&text.includes(pack.content.workNumber)&&text.includes('Versión del trabajo 1')&&text.includes('Revisión de la lista 1'))
    assert.ok(pages.join(' ').includes('Una de: Ready as authored, Inspect again'))
    if(process.env.PRINT_SCREENSHOTS) {
      await mkdir(process.env.PRINT_SCREENSHOTS,{recursive:true})
      await writeFile(`${process.env.PRINT_SCREENSHOTS}/typed-browser-print.pdf`,printed)
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:1000})
        await page.screenshot({path:`${process.env.PRINT_SCREENSHOTS}/typed-browser-print-${width}.png`,fullPage:true})
        await page.goto(h.origin+`/app/print-packs/${id}`)
        await page.screenshot({path:`${process.env.PRINT_SCREENSHOTS}/typed-paper-entry-${width}.png`,fullPage:true})
        await page.goto(h.origin+`/app/print-packs/${id}/print`)
      }
    }
    await context.close()
  }finally {await browser.close()}
}
async function printBrowser(h,cookie,owner,assignee) {
  const f=await printPackFixture(h,owner,assignee),directory=process.env.PRINT_SCREENSHOTS
  if(directory)await mkdir(directory,{recursive:true})
  const {chromium}=await import('@playwright/test')
  const browser=await chromium.launch({headless:true,...(process.env.GASKET_CHROMIUM?{executablePath:process.env.GASKET_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
  const contexts=[]
  try {
    let packPath,previewPath
    for(const width of [1440,390]) {
      const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}});contexts.push(context)
      await context.addCookies(cookie.split('; ').map(pair=>{const at=pair.indexOf('=');return{name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
      const page=await context.newPage()
      await page.goto(h.origin+`/app/work/${f.work}`)
      if(width===1440) {
        await page.getByRole('button',{name:'Emitir paquete impreso',exact:true}).click()
        await page.getByRole('heading',{name:'Paquetes de impresión controlados',level:1}).waitFor()
        packPath=new URL(page.url()).pathname
      } else await page.goto(h.origin+packPath)
      await page.evaluate(async()=>{await document.fonts.ready})
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`print form fits ${width}`)
      if(directory)await page.screenshot({path:`${directory}/print-pack-${width}.png`,fullPage:true})
      if(width===1440) {
        await page.getByLabel('Resultado',{exact:true}).selectOption('pass')
        await page.getByLabel('Nota',{exact:true}).fill('Authored browser paper note.')
        await page.getByLabel('Trabajo realizado a las (hora del sitio)',{exact:true}).fill('2026-10-15T10:00')
        await page.getByLabel('Original en papel',{exact:true}).setInputFiles({name:'synthetic-gasket-browser-paper.png',mimeType:['image','png'].join('/'),buffer:png})
        await page.getByLabel('Trabajo realizado a las (hora del sitio)',{exact:true}).fill('2099-12-31T12:00')
        await page.getByRole('button',{name:'Vista previa de la entrada',exact:true}).click()
        await page.getByRole('alert').filter({hasText:'Revise los resultados'}).waitFor()
        assert.equal(await page.getByLabel('Nota',{exact:true}).inputValue(),'Authored browser paper note.')
        await page.getByLabel('Trabajo realizado a las (hora del sitio)',{exact:true}).fill('2026-10-15T10:00')
        await page.getByRole('button',{name:'Vista previa de la entrada',exact:true}).click()
        await page.getByRole('heading',{name:'Vista previa de la entrada',level:1}).waitFor()
        previewPath=new URL(page.url()).pathname
        assert.match(await page.locator('main').innerText(),/Authored browser paper note\./)
        assert.equal((await h.api(`work/${f.work}`,owner)).evidence.length,0)
      }else await page.goto(h.origin+previewPath)
      if(directory)await page.screenshot({path:`${directory}/paper-preview-${width}.png`,fullPage:true})
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      if(width===1440)assert.equal(await page.locator('main').evaluate(el=>[...el.querySelectorAll('p,label,button,legend')].some(node=>parseFloat(getComputedStyle(node).fontSize)<13)),false)
    }
    const page=contexts[0].pages()[0]
    await page.getByRole('button',{name:'Aceptar entrada en papel',exact:true}).click()
    await page.getByRole('heading',{name:'Entrada en papel aceptada',level:1}).waitFor()
    assert.equal((await h.api(`work/${f.work}`,owner)).items[0].result.note,'Authored browser paper note.')
    for(const [index,width] of [1440,390].entries()) {
      const page=contexts[index].pages()[0];await page.goto(h.origin+previewPath)
      if(directory)await page.screenshot({path:`${directory}/paper-receipt-${width}.png`,fullPage:true})
    }
    // Use Chromium's actual print compositor on the native product print door.
    for(const [index,width] of [1440,390].entries()) {
      const sheet=await contexts[index].newPage()
      await sheet.goto(h.origin+packPath+'/print')
      await sheet.evaluate(async()=>{await document.fonts.ready})
      if(directory)await sheet.screenshot({path:`${directory}/browser-print-${width}.png`,fullPage:true})
      if(width===1440) {
        await sheet.emulateMedia({media:'print'})
        const printed=await sheet.pdf({format:'A4',printBackground:true,preferCSSPageSize:true})
        for(const text of await pdfText(printed))assert.ok(text.includes('Revisión de la lista 1')&&text.includes(packPath.split('/').pop()))
        if(directory)await writeFile(`${directory}/chromium-print.pdf`,printed)
      }
    }
  }finally {for(const context of contexts)await context.close();await browser.close()}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await printPacksJourney()
