import type { Json } from '../../modules/import-kit/src/d1/index'
import { GasketError, insist, type Row } from '../core'
import { isDate, localNow, zonedInstant } from '../dates'
import type { Actor } from '../actor'
import { columns } from './csv'
import { parseEnteredOn, type DateOrder } from './maintainx'
import { cents } from './maintainx-work'
import { HEADERS_EXTRA } from './generic-extra'

export const HEADERS = {
  assets:['Source ID','Tag','Name','Location','Category','Criticality','Serial','Notes'],
  parts:['Source ID','Number','Name','Unit','Quantity','Minimum','Location','Category'],
  work:['Source ID','Status','Asset ID','Location','Title','Description','Work type','Created on','Due date','Completed on','Completed by','Assignee','Team','Priority','Estimate hours','Parts cost USD','Labor cost USD','Other cost USD','Historical consumption'],
  ...HEADERS_EXTRA,
} as const
export type SheetKind = keyof typeof HEADERS
export interface MappingContext {
  actor:Actor;order:DateOrder;assets:Row[];members:Row[];teams:Row[];teamMembers:Row[];workFields:Row[]
  importedAssets:Map<string,string>;assetMapping:Record<string,string>;userMapping:Record<string,string>;teamMapping:Record<string,string>
}
export function dateValue(text:string,order:DateOrder,zone='UTC') {
  if(/[T ]\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/.test(text)){
    const instant=Date.parse(text)
    return isDate(text.slice(0,10))&&Number.isFinite(instant)?localNow(zone,instant):null
  }
  return isDate(text)?`${text}T00:00`:parseEnteredOn(text,order)
}
function reference(text:string,rows:Row[],keys:string[],explicit:Record<string,string>,label:string):Row|null {
  if(!text)return null
  const mapped=explicit[text]
  const matches=rows.filter(r=>mapped?r.id===mapped:keys.some(k=>String(r[k]??'').toLowerCase()===text.toLowerCase()))
  insist(matches.length===1,`Unknown or ambiguous ${label}: ${text}`)
  return matches[0]
}
export function mapWorkRow(cells:Record<string,string>,context:MappingContext):{kind:'open'|'history';native:Record<string,Json>;customValues:Record<string,Json>} {
  const header=Object.keys(cells),read=columns(header),values=Object.values(cells),get=(key:string)=>read.get(values,key)
  const {actor,order}=context,history=/^(completed|closed|done)$/i.test(get('Status'))
  insist(history||/^(open|in_progress)$/i.test(get('Status')),'Status must be open, in_progress or completed')
  const title=get('Title');insist(title&&title.length<=160,'A title of at most 160 characters is required')
  const referenceId=get('Asset ID'),mapped=context.assetMapping[referenceId]??context.importedAssets.get(referenceId)
  if(mapped)insist(context.assets.some(a=>a.id===mapped)||[...context.importedAssets.values()].includes(mapped),'Mapped asset is unavailable')
  const asset=mapped?{id:mapped}:reference(referenceId,context.assets,['id','tag'],{},'asset')
  const location=get('Location')||null
  insist(Boolean(asset)!==Boolean(location),'Choose one asset or location')
  if(history)insist(asset,'Historical work requires an asset')
  const type=get('Work type').toLowerCase()||'corrective'
  insist(['corrective','preventive',...(history?['other']:[])].includes(type),'Invalid work type')
  const fields:Record<string,Json>={}
  for(const field of context.workFields){
    const value=get(`Custom: ${field.label}`)||get(field.label)
    insist(!field.required||value,`Required work field: ${field.label}`)
    if(!value)continue
    insist(value.length<=500,`Work field too long: ${field.label}`)
    if(field.kind==='number')insist(/^-?\d{1,12}(\.\d{1,6})?$/.test(value),`Invalid number: ${field.label}`)
    if(field.kind==='choice')insist(JSON.parse(field.options).includes(value),`Invalid choice: ${field.label}`)
    fields[field.id]=value
  }
  if(history){
    const completed=dateValue(get('Completed on'),order,actor.zone)
    insist(completed&&completed<=localNow(actor.zone),'A valid nonfuture completion is required')
    const costs:Record<string,Json>={}
    for(const [key,column]of [['partsCents','Parts cost USD'],['laborCents','Labor cost USD'],['otherCents','Other cost USD']]){const amount=cents(get(column));insist(amount!==undefined,`Invalid USD amount: ${column}`);costs[key]=amount}
    return {kind:'history',customValues:{},native:{asset:asset!.id,sourceRef:get('Source ID'),title,kind:type,description:get('Description')||null,completedOn:completed,completedBy:get('Completed by')||null,assignedTo:get('Assignee')||null,categories:null,recurrence:null,failureMode:null,...costs,sourceSystem:'Spreadsheet',details:{customValues:fields,team:get('Team')||null,consumption:get('Historical consumption')||null}}}
  }
  const assignee=reference(get('Assignee'),context.members,['id','email','name'],context.userMapping,'assignee')
  const team=reference(get('Team'),context.teams,['id','name'],context.teamMapping,'team')
  if(assignee&&team)insist(context.teamMembers.some(r=>r.team_id===team.id&&r.member_id===assignee.id),'Assignee does not belong to the selected team')
  const due=dateValue(get('Due date'),order,actor.zone),created=dateValue(get('Created on'),order,actor.zone)
  insist(due,'A valid due date is required');insist(created&&created<=localNow(actor.zone),'A valid nonfuture creation time is required')
  const priority=get('Priority')||'normal';insist(['emergency','high','normal','low'].includes(priority),'Invalid priority')
  const hours=get('Estimate hours');insist(!hours||/^\d+(\.\d{1,2})?$/.test(hours),'Invalid estimated hours')
  const minutes=hours?Math.round(Number(hours)*60):null;insist(minutes===null||(minutes>=1&&minutes<=60000),'Estimated hours out of range')
  insist(!get('Historical consumption'),'Consumption belongs on a completed history row; importing open work never issues stock')
  return {kind:'open',customValues:fields,native:{asset_id:asset?.id??null,location,title,description:get('Description')||null,kind:type,due_date:due.slice(0,10),assignee_id:assignee?.id??null,team_id:team?.id??null,priority,estimate_minutes:minutes,status:get('Status').toLowerCase(),created_by:actor.id,created_at:zonedInstant(actor.zone,created),version:1}}
}
export function mappingObject(value:unknown):Record<string,string>{
  if(value===undefined)return {}
  if(typeof value==='string'){try{value=JSON.parse(value)}catch{throw new GasketError('invalid_source_mapping')}}
  insist(value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(v=>typeof v==='string'),'invalid_source_mapping')
  return Object.assign(Object.create(null),value) as Record<string,string>
}
