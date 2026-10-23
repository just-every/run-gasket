// PART-003: damaged work returns through the built Worker's public doors.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { harness } from './harness.mjs'
import { installation } from './installation.mjs'

async function browserReturn(h,cookie,work,part) {
  const {chromium}=await import('@playwright/test')
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.max.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      await page.goto(`${h.origin}/app/work/${work}`)
      const form=page.locator('form[action="/app/do/workorder.return"]')
      await form.locator('[name=part]').selectOption(part)
      await form.locator('[name=quantity]').fill('0.5')
      await form.getByLabel('Return condition').selectOption('damaged')
      await form.getByLabel('Return reason').fill('Cracked bearing cage; physically returned to hold shelf')
      await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Return part',exact:true}).click()])
      assert.equal(new URL(page.url()).searchParams.has('error'),false)
      await page.locator('#parts').scrollIntoViewIfNeeded()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`PART-003 Work fits ${width}`)
      await page.screenshot({path:join(process.env.RETURN_SCREENSHOTS,`work-damaged-${width}.png`)})
      await page.goto(`${h.origin}/app/parts/${part}`)
      await page.getByRole('heading',{name:'Damaged work returns',exact:true}).scrollIntoViewIfNeeded()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`PART-003 Part fits ${width}`)
      await page.screenshot({path:join(process.env.RETURN_SCREENSHOTS,`part-quarantine-${width}.png`)})
      await page.locator('#damaged-returns').screenshot({path:join(process.env.RETURN_SCREENSHOTS,`quarantine-detail-${width}.png`)})
      assert.match(await page.locator('#damaged-returns').innerText(),/Cracked bearing cage/)
    }
    await context.close()
  } finally {await browser.close()}
}

