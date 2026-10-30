import type { Bindings } from '../../auth.server'
import type { UndoContext } from '../../modules/agent-door/index.ts'
import { capabilitySql, humanSessionSql } from '../actor'
import { commit, guard, insist, now, one, stmt, type Row } from '../core'
import { agentContext } from './context'
import { nativeUndoCall } from './native'

/** Only a change confined to name and notes has this native compensation. */
export function assetUndoEffect(env: Bindings, asset: Row, before: Row, after: Row) {
  const ctx = agentContext()
  if (!ctx || !Object.keys(before).every(key => ['name', 'notes'].includes(key) || before[key] === after[key])
    || before.name === after.name && before.notes === after.notes) return null
  const effect = ctx.operationId
  return { saved: { effect }, statements: [stmt(env, `INSERT INTO gk_agent_asset_effects
    (effect_id,asset_id,before_json,after_json,applied_revision,agent_id,sponsor_id,idempotency_key,applied_at)
    VALUES (?,?,?,?,?,?,?,?,?)`, effect, asset.id, JSON.stringify(before), JSON.stringify(after), asset.revision + 1,
    ctx.agent.id, ctx.person.id, ctx.idempotencyKey, now())] }
}

export async function undoAssetEffect(env: Bindings, saved: unknown, ctx: UndoContext) {
  await nativeUndoCall(env, ctx, async actor => {
    const effect = (saved as { effect?: unknown })?.effect
    insist(typeof effect === 'string', 'undo_unavailable', 409)
    const record = await one(env, 'SELECT * FROM gk_agent_asset_effects WHERE effect_id=?', effect)
    insist(record, 'undo_unavailable', 409)
    // Current authority is required even for a completed native retry.
    if (record.undone_revision !== null) return
    const asset = await one(env, 'SELECT * FROM gk_assets WHERE id=?', record.asset_id)
    insist(asset && !asset.retired_at && asset.revision === record.applied_revision, 'undo_evidence_changed', 409)
    const before = JSON.parse(record.before_json), after = JSON.parse(record.after_json)
    insist(Object.keys(after).every(key => asset[key] === after[key]), 'undo_evidence_changed', 409)
    const session = humanSessionSql(actor), capability = capabilitySql(actor.sessionId, 'register.manage')
    await commit(env, [
      guard(env, 'undo_authority_ended', session.sql, ...session.params),
      guard(env, 'undo_authority_ended', capability.sql, ...capability.params),
      guard(env, 'undo_authority_ended', "EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=? AND CASE WHEN o.role='owner' THEN 'owner' ELSE m.role END=?)", actor.id, actor.role),
      guard(env, 'undo_evidence_changed', 'EXISTS(SELECT 1 FROM gk_assets WHERE id=? AND revision=? AND retired_at IS NULL AND name IS ? AND notes IS ?)', asset.id, record.applied_revision, after.name, after.notes),
      guard(env, 'undo_evidence_changed', 'EXISTS(SELECT 1 FROM gk_agent_asset_effects WHERE effect_id=? AND undone_revision IS NULL)', effect),
      stmt(env, 'INSERT INTO gk_asset_versions(asset_id,revision,value_json,changed_by,changed_at) VALUES (?,?,?,?,?)', asset.id, asset.revision, record.after_json, actor.id, now()),
      stmt(env, 'UPDATE gk_assets SET name=?,notes=?,revision=revision+1,updated_at=? WHERE id=?', before.name, before.notes, now(), asset.id),
      stmt(env, 'UPDATE gk_agent_asset_effects SET undone_revision=?,undone_by=?,undone_at=? WHERE effect_id=?', asset.revision + 1, actor.id, now(), effect),
    ], { actor: actor.id, action: 'asset.undo', subject: asset.id, detail: { effect, appliedRevision: record.applied_revision, revision: asset.revision + 1, before: after, after: before, originalAgent: record.agent_id, originalSponsor: record.sponsor_id } })
  })
}
