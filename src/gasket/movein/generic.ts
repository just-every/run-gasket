import type { Bindings } from '../../auth.server'
import { applyD1ImportBatches, canonicalJson, createD1ImportJob, planD1Import, resumeD1Import, sha256, undoD1Import, type D1ImportContext, type Json, type SourceRecord } from '../../modules/import-kit/src/d1/index'
import { capabilitySql, requireCapability, type Actor } from '../actor'
import { all, commit, GasketError, insist, now, one, stmt, sha256Hex } from '../core'
import { Input } from '../input'
import { toMilli } from '../quantity'
import { codeList, matchCode } from '../codes'
import { columns } from './csv'
import { assetCustomMapping } from './maintainx-custom'
import { genericTargets } from './generic-target'
import { HEADERS, mapWorkRow, mappingObject, dateValue, type MappingContext, type SheetKind } from './generic-mapping'
import { readSpreadsheet } from './spreadsheet'
import { mapExtra } from './generic-extra'

const destination='generic-register',namespace='spreadsheet',mappingVersion='spreadsheet-1'
export const genericId=(kind:string,id:string)=>sha256(`gasket:spreadsheet:${kind}:${id}`)
export const genericContext=(env:Bindings,actor:Actor):D1ImportContext=>({destination,namespace,mappingVersion,storage:{database:env.DB as never,targets:genericTargets(actor.id)},authorization:{principalId:'role:import',predicate:()=>capabilitySql(actor.sessionId,'import.run')},batchSize:20,maxBatches:3})

