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
        await page.goto(`${h.origin}/app/settings/reports?edit=${ownerSaved.id}`)
        const edit=page.locator('form[action="/app/do/report.schedule"]')
        await edit.getByLabel('Pack name',{exact:true}).fill('Browser receipt pack')
        await edit.getByRole('checkbox',{name:'I authorize weekly email attachments',exact:false}).check()
        let submitted,submissionHeaders
        const loseReply=async route=>{
          const request=route.request(),headers=await request.allHeaders()
          submitted=request.postDataBuffer();submissionHeaders={accept:headers.accept,'content-type':headers['content-type']}
          const response=await h.raw('/app/do/report.schedule',{cookie:cookie.owner,form:submitted,headers:submissionHeaders})
          assert.equal((await response.json()).saved,true)
          await route.abort('failed')
        }
        await page.route('**/app/do/report.schedule',loseReply)
        try{
          await edit.getByRole('button',{name:'Authorize schedule',exact:true}).click()
          const confirmed=edit.getByRole('alert').filter({hasText:/Saved. The server confirmed/})
          await confirmed.waitFor()
          assert.equal(await edit.getByLabel('Pack name',{exact:true}).inputValue(),'Browser receipt pack')
          assert.equal(await edit.getByRole('button',{name:'Authorize schedule',exact:true}).isDisabled(),true)
          assert.equal(await edit.getAttribute('aria-busy'),null)
          const receipt=await(await h.raw(await confirmed.getByRole('link').getAttribute('href'),{cookie:cookie.owner,headers:{accept:['application','json'].join('/')}})).json()
          assert.equal(receipt.state,'saved');assert.equal(receipt.action,'report.schedule');assert.ok(receipt.batches>0)
          assert.equal((await h.raw('/app/do/report.schedule',{cookie:cookie.owner,form:submitted,headers:submissionHeaders})).status,409,'the same receipt cannot authorize a second revision')
          const saved=(await h.api('report-schedules',cookie.owner)).schedules.filter(s=>s.id===ownerSaved.id)
          assert.deepEqual(saved.map(s=>[s.name,s.revision,s.paused]),[['Browser receipt pack',2,0]])
          for(const width of [1440,390]){
            await page.setViewportSize({width,height:1100})
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
            await page.screenshot({path:`${process.env.REPORT_SCREENSHOTS}/report-save-receipt-${width}.png`,fullPage:false})
          }
        }finally{await page.unroute('**/app/do/report.schedule',loseReply)}
        for(const width of [1440,390])for(const [name,path]of [['report-schedules','/app/settings/reports'],['report-edit',`/app/settings/reports?edit=${schedule}`],['report-history',`/app/settings/reports?edit=${familyIds.history}`],['report-valuation',`/app/settings/reports?edit=${familyIds.valuation}`]]){
          await page.setViewportSize({width,height:1100});await page.goto(h.origin+path)
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} fits ${width}`)
          assert.equal(await page.getByRole('heading',{name:'Scheduled reports',exact:true}).count(),1)
          if(name==='report-history'||name==='report-valuation')assert.equal(await page.getByLabel('Report',{exact:true}).inputValue(),name.slice(7))
          await page.screenshot({path:`${process.env.REPORT_SCREENSHOTS}/${name}-${width}.png`,fullPage:false})
          if(name==='report-schedules'){
            for(const [result,reason] of [
              [/Recipient excluded/,/Report access ended|Schedule or permission changed/],
              [/Provider refused/,/Provider refused the message/],
              [/Submission uncertain/,/Provider response was uncertain/],
              [/Submission unconfirmed/,/Execution interrupted/],
              [/^Failed$/, /pdf character not supported/],
            ]){
              const outcome=page.getByRole('row').filter({has:page.locator('td > .gk-cell').filter({hasText:result})}).first()
              assert.equal(await outcome.count(),1,'every retained failure outcome is visible in Settings')
              assert.match(await outcome.innerText(),reason,'the visible outcome explains its cause')
              if(!result.source.includes('Recipient'))assert.match(await outcome.innerText(),/Reconcile this attempt/,'outbound repair requires reconciliation')
            }
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
