import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
export async function intervalBrowser(h,cookie,proposal) {
  const directory = process.env.INTERVAL_SCREENSHOTS || `/tmp/gasket-workspace-${process.pid}`
  mkdirSync(directory,{recursive:true})
  const browser=await chromium.launch({headless:true,...(process.env.GASKET_CHROMIUM?{executablePath:process.env.GASKET_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return{name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    const capture=async name=>{for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1100});assert.equal((await page.goto(h.origin+'/app/proposals')).status(),200)
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
      if(overflow) console.log(await page.locator('body *').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width})).slice(0,15)))
      await page.screenshot({path:`${directory}/${name}-${width}.png`,fullPage:true})
      assert.equal(overflow,false,`AGENT-003 ${name} fits ${width}`)
    }}
    await capture('interval-pending')
    await page.locator('section.gk-card').filter({has:page.locator(`[name=proposal][value="${proposal.id}"]`)}).screenshot({path:`${directory}/interval-card-390.png`})
    const form=page.locator('form[action="/app/do/proposal.decide"]').filter({has:page.locator(`[name=proposal][value="${proposal.id}"]`)}).filter({has:page.locator('[name=decision][value=approve]')})
    await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Approve and run'}).click()])
    assert.equal(new URL(page.url()).searchParams.has('error'),false)
    assert.equal((await h.api('proposals',cookie.lead)).find(p=>p.id===proposal.id).status,'approved')
    await capture('interval-approved')
    await context.close()
    await workspaceBrowser(h,cookie,browser,directory)
  } finally {await browser.close()}
}

