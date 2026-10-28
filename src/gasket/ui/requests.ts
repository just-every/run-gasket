import { displayLocale, intakeLanguage, languageCookie, type IntakeLanguage } from '../languages'
import { customInputs } from './custom-fields'
import { responseNotices, responseSettings } from '../request-response'
// The existing Gasket cards/forms, with no new visual identity.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, insist, newId } from '../core'
import { showInstant } from '../dates'
import { confirmation, getPortal, intake, portalSettings, requestDetail, requestQueue, type RequestField } from '../requests'
import { area, backLink, card, checkbox, field, fileField, form, h, hidden, raw, select, table, tag } from './html'
import { page } from './shell'

function customField(f:RequestField, language:IntakeLanguage) {
  const t=language.text
  const name=`field_${f.key}`
  if(f.type==='photo') return fileField(f.label,name,{required:f.required,accept:'image/png,image/jpeg',hint:t('customPhotoHint')})
  if(f.type==='choice') return select(f.label,name,f.options!.map(value=>({value,label:value})),'',{required:f.required,blank:t('choose')})
  return field(f.label,name,{type:f.type==='number'?'text':f.type,required:f.required,attrs:f.type==='number'?'inputmode="decimal"':''})
}
export async function requestPortalPage(env:Bindings,actor:Actor|null,url:URL,id:string,request:Request) {
  const language=await intakeLanguage(env,await displayLocale(env,actor,request)),t=language.text
  const p=await getPortal(env,id)
  insist(p.enabled,'portal_closed',404)
  insist(actor?.role!=='agent','forbidden',403)
  if(!actor && p.mode==='authenticated') return new Response(null,{status:303,headers:{location:`/signin?returnTo=${encodeURIComponent(url.pathname+url.search)}`,'cache-control':'no-store'}})
  const targetId=url.searchParams.get('target') || ''
  const target=targetId?(await intake(env,actor,id,targetId)).target:null
  const targets=actor?await all(env,`SELECT t.id,t.name FROM gk_request_targets t LEFT JOIN gk_assets a ON a.id=t.asset_id WHERE portal_id=? AND t.retired_at IS NULL AND a.retired_at IS NULL ORDER BY t.name`,id):[]
  const submissionKey=newId()
  const body=h`<p><img src="/brand/mark.svg" width="40" height="40" alt="Gasket"></p><h1>${p.name}</h1>
    <nav aria-label="${t('language')}">${actor?h`<a href="/app/settings/language">${t('languageSettings')}</a>`:h`<a href="${languageLink(url,'en-US')}" lang="en-US">English (US)</a> · <a href="${languageLink(url,'es-US')}" lang="es-US">Español (EE. UU.)</a>`}</nav><p class="gk-lede">${t('report')}</p><p>${t('emergency')}</p>
    ${target?h`<h2>${target.name}</h2>`:h`<p>${t('published')}</p>`}
    ${card(t('details'),h`<form method="post" enctype="multipart/form-data" action="/request/${id}" class="gk-form" id="request-form" target="_blank" rel="noopener" data-portal="${id}" data-target="${targetId}" data-messages="${JSON.stringify(language.messages)}">
      ${hidden('submissionKey',submissionKey)}<noscript><p>${t('noScript')} <a href="/request/${id}/received/${submissionKey}" target="_blank" rel="noopener">${t('checkReceipt')}</a> ${t('beforeAgain')}</p></noscript><p><a data-request-receipt href="/request/${id}/received/${submissionKey}" target="_blank" rel="noopener">${t('checkReceipt')}</a> ${t('beforeRepeat')}</p>${target?hidden('target',target.id):actor?select(t('asset'),'target',targets.map(t=>({value:t.id,label:t.name})),'',{blank:t('choose')}):field(t('code'),'target',{hint:t('codeHint')})}
      ${area(t('description'),'description')}${select(t('urgency'),'urgency',[{value:'normal',label:t('normal')},{value:'high',label:t('high')},{value:'emergency',label:t('urgent')}],'normal')}
      ${field(t('contact'),'contact',{hint:t('contactHint')})}
      ${raw(fileField(t('photo'),'photo',{accept:'image/png,image/jpeg',hint:t('photoHint')}).html.replace('type="file"','type="file" capture="environment"'))}
      ${p.fields.map((f:RequestField)=>customField(f,language))}<div class="gk-visually-hidden" aria-hidden="true">${field(t('empty'),'website',{required:false,attrs:'tabindex="-1" autocomplete="off"'})}</div>
      ${checkbox(t('consent'),'saveOnDevice')}
      <p role="status" id="draft-status">${t('draftIntro')}</p>
      <div class="gk-actions"><button type="submit">${t('send')}</button><button type="button" class="gk-secondary" id="save-request-draft">${t('saveDraft')}</button><button type="button" class="gk-secondary" id="clear-request-draft">${t('clearDraft')}</button></div>
    </form>`)}<p><a href="/signin">${t('signIn')}</a></p>`
  return languageCookie(await page(env,p.name,null,body,{url,script:'/request-drafts.js',language}),request,actor)
}
export async function requestReceiptPage(env:Bindings,url:URL,id:string,key:string,request:Request,actor:Actor|null) {
  const language=await intakeLanguage(env,await displayLocale(env,actor,request)),t=language.text
  const number=await confirmation(env,id,key)
  return languageCookie(await page(env,t('received'),null,h`<h1>${t('received')}</h1><p role="status">${t('confirmation',{number})}</p><p>${t('triage')}</p><p><a href="/request/${id}">${t('another')}</a></p>`,{url,language}),request,actor)
}
function languageLink(url:URL,locale:string) {
  const copy=new URL(url);copy.searchParams.set('language',locale);return copy.pathname+copy.search
}
export async function requestSettingsPage(env:Bindings,actor:Actor,url:URL) {
  const data=await portalSettings(env,actor)
  const assets=await all(env,'SELECT id,tag,name FROM gk_assets WHERE retired_at IS NULL ORDER BY tag')
  const locationInputs=await customInputs(env,'location')
  return page(env,'Request portals',actor,h`<h1>Request portals</h1><p>Intake is authenticated by default. Public intake requires explicit consent, a published label code and bounded submissions. Public contacts are unverified.</p>
    ${card('New portal',form('request.portal','/app/request-portals',h`${field('Portal name','name')}${select('Who may submit','mode',[{value:'authenticated',label:'Signed-in people'},{value:'public',label:'Anyone with a published label'}],'authenticated')}${checkbox('I approve bounded public intake if selected','publicConsent')}`,'Create portal'))}
    ${data.portals.map(p=>card(p.name,h`<p>${tag(p.mode)} ${tag(p.enabled?'active':'closed')} · <a href="/request/${p.id}">Open portal</a></p>
      ${form('request.portal','/app/request-portals',h`${hidden('portal',p.id)}${hidden('revision',p.revision)}${field('Portal name','name',{value:p.name})}${select('Who may submit','mode',[{value:'authenticated',label:'Signed-in people'},{value:'public',label:'Anyone with a published label'}],p.mode)}${checkbox('I approve bounded public intake if selected','publicConsent')}${checkbox('Close this portal','disabled',!p.enabled)}`,'Save portal')}
      <h3>Site request fields</h3>${p.fields.length?table(['Field','Type','Required'],p.fields.map((f:RequestField)=>[f.label,f.type,f.required?'Yes':'No'])):h`<p>No extra fields.</p>`}
      ${form('request.field','/app/request-portals',h`${hidden('portal',p.id)}${hidden('revision',p.revision)}${field('Field label','label')}${select('Field type','type',['text','choice','number','date','photo'].map(value=>({value,label:value})))}${area('Choices (one per line for a choice field)','options',{required:false})}${checkbox('Required','required')}`,'Add request field')}
      <h3>Published targets</h3>${data.targets.filter(t=>t.portal_id===p.id).map(t=>h`<p>${t.name} (${t.kind}) ${t.retired_at||t.asset_retired?tag('retired'):''} · <a href="/request/${p.id}?target=${t.id}">Open scoped fault form</a></p>`)}
      ${form('request.target','/app/request-portals',h`${hidden('portal',p.id)}${select('Label type','kind',['asset','location','bin'].map(value=>({value,label:value})))}${select('Asset (for an asset label)','asset',assets.map(a=>({value:a.id,label:`${a.tag} · ${a.name}`})),'',{required:false,blank:'Location or bin only'})}${field('Published label name','name',{hint:'Only this name is shown on the public form. Do not put private information here.'})}${locationInputs}${checkbox('I approve publishing this label identity','publishConsent')}`,'Publish target')}`))}`,{url})
}
export async function requestsPage(env:Bindings,actor:Actor,url:URL) {
  const rows=await requestQueue(env,actor,url),notices=await responseNotices(env,actor)
  return page(env,'Requests',actor,h`<h1>Requests</h1><p><a href="/app/request-report">Request reporting</a></p><p>Operator faults for the current site. Contacts are as given, not verified identities.</p>
    <form method="get" class="gk-form"><div class="gk-grid">${field('Status','status',{value:url.searchParams.get('status')||'',required:false})}${field('Urgency','urgency',{value:url.searchParams.get('urgency')||'',required:false})}${field('Impact','impact',{value:url.searchParams.get('impact')||'',required:false})}${field('Asset criticality','criticality',{value:url.searchParams.get('criticality')||'',required:false})}</div><button>Filter requests</button></form>
    ${notices.length?card('Your request escalations',h`<p>Stored in-app notices; no external delivery claimed. Open the request to inspect its current clocks and retained ownership.</p><ul>${notices.map(n=>h`<li><a href="/app/requests/${n.request_id}">R-${n.number}</a> · ${n.kind} overdue · ${showInstant(n.created_at,actor.zone)}</li>`)}</ul>`):''}
    ${card('Intake queue',rows.length?table(['Request','Target','Urgency','Impact','Criticality','Status','Fault'],rows.map(r=>[h`<a href="/app/requests/${r.id}">R-${r.number}</a>`,r.target,r.urgency,r.impact,r.criticality??'—',r.status,r.description]),'Requests',{wrap:[1,6]}):h`<p>No requests match.</p>`)}`,{url})
}
export async function requestPage(env:Bindings,actor:Actor,url:URL,id:string) {
  const r=await requestDetail(env,actor,id)
  const lead=can(actor,'work.assign'),back=`/app/requests/${r.id}`
  const candidates=lead?(await requestQueue(env,actor,new URL('https://gasket.invalid'))).filter(c=>c.id!==r.id&&!c.duplicate_of&&!['declined','abandoned'].includes(c.status)):[]
  return page(env,`R-${r.number}`,actor,h`${can(actor,'work.assign')?backLink('/app/requests','Back to requests'):''}<h1>R-${r.number} · ${r.target}</h1><p>${tag(r.status)} · ${r.urgency} · ${r.impact}</p>${lead && (r.routed_team || r.routed_person || r.due_date)?h`<p>Routed to ${r.routed_team ?? ''}${r.routed_person ? ` · ${r.routed_person}` : ''}${r.due_date ? ` · due ${r.due_date}` : ''}</p>`:''}${lead && r.work_order_id?h`<p><a class="gk-button" href="/app/work/${r.work_order_id}">Open linked corrective work</a></p>`:''}${lead && r.linked.length>1?h`<p>Linked reports: ${r.linked.map((l:any)=>h`<a href="/app/requests/${l.id}">R-${l.number}</a> `)}</p>`:''}
    ${r.erased_at?h`<p role="status">Private request data erased.</p>`:''}
    ${lead && r.clock?card('Response clocks',h`<p>Accountable owner: ${r.clock.ownerName}. Escalates to: ${r.clock.escalationName}.</p><p>Policy revision ${r.clock.policy.revision} · ${r.clock.policy.afterHours==='elapsed'?'24-hour elapsed clock':'Site business clock'} · ${r.clock.policy.zone}</p>${table(['Clock','Counted minutes','Target minutes','State'],[['Acknowledgment',r.clock.acknowledgment.elapsedMinutes.toFixed(1),r.clock.acknowledgment.targetMinutes,r.clock.acknowledgedAt?'Acknowledged':r.clock.acknowledgment.overdue?'Overdue':'Waiting'],['Resolution',r.clock.resolution.elapsedMinutes.toFixed(1),r.clock.resolution.targetMinutes,r.clock.resolvedAt?'Resolved':r.clock.resolution.overdue?'Overdue':'Waiting']])}${r.clock.paused?h`<p role="status">Paused: ${r.clock.pauseReason}. This request remains in the backlog.</p>`:''}${!r.clock.resolvedAt?form('request.clock',back,h`${hidden('request',r.id)}${hidden('revision',r.clock.revision)}${hidden('kind',r.clock.paused?'resume':'pause')}${field('Clock change reason','reason')}`,r.clock.paused?'Resume clocks':'Pause clocks'):''}${r.clock.notices.map((n:any)=>h`<p>${n.kind} overdue · ${n.recipient} · accountable owner ${n.owner} · ${showInstant(n.created_at,actor.zone)}${(n.kind==='acknowledgment'?r.clock.acknowledgedAt:r.clock.resolvedAt)?' · settled':' · retained escalation'}</p>`)}`):''}
    ${card('Reported fault',h`<p>${r.description}</p><p>Contact as given (unverified): ${r.contact}</p>${r.form.map((f:RequestField)=>h`<p><strong>${f.label}:</strong> ${r.answers[f.key] || (f.type==='photo'?'See attached photo':'—')}</p>`)}<ul>${r.files.map((f:any)=>h`<li><a href="/app/request-files/${f.id}">${f.filename}</a> · ${f.sha256}</li>`)}</ul>`)}
    ${lead && !['converted','duplicate','declined','abandoned'].includes(r.status)?card('Triage',h`${form('request.triage',back,h`${hidden('request',r.id)}${hidden('version',r.version)}${select('Decision','decision',[{value:'assess',label:'Record assessment'},{value:'ask_details',label:'Ask for details (record in timeline)'},{value:'approve',label:'Approve for work'},{value:'decline',label:'Decline with reason'},{value:'abandon',label:'Mark abandoned (retain report)'}])}${select('Production impact','impact',['unknown','running','reduced','stopped'].map(value=>({value,label:value})),r.impact)}${area('Reason or question','reason')}`,'Record triage decision')}<p>Record the question here, then contact the operator through your normal channel.</p>${candidates.length?form('request.triage',back,h`${hidden('request',r.id)}${hidden('version',r.version)}${hidden('decision','duplicate')}${select('Original report','canonical',candidates.map(c=>({value:c.id,label:`R-${c.number} · ${c.description.slice(0,90)}`})))}${field('Why these reports describe the same fault','reason')}`,'Link as duplicate'):''}`):''}
    ${lead && r.status==='approved'?card('Corrective work',h`<p>The original fault description, target, urgency, requester and all linked reports/photos will be retained without retyping.</p>${form('request.convert','/app/work/{id}',h`${hidden('request',r.id)}${hidden('version',r.version)}${field('Due','due',{type:'date',value:actor.today})}`,'Create one corrective order')}`):''}
    ${r.requester_id===actor.id&&r.status==='needs_details'?card('Supply details',form('request.reply',back,h`${hidden('request',r.id)}${hidden('version',r.version)}${area('Your reply','text')}`,'Supply requested details')):''}
    ${actor.role==='owner'&&!r.erased_at?card('Erase private request data',form('request.erase',back,h`${hidden('request',r.id)}${hidden('version',r.version)}${checkbox('Remove contact, photos, answers and details, including copied corrective fault details','confirm')}`,'Erase request data')):''}
    ${card('Timeline',h`<ol>${r.timeline.map((e:any)=>h`<li><strong>${e.kind.replace(/_/g,' ')}</strong> · ${showInstant(e.at,actor.zone)}<p>${e.text}</p><span class="gk-sub">${e.actor || 'Contact as given'}</span></li>`)}</ol>`)}`,{url})
}

