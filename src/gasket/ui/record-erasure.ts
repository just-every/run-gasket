import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { insist } from '../core'
import { publicRecordErasurePreview } from '../record-erasure'
import { card, field, form, h, hidden, select, table } from './html'
import { page } from './shell'

const label = (name: string) => name.replace(/^(gk|oa)_/,'').replace(/_/g,' ')

export async function recordErasurePage(env: Bindings, actor: Actor, url: URL) {
  insist(actor.role==='owner'&&!actor.service,'forbidden',403)
  const kind=url.searchParams.get('kind')??'work', id=url.searchParams.get('id')??''
  const preview=id?await publicRecordErasurePreview(env,actor,url):null
  return page(env,'Record erasure',actor,h`<h1>Record erasure</h1><p>Preview dependencies before confirming erasure. Retention and evidence obligations take priority. End a non-owner's access before erasing their identity.</p>
    ${card('Choose a record',h`<form method="get" class="gk-form" action="/app/settings/erasure">${select('Record type','kind',[{value:'work',label:'Work order'},{value:'user',label:'User'}],kind)}${field('Record ID','id',{value:id})}<div class="gk-actions"><button type="submit">Preview erasure</button></div></form>`)}
    ${preview?card('Erasure preview',h`<p>${preview.erased?'Already erased':preview.eligible?'Eligible for owner-confirmed erasure':'Retained: erasure refused'}</p>${preview.blockers.map(reason=>h`<p>${reason.replace(/(?:gk|oa)_\w+/g,label)}</p>`)}${table(['Record type','Count'],Object.entries(preview.dependencies).filter(([,count])=>count>0).map(([type,count])=>[label(type),count]),'Erasure dependencies',{wrap:[0]})}
      ${preview.erased?h`<p>Erasure completed. Anonymized audit remains. Prior downloads are outside local erasure.</p>${table(['Removed record type','Count'],Object.entries(preview.result.removed as Record<string,number>).filter(([,count])=>count>0).map(([type,count])=>[label(type),count]),'Erasure result',{wrap:[0]})}<p>API retry results redacted: ${preview.result.redacted?.apiReceiptResults ?? 0}. Hashed retry claims remain to prevent repeated effects.</p>`:h`<p>API retry results to redact: ${preview.receiptResults ?? 0}. Hashed retry claims remain to prevent repeated effects.</p>${preview.obligations?.map(text=>h`<p>${text}</p>`)}${preview.eligible?form('record.erase',url.pathname+url.search,h`${hidden('kind',kind)}${hidden('id',id)}${hidden('token',preview.token)}<label><input type="checkbox" name="confirm" required> I confirm permanent erasure of this previewed record and its eligible dependencies.</label>`,'Erase this record'):''}`}`):''}`,{url})
}
