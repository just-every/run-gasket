// ASSET-004: the central code catalog. Criticality levels (an ordered list,
// seeded Normal, Important, Critical) and risk, failure mode, cause and remedy
// codes. Leads add, reorder, relabel and retire codes; a key never changes,
// records keep the code they were given, and a retired code stays readable but
// is no longer given or matched. An imported value maps onto the active code
// whose key, label or import name equals it, ignoring case; anything else stays
// unclassified, and the failure report counts it as such.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, now, one, stmt, type Row } from './core'
import type { Input } from './input'
import { stateConflicts, stateHistory } from './states'

export const CODE_KINDS = ['criticality', 'risk', 'failure_mode', 'cause', 'remedy'] as const
export type CodeKind = typeof CODE_KINDS[number]
export const FINDING_CODES = ['failure_mode', 'cause', 'remedy', 'risk'] as const
const KEY = /^[a-z0-9][a-z0-9_-]{0,39}$/

const codeId = (kind: string, key: string) => `${kind}:${key}`
const names = (row: Row) => [row.key, row.label, ...(row.import_names ? String(row.import_names).split('|') : [])].map(name => name.trim().toLowerCase())

/** Every code of one kind (or all kinds) in catalog order, retired ones included. */
export async function codeList(env: Bindings, kind?: CodeKind) {
  const rows = await all(env, `SELECT * FROM gk_codes ${kind ? 'WHERE kind = ?' : ''} ORDER BY kind, position, key`, ...(kind ? [kind] : []))
  return rows.map(row => ({ id: row.id, kind: row.kind, key: row.key, label: row.label, importNames: row.import_names ? String(row.import_names).split('|') : [], position: row.position, retired: Boolean(row.retired_at), revision: row.revision }))
}

/** The active code of `kind` whose key, label or import name equals `text` (any case), or null. */
export function matchCode(codes: Row[], kind: CodeKind, text: string) {
  const wanted = text.trim().toLowerCase()
  if (!wanted) return null
  return codes.find(code => code.kind === kind && !code.retired && names({ key: code.key, label: code.label, import_names: code.importNames.join('|') }).includes(wanted)) ?? null
}

/** An active code a record is about to be given; a retired or unknown one is refused. */
export async function activeCode(env: Bindings, kind: CodeKind, key: string) {
  const code = await one(env, 'SELECT id, key, retired_at FROM gk_codes WHERE kind = ? AND key = ?', kind, key)
  insist(code && !code.retired_at, `invalid_${kind}`)
  return code
}

const kindFrom = (input: Input) => {
  const kind = input.text('kind', { max: 20 }) as CodeKind
  insist(CODE_KINDS.includes(kind), 'invalid_kind')
  return kind
}

const importNamesFrom = (input: Input) => {
  const list = input.text('importNames', { optional: true, max: 500 }).split(/[,|]/).map(name => name.trim()).filter(Boolean)
  return list.length ? list.join('|') : null
}

/** Adds a code at the end of its kind, or relabels an existing one and replaces its import names. */
export async function setCode(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const kind = kindFrom(input), key = input.text('key', { max: 40 }).toLowerCase(), label = input.text('label', { max: 80 }), importNames = importNamesFrom(input)
  insist(KEY.test(key), 'invalid_key')
  const existing = await one(env, 'SELECT * FROM gk_codes WHERE id = ?', codeId(kind, key))
  if (existing) {
    insist(!existing.retired_at, 'code_retired', 409)
    await commit(env, [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_codes WHERE id = ? AND revision = ?)', existing.id, existing.revision),
      stmt(env, 'UPDATE gk_codes SET label = ?, import_names = ?, revision = revision + 1 WHERE id = ?', label, importNames, existing.id)],
    { actor: actor.id, action: 'code.set', subject: existing.id, detail: { kind, key, from: existing.label, label, importNames } })
    return { id: existing.id }
  }
  const id = codeId(kind, key)
  await commit(env, [stmt(env, 'INSERT INTO gk_codes (id, kind, key, label, import_names, position, created_at) VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM gk_codes WHERE kind = ?), ?)', id, kind, key, label, importNames, kind, now())],
    { actor: actor.id, action: 'code.set', subject: id, detail: { kind, key, label, importNames } })
  return { id }
}

