import { customFields, customValues } from './custom-fields'
import { recoveryHealth } from './recovery'
import { strategyView } from './pm-strategies'
import { responseSettings } from './request-response'
import { requestReport } from './request-report'
import { retentionPreview, retentionSettings } from './retention'
import { searchEstate, savedSearches } from './search'
import { costingReport } from './costing'
import { portalSettings, requestQueue, requestDetail } from './requests'
import { connectors } from './webhooks'
import { stockInsights } from './stock-insights'
import { outcomeList, readOutcome } from './outcomes'
import { lookupPart } from './catalogs'
import { followUpView } from './agent-follow-up'
import { replenishmentView, previewReplenishment } from './replenishment'
import { vendorFollowUp } from './vendor-follow-up'
import { purchaseReceiving, receiptDetail } from './receiving'
// Read models served at GET /api/gasket/... Every view applies the same role
// checks as the page that renders it.
import { spendPolicySettings } from './purchase-policy'
import { spendReport } from './purchase-report'
import { metrics } from './metrics'
import { quoteList } from './quotes'
import { purchaseOrders, purchaseOrderDetail } from './purchase-orders'
import { nestedPrograms } from './nested'
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { assetDetail, assetList } from './assets'
import { audit } from './audit'
import { board } from './board'
import { checklistDetail, checklistList } from './checklists'
import { closures } from './calendar'
import { thread } from './comments'
import { chaseRule, notices } from './chasing'
import { teamList } from './crew'
import { performance } from './performance'
import { reliability } from './reliability'
import { availability } from './availability'
import { badActors } from './bad-actors'
import { templateList } from './templates'
import { routeList } from './routes'
import { calibrationList } from './calibration'
import { fieldList, statusList } from './work-fields'
import { kitList, substituteList } from './reservations'
import { codeList, failureReport } from './codes'
import { GasketError, insist, one } from './core'
import { API_DOORS, match } from './doors'
import { assetHistory } from './history'
import { importJobs } from './movein/maintainx'
import { partDetail, partList } from './parts'
import { reconciliation } from './valuation'
import { countDetail, countList } from './counts'
import { automationHealth, ledgerView, previewAutomation } from './automation'
import { purchasing, requisitionDetail } from './requisitions'
import { supplierDetail } from './suppliers'
import { storesReport } from './stores'
import { proposalList } from './proposals'
import { scheduleList } from './schedules'
import { schedulerView } from './scheduler'
import { members, site } from './site'
import { workList, workOrderDetail } from './work'

type View = (env: Bindings, actor: Actor, id: string, url: URL) => Promise<unknown>

