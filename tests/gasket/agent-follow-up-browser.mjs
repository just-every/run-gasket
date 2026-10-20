// AGENT-005: people answer an agent and approve a reassignment in the existing workspace.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

async function withPage(h,cookie,run) {
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    await run(await context.newPage())
    await context.close()
  } finally {await browser.close()}
}
async function capture(page,h,path,name) {
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1100})
    await page.goto(h.origin+path)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`AGENT-005 ${name} fits ${width}`)
    await page.screenshot({path:`${process.env.AGENT_SCREENSHOTS}/${name}-${width}.png`,fullPage:true})
  }
}
export async function agentFollowUpBrowser({h,cookie,pm,query,today}) {
  await withPage(h,cookie.max,async page=>{
    await capture(page,h,'/app/notices','agent-notices')
    await capture(page,h,`/app/work/${pm}`,'agent-question')
    const form=page.locator('form[action="/app/do/agent.answer"]').filter({has:page.locator(`[name=query][value="${query}"]`)})
    await form.locator('[name=nextAction]').fill('Collect bearing and confirm production access with the shift lead')
    await form.locator('[name=promisedOn]').fill(today)
    await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Answer agent'}).click()])
    assert.ok((await h.api(`work/${pm}`,cookie.max)).chase.queries.find(q=>q.id===query).answered_at)
    await capture(page,h,`/app/work/${pm}`,'agent-promise')
  })
}
export async function proposalBrowser({h,cookie,id}) {
  await withPage(h,cookie.lead,async page=>{
    await capture(page,h,'/app/notices','agent-escalation')
    await capture(page,h,'/app/proposals','agent-reassignment')
    const form=page.locator('form[action="/app/do/proposal.decide"]').filter({has:page.locator(`[name=proposal][value="${id}"]`)}).filter({has:page.locator('[name=decision][value=approve]')})
    await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Approve and run'}).click()])
    assert.equal((await h.api('proposals',cookie.lead)).find(p=>p.id===id).status,'approved')
    await capture(page,h,'/app/proposals','agent-reassignment-approved')
  })
}