async function browserDisposition(h, cookie, part, returnId, work) {
  const {chromium}=await import('@playwright/test')
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(cookie.owner.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      await page.goto(`${h.origin}/app/parts/${part}`)
      const form=page.locator('form[action="/app/do/part.quarantine.dispose"]').filter({has:page.locator(`input[name=returnId][value="${returnId}"]`)})
      await form.getByLabel('Disposition',{exact:true}).selectOption('release')
      await form.getByLabel('Quantity',{exact:true}).fill('0.25')
      await form.getByLabel('Inspection reason').fill('Inspected bearing surfaces and seals; cleared for reuse')
      await form.getByLabel('I inspected these goods and confirm this disposition').check()
      await Promise.all([page.waitForURL(url=>url.searchParams.has('notice')),form.getByRole('button',{name:'Record disposition',exact:true}).click()])
      assert.equal(new URL(page.url()).searchParams.has('error'),false)
      await page.locator('#damaged-returns').scrollIntoViewIfNeeded()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Disposition fits ${width}`)
      assert.match(await page.locator('#damaged-returns').innerText(),/Released after inspection/)
      assert.equal(await page.locator('#damaged-returns .gk-table-wrap').evaluateAll(nodes=>nodes.some(node=>node.scrollWidth>node.clientWidth)),false,'Disposition tables fit without clipped columns')
      const iconOnly=await page.locator('button, a, label[for="gk-menu"]').evaluateAll(nodes=>nodes.filter(node=>node.getBoundingClientRect().width&&node.querySelector('svg')&&!node.textContent.trim()).length)
      assert.equal(iconOnly,0,'Every visible icon control on the part screen has a text label')
      await page.screenshot({path:join(process.env.RETURN_SCREENSHOTS,`part-disposition-${width}.png`)})
      await page.locator('#damaged-returns').screenshot({path:join(process.env.RETURN_SCREENSHOTS,`disposition-detail-${width}.png`)})
      await page.goto(`${h.origin}/app/work/${work}`)
      await page.locator('#parts').scrollIntoViewIfNeeded()
      assert.match(await page.locator('#parts').innerText(),/still in quarantine/)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Work disposition fits ${width}`)
      await page.screenshot({path:join(process.env.RETURN_SCREENSHOTS,`work-disposition-${width}.png`)})
      await page.goto(`${h.origin}/app/audit?action=part.disposition`)
      assert.match(await page.locator('main').innerText(),/Disposed quarantined work returns/)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Disposition audit fits ${width}`)
      await page.screenshot({path:join(process.env.RETURN_SCREENSHOTS,`disposition-audit-${width}.png`)})
    }
    await context.close()
  } finally {await browser.close()}
}

export async function workReturnsJourney() {
  const h=await harness()
  let restored,restoredHarness
  try {
    const cookie={owner:await h.owner()},ids={}
    await h.api('site.configure',cookie.owner,{name:'Ohio bearing workshop',timezone:'America/New_York'})
    for(const [key,role] of [['lead','lead'],['max','maintainer'],['other','maintainer'],['sam','supervisor'],['agent','agent']]) {
      ids[key]=(await h.api('access.give',cookie.owner,{name:`${key} Bearing`,email:`return-${key}@example.test`,role})).id
      cookie[key]=await h.signIn(`return-${key}@example.test`)
    }
    const part=(await h.api('part.create',cookie.lead,{number:'RETURN-6205',name:'Drive bearing',unit:'each',location:'Shelf B2'})).id
    const asset=(await h.api('asset.create',cookie.lead,{tag:'RETURN-MOTOR',name:'Conveyor motor',location:'Hall 1'})).id
    const today=(await h.api('me',cookie.max)).today
    const job=async title=>(await h.api('workorder.create',cookie.lead,{asset,title,due:today,assignee:ids.max})).id
    const work=await job('Replace damaged motor bearings'),next=await job('Second motor repair')
    const stock=()=>h.api(`parts/${part}`,cookie.lead)
    const returns=(who,quantity,condition='damaged',reason='Cracked bearing cage; physically returned to hold shelf',status=200)=>h.api('workorder.return',cookie[who],{workOrder:work,part,quantity,condition,reason},status)
    await h.api('part.receive',cookie.lead,{part,quantity:'3',unitPrice:'10'})
    await h.api('workorder.issue',cookie.max,{workOrder:work,part,quantity:'3'})
    // The new price cannot change the value of the bearings still held by work.
    await h.api('part.receive',cookie.lead,{part,quantity:'1',unitPrice:'30'})
    const before=await stock()
    await returns('other','1','damaged','Not assigned',403)
    await returns('agent','1','damaged','Agent cannot receive',403)
    await returns('max','1','damaged','',400)
    await returns('max','1','unknown','Invalid condition',400)
    assert.equal((await h.raw('/api/gasket/workorder.return',{body:{workOrder:work,part,quantity:'1',condition:'damaged',reason:'No session'}})).status,401)
    assert.deepEqual(await stock(),before,'PART-003 invalid and unauthorized returns change no stock or quarantine')
    if(process.env.RETURN_SCREENSHOTS) await browserReturn(h,cookie,work,part)
    else await returns('max','1')
    let row=await stock()
    assert.deepEqual([row.onHand,row.available,row.valueCents,row.quarantinedQuantity,row.quarantinedValueCents],['1','1',3000,'1',1000],'PART-003 damaged returns keep original issue value without usable stock')
    assert.equal(row.quarantines.reduce((sum,q)=>sum+Number(q.quantity),0),1)
    assert.ok(row.quarantines.every(q=>q.work_order_id===work&&q.actor==='max Bearing'&&q.reason.includes('Cracked bearing cage')&&q.at>0))
    await returns('max','1','usable','Unused, undamaged bearing')
    await returns('max','1')
    row=await stock()
    assert.deepEqual([row.onHand,row.available,row.valueCents,row.quarantinedQuantity,row.quarantinedValueCents],['2','2',4000,'2',2000])
    const detail=await h.api(`work/${work}`,cookie.max)
    assert.deepEqual(detail.parts.map(p=>[p.issued,p.returned,p.used,p.usedCents,p.quarantined]),[['3','3','0',0,'2']],'PART-003 all returns exhaust holdings while distinguishing quarantine')
    await returns('max','0.001','damaged','Excess replay',409)
    await returns('max','1','usable','Excess return',409)
    assert.deepEqual(await stock(),row,'PART-003 repeated/excess return is atomic and adds no quarantine')
    await h.api('part.count',cookie.lead,{part,counted:'2',seen:before.seen},409)
    const report=await h.api(`valuation?from=${today}&to=${today}`,cookie.lead)
    const values=report.parts.find(p=>p.id===part)
    assert.deepEqual([values.received,values.issued,values.returned,values.quarantined,values.closing],[{quantity:'4',valueCents:6000},{quantity:'-3',valueCents:-3000},{quantity:'3',valueCents:3000},{quantity:'-2',valueCents:-2000},{quantity:'2',valueCents:4000}])
    for(const measure of [p=>Math.round(Number(p.quantity)*1000),p=>p.valueCents]) assert.equal(['opening','received','issued','returned','counted','quarantined'].reduce((sum,key)=>sum+measure(values[key]),0),measure(values.closing),'PART-003 exact usable-stock reconciliation')
    const csv=await (await h.raw(`/app/parts/valuation.csv?from=${today}&to=${today}`,{cookie:cookie.lead})).text()
    assert.match(csv,/Quarantine adjustment quantity,Quarantine adjustment value \(USD\)/)
    assert.match(csv,/RETURN-6205,Drive bearing,each,0,0.00,4,60.00,-3,-30.00,3,30.00,0,0.00,-2,-20.00,2,40.00,20.00,0/)
    const movements=await (await h.raw('/app/stores/movements.csv',{cookie:cookie.lead})).text()
    assert.match(movements,/Damaged return quarantine,-(?:1|0.5),-(?:10.00|5.00),damaged/)
    const history=await h.api(`assets/${asset}/history`,cookie.lead)
    assert.ok(history.events.some(event=>event.what.includes('damaged, quarantined: Cracked bearing cage')),'PART-003 asset history names the damaged destination and reason')
    await h.api('workorder.issue',cookie.max,{workOrder:next,part,quantity:'2'})
    const empty=await stock()
    assert.deepEqual([empty.onHand,empty.valueCents,empty.quarantinedQuantity],['0',0,'2'])
    await h.api('workorder.issue',cookie.max,{workOrder:next,part,quantity:'0.001'},409)
    assert.deepEqual(await stock(),empty,'PART-003 quarantined bearings cannot be issued after usable stock runs out')
    const stockoutsBefore=(await h.api('stores',cookie.lead)).stockouts.events.filter(event=>event.part.id===part)
    assert.equal(stockoutsBefore.length,2,'PART-003 both real stockouts are work issues')
    await h.api('workorder.return',cookie.max,{workOrder:next,part,quantity:'1',condition:'damaged',reason:'Broken seal, held for disposition'})
    let final=await stock()
    assert.deepEqual([final.onHand,final.valueCents,final.quarantinedQuantity,final.quarantinedValueCents],['0',0,'3',4000])
    assert.deepEqual((await h.api('stores',cookie.lead)).stockouts.events.filter(event=>event.part.id===part),stockoutsBefore,'PART-003 an atomic damaged return never creates a phantom stockout')
    const quarantinedReturn=final.quarantines.find(row=>row.work_order_id===next)
    const disposition={returnId:quarantinedReturn.id,identity:'synthetic-gasket-disposition-1',kind:'release',quantity:'0.25',reason:'Inspected bearing surfaces and seals; cleared for reuse',confirmed:true}
    for(const who of ['lead','max','other','sam','agent']) await h.api('part.quarantine.dispose',cookie[who],disposition,403)
    await h.api('part.quarantine.dispose',undefined,disposition,401)
    assert.equal((await h.submit('part.quarantine.dispose',cookie.lead,disposition,`/app/parts/${part}`)).searchParams.get('error'),'forbidden')
    await h.api('part.quarantine.dispose',cookie.owner,{...disposition,confirmed:false},400)
    await h.api('part.quarantine.dispose',cookie.owner,{...disposition,reason:''},400)
    await h.api('part.quarantine.dispose',cookie.owner,{...disposition,kind:'discard_without_record'},400)
    await h.api('part.quarantine.dispose',cookie.owner,{...disposition,quantity:'1.001'},409)
    assert.deepEqual(await stock(),final,'Refused dispositions change no stock, value or history')
    if(process.env.RETURN_SCREENSHOTS) await browserDisposition(h,cookie,part,quarantinedReturn.id,next)
    else for(const identity of ['synthetic-gasket-disposition-1','synthetic-gasket-disposition-2']) await h.api('part.quarantine.dispose',cookie.owner,{...disposition,identity})
    const writeOff={...disposition,identity:'synthetic-gasket-writeoff-1',kind:'write_off',quantity:'0.125',reason:'Inspected cracked seal; removed from inventory'}
    await h.api('part.quarantine.dispose',cookie.owner,writeOff)
    const afterWriteOff=await stock()
    assert.deepEqual([afterWriteOff.onHand,afterWriteOff.valueCents,afterWriteOff.quarantinedQuantity,afterWriteOff.quarantinedValueCents],['0.5',1000,'2.375',2750],'Write-off only removes held quantity and value')
    assert.equal((await h.api('part.quarantine.dispose',cookie.owner,writeOff)).replayed,true)
    await h.api('part.quarantine.dispose',cookie.owner,{...writeOff,reason:'Changed reason'},409)
    assert.deepEqual(await stock(),afterWriteOff,'Identical replay and conflicting identity never dispose twice')
    const attempts=await Promise.all(['synthetic-gasket-last-1','synthetic-gasket-last-2'].map(identity=>h.raw('/api/gasket/part.quarantine.dispose',{cookie:cookie.owner,body:{...disposition,identity,quantity:'0.375'}})))
    assert.deepEqual(attempts.map(response=>response.status).sort(),[200,409],'Only one competing disposition can exhaust the held remainder')
    final=await stock()
    assert.deepEqual([final.onHand,final.valueCents,final.quarantinedQuantity,final.quarantinedValueCents],['0.875',1750,'2',2000])
    const disposedReturn=final.quarantines.find(row=>row.id===quarantinedReturn.id)
    assert.deepEqual([disposedReturn.remaining,disposedReturn.remaining_value_cents,disposedReturn.dispositions.reduce((sum,event)=>sum+event.value_cents,0)],['0',0,2000],'Partial dispositions exhaust original cents exactly')
    assert.equal((await h.api(`work/${next}`,cookie.max)).parts[0].quarantined,'0','Work summary shows current held quarantine after disposition')
    assert.ok(disposedReturn.dispositions.every(event=>event.actor_name==='Olive Owner'&&event.reason&&event.at>0))
    assert.deepEqual((await h.api(`work/${work}`,cookie.max)).parts,detail.parts,'Disposition never changes the original work credit')
    const reconciled=(await h.api(`valuation?from=${today}&to=${today}`,cookie.lead)).parts.find(row=>row.id===part)
    assert.deepEqual(reconciled.quarantined,{quantity:'-2.125',valueCents:-2250},'Release reverses quarantine, while write-off never adds usable value')
    for(const measure of [p=>Math.round(Number(p.quantity)*1000),p=>p.valueCents]) assert.equal(['opening','received','issued','returned','counted','quarantined'].reduce((sum,key)=>sum+measure(reconciled[key]),0),measure(reconciled.closing))
    assert.equal((await h.api('audit?action=part.disposition',cookie.owner)).rows.length,4,'Each successful disposition has one audit entry')
    await h.api('workorder.issue',cookie.max,{workOrder:next,part,quantity:'0.875'})
    await h.api('workorder.issue',cookie.max,{workOrder:next,part,quantity:'0.001'},409)
    final=await stock()
    assert.deepEqual([final.onHand,final.valueCents,final.quarantinedQuantity,final.quarantinedValueCents],['0',0,'2',2000],'Only inspected released goods can be issued')
    // Fractional disposition retains the final cent rather than rounding it away.
    const roundedPart=(await h.api('part.create',cookie.lead,{number:'RETURN-ROUND',name:'Bearing with retained odd cents',unit:'each'})).id
    await h.api('part.receive',cookie.lead,{part:roundedPart,quantity:'1',unitPrice:'10.01'})
    await h.api('workorder.issue',cookie.max,{workOrder:next,part:roundedPart,quantity:'1'})
    await h.api('workorder.return',cookie.max,{workOrder:next,part:roundedPart,quantity:'1',condition:'damaged',reason:'Inspect odd-value bearing'})
    const roundedReturn=(await h.api(`parts/${roundedPart}`,cookie.lead)).quarantines[0].id
    for(const [index,kind,quantity] of [[1,'release','0.333'],[2,'write_off','0.333'],[3,'release','0.334']]) await h.api('part.quarantine.dispose',cookie.owner,{...disposition,returnId:roundedReturn,identity:`synthetic-gasket-round-${index}`,kind,quantity})
    const rounded=await h.api(`parts/${roundedPart}`,cookie.lead)
    assert.deepEqual([rounded.onHand,rounded.valueCents,rounded.quarantinedQuantity,rounded.quarantinedValueCents],['0.667',668,'0',0])
    assert.deepEqual(rounded.quarantines[0].dispositions.map(event=>event.value_cents),[333,333,335],'Final disposition takes the exact remaining cents')
    // Supported archive command round trip retains the new immutable quarantine facts.
    await h.stop()
    const archive=join(h.installation.root,'exports','damaged-returns.rer')
    await h.installation.rer('export','--output',archive)
    restored=await installation()
    await restored.rer('import','--input',archive,'--yes')
    restoredHarness=await harness({vars:h.vars,installation:restored})
    const restoredCookie=await restoredHarness.signIn('return-lead@example.test')
    assert.deepEqual(await restoredHarness.api(`parts/${roundedPart}`,restoredCookie),rounded,'Archive retains exact fractional disposition values')
    assert.deepEqual(await restoredHarness.api(`parts/${part}`,restoredCookie),final,'PART-003 archive restores all usable stock, quarantine, original valuation and reasons')
    assert.deepEqual((await restoredHarness.api(`work/${work}`,restoredCookie)).parts,detail.parts)
    // Canonical identity changes must retain held damaged goods and cite their
    // offsets rather than presenting the returned quantity as available stock.
    const canonical=(await restoredHarness.api('part.create',restoredCookie,{number:'RETURN-6205-CANON',name:'Canonical drive bearing',unit:'each'})).id
    await restoredHarness.api('part.receive',restoredCookie,{part:canonical,quantity:'1',unitPrice:'5'})
    const agent=await restoredHarness.signIn('return-agent@example.test')
    const proposal=await restoredHarness.api('proposal.prepare',agent,{kind:'merge',payload:{source:part,canonical,reason:'Confirmed same stocking unit and bearing'},reasoning:'Consolidate supplier numbers, retain held damaged bearings'})
    const retained=(await restoredHarness.api('proposals',restoredCookie)).find(row=>row.id===proposal.id)
    assert.deepEqual(retained.basis.combined,{quantity:'1',unit:'each',valueCents:500})
    assert.equal(retained.basis.movements.reduce((sum,move)=>sum+Number(move.quantity),0),1,'PART-003 merge citations reconcile usable quantity including quarantine offsets')
    assert.equal(retained.basis.movements.reduce((sum,move)=>sum+move.valueCents,0),500)
    await restoredHarness.api('proposal.decide',restoredCookie,{proposal:proposal.id,hash:proposal.hash,decision:'approve'})
    const merged=await restoredHarness.api(`parts/${part}`,restoredCookie)
    assert.deepEqual([merged.onHand,merged.valueCents,merged.quarantinedQuantity,merged.quarantinedValueCents],['1',500,'2',2000],'PART-003 identity merge preserves quarantine and original value without releasing it')
    const restoredOwner=await restoredHarness.signIn('owner@example.test')
    await restoredHarness.api('part.quarantine.dispose',restoredOwner,{...disposition,returnId:merged.quarantines.find(row=>row.remaining!=='0').id,identity:'synthetic-gasket-after-merge',quantity:'0.25'})
    const afterMerge=await restoredHarness.api(`parts/${canonical}`,restoredCookie)
    assert.deepEqual([afterMerge.onHand,afterMerge.valueCents,afterMerge.quarantinedQuantity,afterMerge.quarantinedValueCents],['1.25',750,'1.75',1750],'Disposition after a canonical merge credits the canonical stock exactly once')
    console.log('PART-003 damaged returns, confirmed disposition, replay refusal, retained value, reconciliation, archive and canonical merge passed')
  } finally {await restoredHarness?.close();await restored?.remove();await h.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await workReturnsJourney()
