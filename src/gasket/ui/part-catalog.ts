// PART-008 additions use the established parts cards and form doors.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { supplierList } from '../suppliers'
import { usd } from '../bad-actors'
import { amount, card, field, fileField, form, h, hidden, select, table } from './html'

export async function catalogImportCard(env: Bindings, actor: Actor) {
  if(!can(actor,'site.manage')) return ''
  const suppliers=(await supplierList(env)).filter(row=>row.active)
  return card('Import supplier catalog',h`<p>Use stocking units for each part; a pack quantity says how many stocking units one supplier pack holds. Prices are USD per pack. Importing creates no stock.</p><p>CSV columns: number, name, unit, manufacturer, manufacturerNumber, vendorNumber, packUnit, packQuantity, price.</p>
    ${suppliers.length ? h`<form method="post" action="/app/parts/catalog-preview" enctype="multipart/form-data" class="gk-form">${select('Supplier','supplier',suppliers.map(row=>({value:row.id,label:row.name})))}${fileField('Catalog CSV','file',{required:true,accept:'.csv'})}<div class="gk-actions"><button type="submit">Review catalog</button></div></form>` : h`<p><a href="/app/purchasing">Add an active supplier first</a>.</p>`}`,{id:'catalog-import'})
}
export function catalogCard(part: any, actor: Actor) {
  const manage=can(actor,'register.manage'),back=`/app/parts/${part.id}`,items=part.catalog.items
  return card('Supplier catalogs and numbers',h`${part.catalog.aliases.length ? h`<p>${part.catalog.aliases.map((a:any)=>`${a.kind}: ${a.number}${a.supplier_name ? ` (${a.supplier_name})` : ''}`).join(' · ')}</p>` : ''}
    ${items.length ? table(['Supplier','Numbers','Pack','Price',''],items.map((item:any)=>[
      h`<a href="/app/suppliers/${item.supplier_id}">${item.supplier_name}</a><span class="gk-sub">${item.preferred ? 'Preferred supplier' : 'Alternative supplier'}</span>`,
      h`${item.sku}<span class="gk-sub">${item.manufacturer} ${item.manufacturer_number}</span>`,
      h`1 ${item.unit} = ${amount(item.packQuantity,item.stocking_unit)}`,usd(item.price_cents),
      manage ? h`${form('catalog.receive',back,h`${hidden('item',item.id)}${field('Packs received','quantity',{attrs:'inputmode="decimal"'})}`,'Receive packs',{secondary:true})}${!item.preferred ? form('catalog.prefer',back,hidden('item',item.id),'Make preferred',{secondary:true}) : ''}` : '',
    ]),'Supplier packs',{wrap:[0,1,2,4]}) : h`<p class="gk-muted">No supplier catalog entries yet.</p>`}${part.catalog.imports.length ? h`<h3>Reviewed catalog imports</h3><ul class="gk-plain-list">${part.catalog.imports.map((job:any)=>h`<li>${job.filename}<span class="gk-sub">Source SHA-256: ${String(job.digest).match(/.{1,8}/g)?.map(chunk=>h`${chunk}<wbr>`)}</span>${can(actor,'site.manage') && !job.undone_at ? form('catalog.undo','/app/parts',hidden('job',job.job),'Undo if unused',{secondary:true}) : ''}</li>`)}</ul>` : ''}`,{id:'catalog'})
}
export function photosCard(part:any,actor:Actor) {
  return card('Part photos',h`${part.photos.map((photo:any)=>h`<figure><a href="/app/part-photos/${photo.id}"><img src="/app/part-photos/${photo.id}" alt="${photo.filename}" width="200" loading="lazy"></a><figcaption>${photo.filename}</figcaption></figure>`)}
    ${can(actor,'register.manage') ? form('part.photo',`/app/parts/${part.id}`,h`${hidden('part',part.id)}${fileField('Photo','photo',{required:true,accept:'image/png,image/jpeg,image/webp'})}`,'Add photo',{multipart:true,secondary:true}) : ''}`,{id:'part-photos'})
}
export function mergeCard(part:any,others:any[],actor:Actor) {
  return card('Duplicate part control',h`${part.merges.length ? h`<ul>${part.merges.map((m:any)=>h`<li>${m.source_number} merged into this item. ${m.reason}</li>`)}</ul>` : h`<p>Preview every dependency before approving a duplicate merge. Original movements and compatibility evidence stay linked.</p>`}
    ${can(actor,'register.manage') && others.length ? h`<form method="get" action="/app/parts/merge" class="gk-form">${hidden('canonical',part.id)}${select('Duplicate to merge into this part','source',others.map(p=>({value:p.id,label:`${p.number} ${p.name}`})))}<div class="gk-actions"><button type="submit" class="gk-secondary">Preview merge</button></div></form>` : ''}`,{id:'part-merge'})
}
