// BUY-004: use the existing PO's receiving/inspection forms at desktop and phone.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

export async function receivingBrowser({h,cookie,order,receipt,part,variant}) {
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    const path=`${h.origin}/app/purchase-orders/${order}`
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      await page.goto(path)
      await page.getByRole('heading',{name:'Receiving and backorders',exact:true}).scrollIntoViewIfNeeded()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`BUY-004 fits ${width}`)
      await page.screenshot({path:`${process.env.RECEIVING_SCREENSHOTS}/receiving-${variant}-${width}.png`})
      await page.getByRole('heading',{name:'Receipt CM-2048',exact:true}).scrollIntoViewIfNeeded()
      await page.screenshot({path:`${process.env.RECEIVING_SCREENSHOTS}/receipt-${variant}-${width}.png`})
    }
    if(variant==='returned') {
      await page.setViewportSize({width:390,height:1000})
      const first=receipt.lines.find(row=>row.line_index===0)
      const form=page.locator('form[action="/app/do/receipt.inspect"]').filter({has:page.locator(`input[name="receiptLine"][value="${first.id}"]`)})
      await form.locator('[name=kind]').selectOption('return')
      await form.locator('[name=source]').selectOption('usable')
      await form.locator('[name=quantity]').fill('1')
      await form.locator('[name=reason]').fill('Supplier recalled remaining lot; RMA-708')
      await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Record inspection'}).click()])
      assert.equal((await h.api(`parts/${part}`,cookie.lead)).onHand,'4')
      const balances=await h.api(`purchase-orders/${order}/receipts`,cookie.lead)
      assert.equal(balances.revisions[0].lines[0].returned,'3')
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:1000})
        await page.getByRole('heading',{name:'Receipt CM-2048',exact:true}).scrollIntoViewIfNeeded()
        await page.screenshot({path:`${process.env.RECEIVING_SCREENSHOTS}/receipt-browser-return-${width}.png`})
      }
    }
    await context.close()
  } finally {await browser.close()}
}
