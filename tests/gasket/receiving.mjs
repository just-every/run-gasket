// BUY-004: receiving, quarantine and returns through actual forms/JSON/downloads.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
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
  return {order}
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
    await receivingJourney(h,cookie,onReady)
    console.log('BUY-004 partial receiving, inspection and returns passed')
  }finally{await h.close()}
}
