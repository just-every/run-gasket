import assert from 'node:assert/strict'

export async function costingJourney(h,cookie,{work,other,asset,today,people}) {
  const get=(query='',who='owner')=>h.api(`costing${query?'?'+query:''}`,cookie[who])
  const detail=()=>h.api(`work/${work}`,cookie.owner)
  const parent=(await h.api('asset.create',cookie.lead,{tag:'LAB-LINE',name:'Packing line',location:'Packing hall',level:'line'})).id
  await h.api('asset.move',cookie.lead,{asset,parent,revision:(await h.api(`assets/${asset}`,cookie.lead)).revision})
  const center=(await h.api('costcenter.save',cookie.owner,{code:'LAB-REPAIR',name:'Packing maintenance',active:true})).id
  const dimensions={workOrder:work,costCenter:center,version:(await detail()).version}
  await h.api('work.cost_center',cookie.lead,dimensions,403)
  await h.submit('work.cost_center',cookie.owner,dimensions,`/app/costing?workOrder=${work}`)
  await h.api('work.cost_center',cookie.owner,dimensions,409)
  const part=(await h.api('part.create',cookie.lead,{number:'LAB-BEARING',name:'Conveyor bearing',unit:'each'})).id
  await h.api('part.receive',cookie.lead,{part,quantity:'10',unitPrice:'10.00',freight:'10.00',tax:'0.00',note:'First bearing delivery'})
  await h.api('workorder.issue',cookie.max,{workOrder:work,part,quantity:'3'})
  const issued=(await detail()).parts.find(row=>row.id===part).usedCents
  assert.equal(issued,3300)
  await h.api('part.price',cookie.lead,{part,price:'999.00'})
  await h.api('workorder.return',cookie.max,{workOrder:work,part,quantity:'1',reason:'unused',note:'One bearing not needed'})
  assert.equal((await detail()).parts.find(row=>row.id===part).usedCents,2200)
  await h.api('work.cost',cookie.lead,{workOrder:work,category:'tools',amount:'25.00',note:'Alignment tool hire'})
  await h.api('work.cost',cookie.lead,{workOrder:work,category:'other',amount:'12.00',note:'Cleaning consumables'})
  await h.api('work.cost',cookie.lead,{workOrder:work,category:'labor',amount:'5.00',note:'Retained manual labor adjustment'})
  await h.api('work.cost',cookie.lead,{workOrder:work,category:'parts',amount:'2.00',note:'Retained externally supplied part cost'})
  const base={workOrder:work,category:'other',note:'Reviewed maintenance cost projection'}
  await h.api('work.cost_comparison',cookie.lead,{...base,kind:'estimate',amount:'800.00'},403)
  const estimate=await h.api('work.cost_comparison',cookie.owner,{...base,kind:'estimate',amount:'800.00',reference:'Estimate A'})
  await h.api('work.cost_comparison',cookie.owner,{...base,kind:'estimate',amount:'-50.00',corrects:estimate.id,reference:'Estimate correction'})
  await h.api('work.cost_comparison',cookie.owner,{...base,kind:'estimate',amount:'-900.00',corrects:estimate.id,reference:'Invalid credit'},409)
  await h.api('work.cost_comparison',cookie.owner,{...base,kind:'commitment',amount:'250.00',reference:'External contractor agreement'})
  await h.api('work.cost_comparison',cookie.owner,{...base,kind:'posted',amount:'100.00'},400)
  await h.submit('work.cost_comparison',cookie.owner,{...base,kind:'posted',amount:'100.00',reference:'synthetic-gasket-2'},`/app/costing?workOrder=${work}`)
  const before=await get(`workOrder=${work}`),actual=64100
  assert.deepEqual(Object.fromEntries(Object.entries(before.totals.amounts).map(([key,row])=>[key,row.cents])),{actual,estimate:75000,commitment:25000,posted:10000})
  assert.equal(before.totals.approvedMinutes,255)
  assert.equal(before.totals.contractorMinutes,120)
  assert.deepEqual(Object.fromEntries(Object.entries(before.totals.byCategory).map(([key,row])=>[key,row.actual.cents])),{parts:2400,labor:33000,contractor:25000,tools:2500,other:1200})
  assert.equal(before.sources.filter(row=>row.source==='stock_issue').reduce((sum,row)=>sum+row.cents,0),3300)
  assert.equal(before.sources.filter(row=>row.source==='stock_return').reduce((sum,row)=>sum+row.cents,0),-1100)
  assert.equal((await detail()).costs.totalCents,actual)
  const report=await get(`asset=${parent}`)
  assert.equal(report.byAsset.find(row=>row.id===asset).amounts.actual.cents,actual)
  assert.equal(report.byAsset.find(row=>row.id===parent).amounts.actual.cents,null)
  assert.equal(report.bySubtree.find(row=>row.id===parent).amounts.actual.cents,actual)
  assert.equal(report.totals.amounts.actual.cents,actual,'parent includes sources only once')
  const site=await get()
  assert.equal(site.byWork.find(row=>row.id===work).amounts.actual.cents,actual)
  assert.equal(site.byCostCenter.find(row=>row.id===center).amounts.actual.cents,actual)
  assert.ok(site.coverage.workWithoutActuals.some(row=>row.id===other))
  const scoped=await get(`costCenter=${center}`)
  assert.equal(scoped.totals.amounts.actual.cents,actual)
  assert.equal((await get(`workOrder=${work}&from=${today}&to=${today}`)).totals.amounts.actual.cents,actual)
  await get(`from=${today}&to=2000-01-01`).then(()=>assert.fail('inverted dates accepted'),error=>assert.match(error.message,/400/))
  for(const who of ['lead','sam']) {
    const restricted=await get(`workOrder=${work}`,who)
    assert.equal(restricted.totals.amounts.actual.cents,actual)
    assert.equal(restricted.totals.approvedMinutes,255)
    assert.ok(restricted.sources.every(row=>!('personId' in row)&&!('rateId' in row)))
    assert.equal(restricted.sources.filter(row=>row.source==='approved_labor_total').length,1)
    assert.equal(restricted.sources.some(row=>row.source==='approved_labor'),false)
  }
  await h.api('costing',cookie.max,undefined,403)
  await h.api('costing',undefined,undefined,401)
  // Each download is one declared grouping; parent rows disclose their overlapping scopes.
  for(const group of ['sources','work','asset','subtree','costCenter','site']) {
    const response=await h.raw(`/app/costing.csv?workOrder=${work}&groupBy=${group}`,{cookie:cookie.lead})
    assert.equal(response.status,200)
    const csv=await response.text()
    assert.match(csv,/USD/)
    if(group==='sources') assert.match(csv,/stock_return/)
    else assert.ok(csv.includes('330.00'),'labor actual includes retained manual entry once')
    assert.equal((await h.raw(`/app/costing.csv?groupBy=${group}`,{cookie:cookie.max})).status,403)
  }
  const vendor=(await h.api('supplier.save',cookie.owner,{name:'Precision Drive Service',contact:'Alex Kim',email:'service@example.test',phone:'+1 216 555 0118',street:'100 Service Road',city:'Cleveland',state:'OH',zip:'44115',taxTreatment:'sales_tax',taxNote:'Recorded tax only',paymentTerms:'Net 30',leadDays:2,active:true})).id
  await h.api('spend.policy',cookie.owner,{costCenter:'',from:today,to:today,budget:'1000000.00',threshold:['0'],approver:[people.sam]})
  await h.api('spend.policy',cookie.owner,{costCenter:center,from:today,to:today,budget:'10000.00',threshold:['0'],approver:[people.sam]})
  const facts={supplier:vendor,costCenter:center,asset,workOrder:work,deliveryOn:today,taxTreatment:'sales_tax',kind:['service'],description:['Post-repair vibration analysis'],quantity:['1'],unit:['visit'],unitPrice:['150.00'],reason:'Verify repair under production load',freight:'0',salesTax:'0',useTax:'0'}
  const order=(await h.api('purchase.save',cookie.owner,facts)).id
  const po=await h.api(`purchase-orders/${order}`,cookie.owner)
  for(const step of po.route.required) await h.api('purchase.approve',cookie.sam,{order,revision:1,step:step.id,note:'Independent scope review'})
  const committed=await get(`workOrder=${work}`)
  assert.equal(committed.totals.amounts.commitment.cents,40000)
  assert.equal(committed.totals.amounts.actual.cents,actual,'authorized purchase remains a commitment')
  await h.api('purchase.save',cookie.owner,{...facts,order,revision:1,unitPrice:['200.00']})
  const excluded=await get(`workOrder=${work}`)
  assert.equal(excluded.totals.amounts.commitment.cents,25000,'unsent superseded obligation does not double count')
  assert.ok(excluded.excludedCommitments.some(row=>row.revision_id===po.revisions[0].id))
  await h.api('downtime.start',cookie.max,{workOrder:work,startedOn:`${today}T06:00`,reason:'Bearing seized'})
  await h.api('downtime.end',cookie.max,{workOrder:work,endedOn:`${today}T07:00`})
  await h.api('workorder.submit',cookie.max,{workOrder:work,version:(await detail()).version})
  await h.api('workorder.review',cookie.sam,{workOrder:work,version:(await detail()).version,decision:'approve'})
  const pareto=await h.api(`bad-actors?asset=${parent}`,cookie.lead)
  assert.equal(pareto.failures.find(row=>row.work?.id===work).repairCents,actual)
  assert.equal(pareto.totals.repairCents,actual)
  assert.equal((await h.api(`assets/${asset}`,cookie.lead)).lifecycle.comparison.repairCents,actual)
  const v1=await h.api('metrics?metric=bad-actors.repair-cost&version=1',cookie.lead)
  const v2=await h.api('metrics?metric=bad-actors.repair-cost',cookie.lead)
  assert.equal(v1.definitions[0].version,1)
  assert.equal(v2.definitions[0].version,2)
  assert.notEqual(v1.definitions[0].formula,v2.definitions[0].formula)
  assert.equal((await get(`workOrder=${work}`)).inputFingerprint,(await get(`workOrder=${work}`)).inputFingerprint)
  if(process.env.LABOR_SCREENSHOTS) {
    const {costingBrowser}=await import('./work-costing-browser.mjs')
    await costingBrowser({h,cookie,work,asset,parent,center,actual})
  }
}