/** Moves one code to a 1-based position within its kind; the others keep their order around it. */
export async function moveCode(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const kind = kindFrom(input), key = input.text('key', { max: 40 })
  const codes = await all(env, 'SELECT id, key, position FROM gk_codes WHERE kind = ? ORDER BY position, key', kind)
  const moving = codes.find(code => code.key === key)
  insist(moving, 'code_not_found', 404)
  const position = input.integer('position', { min: 1, max: codes.length })!
  const order = codes.filter(code => code.id !== moving.id)
  order.splice(position - 1, 0, moving)
  await commit(env, order.map((code, index) => stmt(env, 'UPDATE gk_codes SET position = ?, revision = revision + 1 WHERE id = ?', index + 1, code.id)),
    { actor: actor.id, action: 'code.move', subject: moving.id, detail: { kind, key, from: codes.indexOf(moving) + 1, to: position } })
  return { order: order.map(code => code.key) }
}

/** Retires a code with a reason: nothing new is given it, and every record keeps it. */
export async function retireCode(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const kind = kindFrom(input), key = input.text('key', { max: 40 }), reason = input.text('reason', { max: 500 })
  const code = await one(env, 'SELECT * FROM gk_codes WHERE id = ?', codeId(kind, key))
  insist(code, 'code_not_found', 404)
  insist(!code.retired_at, 'code_retired', 409)
  if (kind === 'criticality') insist((await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM gk_codes WHERE kind = 'criticality' AND retired_at IS NULL"))!.n > 1, 'last_criticality', 409)
  await commit(env, [stmt(env, 'UPDATE gk_codes SET retired_at = ?, revision = revision + 1 WHERE id = ? AND retired_at IS NULL', now(), code.id)],
    { actor: actor.id, action: 'code.retire', subject: code.id, detail: { kind, key, reason } })
  return { id: code.id }
}

/** Failures by code across findings and moved-in work history, what is unclassified, and assets whose evidence disagrees with their state. */
export async function failureReport(env: Bindings, actor: Actor) {
  requireCapability(actor, 'board.read')
  const codes = await codeList(env)
  const counted = new Map<string, { findings: number; history: number }>()
  const add = (id: string | null, field: 'findings' | 'history') => { if (id) { const entry = counted.get(id) ?? { findings: 0, history: 0 }; entry[field]++; counted.set(id, entry) } }
  const findings = await all(env, 'SELECT failure_mode, cause, remedy, risk FROM gk_findings')
  for (const row of findings) for (const field of FINDING_CODES) add(row[field], 'findings')
  const history = await all(env, 'SELECT h.id, h.source_ref, h.title, h.categories, h.failure_mode, a.name AS asset FROM gk_work_history h JOIN gk_assets a ON a.id = h.asset_id ORDER BY h.completed_on')
  for (const row of history) add(row.failure_mode, 'history')
  const declared = await all(env, 'SELECT DISTINCT s.asset_id, a.name, a.retired_at FROM gk_asset_states s JOIN gk_assets a ON a.id = s.asset_id')
  const conflicts = []
  for (const asset of declared) {
    const found = await stateConflicts(env, { id: asset.asset_id, retired_at: asset.retired_at }, await stateHistory(env, asset.asset_id))
    if (found.length) conflicts.push({ asset: asset.asset_id, name: asset.name, kinds: found.map((row: Row) => row.kind) })
  }
  return {
    codes: codes.filter(code => code.kind !== 'criticality').map(code => ({ ...code, ...(counted.get(code.id) ?? { findings: 0, history: 0 }) })),
    unclassified: {
      findings: findings.filter(row => !row.failure_mode).length,
      history: history.filter(row => !row.failure_mode).map(row => ({ id: row.id, sourceRef: row.source_ref, title: row.title, asset: row.asset, categories: row.categories })),
    },
    conflicts,
  }
}
