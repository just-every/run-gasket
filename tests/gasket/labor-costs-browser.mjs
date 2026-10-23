import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

export async function laborBrowser({h,cookie,work,people,today}) {
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    for(const width of [1440,390]) {
      const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}})
      const page=await context.newPage()
      const as=async who=>{
        await context.clearCookies()
        await context.addCookies(cookie[who].split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
      }
      const capture=async(name,selector)=>{
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} fits ${width}`)
        if(selector) await page.locator(selector).scrollIntoViewIfNeeded()
        await page.screenshot({path:`${process.env.LABOR_SCREENSHOTS}/${name}-${width}.png`})
      }
      const submit=async(form,name)=>{
        await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error')),form.getByRole('button',{name,exact:true}).click()])
        assert.equal(new URL(page.url()).searchParams.has('error'),false,new URL(page.url()).searchParams.get('error')??name)
      }
      await as('max')
      await page.goto(`${h.origin}/app`)
      await capture('work-list')
      await page.goto(`${h.origin}/app/work/${work}`)
      await capture('technician-time','#labor')
      assert.equal(await page.getByText('Pay rates and overtime policy · owner only',{exact:true}).count(),0)
      const timer=page.locator('form[action="/app/do/labor.timer"]')
      await submit(timer,'Start timer')
      await capture('timer-running','#labor')
      await page.goto(`${h.origin}/app/work/${work}`)
      await submit(page.locator('form[action="/app/do/labor.timer"]').filter({has:page.getByRole('button',{name:'Pause timer',exact:true})}),'Pause timer')
      await capture('timer-paused','#labor')
      await page.goto(`${h.origin}/app/work/${work}`)
      await submit(page.locator('form[action="/app/do/labor.timer"]').filter({has:page.getByRole('button',{name:'Resume timer',exact:true})}),'Resume timer')
      await page.goto(`${h.origin}/app/work/${work}`)
      await submit(page.locator('form[action="/app/do/labor.timer"]').filter({has:page.getByRole('button',{name:'Stop timer',exact:true})}),'Stop timer')
      await page.goto(`${h.origin}/app/work/${work}`)
      await page.getByText('Enter time manually',{exact:true}).click()
      const entry=page.locator('form[action="/app/do/labor.entry"]').filter({has:page.getByRole('button',{name:'Submit time for review',exact:true})})
      await entry.locator('[name=category]').selectOption('travel')
      await entry.locator('[name=started]').fill(`${today}T05:00`)
      await entry.locator('[name=ended]').fill(`${today}T05:15`)
      await entry.locator('[name=reason]').fill('Travel to the conveyor for the final alignment check')
      await capture('manual-time','#labor')
      await submit(entry,'Submit time for review')
      await as('owner')
      await page.goto(`${h.origin}/app/work/${work}`)
      await capture('owner-review','#labor')
      const forms=page.locator('form[action="/app/do/labor.review"]')
      const count=await forms.count()
      for(let i=0;i<count;i++) {
        const form=page.locator('form[action="/app/do/labor.review"]').first()
        await form.locator('[name=decision]').selectOption('reject')
        await form.locator('[name=reason]').fill('Browser exercise retained separately from approved repair hours')
        await submit(form,'Record review')
        await page.goto(`${h.origin}/app/work/${work}`)
      }
      await page.getByText('Pay rates and overtime policy · owner only',{exact:true}).click()
      await page.getByText('Contractor invoices · owner only',{exact:true}).click()
      await capture('owner-pay-policy','details:has(summary:text("Pay rates"))')
      await capture('owner-contractor','details:has(summary:text("Contractor invoices"))')
      await page.goto(`${h.origin}/app/work/${work}`)
      await capture('approved-repair','#labor')
      await context.close()
    }
  } finally {await browser.close()}
}
