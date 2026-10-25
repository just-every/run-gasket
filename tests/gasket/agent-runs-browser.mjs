// AGENT-009 screens at desktop and phone width: the grant, its exact preview and the run history.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

export async function agentRunsBrowser(h, cookie, grant) {
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(cookie.owner.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
    const page = await context.newPage()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 })
      assert.equal((await page.goto(`${h.origin}/app/agent-runs`)).status(), 200)
      await page.getByRole('link', { name: 'Preview data and actions' }).first().click()
      await page.waitForURL(url => url.searchParams.get('preview') === grant)
      await page.locator('#preview').scrollIntoViewIfNeeded()
      assert.ok(await page.getByRole('button', { name: 'Start one run now' }).isVisible(), 'the preview offers the run')
      assert.ok((await page.locator('.gk-prompt').allInnerTexts()).join(' ').includes('CMP-1'), 'the preview shows the exact request')
      for (const name of ['grant', 'preview']) {
        await page.screenshot({ path: `${process.env.AGENT_SCREENSHOTS}/agent-runs-${name}-${width}.png`, fullPage: true })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `AGENT-009 ${name} fits ${width}`)
        if (name === 'grant') await page.goto(`${h.origin}/app/agent-runs`)
      }
      await page.goto(`${h.origin}/app/agent-runs#history`)
      assert.ok(await page.getByRole('link', { name: /Export decisions, cost and outcomes/ }).isVisible())
    }
    await context.close()
  } finally { await browser.close() }
}
