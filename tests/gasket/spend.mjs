// BUY-003: budgeted independent routing, delegation and retained emergency spend.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { spendBrowser } from './spend-browser.mjs'
import { harness } from './harness.mjs'

export async function spendJourney(h,cookie,ids,onReady) {
  const today=(await h.api('me',cookie.owner)).today
  const members={}
  for(const [key,name] of [['first','Rosa Alvarez'],['second','Devin Cole'],['delegate','Morgan Chen']]) {
    members[key]=(await h.api('access.give',cookie.owner,{name,email:`spend-${key}@example.test`,role:'supervisor'})).id
    cookie[`spend-${key}`]=await h.signIn(`spend-${key}@example.test`)
  }
  const vendor=(await h.api('supplier.save',cookie.owner,{name:'Midwest Pump and Bearing',contact:'Avery Singh',email:'orders@midwest.example.test',phone:'+1 216 555 0178',street:'1400 Industrial Parkway',city:'Cleveland',state:'OH',zip:'44115',taxTreatment:'sales_tax',taxNote:'No tax on recorded quote',paymentTerms:'Net 30',leadDays:7,active:true})).id
  const center=(await h.api('costcenter.save',cookie.owner,{code:'BUY-003',name:'Production reliability',active:true})).id
  const policy={costCenter:center,from:today,to:today,budget:'10000.00',threshold:['0','3000'],approver:[members.first,members.second]}
  await h.api('spend.policy',cookie.lead,policy,403)
  await h.api('spend.policy',cookie.owner,{...policy,currency:'EUR'},400)
  const saved=await h.api('spend.policy',cookie.owner,policy)
  const facts={supplier:vendor,costCenter:center,asset:ids.asset,deliveryOn:today,taxTreatment:'sales_tax',kind:['part'],description:['Process pump rebuild kit'],quantity:['1'],unit:['kit'],unitPrice:['4500.00'],reason:'Restore chilled-water circulation',freight:'0',salesTax:'0',useTax:'0'}
  const order=(await h.api('purchase.save',cookie.owner,facts)).id
  const read=()=>h.api(`purchase-orders/${order}`,cookie.owner)
  let detail=await read()
  assert.equal(detail.route.required.length,2)
  assert.equal(detail.route.complete,false)
  await onReady?.({h,cookie,paths:[`/app/purchase-orders/${order}`],variant:'pending',viewer:'spend-first'})
  await h.api('purchase.approve',cookie.owner,{order,revision:1,step:detail.route.required[0].id},403)
  await h.api('purchase.approve',cookie['spend-second'],{order,revision:1,step:detail.route.required[1].id},409)
  await h.api('purchase.send',cookie.owner,{order,revision:1},409)
  await h.api('purchase.approve',cookie['spend-first'],{order,revision:1,step:detail.route.required[0].id,note:'Scope and price reviewed'})
  detail=await read()
  assert.equal(detail.route.required.filter(row=>row.approval).length,1)
  assert.equal(detail.current.approval,null,'first limit does not authorize a two-step order')
  await h.api('spend.delegate',cookie.owner,{principal:members.second,delegate:members.delegate,from:today,to:today,reason:'Devin is on leave'})
  detail=await read()
  const next=detail.route.required.find(row=>!row.approval)
  assert.equal(next.effectiveId,members.delegate)
  await onReady?.({h,cookie,paths:[`/app/purchase-orders/${order}`],variant:'delegated',viewer:'spend-delegate'})
  await h.api('purchase.approve',cookie['spend-second'],{order,revision:1,step:next.id},403)
  await h.submit('purchase.approve',cookie['spend-delegate'],{order,revision:'1',step:next.id,note:'Delegated review for leave coverage'},`/app/purchase-orders/${order}`)
  detail=await read()
  assert.equal(detail.route.complete,true)
  assert.ok(detail.current.approval)
  const oldSendCount=h.mails.length
  await h.api('access.role',cookie.owner,{member:members.delegate,role:'maintainer'})
  await h.api('purchase.send',cookie.owner,{order,revision:1},409)
  assert.equal(h.mails.length,oldSendCount,'changed authority prevents a new provider submission')
  await h.api('access.role',cookie.owner,{member:members.delegate,role:'supervisor'})
  const approvedSnapshot=detail.current.snapshot
  await h.api('purchase.save',cookie.owner,{...facts,order,revision:1,currency:'EUR'},400)
  assert.equal((await read()).current_revision,1)
  await h.api('purchase.send',cookie.owner,{order,revision:1})
  const changed=await h.api('purchase.save',cookie.owner,{...facts,order,revision:1,unitPrice:['4600.00']})
  assert.equal(changed.revision,2)
  detail=await read()
  assert.equal(detail.current.approval,null)
  assert.ok(detail.route.required.every(row=>!row.approval))
  assert.deepEqual(detail.revisions[0].snapshot,approvedSnapshot)
  await h.api('purchase.send',cookie.owner,{order,revision:2},409)
  assert.equal(detail.route.budgets[0].committedCents,450000,'sent historic revision keeps its commitment')
  for(const [who,step] of [['spend-first',detail.route.required[0]],['spend-delegate',detail.route.required[1]]]) await h.api('purchase.approve',cookie[who],{order,revision:2,step:step.id})
  detail=await read()
  assert.equal(detail.route.budgets[0].committedCents,910000)
  await onReady?.({h,cookie,paths:['/app/purchase-orders',`/app/purchase-orders/${order}`],variant:'approved'})
  const vendorEdit=(await h.api('purchase.save',cookie.owner,{...facts,unitPrice:['500.00']})).id
  let vendorRead=await h.api(`purchase-orders/${vendorEdit}`,cookie.owner)
  await h.api('purchase.approve',cookie['spend-first'],{order:vendorEdit,revision:1,step:vendorRead.route.required[0].id})
  const other=(await h.api('supplier.save',cookie.owner,{name:'Alternate industrial supply',contact:'Dee Buyer',email:'orders@alternate.example.test',phone:'+1 216 555 0138',street:'11 Factory Road',city:'Cleveland',state:'OH',zip:'44115',taxTreatment:'sales_tax',paymentTerms:'Net 30',leadDays:5,active:true})).id
  await h.api('purchase.save',cookie.owner,{...facts,order:vendorEdit,revision:1,supplier:other,unitPrice:['500.00']})
  vendorRead=await h.api(`purchase-orders/${vendorEdit}`,cookie.owner)
  assert.equal(vendorRead.route.complete,false,'vendor changes invalidate exact-revision approval')
  assert.equal(vendorRead.current.approval,null)
  // Two concurrent completions compete for the same remaining envelope.
  const racers=await Promise.all([1,2].map(async number=>(await h.api('purchase.save',cookie.owner,{...facts,unitPrice:['600.00'],reason:`Spare kit ${number}`})).id))
  const raceRoutes=await Promise.all(racers.map(order=>h.api(`purchase-orders/${order}`,cookie.owner)))
  const attempts=await Promise.all(raceRoutes.map(po=>h.raw('/api/gasket/purchase.approve',{cookie:cookie['spend-first'],body:{order:po.id,revision:1,step:po.route.required[0].id}})))
  assert.deepEqual(attempts.map(row=>row.status).sort(),[200,409])
  assert.equal((await read()).route.budgets[0].committedCents,970000)
  // A second order cannot overspend the same budget, including concurrent completion attempts.
  const blocked=(await h.api('purchase.save',cookie.owner,{...facts,unitPrice:['1500.00'],reason:'Urgent spare for production restart'})).id
  const blockedRead=()=>h.api(`purchase-orders/${blocked}`,cookie.owner)
  let b=await blockedRead()
  await h.api('purchase.approve',cookie['spend-first'],{order:blocked,revision:1,step:b.route.required[0].id},409)
  b=await blockedRead()
  assert.equal(b.route.complete,false)
  assert.equal(b.current.approval,null)
  await onReady?.({h,cookie,paths:[`/app/purchase-orders/${blocked}`],variant:'blocked',viewer:'spend-first'})
  // An emergency never creates self-approval, and its extra commitment stays reportable.
  await h.api('purchase.emergency',cookie.owner,{order:blocked,revision:1,reason:'Production line is stopped',confirm:true},403)
  await h.api('purchase.emergency',cookie['spend-first'],{order:blocked,revision:1,reason:'Production line is stopped'},400)
  await h.submit('purchase.emergency',cookie['spend-first'],{order:blocked,revision:'1',reason:'Production line stopped; replacement authorized by Rosa Alvarez',confirm:'yes'},`/app/purchase-orders/${blocked}`)
  b=await blockedRead()
  assert.equal(b.route.complete,true)
  assert.ok(b.route.emergency)
  assert.equal(b.route.budgets[0].committedCents,1120000)
  const settings=await h.api('spend-policy',cookie.owner)
  assert.ok(settings.emergencies.some(row=>row.revision_id===b.current.id))
  for(const who of ['lead','max','agent']) {
    const ordinary=await h.api(`purchase-orders/${blocked}`,cookie[who])
    assert.equal(Object.hasOwn(ordinary.route,'budgets'),false)
    assert.ok(ordinary.route.required.every(row=>!Object.hasOwn(row,'thresholdCents')))
    await h.api('spend-policy',cookie[who],undefined,403)
    await h.api('spend-report',cookie[who],undefined,403)
  }
  await h.api('spend-report',undefined,undefined,401)
  assert.equal((await h.raw('/app/spend-policy',{cookie:cookie['spend-first']})).status,403)
  const report=await h.api('spend-report',cookie['spend-first'])
  assert.ok(report.emergencies.some(row=>row.revision_id===b.current.id))
  const definitions=await h.api('metrics',cookie['spend-first'])
  assert.ok(definitions.definitions.some(row=>row.id==='purchasing.budget-remaining'))
  const beforeRelease=h.mails.length
  await h.api('purchase.release',cookie.owner,{revisionId:detail.revisions[0].id,reason:'Vendor canceled the superseded revision',confirm:true},403)
  await h.api('purchase.release',cookie['spend-first'],{revisionId:detail.revisions[0].id,reason:'Vendor canceled superseded scope in writing',confirm:true})
  assert.equal((await read()).route.budgets[0].committedCents,670000)
  assert.equal(h.mails.length,beforeRelease)
  const autoCenter=(await h.api('costcenter.save',cookie.owner,{code:'BUY-003-SMALL',name:'Small purchase envelope',active:true})).id
  await h.api('spend.policy',cookie.owner,{...policy,costCenter:autoCenter,budget:'1000',threshold:['1000'],approver:[members.first]})
  const small=(await h.api('purchase.save',cookie.owner,{...facts,costCenter:autoCenter,unitPrice:['100.00']})).id
  let smallRead=await h.api(`purchase-orders/${small}`,cookie.owner)
  assert.equal(smallRead.route.required.length,0)
  assert.equal(smallRead.current.approval,null)
  await h.api('purchase.send',cookie.owner,{order:small,revision:1})
  smallRead=await h.api(`purchase-orders/${small}`,cookie.owner)
  assert.ok(smallRead.current.approval)
  assert.equal(smallRead.route.budgets[0].committedCents,10000)
  await h.api('spend.policy',cookie.owner,{...policy,costCenter:'',budget:'500',threshold:['0'],approver:[members.first]})
  const siteLimited=(await h.api('purchase.save',cookie.owner,{...facts,costCenter:autoCenter,unitPrice:['600.00']})).id
  const siteRead=await h.api(`purchase-orders/${siteLimited}`,cookie.owner)
  assert.equal(siteRead.route.budgets.length,2,'site and cost-center envelopes both govern the purchase')
  assert.ok(siteRead.route.budgets.find(row=>row.costCenterId===null).exceeded)
  await h.api('purchase.approve',cookie['spend-first'],{order:siteLimited,revision:1,step:siteRead.route.required[0].id},409)
  await onReady?.({h,cookie,paths:['/app/spend-policy',`/app/purchase-orders/${order}`,`/app/purchase-orders/${blocked}`,'/app/metrics?metric=purchasing.budget-remaining'],variant:'final'})
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const h=await harness()
  try {
    const cookie={owner:await h.owner()},ids={}
    await h.api('site.configure',cookie.owner,{name:'Great Lakes Plant',timezone:'America/New_York'})
    for(const [key,role] of [['lead','lead'],['max','maintainer'],['sam','supervisor'],['agent','agent']]) {
      ids[key]=(await h.api('access.give',cookie.owner,{name:key,email:`${key}@example.test`,role})).id
      cookie[key]=await h.signIn(`${key}@example.test`)
    }
    ids.asset=(await h.api('asset.create',cookie.lead,{tag:'BUY003-PUMP',name:'Chilled-water process pump',location:'Chiller skid 4'})).id
    await spendJourney(h,cookie,ids,spendBrowser)
    console.log('BUY-003 independent limits, delegation, renewed approval and emergency reporting passed')
  } finally {await h.close()}
}
