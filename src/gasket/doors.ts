// Every GET door, by name. http.ts and views.ts dispatch only through these
// lists, so the access proof can crawl every one of them.
// API patterns are relative to /api/gasket/; page patterns are absolute.
export const API_DOORS: [string, string][] = [
  ['^spend-policy$', 'spendPolicy'], ['^spend-report$', 'spendReport'],
  ['^metrics$', 'metrics'],
  ['^programs$', 'nested'],
  ['^quotes$', 'quotes'], ['^purchase-orders$', 'purchaseOrders'], ['^purchase-orders/([\\w-]+)$', 'purchaseOrder'],
  ['^automation$', 'automation'], ['^automation/jobs$', 'automationLedger'], ['^automation/preview$', 'automationPreview'],
  ['^purchasing$', 'purchasing'], ['^suppliers/([\\w-]+)$', 'supplier'], ['^requisitions/([\\w-]+)$', 'requisition'],
  ['^me$', 'me'], ['^site$', 'site'], ['^members$', 'members'],
  ['^assets$', 'assets'], ['^assets/([\\w-]+)$', 'asset'], ['^assets/([\\w-]+)/history$', 'history'],
  ['^parts$', 'parts'], ['^parts/([\\w-]+)$', 'part'], ['^checklists$', 'checklists'], ['^checklists/([\\w-]+)$', 'checklist'],
  ['^schedules$', 'schedules'], ['^work$', 'work'], ['^work/([\\w-]+)$', 'workOrder'], ['^work/([\\w-]+)/comments$', 'workComments'], ['^assets/([\\w-]+)/comments$', 'assetComments'], ['^board$', 'board'],
  ['^proposals$', 'proposals'], ['^imports$', 'imports'], ['^audit$', 'audit'], ['^codes$', 'codes'], ['^failures$', 'failures'], ['^closures$', 'closures'], ['^scheduler$', 'scheduler'], ['^notices$', 'notices'], ['^chase-rule$', 'chaseRule'], ['^teams$', 'teams'], ['^performance$', 'performance'], ['^reliability$', 'reliability'], ['^availability$', 'availability'], ['^bad-actors$', 'badActors'], ['^templates$', 'templates'], ['^routes$', 'routes'], ['^calibrations$', 'calibrations'], ['^work-fields$', 'workFields'], ['^kits$', 'kits'], ['^valuation$', 'valuation'], ['^counts$', 'counts'], ['^stores$', 'stores'], ['^counts/([\\w-]+)$', 'count'],
]

export const PAGE_DOORS: [string, string][] = [
  ['^/app/spend-policy$', 'spendPolicy'],
  ['^/app/metrics$', 'metrics'],
  ['^/app/programs$', 'nested'],
  ['^/app/purchase-orders$', 'purchaseOrders'], ['^/app/purchase-orders/([\\w-]+)$', 'purchaseOrder'], ['^/app/purchase-files/([\\w-]+)$', 'purchaseFile'],
  ['^/app/automation$', 'automation'],
  ['^/app/purchasing$', 'purchasing'], ['^/app/suppliers/([\\w-]+)$', 'supplier'], ['^/app/requisitions/([\\w-]+)$', 'requisition'],
  ['^/app$', 'work'], ['^/app/site$', 'site'], ['^/app/access$', 'access'],
  ['^/app/work/([\\w-]+)$', 'workOrder'], ['^/app/evidence/([\\w-]+)$', 'evidence'], ['^/app/signatures/([\\w-]+)$', 'signatureMark'], ['^/app/comment-photos/([\\w-]+)$', 'commentPhoto'], ['^/app/documents/([\\w-]+)$', 'documentFile'], ['^/app/work/([\\w-]+)/pack\\.zip$', 'jobPack'],
  ['^/app/assets$', 'assets'], ['^/app/assets/([\\w-]+)$', 'asset'], ['^/app/assets/([\\w-]+)/history\\.csv$', 'historyCsv'], ['^/app/assets/([\\w-]+)/ledger\\.csv$', 'ledgerCsv'],
  ['^/app/schedules$', 'schedules'], ['^/app/checklists/([\\w-]+)$', 'checklist'], ['^/app/parts$', 'parts'], ['^/app/parts/valuation\\.csv$', 'valuationCsv'], ['^/app/parts/([\\w-]+)$', 'part'], ['^/app/counts/([\\w-]+)$', 'count'], ['^/app/stores$', 'stores'], ['^/app/stores/movements\\.csv$', 'storesCsv'],
  ['^/app/board$', 'board'], ['^/app/proposals$', 'proposals'], ['^/app/move-in$', 'moveIn'], ['^/app/audit$', 'audit'], ['^/app/audit\\.csv$', 'auditCsv'], ['^/app/codes$', 'codes'], ['^/app/notices$', 'notices'], ['^/app/teams$', 'teams'], ['^/app/performance$', 'performance'], ['^/app/reliability$', 'reliability'], ['^/app/availability$', 'availability'], ['^/app/bad-actors$', 'badActors'], ['^/app/bad-actors\\.csv$', 'badActorsCsv'], ['^/app/templates$', 'templates'], ['^/app/more$', 'more'],
]

export function match(doors: [string, string][], path: string): { name: string; id: string } | null {
  for (const [pattern, name] of doors) {
    const found = path.match(new RegExp(pattern))
    if (found) return { name, id: found[1] ?? '' }
  }
  return null
}
