// BUY-003: present exact-revision route outcomes and explicit independent decisions.
import { can, type Actor } from '../actor'
import { usd } from '../bad-actors'
import { showInstant } from '../dates'
import { area, card, field, form, h, hidden, table } from './html'

export function purchaseApprovalPanel(actor:Actor,order:any) {
  const route=order.route, current=order.current, back=`/app/purchase-orders/${order.id}`
  const review=can(actor,'work.review'), independent=review&&actor.id!==order.created_by&&actor.id!==current.created_by
  const first=route.required.find((step:any)=>!step.approval)
  const unavailable=route.blockedReasons.includes('missing_authority')||(!order.approvalAvailable&&!route.complete)
  const needsRevision=route.legacy&&current.approval&&!route.complete
  return h`${unavailable?card('Approval is blocked',h`<p>No independent approver is available for a required step. The owner can invite a supervisor from ${can(actor,'site.manage')?h`<a href="/app/access">People and access</a>`:'People and access'}, then update the policy's named approver or delegation. Self-approval is refused.</p>`):''}
    ${needsRevision?card('New revision required',h`<p>The earlier approval's authority is no longer current. The owner must create the next revision for independent review; the earlier decision stays in history.</p>`):''}
    ${card('Current purchasing authority',h`<p>${route.authorityLabel} · ${route.release?'Commitment released':route.complete?'Authority complete':'Awaiting independent decisions'}.</p>
      ${route.required.length?table(review?['Required at','Named approver','Acting approver','Outcome']:['Named approver','Acting approver','Outcome'],route.required.map((step:any)=>[...(review?[usd(step.thresholdCents)]:[]),step.principal,step.effective,h`${step.approval?'Approved':step.eligible?'Awaiting decision':'Independent authority unavailable'}${step.approval?h`<span class="gk-sub">${showInstant(step.approval.approved_at,actor.zone)} · ${step.approval.note}</span>`:''}${step.delegation?h`<span class="gk-sub">Delegated ${step.delegation.from_on} through ${step.delegation.to_on}: ${step.delegation.reason}</span>`:''}`]),'Approval routing',{wrap:review?[1,2,3]:[0,1,2]}):h`<p>${route.legacy?'A supervisor or different owner must approve this exact revision.':'No configured threshold calls for manual approval on this amount. The recorded policy supplies authority; budget checks still apply.'}</p>`}
      ${review&&route.budgets?.length?table(['Envelope','Budget','Committed','Remaining','With this revision'],route.budgets.map((budget:any)=>[`${budget.costCenterId?'Cost center':'Site'} · ${budget.from} through ${budget.to}`,usd(budget.budgetCents),usd(budget.committedCents),usd(budget.remainingCents),usd(budget.projectedCents)]),'Applicable budget envelopes',{wrap:[0]}):''}
      ${route.blockedReasons.includes('budget_exceeded')?h`<p>This revision exceeds an applicable envelope. Ordinary approval and sending are blocked until the owner changes the envelope or independent authority explicitly confirms an emergency override.</p>`:''}
      ${route.emergency?h`<p>Independent emergency override · ${route.emergency.reason} · ${showInstant(route.emergency.confirmed_at,actor.zone)}. Its budget impact is retained in the override report.</p>`:''}
      ${route.release?h`<p>This sent commitment was explicitly released: ${route.release.reason}. Release never records a receipt, bill or payment.</p>`:''}`)}
    ${independent&&!route.complete&&!needsRevision&&!route.release&&(route.legacy||(first?.eligible&&first.effectiveId===actor.id))?card('Independent approval',form('purchase.approve',back,h`${hidden('order',order.id)}${hidden('revision',order.current_revision)}${first?hidden('step',first.id):''}${field('Approval note','note',{required:false})}`,`Approve revision ${order.current_revision}${first?' · next step':''}`)):''}
    ${independent&&!route.release&&!current.send?card('Emergency override',h`<details><summary>Authorize an exceptional purchase</summary><p>This separate decision bypasses the ordinary steps and budget ceiling for this exact revision. Review its commitment and every applicable envelope above. Your identity, reason and overrun remain in the emergency report. Any later edit requires authority again.</p>${form('purchase.emergency',back,h`${hidden('order',order.id)}${hidden('revision',order.current_revision)}${area('Emergency authority and reason','reason')}<label class="gk-check"><input type="checkbox" name="confirm" value="yes" required>I separately confirm this exact emergency commitment and its disclosed budget impact.</label>`,'Confirm emergency override',{secondary:true})}</details>`):''}`
}

export function releaseCommitmentForm(actor:Actor,order:any,revision:any) {
  if(!can(actor,'work.review')||actor.id===order.created_by||actor.id===revision.created_by||!revision.send||revision.release) return ''
  return h`<details><summary>Release this sent commitment</summary><p>Confirm that this revision no longer represents an outstanding purchasing obligation. This is not receipt, supplier credit, posted cost or payment.</p>${form('purchase.release',`/app/purchase-orders/${order.id}`,h`${hidden('revisionId',revision.id)}${area('Reason for release','reason')}<label class="gk-check"><input type="checkbox" name="confirm" value="yes" required>I confirm release of this exact sent revision's commitment.</label>`,'Confirm commitment release',{secondary:true})}</details>`
}
