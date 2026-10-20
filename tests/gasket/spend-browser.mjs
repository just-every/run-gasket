// BUY-003's owner path on desktop and phone; browser HOME stays the real HOME.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

export async function spendBrowser({h,cookie,paths,variant,viewer='owner'}) {
  if(!process.env.SPEND_SCREENSHOTS) return
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie[viewer].split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    if(variant==='final') {
      await page.goto(`${h.origin}/app/spend-policy`)
      const form=page.locator('form[action="/app/do/spend.policy"]').first()
      const today=(await h.api('me',cookie.owner)).today
      const tomorrow=new Date(Date.parse(`${today}T12:00:00Z`)+86400000).toISOString().slice(0,10)
      await form.locator('[name=from]').fill(tomorrow)
      await form.locator('[name=to]').fill(tomorrow)
      await form.locator('[name=budget]').fill('12000.00')
      await form.locator('[name=threshold]').nth(0).fill('0.00')
      await form.locator('[name=approver]').nth(0).selectOption({label:'Rosa Alvarez'})
      await form.locator('[name=threshold]').nth(1).fill('3000.00')
      await form.locator('[name=approver]').nth(1).selectOption({label:'Devin Cole'})
      await Promise.all([page.waitForURL(url=>url.pathname==='/app/spend-policy'&&url.searchParams.has('notice')),form.locator('button[type=submit]').click()])
      assert.ok((await h.api('spend-policy',cookie.owner)).policies.some(row=>row.from_on===tomorrow&&row.budget_cents===1200000))
    }
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:960})
      for(const [index,path] of paths.entries()) {
        await page.goto(`${h.origin}${path}`)
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${path} fits ${width}`)
        await page.screenshot({path:`${process.env.SPEND_SCREENSHOTS}/spend-${variant}-${index}-${width}.png`})
        if(['pending','delegated','blocked'].includes(variant)) {
          await page.getByRole('heading',{name:'Current purchasing authority',exact:true}).scrollIntoViewIfNeeded()
          await page.screenshot({path:`${process.env.SPEND_SCREENSHOTS}/spend-authority-${variant}-${width}.png`})
          await page.getByRole('heading',{name:'Emergency override',exact:true}).scrollIntoViewIfNeeded()
          await page.getByText('Authorize an exceptional purchase',{exact:true}).click()
          await page.screenshot({path:`${process.env.SPEND_SCREENSHOTS}/spend-emergency-${variant}-${width}.png`})
        }
        if(path==='/app/spend-policy') {
          await page.getByRole('heading',{name:'Emergency override report',exact:true}).scrollIntoViewIfNeeded()
          await page.screenshot({path:`${process.env.SPEND_SCREENSHOTS}/spend-overrides-${width}.png`})
        }
      }
    }
    if(variant==='approved') {
      await page.setViewportSize({width:390,height:960})
      await page.goto(`${h.origin}${paths[1]}`)
      const send=page.locator('form[action="/app/do/purchase.send"]')
      assert.equal(await send.count(),1)
      await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),send.getByRole('button',{name:'Submit vendor email'}).click()])
      const order=paths[1].split('/').pop()
      assert.equal((await h.api(`purchase-orders/${order}`,cookie.owner)).current.send.state,'accepted')
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:960})
        await page.evaluate(()=>scrollTo(0,0))
        await page.screenshot({path:`${process.env.SPEND_SCREENSHOTS}/spend-sent-${width}.png`})
      }
    }
    await context.close()
  } finally {await browser.close()}
}
