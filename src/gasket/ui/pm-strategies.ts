// Strategy controls extend the existing Schedules cards and form components.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { strategyView, previewStrategy } from '../pm-strategies'
import { Input } from '../input'
import { lineOf } from '../steps'
import { area, card, field, form, h, hidden, select, table } from './html'

export async function strategiesCard(env:Bindings,actor:Actor,url:URL,schedules:any[]) {
  if(!can(actor,'board.read'))return ''
  const data=await strategyView(env,actor),manage=can(actor,'register.manage'),review=can(actor,'work.review')
  const selected=url.searchParams.get('strategy'),ids=url.searchParams.getAll('schedules')
  const preview=selected&&ids.length?await previewStrategy(env,actor,Input.of({strategy:selected,schedules:ids})):null
  return card('Preventive strategy library',h`<p>Versioned starting templates require local adaptation and independent approval. Equipment-specific safety and manufacturer requirements must be reviewed by a qualified person. This door covers the current site and calendar or meter schedules. Issued work and its due occurrence are retained.</p>
    ${manage?form('pm.copy','/app/schedules#strategies',h`${select('Library template','template',data.library.map(t=>({value:t.id,label:t.name+' · library version '+t.version})))}${field('Strategy name','name')}${field('Asset class (category)','category')}`,'Copy template'):''}
    ${data.strategies.map(s=>h`<h3>${s.name}</h3><p>${s.category} · library ${s.library_key} version ${s.library_version} · strategy revision ${s.number} · ${s.approved_by?'Approved':'Draft; not available for rollout'}</p><ol>${JSON.parse(s.items_json).map((step:any)=>h`<li>${step.text}</li>`)}</ol><p>Every ${s.every_days} days. Safety and manufacturer reference: ${s.reference}</p>
      ${manage?form('pm.adapt','/app/schedules#strategies',h`${hidden('strategy',s.id)}${hidden('number',s.number)}${area('Adapted steps','items',{value:JSON.parse(s.items_json).map((step:any,_:number,items:any[])=>lineOf(step,items)).join('\n')})}${field('Interval days','everyDays',{type:'number',value:s.every_days})}${area('Safety and manufacturer reference','reference',{value:s.reference})}${area('Revision reason','note')}`,'Save strategy draft'):''}
      ${review&&!s.approved_by&&s.number>1&&s.revision_author!==actor.id?form('pm.approve','/app/schedules#strategies',h`${hidden('strategy',s.id)}${hidden('revision',s.revision_id)}${area('Approval reason','reason')}`,'Approve strategy'):''}
      ${(manage||review)&&s.approved_by?h`<form method="get" action="/app/schedules" class="gk-form">${hidden('strategy',s.id)}${select('Affected schedule','schedules',schedules.filter(row=>row.asset_id).map(row=>({value:row.id,label:row.title})))}<button>Preview strategy rollout</button></form>`:''}`)}
    ${preview?h`<h3>Rollout diff</h3>${table(['Schedule','Current days','Program days','Local conflicts','Issued work'],preview.rows.map(r=>[r.title,r.current.everyDays??'Meter trigger retained',r.proposed.everyDays??'Meter trigger retained',r.conflicts.join(', ')||'None',r.issued.length]),'Strategy rollout diff',{wrap:[0,3]})}${preview.rows.map(r=>h`<h4>${r.title}</h4><p>Current steps: ${r.current.items.map((i:any)=>i.text).join('; ')}</p><p>Proposed steps: ${r.proposed.items.map((i:any)=>i.text).join('; ')}</p>`)}
      ${review?form('pm.rollout','/app/schedules#strategies',h`${hidden('strategy',preview.strategy)}${hidden('hash',preview.hash)}${preview.rows.map(r=>hidden('schedules',r.id))}${hidden('occurrencePlan','preserve_issued_and_due')}<p>Approve the diff and preserve issued work, existing due dates and local changes. Cancellation plan: no issued work is cancelled. Catch-up plan: retained due dates and meter occurrences remain available to ordinary work generation.</p>${preview.rows.filter(r=>r.conflicts.length).map(r=>h`<h4>${r.title}: explicit local decision</h4>${select('Conflict decision','choice_'+r.id,[{value:'keep_local',label:'Keep local values'},{value:'use_program',label:'Use approved program values'}])}${area('Conflict reason','reason_'+r.id)}`)}`,'Approve rollout'):h`<p>An independent owner or supervisor approves the exact rollout.</p>`}`:''}
    ${data.rollouts.length?h`<h3>Retained rollouts</h3>${table(['Rollout','Revision','Occurrence plan'],data.rollouts.map(r=>[r.id,r.revision_id,r.occurrence_plan]),'Rollout history',{wrap:[0,1,2]})}`:''}`,{id:'strategies'})
}
