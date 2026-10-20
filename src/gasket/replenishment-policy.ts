import { canonicalPart } from './part-identity'
// PART-005: one current location per part until PART-001 adds bins/sites.
import type { Bindings } from '../auth.server'
import { can, capabilitySql, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import { isDate } from './dates'
import type { Input } from './input'
import { usdCents } from './purchase-policy'
import { fromMilli, toMilli } from './quantity'

export const CURRENT_REPLENISHMENT = `FROM gk_replenishment_policies h JOIN gk_replenishment_policy_revisions v ON v.part_id=h.part_id AND v.revision=h.current_revision AND NOT EXISTS(SELECT 1 FROM gk_part_canonical c WHERE c.part_id=h.part_id)`
export const activeOwnerSql = `EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND m.status='active' AND m.role='owner' AND o.status='active' AND o.role='owner')`
const session = (env: Bindings, actor: Actor, capability: 'register.manage'|'site.manage'|'work.review') => {
  requireCapability(actor, capability)
  const check = capabilitySql(actor.sessionId, capability)
  return guard(env, 'stale', check.sql, ...check.params)
}

export async function saveReplenishmentPolicy(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const part = await canonicalPart(env, input.text('part'))
  insist(part, 'part_not_found', 404)
  const previous = await one(env, 'SELECT * FROM gk_replenishment_policies WHERE part_id=?', part.id)
  const seen = input.integer('revision', { min: 0, optional: true }) ?? 0
  insist((previous?.current_revision ?? 0) === seen, 'stale', 409)
  const minimum = toMilli(input.text('minimum'), 'minimum', { allowZero: true }), maximum = toMilli(input.text('maximum'), 'maximum')
  const safety = toMilli(input.text('safetyStock'), 'safetyStock', { allowZero: true }), reorder = toMilli(input.text('reorderQuantity'), 'reorderQuantity')
  insist(maximum > minimum + safety, 'maximum_must_exceed_trigger')
  const supplier = input.text('supplier'), costCenter = input.text('costCenter'), purchaser = input.text('purchaser')
  const unitPrice = usdCents(input.text('unitPrice')), freight = usdCents(input.text('freight', { optional: true }) || '0'), salesTax = usdCents(input.text('salesTax', { optional: true }) || '0'), useTax = usdCents(input.text('useTax', { optional: true }) || '0'), taxNote = input.text('taxNote', { optional: true, max: 1000 }), envelope = input.text('envelope', { optional: true }) || null
  const snapshot = { part: part.id, location: part.location, minimum, maximum, safety, reorder, supplier, costCenter, purchaser, unitPrice, freight, salesTax, useTax, taxNote,
    leadDays: input.integer('leadDays', { max: 3650 })!, active: input.flag('active'), automatic: input.flag('automatic'), envelope }
  insist(!snapshot.automatic || envelope, 'automatic_envelope_required')
  const id = newId(), revision = seen + 1
  await commit(env, [session(env, actor, 'register.manage'),
    guard(env, 'stale', '(SELECT COALESCE(MAX(current_revision),0) FROM gk_replenishment_policies WHERE part_id=?)=?', part.id, seen),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_parts WHERE id=? AND location IS ?)', part.id, part.location),
    guard(env, 'supplier_inactive', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id=? AND active=1)', supplier),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_cost_centers WHERE id=? AND active=1)', costCenter),
    guard(env, 'stale', activeOwnerSql, purchaser),
    ...(envelope ? [...(!can(actor,'work.review') ? [guard(env, 'independently_approved_envelope_required', 'EXISTS(SELECT 1 FROM gk_replenishment_envelope_approvals WHERE envelope_id=?)', envelope)] : []), guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_replenishment_envelopes WHERE id=? AND supplier_id=? AND cost_center_id=?) AND NOT EXISTS(SELECT 1 FROM gk_replenishment_envelope_revocations WHERE envelope_id=?)', envelope, supplier, costCenter, envelope)] : []),
    stmt(env, 'INSERT INTO gk_replenishment_policies(part_id,current_revision) VALUES (?,?) ON CONFLICT(part_id) DO UPDATE SET current_revision=excluded.current_revision', part.id, revision),
    stmt(env, 'INSERT INTO gk_replenishment_policy_revisions(id,part_id,revision,snapshot,created_by,created_at) VALUES (?,?,?,?,?,?)', id, part.id, revision, JSON.stringify(snapshot), actor.id, now()),
    stmt(env, 'UPDATE gk_parts SET minimum_milli=? WHERE id=?', minimum, part.id)],
  { actor: actor.id, action: 'replenishment.policy', subject: part.id, detail: { revision, revisionId: id, snapshot } })
  return { id: part.id, revision, revisionId: id }
}

