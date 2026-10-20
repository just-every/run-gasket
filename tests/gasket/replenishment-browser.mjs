// PART-005 operator path, retaining the owner's real browser HOME.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

export async function replenishmentBrowser({h,cookie,order,variant}) {
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.owner.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    const screens=[['/app/replenishment','h1','policy'],['/app/replenishment','section:has(h2:text-is("Edit location policy"))','edit'],['/app/replenishment','section:has(h2:text-is("Separate ordering envelopes"))','envelopes'],['/app/stores','#replenishment','stores'],['/app/automation','#rule-replenishment','worker'],['/app/notices','#mine','notices'],[`/app/purchase-orders/${order}`,'section:has(h2:text-is("Receiving and backorders"))','receiving']]
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      for(const [path,selector,name] of screens) {
        await page.goto(`${h.origin}${path}`)
        await page.locator(selector).first().scrollIntoViewIfNeeded()
        await page.screenshot({path:`${process.env.REPLENISHMENT_SCREENSHOTS}/replenishment-${variant}-${name}-${width}.png`})
        const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,class:el.className,text:el.textContent?.slice(0,90),right:el.getBoundingClientRect().right})).slice(-12))
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${path} fits ${width}: ${JSON.stringify(overflow)}`)
      }
    }
    if(variant==='partial') {
      await page.setViewportSize({width:390,height:1000})
      await page.goto(`${h.origin}/app/replenishment`)
      const policy=page.locator('form[action="/app/do/replenishment.policy"]')
      const before=(await h.api('replenishment',cookie.owner)).policies[0].revision
      await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),policy.getByRole('button',{name:'Save policy'}).click()])
      assert.equal((await h.api('replenishment',cookie.owner)).policies[0].revision,before+1)
      await page.goto(`${h.origin}/app/automation`)
      for(const paused of [true,false]) {
        const control=page.locator('#rule-replenishment form[action="/app/do/automation.control"]')
        await control.locator('[name=reason]').fill(paused?'Pause ordering while stores inspect partial delivery':'Resume the reviewed replenishment worker')
        await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),control.getByRole('button',{name:paused?'Pause automation':'Resume automation'}).click()])
        assert.equal((await h.api('automation',cookie.owner)).rules.find(row=>row.id==='replenishment').paused,paused?1:0)
        await page.locator('#rule-replenishment').scrollIntoViewIfNeeded()
        await page.screenshot({path:`${process.env.REPLENISHMENT_SCREENSHOTS}/replenishment-worker-${paused?'paused':'resumed'}-390.png`})
      }
    }
    await context.clearCookies()
    await context.addCookies(cookie.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      await page.goto(`${h.origin}/app/replenishment`)
      const envelope=page.locator('section').filter({has:page.getByRole('heading',{name:'Separate ordering envelopes',exact:true})})
      await envelope.scrollIntoViewIfNeeded()
      assert.equal((await envelope.innerText()).includes('$100.00'),false,'lead page omits the actual envelope ceilings')
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      await page.screenshot({path:`${process.env.REPLENISHMENT_SCREENSHOTS}/replenishment-${variant}-lead-envelopes-${width}.png`})
    }
    await context.close()
  }finally{await browser.close()}
}