// ADMIN-011: all six implemented core doors, with actual edits and independent reads.
export async function workspaceBrowser(h, cookie, browser, directory) {
  const context = await browser.newContext({ignoreHTTPSErrors:true})
  const use = async who => {
    await context.clearCookies()
    await context.addCookies(cookie[who].split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
  }
  const page = await context.newPage()
  const day = (await h.api('me',cookie.owner)).today
  const technician = (await h.api('me',cookie.max)).id
  const longName = 'Production compressor with extended guarding and remote isolation at the west packaging mezzanine — '+ 'COMPRESSOR'.repeat(4)
  const asset = (await h.api('asset.create',cookie.lead,{tag:'ACCESS-011',name:longName,location:'West packaging mezzanine'})).id
  const portal = (await h.api('request.portal',cookie.owner,{name:'Accessible maintenance intake',fields:[]})).id
  const target = (await h.api('request.target',cookie.owner,{portal,kind:'asset',asset,name:longName,publishConsent:true})).id
  async function inspect(name) {
    assert.equal(await page.getByRole('main').count(),1,`${name} main landmark`)
    assert.equal(await page.getByRole('heading',{level:1}).count(),1,`${name} page heading`)
    assert.equal(await page.evaluate(()=>document.documentElement.lang),'en-US')
    const issues = await page.locator('input:not([type=hidden]),select,textarea,button,a[href]').evaluateAll(elements=>elements.filter(el=>el.getClientRects().length && !el.closest('[aria-hidden=true]')).flatMap(el=>{
      const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')?.split(' ').map(id=>document.getElementById(id)?.textContent).join(' ') || [...(el.labels||[])].map(l=>l.textContent).join(' ') || (el.matches('button,a')?el.textContent:'')
      return label?.trim()?[]:[el.outerHTML.slice(0,160)]
    }))
    assert.deepEqual(issues,[],`${name} controls have assistive names`)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} no horizontal clipping`)
    await page.keyboard.press('Tab')
    // The first keyboard stop is the visible skip link; Enter reaches main.
    assert.equal(await page.locator('.gk-skip').evaluate(el=>el===document.activeElement),true)
    assert.notEqual(await page.locator('.gk-skip').evaluate(el=>getComputedStyle(el).outlineStyle),'none')
    await page.keyboard.press('Enter')
    assert.equal(await page.getByRole('main').evaluate(el=>el===document.activeElement),true)
    await page.screenshot({path:`${directory}/workspace-${name}.png`,fullPage:true})
  }
  const open = async(path,name)=>{assert.equal((await page.goto(h.origin+path)).status(),200);await inspect(name)}
  const submit = async form => {
    await form.getByRole('button',{name:/./}).last().focus()
    await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),page.keyboard.press('Enter')])
    assert.match(await page.getByRole('status').first().innerText(),/Saved/)
  }
  try {
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1100})
      await use('owner')
      await open('/app/site',`setup-${width}`)
      const site = page.locator('form[action="/app/do/site.configure"]')
      const siteName = `Great Lakes maintenance workspace ${width}`
      await site.getByLabel('Site name',{exact:true}).fill(siteName)
      await submit(site)
      assert.equal((await h.api('site',cookie.owner)).name,siteName)
      if(width===390) {
        await page.locator('#gk-menu').focus();await page.keyboard.press('Space')
        assert.equal(await page.getByRole('navigation',{name:'Main',exact:true}).isVisible(),true,'phone menu opens by keyboard')
        await page.keyboard.press('Space')
        assert.equal(await page.getByRole('navigation',{name:'Main',exact:true}).isVisible(),false,'phone menu closes by keyboard')
      }
      await open(`/request/${portal}?target=${target}`,`intake-${width}`)
      assert.equal(await page.getByRole('heading',{name:longName,exact:true}).count(),1,'long target is readable')
      const fault=`Guard vibration at mezzanine ${width}`
      await page.getByLabel('What is wrong?').fill(fault)
      await page.getByLabel('Your name and contact').fill('Synthetic maintenance operator')
      await page.getByRole('button',{name:'Send request',exact:true}).focus()
      await Promise.all([page.waitForURL(/\/received\//),page.keyboard.press('Enter')])
      assert.match(await page.getByRole('status').innerText(),/saved/)
      assert.equal((await h.api('requests',cookie.lead)).filter(r=>r.description===fault&&r.asset_id===asset).length,1)
      const work=(await h.api('workorder.create',cookie.lead,{asset,title:`Inspect extended guard ${width}`,due:day,assignee:technician})).id
      if(width===1440) await h.api('planning.window',cookie.lead,{revision:(await h.api('planning',cookie.lead)).revision,member:technician,kind:'available',starts:`${day}T08:00`,ends:`${day}T17:00`,reason:'Explicit maintenance shift'})
      await use('lead')
      await open(`/app/planning?from=${day}&view=day`,`planning-${width}`)
      const preview=page.locator('#planning-preview')
      await preview.getByLabel('Work order',{exact:true}).selectOption(work)
      await preview.getByLabel('Starts',{exact:true}).fill(`${day}T${width===1440?'09':'11'}:00`)
      await preview.getByLabel('Ends',{exact:true}).fill(`${day}T${width===1440?'10':'12'}:00`)
      await preview.getByRole('button',{name:'Preview slot'}).focus()
      await Promise.all([page.waitForURL(url=>url.searchParams.get('workOrder')===work),page.keyboard.press('Enter')])
      assert.match(await page.locator('#slot-preview').innerText(),/Slot is schedulable/)
      await submit(page.locator('form[action="/app/do/planning.slot"]'))
      assert.equal((await h.api(`work/${work}`,cookie.lead)).id,work)
      await open('/app/stores',`stores-${width}`)
      await open(`/app/performance?from=${day}&to=${day}`,`reporting-${width}`)
      const report=page.locator('form[action="/app/performance"]')
      await report.getByLabel('From',{exact:true}).fill(day)
      await report.getByRole('button',{name:'Show',exact:true}).focus()
      await Promise.all([page.waitForURL(url=>url.searchParams.has('team')),page.keyboard.press('Enter')])
      assert.ok(await page.getByRole('table').count()>0,'report keeps table semantics')
      await use('max')
      await open(`/app/work/${work}`,`execution-${width}`)
      assert.equal(await page.getByRole('heading',{level:1}).innerText(),longName)
      assert.match(await page.getByRole('main').innerText(),new RegExp(`Inspect extended guard ${width}`))
      const time=page.locator('form[action="/app/do/workorder.time"]')
      await time.getByLabel('Minutes worked').fill('7')
      await time.getByLabel('Time note').fill(`Guard inspected ${width}`)
      await time.getByLabel('Worked on',{exact:true}).fill('2099-01-01')
      await time.getByRole('button',{name:'Record time'}).focus();await page.keyboard.press('Enter')
      const error=time.getByRole('alert')
      await error.waitFor()
      assert.match(await error.innerText(),new RegExp('Save not confirmed.*invalid worked on.*entries are still.*may already be saved','s'))
      assert.equal(await error.evaluate(el=>el===document.activeElement),true,'save error receives focus')
      assert.equal(await time.getByLabel('Time note').inputValue(),`Guard inspected ${width}`)
      assert.equal(await time.getByLabel('Minutes worked').inputValue(),'7')
      const confirmed=await context.newPage()
      await confirmed.goto(h.origin+`/app/work/${work}`);await confirmed.reload()
      assert.equal((await h.api(`work/${work}`,cookie.max)).timeEntries.length,0,'reloaded refused save did not persist')
      assert.equal(await confirmed.getByText(`Guard inspected ${width}`,{exact:true}).count(),0)
      await confirmed.close()
      await page.screenshot({path:`${directory}/workspace-refused-save-${width}.png`,fullPage:true})
      await time.getByLabel('Worked on',{exact:true}).fill(day)
      await submit(time)
      assert.deepEqual((await h.api(`work/${work}`,cookie.max)).timeEntries.map(t=>[t.minutes,t.note]),[[7,`Guard inspected ${width}`]])
      // Lose the response after a real write: the UI must not claim it was unsaved or retry it automatically.
      const again=page.locator('form[action="/app/do/workorder.time"]')
      await again.getByLabel('Minutes worked').fill('3');await again.getByLabel('Time note').fill(`Uncertain confirmation ${width}`)
      await page.route('**/app/do/workorder.time',async route=>{await route.fetch();await route.abort('failed')},{times:1})
      await again.getByRole('button',{name:'Record time'}).click()
      await again.getByRole('alert').waitFor()
      assert.match(await again.getByRole('alert').innerText(),new RegExp('connection ended.*may already be saved','s'))
      assert.equal(await again.getByLabel('Time note').inputValue(),`Uncertain confirmation ${width}`)
      const saved=await context.newPage();await saved.goto(h.origin+`/app/work/${work}`);await saved.reload()
      assert.deepEqual((await h.api(`work/${work}`,cookie.max)).timeEntries.map(t=>[t.minutes,t.note]).sort(),[[3,`Uncertain confirmation ${width}`],[7,`Guard inspected ${width}`]].sort(),'lost response persisted exactly once without automatic retry')
      assert.equal(await saved.getByText(`Uncertain confirmation ${width}`,{exact:true}).count(),1)
      await saved.close()
      await page.screenshot({path:`${directory}/workspace-uncertain-save-${width}.png`,fullPage:true})
    }
  } finally {await context.close()}
}
