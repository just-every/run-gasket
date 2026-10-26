import type { Bindings } from '../auth.server'
import { type Actor } from './actor'
import { all } from './core'
import { fromMilli } from './quantity'

// Receipt movements include inspection release and supplier returns. Work traces
// add issues and usable returns; damaged returns do not replenish their source.
export const SOURCE_BALANCE = `(SELECT COALESCE(SUM(quantity_milli),0) FROM gk_part_moves WHERE receipt_line_id=?) +
 (SELECT COALESCE(SUM(CASE WHEN q.return_id IS NULL THEN m.quantity_milli ELSE 0 END),0)
 FROM gk_controlled_moves c JOIN gk_part_moves m ON m.id=c.move_id LEFT JOIN gk_work_return_quarantine q ON q.return_id=m.id WHERE c.receipt_line_id=?)`

export async function stockSources(env: Bindings, actor: Actor, part?: string) {
  const rows = await all(env, `SELECT l.id,l.part_id,l.receipt_id,l.bin,l.lot,l.serial,original.expires_on,p.number,p.name,p.unit,
    (SELECT reason FROM gk_receipt_trace_holds WHERE receipt_line_id=l.id) AS reconciliationRequired,
    (SELECT COALESCE(SUM(quantity_milli),0) FROM gk_part_moves WHERE receipt_line_id=l.id) +
    (SELECT COALESCE(SUM(CASE WHEN q.return_id IS NULL THEN m.quantity_milli ELSE 0 END),0) FROM gk_controlled_moves c
      JOIN gk_part_moves m ON m.id=c.move_id LEFT JOIN gk_work_return_quarantine q ON q.return_id=m.id WHERE c.receipt_line_id=l.id) AS on_hand_milli
    FROM gk_stock_receipt_lines l JOIN gk_receipt_lines original ON original.id=l.id JOIN gk_parts p ON p.id=l.part_id
    ${part ? 'WHERE l.part_id=?' : ''} ORDER BY l.bin,l.lot,l.serial,l.id`, ...(part ? [part] : []))
  return rows.map(row => ({ ...row, onHand: fromMilli(row.on_hand_milli), expired: Boolean(row.expires_on && row.expires_on < actor.today) }))
}
