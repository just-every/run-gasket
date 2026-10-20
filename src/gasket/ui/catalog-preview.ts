// PART-008: no-write file review precedes an exact-fingerprint catalog apply.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { catalogPreview } from '../catalogs'
import type { Input } from '../input'
import { fromMilli } from '../quantity'
import { usd } from '../bad-actors'
import { backLink, card, h, hidden, table } from './html'
import { page } from './shell'
export async function catalogPreviewPage(env:Bindings,actor:Actor,input:Input,url:URL) {
  const preview=await catalogPreview(env,actor,input),file=(await input.file('file',{maxBytes:1_500_000}))!
  const base64=btoa(Array.from(file.bytes,b=>String.fromCharCode(b)).join(''))
  return page(env,'Review supplier catalog',actor,h`${backLink('/app/parts','Parts')}<h1>Review ${preview.supplier.name} catalog</h1><p class="gk-lede">${preview.filename}. Nothing has been imported yet.</p>
    ${card('Catalog mappings',table(['Part','Manufacturer','Vendor number','Pack','Price','Change'],preview.rows.map(row=>[
      `${row.number} · ${row.name}`,`${row.manufacturer} ${row.manufacturerNumber}`,row.sku,`1 ${row.packUnit} = ${fromMilli(row.pack)} ${row.unit}`,usd(row.price),row.operation,
    ]),'Catalog review',{wrap:[0,1,2,3]}))}
    ${card('Apply reviewed catalog',h`<p>${preview.creates} new parts. Existing vendor numbers keep their inventory identity. Importing creates no stock; a repeated manufacturer number remains a proposed duplicate until a lead approves its merge.</p><form method="post" action="/app/do/catalog.apply" class="gk-form">${hidden('returnTo','/app/parts')}${hidden('supplier',preview.supplier.id)}${hidden('fingerprint',preview.fingerprint)}${hidden('filename',file.filename)}${hidden('base64',base64)}${hidden('mediaType',file.declaredType)}<div class="gk-actions"><button type="submit">Apply reviewed catalog</button></div></form>`)}`,{url})
}
