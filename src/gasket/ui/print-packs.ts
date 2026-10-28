import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { newId } from '../core'
import { languagePreferences, intakeLanguage } from '../languages'
import { printText } from '../print-catalog'
import { readPrintPack, readPrintPreview, workPrintPacks } from '../print-packs'
import { kindOf, lineOf } from '../steps'
import { h, card, form, hidden, field, area, fileField, select, backLink } from './html'
import { page } from './shell'

export async function printPackCard(env: Bindings, actor: Actor, work: {id:string;version:number;canIssue:boolean}) {
  const t=printText((await languagePreferences(env,actor)).effective), packs=await workPrintPacks(env,actor,work.id)
  return card(t('title'),h`<p>${t('warning')}</p>
    ${work.canIssue?form('printpack.issue','/app/print-packs/{id}',h`${hidden('workOrder',work.id)}${hidden('version',work.version)}`,t('issue'),{secondary:true}):''}
    ${packs.length?h`<ul>${packs.map(pack=>h`<li><a href="/app/print-packs/${pack.id}">${t('open')} · ${t('revision')} ${pack.work_version}</a></li>`)}</ul>`:''}`)
}
export async function printPackPage(env: Bindings, actor: Actor, url: URL, id: string) {
  const pack=await readPrintPack(env,actor,id), c=pack.content, locale=(await languagePreferences(env,actor)).effective,
    t=printText(locale),language=await intakeLanguage(env,locale)
  const fields=c.steps.map((step,i)=>h`<fieldset><legend>${i+1}. ${step.text}</legend><p>${lineOf(step,c.steps)}</p>
    ${kindOf(step)==='photo'?'':kindOf(step)==='check'?select(t('result'),`outcome-${i}`,[{value:'pass',label:t('pass')},{value:'attention',label:t('attention')},{value:'fail',label:t('fail')}],'',{required:false,blank:t('blank')}):kindOf(step)==='option'?select(t('value'),`value-${i}`,step.options!.map(value=>({value,label:value})),'',{required:false,blank:t('blank')}):field(t('value'),`value-${i}`,{required:false})}
    ${kindOf(step)==='photo'?'':area(t('note'),`note-${i}`,{required:false})}</fieldset>`)
  return page(env,t('title'),actor,h`${backLink(`/app/work/${c.work}`,t('back'))}<h1>${t('title')}</h1>
    <p>${c.workNumber} · ${t('revision')} ${c.workVersion} · ${t('checklist')} ${c.checklistNumber}</p>
    <p><code>${id}</code></p><p>${t('issuer')}: ${c.issuerName} · ${t('issued')}: ${new Date(c.issuedAt).toISOString()}</p>
    <p>${t('digest')}: <code class="gk-paper-digest">${pack.contentDigest}</code></p>
    <p><a class="gk-button gk-secondary" href="/app/print-packs/${id}/pack.pdf">${t('download')}</a> · <a href="/app/print-packs/${id}/print">${t('printView')}</a></p>
    ${card(c.title,h`<div class="gk-paper-authored">${c.instructions}</div><ol>${c.steps.map(step=>h`<li>${lineOf(step,c.steps)}</li>`)}</ol>`)}
    <p>${t('warning')}</p><p>${t('limitations')}</p>
    ${pack.canEnter?card(t('entry'),form('printpack.preview','/app/print-previews/{id}',h`${hidden('pack',id)}${hidden('workOrder',c.work)}${hidden('version',c.workVersion)}${hidden('submissionKey',newId())}${fields}
      ${field(t('performed'),'performedOn',{type:'datetime-local',hint:t('performedHint')})}${fileField(t('paper'),'original',{required:true,accept:'.pdf,.png,.jpg,.jpeg',hint:'PDF, PNG, JPEG · 1.5 MB'})}`,t('preview'),{multipart:true})):
      h`<p role="status">${t('stale')}</p>`}
    ${pack.entries.map(receipt=>card(t('accepted'),h`<p>${t('entrant')}: ${receipt.entrantName} · ${t('performed')}: ${receipt.performedOn}</p><p><a href="/app/print-previews/${receipt.id}">${t('receipt')}</a></p>`))}`,{url,language})
}
export async function printPreviewPage(env: Bindings, actor: Actor, url: URL, id: string) {
  const preview=await readPrintPreview(env,actor,id), locale=(await languagePreferences(env,actor)).effective,
    t=printText(locale),language=await intakeLanguage(env,locale), p=preview.payload,c=preview.content
  return page(env,preview.receipt?t('accepted'):t('preview'),actor,h`${backLink(`/app/print-packs/${preview.pack}`,t('open'))}<h1>${preview.receipt?t('accepted'):t('preview')}</h1>
    <p>${c.workNumber} · ${t('revision')} ${c.workVersion} · ${t('checklist')} ${c.checklistNumber}</p><p><code>${preview.pack}</code></p><p>${t('performed')}: ${p.performedOn}</p>
    <p>${t('originalDigest')}: <code class="gk-paper-digest">${preview.originalDigest}</code></p>
    <p><a href="/app/print-previews/${id}/original">${t('original')}: ${preview.originalName}</a></p>
    ${card(t('notes'),h`<ol>${c.steps.map((step,i)=>h`<li><b>${step.text}</b><p>${p.outcome[i]?t(p.outcome[i]):p.value[i]||t('blank')}</p><div class="gk-paper-authored">${p.note[i]}</div></li>`)}</ol>`)}
    ${preview.receipt?h`<div role="status"><p>${t('saved')}</p><p>${t('entrant')}: ${preview.receipt.entrantName}</p><p>${t('entered')}: ${new Date(preview.receipt.enteredAt).toISOString()}</p><p>${t('receipt')}: <code>${id}</code></p><p>${t('pending')}</p></div>`:
      h`<p>${t('previewHint')}</p>${preview.canAccept?form('printpack.accept',`/app/print-previews/${id}`,h`${hidden('preview',id)}${hidden('digest',preview.digest)}${hidden('confirm','yes')}`,t('confirm')):h`<p role="alert">${t('stale')}</p>`}`}`,{url,language})
}

