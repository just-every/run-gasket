// AGENT-009: exactly what a run may send to the provider, built from the grant's
// scope. The same builder serves the owner's preview and the run, so the hash the
// owner saw is the hash that is sent. People's names, notes, rates, attachments
// and manual files are never part of it; posted work costs only when the grant
// carries them and the owner's recorded provider terms.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, insist, sha256Hex, type Row } from './core'
import { localNow } from './dates'
import { woDigits } from './quantity'

export const ACTIONS = ['corrective'] as const
const FACTS = 25

export interface Grant {
  id: string; revision: number; agent_id: string; provider: string; model: string; assets: string[]; costs: boolean
  actions: string[]; maxProposals: number; maxOutputTokens: number; budgetMicro: number; spentMicro: number
  inputPriceMicro: number; outputPriceMicro: number; status: string
}
export interface InputRef { ref: string; type: 'asset' | 'work_order' | 'downtime'; id: string; version: number | null }

export const grantOf = (row: Row): Grant => ({
  id: row.id, revision: row.revision, agent_id: row.agent_id, provider: row.provider, model: row.model, assets: JSON.parse(row.assets_json), costs: row.costs === 1,
  actions: JSON.parse(row.actions_json), maxProposals: row.max_proposals, maxOutputTokens: row.max_output_tokens, budgetMicro: row.budget_micro, spentMicro: row.spent_micro,
  inputPriceMicro: row.input_price_micro, outputPriceMicro: row.output_price_micro, status: row.status,
})

const SYSTEM = (grant: Grant, today: string) => `You are a maintenance reliability analyst. Today is ${today}. Use only the JSON facts the user message supplies and never invent records. Reply with one JSON object: {"summary": string of at most 400 characters, "proposals": [ ... ]}. Each proposal is {"kind":"corrective","asset": an asset tag from the facts,"title": at most 100 characters,"description": at most 400 characters,"dueInDays": integer from 1 to 30,"reasoning": at most 400 characters,"evidence": record references copied from the facts}. Propose at most ${grant.maxProposals}, and none ([]) when the facts show no developing failure. Cite only references that appear in the facts.`

export async function buildRunInput(env: Bindings, actor: Actor, grant: Grant) {
  const refs: InputRef[] = [], facts: unknown[] = []
  let downtimes = 0
  for (const id of grant.assets) {
    const asset = (await all(env, 'SELECT id, tag, name, category, criticality, revision, retired_at FROM gk_assets WHERE id = ?', id))[0]
    insist(asset && !asset.retired_at, 'scope_asset_unavailable', 409)
    refs.push({ ref: asset.tag, type: 'asset', id: asset.id, version: asset.revision })
    const work = await all(env, 'SELECT id, number, kind, title, status, due_date, closed_at, version FROM gk_work_orders WHERE asset_id = ? AND merged_into IS NULL ORDER BY due_date DESC, number DESC LIMIT ?', asset.id, FACTS)
    const costs = grant.costs && work.length ? new Map((await all(env, `SELECT work_order_id, SUM(cents) AS cents FROM gk_work_costs WHERE work_order_id IN (${work.map(() => '?').join(',')}) GROUP BY work_order_id`, ...work.map(row => row.id))).map(row => [row.work_order_id, row.cents])) : new Map()
    const stops = await all(env, 'SELECT id, started_on, ended_on, minutes, reason FROM gk_downtime WHERE asset_id = ? ORDER BY started_on DESC, id LIMIT ?', asset.id, FACTS)
    const findings = Object.fromEntries((await all(env, 'SELECT severity, COUNT(*) AS n FROM gk_findings WHERE asset_id = ? GROUP BY severity', asset.id)).map(row => [row.severity, row.n]))
    facts.push({ asset: asset.tag, name: asset.name, category: asset.category, criticality: asset.criticality, findingsBySeverity: findings,
      workOrders: work.map(row => {
        const ref = `WO-${woDigits(row.number)}`
        refs.push({ ref, type: 'work_order', id: row.id, version: row.version })
        return { ref, kind: row.kind, title: row.title, status: row.status, due: row.due_date, closed: row.closed_at ? localNow(actor.zone, row.closed_at).slice(0, 10) : null, ...(grant.costs ? { postedCostUsd: costs.has(row.id) ? costs.get(row.id) / 100 : 0 } : {}) }
      }),
      downtime: stops.map(row => {
        const ref = `DT-${++downtimes}`
        refs.push({ ref, type: 'downtime', id: row.id, version: null })
        return { ref, from: row.started_on, to: row.ended_on, minutes: row.minutes, reason: row.reason }
      }) })
  }
  const request = { model: grant.model, max_completion_tokens: grant.maxOutputTokens, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYSTEM(grant, actor.today) }, { role: 'user', content: JSON.stringify({ site: 'this site', assets: facts }) }] }
  // Tokens never exceed bytes, so bytes bound the prompt; the margin covers message framing.
  const reserveMicro = Math.ceil(((new TextEncoder().encode(JSON.stringify(request)).length + 64) * grant.inputPriceMicro + grant.maxOutputTokens * grant.outputPriceMicro) / 1_000_000)
  const previewHash = await sha256Hex(JSON.stringify({ grant: grant.id, revision: grant.revision, request }))
  return { request, refs, reserveMicro, previewHash }
}

/** Provider cost in micro-dollars, rounded up so a reported figure is never under the charge. */
export const costOf = (grant: Grant, promptTokens: number, completionTokens: number) => Math.ceil((promptTokens * grant.inputPriceMicro + completionTokens * grant.outputPriceMicro) / 1_000_000)
