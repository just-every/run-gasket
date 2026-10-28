// One sanity journey through preference, portal, decoded QR, submission and catalog doors.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { requestFixture, browserContext, decodeSymbol } from './requests.mjs'
import { png } from './fixtures.mjs'

export async function languageJourney() {
  const f=await requestFixture(),{h,cookie,portal,target,asset,payload}=f
  let browser,context
  const formPath='/request/'+portal,scoped=formPath+'?target='+target
  const text=async(path,options)=>await (await h.raw(path,options)).text()
  const download=async(who,status=200)=>{
    const response=await h.raw('/app/settings/language/catalog.json',{cookie:who})
    assert.equal(response.status,status)
    if(status===200){assert.match(response.headers.get('content-disposition'),/^attachment/);return response.json()}
  }
  try {
    assert.deepEqual(await h.api('languages',cookie.tech),{organization:'en-US',preference:null,effective:'en-US'})
    await h.submit('language.default',cookie.owner,{locale:'es-US'},'/app/settings/language')
    assert.equal((await h.api('languages',cookie.tech)).effective,'es-US')
    await h.submit('language.preference',cookie.lead,{locale:'en-US'},'/app/settings/language')
    await h.api('language.preference',cookie.tech,{locale:'es-US'})
    const tech=await h.api('me',cookie.tech),lead=await h.api('me',cookie.lead)
    await h.api('language.preference',cookie.tech,{locale:'en-US',member:lead.id},400)
    await h.api('language.preference',cookie.owner,{locale:'en-US',member:tech.id},400)
    await h.api('language.default',cookie.lead,{locale:'en-US'},403)
    await h.api('language.default',cookie.tech,{locale:'en-US'},403)
    await h.api('language.preference',cookie.agent,{locale:'es-US'},403)
    await h.api('language.preference',undefined,{locale:'es-US'},401)
    await h.api('language.preference',cookie.tech,{locale:'ar'},400)
    assert.deepEqual(await h.api('languages',cookie.lead),{organization:'es-US',preference:'en-US',effective:'en-US'})
    assert.equal((await h.api('languages',cookie.tech)).effective,'es-US')
    await h.api('language.default',cookie.owner,{locale:'en-US'})
    for(const path of [formPath,scoped]){
      const spanish=await text(path,{cookie:cookie.tech}),english=await text(path,{cookie:cookie.lead})
      assert.match(spanish,/<html lang="es-US"/);assert.match(spanish,/<button type="submit">Enviar solicitud<\/button>/)
      assert.match(english,/<html lang="en-US"/);assert.match(english,/<button type="submit">Send request<\/button>/)
      for(const authored of ['Is the line stopped?','Gauge reading']) {
        assert.ok(spanish.includes(authored),'authored field labels are not translated')
      }
    }
    assert.equal((await h.raw(scoped+'&language=es-US')).status,303,'switching does not open authenticated intake')
    await h.api('request.portal',cookie.owner,{portal,revision:1,name:'Assembly fault report',mode:'public',publicConsent:true})
    assert.match(await text(scoped,{headers:{'accept-language':'es-MX;q=0.9,en-US;q=0.5'}}),/<html lang="es-US"/)
    assert.match(await text(scoped,{headers:{'accept-language':'es;q=0,en-US;q=0.5'}}),/<html lang="en-US"/)
    await h.api('language.default',cookie.owner,{locale:'es-US'})
    assert.match(await text(scoped,{headers:{'accept-language':'fr'}}),/<html lang="es-US"/,'unsupported browser language uses site default')
    await h.api('language.default',cookie.owner,{locale:'en-US'})
    const switched=await h.raw(scoped+'&language=es-US')
    assert.match(switched.headers.get('set-cookie'),/^gasket-language=es-US;/)
    assert.equal((await h.raw('/api/gasket/requests',{cookie:'gasket-language=es-US'})).status,401,'preference cookie grants no identity')
    await download(cookie.tech,403);await download(undefined,303)
    const complete=await download(cookie.owner)
    assert.deepEqual(complete.languages.map(l=>l.missing),[[],[]])
    assert.ok(complete.languages.every(l=>l.translated===l.total && l.total>0))
    await h.api('language.catalog',cookie.lead,{key:'send',value:''},403)
    await h.submit('language.catalog',cookie.owner,{key:'send',value:''},'/app/settings/language')
    const incomplete=await download(cookie.owner)
    assert.deepEqual(incomplete.languages.find(l=>l.locale==='es-US').missing,['send'])
    for(const path of [formPath,scoped])assert.match(await text(path,{cookie:'gasket-language=es-US'}),/<button type="submit">Send request \[Sin traducir: inglés\]<\/button>/)
    await h.api('language.catalog',cookie.owner,{key:'send',reset:true})
    assert.deepEqual((await download(cookie.owner)).languages.map(l=>l.missing),[[],[]])
    // The non-script failure page retains authored entries and localized recovery guidance.
    const retained=new FormData()
    for(const [name,value] of Object.entries({...payload,field_stopped:''}))retained.append(name,value && typeof value==='object'?new File([Buffer.from(value.base64,'base64')],value.filename,{type:value.type}):value)
    const rejected=await h.raw(formPath,{cookie:'gasket-language=es-US',form:retained})
    assert.equal(rejected.status,400)
    const recovery=await rejected.text()


    assert.equal((await h.api('requests',cookie.lead)).length,0)

    const signed=await browserContext(h,cookie.lead)
    let scanned
    try {
      await signed.page.goto(h.origin+'/app/labels?target='+target)
      const retainedValues=await signed.page.evaluate(html=>{
        const document=new DOMParser().parseFromString(html,'text/html')
        return {alert:document.querySelector('#save-error').textContent,description:document.querySelector('[name=description]').value,detail:document.querySelector('[name=field_detail]').value,files:JSON.parse(document.querySelector('[name=__gk_files]').value)}
      },recovery)
      assert.match(retainedValues.alert,/Complete todos los campos obligatorios/);assert.match(retainedValues.alert,/Sus datos siguen en este formulario/)
      assert.equal(retainedValues.description,payload.description)
      assert.equal(retainedValues.detail,'Night shift <unaltered>')
      assert.equal(retainedValues.files.length,2)
      for(const file of retainedValues.files)assert.deepEqual(Buffer.from(file.base64,'base64'),png)
      scanned=await decodeSymbol(signed.page,'.gk-label-qr svg','QR_CODE')
      assert.equal(new URL(scanned).pathname,'/scan/'+target)
    } finally {await signed.context.close();await signed.browser.close()}
    ;({browser,context}=await browserContext(h))
    let page=await context.newPage()
    await page.setViewportSize({width:1440,height:1100})
    await page.goto(h.origin+formPath)
    await page.getByRole('link',{name:'Español (EE. UU.)',exact:true}).click()
    assert.equal(await page.locator('html').getAttribute('lang'),'es-US')
    assert.equal(await page.getByRole('button',{name:'Enviar solicitud',exact:true}).count(),1)
    await page.goto(scanned)
    assert.equal(new URL(page.url()).pathname,formPath)
    assert.equal(await page.locator('html').getAttribute('lang'),'es-US','explicit choice follows the decoded label')
    await page.getByRole('button',{name:'Enviar solicitud',exact:true}).click()
    assert.equal(await page.locator('[name=description]').evaluate(n=>n.validationMessage),'Complete este campo obligatorio.')
    const authored='Fuga <sin traducir> · 12.50 psi · $15.00'
    await page.locator('[name=description]').fill(authored)
    await page.locator('[name=contact]').fill('Turno nocturno 22')
    await page.locator('[name=field_stopped]').selectOption('Yes')
    await page.locator('[name=field_reading]').fill('12.50')
    await page.locator('[name=field_noticed]').fill('2026-10-22')
    await page.locator('[name=field_detail]').fill('Night shift <unaltered>')
    await page.locator('[name=photo]').setInputFiles({name:'synthetic-gasket-1.png',mimeType:'image/png',buffer:png})
    await page.getByRole('button',{name:'Guardar borrador',exact:true}).click()
    await page.locator('#draft-status').filter({hasText:'Seleccione el almacenamiento'}).waitFor()
    await page.getByLabel('Guardar este borrador y las fotos en este dispositivo privado',{exact:true}).check()
    await page.getByRole('button',{name:'Guardar borrador',exact:true}).click()
    await page.locator('#draft-status').filter({hasText:'Borrador guardado'}).waitFor()
    const key=await page.locator('[name=submissionKey]').inputValue()
    await page.goto(h.origin+formPath)
    assert.equal(await page.locator('[name=contact]').inputValue(),'','portal and scoped draft contents are isolated')
    await page.goto(scanned)
    await page.locator('#draft-status').filter({hasText:'Se recuperó el borrador'}).waitFor()
    assert.equal(await page.locator('[name=submissionKey]').inputValue(),key)
    assert.equal(await page.locator('[name=description]').inputValue(),authored)
    await page.getByRole('link',{name:'English (US)',exact:true}).click()
    await page.locator('#draft-status').filter({hasText:'Saved draft restored'}).waitFor()
    assert.equal(await page.locator('[name=description]').inputValue(),authored)
    await page.getByRole('link',{name:'Español (EE. UU.)',exact:true}).click()
    await page.locator('#draft-status').filter({hasText:'Se recuperó el borrador'}).waitFor()
    assert.equal(await page.locator('[name=photo]').evaluate(n=>n.files[0].name),'synthetic-gasket-1.png')
    const screenshots=process.env.LANGUAGE_SCREENSHOTS
    const capture=async(name,screen=page)=>{
      if(!screenshots)return
      await mkdir(screenshots,{recursive:true})
      for(const width of [1440,390]){
        await screen.setViewportSize({width,height:1100})
        await screen.screenshot({path:screenshots+'/'+name+'-'+width+'.png',fullPage:true})
      }
      await screen.setViewportSize({width:1440,height:1100})
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    const unlabelled=await page.locator('button,a,[role=button]').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&!n.querySelector('img[alt]')&&!n.getAttribute('data-tooltip')).map(n=>n.outerHTML))
    assert.deepEqual(unlabelled,[])
    await capture('spanish-scoped-draft')
    await context.setOffline(true)
    await page.getByRole('button',{name:'Enviar solicitud',exact:true}).click()
    await page.getByRole('alert').filter({hasText:'Sin confirmar'}).waitFor()
    assert.match(await page.getByRole('alert').textContent(),/Vuelva a conectarse.*Se conserva|Se conserva.*Vuelva a conectarse/)
    assert.equal((await h.api('requests',cookie.lead)).length,0)
    await capture('spanish-retry')
    await context.setOffline(false)
    let lost=false
    await page.route('**/request/'+portal,async route=>{
      if(route.request().method()==='POST'&&!lost){lost=true;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed')}
      else await route.continue()
    })
    await page.getByRole('button',{name:'Enviar solicitud',exact:true}).click()
    await page.getByRole('alert').filter({hasText:'Sin confirmar'}).waitFor()
    assert.equal((await h.api('requests',cookie.lead)).length,1)
    await Promise.all([page.waitForURL('**/received/'+key),page.getByRole('button',{name:'Enviar solicitud',exact:true}).click()])
    assert.match(await page.getByRole('status').textContent(),/La solicitud R-1 está guardada/)
    await capture('spanish-confirmation')
    const rows=await h.api('requests',cookie.lead),record=await h.api('requests/'+rows[0].id,cookie.lead)
    assert.equal(rows.length,1);assert.equal(record.asset_id,asset);assert.equal(record.requester_id,null)
    assert.equal(record.description,authored)
    assert.deepEqual(record.answers,{stopped:'Yes',reading:'12.50',noticed:'2026-10-22',detail:'Night shift <unaltered>'})
    assert.equal(record.files[0].sha256,createHash('sha256').update(png).digest('hex'))
    assert.deepEqual(Buffer.from(await (await h.raw('/app/request-files/'+record.files[0].id,{cookie:cookie.lead})).arrayBuffer()),png)
    // A signed-in localized send keeps its human attribution and authored payload.
    const send=await h.raw(formPath,{cookie:cookie.tech,body:{...payload,submissionKey:randomUUID()}})
    assert.equal(send.status,303)
    const signedRecord=(await h.api('requests',cookie.lead)).find(r=>r.id!==record.id)
    assert.equal((await h.api('requests/'+signedRecord.id,cookie.lead)).requester_id,tech.id)
    const audit=(await h.api('audit?action=request.submit',cookie.owner)).rows.find(row=>row.subject===signedRecord.id)
    assert.equal(audit.actor,tech.id)
    await page.goto(scanned);await page.getByRole('link',{name:'Abrir confirmación',exact:true}).waitFor()
    assert.equal(await page.locator('[name=contact]').inputValue(),'')
    await page.goto(h.origin+formPath);await capture('spanish-portal')
    await h.api('language.catalog',cookie.owner,{key:'send',value:''})
    await page.reload()
    await page.getByRole('button',{name:'Send request [Sin traducir: inglés]',exact:true}).waitFor()
    await capture('visible-english-fallback')
    const settings=await browserContext(h,cookie.owner)
    try {
      await settings.page.setViewportSize({width:1440,height:1100})
      await settings.page.goto(h.origin+'/app/settings/language')
      const own=settings.page.locator('form[action="/app/do/language.preference"]')
      await own.locator('[name=locale]').selectOption('es-US')
      await own.getByRole('button',{name:'Save my language · Guardar mi idioma',exact:true}).click()
      await settings.page.getByRole('status').filter({hasText:'Saved.'}).waitFor()
      assert.equal((await h.api('languages',cookie.owner)).preference,'es-US')
      await capture('language-settings',settings.page)
    } finally {await settings.context.close();await settings.browser.close()}
    await h.api('language.catalog',cookie.owner,{key:'send',reset:true})
    await h.api('access.end',cookie.owner,{member:tech.id})
    await h.api('language.preference',cookie.tech,{locale:'en-US'},401)
    await h.api('language.default',cookie.tech,{locale:'en-US'},401)
    await h.api('languages',cookie.tech,undefined,401)
    await download(cookie.tech,303)
    assert.equal((await h.api('languages',cookie.lead)).preference,'en-US')
    console.log('Intake language preferences, authority refusals, catalog fallback, decoded QR draft recovery and unchanged exactly-once capture passed')
  } finally {await context?.close();await browser?.close();await h.close()}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await languageJourney()
