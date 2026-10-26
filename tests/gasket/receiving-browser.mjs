// BUY-004: use the existing PO's receiving/inspection forms at desktop and phone.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

export async function receivingBrowser({h,cookie,order,receipt,part,variant}) {
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
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

export async function controlledBrowser({h,cookie,work,part,order,source,target}) {
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    const signIn=async who=>{await context.clearCookies();await context.addCookies(cookie[who].split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))}
    const page=await context.newPage()
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      await signIn('max')
      await page.goto(`${h.origin}/app/work/${work}`)
      const form=page.locator('form[action="/app/do/workorder.issue"]')
      await form.getByLabel('Part',{exact:true}).selectOption(part)
      await form.getByLabel('Receipt source',{exact:true}).selectOption(source)
      await form.getByLabel('Quantity',{exact:true}).fill('1')
      await form.scrollIntoViewIfNeeded()
      await page.screenshot({path:`${process.env.RECEIVING_SCREENSHOTS}/controlled-issue-${width}.png`})
      await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Issue part',exact:true}).click()])
      assert.equal(new URL(page.url()).searchParams.has('error'),false)
      await signIn('lead')
      for(const [name,path,section] of [['bin',`/app/parts?bin=South%20B2`,'#bin-stock'],['scan',`/scan/${target}`,null],['sources',`/app/parts/${part}`,'#stock-sources'],['expiry','/app/stores','#expiring-lots'],['receiving',`/app/purchase-orders/${order}`,null]]) {
        await page.goto(h.origin+path)
        if(section) await page.locator(section).scrollIntoViewIfNeeded()
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} fits ${width}`)
        const iconOnly=await page.locator('button,a,label[for="gk-menu"]').evaluateAll(nodes=>nodes.filter(node=>node.getBoundingClientRect().width&&node.querySelector('svg')&&!node.textContent.trim()).length)
        assert.equal(iconOnly,0,'Visible controls have text labels')
        await page.screenshot({path:`${process.env.RECEIVING_SCREENSHOTS}/controlled-${name}-${width}.png`})
      }
    }
    await context.close()
  } finally {await browser.close()}
}

export async function controlledRefusal({h,cookie,part,work}) {
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.max.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      await page.goto(`${h.origin}/app/work/${work}`)
      const form=page.locator('form[action="/app/do/workorder.issue"]')
      await form.getByLabel('Part',{exact:true}).selectOption(part)
      await form.getByLabel('Quantity',{exact:true}).fill('1')
      await Promise.all([page.waitForURL(url=>url.searchParams.has('error')),form.getByRole('button',{name:'Issue part',exact:true}).click()])
      assert.equal(new URL(page.url()).searchParams.get('error'),'source_reconciliation_required')
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      await page.screenshot({path:`${process.env.RECEIVING_SCREENSHOTS}/controlled-refusal-${width}.png`})
      await page.goto(`${h.origin}/app/parts/${part}`)
      await page.locator('#stock-sources').scrollIntoViewIfNeeded()
      assert.match(await page.locator('#stock-sources').innerText(),/Count variance requires bin reconciliation/)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      await page.screenshot({path:`${process.env.RECEIVING_SCREENSHOTS}/controlled-held-${width}.png`})
    }
    await context.close()
  } finally {await browser.close()}
}
