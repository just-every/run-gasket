import { customCard } from './custom-fields'
import { one } from '../core'
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { createsWork } from '../site'
import { labelTarget, printableLabels } from '../labels'
import { card, field, fileField, form, h, hidden, raw, select, tag } from './html'
import { page } from './shell'
import { assignChoice } from './create-work'

export async function labelsPage(env:Bindings,actor:Actor,url:URL) {
  const labels=await printableLabels(env,actor,url)
  return page(env,'Print labels',actor,h`<h1>Print labels</h1><p>Print at actual size on durable label stock. QR opens the scoped record or fault form; a Code128 scanner enters the code at <a href="/scan">Scan a label</a>. Reprints keep the same identity.</p>
    <p><button type="button" id="print-labels">Print labels</button></p><div class="gk-label-sheet">${labels.map(l=>h`<section class="gk-label"><h2>${l.name}</h2><p>${l.kind} ${l.retired?tag('retired'):''}</p><div class="gk-label-qr" aria-label="QR code for ${l.name}">${raw(l.qr)}</div><div class="gk-label-barcode" aria-label="Code128 for ${l.name}">${raw(l.barcode)}</div><p class="gk-label-code">${l.id}</p><a href="/scan/${l.id}">Open ${l.name}</a></section>`)}</div>`,{url,script:'/label-scan.js'})
}
export async function scanPage(env:Bindings,actor:Actor|null,url:URL,id?:string) {
  if(!id) return page(env,'Scan a label',actor,h`<h1>Scan a label</h1><p>Use your phone camera to open a QR label, or scan the barcode into the code box.</p><form method="get" action="/scan" class="gk-form">${field('Label code','code',{attrs:'autocomplete="off" autofocus'})}<button>Open label</button></form>`,{url})
  const t=await labelTarget(env,id)
  if(t.retired) return page(env,'Retired label',actor,h`<h1>Retired label</h1><p>${t.name} is retired. This label keeps its identity, but new requests and work are refused.</p><p><a href="/scan">Scan another label</a></p>`,{url,status:410})
  if(!actor) return new Response(null,{status:303,headers:{location:`/request/${t.portal_id}?target=${t.id}`,'cache-control':'no-store'}})
  const allowed=await createsWork(env,actor)
  return page(env,t.name,actor,h`<h1>${t.name}</h1><p>${t.kind} label</p>${t.asset_id?h`<p><a class="gk-button gk-secondary" href="/app/assets/${t.asset_id}">Open authorized asset record</a></p>`:''}
    ${t.asset_id ? await customCard(env,actor,'asset',t.asset_id,(await one(env,'SELECT category FROM gk_assets WHERE id=?',t.asset_id))?.category ?? null,`/scan/${t.id}`) : t.kind === 'location' ? await customCard(env,actor,'location',t.id,null,`/scan/${t.id}`) : ''}<p><a class="gk-button" href="/request/${t.portal_id}?target=${t.id}">Report a fault</a></p>
    ${allowed?card('New corrective work',form('label.work','/app/work/{id}',h`${hidden('target',t.id)}${field('Title','title')}${field('Description','description')}${select('Priority','priority',[{value:'normal',label:'Normal'},{value:'high',label:'High'},{value:'emergency',label:'Emergency'}],'normal')}${field('Due','due',{type:'date',value:actor.today})}${await assignChoice(env,actor)}${fileField('Photo (optional)','photo',{accept:'image/png,image/jpeg'})}`,'Create corrective work',{multipart:true})):h`<p>Your role or current site setting does not allow creating work. Use the fault form instead.</p>`}`,{url})
}
