// Every GET door, by name. http.ts and views.ts dispatch only through these
// lists, so the access proof can crawl every one of them.
// API patterns are relative to /api/gasket/; page patterns are absolute.
export const API_DOORS: [string, string][] = [
  ['^me$', 'me'], ['^site$', 'site'], ['^members$', 'members'],
  ['^assets$', 'assets'], ['^assets/([\\w-]+)$', 'asset'], ['^assets/([\\w-]+)/history$', 'history'],
  ['^parts$', 'parts'], ['^parts/([\\w-]+)$', 'part'], ['^checklists$', 'checklists'], ['^checklists/([\\w-]+)$', 'checklist'],
  ['^schedules$', 'schedules'], ['^work$', 'work'], ['^work/([\\w-]+)$', 'workOrder'], ['^work/([\\w-]+)/comments$', 'workComments'], ['^assets/([\\w-]+)/comments$', 'assetComments'], ['^board$', 'board'],
  ['^proposals$', 'proposals'], ['^imports$', 'imports'], ['^audit$', 'audit'], ['^codes$', 'codes'], ['^failures$', 'failures'], ['^closures$', 'closures'], ['^scheduler$', 'scheduler'], ['^notices$', 'notices'], ['^chase-rule$', 'chaseRule'], ['^teams$', 'teams'], ['^performance$', 'performance'], ['^reliability$', 'reliability'], ['^availability$', 'availability'], ['^kits$', 'kits'],
]

export const PAGE_DOORS: [string, string][] = [
  ['^/app$', 'work'], ['^/app/site$', 'site'], ['^/app/access$', 'access'],
  ['^/app/work/([\\w-]+)$', 'workOrder'], ['^/app/evidence/([\\w-]+)$', 'evidence'], ['^/app/comment-photos/([\\w-]+)$', 'commentPhoto'],
  ['^/app/assets$', 'assets'], ['^/app/assets/([\\w-]+)$', 'asset'], ['^/app/assets/([\\w-]+)/history\\.csv$', 'historyCsv'],
  ['^/app/schedules$', 'schedules'], ['^/app/checklists/([\\w-]+)$', 'checklist'], ['^/app/parts$', 'parts'], ['^/app/parts/([\\w-]+)$', 'part'],
  ['^/app/board$', 'board'], ['^/app/proposals$', 'proposals'], ['^/app/move-in$', 'moveIn'], ['^/app/audit$', 'audit'], ['^/app/audit\\.csv$', 'auditCsv'], ['^/app/codes$', 'codes'], ['^/app/notices$', 'notices'], ['^/app/teams$', 'teams'], ['^/app/performance$', 'performance'], ['^/app/reliability$', 'reliability'], ['^/app/availability$', 'availability'], ['^/app/more$', 'more'],
]

export function match(doors: [string, string][], path: string): { name: string; id: string } | null {
  for (const [pattern, name] of doors) {
    const found = path.match(new RegExp(pattern))
    if (found) return { name, id: found[1] ?? '' }
  }
  return null
}