export async function responseSettingsPage(env:Bindings,actor:Actor,url:URL) {
  const data=await responseSettings(env,actor),people=data.people.map(p=>({value:p.id,label:p.name}))
  return page(env,'Request response policy',actor,h`<h1>Request response policy</h1><p>New requests retain the latest policy for their priority, including the current site holidays. Earlier requests keep their original policy. Pauses require a recorded reason. Notices stay in Gasket; The Work reminders automation control also pauses request escalation. External delivery and additional sites arrive under their own clauses.</p>
    ${card('Approve a policy revision',form('request.responsePolicy','/app/request-response',h`${select('Priority','urgency',['normal','high','emergency'].map(value=>({value,label:value})))}${field('Acknowledgment target minutes','acknowledgmentMinutes',{type:'number',value:60})}${field('Resolution target minutes','resolutionMinutes',{type:'number',value:480})}${select('Accountable owner','owner',people)}${select('Escalate to','escalation',people)}${select('After-hours rule','afterHours',[{value:'business',label:'Count business hours only'},{value:'elapsed',label:'Count every elapsed hour'}])}${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((label,i)=>h`<label class="gk-check"><input type="checkbox" name="weekdays" value="${i+1}"${i<5?raw(' checked'):''}> ${label}</label>`)}${field('Opening minute after midnight','opens',{type:'number',value:540})}${field('Closing minute after midnight','closes',{type:'number',value:1020})}`,'Approve response policy'))}
    ${card('Retained policies',data.policies.length?table(['Revision','Priority','Acknowledgment minutes','Resolution minutes','After hours'],data.policies.map((p:any)=>[p.revision,p.urgency,p.acknowledgmentMinutes,p.resolutionMinutes,p.afterHours])):h`<p>No targets configured. Requests without a policy remain visible in the intake queue.</p>`)}`,{url})
}
