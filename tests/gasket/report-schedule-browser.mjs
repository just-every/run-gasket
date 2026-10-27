import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

export async function reportScheduleScreens(h,cookie,schedule,familyIds,delegatedId){
  if(process.env.REPORT_SCREENSHOTS){
      await mkdir(process.env.REPORT_SCREENSHOTS,{recursive:true})
      const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
      try{
        const context=await browser.newContext({ignoreHTTPSErrors:true})
        await context.addCookies(cookie.owner.split('; ').map(pair=>{const i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),url:h.origin}}))
        const page=await context.newPage()
        await page.goto(`${h.origin}/app/settings/reports`)
        await page.getByLabel('Pack name',{exact:true}).fill('Browser owner pack')
        await page.getByLabel('Olive Owner',{exact:true}).check()
        await page.getByRole('checkbox',{name:'I authorize weekly email attachments',exact:false}).check()
        await page.getByRole('button',{name:'Authorize schedule',exact:true}).click()
        await page.waitForURL(url=>url.searchParams.has('notice'))
        const ownerSaved=(await h.api('report-schedules',cookie.owner)).schedules.find(s=>s.name==='Browser owner pack')
        assert.ok(ownerSaved);assert.equal(ownerSaved.paused,0);assert.equal(ownerSaved.revision,1)
        for(const width of [1440,390])for(const [name,path]of [['report-schedules','/app/settings/reports'],['report-edit',`/app/settings/reports?edit=${schedule}`],['report-history',`/app/settings/reports?edit=${familyIds.history}`],['report-valuation',`/app/settings/reports?edit=${familyIds.valuation}`]]){
          await page.setViewportSize({width,height:1100});await page.goto(h.origin+path)
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} fits ${width}`)
          assert.equal(await page.getByRole('heading',{name:'Scheduled reports',exact:true}).count(),1)
          if(name==='report-history'||name==='report-valuation')assert.equal(await page.getByLabel('Report',{exact:true}).inputValue(),name.slice(7))
          await page.screenshot({path:`${process.env.REPORT_SCREENSHOTS}/${name}-${width}.png`,fullPage:false})
          if(name==='report-schedules'){
            const interrupted=page.getByRole('row').filter({hasText:'Submission unconfirmed'}).first()
            await interrupted.scrollIntoViewIfNeeded()
            await page.screenshot({path:`${process.env.REPORT_SCREENSHOTS}/report-results-${width}.png`,fullPage:false})
          }
        }
        await context.clearCookies()
        await context.addCookies(cookie.other.split('; ').map(pair=>{const i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),url:h.origin}}))
        for(const width of [1440,390]){
          await page.setViewportSize({width,height:1100});await page.goto(`${h.origin}/app/settings/reports?edit=${delegatedId}`)
          assert.equal(await page.getByRole('button',{name:'Save for owner review'}).count(),1)
          assert.equal(await page.getByLabel('Delegated author').count(),0)
          if(width===1440){
            await page.getByLabel('Pack name',{exact:true}).fill('Browser authored draft')
            await page.getByRole('checkbox',{name:'I submit this draft for owner review.',exact:false}).check()
            await page.getByRole('button',{name:'Save for owner review'}).click()
            await page.waitForURL(url=>!url.searchParams.has('edit'))
            const savedRow=(await h.api('report-schedules',cookie.owner)).schedules.find(s=>s.id===delegatedId)
            assert.equal(savedRow.name,'Browser authored draft');assert.equal(savedRow.paused,1)
            await page.goto(`${h.origin}/app/settings/reports?edit=${delegatedId}`)
          }
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
          await page.screenshot({path:`${process.env.REPORT_SCREENSHOTS}/report-delegate-${width}.png`,fullPage:false})
        }
        await context.close()
      }finally{await browser.close()}
    }
}