/** Native browser printing repeats the same snapshot identity on each physical page. */
export async function printSheetPage(env: Bindings, actor: Actor, _url: URL, id: string) {
  const pack=await readPrintPack(env,actor,id),c=pack.content,t=printText(c.locale)
  const identity=h`<b>${c.workNumber}</b> · ${t('revision')} ${c.workVersion} · ${t('checklist')} ${c.checklistNumber} · ${c.checklist}<br>${id}<br><span class="gk-paper-digest">${pack.contentDigest}</span>`
  const body=h`<!doctype html><html lang="${c.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${c.workNumber} ${t('title')}</title><link rel="stylesheet" href="/gasket.css"></head>
    <body class="gk-print-sheet"><a class="gk-print-back" href="/app/print-packs/${id}">${t('open')}</a><table><thead><tr><td>${identity}</td></tr></thead><tbody>
    <tr><td><h1>${c.title}</h1><p>${t('issuer')}: ${c.issuerName} · ${new Date(c.issuedAt).toISOString()}</p><p>${t('warning')}</p><p>${t('limitations')}</p></td></tr>
    ${c.instructions.replace(/\r\n?/g,'\n').split('\n').map(line=>h`<tr><td class="gk-paper-authored">${line}</td></tr>`)}
    ${c.steps.map((step,i)=>h`<tr><td><h2>${i+1}. ${step.text}</h2><p>${lineOf(step,c.steps)}</p><p>${t('notes')}: ___________________________________</p><p>________________________________________________</p></td></tr>`)}
    <tr><td><p>${t('performed')}: ___________________________________</p></td></tr></tbody></table></body></html>`
  return new Response(body.html,{headers:{'content-type':['text','html'].join('/')+'; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'"}})
}
