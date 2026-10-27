import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import type { Input } from './input'
import { all, commit, guard, insist, now, one, stmt } from './core'

export async function recoveryHealth(env: Bindings, actor: Actor) {
  insist(actor.role === 'owner', 'forbidden', 403)
  const rows = await all(env, 'SELECT * FROM gk_recovery_receipts ORDER BY recorded_at DESC,id DESC')
  const backup = rows.find(row => row.kind === 'backup') ?? null
  const restore = rows.find(row => row.kind === 'restore') ?? null
  const drill = rows.filter(row => row.drill_at).sort((a,b) => b.drill_at-a.drill_at)[0] ?? null
  return { backup, restore, drill, backupAgeMinutes: backup ? Math.max(0, Math.floor((now()-backup.recorded_at)/60000)) : null }
}

// Confirmation is an explicit owner attestation after reconciliation, never an import side effect.
export async function confirmRecoveryDrill(env: Bindings, actor: Actor, input: Input) {
  insist(actor.role === 'owner', 'forbidden', 403)
  insist(input.flag('confirm'), 'recovery_confirmation_required')
  const id = input.text('receipt'), receipt = await one(env, "SELECT * FROM gk_recovery_receipts WHERE id=? AND kind='restore'", id)
  insist(receipt, 'restore_not_found', 404)
  if (receipt.drill_at) return { id }
  const tables = JSON.parse(receipt.tables_json) as { name: string; count: number }[]
  const conditions: D1PreparedStatement[] = []
  // Operational receipts advance during confirmation; import already validates their archived counts and digests.
  for (const table of tables.filter(row => row.name.startsWith('gk_') && !['gk_guard','gk_recovery_receipts','gk_form_saves'].includes(row.name))) {
    insist(/^gk_[a-z0-9_]+$/.test(table.name), 'invalid_recovery_table')
    conditions.push(guard(env, 'stale', `(SELECT COUNT(*) FROM "${table.name}")=?`, table.count))
  }
  await commit(env, [...conditions, stmt(env, 'UPDATE gk_recovery_receipts SET drill_by=?,drill_at=? WHERE id=? AND drill_at IS NULL', actor.id, now(), id)],
    { actor: actor.id, action: 'recovery.drill', subject: id, detail: { contentHash: receipt.content_hash, recoveryPoint: receipt.recovery_point } })
  return { id }
}
