import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
export async function outcomeBrowser(h,cookie,proposal) {
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return{name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    const capture=async(path,name)=>{for(const width of[1440,390]){
      await page.setViewportSize({width,height:1100});assert.equal((await page.goto(h.origin+path)).status(),200)
      await page.screenshot({path:`${process.env.OUTCOME_SCREENSHOTS}/${name}-${width}.png`,fullPage:true})
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`AGENT-004 ${name} fits ${width}`)
    }}
    await capture('/app/notices','outcome-notices')
    await capture('/app/proposals','outcome-reversal')
    const form=page.locator('form[action="/app/do/proposal.decide"]').filter({has:page.locator(`[name=proposal][value="${proposal.id}"]`)}).filter({has:page.locator('[name=decision][value=approve]')})
    await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Approve and run'}).click()])
    assert.equal(new URL(page.url()).searchParams.has('error'),false)
    await capture('/app/proposals','outcome-reversal-approved')
    await context.close()
  } finally {await browser.close()}
}
