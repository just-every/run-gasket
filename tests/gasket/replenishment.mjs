// PART-005 through the policy, automation, purchase, receiving and stores doors.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { harness, file } from './harness.mjs'

export async function replenishmentJourney() {
  const h=await harness()
  try {
    const cookie={owner:await h.owner()}, ids={}
    await h.api('site.configure',cookie.owner,{name:'Great Lakes Manufacturing',timezone:'America/New_York'})
    for(const [key,role,name] of [['lead','lead','Mara Chen'],['max','maintainer','Luis Ortega'],['sam','supervisor','Rosa Alvarez'],['agent','agent','Stores assistant']]) {
      ids[key]=(await h.api('access.give',cookie.owner,{name,email:`${key}@example.test`,role})).id
      cookie[key]=await h.signIn(`${key}@example.test`)
    }
    const today=(await h.api('me',cookie.owner)).today, owner=(await h.api('me',cookie.owner)).id
    const vendor=(await h.api('supplier.save',cookie.owner,{name:'North Coast Motion Supply',contact:'Avery Singh',email:'orders@northcoast.example.test',phone:'+1 216 555 0145',street:'8100 Industrial Parkway',city:'Cleveland',state:'OH',zip:'44114',taxTreatment:'sales_tax',taxNote:'Freight and tax require buyer review',paymentTerms:'Net 30',leadDays:0,active:true})).id
    const costCenter=(await h.api('costcenter.save',cookie.owner,{code:'PART-005',name:'Packaging line spares',active:true})).id
    const part=(await h.api('part.create',cookie.lead,{number:'RP-6205',name:'Sealed conveyor drive bearing',unit:'each',minimum:'3',location:'North stores · A3'})).id
    await h.api('part.receive',cookie.lead,{part,quantity:'6',unitPrice:'10.00'})
    const asset=(await h.api('asset.create',cookie.lead,{tag:'RP-CONV-4',name:'Packaging conveyor drive',location:'Line 4'})).id
    const work=(await h.api('workorder.create',cookie.lead,{asset,title:'Replace rough-running drive bearings',due:today,assignee:ids.max})).id
    const policy={part,minimum:'3',maximum:'10',reorderQuantity:'6',safetyStock:'1',supplier:vendor,costCenter,purchaser:owner,leadDays:0,unitPrice:'10.00',active:true,automatic:false}
    for(const who of ['max','sam','agent']) await h.api('replenishment.policy',cookie[who],policy,403)
    await h.api('replenishment.policy',cookie.lead,{...policy,maximum:'4'},400)
    await h.api('replenishment.policy',cookie.lead,policy)
    assert.equal((await h.api('replenishment/preview',cookie.lead)).policies[0].proposed,'0')
    await h.api('workorder.issue',cookie.max,{workOrder:work,part,quantity:'4'})
    const before={orders:await h.api('purchase-orders',cookie.owner),notices:await h.api('notices',cookie.lead),ledger:await h.api('automation/jobs',cookie.owner),audit:await h.api('audit',cookie.owner)}
    const preview=await h.api('replenishment/preview',cookie.lead)
    assert.deepEqual([preview.preview,preview.policies[0].available,preview.policies[0].proposed],[true,'2','8'])
    assert.deepEqual({orders:await h.api('purchase-orders',cookie.owner),notices:await h.api('notices',cookie.lead),ledger:await h.api('automation/jobs',cookie.owner),audit:await h.api('audit',cookie.owner)},before,'preview creates no purchases, notices, audit or executions')
    const rule=async()=>(await h.api('automation',cookie.owner)).rules.find(row=>row.id==='replenishment')
    const catchup=async()=>h.api('automation.catchup',cookie.owner,{rule:'replenishment',revision:(await rule()).revision})
    await h.api('automation.control',cookie.owner,{rule:'replenishment',revision:(await rule()).revision,paused:true,reason:'Review reorder preview before enabling'})
    assert.equal((await catchup()).state,'paused')
    assert.equal((await h.api('purchase-orders',cookie.owner)).length,0)
    await h.api('automation.control',cookie.owner,{rule:'replenishment',revision:(await rule()).revision,paused:false,reason:'Reorder preview approved'})
    const issued=await catchup(); assert.equal(issued.output.created.length,1)
    await catchup()
    let data=await h.api('replenishment',cookie.lead), doc=data.open[0]
    assert.equal(data.open.length,1)
    assert.equal((await h.api('purchase-orders',cookie.owner)).length,1,'repeated worker keeps one open draft')
    let po=await h.api(`purchase-orders/${doc.order_id}`,cookie.owner)
    assert.equal(po.current.snapshot.lines[0].quantity,'8')
    assert.equal(po.current.send,null,'manual draft authorizes no send')
    const notices=await h.api('notices',cookie.lead)
    assert.ok(notices.some(row=>row.kind==='replenishment'&&row.purchase_order_id===doc.order_id&&row.part_id===part))
    const job=await h.api(`automation/jobs?job=${issued.job}`,cookie.owner)
    assert.ok(job.input.replenishment.policies.some(row=>row.part_id===part))
    assert.equal(doc.automation_job_id,issued.job)
    const envelope={supplier:vendor,costCenter,from:today,to:today,perOrder:'100.00',periodLimit:'100.00',reason:'Approved vendor limit for routine bearing replenishment'}
    await h.api('replenishment.envelope',cookie.lead,envelope,403)
    const grant=(await h.api('replenishment.envelope',cookie.owner,envelope)).id
    await h.api('replenishment.envelope.approve',cookie.owner,{envelope:grant,confirm:true,reason:'Own envelope'},403)
    await h.api('replenishment.envelope.approve',cookie.sam,{envelope:grant,reason:'Missing confirmation'},400)
    await h.api('replenishment.envelope.approve',cookie.sam,{envelope:grant,confirm:true,reason:'Independent review of vendor and spend ceiling'})
    const spendFacts={costCenter,from:today,to:today,budget:'50.00',threshold:['1000.00'],approver:[ids.sam]}
    const spendPolicy=await h.api('spend.policy',cookie.owner,spendFacts)
    await h.api('replenishment.policy',cookie.lead,{...policy,revision:1,automatic:true,envelope:grant})
    await catchup()
    assert.equal((await h.api(`purchase-orders/${doc.order_id}`,cookie.owner)).current.send,null,'separate envelope cannot bypass the purchasing budget')
    await h.api('spend.policy',cookie.owner,{...spendFacts,policy:spendPolicy.id,revision:1,budget:'500.00'})
    await catchup(); await catchup()
    po=await h.api(`purchase-orders/${doc.order_id}`,cookie.owner)
    assert.equal(po.current.send.state,'accepted')
    assert.equal(po.current.approval.authority_kind,'threshold')
    assert.equal(h.mails.filter(mail=>mail.to.includes('orders@northcoast.example.test')).length,1)
    for (const who of ['owner','sam']) {
      const visible=(await h.api('replenishment',cookie[who])).envelopes.find(row=>row.id===grant)
      assert.deepEqual([visible.per_order_cents,visible.period_limit_cents,visible.used_cents],[10000,10000,8000])
    }
    const restricted=(await h.api('replenishment',cookie.lead)).envelopes.find(row=>row.id===grant)
    for(const field of ['per_order_cents','period_limit_cents','used_cents']) assert.equal(Object.hasOwn(restricted,field),false,'lead envelope metadata omits financial bounds and consumption')
    // Automation history respects purchasing budget access.
    await h.api('spend-report',cookie.lead,undefined,403)
    const leadLedger=await h.api('automation/jobs',cookie.lead)
    for(const record of leadLedger.jobs.filter(row=>row.rule_id==='replenishment')) {
      assert.equal(record.input.replenishment.envelopeBudgetAccess,false)
      for(const field of ['uses','spendPolicies','spendSteps','commitments']) assert.equal(Object.hasOwn(record.input.replenishment,field),false,`restricted history omits ${field}`)
      for(const envelope of record.input.replenishment.envelopes) for(const field of ['per_order_cents','period_limit_cents']) assert.equal(Object.hasOwn(envelope,field),false)
      assert.deepEqual(await h.api(`automation/jobs?job=${record.id}`,cookie.lead),record,'individual job uses the same permitted projection')
    }
    for(const who of ['owner','sam']) {
      const ledger=await h.api('automation/jobs',cookie[who])
      const retained=ledger.jobs.find(row=>row.rule_id==='replenishment'&&row.input.replenishment.commitments.length)
      assert.ok(retained,'reviewers retain purchase commitment evidence')
      assert.ok(retained.input.replenishment.spendPolicies.some(row=>row.budget_cents===50000))
      assert.ok(retained.input.replenishment.spendSteps.some(row=>row.threshold_cents===100000))
      assert.ok(retained.input.replenishment.uses.length)
      assert.deepEqual(await h.api(`automation/jobs?job=${retained.id}`,cookie[who]),retained)
    }
    const receipt={order:doc.order_id,revisionId:po.current.id,externalId:'NC-4008',freight:'0',salesTax:'0',backorderNote:'Five bearings expected on the next delivery',packingSlip:file('NC-4008.txt','Three bearings, one damaged packaging','text/plain'),lines:[{line:0,part,quantity:'3',quarantine:'1',bin:'A3',lot:'NC-LOT-4'}]}
    await h.api('receipt.receive',cookie.lead,receipt)
    await catchup()
    data=await h.api('replenishment',cookie.lead);doc=data.open[0]
    assert.deepEqual([doc.received,doc.outstanding,doc.quarantine,doc.overdue],['3','5','1',true])
    assert.deepEqual([data.policies[0].available,data.policies[0].shortage],['4','6'])
    const stores=await h.api('stores',cookie.lead)
    assert.equal(stores.replenishment.open[0].order_id,doc.order_id)
    assert.deepEqual([stores.replenishment.open[0].outstanding,stores.replenishment.open[0].ageDays],['5',0])
    assert.ok((await h.api('notices',cookie.lead)).some(row=>row.text.includes('Outstanding 5')&&row.text.includes('follow-up')))
    await h.api('replenishment',cookie.max,undefined,403)
    await h.api('replenishment',undefined,undefined,401)
    if(process.env.REPLENISHMENT_SCREENSHOTS) await (await import('./replenishment-browser.mjs')).replenishmentBrowser({h,cookie,order:doc.order_id,variant:'partial'})
    const first=(await h.api(`purchase-orders/${doc.order_id}/receipts`,cookie.lead)).receipts[0].lines[0]
    await h.api('receipt.inspect',cookie.lead,{receiptLine:first.id,kind:'return',source:'quarantine',quantity:'1',reason:'Damaged package returned for replacement'})
    await h.api('receipt.receive',cookie.lead,{...receipt,externalId:'NC-4011',packingSlip:undefined,lines:[{line:0,part,quantity:'6',quarantine:'0',bin:'A3',lot:'NC-LOT-5'}]})
    await catchup(); assert.equal((await h.api('replenishment',cookie.lead)).open.length,0)
    await h.api('workorder.issue',cookie.max,{workOrder:work,part,quantity:'8'})
    await catchup(); await catchup()
    data=await h.api('replenishment',cookie.lead)
    assert.equal(data.open.length,1)
    const second=await h.api(`purchase-orders/${data.open[0].order_id}`,cookie.owner)
    assert.equal(second.current.snapshot.lines[0].quantity,'8')
    assert.equal(second.current.send,null,'BUY-006/PART-005: the period auto-buy limit refuses another $80 after $80 booked')
    assert.equal(h.mails.filter(mail=>mail.to.includes('orders@northcoast.example.test')).length,1)
    // BUY-006: pausing the rule preserves the open order and its document.
    await h.api('automation.control',cookie.owner,{rule:'replenishment',revision:(await rule()).revision,paused:true,reason:'Hold automatic ordering for stocktake'})
    assert.equal((await catchup()).state,'paused')
    assert.deepEqual((await h.api('replenishment',cookie.lead)).open.map(row=>row.order_id),[second.id],'BUY-006: a paused rule keeps open orders')
    assert.equal((await h.api(`purchase-orders/${second.id}`,cookie.owner)).current_revision,1)
    await h.api('automation.control',cookie.owner,{rule:'replenishment',revision:(await rule()).revision,paused:false,reason:'Stocktake finished'})
    await h.api('replenishment.envelope.revoke',cookie.owner,{envelope:grant,reason:'Stop routine ordering during shutdown'})
    await catchup();assert.equal((await h.api(`purchase-orders/${second.id}`,cookie.owner)).current.send,null)
    // A policy change never spends a new vendor's authority on an older vendor's PO.
    const otherVendor=(await h.api('supplier.save',cookie.owner,{name:'Lake Erie Industrial Supply',contact:'Dina Torres',email:'orders@lakeerie.example.test',phone:'+1 216 555 0193',street:'8100 Industrial Parkway',city:'Cleveland',state:'OH',zip:'44114',taxTreatment:'sales_tax',paymentTerms:'Net 30',leadDays:0,active:true})).id
    const otherGrant=(await h.api('replenishment.envelope',cookie.owner,{...envelope,supplier:otherVendor})).id
    await h.api('replenishment.envelope.approve',cookie.sam,{envelope:otherGrant,confirm:true,reason:'Reviewed alternative vendor only'})
    const seen=(await h.api('replenishment',cookie.lead)).policies[0].revision
    await h.api('replenishment.policy',cookie.lead,{...policy,revision:seen,supplier:otherVendor,automatic:true,envelope:otherGrant})
    await catchup()
    assert.equal((await h.api(`purchase-orders/${second.id}`,cookie.owner)).current.send,null,'new vendor envelope cannot authorize the old vendor order')
    const expensivePart=(await h.api('part.create',cookie.lead,{number:'RP-6250',name:'Large drive bearing',unit:'each',minimum:'3',location:'North stores · C4'})).id
    await h.api('replenishment.policy',cookie.lead,{...policy,part:expensivePart,supplier:otherVendor,automatic:true,envelope:otherGrant,unitPrice:'20.00'})
    await catchup()
    const overOrder=(await h.api('replenishment',cookie.lead)).open.find(row=>row.part_id===expensivePart)
    assert.equal((await h.api(`purchase-orders/${overOrder.order_id}`,cookie.owner)).current.send,null,'BUY-006/PART-005: the per-order auto-buy limit blocks a $200 draft under a $100 envelope')
    const metrics=await h.api('metrics',cookie.lead)
    assert.ok(metrics.definitions.some(row=>row.clause==='PART-005'&&row.formula&&row.sourceDoor))
    if(process.env.REPLENISHMENT_SCREENSHOTS) await (await import('./replenishment-browser.mjs')).replenishmentBrowser({h,cookie,order:second.id,variant:'blocked'})
    await (await import('./replenishment-archive.mjs')).replenishmentArchive(h,cookie)
    console.log('PART-005 reorder policies, deduplicated drafts and bounded automatic ordering passed')
  }finally{await h.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await replenishmentJourney()
