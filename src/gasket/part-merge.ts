// PART-008: the approval retains every dependency and original identity.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt } from './core'
import type { Input } from './input'
import { canonicalId, groupIds } from './part-identity'
import type { FromProposal } from './schedules'
import { fromMilli } from './quantity'

const REFERENCES: Record<string, string[]> = {
  gk_part_merges:['source_id','canonical_id'], gk_part_canonical:['part_id','canonical_id'], gk_part_moves: ['part_id'], gk_part_substitutes: ['part_id','substitute_id'], gk_kit_lines: ['part_id'],
  gk_reservations: ['part_id','requested_part_id'], gk_bom_lines: ['part_id'], gk_bom_alternates: ['part_id','alternate_id'],
  gk_count_lines: ['part_id'], gk_receipt_lines: ['part_id'], gk_replenishment_policies: ['part_id'],
  gk_replenishment_policy_revisions: ['part_id'], gk_replenishments: ['part_id'], gk_notices: ['part_id'],
  gk_supplier_items: ['part_id'], gk_part_aliases: ['part_id'], gk_part_photos: ['part_id'],
}
export async function mergePreview(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  return mergeSnapshot(env, input)
}

// Internal snapshot: only the guarded preview and proposal projection expose it.
async function mergeSnapshot(env: Bindings, input: Input) {
  const source = input.text('source'), canonical = input.text('canonical')
  insist(source !== canonical, 'same_part')
  insist(await canonicalId(env,source) === source && await canonicalId(env,canonical) === canonical, 'already_merged',409)
  const parts = await all(env, 'SELECT * FROM gk_parts WHERE id IN (?,?) ORDER BY id',source,canonical)
  insist(parts.length===2,'part_not_found',404)
  const ids = [...await groupIds(env,source),...await groupIds(env,canonical)].sort(), json=JSON.stringify(ids)
  const dependencies: Record<string, unknown[]> = {}
  for (const [table,columns] of Object.entries(REFERENCES)) {
    const select=table==='gk_part_photos' ? 'id,part_id,filename,media_type,sha256,added_by,added_at' : '*'
    dependencies[table]=await all(env, `SELECT ${select} FROM ${table} WHERE ${columns.map(c=>`${c} IN (SELECT value FROM json_each(?))`).join(' OR ')} ORDER BY rowid`,...columns.map(()=>json))
  }
  dependencies.quarantines=await all(env, 'SELECT q.* FROM gk_work_return_quarantine q JOIN gk_part_moves m ON m.id=q.return_id WHERE m.part_id IN (SELECT value FROM json_each(?)) ORDER BY q.return_id',json)
  dependencies.catalogImports=await all(env,`SELECT id,supplier_id,digest,filename,applied_by,applied_at,undone_at FROM gk_catalog_imports WHERE EXISTS(SELECT 1 FROM json_each(scope_json,'$.parts') a JOIN json_each(?) b ON a.value=b.value) ORDER BY id`,json)
  dependencies.imports=await all(env, "SELECT * FROM ik_provenance WHERE target_kind='part' AND target_id IN (SELECT value FROM json_each(?)) ORDER BY id", json)
  dependencies.proposals=await all(env,"SELECT * FROM gk_proposals WHERE kind='count' AND json_extract(payload_json,'$.part') IN (SELECT value FROM json_each(?)) ORDER BY id",json)
  dependencies.audit=await all(env,"SELECT * FROM gk_audit WHERE subject IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM json_each(?) WHERE instr(gk_audit.detail,json_each.value)>0) ORDER BY seq",json,json)
  // A merge cannot turn an already observed physical count into a count of another shelf.
  const blockers=await all(env,"SELECT l.id,c.number FROM gk_count_lines l JOIN gk_counts c ON c.id=l.count_id WHERE l.part_id IN (SELECT value FROM json_each(?)) AND l.state IN ('open','waiting') ORDER BY l.id",json)
  const conflicts=await all(env,`SELECT a.revision_id,r.asset_id,a.part_id,a.alternate_id,a.serial_from,a.serial_to,l.serial_from AS part_serial_from,l.serial_to AS part_serial_to
    FROM gk_bom_alternates a JOIN gk_bom_lines l ON l.revision_id=a.revision_id AND l.part_id=a.part_id JOIN gk_bom_revisions r ON r.id=a.revision_id
    WHERE r.number=(SELECT MAX(number) FROM gk_bom_revisions WHERE asset_id=r.asset_id)
    AND a.part_id IN (SELECT value FROM json_each(?)) AND a.alternate_id IN (SELECT value FROM json_each(?))
    AND (a.serial_from IS NOT l.serial_from OR a.serial_to IS NOT l.serial_to) ORDER BY r.asset_id,a.part_id,a.alternate_id`,json,json)
  const snapshot={source,canonical,parts,ids,dependencies,blockers,conflicts,compatibleUnits:parts[0].unit===parts[1].unit,
    consequence:'Keep original records and numbers. Combine stock and value in the chosen stocking unit; retain the canonical shelf, minimum and replenishment policy. Source policies become historical. Existing purchasing documents remain open and prevent duplicate replenishment.'}
  return {...snapshot,fingerprint:await sha256Hex(JSON.stringify(snapshot))}
}
/** AGENT-006: retain the full dependency fingerprint, expose only existing part-read facts. */
export async function mergeProposalBasis(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'proposal.prepare')
  const snapshot = await mergeSnapshot(env, input)
  insist(snapshot.compatibleUnits, 'merge_units_differ', 409)
  insist(!snapshot.blockers.length, 'merge_count_in_progress', 409, snapshot.blockers)
  insist(!snapshot.conflicts.length, 'merge_compatibility_conflict', 409, snapshot.conflicts)
  const balances = await all(env, `SELECT p.id,p.number,p.unit,
    COALESCE(SUM(m.quantity_milli),0) AS quantity_milli,COALESCE(SUM(m.value_cents),0) AS value_cents
    FROM gk_parts p LEFT JOIN gk_stock_moves m ON m.part_id=p.id
    WHERE p.id IN (?,?) GROUP BY p.id ORDER BY p.id`, snapshot.source, snapshot.canonical)
  const quantities = balances.reduce((sum, row) => sum + row.quantity_milli, 0)
  const value = balances.reduce((sum, row) => sum + row.value_cents, 0)
  return { source: snapshot.source, canonical: snapshot.canonical, fingerprint: snapshot.fingerprint,
    balances: balances.map(row => ({ id: row.id, number: row.number, unit: row.unit, quantity: fromMilli(row.quantity_milli), valueCents: row.value_cents })),
    combined: { quantity: fromMilli(quantities), unit: balances[0].unit, valueCents: value },
    quantityDelta: '0', valueDeltaCents: 0,
    movements: (await all(env, 'SELECT * FROM gk_stock_moves WHERE source_part_id IN (SELECT value FROM json_each(?)) ORDER BY seq,kind DESC', JSON.stringify(snapshot.ids))).map((row: any) => ({ id: row.id, part: row.part_id, kind: row.kind, quantity: fromMilli(row.quantity_milli), valueCents: row.value_cents, workOrder: row.work_order_id, at: row.at })),
    references: Object.fromEntries(Object.entries(snapshot.dependencies).map(([name, rows]) => [name, rows.length])),
    consequence: snapshot.consequence,
    boundary: 'Identity consolidation only: no physical receipt, count, stock movement or spend is inferred. Bills and missing movements are not reconciled.' }
}

