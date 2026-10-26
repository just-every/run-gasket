// BUY-004: receiving, quarantine and returns through actual forms/JSON/downloads.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { installation } from './installation.mjs'
import { harness, file } from './harness.mjs'

export async function receivingJourney(h, cookie, onReady) {
  const supplier = (await h.api('supplier.save', cookie.owner, { name: 'Cleveland Motion & Seal Supply', contact: 'Dina Morales', email: 'deliveries@motion.example.test', phone: '+1 216 555 0182', street: '4100 Lakeside Avenue', city: 'Cleveland', state: 'OH', zip: '44114', taxTreatment: 'sales_tax', taxNote: 'Destination tax recorded from packing slip', paymentTerms: 'Net 30', leadDays: 6, active: true })).id
  const costCenter = (await h.api('costcenter.save', cookie.owner, { code: 'BUY-004', name: 'Receiving dock maintenance', active: true })).id
  const part = (await h.api('part.create', cookie.lead, { number: 'RCV-6205', name: '6205 sealed conveyor drive bearing', unit: 'each', minimum: '4', location: 'North stores · A3' })).id
  const belt = (await h.api('part.create', cookie.lead, { number: 'RCV-VB42', name: 'VB42 drive belt', unit: 'each', minimum: '1', location: 'North stores · B2' })).id
  const facts = { supplier, costCenter, deliveryOn: (await h.api('me', cookie.owner)).today, taxTreatment: 'sales_tax', kind: ['part', 'part'], description: ['6205 sealed conveyor drive bearing', 'VB42 drive belt'], quantity: ['10', '4'], unit: ['each', 'each'], unitPrice: ['10.00', '10.00'], reason: 'Rebuild conveyor drive at the planned stop' }
  const order = (await h.api('purchase.save', cookie.owner, facts)).id
  const read = () => h.api(`purchase-orders/${order}/receipts`, cookie.lead)
  const rev = (await h.api(`purchase-orders/${order}`, cookie.owner)).current.id
  const slip = 'Delivery CM-2048: 6 bearings, 2 belts; one bearing package damaged'
  const payload = { order, revisionId: rev, externalId: 'CM-2048', freight: '8.00', salesTax: '4.00', note: 'Inspected at north receiving dock', backorderNote: 'Four bearings and two belts remain with supplier', packingSlip: file('packing-slip-CM-2048.txt', slip, 'text/plain'), lines: [{ line: 0, part, quantity: '6', quarantine: '1', bin: 'A3', lot: 'L-6205-1020' }, { line: 1, part: belt, quantity: '2', quarantine: '0', bin: 'B2', lot: 'VB-42-18' }] }
  await h.api('receipt.receive', cookie.lead, payload, 409)
  await h.api('purchase.approve', cookie.sam, { order, revision: 1 })
  for (const who of ['max', 'sam', 'agent']) await h.api('receipt.receive', cookie[who], payload, 403)
  await h.api('receipt.receive', undefined, payload, 401)
  await h.api('receipt.receive', cookie.lead, { ...payload, externalId: 'BAD-PRECISION', lines: [{ ...payload.lines[0], quantity: '1.0001' }] }, 400)
  await h.api('receipt.receive', cookie.lead, { ...payload, externalId: 'BAD-QUANTITY', lines: [{ ...payload.lines[0], quantity: '11' }] }, 409)
  await h.api('receipt.receive', cookie.lead, { ...payload, externalId: 'BAD-UNIT', lines: [{ ...payload.lines[0], serial: 'SER-INVALID' }] }, 400)
  // The same public form used on the PO page, including the original packing slip.
  const destination = `/app/purchase-orders/${order}`
  const submitted = await h.submit('receipt.receive', cookie.lead, { order, revisionId: rev, externalId: payload.externalId, freight: payload.freight, salesTax: payload.salesTax, note: payload.note, backorderNote: payload.backorderNote, line: ['0','1'], part: [part,belt], quantity: ['6','2'], quarantine: ['1','0'], bin: ['A3','B2'], lot: ['L-6205-1020','VB-42-18'], serial: ['',''], packingSlip: new File([slip], 'packing-slip-CM-2048.txt', { type: 'text/plain' }) }, destination)
  assert.equal(submitted.searchParams.has('error'), false, submitted.search)
  let data = await read(), receipt = data.receipts[0], first = receipt.lines.find(row => row.line_index === 0)
  assert.equal(receipt.backorder_note,payload.backorderNote)
  assert.equal(data.revisions[0].lines[0].backorder,'4')
  assert.deepEqual(data.revisions[0].lines.map(row => [row.ordered,row.received,row.usable,row.quarantine,row.returned,row.outstanding]), [['10','6','5','1','0','4'],['4','2','2','0','0','2']])
  assert.deepEqual(receipt.lines.map(row => [row.freight_cents,row.tax_cents,row.value_cents]), [[600,300,6900],[200,100,2300]])
  let stock = await h.api(`parts/${part}`, cookie.lead)
  assert.deepEqual([stock.onHand,stock.valueCents],['5',5750])
  assert.equal((await h.api(`parts/${belt}`,cookie.lead)).valueCents,2300)
  assert.equal((await h.api('receipt.receive',cookie.lead,payload)).replayed,true)
  assert.deepEqual(await read(),data,'the receipt identity replay changes no source record or stock')
  await h.api('receipt.receive',cookie.lead,{...payload,note:'Changed inspection'},409)
  await h.api('receipt.receive',cookie.lead,{...payload,externalId:'OVER-DELIVERY',lines:[{...payload.lines[0],quantity:'5'}]},409)
  const evidence=receipt.evidence[0], path=`/app/receipt-evidence/${evidence.id}`
  assert.equal(await (await h.raw(path,{cookie:cookie.max})).text(),slip)
  assert.equal(evidence.sha256,createHash('sha256').update(slip).digest('hex'))
  assert.equal((await h.raw(path)).status,303)
  await h.api(`receipts/${receipt.id}`,undefined,undefined,401)
  await onReady?.({h,cookie,order,receipt,part,belt,variant:'quarantine'})
  await h.api('receipt.inspect',cookie.max,{receiptLine:first.id,kind:'return',source:'quarantine',quantity:'1',reason:'Damaged seal returned under RMA-704'},403)
  const returned=await h.submit('receipt.inspect',cookie.lead,{receiptLine:first.id,kind:'return',source:'quarantine',quantity:'1',reason:'Damaged seal returned under RMA-704'},destination)
  assert.equal(returned.searchParams.has('error'),false)
  await h.api('receipt.inspect',cookie.lead,{receiptLine:first.id,kind:'return',source:'quarantine',quantity:'1',reason:'Duplicate return'},409)
  data=await read(); first=data.receipts[0].lines.find(row=>row.id===first.id)
  assert.deepEqual([first.usable,first.quarantine,first.returned,data.revisions[0].lines[0].outstanding],['5','0','1','5'])
  assert.equal((await h.api(`parts/${part}`,cookie.lead)).onHand,'5','quarantine return never removes usable units')
  // A second delivery can be inspected later, and lot/serial traceability survives.
  const serialPayload={...payload,externalId:'CM-2050',freight:'0.01',salesTax:'0',packingSlip:undefined,lines:[{line:0,part,quantity:'1',quarantine:'1',bin:'A3',lot:'L-6205-1021',serial:'SN-6205-0102'}]}
  const serialReceipt=await h.api('receipt.receive',cookie.owner,serialPayload)
  const serialized=await h.api(`receipts/${serialReceipt.receipt}`,cookie.lead)
  assert.equal(serialized.lines[0].serial,'SN-6205-0102')
  await h.api('receipt.receive',cookie.owner,{...serialPayload,externalId:'DUP-SERIAL'},409)
  await h.api('receipt.inspect',cookie.lead,{receiptLine:serialized.lines[0].id,kind:'release',source:'quarantine',quantity:'1',reason:'Seal and bearing passed incoming inspection'})
  await h.api('receipt.inspect',cookie.lead,{receiptLine:serialized.lines[0].id,kind:'release',source:'quarantine',quantity:'1',reason:'Repeated release'},409)
  stock=await h.api(`parts/${part}`,cookie.lead)
  assert.deepEqual([stock.onHand,stock.valueCents],['6',6751])
  await h.api('receipt.inspect',cookie.lead,{receiptLine:serialized.lines[0].id,kind:'return',source:'usable',quantity:'1',reason:'Supplier requested serial recall'})
  assert.deepEqual([(await h.api(`parts/${part}`,cookie.lead)).onHand,(await h.api(`parts/${part}`,cookie.lead)).valueCents],['5',5626])
  const detail=await h.api(`receipts/${serialReceipt.receipt}`,cookie.max)
  assert.deepEqual(detail.lines[0].events.map(event=>event.kind),['release','return'])
  // Controlled work issue selects the exact incoming source, not just its part.
  const controlled=(await h.api('part.create',cookie.lead,{number:'TRACE-6205',name:'Traceable drive bearing',unit:'each'})).id
  const controlledOrder=(await h.api('purchase.save',cookie.owner,{...facts,kind:['part'],description:['Controlled bearings'],quantity:['5'],unit:['each'],unitPrice:['10']})).id
  const controlledRevision=(await h.api(`purchase-orders/${controlledOrder}`,cookie.owner)).current.id
  await h.api('purchase.approve',cookie.sam,{order:controlledOrder,revision:1})
  const expiry=(await h.api('me',cookie.owner)).today
  const received=await h.api('receipt.receive',cookie.lead,{order:controlledOrder,revisionId:controlledRevision,externalId:'synthetic-gasket-trace-1',lines:[
    {line:0,part:controlled,quantity:'1',bin:'North A3',lot:'Bearing lot 1',serial:'synthetic-gasket-serial-1',expiresOn:expiry},
    {line:0,part:controlled,quantity:'2',bin:'South B2',lot:'Bearing lot 2',expiresOn:expiry},
    {line:0,part:controlled,quantity:'2',bin:'Hold C1',lot:'Expired bearing lot',expiresOn:'2000-01-01'}]})
  const source=(await h.api(`receipts/${received.receipt}`,cookie.lead)).lines
  const serial=source.find(row=>row.serial), bulk=source.find(row=>row.bin==='South B2'), expired=source.find(row=>row.bin==='Hold C1')
  const technician=(await h.api('me',cookie.max)).id
  const asset=(await h.api('asset.create',cookie.lead,{tag:'TRACE-MOTOR',name:'Trace motor',location:'Hall'})).id
  const work=(await h.api('workorder.create',cookie.lead,{asset,title:'Fit traceable bearing',due:expiry,assignee:technician})).id
  const issue={workOrder:work,part:controlled,quantity:'1',receiptLine:serial.id,identity:'synthetic-gasket-issue-1'}
  await h.api('workorder.issue',cookie.max,{...issue,receiptLine:''},409)
  await h.api('workorder.issue',cookie.max,{...issue,receiptLine:expired.id},409)
  await h.api('workorder.issue',cookie.max,{...issue,quantity:'0.5'},400)
  await h.api('workorder.issue',cookie.sam,issue,403)
  await h.api('workorder.issue',undefined,issue,401)
  await h.api('workorder.issue',cookie.max,issue)
  const afterIssue=await h.api(`parts/${controlled}`,cookie.lead)
  const issued=afterIssue.moves.find(row=>row.kind==='issue')
  assert.deepEqual([issued.controlled_source,issued.bin,issued.lot,issued.serial],[serial.id,'North A3','Bearing lot 1','synthetic-gasket-serial-1'])
  await h.api('workorder.issue',cookie.max,{...issue,receiptLine:bulk.id},409)
  await h.api('workorder.issue',cookie.max,{...issue,identity:'synthetic-gasket-issue-2'},409)
  assert.deepEqual(await h.api(`parts/${controlled}`,cookie.lead),afterIssue,'A replay or exhausted serial source moves no stock')
  await h.api('receipt.inspect',cookie.lead,{receiptLine:serial.id,kind:'return',source:'usable',quantity:'1',reason:'Cannot return a bearing held by work'},409)
  await h.api('workorder.return',cookie.max,{workOrder:work,part:controlled,quantity:'1',condition:'damaged',reason:'Damaged cage'},409)
  await h.api('workorder.return',cookie.max,{workOrder:work,part:controlled,quantity:'1',sourceIssue:issued.id,condition:'damaged',reason:'Damaged cage'})
  await h.api('workorder.return',cookie.max,{workOrder:work,part:controlled,quantity:'1',sourceIssue:issued.id,condition:'usable'},409)
  const traced=await h.api(`parts/${controlled}`,cookie.lead)
  assert.deepEqual([traced.onHand,traced.quarantinedQuantity,traced.quarantinedValueCents],['4','1',1000])
  assert.equal(traced.stockSources.find(row=>row.id===serial.id).onHand,'0')
  const expiring=(await h.api('stores',cookie.lead)).expiringLots.filter(row=>row.part_id===controlled)
  assert.deepEqual(expiring.map(row=>[row.bin,row.onHand,row.expired]).sort(),[['Hold C1','2',true],['South B2','2',false]])
  await h.api('stores',cookie.max,undefined,403)
  await h.api('stores',undefined,undefined,401)
  const damagedReturn=traced.quarantines[0].id
  const disposition={returnId:damagedReturn,identity:'synthetic-gasket-trace-disposition',kind:'release',quantity:'1',reason:'Inspected and cleared complete serial',confirmed:true}
  await h.api('part.quarantine.dispose',cookie.owner,{...disposition,quantity:'0.5'},400)
  await h.api('part.quarantine.dispose',cookie.owner,disposition)
  assert.equal((await h.api(`parts/${controlled}`,cookie.lead)).stockSources.find(row=>row.id===serial.id).onHand,'1','Inspected release retains the same serial and bin')
  await h.api('workorder.issue',cookie.max,{...issue,identity:'synthetic-gasket-reissued'})
  const competing=await Promise.all(['synthetic-gasket-compete-1','synthetic-gasket-compete-2'].map(identity=>h.raw('/api/gasket/workorder.issue',{cookie:cookie.max,body:{...issue,receiptLine:bulk.id,quantity:'2',identity}})))
  assert.deepEqual(competing.map(response=>response.status).sort(),[200,409],'Only one competing issue can consume the source')
  const bulkIssue=(await h.api(`parts/${controlled}`,cookie.lead)).moves.find(row=>row.kind==='issue'&&row.controlled_source===bulk.id)
  await h.api('workorder.return',cookie.max,{workOrder:work,part:controlled,sourceIssue:bulkIssue.id,quantity:'2',condition:'usable'})
  assert.equal((await h.api(`parts/${controlled}`,cookie.lead)).stockSources.find(row=>row.id===bulk.id).onHand,'2','Usable return replenishes its original bin and lot')
  const portal=(await h.api('request.portal',cookie.owner,{name:'Stores intake',mode:'public',publicConsent:true})).id
  const target=(await h.api('request.target',cookie.owner,{portal,kind:'bin',name:'South B2',publishConsent:true})).id
  const scanned=await h.raw(`/scan/${target}`,{cookie:cookie.max})
  assert.match(await scanned.text(),/Open authorized stock sources/)
  const publicScan=await h.raw(`/scan/${target}`)
  assert.equal(publicScan.status,303)
  assert.ok(!publicScan.headers.get('location').includes('/app/parts'))
  assert.equal((await h.raw('/app/parts?bin=South%20B2')).status,303)
  assert.equal((await h.raw('/app/parts?bin=South%20B2&site=Unknown',{cookie:cookie.lead})).status,404)
  assert.match(await (await h.raw('/app/parts?bin=South%20B2',{cookie:cookie.max})).text(),/Bearing lot 2/)
  if(process.env.RECEIVING_SCREENSHOTS) await (await import('./receiving-browser.mjs')).controlledBrowser({h,cookie,work,part:controlled,order:controlledOrder,source:bulk.id,target})
  else for(const identity of ['synthetic-gasket-browser-1440','synthetic-gasket-browser-390']) await h.api('workorder.issue',cookie.max,{...issue,receiptLine:bulk.id,identity})
  assert.equal((await h.api(`parts/${controlled}`,cookie.lead)).stockSources.find(row=>row.id===bulk.id).onHand,'0')
  await h.api('purchase.save',cookie.owner,{...facts,order,revision:1,quantity:['12','4']})
  await h.api('receipt.receive',cookie.lead,{...serialPayload,externalId:'UNSENT-SUPERSEDED'},409)
  assert.equal((await h.api(`purchase-orders/${order}`,cookie.owner)).revisions[0].snapshot.lines[0].quantity,'10')
  assert.equal((await read()).receipts.length,2)
  const metrics=await h.api('metrics',cookie.lead)
  assert.ok(metrics.definitions.some(row=>row.clause==='BUY-004'&&row.formula&&row.sourceDoor))
  assert.ok((await h.api('audit?action=purchase.receive',cookie.owner)).rows.some(row=>row.subject===order))
  const html=await (await h.raw(destination,{cookie:cookie.lead})).text()
  for(const text of ['CM-2048','RMA-704','SN-6205-0102','packing-slip-CM-2048.txt']) assert.ok(html.includes(text),text)
  await onReady?.({h,cookie,order,receipt,part,belt,variant:'returned'})
  const lastBulkIssue=(await h.api(`parts/${controlled}`,cookie.lead)).moves.find(row=>row.kind==='issue'&&row.controlled_source===bulk.id)
  await h.api('workorder.return',cookie.max,{workOrder:work,part:controlled,sourceIssue:lastBulkIssue.id,quantity:'1',condition:'usable'})
  await h.api('part.count',cookie.lead,{part:controlled,counted:'4',note:'Unallocated extra unit found; reconcile bins before issue'})
  const heldForCount=await h.api(`parts/${controlled}`,cookie.lead)
  assert.ok(heldForCount.stockSources.every(row=>row.reconciliationRequired))
  const countRefusal=await h.api('workorder.issue',cookie.max,{...issue,receiptLine:bulk.id,identity:'synthetic-gasket-after-count'},409)
  assert.equal(countRefusal.error,'source_reconciliation_required')
  await h.api('workorder.issue',cookie.max,{...issue,receiptLine:'',identity:'synthetic-gasket-count-bypass'},409)
  assert.deepEqual(await h.api(`parts/${controlled}`,cookie.lead),heldForCount,'An unallocated count cannot silently invent or bypass a controlled source')
  if(process.env.RECEIVING_SCREENSHOTS) await (await import('./receiving-browser.mjs')).controlledRefusal({h,cookie,part:controlled,work})
  return {order,controlled}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const h=await harness()
  try {
    const cookie={owner:await h.owner()}
    await h.api('site.configure',cookie.owner,{name:'Great Lakes Manufacturing',timezone:'America/New_York'})
    for(const [key,role,name] of [['lead','lead','Mara Chen'],['max','maintainer','Luis Ortega'],['sam','supervisor','Rosa Alvarez'],['agent','agent','Stores assistant']]) {
      await h.api('access.give',cookie.owner,{name,email:`${key}@example.test`,role})
      cookie[key]=await h.signIn(`${key}@example.test`)
    }
    const onReady=process.env.RECEIVING_SCREENSHOTS?(await import('./receiving-browser.mjs')).receivingBrowser:undefined
    const result=await receivingJourney(h,cookie,onReady)
    const expected=await h.api(`parts/${result.controlled}`,cookie.lead)
    await h.stop()
    const archive=join(h.installation.root,'exports','controlled-stock.rer')
    await h.installation.rer('export','--output',archive)
    const restored=await installation()
    let reader
    try {
      await restored.rer('import','--input',archive,'--yes')
      reader=await harness({vars:h.vars,installation:restored})
      const lead=await reader.signIn('lead@example.test')
      assert.deepEqual(await reader.api(`parts/${result.controlled}`,lead),expected,'Archive retains source identities, expiry, controlled movements and disposition links')
    } finally {await reader?.close();await restored.remove()}
    console.log('BUY-004 partial receiving, inspection and returns passed')
  }finally{await h.close()}
}
