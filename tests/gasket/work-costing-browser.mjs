import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

export async function costingBrowser({h,cookie,work,asset,parent,center,actual}) {
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    for(const width of [1440,390]) {
      const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}})
      await context.addCookies(cookie.owner.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
      const page=await context.newPage()
      const capture=async(name,selector)=>{
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
        if(overflow) {
          await page.screenshot({path:`${process.env.LABOR_SCREENSHOTS}/${name}-overflow-${width}.png`,fullPage:true})
          console.log('Cost page overflow',await page.locator('body *').evaluateAll(nodes=>nodes.filter(node=>node.getBoundingClientRect().right>innerWidth+1).map(node=>({tag:node.tagName,classes:node.className,text:node.textContent?.slice(0,100),width:node.getBoundingClientRect().width,right:node.getBoundingClientRect().right})).slice(0,12)))
        }
        assert.equal(overflow,false,`${name} fits ${width}`)
        if(selector) await page.locator(selector).scrollIntoViewIfNeeded()
        await page.screenshot({path:`${process.env.LABOR_SCREENSHOTS}/${name}-${width}.png`})
      }
      await page.goto(`${h.origin}/app/work/${work}`)
      await page.getByRole('link',{name:'Work cost report',exact:true}).click()
      await capture('costing-work')
      await capture('costing-comparisons','form[action="/app/do/work.cost_comparison"]')
      // Use the owner's financial-comparison form and leave its exact audit record.
      const comparison=page.locator('form[action="/app/do/work.cost_comparison"]')
      await comparison.locator('[name=kind]').selectOption('estimate')
      await comparison.locator('[name=category]').selectOption('tools')
      await comparison.locator('[name=amount]').fill('10.00')
      await comparison.locator('[name=reference]').fill(`synthetic-gasket-${width}`)
      await comparison.locator('[name=note]').fill('Alignment gauge estimate documented from current hire quote')
      await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error')),comparison.getByRole('button',{name:'Record comparison',exact:true}).click()])
      assert.equal(new URL(page.url()).searchParams.has('error'),false)
      const actualReport=await h.api(`costing?workOrder=${work}`,cookie.owner)
      assert.equal(actualReport.totals.amounts.actual.cents,actual)
      for(const [scope,name] of [[`asset=${asset}`,'asset'],[`asset=${parent}`,'parent'],[`costCenter=${center}`,'cost-center'],['','site']]) {
        await page.goto(`${h.origin}/app/costing${scope?'?'+scope:''}`)
        await capture(`costing-${name}`)
      }
      await page.getByText(/^Retained cost sources \(/).click()
      await capture('costing-sources','details:has(summary:text("Retained cost sources"))')
      await page.goto(`${h.origin}/app/assets/${asset}`)
      await capture('asset-lifecycle','#lifecycle')
      await page.goto(`${h.origin}/app/bad-actors?asset=${parent}`)
      await capture('pareto-reconciled')
      await page.goto(`${h.origin}/app/metrics?metric=bad-actors.repair-cost`)
      await page.locator('details').filter({has:page.getByText(/Reconciled failure repair cost/)}).locator('summary').click()
      await capture('costing-definition','[id="bad-actors.repair-cost"]')
      await context.close()
    }
  } finally {await browser.close()}
}
