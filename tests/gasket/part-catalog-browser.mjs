// PART-008: a lead receives a supplier box, reviews dependencies, approves and scans old numbers.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
export async function catalogBrowser(h,cookie) {
  const directory=process.env.CATALOG_SCREENSHOTS || `/tmp/gasket-catalog-${process.pid}`
  mkdirSync(directory,{recursive:true})
  const browser=await chromium.launch({headless:true,...(process.env.GASKET_CHROMIUM?{executablePath:process.env.GASKET_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  await context.addCookies(cookie.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
  const page=await context.newPage()
  async function capture(path,name,card) {
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1100})
      assert.equal((await page.goto(h.origin+path)).status(),200,`PART-008 ${name} opens`)
      await page.screenshot({path:`${directory}/${name}-${width}.png`,fullPage:true})
      assert.equal(await page.getByRole('main').count(),1)
      assert.ok(await page.getByRole('heading',{level:1}).count()>0)
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
      if(overflow) console.log('PART-008 overflow',await page.locator('body *').evaluateAll(elements=>elements.filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,id:el.id,class:el.className,width:el.getBoundingClientRect().width})).slice(0,20)))
      assert.equal(overflow,false,`PART-008 ${name} fits ${width}`)
      if(card) await page.locator(card).screenshot({path:`${directory}/${name}-detail-${width}.png`})
    }
  }
  return {close:()=>browser.close(),run:async({stage,source,canonical,supplier,csv})=>{
    if(stage==='import') {
      await context.clearCookies()
      await context.addCookies(cookie.owner.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
      await capture('/app/parts','catalog-import','#catalog-import')
      const form=page.locator('form[action="/app/parts/catalog-preview"]')
      await form.locator('[name=supplier]').selectOption(supplier)
      const before = await h.api('parts',cookie.owner)
      await form.locator('[name=file]').setInputFiles({name:'synthetic-gasket-1.csv',mimeType:['text','csv'].join('/'),buffer:Buffer.from('not a supplier catalog')})
      await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),form.getByRole('button',{name:'Review catalog'}).click()])
      assert.match(await page.getByRole('alert').innerText(),/Nothing was saved/)
      assert.equal(await form.locator('[name=supplier]').inputValue(),supplier)
      assert.match(await page.getByText('Kept attachment:',{exact:false}).innerText(),/synthetic-gasket-1.csv/)
      assert.deepEqual(await h.api('parts',cookie.owner),before,'a refused catalog preview creates no stock or part')
      for(const width of [1440,390]) {await page.setViewportSize({width,height:1100});await page.screenshot({path:`${directory}/catalog-refused-${width}.png`,fullPage:true})}
      await page.setViewportSize({width:1440,height:1100})
      const previewSaveId=await form.locator('[name=__gk_save]').inputValue()
      await form.locator('[name=file]').setInputFiles({name:'midwest.csv',mimeType:['text','csv'].join('/'),buffer:Buffer.from(csv)})
      await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),form.getByRole('button',{name:'Review catalog'}).click()])
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:1100})
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`PART-008 catalog review fits ${width}`)
        await page.screenshot({path:`${directory}/catalog-review-${width}.png`,fullPage:true})
      }
      const receiptResponse=await h.raw(`/app/save-receipts/${previewSaveId}`,{cookie:cookie.owner,headers:{accept:['application','json'].join('/')}})
      assert.equal((await receiptResponse.json()).batches,0,'a read-only catalog preview reports no persisted steps')
      const refused=new FormData()
      const fields=await page.locator('form[action="/app/do/catalog.apply"]').evaluate(el=>Object.fromEntries(new FormData(el)))
      for(const [name,value] of Object.entries({...fields,fingerprint:'synthetic-gasket-1',__gk_save:randomUUID()})) refused.set(name,value)
      const denial=await h.raw('/app/do/catalog.apply',{cookie:cookie.owner,form:refused,headers:{accept:['application','json'].join('/')}})
      assert.equal(denial.status,409)
      const denied=await denial.json()
      assert.match(denied.error,/Nothing was saved/)
      const refusedReceipt=await h.raw(denied.receipt,{cookie:cookie.owner,headers:{accept:['application','json'].join('/')}})
      assert.deepEqual(((row)=>[row.state,row.batches])(await refusedReceipt.json()),['failed',0],'snapshot reads before a refused apply must not look like saved work')
      await Promise.all([page.waitForURL(url=>url.pathname==='/app/parts'),page.getByRole('button',{name:'Apply reviewed catalog'}).click()])
      assert.equal(new URL(page.url()).searchParams.has('error'),false)
      await context.clearCookies()
      await context.addCookies(cookie.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
      return true
    }
    if(stage==='receive') {
      await capture('/app/parts','catalog-parts')
      await capture(`/app/parts/${canonical}`,'catalog-pack','#catalog')
      const form=page.locator('form[action="/app/do/catalog.receive"]')
      await form.locator('[name=quantity]').fill('2')
      await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Receive packs'}).click()])
      assert.equal(new URL(page.url()).searchParams.has('error'),false)
      return true
    }
    if(stage==='merge') {
      await capture(`/app/parts/${source}`,'catalog-source','#part-photos')
      await capture(`/app/parts/merge?source=${source}&canonical=${canonical}`,'catalog-merge')
      const form=page.locator('form[action="/app/do/part.merge.approve"]')
      await form.locator('[name=reason]').fill('Same manufacturer and stocking unit; retain conveyor serial restrictions')
      await Promise.all([page.waitForURL(url=>url.pathname===`/app/parts/${canonical}`),form.getByRole('button',{name:'Approve canonical merge'}).click()])
      assert.equal(new URL(page.url()).searchParams.has('error'),false)
      return true
    }
    if(stage==='done') {
      await capture(`/app/parts/${canonical}`,'catalog-canonical','#catalog')
      for(const number of ['CAT-EACH','CAT-BOX']) {
        await page.goto(h.origin+'/app/parts')
        const form=page.locator('form[method=get][action="/app/parts"]')
        await form.locator('[name=number]').fill(number)
        await Promise.all([page.waitForURL(url=>url.pathname===`/app/parts/${canonical}`),form.getByRole('button',{name:'Find part'}).click()])
        assert.equal(new URL(page.url()).pathname,`/app/parts/${canonical}`)
      }
    }
  }}
}
