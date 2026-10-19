// PLAN-001 (slice): a lead raises work from one template for several assets
// at once. A preview writes nothing; either way each asset reports its outcome
// (would_create or created with the new work number, or the refusal: asset not
// found or retired, or any refusal raising the work alone would give). Each
// work order is raised on its own, in the order the assets were given, so the
// rows that succeed keep their stable work numbers whatever the others do.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { GasketError, insist, one } from './core'
import { isDate } from './dates'
import { Input } from './input'
import { chosenTemplate, priorityOf } from './templates'
import { createCorrective } from './work'

export async function workFromTemplate(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const template = await chosenTemplate(env, input)
  insist(template, 'template_required')
  const assets = input.list('asset')
  insist(assets.length > 0 && assets.length <= 200 && new Set(assets).size === assets.length, 'invalid_asset')
  const due = input.text('due', { max: 10 })
  insist(isDate(due), 'invalid_due')
  const priority = priorityOf(input), assignee = input.text('assignee', { optional: true, max: 100 }) || null
  const preview = input.flag('preview')
  const rows: { asset: string; tag: string | null; outcome: string; id: string | null; number: number | null }[] = []
  for (const id of assets) {
    const asset = await one(env, 'SELECT id, tag, retired_at FROM gk_assets WHERE id = ?', id)
    const row = { asset: id, tag: (asset?.tag as string | undefined) ?? null, outcome: preview ? 'would_create' : 'created', id: null as string | null, number: null as number | null }
    rows.push(row)
    if (!asset) { row.outcome = 'asset_not_found'; continue }
    if (asset.retired_at) { row.outcome = 'asset_retired'; continue }
    if (preview) continue
    try {
      row.id = (await createCorrective(env, actor, Input.of({ asset: id, template: template.id, due, ...(priority ? { priority } : {}), ...(assignee ? { assignee } : {}) }))).id
      row.number = (await one(env, 'SELECT number FROM gk_work_orders WHERE id = ?', row.id))!.number
    } catch (error) {
      if (!(error instanceof GasketError)) throw error
      row.outcome = error.code
    }
  }
  return { template: { id: template.id, name: template.name, revision: template.revision }, preview, rows }
}