async function build(env:Bindings,actor:Actor,input:Input){
  requireCapability(actor,'import.run')
  const dateFormat=input.text('dateFormat',{optional:true,max:3})||'MDY';insist(dateFormat==='MDY'||dateFormat==='DMY','invalid_dateFormat')
  const selected=input.text('entity',{max:12}) as SheetKind;insist(Object.hasOwn(HEADERS,selected),'invalid_entity')
  let file
  if(input.has('spreadsheet_b64')){
    const encoded=input.text('spreadsheet_b64',{max:14_000_000});insist(/^[A-Za-z0-9+/]*={0,2}$/.test(encoded),'invalid_base64')
    file={filename:input.text('spreadsheet_name',{max:200}),bytes:Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))}
  }else file=await input.file('spreadsheet',{maxBytes:10_000_000})
  insist(file,'missing_spreadsheet')
  const sheets=await readSpreadsheet(file.bytes,file.filename),hash=await sha256Hex(file.bytes)
  const encoded=btoa(Array.from(file.bytes,b=>String.fromCharCode(b)).join(''))
  const carry:Record<string,string>={entity:selected,dateFormat,spreadsheet_b64:encoded,spreadsheet_name:file.filename}
  const sourceMappings=Object.fromEntries(['assetMapping','userMapping','teamMapping'].map(key=>{
    const supplied=mappingObject(input.has(key)?input.json(key):undefined),sources=input.list(`${key}Source`,{keepEmpty:true}),targets=input.list(`${key}Target`,{keepEmpty:true})
    insist(sources.length===targets.length,'invalid_source_mapping')
    for(const [index,source]of sources.entries())if(targets[index])supplied[source]=targets[index];else delete supplied[source]
    return [key,supplied]
  }))
  for(const [key,value]of Object.entries(sourceMappings))carry[key]=JSON.stringify(value)
  const customMapping=mappingObject(input.has('customMapping')?input.json('customMapping'):undefined)
  const customColumns=input.list('customColumn',{keepEmpty:true}),customIds=input.list('customField',{keepEmpty:true})
  insist(customColumns.length===customIds.length&&new Set(customColumns).size===customColumns.length,'invalid_custom_mapping')
  customColumns.forEach((column,index)=>{customMapping[column]=customIds[index]})
  carry.customMapping=JSON.stringify(customMapping)
  const tables=await Promise.all(sheets.map(async sheet=>{
    const kind=(sheets.length===1?selected:sheet.name.toLowerCase()) as SheetKind
    insist(Object.hasOwn(HEADERS,kind),'Unknown worksheet: use assets, parts, locations, pms or work')
    const header=sheet.rows[0]??[],read=columns(header)
    insist(header.length===new Set(header.map(h=>h.trim().toLowerCase())).size&&!header.some(h=>!h.trim()),'Duplicate or empty column name')
    insist(read.has('Source ID'),`${kind}: Source ID column required`)
    const custom=kind==='work'||kind==='pms'?null:await assetCustomMapping(env,Input.of({customMapping}),header,kind==='parts'?'part':kind==='locations'?'location':'asset')
    return {...sheet,kind,custom}
  }))
  const records:SourceRecord[]=[],identities=new Set<string>()
  for(const table of tables.sort((a,b)=>['locations','assets','parts','pms','work'].indexOf(a.kind)-['locations','assets','parts','pms','work'].indexOf(b.kind)))for(const [index,row]of table.rows.slice(1).entries()){
    const cells=Object.fromEntries(table.rows[0].map((name,n)=>[name,row[n]??'']))
    const identity=`${table.kind}:${columns(Object.keys(cells)).get(Object.values(cells),'Source ID')||`no-id-${index+2}`}`,sourceId=identities.has(identity)?`${identity}:duplicate-${index+2}`:identity;identities.add(identity)
    records.push({namespace,kind:table.kind,sourceId,payload:cells,payloadHash:sha256(canonicalJson(cells)),artifactHash:hash,location:{artifact:file.filename,pointer:table.name,row:index+2}})
  }
  const context:MappingContext={actor,order:dateFormat,assets:await all(env,'SELECT id,tag,name FROM gk_assets WHERE retired_at IS NULL'),members:await all(env,`SELECT m.id,m.email,m.name FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.status='active' AND o.status='active' AND (m.role IN ('owner','lead','maintainer') OR o.role='owner')`),teams:await all(env,'SELECT id,name FROM gk_teams'),teamMembers:await all(env,'SELECT team_id,member_id FROM gk_team_members'),workFields:await all(env,'SELECT * FROM gk_work_fields WHERE retired_at IS NULL'),importedAssets:new Map(),...sourceMappings as any}
  const catalog=await codeList(env),existingParts=await all(env,'SELECT id,number FROM gk_parts'),seen=new Set<string>(),tags=new Set<string>(),numbers=new Set<string>()
  const rejected:{location:string;reason:string}[]=[],accepted:{sourceId:string;kind:string;targetId:string;native:Record<string,Json>;customValues:Record<string,Json>}[]=[]
  const attention:{location:string;reason:string}[]=[]
  const extra=new Map<string,{native:Record<string,Json>;customValues:Record<string,Json>}|GasketError>()
  for(const source of records)if(source.kind==='locations'||source.kind==='pms'){
    const cells={...source.payload as Record<string,string>}
    if(source.kind==='pms'&&cells['First due'])cells['First due']=dateValue(cells['First due'],dateFormat,actor.zone)?.slice(0,10)??cells['First due']
    try{extra.set(source.sourceId,await mapExtra(env,actor,source.kind,cells,sourceMappings.assetMapping,sourceMappings.userMapping,sourceMappings.teamMapping,customMapping))}catch(error){if(!(error instanceof GasketError))throw error;extra.set(source.sourceId,error)}
  }
  const plan=await planD1Import({artifacts:[{name:file.filename,sha256:hash,size:file.bytes.length,original:{status:'available',base64:encoded}}],records,diagnostics:[]},{version:mappingVersion,map(source){
    const cells=source.payload as Record<string,string>,table=tables.find(t=>t.name===source.location.pointer)!,read=columns(Object.keys(cells)),get=(key:string)=>read.get(Object.values(cells),key),sourceId=get('Source ID')
    try{
      insist(sourceId&&sourceId.length<=160,'A unique Source ID is required')
      const key=`${source.kind}:${sourceId}`;insist(!seen.has(key),'Duplicate Source ID');seen.add(key)
      let kind:string=source.kind,native:Record<string,Json>,customValues:Record<string,Json>={}
      if(kind==='locations'||kind==='pms'){const result=extra.get(source.sourceId)!;if(result instanceof GasketError)throw result;({native,customValues}=result)}
      else if(kind==='work')({kind,native,customValues}=mapWorkRow(cells,context))
      else if(kind==='assets'){
        const tag=get('Tag')||sourceId,name=get('Name'),location=get('Location'),id=genericId(kind,sourceId)
        insist(name&&name.length<=160&&location&&location.length<=160&&tag.length<=80,'Name, tag and location are required within register bounds')
        insist(!tags.has(tag.toLowerCase())&&!context.assets.some(a=>a.tag.toLowerCase()===tag.toLowerCase()&&a.id!==id),'Asset tag already used');tags.add(tag.toLowerCase())
        const criticality=matchCode(catalog,'criticality',get('Criticality')||'normal');insist(criticality,'Unknown criticality')
        const category=get('Category')||null;customValues=table.custom!.values(cells,category)
        native={tag,name,serial:get('Serial')||null,location,custodian:null,category,criticality:criticality.key,notes:get('Notes')||null}
        context.importedAssets.set(sourceId,id)
      }else{
        const number=get('Number')||sourceId,name=get('Name'),unit=get('Unit'),id=genericId(kind,sourceId),category=get('Category')||null
        insist(name&&name.length<=160&&number.length<=80&&unit&&unit.length<=20,'Name, number and explicit unit are required')
        insist(!numbers.has(number.toLowerCase())&&!existingParts.some(p=>p.number.toLowerCase()===number.toLowerCase()&&p.id!==id),'Part number already used');numbers.add(number.toLowerCase())
        customValues=table.custom!.values(cells,category)
        native={number,name,unit,category,minimumMilli:toMilli(get('Minimum')||'0','minimum',{allowZero:true}),location:get('Location')||null,openingMilli:toMilli(get('Quantity')||'0','quantity',{allowZero:true})}
      }
      const targetId=genericId(kind,sourceId);accepted.push({sourceId,kind,targetId,native,customValues})
      if(kind==='history'&&get('Assignee')&&!context.members.some(m=>[m.id,m.name,m.email].includes(get('Assignee'))))attention.push({location:`${table.name} row ${source.location.row}`,reason:'Historical assignee retained as source text; no account or notification is created.'})
      return {effects:[{targetKind:kind,targetId,value:{native,customValues,sourceId,source:cells}}]}
    }catch(error){if(!(error instanceof GasketError))throw error;rejected.push({location:`${table.name} row ${source.location.row}`,reason:error.code});return {effects:[],rejection:error.code}}
  }},genericContext(env,actor))
  return {plan,preview:{fingerprint:plan.fingerprint,counts:plan.counts,accepted,rejected,attention,carry,mappings:{assets:context.assets,users:context.members,teams:context.teams,sources:{assets:[...new Set(records.filter(r=>(r.kind==='work'||r.kind==='pms')).map(r=>(r.payload as any)['Asset ID']).filter(Boolean))],users:[...new Set(records.filter(r=>(r.kind==='work'||r.kind==='pms')).map(r=>(r.payload as any).Assignee).filter(Boolean))],teams:[...new Set(records.filter(r=>(r.kind==='work'||r.kind==='pms')).map(r=>(r.payload as any).Team).filter(Boolean))]}},customMapping:tables.flatMap(t=>t.custom?[{entity:t.kind,...t.custom.preview}]:[]),gaps:['Locations require an existing authenticated portal. PMs use existing assets and checklists; import register records first. Historical consumption is retained as source text and never executes stock movements. Units are retained explicitly, with no inferred conversion.']}}
}
export async function previewGeneric(env:Bindings,actor:Actor,input:Input){return (await build(env,actor,input)).preview}
export async function applyGeneric(env:Bindings,actor:Actor,input:Input){
  const {plan,preview}=await build(env,actor,input),reviewed=input.text('fingerprint',{max:100});insist(reviewed===plan.fingerprint,'reviewed_fingerprint_changed',409)
  const undone=(await one(env,"SELECT COUNT(*) AS n FROM ik_jobs WHERE destination=? AND fingerprint=? AND state IN ('undone','rolled_back')",destination,reviewed))!.n
  const context={...genericContext(env,actor),reviewedFingerprint:reviewed,...undone?{operationKey:`${reviewed}:${undone}`}:{}}
  const job=await createD1ImportJob(plan,context)
  await commit(env,[stmt(env,'INSERT OR IGNORE INTO gk_import_quality(job_id,reviewed_json,recorded_at) VALUES(?,?,?)',job.id,JSON.stringify({fingerprint:reviewed,filename:preview.carry.spreadsheet_name,entity:preview.carry.entity,rejected:preview.rejected,attention:preview.attention,gaps:preview.gaps}),now())],[])
  const result=await applyD1ImportBatches(job.id,context)
  if(!await one(env,"SELECT 1 FROM gk_audit WHERE action='import.apply' AND subject=?",job.id))await commit(env,[],{actor:actor.id,action:'import.apply',subject:job.id,detail:{kit:'spreadsheet',fingerprint:reviewed,counts:plan.counts}})
  return {job:job.id,state:result.state}
}
export async function genericAction(env:Bindings,actor:Actor,input:Input){
  requireCapability(actor,'import.run');const id=input.text('job',{max:100}),action=input.text('action',{max:10}),context=genericContext(env,actor)
  insist(action==='resume'||action==='undo','invalid_action')
  const result=action==='resume'?await resumeD1Import(id,context):await undoD1Import(id,context)
  return {job:id,state:result.state}
}
export async function genericJobs(env:Bindings,actor:Actor){requireCapability(actor,'import.run');return {jobs:await all(env,"SELECT j.id,j.state,j.checkpoint,j.total,j.error,json_extract(q.reviewed_json,'$.filename') AS filename,json_extract(q.reviewed_json,'$.entity') AS entity FROM ik_jobs j JOIN gk_import_quality q ON q.job_id=j.id WHERE j.destination=? AND j.namespace=? ORDER BY q.recorded_at DESC,j.rowid DESC",destination,namespace)}}
export async function genericReconciliation(env:Bindings,actor:Actor,id:string,url:URL){
  requireCapability(actor,'import.run');insist(await one(env,'SELECT 1 FROM ik_jobs WHERE id=? AND destination=? AND namespace=?',id,destination,namespace),'import_job_not_found',404)
  const after=Number(url.searchParams.get('after')??0);insist(Number.isSafeInteger(after)&&after>=0,'invalid_after')
  const rows=await all(env,'SELECT ordinal,target_kind,target_id FROM ik_provenance WHERE job_id=? AND reversed=0 AND ordinal>=? ORDER BY ordinal,effect_ordinal LIMIT 100',id,after)
  const targets=genericTargets(actor.id),values=[]
  for(const row of rows){const current=await targets.read(env.DB as never,destination,row.target_kind,row.target_id);values.push({ordinal:row.ordinal,targetId:row.target_id,kind:row.target_kind,value:current?.value??null})}
  return {rows:values,next:rows.length===100?rows.at(-1)!.ordinal+1:null}
}
