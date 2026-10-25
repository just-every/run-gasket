import type { Bindings } from '../auth.server'
import { all, insist, now, one, type Row } from './core'
import { localNow } from './dates'
import { ASSET_STATUS } from './assets'
import type { RuleEvent } from './rules-definition'
export async function ruleFacts(env:Bindings,event:RuleEvent):Promise<Row> {
 let record:Row|null=null,work:Row|null=null,asset:Row|null=null,part:Row|null=null
 if(event.entityType==='request')record=await one(env,'SELECT * FROM gk_requests WHERE id=? AND erased_at IS NULL',event.entityId)
 if(event.entityType==='work')record=work=await one(env,'SELECT * FROM gk_work_orders WHERE id=?',event.entityId)
 if(event.entityType==='asset')record=asset=await one(env,`SELECT a.*,${ASSET_STATUS} AS status FROM gk_assets a WHERE a.id=?`,event.entityId)
 if(event.entityType==='part')record=part=await one(env,'SELECT * FROM gk_parts WHERE id=?',event.entityId)
 if(event.entityType==='reading')record=await one(env,'SELECT r.*,m.asset_id FROM gk_readings r JOIN gk_meters m ON m.id=r.meter_id WHERE r.id=?',event.entityId)
 if(event.entityType==='result')record=await one(env,'SELECT * FROM gk_results WHERE work_order_id=? AND outcome=\'fail\' ORDER BY recorded_at DESC LIMIT 1',event.entityId)
 insist(record,'rule_source_not_found',404)
 if(!work && event.entityType!=='request' && record.work_order_id)work=await one(env,'SELECT * FROM gk_work_orders WHERE id=?',record.work_order_id)
 const assetId=asset?.id??record.asset_id??work?.asset_id
 if(!asset && assetId)asset=await one(env,`SELECT a.*,${ASSET_STATUS} AS status FROM gk_assets a WHERE a.id=?`,assetId)
 const custom:Row={}
 const locationName=record.location??work?.location??asset?.location
 const locationId=event.entityType==='request' && record.location ? record.target_id : locationName ? (await one(env,"SELECT id FROM gk_request_targets WHERE kind='location' AND name=? AND retired_at IS NULL ORDER BY id LIMIT 1",locationName))?.id : null
 for(const [type,id] of [['asset',asset?.id],['location',locationId],['part',part?.id]]) {
  if(!id)continue
  for(const row of await all(env,'SELECT v.field_id,v.value FROM gk_custom_values v JOIN gk_custom_fields f ON f.id=v.field_id WHERE v.entity_type=? AND v.entity_id=? AND f.retired=0',type,id))custom[row.field_id]=JSON.parse(row.value)
 }
 if(work)for(const row of await all(env,'SELECT field_id,value FROM gk_work_field_values WHERE work_order_id=?',work.id))custom[row.field_id]=row.value
 if(event.entityType==='request')record=Object.fromEntries(['id','number','asset_id','location','urgency','status','version','work_order_id','team_id','assignee_id','due_date','target_id'].map(k=>[k,record![k]??null]))
 const pick=(row:Row|null,keys:string[])=>row?Object.fromEntries(keys.map(k=>[k,row[k]??null])):null
 const workKeys=['id','number','asset_id','location','status','version','priority','assignee_id','team_id','trade','shift','checklist_revision_id','due_date']
 work=pick(work,workKeys)
 if(event.entityType==='work')record=work!
 if(event.entityType==='asset')record=pick(record,['id','status','retired_at','category','location'])!
 if(event.entityType==='part')record=pick(record,['id','category','minimum_milli','revision'])!
 if(event.entityType==='reading')record=pick(record,['id','asset_id','meter_id','work_order_id','value','taken_on'])!
 if(event.entityType==='result')record=pick(record,['work_order_id','item','outcome','recorded_at'])!
 asset=pick(asset,['id','status','retired_at','category','location'])
 part=pick(part,['id','category','minimum_milli','revision'])
 const zone=(await one(env,'SELECT timezone FROM gk_site WHERE singleton=1'))?.timezone??'UTC'
 return {record,work,assetRecord:asset,partRecord:part,asset:asset?.id??null,location:record.location??work?.location??asset?.location??null,
  category:asset?.category??part?.category??null,priority:record.urgency??work?.priority??null,team:record.team_id??work?.team_id??null,
  status:record.status??work?.status??null,time:localNow(zone,event.at??now()).slice(11),custom,zone}
}
