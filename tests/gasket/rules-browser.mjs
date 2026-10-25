import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
export async function rulesBrowser({h,cookie,ids,asset,team,custom,matched,definition}) {
  const output=process.env.RULES_SCREENSHOTS
  await mkdir(output,{recursive:true})
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.owner.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    const capture=async(name,path)=>{
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:1000});assert.equal((await page.goto(h.origin+path)).status(),200)
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} fits ${width}`)
        assert.deepEqual(await page.locator('button,a,[role=button]').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&!n.querySelector('img[alt]')&&!n.getAttribute('data-tooltip')).map(n=>n.outerHTML)),[],`${name} icon controls have tooltips`)
        await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true})
      }
    }
    await capture('rules','/app/settings/rules')
    await page.setViewportSize({width:390,height:1000})
    await page.goto(h.origin+'/app/settings/rules')
    const builder=page.locator('form[action="/app/do/rules.save"]')
    await builder.locator('[name=name]').fill('Route Line 2 electrical requests')
    await builder.locator('[name=priority]').fill('30')
    for(const [i,condition] of definition.conditions.entries()) {
      await builder.locator(`[name=conditionField${i}]`).selectOption(condition.field)
      await builder.locator(`[name=conditionValue${i}]`).fill(condition.value)
    }
    await builder.locator('[name=actionType0]').selectOption('assign')
    await builder.locator('[name=actionTeam0]').selectOption(team)
    await builder.locator('[name=actionPerson0]').selectOption(ids.tech)
    await builder.locator('[name=actionType1]').selectOption('priority')
    await builder.locator('[name=actionValue1]').fill('high')
    await builder.locator('[name=reason]').fill('Preview routing under current site permissions')
    await builder.getByRole('button',{name:'Publish paused revision'}).click()
    const rule=new URL(page.url()).searchParams.get('rule')
    assert.ok(rule)
    assert.ok((await h.api('rules',cookie.owner)).rules.some(r=>r.id===rule&&r.paused))
    await capture('rule-preview',`/app/settings/rules?rule=${rule}&preview=yes`)
    await capture('request-routing',`/app/requests/${matched}`)
    await capture('request-queue','/app/requests')
    await capture('rule-errors','/app/settings/rules')
    await context.close()
  } finally {await browser.close()}
}
