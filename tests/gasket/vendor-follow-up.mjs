// BUY-006 through the purchase, receiving, follow-up, automation and notice doors.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { harness, exerciseKeyedActions } from './harness.mjs'
import { now, zone } from './clock.mjs'

const DAY = 86_400_000, cron = '*/15 * * * *'

export async function vendorFollowUpJourney() {
  const h=await harness()
  try {
    const cookie={owner:await h.owner()}, ids={}
    exerciseKeyedActions(h, cookie.owner, ['vendor.rule'], { once: true })
    await h.api('site.configure',cookie.owner,{name:'Great Lakes Manufacturing',timezone:zone})
    for(const [key,role,name] of [['lead','lead','Mara Chen'],['max','maintainer','Luis Ortega'],['sam','supervisor','Rosa Alvarez'],['agent','agent','Stores assistant']]) {
      ids[key]=(await h.api('access.give',cookie.owner,{name,email:`${key}@example.test`,role})).id
      cookie[key]=await h.signIn(`${key}@example.test`)
    }
    const today=(await h.api('me',cookie.owner)).today, vendorMail='orders@lakeshore.example.test'
    const supplier=(await h.api('supplier.save',cookie.owner,{name:'Lakeshore Bearing Supply',contact:'Nia Brooks',email:vendorMail,phone:'+1 216 555 0177',street:'2200 Superior Avenue',city:'Cleveland',state:'OH',zip:'44114',taxTreatment:'sales_tax',taxNote:'Destination tax',paymentTerms:'Net 30',leadDays:3,active:true})).id
    const costCenter=(await h.api('costcenter.save',cookie.owner,{code:'BUY-006',name:'Conveyor rebuild',active:true})).id
    const part=(await h.api('part.create',cookie.lead,{number:'VF-6205',name:'6205 sealed bearing',unit:'each',minimum:'2',location:'North stores · A3'})).id
    const asset=(await h.api('asset.create',cookie.lead,{tag:'VF-CONV-2',name:'Case packer conveyor',location:'Line 2'})).id
    const work=(await h.api('workorder.create',cookie.lead,{asset,title:'Rebuild conveyor drive bearings',due:addDays(today,5),assignee:ids.max})).id
    const facts={supplier,costCenter,asset,workOrder:work,deliveryOn:today,taxTreatment:'sales_tax',kind:['part'],description:['6205 sealed bearing'],quantity:['10'],unit:['each'],unitPrice:['12.00'],reason:'Bearings for the planned conveyor rebuild'}
    const rule={rule:0,acknowledgmentDays:1,lateDays:1,escalationDays:2}
    for(const who of ['lead','max','sam','agent']) await h.api('vendor.rule',cookie[who],rule,403)
    await h.api('vendor.rule',cookie.owner,{...rule,lateDays:0},400)
    assert.equal((await h.api('vendor.rule',cookie.owner,rule)).number,1)
    await h.api('vendor.rule',cookie.owner,rule,409)
    // Send an approved PO, then receive only part of it.
    const order=(await h.api('purchase.save',cookie.owner,facts)).id
    await h.api('purchase.approve',cookie.sam,{order,revision:1})
    await h.api('purchase.send',cookie.owner,{order,revision:1})
    const revisionId=(await h.api(`purchase-orders/${order}`,cookie.owner)).current.id
    await h.api('receipt.receive',cookie.lead,{order,revisionId,externalId:'LB-7731',freight:'0',salesTax:'0',backorderNote:'Four bearings back-ordered',lines:[{line:0,part,quantity:'6',quarantine:'0',bin:'A3'}]})
    const follow=async(who='owner')=>(await h.api('vendor-follow-up',cookie[who])).orders.find(row=>row.orderId===order)
    let row=await follow('max')
    assert.deepEqual([row.promisedOn,row.status,row.late,row.acknowledgment,row.deliveries.map(item=>[item.day,item.externalId])],[today,'partial',false,null,[[today,'LB-7731']]])
    assert.deepEqual(row.lines.map(line=>[line.ordered,line.delivered,line.outstanding]),[['10','6','4']])
    assert.equal(row.work.id,work)
    await h.api('vendor-follow-up',undefined,undefined,401)
    const toVendor=()=>h.mails.filter(mail=>[mail.to].flat().includes(vendorMail))
    assert.equal(toVendor().length,1,'the PO itself')
    await h.scheduled(cron,now())
    assert.equal(toVendor().length,1,'no acknowledgment reminder before its day; delivery not yet late')
    // Advance past the promised delivery with no vendor acknowledgment.
    await h.scheduled(cron,now()+DAY)
    let mails=toVendor().slice(1)
    assert.deepEqual(mails.map(mail=>mail.subject).sort(),[`PO-1 revision 1: delivery overdue`,`PO-1 revision 1: please acknowledge`])
    assert.ok(mails.find(mail=>mail.subject.endsWith('overdue')).text.includes('6205 sealed bearing: 4 each outstanding of 10 ordered'))
    row=await follow()
    assert.deepEqual(row.reminders.map(item=>[item.occasion,item.state,item.day]).sort(),[['acknowledgment','accepted',addDays(today,1)],['late','accepted',addDays(today,1)]])
    const jobs=await h.api('automation/jobs',cookie.owner), job=jobs.jobs.find(item=>item.rule_id==='vendor'&&item.input.day===addDays(today,1))
    const input=job.input.vendor.orders.find(item=>item.orderId===order)
    assert.deepEqual([input.late,input.lateDays,input.lines[0].outstanding],[true,1,'4'],'the job keeps the late facts it acted on')
    assert.ok(row.reminders.every(item=>item.automation_job_id===job.id&&item.rule_number===1))
    assert.equal(row.escalations.length,0,'one day late is below the escalation days')
    await h.scheduled(cron,now()+DAY+15*60_000)
    assert.equal(toVendor().length,3,'repeated runs never resend an occasion')
    // Pausing the job keeps the order, its outstanding quantity and every record.
    const vendorRule=async()=>(await h.api('automation',cookie.owner)).rules.find(item=>item.id==='vendor')
    await h.api('automation.control',cookie.owner,{rule:'vendor',revision:(await vendorRule()).revision,paused:true,reason:'Supplier on holiday shutdown'})
    const held=await follow()
    await h.scheduled(cron,now()+2*DAY)
    assert.deepEqual(await follow(),held,'a paused rule writes nothing and preserves the open order')
    assert.equal((await h.api(`purchase-orders/${order}/receipts`,cookie.lead)).revisions[0].lines[0].outstanding,'4')
    assert.equal((await h.api('notices',cookie.lead)).filter(item=>item.purchase_order_id===order).length,0)
    await h.api('automation.control',cookie.owner,{rule:'vendor',revision:(await vendorRule()).revision,paused:false,reason:'Shutdown over'})
    // Two days late, the parts holding open work escalate to the planner.
    await h.scheduled(cron,now()+2*DAY+15*60_000)
    const escalation=(await h.api('notices',cookie.lead)).find(item=>item.purchase_order_id===order)
    assert.equal(escalation.kind,'escalation_lead')
    assert.equal(escalation.link,`/app/purchase-orders/${order}`)
    for(const text of ['Rebuild conveyor drive bearings','is 2 days late','4 each outstanding','Vendor acknowledgment: none recorded','no external alert sent']) assert.ok(escalation.text.includes(text),text)
    assert.equal((await h.api('notices',cookie.max)).some(item=>item.purchase_order_id===order),false,'the planner, not the technician')
    assert.ok((await h.api(`work/${work}`,cookie.lead)).chase.notices.some(item=>item.text===escalation.text))
    await h.scheduled(cron,now()+3*DAY)
    assert.equal((await h.api('notices',cookie.lead)).filter(item=>item.purchase_order_id===order).length,1)
    assert.equal(toVendor().length,3)
    const send=(await h.api(`purchase-orders/${order}`,cookie.owner)).current.send.id
    await h.api('purchase.acknowledge',cookie.owner,{send,contact:'Nia Brooks',reference:'ACK-7731',note:'Remaining four ship Friday'})
    row=await follow('agent')
    assert.equal(row.acknowledgment.reference,'ACK-7731')
    // Preview is read-only; an uncertain submission is kept and never resent.
    await h.api('vendor.rule',cookie.owner,{...rule,rule:1,acknowledgmentDays:0})
    const second=(await h.api('purchase.save',cookie.owner,{...facts,workOrder:'',deliveryOn:addDays(today,3),quantity:['2']})).id
    await h.api('purchase.approve',cookie.sam,{order:second,revision:1})
    await h.api('purchase.send',cookie.owner,{order:second,revision:1})
    const before={mails:h.mails.length,ledger:await h.api('automation/jobs',cookie.owner),audit:await h.api('audit',cookie.owner)}
    const preview=await h.api('vendor-follow-up',cookie.owner)
    assert.deepEqual(preview.pending.map(item=>[item.orderId,item.kind,item.occasion]),[[second,'reminder','acknowledgment']])
    assert.deepEqual({mails:h.mails.length,ledger:await h.api('automation/jobs',cookie.owner),audit:await h.api('audit',cookie.owner)},before,'preview sends and records nothing')
    h.setMailOutcome('uncertain')
    const catchup=async()=>h.api('automation.catchup',cookie.owner,{rule:'vendor',revision:(await vendorRule()).revision})
    await catchup()
    h.setMailOutcome('accepted')
    await catchup()
    const reminders=(await h.api('vendor-follow-up',cookie.owner)).orders.find(item=>item.orderId===second).reminders
    assert.deepEqual(reminders.map(item=>[item.occasion,item.state]),[['acknowledgment','uncertain']])
    assert.equal(h.mails.length,before.mails+1)
    const health=await h.api('automation',cookie.owner)
    assert.deepEqual(health.delivery.vendor.reminders.map(item=>[item.state,item.n]),[['accepted',2],['uncertain',1]])
    const metrics=await h.api('metrics',cookie.lead)
    assert.ok(metrics.definitions.some(item=>item.clause==='BUY-006'&&item.sourceDoor==='/api/gasket/vendor-follow-up'))
    const html=(await (await h.raw('/app/vendor-follow-up',{cookie:cookie.lead})).text()).replace(/<[^>]+>/g,'')
    for(const text of ['LB-7731','4 of 10 each','Provider accepted','Escalated to Mara Chen','ACK-7731','Submission uncertain']) assert.ok(html.includes(text),text)
    if(process.env.VENDOR_SCREENSHOTS) await (await import('./vendor-follow-up-browser.mjs')).vendorFollowUpBrowser({h,cookie})
    console.log('BUY-006 vendor delivery follow-up passed')
  }finally{await h.close()}
}
const addDays=(date,days)=>{const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10)}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await vendorFollowUpJourney()
