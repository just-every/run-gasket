import type { Bindings } from '../auth.server'
import { can, capabilitySql, type Actor } from './actor'
import { all, commit, GasketError, guard, insist, newId, now, one, stmt, type Row } from './core'
import { addDays, isDate, localNow, today, zonedInstant } from './dates'
import type { Input } from './input'
import { localDevelopment, operatorMail } from '../mail.server.mjs'
import { REPORTS, reportPack, packCsv, packPdf, type ReportKind } from './report-packs'

async function author(env:Bindings,actor:Actor,row?:Row|null){
  insist(!actor.service&&can(actor,'board.read')&&can(actor,'history.export')&&(actor.role==='owner'||row?.editor_id===actor.id),'forbidden',403)
  if(actor.role!=='owner')insist((await member(env,row!.owner_id,row!.zone))?.role==='owner','forbidden',403)
}
async function member(env:Bindings,id:string,zone:string):Promise<Actor|null>{
  const r=await one(env,`SELECT m.*,o.status AS operator_status,o.role AS operator_role FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=?`,id)
  if(!r||r.status!=='active'||r.operator_status!=='active'||(r.role==='owner'&&r.operator_role!=='owner'))return null
  const actor:Actor={id:r.id,name:r.name,email:r.email,role:r.role,sessionId:'',zone,today:today(zone,now())}
  return can(actor,'board.read')&&can(actor,'history.export')?actor:null
}
export async function saveReportSchedule(env:Bindings,actor:Actor,input:Input){
  const id=input.text('schedule',{optional:true,max:100})||newId(),old=await one(env,'SELECT * FROM gk_report_schedules WHERE id=?',id)
  await author(env,actor,old);insist(input.flag('consent'),'report_consent_required')
  const delegated=actor.role!=='owner',editor=delegated?old!.editor_id:input.text('editor',{optional:true,max:100})||null
  if(editor)insist(await member(env,editor,actor.zone),'editor_forbidden',403)
  const paused=delegated||input.flag('paused')
  const revision=input.integer('revision',{min:0})!,name=input.text('name',{max:100}),report=input.text('report',{max:30}) as ReportKind
  const weekday=input.integer('weekday',{min:0,max:6})!,clock=input.text('clock',{max:5}),firstDay=input.text('firstDay',{max:10})
  insist(Object.hasOwn(REPORTS,report),'invalid_report');insist(/^([01]\d|2[0-3]):[0-5]\d$/.test(clock),'invalid_clock')
  insist(isDate(firstDay)&&firstDay>=actor.today&&new Date(firstDay+'T12:00:00Z').getUTCDay()===weekday,'invalid_firstDay')
  const recipients=[...new Set(input.list('recipients'))];insist(recipients.length>0&&recipients.length<=20,'invalid_recipients')
  for(const recipient of recipients)insist(await member(env,recipient,actor.zone),'recipient_forbidden',403)
  const filters:Record<string,string>={};const team=input.text('team',{optional:true,max:100}),asset=input.text('asset',{optional:true,max:100})
  insist(!(team&&report!=='performance')&&!(asset&&['performance','valuation'].includes(report)),'invalid_report_filter')
  if(team)filters.team=team;if(asset)filters.asset=asset
  await reportPack(env,actor,report,filters,firstDay)
  insist(old || revision===0,'stale',409)
  const admission=capabilitySql(actor.sessionId,delegated?'history.export':'site.manage')
  const values=[name,report,JSON.stringify(filters),JSON.stringify(recipients),weekday,clock,actor.zone,firstDay,paused?1:0]
  await commit(env,[guard(env,'forbidden',admission.sql,...admission.params),guard(env,'stale',old?'EXISTS(SELECT 1 FROM gk_report_schedules WHERE id=? AND revision=? AND (?=0 OR editor_id=?))':'NOT EXISTS(SELECT 1 FROM gk_report_schedules WHERE id=?)',...old?[id,revision,delegated?1:0,actor.id]:[id]),
    ...(old?[stmt(env,'UPDATE gk_report_schedules SET name=?,report=?,filters_json=?,recipients_json=?,weekday=?,clock=?,zone=?,next_day=?,paused=?,revision=revision+1,owner_id=?,editor_id=? WHERE id=?',...values,delegated?old!.owner_id:actor.id,editor,id)]:[stmt(env,'INSERT INTO gk_report_schedules(name,report,filters_json,recipients_json,weekday,clock,zone,next_day,paused,owner_id,editor_id,id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',...values,actor.id,editor,id,now())])],
    {actor:actor.id,action:'report.schedule',subject:id,detail:{revision:old?revision+1:1,consent:true,name,report,filters,recipients,weekday,clock,zone:actor.zone,firstDay,paused,editor,delegated,authorization:delegated?'Owner review required':'Owner authorized'}})
  return {id,revision:old?revision+1:1}
}
export async function reportSchedules(env:Bindings,actor:Actor){
  insist(!actor.service&&can(actor,'board.read')&&can(actor,'history.export'),'forbidden',403)
  let schedules=await all(env,'SELECT * FROM gk_report_schedules WHERE ?=1 OR editor_id=? ORDER BY created_at,id',actor.role==='owner'?1:0,actor.id)
  if(actor.role!=='owner'){const live=[];for(const row of schedules)if((await member(env,row.owner_id,row.zone))?.role==='owner')live.push(row);schedules=live}
  insist(actor.role==='owner'||schedules.length>0,'forbidden',403)
  return {schedules,deliveries:(await all(env,'SELECT d.*,m.name AS recipient FROM gk_report_deliveries d JOIN gk_report_schedules s ON s.id=d.schedule_id LEFT JOIN gk_members m ON m.id=d.recipient_id WHERE ?=1 OR s.editor_id=? ORDER BY d.claimed_at DESC,d.id',actor.role==='owner'?1:0,actor.id)).filter(d=>schedules.some(s=>s.id===d.schedule_id)),
    recipients:await all(env,"SELECT m.id,m.name FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.status='active' AND o.status='active' AND m.role IN ('owner','lead','supervisor') ORDER BY m.name")}
}
export async function previewReportPack(env:Bindings,actor:Actor,id:string){
  const row=await one(env,'SELECT * FROM gk_report_schedules WHERE id=?',id);await author(env,actor,row);insist(row,'report_schedule_not_found',404)
  return reportPack(env,actor,row.report,JSON.parse(row.filters_json),row.next_day)
}
async function result(env:Bindings,id:string,state:string,error:string|null,extra:{provider?:string|null;providerMessageId?:string|null;fingerprint?:string;scope?:unknown}={}){
  await commit(env,[stmt(env,'UPDATE gk_report_deliveries SET state=?,error=?,finished_at=?,provider=?,provider_message_id=?,fingerprint=?,scope_json=? WHERE id=?',state,error,now(),extra.provider??null,extra.providerMessageId??null,extra.fingerprint??null,JSON.stringify(extra.scope??null),id)],{actor:'scheduler',action:'report.result',subject:id,detail:{state,error,...extra}})
}
async function deliver(env:Bindings,row:Row,occasion:string,recipient:string){
  const id=newId()
  try{await commit(env,[guard(env,'stale','EXISTS(SELECT 1 FROM gk_report_schedules WHERE id=? AND revision=? AND paused=0) AND NOT EXISTS(SELECT 1 FROM gk_report_deliveries WHERE schedule_id=? AND occasion=? AND recipient_id=?)',row.id,row.revision,row.id,occasion,recipient),stmt(env,"INSERT INTO gk_report_deliveries(id,schedule_id,revision,occasion,recipient_id,state,claimed_at) VALUES (?,?,?,?,?,'unconfirmed',?)",id,row.id,row.revision,occasion,recipient,now())],{actor:'scheduler',action:'report.claim',subject:id,detail:{schedule:row.id,revision:row.revision,occasion,recipient}})}catch(e){if(e instanceof GasketError&&e.code==='stale')return;throw e}
  try{
    const creator=await member(env,row.owner_id,row.zone),actor=await member(env,recipient,row.zone)
    if(!creator||creator.role!=='owner'||!actor){await result(env,id,'excluded','access_ended');return}
    const pack=await reportPack(env,actor,row.report,JSON.parse(row.filters_json),occasion),csv=new TextEncoder().encode(packCsv(pack)),pdf=await packPdf(pack)
    insist(csv.length+pdf.length<=5_000_000,'report_pack_too_large',422)
    // Rendering can yield: recheck both principals and the saved revision immediately before submission.
    const current=await one(env,'SELECT * FROM gk_report_schedules WHERE id=?',row.id),senderNow=await member(env,row.owner_id,row.zone),recipientNow=await member(env,recipient,row.zone)
    if(!senderNow||senderNow.role!=='owner'||!recipientNow||recipientNow.role!==actor.role||recipientNow.email!==actor.email||current.paused||current.revision!==row.revision){await result(env,id,'excluded','authority_changed');return}
    const sender=operatorMail(env),from=env.MAIL_FROM||(localDevelopment(env)?'Gasket <local@example.test>':'')
    if(!sender||!from){await result(env,id,'failed','mail_not_configured');return}
    const text=`${row.name}\nPeriod ${pack.metadata.period.from} to ${pack.metadata.period.to}; ${row.zone}.\nGenerated ${new Date(now()).toISOString()}. Permission: ${actor.role}, current site.\nDefinitions and freshness are included in both attachments. Dashboard: ${env.AUTH_ORIGIN}${pack.metadata.dashboard}`
    let sent
    try{const message={deliveryId:id,from,to:[actor.email],subject:`Gasket report: ${row.name}`,text,html:`<pre>${text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}</pre>`,headers:{},attachments:[{filename:'report.pdf',contentType:['application','pdf'].join('/'),content:pdf},{filename:'dataset.csv',contentType:['text','csv'].join('/'),content:csv}]};sent=await sender.send(message)}
    catch{await result(env,id,'uncertain','mail_submission_unconfirmed');return}
    await result(env,id,sent.status,sent.code??null,{provider:sent.provider,providerMessageId:sent.providerMessageId,fingerprint:pack.fingerprint,scope:pack.metadata.scope})
  }catch(e){await result(env,id,'failed',e instanceof GasketError?e.code:'report_generation_failed')}
}
// Repeated wall times use the later occurrence; a missing wall time uses the first valid minute after the gap.
function deliveryInstant(zone:string,local:string){
  const base=zonedInstant(zone,local),exact=[-7200000,-3600000,0,3600000,7200000].map(offset=>base+offset).filter(at=>localNow(zone,at)===local)
  if(exact.length)return Math.max(...exact)
  let candidate=base
  for(let minute=0;minute<180&&localNow(zone,candidate)<local;minute++)candidate+=60000
  for(let minute=0;minute<180&&localNow(zone,candidate-60000)>=local;minute++)candidate-=60000
  return candidate
}
export async function runReportSchedules(env:Bindings){
  const rows=await all(env,'SELECT * FROM gk_report_schedules WHERE paused=0 ORDER BY id')
  for(const row of rows){
    const day=today(row.zone,now());if(row.next_day>day||deliveryInstant(row.zone,`${row.next_day}T${row.clock}`)>now())continue
    // Recover one oldest outstanding weekly occurrence per tick. Claims survive process restarts.
    for(const recipient of JSON.parse(row.recipients_json))await deliver(env,row,row.next_day,recipient)
    await env.DB.batch([stmt(env,'UPDATE gk_report_schedules SET next_day=? WHERE id=? AND revision=? AND next_day=?',addDays(row.next_day,7),row.id,row.revision,row.next_day)])
  }
}
