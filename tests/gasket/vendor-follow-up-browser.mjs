// BUY-006: the follow-up screen and its rule form at desktop and phone widths.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

export async function vendorFollowUpBrowser({h,cookie}) {
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.owner.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1100})
      await page.goto(`${h.origin}/app/vendor-follow-up`)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`BUY-006 fits ${width}`)
      await page.screenshot({path:`${process.env.VENDOR_SCREENSHOTS}/vendor-follow-up-${width}.png`,fullPage:true})
    }
    const before=(await h.api('vendor-follow-up',cookie.owner)).rule.number
    const form=page.locator('form[action="/app/do/vendor.rule"]')
    await form.locator('[name=lateDays]').fill('2')
    await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Approve rule'}).click()])
    assert.deepEqual([(await h.api('vendor-follow-up',cookie.owner)).rule.number,(await h.api('vendor-follow-up',cookie.owner)).rule.late_days],[before+1,2])
    await context.close()
  } finally {await browser.close()}
}