export async function approveMerge(env: Bindings, actor: Actor, input: Input, { proposal, also }: FromProposal = {}) {
  const revision=(await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM gk_audit')).seq
  const preview=await mergePreview(env,actor,input)
  insist(input.text('fingerprint')===preview.fingerprint,'merge_changed',409)
  insist(preview.compatibleUnits,'merge_units_differ',409)
  insist(!preview.blockers.length,'merge_count_in_progress',409,preview.blockers)
  insist(!preview.conflicts.length,'merge_compatibility_conflict',409,preview.conflicts)
  const reason=input.text('reason',{max:1000}), id=newId()
  // Every domain mutation is audited atomically. This fence covers every displayed dependency.
  await commit(env,[guard(env,'merge_changed','(SELECT COALESCE(MAX(seq),0) FROM gk_audit)=?',revision),
    guard(env,'already_merged','NOT EXISTS(SELECT 1 FROM gk_part_canonical WHERE part_id IN (?,?))',preview.source,preview.canonical),
    stmt(env,'UPDATE gk_part_canonical SET canonical_id=? WHERE canonical_id=?',preview.canonical,preview.source),
    stmt(env,'INSERT INTO gk_part_canonical(part_id,canonical_id) VALUES (?,?)',preview.source,preview.canonical),
    stmt(env,`UPDATE gk_supplier_items SET preferred=0 WHERE part_id IN (SELECT value FROM json_each(?)) AND part_id<>?`,JSON.stringify(preview.ids),preview.canonical),
    stmt(env,'UPDATE gk_parts SET revision=revision+1 WHERE id IN (?,?)',preview.source,preview.canonical),
    ...(also?.(preview.canonical) ?? []),
    stmt(env,'INSERT INTO gk_part_merges(id,source_id,canonical_id,preview,fingerprint,reason,approved_by,approved_at) VALUES (?,?,?,?,?,?,?,?)',id,preview.source,preview.canonical,JSON.stringify(preview),preview.fingerprint,reason,actor.id,now()),
  ],{actor:actor.id,action:'part.merge',subject:preview.canonical,detail:{source:preview.source,merge:id,fingerprint:preview.fingerprint,reason,...(proposal?{proposal}:{})}})
  return {id:preview.canonical,merge:id}
}
