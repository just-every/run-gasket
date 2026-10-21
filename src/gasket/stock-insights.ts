// AGENT-006: deterministic evidence for human review, never an inferred movement.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all, type Row } from './core'
import { addDays, zonedInstant } from './dates'
import { canonicalSql } from './part-identity'
import { partDetail } from './parts'
import { evaluateReplenishment } from './replenishment-state'
import { fromMilli } from './quantity'

export async function stockInsights(env: Bindings, actor: Actor, id: string) {
  // Same member/record admission as the existing part read door.
  const part = await partDetail(env, actor, id)
  const duplicates = await all(env, `SELECT DISTINCT p.id,p.number,p.name,p.unit,
      a.id AS source_item,b.id AS candidate_item,a.manufacturer,a.manufacturer_number
    FROM gk_supplier_items a JOIN gk_supplier_items b
      ON lower(trim(a.manufacturer))=lower(trim(b.manufacturer))
      AND lower(trim(a.manufacturer_number))=lower(trim(b.manufacturer_number))
    JOIN gk_parts p ON p.id=${canonicalSql('b.part_id')}
    WHERE ${canonicalSql('a.part_id')}=? AND p.id<>?
      AND trim(COALESCE(a.manufacturer,''))<>'' AND trim(COALESCE(a.manufacturer_number,''))<>''
    ORDER BY p.number,p.id,a.id,b.id`, part.id, part.id)
  const from = addDays(actor.today, -29), previousFrom = addDays(actor.today, -59), through = addDays(actor.today, 1)
  const start = zonedInstant(actor.zone, `${from}T00:00`), previousStart = zonedInstant(actor.zone, `${previousFrom}T00:00`), end = zonedInstant(actor.zone, `${through}T00:00`)
  // Gross issues measure usage; returns remain separately cited, never erase an issue.
  const movements: Row[] = part.moves
  const issues = movements.filter(move => move.kind === 'issue' && move.at >= previousStart && move.at < end)
  const recent = issues.filter(move => move.at >= start), previous = issues.filter(move => move.at < start)
  const used = (rows: typeof issues) => -rows.reduce((sum, move) => sum + move.quantity_milli, 0)
  const currentUse = used(recent), previousUse = used(previous)
  const variances = movements.filter(move => move.kind === 'count' && move.quantity_milli !== 0)
  const row = (await evaluateReplenishment(env, actor.today)).find(row => row.part.id === part.id)
  const estimate = row ? (BigInt(row.quantityMilli) * BigInt(row.policy.unitPrice) + 500n) / 1000n : null
  const replenishment = row ? {
    policyRevision: row.id, active: row.eligible, minimum: fromMilli(row.policy.minimum), safetyStock: fromMilli(row.policy.safety),
    maximum: fromMilli(row.policy.maximum), incoming: row.incoming,
    orders: row.documents.map(doc => ({ id: doc.order_id, revision: doc.revision_id, number: doc.number, due: doc.due_on,
      outstanding: doc.outstanding, received: doc.received, returned: doc.returned, quarantine: doc.quarantine,
      late: doc.overdue, changed: doc.changed, href: `/api/gasket/purchase-orders/${doc.order_id}` })),
    quantity: row.proposed,
    // Policy unit-price estimate excludes freight/taxes and is never authorized spend.
    estimateCents: estimate !== null && estimate <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(estimate) : null,
    below: row.below,
  } : null
  return {
    part: { id: part.id, number: part.number, unit: part.unit, onHand: part.onHand, reserved: part.reserved, available: part.available, valueCents: part.valueCents, seen: part.seen },
    duplicates: duplicates.map(row => ({ ...row, sameStockingUnit: row.unit === part.unit, href: `/api/gasket/parts/${row.id}` })),
    demand: { from, to: actor.today, previousFrom, previousTo: addDays(from, -1), zone: actor.zone,
      issued: fromMilli(currentUse), previousIssued: fromMilli(previousUse),
      increased: previousUse > 0 ? currentUse > previousUse * 2 : null,
      issues: issues.map(move => ({ id: move.id, workOrder: move.work_order_id, quantity: move.quantity, valueCents: move.value_cents, at: move.at })) },
    countVariances: variances.map(move => ({ id: move.id, counted: move.counted, quantity: move.quantity, valueCents: move.value_cents, at: move.at })),
    replenishment,
    risks: [
      ...(duplicates.length ? ['possible_duplicate_identity'] : []),
      ...(variances.length ? ['count_variance_requires_physical_investigation'] : []),
      ...(previousUse > 0 && currentUse > previousUse * 2 ? ['gross_issues_more_than_doubled'] : []),
      ...(row?.eligible && row.below ? ['available_at_or_below_reorder_trigger'] : []),
      ...(row?.documents.some(doc => doc.overdue && !doc.changed) ? ['late_outstanding_purchase'] : []),
      ...(row?.documents.some(doc => doc.changed) ? ['purchase_revision_requires_review'] : []),
    ],
    boundary: 'Read-only review evidence. Matching manufacturer and number suggest a duplicate, not equivalence. Count variance does not identify a missing movement. Demand compares gross issues in two adjacent 30-site-day windows; no prior usage means unknown trend. Replenishment uses the current policy and includes unchanged outstanding orders even when late: follow up before ordering again. Estimates exclude freight and tax, authorize no spend and promise no delivery. Bills, bin reconciliation and executable bin/reorder proposals are unavailable. Staff physically count and receive; independent authorized humans decide adjustments and merges.',
  }
}
