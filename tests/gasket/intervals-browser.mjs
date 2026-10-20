import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
export async function intervalBrowser(h,cookie,proposal) {
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return{name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    const capture=async name=>{for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1100});assert.equal((await page.goto(h.origin+'/app/proposals')).status(),200)
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
      if(overflow) console.log(await page.locator('body *').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width})).slice(0,15)))
      await page.screenshot({path:`${process.env.INTERVAL_SCREENSHOTS}/${name}-${width}.png`,fullPage:true})
      assert.equal(overflow,false,`AGENT-003 ${name} fits ${width}`)
    }}
    await capture('interval-pending')
    await page.locator('section.gk-card').filter({has:page.locator(`[name=proposal][value="${proposal.id}"]`)}).screenshot({path:`${process.env.INTERVAL_SCREENSHOTS}/interval-card-390.png`})
    const form=page.locator('form[action="/app/do/proposal.decide"]').filter({has:page.locator(`[name=proposal][value="${proposal.id}"]`)}).filter({has:page.locator('[name=decision][value=approve]')})
    await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Approve and run'}).click()])
    assert.equal(new URL(page.url()).searchParams.has('error'),false)
    assert.equal((await h.api('proposals',cookie.lead)).find(p=>p.id===proposal.id).status,'approved')
    await capture('interval-approved')
    await context.close()
  } finally {await browser.close()}
}