export const views: Record<string, View> = {
  customFields: env => customFields(env, undefined, undefined, true),
  locationFields: async (env,_actor,id) => { insist(await one(env,"SELECT 1 FROM gk_request_targets WHERE id=? AND kind='location'",id),'location_not_found',404);return customValues(env,'location',id) },
  recovery: (env,actor) => recoveryHealth(env,actor),
  pmStrategies:(env,actor)=>strategyView(env,actor),
  requestResponse:(env,actor)=>responseSettings(env,actor),
  requestReport:(env,actor,_id,url)=>requestReport(env,actor,url),
  retentionSettings: (env, actor) => retentionSettings(env, actor),
  retentionPreview: (env, actor, _id, url) => retentionPreview(env, actor, url),
  search: (env, actor, _id, url) => searchEstate(env, actor, url),
  searchViews: (env, actor) => savedSearches(env, actor),
  costing: (env,actor,_id,url) => costingReport(env,actor,url),
  requestPortals: (env,actor) => portalSettings(env,actor), requests:(env,actor,_id,url)=>requestQueue(env,actor,url), request:(env,actor,id)=>requestDetail(env,actor,id),
  connectors: (env,actor,_id,url) => connectors(env,actor,url),
  stockInsights: (env,actor,id) => stockInsights(env,actor,id),
  outcomes: (env,actor) => outcomeList(env,actor),
  outcome:(env,actor,id)=>readOutcome(env,actor,id),
  partLookup:(env,actor,_id,url)=>lookupPart(env,actor,url),
  agentFollowUp: (env, actor, id) => followUpView(env, actor, id),
  vendorFollowUp: (env,actor) => vendorFollowUp(env,actor),
  replenishment: (env,actor) => replenishmentView(env,actor),
  replenishmentPreview: (env,actor) => previewReplenishment(env,actor),
  purchaseReceiving: (env,actor,id) => purchaseReceiving(env,actor,id),
  receipt: (env,actor,id) => receiptDetail(env,actor,id),
  metrics: (env,actor,_id,url) => metrics(env,actor,url),
  spendPolicy: (env,actor) => spendPolicySettings(env,actor),
  spendReport: (env,actor) => spendReport(env,actor),
  quotes: (env, actor) => quoteList(env, actor),
  purchaseOrders: (env, actor) => purchaseOrders(env, actor),
  purchaseOrder: (env, actor, id) => purchaseOrderDetail(env, actor, id),
  nested: env => nestedPrograms(env),
  automation: (env, actor) => automationHealth(env, actor),
  automationLedger: (env, actor, _id, url) => ledgerView(env, actor, url),
  automationPreview: (env, actor, _id, url) => previewAutomation(env, actor, url.searchParams.get('schedule') ?? ''),
  purchasing: env => purchasing(env),
  supplier: (env, _actor, id) => supplierDetail(env, id),
  requisition: (env, _actor, id) => requisitionDetail(env, id),
  me: async (_env, actor) => ({ id: actor.id, email: actor.email, name: actor.name, role: actor.role, today: actor.today, zone: actor.zone }),
  site: env => site(env),
  members: async (env, actor) => { requireCapability(actor, 'site.manage'); return await members(env) },
  assets: (env, actor, _id, url) => assetList(env, actor, url),
  asset: (env, actor, id) => assetDetail(env, actor, id),
  history: (env, actor, id) => assetHistory(env, actor, id),
  parts: (env, actor) => partList(env, actor),
  part: (env, actor, id) => partDetail(env, actor, id),
  valuation: (env, actor, _id, url) => reconciliation(env, actor, url),
  counts: (env, actor) => countList(env, actor),
  count: (env, actor, id) => countDetail(env, actor, id),
  stores: (env, actor, _id, url) => storesReport(env, actor, url),
  checklists: (env, actor) => checklistList(env, actor),
  checklist: (env, actor, id) => checklistDetail(env, actor, id),
  schedules: (env, actor) => scheduleList(env, actor),
  work: (env, actor, _id, url) => workList(env, actor, url),
  workOrder: (env, actor, id) => workOrderDetail(env, actor, id),
  workComments: async (env, actor, id) => { insist(await one(env, 'SELECT 1 FROM gk_work_orders WHERE id = ?', id), 'work_order_not_found', 404); return await thread(env, actor, 'work', id) },
  assetComments: async (env, actor, id) => { insist(await one(env, 'SELECT 1 FROM gk_assets WHERE id = ?', id), 'asset_not_found', 404); return await thread(env, actor, 'asset', id) },
  board: (env, actor) => board(env, actor),
  proposals: (env, actor) => proposalList(env, actor),
  imports: (env, actor) => importJobs(env, actor),
  audit: (env, actor, _id, url) => audit(env, actor, url),
  codes: env => codeList(env),
  closures: env => closures(env),
  scheduler: (env, actor) => schedulerView(env, actor),
  notices: (env, actor) => notices(env, actor),
  chaseRule: env => chaseRule(env),
  teams: env => teamList(env),
  performance: (env, actor, _id, url) => performance(env, actor, url),
  reliability: (env, actor, _id, url) => reliability(env, actor, url),
  availability: (env, actor, _id, url) => availability(env, actor, url),
  badActors: (env, actor, _id, url) => badActors(env, actor, url),
  templates: env => templateList(env),
  routes: env => routeList(env),
  calibrations: (env, actor) => calibrationList(env, actor),
  workFields: async env => ({ fields: (await fieldList(env)).map(row => ({ ...row, options: row.options ? JSON.parse(row.options) : null, required: Boolean(row.required) })), statuses: await statusList(env) }),
  kits: async env => ({ kits: await kitList(env), substitutes: await substituteList(env) }),
  failures: (env, actor) => failureReport(env, actor),
}

export function route(path: string): { view: View; id: string } {
  const found = match(API_DOORS, path)
  if (!found) throw new GasketError('not_found', 404)
  return { view: views[found.name], id: found.id }
}
