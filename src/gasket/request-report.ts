// Request measures use the existing triage permission and retained source events.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, insist, now, one, sha256Hex } from './core'
import { cell } from './audit'
import { addDays, isDate, today } from './dates'
import { triager } from './requests'

export const REQUEST_POLICY = 'Submission cohort uses inclusive site-local dates. Acknowledgment is the first assess, ask-details, approval, decline or duplicate decision on that request. Resolution is independent approval closing linked corrective work; decline is a separate outcome. Means divide elapsed milliseconds by measured requests, never by all requests. All-request denominators retain untriaged, unanswered, declined and unresolved reports. Repeat faults are explicit duplicate links, not inferred similarity. Requester groups are signed-in intake or public unverified intake, never inferred from contact details. Abandonment is an explicit reasoned lead decision retaining the report; unanswered needs-details reports remain visible and are never inferred abandoned. Erased request timelines and requester identity are unavailable, never reconstructed; erased rows have their own requester group and are not inferred rejections. Current installation site only.'
const decisions = new Set(['assess','ask_details','approve','decline','abandon','duplicate'])
export async function requestReport(env: Bindings, actor: Actor, url: URL) {
  triager(actor)
  const from=url.searchParams.get('from') || addDays(actor.today,-29),to=url.searchParams.get('to') || actor.today
  insist(isDate(from)&&isDate(to)&&from<=to,'invalid_date_range')
  const site=(await one(env,'SELECT name FROM gk_site WHERE singleton=1'))?.name ?? 'Current site'
  const filters={from,to,site:url.searchParams.get('site')||'',asset:url.searchParams.get('asset')||'',group:url.searchParams.get('group')||'',status:url.searchParams.get('status')||''}
  insist(!filters.group || ['signed-in','public','erased'].includes(filters.group),'invalid_request_group')
  // No list cap: every retained request in the cohort contributes once.
  const sources=await all(env,`SELECT r.id,r.number,r.asset_id,r.target_id,r.requester_id,r.created_at,r.status,r.duplicate_of,r.work_order_id,r.erased_at,
    t.name AS target,a.tag AS asset_tag,w.status AS work_status,w.closed_at,w.number AS work_number
    FROM gk_requests r JOIN gk_request_targets t ON t.id=r.target_id LEFT JOIN gk_assets a ON a.id=r.asset_id
    LEFT JOIN gk_work_orders w ON w.id=r.work_order_id ORDER BY r.created_at,r.number`)
  const events=await all(env,'SELECT request_id,seq,kind,text,at FROM gk_request_events ORDER BY seq')
  const rows=sources.filter(r=>{const day=today(actor.zone,r.created_at),group=r.erased_at?'erased':r.requester_id?'signed-in':'public';return day>=from&&day<=to&&(!filters.site||filters.site===site)&&(!filters.asset||r.asset_id===filters.asset)&&(!filters.group||group===filters.group)&&(!filters.status||r.status===filters.status)}).map(r=>{
    const timeline=events.filter(e=>e.request_id===r.id),ack=timeline.find(e=>decisions.has(e.kind))
    const converted=timeline.find(e=>e.kind==='work_created'),approval=timeline.find(e=>e.kind==='approve'),decline=timeline.find(e=>e.kind==='decline')
    const abandonment=timeline.find(e=>e.kind==='abandon')
    const resolvedAt=r.work_status==='closed'?r.closed_at:null
    return {id:r.id,number:r.number,site,asset:r.asset_id,assetTag:r.asset_tag,target:r.target,group:r.erased_at?'erased':r.requester_id?'signed-in':'public',status:r.status,createdAt:r.created_at,
      acknowledgedAt:ack?.at??null,acknowledgmentMs:ack?Math.max(0,ack.at-r.created_at):null,resolvedAt,resolutionMs:resolvedAt===null?null:Math.max(0,resolvedAt-r.created_at),
      duplicateOf:r.duplicate_of,work:r.work_order_id,workNumber:r.work_number,convertedAt:converted?.at??null,conversionReason:approval?.text??null,rejectionReason:decline?.text??null,abandonmentReason:abandonment?.text??null,
      erased:!!r.erased_at,sourceDoor:`/api/gasket/requests/${r.id}`,recordDoor:`/app/requests/${r.id}`,
      timeline:timeline.map(e=>({sequence:e.seq,kind:e.kind,at:e.at})),
    }
  })
  const summarize=(selected:typeof rows)=>{
    const duration=(key:'acknowledgmentMs'|'resolutionMs')=>{const known=selected.filter(r=>r[key]!==null),totalMs=known.reduce((sum,r)=>sum+r[key]!,0);return {totalMs,measured:known.length,all:selected.length,missing:selected.length-known.length,meanMs:known.length?totalMs/known.length:null}}
    return {total:selected.length,untriaged:selected.filter(r=>!r.acknowledgedAt).length,abandoned:selected.filter(r=>r.status==='abandoned').length,awaitingDetails:selected.filter(r=>r.status==='needs_details').length,
      unresolved:selected.filter(r=>r.resolvedAt===null).length,duplicates:selected.filter(r=>r.duplicateOf).length,converted:selected.filter(r=>r.convertedAt!==null).length,declined:selected.filter(r=>r.status==='declined'&&!r.erased).length,
      acknowledgment:duration('acknowledgmentMs'),resolution:duration('resolutionMs')}
  }
  const groups=(key:'site'|'asset'|'group')=>[...new Set(rows.map(r=>r[key]))].map(value=>({value,summary:summarize(rows.filter(r=>r[key]===value))}))
  const audit=await one(env,'SELECT COALESCE(MAX(seq),0) AS revision,MAX(at) AS latestAt FROM gk_audit')
  return {version:1,computedAt:now(),site,filters,rows,summary:summarize(rows),bySite:groups('site'),byAsset:groups('asset'),byRequesterGroup:groups('group'),
    assets:await all(env,'SELECT id,tag FROM gk_assets ORDER BY tag'),sourceRevision:audit.revision,latestChangeAt:audit.latestAt,
    inputFingerprint:await sha256Hex(JSON.stringify({filters,rows})),policy:REQUEST_POLICY,
    coverage:{retained:rows.length,erased:rows.filter(r=>r.erased).length,abandonment:'Only explicit abandoned decisions are classified abandoned; unanswered and untriaged reports remain in all-request denominators.'}}
}
export async function requestReportCsv(env:Bindings,actor:Actor,url:URL) {
  const r=await requestReport(env,actor,url)
  const columns=['id','number','site','asset','target','group','status','createdAt','acknowledgedAt','acknowledgmentMs','resolvedAt','resolutionMs','duplicateOf','work','convertedAt','conversionReason','rejectionReason','abandonmentReason','erased','sourceDoor','recordDoor'] as const
  return [columns,...r.rows.map(row=>columns.map(key=>row[key]))].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
}