export async function saveReplenishmentEnvelope(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'site.manage')
  const id = newId(), supplier = input.text('supplier'), costCenter = input.text('costCenter'), from = input.text('from'), to = input.text('to')
  insist(isDate(from) && isDate(to) && from <= to, 'invalid_period')
  const perOrder = usdCents(input.text('perOrder')), periodLimit = usdCents(input.text('periodLimit')), reason = input.text('reason', { max: 2000 })
  insist(perOrder > 0 && periodLimit >= perOrder, 'invalid_envelope_limit')
  await commit(env, [session(env, actor, 'site.manage'),
    guard(env, 'supplier_inactive', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id=? AND active=1)', supplier),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_cost_centers WHERE id=? AND active=1)', costCenter),
    guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM gk_replenishment_envelopes e WHERE supplier_id=? AND cost_center_id=? AND from_on<=? AND to_on>=? AND NOT EXISTS(SELECT 1 FROM gk_replenishment_envelope_revocations r WHERE r.envelope_id=e.id))', supplier, costCenter, to, from),
    stmt(env, 'INSERT INTO gk_replenishment_envelopes(id,supplier_id,cost_center_id,from_on,to_on,per_order_cents,period_limit_cents,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, supplier, costCenter, from, to, perOrder, periodLimit, reason, actor.id, now())],
  { actor: actor.id, action: 'replenishment.envelope.propose', subject: id, detail: { supplier, costCenter, from, to, perOrderCents: perOrder, periodLimitCents: periodLimit, reason } })
  return { id }
}

export async function approveReplenishmentEnvelope(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.review')
  insist(input.flag('confirm'), 'confirmation_required')
  const envelope = await one(env, 'SELECT * FROM gk_replenishment_envelopes WHERE id=?', input.text('envelope'))
  insist(envelope, 'envelope_not_found', 404)
  insist(actor.id !== envelope.created_by, 'independent_approval_required', 403)
  const reason = input.text('reason', { max: 2000 })
  await commit(env, [session(env, actor, 'work.review'),
    guard(env, 'stale', "EXISTS(SELECT 1 FROM gk_members WHERE id=? AND status='active' AND role IN ('owner','supervisor') AND id<>?)", actor.id, envelope.created_by),
    guard(env, 'supplier_inactive', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id=? AND active=1)', envelope.supplier_id),
    guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM gk_replenishment_envelope_approvals WHERE envelope_id=?) AND NOT EXISTS(SELECT 1 FROM gk_replenishment_envelope_revocations WHERE envelope_id=?)', envelope.id, envelope.id),
    stmt(env, 'INSERT INTO gk_replenishment_envelope_approvals(envelope_id,approved_by,approved_at,reason) VALUES (?,?,?,?)', envelope.id, actor.id, now(), reason)],
  { actor: actor.id, action: 'replenishment.envelope.approve', subject: envelope.id, detail: { reason } })
  return { id: envelope.id }
}

export async function revokeReplenishmentEnvelope(env: Bindings, actor: Actor, input: Input) {
  const id = input.text('envelope'), reason = input.text('reason', { max: 2000 })
  await commit(env, [session(env, actor, 'site.manage'), stmt(env, 'INSERT INTO gk_replenishment_envelope_revocations(envelope_id,revoked_by,revoked_at,reason) VALUES (?,?,?,?)', id, actor.id, now(), reason)],
  { actor: actor.id, action: 'replenishment.envelope.revoke', subject: id, detail: { reason } })
  return { id }
}

/** Financial envelope fields follow BUY-003 visibility; metadata remains readable. */
export function visibleEnvelope(row: any, financial: boolean) {
  if (financial) return row
  const {per_order_cents: _order, period_limit_cents: _period, used_cents: _used, ...metadata} = row
  return metadata
}
export async function replenishmentEnvelopes(env: Bindings, actor: Actor) {
  requireCapability(actor,'board.read')
  const rows=await all(env, `SELECT e.*,a.approved_by,a.approved_at,r.revoked_at,m.name AS author,ap.name AS approver,
    (SELECT COALESCE(SUM(u.amount_cents),0) FROM gk_replenishment_envelope_uses u WHERE u.envelope_id=e.id AND u.booked_on BETWEEN e.from_on AND e.to_on) AS used_cents
    FROM gk_replenishment_envelopes e LEFT JOIN gk_replenishment_envelope_approvals a ON a.envelope_id=e.id LEFT JOIN gk_replenishment_envelope_revocations r ON r.envelope_id=e.id
    JOIN gk_members m ON m.id=e.created_by LEFT JOIN gk_members ap ON ap.id=a.approved_by ORDER BY e.created_at DESC,e.id`)
  return rows.map(row=>visibleEnvelope(row,can(actor,'work.review')))
}

export async function replenishmentSettings(env: Bindings, actor: Actor) {
  requireCapability(actor, 'board.read')
  const [policies,envelopes,parts,suppliers,costCenters,purchasers] = await Promise.all([
    all(env, `SELECT v.* ${CURRENT_REPLENISHMENT} ORDER BY v.part_id`),
    replenishmentEnvelopes(env,actor),
    all(env, 'SELECT id,number,name,unit,location FROM gk_parts ORDER BY number'), all(env, 'SELECT id,name,active FROM gk_suppliers ORDER BY name'),
    all(env, 'SELECT id,code,name FROM gk_cost_centers WHERE active=1 ORDER BY code'), all(env, "SELECT id,name FROM gk_members WHERE role='owner' AND status='active' ORDER BY name")])
  return { policies: policies.map(row => ({ ...row, snapshot: JSON.parse(row.snapshot), minimum: fromMilli(JSON.parse(row.snapshot).minimum) })), envelopes, parts, suppliers, costCenters, purchasers }
}
