// Scheduled packs reuse report read models; no evidence files or labor-rate sources are loaded.
import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { insist, now, one, sha256Hex } from './core'
import { addDays } from './dates'
import { performance } from './performance'
import { reliability } from './reliability'
import { availability } from './availability'
import { badActors } from './bad-actors'
import { metrics } from './metrics'
import { historyReport } from './history-report'
import { reconciliation } from './valuation'
import { currentMetricDefinitions } from './metric-definitions'
import { cell } from './audit'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fontData from '../../public/fonts/inter/inter-report.ttf?inline'

export const REPORTS = { performance, reliability, availability, 'bad-actors': badActors, history: historyReport, valuation: reconciliation }
export type ReportKind = keyof typeof REPORTS
export async function reportPack(env: Bindings, actor: Actor, kind: ReportKind, filters: Record<string,string>, end = actor.today) {
  insist(Object.hasOwn(REPORTS, kind), 'invalid_report')
  insist(can(actor,'board.read') && can(actor,'history.export') && !actor.service, 'forbidden',403)
  const url = new URL(`https://gasket.invalid/api/gasket/${kind}`)
  for(const [key,value] of Object.entries(filters)) url.searchParams.set(key,value)
  url.searchParams.set('from',addDays(end,-7));url.searchParams.set('to',addDays(end,-1))
  const data = await REPORTS[kind](env,actor,url)
  const audit = await one(env,'SELECT COALESCE(MAX(seq),0) AS revision,MAX(at) AS latestAt FROM gk_audit')
  const definitions = currentMetricDefinitions().filter(d=>kind==='history'?d.id==='history.events':d.sourceDoor===url.pathname)
  const metadata = { report:kind, period:{from:url.searchParams.get('from'),to:url.searchParams.get('to')}, generatedAt:now(), zone:actor.zone,
    scope:{site:(await one(env,'SELECT name FROM gk_site WHERE singleton=1')).name,filters,role:actor.role,recipient:actor.id,policy:'Current report access only. No original files or individual labor rates.'},
    sourceRevision:audit.revision,latestChangeAt:audit.latestAt,freshness:'Recomputed from retained records at dispatch; external source completeness is not implied.',definitions,
    dashboard:kind==='history'?`/app/assets/${filters.asset}${url.search}`:`/app/${kind}${url.search}`,sourceDoor:url.pathname+url.search }
  const quality=await metrics(env,actor,url)
  const sourceQuality={scope:'Site-wide data quality context; independent of the selected report filter.',quality:quality.quality,policy:quality.policy}
  const fingerprint=await sha256Hex(JSON.stringify({data,filters,zone:actor.zone,definitions,sourceQuality,sourceRevision:audit.revision}))
  return {metadata,fingerprint,data,sourceQuality}
}

// Typed leaf paths preserve every scalar, null and empty container without truncating the dataset.
export function packRows(value: unknown, path = '$'): [string,string,string][] {
  if(value===null) return [[path,'null','']]
  if(typeof value!=='object') return [[path,typeof value,String(value)]]
  const entries=Object.entries(value as object)
  if(!entries.length) return [[path,Array.isArray(value)?'array':'object','']]
  return entries.flatMap(([key,item])=>packRows(item,`${path}[${JSON.stringify(key)}]`))
}
export function packCsv(pack: unknown) {
  return [['path','type','value'],...packRows(pack)].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
}
export async function packPdf(pack: Awaited<ReturnType<typeof reportPack>>) {
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit)
  const font=await pdf.embedFont(Uint8Array.from(atob(fontData.slice(fontData.indexOf(',')+1)),c=>c.charCodeAt(0)),{subset:true})
  const glyphs=new Set(font.getCharacterSet())
  let page=pdf.addPage([595,842]),y=795
  const line=(source:string,size=11)=>{
    insist([...source].every(c=>c==='\n'||c==='\t'||glyphs.has(c.codePointAt(0)!)),'pdf_character_not_supported',422)
    for(const paragraph of source.split('\n')) {
      let text=''
      const draw=()=>{if(y<48){page=pdf.addPage([595,842]);y=795}page.drawText(text,{x:42,y,font,size,color:rgb(.12,.13,.15)});y-=size+5;text=''}
      for(const c of paragraph.replace(/\t/g,'    ')){if(text&&font.widthOfTextAtSize(text+c,size)>505)draw();text+=c}draw()
    }
  }
  pdf.setLanguage('en-US');pdf.setTitle(`Gasket ${pack.metadata.report} report`)
  line(`Gasket ${pack.metadata.report} report`,17)
  line(`Period: ${pack.metadata.period.from} to ${pack.metadata.period.to}`)
  line(`Site clock: ${pack.metadata.zone}`)
  line(`Dashboard: ${pack.metadata.dashboard}`)
  line(`Generated: ${new Date(pack.metadata.generatedAt).toISOString()}`)
  line(`Permission: ${pack.metadata.scope.role}; ${pack.metadata.scope.policy}`)
  line('Complete report values and versioned definitions follow. Null means unknown or not applicable.')
  for(const [path,type,value] of packRows(pack)) line(`${path}: ${type==='null'?'unknown':value||`empty ${type}`}`)
  const bytes=await pdf.save();insist(bytes.length<=5_000_000,'report_pack_too_large',422);return bytes
}
