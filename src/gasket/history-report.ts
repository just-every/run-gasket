// Scheduled history exposes the authorized event timeline, never the asset detail's document links.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { insist } from './core'
import { addDays, isDate, zonedInstant } from './dates'
import { assetHistory } from './history'
export async function historyReport(env:Bindings,actor:Actor,url:URL){
  requireCapability(actor,'board.read');requireCapability(actor,'history.export')
  const asset=url.searchParams.get('asset'),from=url.searchParams.get('from')??'',to=url.searchParams.get('to')??''
  insist(asset,'history_asset_required');insist(isDate(from)&&isDate(to)&&from<=to,'invalid_period')
  const history=await assetHistory(env,actor,asset)
  const start=zonedInstant(actor.zone,`${from}T00:00`),end=zonedInstant(actor.zone,`${addDays(to,1)}T00:00`)
  return {asset:{id:history.asset.id,tag:history.asset.tag,name:history.asset.name},from,to,zone:actor.zone,
    policy:'Retained history events by recorded instant, except moved-in completion instants, within site-local dates. Current asset identity accompanies the events. No original files or individual labor rates.',
    events:history.events.filter(event=>event.at>=start&&event.at<end)}
}
