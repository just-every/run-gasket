// The existing Gasket cards/forms, with no new visual identity.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, insist, newId } from '../core'
import { showInstant } from '../dates'
import { confirmation, getPortal, intake, portalSettings, requestDetail, requestQueue, type RequestField } from '../requests'
import { area, backLink, card, checkbox, field, fileField, form, h, hidden, raw, select, table, tag } from './html'
import { page } from './shell'

function customField(f:RequestField) {
  const name=`field_${f.key}`
  if(f.type==='photo') return fileField(f.label,name,{required:f.required,accept:'image/png,image/jpeg',hint:'PNG or JPEG, up to 1.5 MB.'})
  if(f.type==='choice') return select(f.label,name,f.options!.map(value=>({value,label:value})),'',{required:f.required,blank:'Choose…'})
  return field(f.label,name,{type:f.type==='number'?'text':f.type,required:f.required,attrs:f.type==='number'?'inputmode="decimal"':''})
}
export async function requestPortalPage(env:Bindings,actor:Actor|null,url:URL,id:string) {
  const p=await getPortal(env,id)
  insist(p.enabled,'portal_closed',404)
  insist(actor?.role!=='agent','forbidden',403)
  if(!actor && p.mode==='authenticated') return new Response(null,{status:303,headers:{location:`/signin?returnTo=${encodeURIComponent(url.pathname+url.search)}`,'cache-control':'no-store'}})
  const targetId=url.searchParams.get('target') || ''
  const target=targetId?(await intake(env,actor,id,targetId)).target:null
  const targets=actor?await all(env,`SELECT t.id,t.name FROM gk_request_targets t LEFT JOIN gk_assets a ON a.id=t.asset_id WHERE portal_id=? AND t.retired_at IS NULL AND a.retired_at IS NULL ORDER BY t.name`,id):[]
  const body=h`<p><img src="/brand/mark.svg" width="40" height="40" alt="Gasket"></p><h1>${p.name}</h1>
    <p class="gk-lede">Report an equipment fault</p><p>For immediate danger, follow your site's emergency procedure. This form does not summon emergency services.</p>
    ${target?h`<h2>${target.name}</h2>`:h`<p>Scan a site label or choose its published code. Private maintenance records are never available here.</p>`}
    ${card('Fault details',h`<form method="post" enctype="multipart/form-data" action="/request/${id}" class="gk-form" id="request-form" data-portal="${id}" data-target="${targetId}">
      ${hidden('submissionKey',newId())}${target?hidden('target',target.id):actor?select('Asset or location','target',targets.map(t=>({value:t.id,label:t.name})),'',{blank:'Choose…'}):field('Label code','target',{hint:'The code printed below the QR label.'})}
      ${area('What is wrong?','description')}${select('Urgency','urgency',[{value:'normal',label:'Normal'},{value:'high',label:'High'},{value:'emergency',label:'Emergency'}],'normal')}
      ${field('Your name and contact','contact',{hint:'Contact details are kept for the maintenance team. They do not create or verify an account.'})}
      ${raw(fileField('Photo (optional)','photo',{accept:'image/png,image/jpeg',hint:'Use your camera or choose a PNG/JPEG, up to 1.5 MB.'}).html.replace('type="file"','type="file" capture="environment"'))}
      ${p.fields.map(customField)}<div class="gk-visually-hidden" aria-hidden="true">${field('Leave empty','website',{required:false,attrs:'tabindex="-1" autocomplete="off"'})}</div>
      ${checkbox('Save this draft and photos on this private device','saveOnDevice')}
      <p role="status" id="draft-status">Your draft can be saved on this device. Use a private device for contact details and photos.</p>
      <div class="gk-actions"><button type="submit">Send request</button><button type="button" class="gk-secondary" id="save-request-draft">Save draft</button><button type="button" class="gk-secondary" id="clear-request-draft">Clear draft</button></div>
    </form>`)}<p><a href="/signin">Maintenance team sign in</a></p>`
  return page(env,p.name,null,body,{url,script:'/request-drafts.js'})
}
export async function requestReceiptPage(env:Bindings,url:URL,id:string,key:string) {
  const number=await confirmation(env,id,key)
  return page(env,'Request received',null,h`<h1>Request received</h1><p role="status">Request R-${number} is saved. Keep this confirmation link.</p><p>The maintenance team will triage it. Sending this form does not authorize work or spending.</p><p><a href="/request/${id}">Report another fault</a></p>`,{url})
}
export async function requestSettingsPage(env:Bindings,actor:Actor,url:URL) {
  const data=await portalSettings(env,actor)
  const assets=await all(env,'SELECT id,tag,name FROM gk_assets WHERE retired_at IS NULL ORDER BY tag')
  return page(env,'Request portals',actor,h`<h1>Request portals</h1><p>Intake is authenticated by default. Public intake requires explicit consent, a published label code and bounded submissions. Public contacts are unverified.</p>
    ${card('New portal',form('request.portal','/app/request-portals',h`${field('Portal name','name')}${select('Who may submit','mode',[{value:'authenticated',label:'Signed-in people'},{value:'public',label:'Anyone with a published label'}],'authenticated')}${checkbox('I approve bounded public intake if selected','publicConsent')}`,'Create portal'))}
    ${data.portals.map(p=>card(p.name,h`<p>${tag(p.mode)} ${tag(p.enabled?'active':'closed')} · <a href="/request/${p.id}">Open portal</a></p>
      ${form('request.portal','/app/request-portals',h`${hidden('portal',p.id)}${hidden('revision',p.revision)}${field('Portal name','name',{value:p.name})}${select('Who may submit','mode',[{value:'authenticated',label:'Signed-in people'},{value:'public',label:'Anyone with a published label'}],p.mode)}${checkbox('I approve bounded public intake if selected','publicConsent')}${checkbox('Close this portal','disabled',!p.enabled)}`,'Save portal')}
      <h3>Site request fields</h3>${p.fields.length?table(['Field','Type','Required'],p.fields.map((f:RequestField)=>[f.label,f.type,f.required?'Yes':'No'])):h`<p>No extra fields.</p>`}
      ${form('request.field','/app/request-portals',h`${hidden('portal',p.id)}${hidden('revision',p.revision)}${field('Field label','label')}${select('Field type','type',['text','choice','number','date','photo'].map(value=>({value,label:value})))}${area('Choices (one per line for a choice field)','options',{required:false})}${checkbox('Required','required')}`,'Add request field')}
      <h3>Published targets</h3>${data.targets.filter(t=>t.portal_id===p.id).map(t=>h`<p>${t.name} (${t.kind}) ${t.retired_at||t.asset_retired?tag('retired'):''} · <a href="/request/${p.id}?target=${t.id}">Open scoped fault form</a></p>`)}
      ${form('request.target','/app/request-portals',h`${hidden('portal',p.id)}${select('Label type','kind',['asset','location','bin'].map(value=>({value,label:value})))}${select('Asset (for an asset label)','asset',assets.map(a=>({value:a.id,label:`${a.tag} · ${a.name}`})),'',{required:false,blank:'Location or bin only'})}${field('Published label name','name',{hint:'Only this name is shown on the public form. Do not put private information here.'})}${checkbox('I approve publishing this label identity','publishConsent')}`,'Publish target')}`))}`,{url})
}
export async function requestsPage(env:Bindings,actor:Actor,url:URL) {
  const rows=await requestQueue(env,actor,url)
  return page(env,'Requests',actor,h`<h1>Requests</h1><p>Operator faults for the current site. Contacts are as given, not verified identities.</p>
    <form method="get" class="gk-form"><div class="gk-grid">${field('Status','status',{value:url.searchParams.get('status')||'',required:false})}${field('Urgency','urgency',{value:url.searchParams.get('urgency')||'',required:false})}${field('Asset criticality','criticality',{value:url.searchParams.get('criticality')||'',required:false})}</div><button>Filter requests</button></form>
    ${card('Intake queue',rows.length?table(['Request','Target','Urgency','Criticality','Status','Fault'],rows.map(r=>[h`<a href="/app/requests/${r.id}">R-${r.number}</a>`,r.target,r.urgency,r.criticality??'—',r.status,r.description]),'Requests',{wrap:[1,5]}):h`<p>No requests match.</p>`)}`,{url})
}
export async function requestPage(env:Bindings,actor:Actor,url:URL,id:string) {
  const r=await requestDetail(env,actor,id)
  return page(env,`R-${r.number}`,actor,h`${can(actor,'work.assign')?backLink('/app/requests','Back to requests'):''}<h1>R-${r.number} · ${r.target}</h1><p>${tag(r.status)} · ${r.urgency}</p>
    ${card('Reported fault',h`<p>${r.description}</p><p>Contact as given (unverified): ${r.contact}</p>${r.form.map((f:RequestField)=>h`<p><strong>${f.label}:</strong> ${r.answers[f.key] || (f.type==='photo'?'See attached photo':'—')}</p>`)}<ul>${r.files.map((f:any)=>h`<li><a href="/app/request-files/${f.id}">${f.filename}</a> · ${f.sha256}</li>`)}</ul>`)}
    ${card('Timeline',h`<ol>${r.timeline.map((e:any)=>h`<li><strong>${e.kind.replace(/_/g,' ')}</strong> · ${showInstant(e.at,actor.zone)}<p>${e.text}</p><span class="gk-sub">${e.actor || 'Contact as given'}</span></li>`)}</ol>`)}`,{url})
}
