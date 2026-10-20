import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { Input } from '../input'
import { mergePreview } from '../part-merge'
import { backLink, card, field, form, h, hidden, table } from './html'
import { page } from './shell'

const LABELS: Record<string,string>={gk_part_moves:'Stock movements',gk_part_substitutes:'Substitute approvals',gk_kit_lines:'Repair kit lines',gk_reservations:'Work reservations',gk_bom_lines:'Bill of materials lines',gk_bom_alternates:'Serial compatibility and alternates',gk_count_lines:'Cycle count lines',gk_receipt_lines:'Delivery lines',gk_replenishment_policies:'Reorder policies',gk_replenishment_policy_revisions:'Reorder policy history',gk_replenishments:'Open and completed replenishments',gk_notices:'Notices',gk_supplier_items:'Supplier packs and prices',gk_part_aliases:'Retained part numbers',gk_part_photos:'Photos',proposals:'Count proposals',audit:'Attributed history',catalogImports:'Reviewed catalog sources',imports:'Import mappings',gk_part_merges:'Earlier approved merges',gk_part_canonical:'Retained canonical links'}
// Break opaque record IDs and digests without changing copied text or part-number binding.
const readable = (value:unknown) => h`${String(value??'—').split(/([a-f0-9]{8}-[a-f0-9-]{27}|[a-f0-9]{32,64})/gi).map((piece,index)=>index%2 ? piece.match(/.{1,8}/g)?.map(chunk=>h`${chunk}<wbr>`) : piece)}`
export async function partMergePage(env:Bindings,actor:Actor,url:URL) {
  const value=await mergePreview(env,actor,Input.of({source:url.searchParams.get('source'),canonical:url.searchParams.get('canonical')}))
  const source=value.parts.find(p=>p.id===value.source)!,canonical=value.parts.find(p=>p.id===value.canonical)!
  const dependencies=Object.entries(value.dependencies).map(([name,rows])=>card(LABELS[name]??name,rows.length ? table(['Record','Retained facts'],rows.map((r:any)=>[
    readable(r.number??r.filename??r.id??r.part_id),
    readable(Object.entries(r).filter(([key])=>!['id','bytes','preview','snapshot','detail','record_json','payload_json','basis_json'].includes(key)).map(([key,v])=>`${key.replace(/_/g,' ')}: ${v??'—'}`).join(' · ')),
  ]),LABELS[name],{wrap:[0,1]}) : h`<p class="gk-muted">None.</p>`))
  return page(env,'Preview part merge',actor,h`${backLink(`/app/parts/${canonical.id}`,'Back to canonical part')}<h1>Merge ${source.number} into ${canonical.number}</h1><p class="gk-lede">${source.name} → ${canonical.name}</p>
    ${card('What approval changes',h`<p>${value.consequence}</p><p>${source.number} uses ${source.unit}; ${canonical.number} uses ${canonical.unit}. Old numbers will open ${canonical.number}; catalog packs and serial restrictions keep their original meaning. No movement, photo, receipt, BOM revision or audit entry is rewritten.</p>
      ${!value.compatibleUnits ? h`<p>These stocking units differ. Reconcile their units before merging.</p>` : value.conflicts.length ? h`<p>Current BOMs give these items conflicting serial compatibility. Reconcile those BOMs before approving the merge.</p>${value.conflicts.map(row=>h`<p><a href="/app/assets/${row.asset_id}">Open affected asset</a></p>`)}` : value.blockers.length ? h`<p>Complete or reject the open cycle counts before merging.</p>` : form('part.merge.approve',`/app/parts/${canonical.id}`,h`${hidden('source',source.id)}${hidden('canonical',canonical.id)}${hidden('fingerprint',value.fingerprint)}${field('Reason for approving this duplicate merge','reason')}`,'Approve canonical merge')}`)}
    ${dependencies}`,{url})
}
