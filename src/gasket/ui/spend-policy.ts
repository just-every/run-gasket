// BUY-003: owner-managed period envelopes and dated delegation, in the app shell.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all } from '../core'
import { usd } from '../bad-actors'
import { showInstant } from '../dates'
import { spendPolicySettings } from '../purchase-policy'
import { area, backLink, card, field, form, h, hidden, select, table } from './html'
import { page } from './shell'

const dollars=(cents:number)=>(cents/100).toFixed(2)
export async function spendPolicyPage(env:Bindings,actor:Actor,url:URL) {
  const data=await spendPolicySettings(env,actor)
  const people=data.members.map(row=>({value:row.id,label:row.name}))
  const fields=(policy:any=null)=>h`${policy ? h`${hidden('policy',policy.policy_id)}${hidden('revision',policy.revision)}`:''}
    ${select('Cost center','costCenter',data.costCenters.map(row=>({value:row.id,label:`${row.code} · ${row.name}`})),policy?.cost_center_id??'',{required:false,blank:'Whole site'})}
    <div class="gk-grid">${field('From','from',{type:'date',value:policy?.from_on??actor.today})}${field('Through','to',{type:'date',value:policy?.to_on??actor.today})}${field('Budget (USD)','budget',{value:policy?dollars(policy.budget_cents):'',attrs:'inputmode="decimal"'})}</div>
    <p>Dates include both ends in the site's time zone. Site and cost-center envelopes both apply. Each threshold includes its exact dollar amount; $0.00 asks for independent approval on every order. Below all configured thresholds, the policy authorizes the order without manual approval.</p>
    ${(policy?[...policy.steps,{}]:[{},{}]).map((step:any,index:number)=>h`<fieldset><legend>Approval step ${index+1}</legend><div class="gk-grid">${field('Required at or above (USD)','threshold',{value:step.threshold_cents===undefined?(index===0?'0.00':''):dollars(step.threshold_cents),required:index===0,attrs:'inputmode="decimal"'})}${select('Independent approver','approver',people,step.principal_id??'',{required:index===0,blank:index?'No additional step':'Choose an approver'})}</div></fieldset>`)}`
  const budgets=await Promise.all(data.policies.map(async policy=>{
    const sums=await all(env,`SELECT amount_cents FROM gk_live_purchase_commitments WHERE booked_on BETWEEN ? AND ? AND (? IS NULL OR cost_center_id=?)`,policy.from_on,policy.to_on,policy.cost_center_id,policy.cost_center_id)
    return {...policy,committed:sums.reduce((sum,row)=>sum+row.amount_cents,0)}
  }))
  return page(env,'Spend policy',actor,h`${backLink('/app/purchase-orders','Purchase orders')}<h1>Spend policy</h1><p class="gk-lede">Set the site's purchasing envelopes and independent approval steps. These are commitments, never posted bills or actual spend.</p>
    ${card('Current period policies',budgets.length?table(['Scope','Period','Revision','Budget','Committed','Remaining','Approval steps'],budgets.map(row=>[row.cost_center_code?`${row.cost_center_code} · ${row.cost_center_name}`:'Whole site',`${row.from_on} through ${row.to_on}`,row.revision,usd(row.budget_cents),usd(row.committed),usd(row.budget_cents-row.committed),h`${row.steps.map((step:any)=>h`<span class="gk-sub">${usd(step.threshold_cents)} and above · ${step.principal}</span>`)}`]),'Spend policies',{wrap:[0,1,6]}):h`<p>No envelopes configured. Every order still needs independent approval.</p>`)}
    ${card('Add a period policy',form('spend.policy','/app/spend-policy',fields(),'Save policy'))}
    ${data.policies.map(policy=>card(`${policy.cost_center_code??'Site'} · policy revision ${policy.revision}`,h`<details><summary>Create next policy revision</summary>${form('spend.policy','/app/spend-policy',fields(policy),'Save next revision')}<p>Earlier revisions and the decisions made against them stay in the audit. New steps are re-evaluated on open orders before approval or send.</p></details>`))}
    ${card('Delegate during leave',form('spend.delegate','/app/spend-policy',h`${select('Named approver','principal',people,'',{blank:'Choose an approver'})}${select('Delegate','delegate',people,'',{blank:'Choose a different independent approver'})}<div class="gk-grid">${field('From','from',{type:'date',value:actor.today})}${field('Through','to',{type:'date',value:actor.today})}</div>${area('Reason','reason')}<p>The delegate acts in place of the named approver on these dates. Neither may be the purchase initiator or current revision author.</p>`,'Save delegation'))}
    ${card('Delegations',data.delegations.length?h`${table(['Named approver','Delegate','Period','Revision','State'],data.delegations.map(row=>[row.principal,row.delegate,`${row.from_on} through ${row.to_on}`,row.revision,row.revoked?'Revoked':'Available on its dates']),'Dated delegations',{wrap:[0,1,2]})}${data.delegations.filter(row=>!row.revoked).map(row=>form('spend.delegate','/app/spend-policy',h`${hidden('delegation',row.delegation_id)}${hidden('revision',row.revision)}${hidden('revoke','yes')}${field(`Reason to end ${row.principal}'s delegation`,'reason')}`,'Revoke delegation',{secondary:true}))}`:h`<p>No delegations.</p>`)}
    ${card('Emergency override report',data.emergencies.length?table(['Order','Revision','Authority','Confirmed','Reason','Budget impact'],data.emergencies.map(row=>[h`<a href="/app/purchase-orders/${row.order_id}">PO-${row.number}</a>`,row.revision,row.approver,showInstant(row.confirmed_at,actor.zone),row.reason,h`${JSON.parse(row.budget_impact).map((impact:any)=>h`<span class="gk-sub">${impact.from} through ${impact.to}: ${usd(impact.projectedCents)} against ${usd(impact.budgetCents)}; overrun ${usd(impact.overrunCents)}</span>`)}`]),'Emergency overrides',{wrap:[2,4,5]}):h`<p>No emergency overrides.</p>`)}
    ${card('Released sent commitments',data.releases.length?table(['Order','Revision','Released by','When','Reason'],data.releases.map(row=>[h`<a href="/app/purchase-orders/${row.order_id}">PO-${row.number}</a>`,row.revision,row.releaser,showInstant(row.released_at,actor.zone),row.reason]),'Commitment releases',{wrap:[2,4]}):h`<p>No releases. Sent historic revisions remain committed until an independent reviewer explicitly confirms release.</p>`)}
    <p><a href="/api/gasket/spend-policy">Download policy and override JSON</a> · <a href="/app/audit?action=purchase">Read attributed policy and authority changes</a></p>`,{url})
}
