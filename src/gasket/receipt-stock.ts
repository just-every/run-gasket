// Exact landed allocation and the existing usable-stock ledger bridge.
import type { Bindings } from '../auth.server'
import { insist, newId, now, stmt, type Row } from './core'

export function safeCents(value: bigint): number {
  insist(value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER), 'receipt_amount_too_large')
  return Number(value)
}

export function portion(value: number, quantity: number, total: number): number {
  insist([value, quantity, total].every(Number.isSafeInteger) && value >= 0 && quantity >= 0 && total > 0 && quantity <= total, 'invalid_receipt_value')
  return safeCents((2n * BigInt(value) * BigInt(quantity) + BigInt(total)) / (2n * BigInt(total)))
}

/** Largest remainder, ties by entered position; the allocated cents sum exactly. */
export function allocate(value: number, weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + BigInt(weight), 0n)
  insist(total > 0n || value === 0, 'charges_require_line_value')
  if (!total) return weights.map(() => 0)
  const shares = weights.map((weight, index) => ({ index, cents: BigInt(value) * BigInt(weight) / total, remainder: BigInt(value) * BigInt(weight) % total }))
  let left = BigInt(value) - shares.reduce((sum, share) => sum + share.cents, 0n)
  for (const share of [...shares].sort((a,b) => a.remainder === b.remainder ? a.index-b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (!left) break
    share.cents++; left--
  }
  return shares.map(share => safeCents(share.cents))
}

/** A delivery extends each PO line once, then divides it among bin/lot splits. */
export function landedLines(lines: Row[], facts: Row, freight: number, tax: number) {
  const groups = [...new Set(lines.map(line => line.line))].sort((a,b) => a-b).map(index => {
    const rows = lines.filter(line => line.line === index), quantity = rows.reduce((sum,row) => sum + row.quantity, 0)
    return { rows, extended: safeCents((BigInt(facts.lines[index].unitPriceCents) * BigInt(quantity) + 500n) / 1000n) }
  })
  const freights = allocate(freight, groups.map(group => group.extended)), taxes = allocate(tax, groups.map(group => group.extended))
  groups.forEach((group, index) => {
    const quantities = group.rows.map(row => row.quantity)
    const extended = allocate(group.extended, quantities), splitFreight = allocate(freights[index], quantities), splitTax = allocate(taxes[index], quantities)
    group.rows.forEach((row, i) => {
      row.unitPrice = facts.lines[row.line].unitPriceCents
      row.extended = extended[i]; row.freight = splitFreight[i]; row.tax = splitTax[i]
      row.value = safeCents(BigInt(row.extended) + BigInt(row.freight) + BigInt(row.tax))
      row.quarantineValue = portion(row.value, row.quarantine, row.quantity)
      row.quarantineFreight = portion(row.freight, row.quarantine, row.quantity)
      row.quarantineTax = portion(row.tax, row.quarantine, row.quantity)
    })
  })
  safeCents(lines.reduce((sum,row) => sum + BigInt(row.value), 0n))
}

/** Supplier returns are negative receipts; work-order returns retain their own kind. */
export function receiptStockMove(env: Bindings, actor: string, line: Row, event: 'receive' | 'release' | 'supplier_return', quantity: number, value: number, freight = 0, tax = 0) {
  return stmt(env, `INSERT INTO gk_part_moves(id,part_id,kind,quantity_milli,value_cents,unit_price_cents,freight_cents,tax_cents,note,actor,at,receipt_line_id,receipt_event)
    VALUES (?,?,'receive',?,?,?,?,?,?,?,?,?,?)`, newId(), line.part_id, quantity, value, line.unit_price_cents, freight, tax,
    `PO receipt ${line.receipt_id}: ${event}; bin ${line.bin || 'unspecified'}; lot ${line.lot || 'none'}; serial ${line.serial || 'none'}`, actor, now(), line.id, event)
}

export const RECEIPT_BALANCE = `SELECT l.*,
 l.quantity_milli-l.quarantine_milli+COALESCE(SUM(e.usable_delta),0) AS usable_milli,
 l.quarantine_milli+COALESCE(SUM(e.quarantine_delta),0) AS held_quarantine_milli,
 l.quarantine_value_cents+COALESCE(SUM(e.quarantine_value_cents),0) AS held_quarantine_value,
 l.quarantine_freight_cents+COALESCE(SUM(e.quarantine_freight_cents),0) AS held_quarantine_freight,
 l.quarantine_tax_cents+COALESCE(SUM(e.quarantine_tax_cents),0) AS held_quarantine_tax,
 COALESCE(SUM(CASE WHEN e.kind='return' THEN e.quantity_milli ELSE 0 END),0) AS returned_milli,
 COUNT(e.id) AS event_count FROM gk_receipt_lines l LEFT JOIN gk_receipt_events e ON e.receipt_line_id=l.id`
