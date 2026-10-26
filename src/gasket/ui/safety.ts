import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { safetyState, QUALIFICATION_PROVENANCE } from '../safety'
import type { Row } from '../core'
import { area, card, checkbox, field, fileField, form, h, hidden } from './html'

export async function safetyCard(env: Bindings,actor: Actor,order: Row,back:string) {
  const state=await safetyState(env,actor,order),r=state.requirement
  if(!r)return h``
  return card('Isolation and permit evidence',h`<p>${r.hazard}</p><p>${r.isolation}</p><p>Required qualification: ${r.qualification}</p><p>Site-approved by ${r.publisher}. Revision ${r.revision}.</p><p>Human attestations only. Gasket does not determine physical safety or authorize equipment release.</p>
    ${state.missing.length?h`<ul>${state.missing.map((reason:string)=>h`<li>${reason}</li>`)}</ul>`:h`<p>Required evidence recorded.</p>`}
    ${state.attestations.map(a=>h`<p>${a.signer_name}: permit ${a.permit}, expires ${a.expires_on}. ${a.reasons.join('. ')}</p>${a.qualification?h`<p>${a.qualification.name}: ${a.qualification.reference}. Recorded expiry: ${a.qualification.expires_on}. Calculated state: ${a.qualification.expires_on<=actor.today?'expired':'in date'}.</p><p>${QUALIFICATION_PROVENANCE}</p>`:''}`)}
    ${can(actor,'work.do')&&actor.id===order.assignee_id&&['open','in_progress','returned'].includes(order.status)?form('safety.attest',back,h`${hidden('workOrder',order.id)}${hidden('version',order.version)}${checkbox('I attest the site-approved isolation prerequisites were performed','isolated',false)}${field('Permit reference','permit')}${field('Permit expires','expires',{type:'date'})}${fileField('Permit original','file',{accept:'.pdf,.png,.jpg,.txt'})}`,'Record qualified sign-off',{multipart:true,secondary:true}):''}
    ${actor.role==='owner'?h`<p><a href="/app/work/${order.id}/compliance.zip">Download compliance audit pack</a></p>`:''}`)
}

export function safetyTemplateCard(actor: Actor,id:string) {
  if(!can(actor,'register.manage'))return h``
  return card('Site-approved safety prerequisites',form('safety.publish',`/app/checklists/${id}`,h`${hidden('checklist',id)}${area('Hazards','hazard')}${area('Isolation prerequisites','isolation')}${field('Required qualification or training reference name','qualification')}${checkbox('I confirm these are site-approved procedures','siteApproved',false)}`,'Publish prerequisites',{secondary:true}))
}
