// REPORT-009: incomplete move-in, late sources and traceable KPI recomputation.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { file, harness } from './harness.mjs'
import { historyAssetsCsv, workCsv } from './fixtures.mjs'
import { now, zone } from './clock.mjs'

const local = instant => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(p => [p.type,p.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
/** The journey runs on one held instant: unknown coverage counts wall time up to now, so doors compared on a running
 * clock could read either side of a minute (12:02:59 and 12:03:00 round to 706 and 706.1 hours). */
export async function metricsJourney(h, cookie, people) {
  const at = now()
  assert.equal((await h.setClockInstant(at)).status, 204)
  try { await journey(h, cookie, people, at) } finally { await h.setClockInstant(h.clockInstant) }
}
async function journey(h, cookie, people, at) {
  const today = local(at).slice(0,10)
  const asset = (await h.api('asset.create', cookie.lead, { tag: 'DQ-901', name: 'Process chilled-water recirculation pump', location: 'North plant · Chiller skid 4' })).id
  const meter = (await h.api('meter.create', cookie.lead, { asset, name: 'Drive operating hours', unit: 'h', kind: 'counter' })).id
  for (const [value,minutes] of [['100',180],['102',60]]) await h.api('meter.feed', cookie.lead, { meter, source: 'Plant historian export', value, takenOn: local(at-minutes*60000) })
  const late = await h.api('meter.feed', cookie.lead, { meter, source: 'Delayed gateway file', value: '99', takenOn: local(at-30*3600000) })
  assert.equal(late.quality,'stale')
  const job = (await h.api('workorder.create', cookie.lead, { asset, title: 'Inspect noisy drive bearing and restore circulation', due: today, assignee: people.max })).id
  await h.api('downtime.start', cookie.max, { workOrder: job, startedOn: local(at-120*60000), reason: 'Bearing vibration exceeded shutdown trigger' })
  await h.api('downtime.end', cookie.max, { workOrder: job, endedOn: local(at-90*60000) })
  // This journey imports its own records: prior flows deliberately edit and retain their moved-in records.
  const ownSource=text=>text.replaceAll('82001','92001').replaceAll('82002','92002').replaceAll('HK-201','DQ-201').replaceAll('HK-202','DQ-202').replace(/700([1-8])/g,'9700$1')
  const files = { assets: file('maintainx-assets-quality.csv', ownSource(historyAssetsCsv)), work: file('maintainx-incomplete-history.csv', ownSource(workCsv)) }
  const preview = await h.api('import.preview', cookie.lead, files)
  const imported = await h.api('import.apply', cookie.lead, { ...files, fingerprint: preview.fingerprint })
  const part=(await h.api('part.create',cookie.lead,{number:'DQ-5',name:'Pump drive bearing',unit:'ea',location:'M-4',minimum:'1'})).id
  await h.api('part.receive',cookie.lead,{part,quantity:'5',note:'Packing slip has no price'})
  const originalHistory = await h.api(`assets/${asset}/history`, cookie.lead)
  const get = () => h.api(`metrics?asset=${asset}`, cookie.lead)
  const before = await get(), report = await h.api(`reliability?asset=${asset}`, cookie.lead)
  assert.deepEqual(before.coverage.mtbf,report.mtbf)
  assert.deepEqual([before.coverage.failures,before.coverage.mtbf.hours,before.coverage.mttr.minutes],[1,2,30])
  assert.ok(before.coverage.mtbf.unknownHours > 0)
  assert.equal(before.quality.missingFailureCodes.stops.find(row => row.work.id === job).reason,'Bearing vibration exceeded shutdown trigger')
  assert.ok(before.quality.unmatchedCosts.unpricedMovements.some(row=>row.part_id===part))
  assert.ok(before.quality.unmatchedCosts.workWithoutEntries.some(row => row.id === job))
  assert.ok(before.quality.unmatchedCosts.imported.some(row => row.sourceRef === '97002' && row.laborCents === null))
  assert.deepEqual(before.quality.counterGaps.find(row => row.id === meter).held.map(row => [row.id,row.quality,row.source]),[[late.id,'stale','Delayed gateway file']])
  const reviewed = before.quality.unresolvedImports.find(row => row.id === imported.job).reviewed
  assert.deepEqual(reviewed.rejected,preview.rejected)
  assert.deepEqual(reviewed.attention,preview.attention)
  assert.deepEqual(reviewed.gaps,preview.gaps)
  assert.ok(reviewed.rejected.length && reviewed.gaps.length)
  for (const definition of before.definitions) {
    for (const key of ['formula','eventTime','exclusions','freshness','sourceDoor']) assert.ok(definition[key]?.length,`${definition.id}: ${key}`)
  }
  const definition=before.definitions.find(row=>row.id==='reliability.mtbf')
  const single=await h.api(`metrics?metric=${definition.id}&version=${definition.version}`,cookie.lead)
  assert.deepEqual(single.definitions,[definition])
  for (const source of before.sources) assert.equal((await h.raw(source,{cookie:cookie.lead})).status,200,source)
  assert.equal((await get()).inputFingerprint,before.inputFingerprint,'unchanged sources recompute identically')
  await h.api('metrics',cookie.max,undefined,403)
  await h.api('metrics',undefined,undefined,401)
  await h.api('metrics?version=999',cookie.lead,undefined,404)
  await h.api('metrics?metric=unknown',cookie.lead,undefined,404)
  const supervisor = await h.api('metrics',cookie.sam)
  assert.equal(supervisor.quality.importAccess,false)
  assert.deepEqual(supervisor.quality.unresolvedImports,[])
  const sources = await h.api(`assets/${asset}`,cookie.lead)
  await h.api('code.set',cookie.lead,{kind:'failure_mode',key:'dq-bearing',label:'Bearing damage'})
  const stop = report.failures[0]
  await h.submit('downtime.classify',cookie.lead,{downtime:stop.id,failureMode:'dq-bearing',reason:'Inspection confirmed spalled bearing race'},'/app/metrics')
  const after = await get()
  assert.equal(after.quality.missingFailureCodes.stops.some(row=>row.id===stop.id),false)
  assert.equal(after.coverage.failures,before.coverage.failures,'classification never removes unresolved work from the denominator')
  assert.deepEqual(after.coverage.mtbf,before.coverage.mtbf)
  assert.ok(after.sourceRevision>before.sourceRevision)
  assert.notEqual(after.inputFingerprint,before.inputFingerprint)
  assert.deepEqual((await h.api(`assets/${asset}`,cookie.lead)).meters,sources.meters,'late and original readings survive recomputation')
  const updated = await h.api(`reliability?asset=${asset}`,cookie.lead)
  assert.deepEqual(updated.failures[0].classifications[0],stop.classifications[0],'original stop classification is retained')
  assert.equal(updated.failures[0].failureMode.key,'dq-bearing')
  const retained=(await h.api(`assets/${asset}/history`,cookie.lead)).events
  for(const event of originalHistory.events) assert.ok(retained.some(row=>JSON.stringify(row)===JSON.stringify(event)),'original history retained')
  const page = await h.raw('/app/metrics',{cookie:cookie.lead})
  assert.equal(page.status,200)
  const html=await page.text()
  for(const definition of before.definitions) assert.ok(html.includes(`id="${definition.id}"`),'every measure is openable on the page')
  if(process.env.METRICS_SCREENSHOTS) {
    const { chromium } = await import('@playwright/test')
    const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
    try {
      const context=await browser.newContext({ignoreHTTPSErrors:true})
      await context.addCookies(cookie.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
      const page=await context.newPage()
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:960})
        await page.goto(`${h.origin}/app/metrics`)
        await page.screenshot({path:`${process.env.METRICS_SCREENSHOTS}/metrics-top-${width}.png`})
        const detail=page.locator('details').filter({hasText:'MTBF'}).first()
        if(await detail.count()) await detail.locator('summary').click()
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'report fits viewport')
        await page.screenshot({path:`${process.env.METRICS_SCREENSHOTS}/metrics-${width}.png`,fullPage:false})
        await page.locator('h2').filter({hasText:'Counter coverage'}).scrollIntoViewIfNeeded()
        await page.screenshot({path:`${process.env.METRICS_SCREENSHOTS}/metrics-quality-${width}.png`})
      }
      await context.close()
    } finally {await browser.close()}
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const h=await harness()
  try {
    const cookie={owner:await h.owner()},people={}
    await h.api('site.configure',cookie.owner,{name:'Harbour Plant Maintenance',timezone:zone})
    for(const [key,role,name] of [['lead','lead','Lena Park'],['max','maintainer','Max Ortiz'],['sam','supervisor','Sam Ito']]) {
      people[key]=(await h.api('access.give',cookie.owner,{name,email:`${key}@example.test`,role})).id
      cookie[key]=await h.signIn(`${key}@example.test`)
    }
    await metricsJourney(h,cookie,people)
    console.log('REPORT-009 reliable definitions, incomplete history and traceable recomputation passed')
  } finally {await h.close()}
}
