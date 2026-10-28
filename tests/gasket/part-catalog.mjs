// PART-008: two supplier catalogs, packs, retained identities and approved duplicate control.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { harness, file, exerciseKeyedActions } from './harness.mjs'
import { png } from './fixtures.mjs'

export async function partCatalogJourney(h,cookie,onReady) {
  if(onReady) return catalogJourney(h,cookie,onReady)
  const browser=await (await import('./part-catalog-browser.mjs')).catalogBrowser(h,cookie)
  try {return await catalogJourney(h,cookie,browser.run)} finally {await browser.close()}
}
async function catalogJourney(h,cookie,onReady) {
  exerciseKeyedActions(h, cookie.owner, ['catalog.import', 'catalog.apply', 'catalog.undo', 'catalog.receive', 'catalog.prefer', 'part.merge.approve'], { once: true })
  const supplier=async(name,email)=> (await h.api('supplier.save',cookie.owner,{name,contact:'Dina Morris',email,phone:'+1 216 555 0164',street:'4100 Lakeside Avenue',city:'Cleveland',state:'OH',zip:'44114',taxTreatment:'sales_tax',paymentTerms:'Net 30',leadDays:6,active:true})).id
  const first=await supplier('Lake Erie Bearings','catalog@erie.example.test'),second=await supplier('Midwest Industrial Supply','catalog@midwest.example.test')
  const header='number,name,unit,manufacturer,manufacturerNumber,vendorNumber,packUnit,packQuantity,price\n'
  const catalogA=header+'CAT-EACH,6205 sealed drive bearing,each,Acme,AC-6205,ERIE-6205,each,1,10.00\n'
  const catalogB=header+'CAT-BOX,6205 sealed bearing six pack,each,Acme,AC-6205,MID-6,box,6,48.00\n'
  const importFile=(supplier,csv)=>({supplier,file:file('bearings.csv',csv,'text/csv')})
  await h.api('catalog.import',undefined,importFile(first,catalogA),401)
  for(const who of ['lead','max','sam','agent']) await h.api('catalog.import',cookie[who],importFile(first,catalogA),403)
  const beforePreview={parts:await h.api('parts',cookie.lead),audit:await h.api('audit',cookie.owner)}
  const reviewedA=await h.api('catalog.preview',cookie.owner,importFile(first,catalogA))
  assert.equal(reviewedA.creates,1)
  assert.deepEqual({parts:await h.api('parts',cookie.lead),audit:await h.api('audit',cookie.owner)},beforePreview,'PART-008 catalog preview writes no records or audit')
  await h.api('catalog.import',cookie.owner,importFile(first,catalogA),400)
  await h.api('catalog.import',cookie.owner,{...importFile(first,catalogA.replace('10.00','11.00')),fingerprint:reviewedA.fingerprint},409)
  const firstImport=await h.api('catalog.apply',cookie.owner,{supplier:first,filename:'bearings.csv',base64:Buffer.from(catalogA).toString('base64'),mediaType:'text/csv',fingerprint:reviewedA.fingerprint})
  assert.equal(firstImport.created,1)
  const reviewedB=await h.api('catalog.preview',cookie.owner,importFile(second,catalogB))
  const browserImported=await onReady?.({stage:'import',h,cookie,supplier:second,csv:catalogB})
  if(!browserImported) assert.equal((await h.submit('catalog.import',cookie.owner,{supplier:second,fingerprint:reviewedB.fingerprint,file:new File([catalogB],'midwest.csv',{type:'text/csv'})},'/app/parts')).searchParams.has('error'),false)
  assert.equal((await h.api('catalog.import',cookie.owner,{...importFile(first,catalogA),fingerprint:reviewedA.fingerprint})).replayed,true,'PART-008 exact replay keeps one source identity')
  const source=(await h.api('parts/lookup?number=CAT-EACH',cookie.max)).id,canonical=(await h.api('parts/lookup?number=MID-6',cookie.max)).id
  assert.notEqual(source,canonical,'PART-008 duplicate manufacturer number never auto-merges stock')
  await h.api('parts/lookup?number=AC-6205',cookie.max,undefined,409)
  assert.deepEqual((await h.api('parts',cookie.lead)).filter(p=>[source,canonical].includes(p.id)).map(p=>p.onHand),['0','0'])
  const vendor=await h.api(`suppliers/${second}`,cookie.owner)
  await h.api('supplier.catalog',cookie.owner,{supplier:second,revision:vendor.revision,sku:'MID-6',description:'Cannot turn linked inventory into a service',kind:'service',unit:'hour',price:'48.00'},409)
  const unrelated=(await h.api('part.create',cookie.lead,{number:'CAT-WASHER',name:'Conveyor mounting washer',unit:'each',minimum:'0'})).id
  await h.api('part.receive',cookie.lead,{part:unrelated,quantity:'5',unitPrice:'1'})
  const beforeBad=await h.api('parts',cookie.lead)
  await h.api('catalog.preview',cookie.owner,importFile(second,catalogB+ 'BAD,Invalid row,each,Acme,OTHER,BAD,box,0.0001,2\n'),400)
  assert.deepEqual(await h.api('parts',cookie.lead),beforeBad,'PART-008 invalid catalog is wholly refused')
  let a=await h.api(`parts/${source}`,cookie.lead),b=await h.api(`parts/${canonical}`,cookie.lead)
  assert.deepEqual([a.catalog.items[0].packQuantity,b.catalog.items[0].packQuantity,b.catalog.items[0].price_cents],['1','6',4800])
  await h.api('catalog.receive',cookie.max,{item:b.catalog.items[0].id,quantity:'2'},403)
  await h.api('catalog.receive',cookie.lead,{item:b.catalog.items[0].id,quantity:'0.0001'},400)
  await h.api('catalog.receive',cookie.lead,{item:a.catalog.items[0].id,quantity:'2'})
  const browserReceived=await onReady?.({stage:'receive',h,cookie,source,canonical,item:b.catalog.items[0].id})
  if(!browserReceived) await h.api('catalog.receive',cookie.lead,{item:b.catalog.items[0].id,quantity:'2'})
  b=await h.api(`parts/${canonical}`,cookie.lead)
  assert.deepEqual([b.onHand,b.valueCents],['12',9600],'PART-008 box conversion and pack price preserve exact quantity/value')
  const kept=await h.api('part.photo',cookie.lead,{part:source,photo:{filename:'bearing-identification.png',base64:png.toString('base64'),type:'image/png'}})
  const photoPath=`/app/part-photos/${kept.photo}`
  const photoResponse=await h.raw(photoPath,{cookie:cookie.max});assert.equal(photoResponse.status,200,'PART-008 original photo download')
  const photoBytes=Buffer.from(await photoResponse.arrayBuffer())
  assert.equal(createHash('sha256').update(photoBytes).digest('hex'),kept.sha256)
  assert.equal((await h.raw(photoPath)).status,303)
  const tech=(await h.api('me',cookie.max)).id,today=(await h.api('me',cookie.lead)).today
  const asset=(await h.api('asset.create',cookie.lead,{tag:'CAT-CONV',name:'Packaging conveyor drive',location:'Assembly line 2',serial:'DRIVE-005'})).id
  const work=(await h.api('workorder.create',cookie.lead,{asset,title:'Replace conveyor drive bearing',due:today,assignee:tech})).id
  const center=(await h.api('costcenter.save',cookie.owner,{code:'PART-008',name:'Catalog maintenance stores',active:true})).id
  const owner=(await h.api('me',cookie.owner)).id
  const policy={revision:0,minimum:'0',maximum:'20',safetyStock:'0',reorderQuantity:'6',supplier:first,costCenter:center,purchaser:owner,unitPrice:'10',leadDays:6,active:false,automatic:false}
  await h.api('replenishment.policy',cookie.lead,{...policy,part:source})
  await h.api('replenishment.policy',cookie.lead,{...policy,part:canonical,supplier:second,unitPrice:'8'})
  const order=(await h.api('purchase.save',cookie.owner,{supplier:first,costCenter:center,deliveryOn:today,taxTreatment:'sales_tax',kind:['part'],description:['6205 drive bearing'],quantity:['1'],unit:['each'],unitPrice:['10'],reason:'Confirm source receiving history survives duplicate merge',asset,workOrder:work})).id
  await h.api('purchase.approve',cookie.sam,{order,revision:1})
  const revision=(await h.api(`purchase-orders/${order}`,cookie.owner)).current.id
  const receipt=(await h.api('receipt.receive',cookie.lead,{order,revisionId:revision,externalId:'PART008-RECEIPT',lines:[{line:0,part:source,quantity:'1',quarantine:'0',bin:'A3',lot:'6205-LOT-104'}]})).receipt
  const originalReceipt=await h.api(`receipts/${receipt}`,cookie.lead)
  await h.api('part.substitute',cookie.lead,{part:source,substitute:canonical,reason:'Identical Acme 6205 bearing in a supplier six pack'})
  await h.api('part.substitute',cookie.lead,{part:source,substitute:unrelated,reason:'Temporary test-approved stock alternative retained through merge'})
  const kit=(await h.api('kit.create',cookie.lead,{name:'PART-008 conveyor repair kit',part:[source,canonical,unrelated],quantity:['1','2','2']})).id
  await h.api('bom.revise',cookie.lead,{asset,part:[source],quantity:['1'],serialFrom:['DRIVE-001'],serialTo:['DRIVE-010'],alternateFor:[source],alternate:[canonical],alternateFrom:['DRIVE-001'],alternateTo:['DRIVE-003'],tool:['Bearing puller']})
  await h.api('workorder.reserve',cookie.lead,{workOrder:work,part:canonical,insteadOf:source,quantity:'1'},409)
  await h.api('workorder.reserve',cookie.lead,{workOrder:work,part:source,quantity:'1'})
  await h.api('workorder.reserve',cookie.lead,{workOrder:work,part:canonical,quantity:'2'})
  await h.api('workorder.issue',cookie.max,{workOrder:work,part:source,quantity:'1'})
  a=await h.api(`parts/${source}`,cookie.lead);b=await h.api(`parts/${canonical}`,cookie.lead)
  const originalMoves=[...a.moves,...b.moves].map(m=>[m.id,m.quantity_milli,m.value_cents,m.at,m.source_part_id]).sort()
  const preview={source,canonical}
  for(const who of ['max','sam','agent']) await h.api('part.merge.preview',cookie[who],preview,403)
  let proposed=await h.api('part.merge.preview',cookie.lead,preview)
  assert.equal(proposed.conflicts.length,1,'PART-008 conflicting serial compatibility is explicit')
  await h.api('part.merge.approve',cookie.lead,{...preview,fingerprint:proposed.fingerprint,reason:'Cannot discard incompatible serial ranges'},409)
  await h.api('bom.revise',cookie.lead,{asset,part:[source],quantity:['1'],serialFrom:['DRIVE-001'],serialTo:['DRIVE-010'],alternateFor:[source],alternate:[canonical],alternateFrom:['DRIVE-001'],alternateTo:['DRIVE-010'],tool:['Bearing puller'],note:'Confirmed both catalogs supply the identical bearing for the same serial range'})
  proposed=await h.api('part.merge.preview',cookie.lead,preview)
  for(const name of ['gk_part_moves','gk_part_substitutes','gk_kit_lines','gk_reservations','gk_bom_lines','gk_bom_alternates','gk_part_photos','gk_supplier_items','gk_part_aliases','gk_receipt_lines','gk_replenishment_policies','gk_replenishment_policy_revisions','catalogImports','audit']) assert.ok(proposed.dependencies[name].length,`PART-008 preview shows ${name}`)
  assert.deepEqual(proposed.parts.map(p=>p.id).sort(),[source,canonical].sort())
  await h.api('part.receive',cookie.lead,{part:canonical,quantity:'1',unitPrice:'8',note:'Delivery after merge preview'})
  await h.api('part.merge.approve',cookie.lead,{...preview,fingerprint:proposed.fingerprint,reason:'Manufacturer numbers match'},409)
  proposed=await h.api('part.merge.preview',cookie.lead,preview)
  await h.api('part.merge.approve',cookie.agent,{...preview,fingerprint:proposed.fingerprint,reason:'Agent may not approve'},403)
  const observedBeforeMerge=await h.api(`parts/${canonical}`,cookie.lead)
  const approvedByBrowser=await onReady?.({stage:'merge',h,cookie,source,canonical,preview:proposed})
  if(!approvedByBrowser) await h.api('part.merge.approve',cookie.lead,{...preview,fingerprint:proposed.fingerprint,reason:'Same manufacturer and stocking unit; retain conveyor serial restrictions'})
  await h.api('part.count',cookie.lead,{part:canonical,seen:observedBeforeMerge.seen,revision:observedBeforeMerge.revision,counted:observedBeforeMerge.onHand,note:'Count observed before canonical stock changed'},409)
  a=await h.api(`parts/${source}`,cookie.max);b=await h.api(`parts/${canonical}`,cookie.lead)
  assert.equal(a.id,canonical,'PART-008 old identity resolves to the approved canonical item')
  assert.deepEqual([b.onHand,b.reserved,b.available,b.valueCents],['15','2','13',12400])
  await h.api('part.count',cookie.lead,{part:canonical,seen:b.seen,revision:b.revision,counted:b.onHand,note:'Fresh combined shelf count after merge'})
  assert.equal((await h.api('parts',cookie.lead)).some(p=>p.id===source),false)
  for(const number of ['CAT-EACH','CAT-BOX','ERIE-6205','MID-6','AC-6205']) assert.equal((await h.api(`parts/lookup?number=${number}`,cookie.max)).id,canonical,`PART-008 scan ${number}`)
  assert.deepEqual(b.moves.filter(m=>originalMoves.some(x=>x[0]===m.id)).map(m=>[m.id,m.quantity_milli,m.value_cents,m.at,m.source_part_id]).sort(),originalMoves,'PART-008 every original movement and its source identity/value survives')
  assert.deepEqual(b.catalog.items.map(i=>[i.sku,i.packQuantity,i.price_cents]).sort(),[['ERIE-6205','1',1000],['MID-6','6',4800]])
  assert.ok(b.photos.some(p=>p.id===kept.photo));assert.equal(b.merges.length,1)
  const retainedReceipt=await h.api(`receipts/${receipt}`,cookie.lead)
  assert.equal(retainedReceipt.lines[0].source_part_id,source)
  assert.equal(retainedReceipt.lines[0].part_id,canonical)
  for(const key of ['id','quantity_milli','value_cents','bin','lot','receipt_id']) assert.equal(retainedReceipt.lines[0][key],originalReceipt.lines[0][key],`PART-008 receipt retains ${key}`)
  const policies=(await h.api('replenishment',cookie.lead)).policies
  assert.equal(policies.some(row=>row.part.id===source),false,'PART-008 source policy becomes history')
  assert.equal(policies.find(row=>row.part.id===canonical).policy.supplier,second,'PART-008 approved canonical supplier policy takes precedence')
  await h.api('catalog.prefer',cookie.lead,{item:a.catalog.items.find(i=>i.sku==='ERIE-6205').id})
  assert.deepEqual((await h.api(`parts/${canonical}`,cookie.lead)).catalog.items.filter(i=>i.preferred).map(i=>i.sku),['ERIE-6205'])
  const bom=(await h.api(`assets/${asset}`,cookie.lead)).bom
  assert.equal(bom.lines[0].part.id,source,'PART-008 original BOM identity remains readable')
  assert.equal(bom.lines[0].part.canonicalId,canonical)
  assert.deepEqual([bom.lines[0].serialFrom,bom.lines[0].serialTo,bom.lines[0].alternates[0].fits],['DRIVE-001','DRIVE-010',true])
  await h.api('workorder.return',cookie.max,{workOrder:work,part:canonical,quantity:'1'})
  b=await h.api(`parts/${canonical}`,cookie.lead)
  assert.deepEqual([b.onHand,b.valueCents,b.reserved],['16',13400,'3'],'PART-008 historical issue return uses its original value after merge')
  await h.api('part.substitute',cookie.lead,{part:canonical,substitute:unrelated,withdraw:true,reason:'Withdraw inherited alternative after confirming the duplicate bearing'})
  const secondWork=(await h.api('workorder.create',cookie.lead,{asset,title:'Spare drive bearing repair',due:today,assignee:tech})).id
  await h.api('workorder.reserve',cookie.lead,{workOrder:secondWork,part:unrelated,insteadOf:canonical,quantity:'1'},409)
  await h.api('workorder.reserve',cookie.lead,{workOrder:secondWork,kit})
  assert.equal((await h.api(`parts/${unrelated}`,cookie.lead)).reserved,'2','PART-008 merge does not consume an unrelated kit item as canonical stock')
  assert.equal((await h.api(`parts/${canonical}`,cookie.lead)).reserved,'6','PART-008 retained two-line kit reserves combined demand')
  const values=await h.api(`valuation?from=${today}&to=${today}`,cookie.lead)
  assert.deepEqual(values.parts.filter(p=>p.id===canonical).map(p=>p.closing),[{quantity:'16',valueCents:13400}])
  assert.equal(values.parts.some(p=>p.id===source),false,'PART-008 reconciliation never double counts merged stock')
  assert.ok((await h.api(`stores?from=${today}&to=${today}`,cookie.lead)).demand.committed.some(p=>p.id===canonical&&p.reserved==='6'))
  await h.api('catalog.undo',cookie.owner,{job:firstImport.job},409)
  // A separate unused source is reversible; later dependencies never disappear.
  const third=await supplier('Ohio Seal Supply','catalog@seals.example.test')
  const temporary=importFile(third,header+'CAT-TEMP,Spare O ring,each,Acme,OR-8,TEMP-OR,bag,3,7.99\nCAT-FINE,Precision seal stock,m,Acme,SEAL-1,FINE-SEAL,roll,1.001,0.01\n')
  const temporaryReview=await h.api('catalog.preview',cookie.owner,temporary)
  const temporaryImport=await h.api('catalog.import',cookie.owner,{...temporary,fingerprint:temporaryReview.fingerprint})
  const fine=(await h.api('parts/lookup?number=FINE-SEAL',cookie.owner)).id
  const fineItem=(await h.api(`parts/${fine}`,cookie.lead)).catalog.items[0].id
  await h.api('catalog.receive',cookie.lead,{item:fineItem,quantity:'0.001'},400)
  await h.api('catalog.undo',cookie.lead,{job:temporaryImport.job},403)
  assert.equal((await h.api('catalog.undo',cookie.owner,{job:temporaryImport.job})).undone,true)
  await h.api('parts/lookup?number=CAT-TEMP',cookie.owner,undefined,404)
  assert.equal((await h.api('catalog.undo',cookie.owner,{job:temporaryImport.job})).replayed,true)
  const freshReview=await h.api('catalog.preview',cookie.owner,temporary)
  await h.api('catalog.import',cookie.owner,{...temporary,fingerprint:freshReview.fingerprint})
  const fractional=(await h.api('parts/lookup?number=TEMP-OR',cookie.owner)).id
  const fractionalItem=(await h.api(`parts/${fractional}`,cookie.lead)).catalog.items[0].id
  const fractionalReceipt=await h.api('catalog.receive',cookie.lead,{item:fractionalItem,quantity:'0.5'})
  assert.deepEqual([fractionalReceipt.quantity,fractionalReceipt.valueCents],['1.5',400],'PART-008 exact pack quantity and half-up extended cents')
  assert.equal((await h.api('metrics',cookie.lead)).quality.unmatchedCosts.unpricedMovements.some(row=>row.id===fractionalReceipt.id),false,'PART-008 fractional unit price keeps a known receipt value')
  await onReady?.({stage:'done',h,cookie,source,canonical,photoPath})
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const h=await harness();let browser
  try {
    const cookie={owner:await h.owner()}
    await h.api('site.configure',cookie.owner,{name:'Lake Erie Manufacturing',timezone:'America/New_York'})
    for(const [key,role,name] of [['lead','lead','Mara Chen'],['max','maintainer','Luis Ortega'],['sam','supervisor','Rosa Alvarez'],['agent','agent','Stores assistant']]) {
      await h.api('access.give',cookie.owner,{name,email:`${key}@example.test`,role});cookie[key]=await h.signIn(`${key}@example.test`)
    }
    if(process.env.CATALOG_SCREENSHOTS) browser=await (await import('./part-catalog-browser.mjs')).catalogBrowser(h,cookie)
    await partCatalogJourney(h,cookie,browser?.run)
    console.log('PART-008 two supplier catalogs, exact packs, aliases, photos, compatibility and approved canonical history passed')
  } finally {await browser?.close();await h.close()}
}
