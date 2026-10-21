// AGENT-006: review and decide duplicate proposals in the existing Proposals screen.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

export async function agentStockBrowser({h,cookie,proposal,source,canonical}) {
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1100})
      assert.equal((await page.goto(h.origin+'/app/proposals')).status(),200)
      assert.equal(await page.getByRole('heading',{name:'Duplicate part merge'}).last().isVisible(),true)
      const approve=page.locator('form[action="/app/do/proposal.decide"]').filter({has:page.locator(`[name=proposal][value="${proposal.id}"]`)}).filter({has:page.locator('[name=decision][value=approve]')})
      await approve.getByRole('button',{name:'Approve and run'}).focus()
      assert.equal(await approve.getByRole('button',{name:'Approve and run'}).evaluate(el=>el===document.activeElement),true)
      assert.ok((await page.locator('body').innerText()).includes('Combined: 8 each, USD 68.00'))
      assert.ok((await page.locator('body').innerText()).includes('no physical receipt'))
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`AGENT-006 proposal fits ${width}`)
      await page.evaluate(()=>scrollTo(0,0))
      await page.screenshot({path:`${process.env.STOCK_SCREENSHOTS}/agent-stock-review-${width}.png`,fullPage:true})
      await page.goto(h.origin+'/app')
      assert.ok((await page.locator('body').innerText()).includes('1 proposal waiting for a decision'))
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`AGENT-006 Work summary fits ${width}`)
      await page.evaluate(()=>scrollTo(0,0))
      await page.screenshot({path:`${process.env.STOCK_SCREENSHOTS}/agent-stock-work-${width}.png`,fullPage:true})
    }
    await page.goto(h.origin+'/app/proposals')
    const approve=page.locator('form[action="/app/do/proposal.decide"]').filter({has:page.locator(`[name=proposal][value="${proposal.id}"]`)}).filter({has:page.locator('[name=decision][value=approve]')})
    await Promise.all([page.waitForURL(url=>url.searchParams.has('notice'),{waitUntil:'domcontentloaded'}),approve.getByRole('button',{name:'Approve and run'}).click()])
    await page.getByText('Saved.',{exact:true}).waitFor({state:'visible'})
    assert.equal((await h.api(`parts/${source}`,cookie.lead)).id,canonical)
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1100})
      await page.goto(h.origin+'/app/proposals')
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      await page.evaluate(()=>scrollTo(0,0))
      await page.screenshot({path:`${process.env.STOCK_SCREENSHOTS}/agent-stock-approved-${width}.png`,fullPage:true})
    }
    await context.close()
    const owner=await browser.newContext({ignoreHTTPSErrors:true})
    await owner.addCookies(cookie.owner.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const audit=await owner.newPage()
    for(const width of [1440,390]) {
      await audit.setViewportSize({width,height:1100})
      assert.equal((await audit.goto(h.origin+'/app/audit?action=proposal.approve')).status(),200)
      assert.equal(await audit.getByRole('link',{name:'Proposal: Duplicate part merge'}).count(),1)
      assert.equal(await audit.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`AGENT-006 audit fits ${width}`)
      await audit.evaluate(()=>scrollTo(0,0))
      await audit.screenshot({path:`${process.env.STOCK_SCREENSHOTS}/agent-stock-audit-${width}.png`,fullPage:true})
    }
    await owner.close()
  } finally {await browser.close()}
}

// Review the new count impact in the existing approval form at both required widths.
export async function agentCountBrowser({h,cookie,proposal}) {
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1100})
      assert.equal((await page.goto(h.origin+'/app/proposals')).status(),200)
      const content=await page.locator('body').innerText()
      assert.ok(content.includes('Recorded: 3 each, USD 30.00. Physically counted: 2 each.'))
      assert.ok(content.includes('Quantity adjustment: -1 each; value adjustment: USD -10.00.'))
      const sources=page.getByText('Retained count sources (2)',{exact:true})
      await sources.click()
      assert.equal(await page.getByRole('link',{name:'Open source work',exact:true}).isVisible(),true)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`AGENT-006 count impact fits ${width}`)
      await page.screenshot({path:`${process.env.STOCK_SCREENSHOTS}/agent-count-review-${width}.png`,fullPage:true})
      const evidence=await page.getByRole('link',{name:'6205-OLD: read stock evidence'}).getAttribute('href')
      assert.equal((await (await context.request.get(h.origin+evidence)).json()).part.onHand,'3')
    }
    const approve=page.locator('form[action="/app/do/proposal.decide"]').filter({has:page.locator(`[name=proposal][value="${proposal.id}"]`)}).filter({has:page.locator('[name=decision][value=approve]')})
    await approve.getByRole('button',{name:'Approve and run'}).focus()
    assert.equal(await approve.getByRole('button',{name:'Approve and run'}).evaluate(el=>el===document.activeElement),true)
    await Promise.all([page.waitForURL(url=>url.searchParams.has('notice'),{waitUntil:'domcontentloaded'}),approve.getByRole('button',{name:'Approve and run'}).click()])
    assert.equal((await h.api('proposals',cookie.lead)).find(p=>p.id===proposal.id).status,'approved')
    await context.close()
  } finally {await browser.close()}
}
