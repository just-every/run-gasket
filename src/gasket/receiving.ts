// BUY-004: immutable delivery identity, approved revision, inspection and returns.
import type { Bindings } from '../auth.server'
import { capabilitySql, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from './core'
import { Input } from './input'
import { isDate } from './dates'
import { SOURCE_BALANCE } from './stock-sources'
import { purchaseOrderDetail } from './purchase-orders'
import { approvalRoute, completionStatements } from './purchase-authority'
import { fromMilli, toMilli } from './quantity'
import { RESERVED } from './reservations'
import { cents } from './valuation'
import { landedLines, portion, receiptStockMove, RECEIPT_BALANCE } from './receipt-stock'

const SENT = "('accepted','development','uncertain','unconfirmed')"
const authorized = (env: Bindings, actor: Actor) => { const check = capabilitySql(actor.sessionId, 'register.manage'); return guard(env, 'stale', check.sql, ...check.params) }
const replay = (row: Row, fingerprint: string) => { insist(row.fingerprint === fingerprint, 'receipt_identity_conflict', 409); return { id: row.order_id, receipt: row.id, replayed: true } }

function readLines(input: Input, facts: Row): Row[] {
  const fields = ['line','part','quantity','quarantine','bin','lot','serial','expiresOn']
  const columns = input.has('lines') ? null : Object.fromEntries(fields.map(field => [field, input.list(field, { keepEmpty: true })]))
  const raw = columns ? columns.line.map((_, i) => Object.fromEntries(fields.map(field => [field, columns[field][i] ?? '']))).filter(row => row.quantity !== '') : input.json('lines')
  insist(Array.isArray(raw) && raw.length > 0 && raw.length <= 100, 'invalid_receipt_lines')
  const lines = raw.map(value => {
    insist(value && typeof value === 'object' && !Array.isArray(value), 'invalid_receipt_line')
    const row = Input.of(value), line = row.integer('line', { min: 0, max: facts.lines.length-1 })!
    const quantity = toMilli(row.text('quantity', { max: 20 })), quarantine = toMilli(row.text('quarantine', { optional: true, max: 20 }) || '0', 'quarantine', { allowZero: true })
    const part = row.text('part', { optional: true, max: 100 }), bin = row.text('bin', { optional: true, max: 120 }), lot = row.text('lot', { optional: true, max: 120 }), serial = row.text('serial', { optional: true, max: 120 })
    insist(quarantine <= quantity, 'quarantine_exceeds_receipt')
    insist(facts.lines[line].kind === 'part' ? Boolean(part) : !part && !serial, 'receipt_part_required')
    insist(!serial || quantity === 1000, 'serial_requires_one_unit')
    const expiresOn = row.text('expiresOn', { optional: true, max: 10 })
    insist(!expiresOn || isDate(expiresOn), 'invalid_expiry')
    return { line, part: part || null, quantity, quarantine, bin, lot, serial, ...(expiresOn ? { expiresOn } : {}) }
  })
  for (const line of new Set(lines.map(row => row.line))) {
    const split = lines.filter(row => row.line === line)
    insist(new Set(split.map(row => row.part)).size === 1, 'receipt_line_part_mismatch')
  }
  return lines
}

export async function receivePurchaseOrder(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const orderId = input.text('order'), revisionId = input.text('revisionId'), externalId = input.text('externalId', { max: 200 })
  const revision = await one(env, 'SELECT * FROM gk_purchase_revisions WHERE id=? AND order_id=?', revisionId, orderId)
  insist(revision, 'purchase_revision_not_found', 404)
  const facts = JSON.parse(revision.snapshot), lines = readLines(input, facts)
  const freight = cents(input, 'freight') ?? 0, tax = cents(input, 'salesTax') ?? 0
  const note = input.text('note', { optional: true, max: 2000 }), backorderNote = input.text('backorderNote', { optional: true, max: 2000 })
  const file = await input.file('packingSlip', { optional: true, maxBytes: 1_500_000 })
  const evidence = file ? { filename: file.filename, mediaType: file.declaredType || 'application/octet-stream', sha256: await sha256Hex(file.bytes), size: file.bytes.length } : null
  const fingerprint = await sha256Hex(JSON.stringify({ orderId, revisionId, lines, freight, tax, note, backorderNote, evidence }))
  const existing = await one(env, 'SELECT * FROM gk_receipts WHERE supplier_id=? AND external_id=?', facts.supplier.id, externalId)
  if (existing) return replay(existing, fingerprint)
  const order = await purchaseOrderDetail(env, actor, orderId), selected = order.revisions.find((row: Row) => row.id === revisionId)!
  insist(selected.approval, 'approved_revision_required', 409)
  const sent = selected.send && ['accepted','development','uncertain','unconfirmed'].includes(selected.send.state)
  insist(sent || order.current.id === revisionId, 'superseded_unsent_revision', 409)
  const route = sent ? null : await approvalRoute(env, actor, order)
  insist(!route || route.complete && !route.blocked, 'approved_revision_required', 409)
  const id = newId(), statements = [authorized(env, actor),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_purchase_approvals WHERE revision_id=?)', revisionId),
    ...(route ? completionStatements(env, actor, order, route) : [guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_purchase_sends WHERE revision_id=? AND state IN ${SENT})`, revisionId)]),
    stmt(env, 'INSERT INTO gk_receipts(id,order_id,revision_id,supplier_id,external_id,fingerprint,freight_cents,sales_tax_cents,note,backorder_note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      id, orderId, revisionId, facts.supplier.id, externalId, fingerprint, freight, tax, note, backorderNote, actor.id, now())]
  landedLines(lines, facts, freight, tax)
  for (const index of new Set(lines.map(row => row.line))) {
    const split = lines.filter(row => row.line === index), quantity = split.reduce((sum,row) => sum + row.quantity, 0), part = split[0].part
    // Returns reopen the remaining order; quarantine is received, never usable.
    statements.push(guard(env, 'stale', `(SELECT COALESCE(SUM(l.quantity_milli),0) FROM gk_receipt_lines l JOIN gk_receipts r ON r.id=l.receipt_id WHERE r.revision_id=? AND l.line_index=?)
      -(SELECT COALESCE(SUM(e.quantity_milli),0) FROM gk_receipt_events e JOIN gk_receipt_lines l ON l.id=e.receipt_line_id JOIN gk_receipts r ON r.id=l.receipt_id WHERE r.revision_id=? AND l.line_index=? AND e.kind='return')+?<=?`,
    revisionId, index, revisionId, index, quantity, facts.lines[index].quantityMilli))
    if (part) statements.push(guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_parts WHERE id=? AND unit=?) AND NOT EXISTS(SELECT 1 FROM gk_receipt_lines l JOIN gk_receipts r ON r.id=l.receipt_id WHERE r.revision_id=? AND l.line_index=? AND l.part_id<>?)', part, facts.lines[index].unit, revisionId, index, part))
  }
  for (const row of lines) {
    const lineId = newId()
    if (row.serial) statements.push(guard(env, 'stale', "NOT EXISTS(SELECT 1 FROM gk_stock_receipt_lines WHERE part_id=? AND serial=?)", row.part, row.serial))
    statements.push(stmt(env, `INSERT INTO gk_receipt_lines(id,receipt_id,line_index,part_id,quantity_milli,quarantine_milli,bin,lot,serial,unit_price_cents,extended_cents,freight_cents,tax_cents,value_cents,quarantine_value_cents,quarantine_freight_cents,quarantine_tax_cents,expires_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      lineId,id,row.line,row.part,row.quantity,row.quarantine,row.bin,row.lot,row.serial,row.unitPrice,row.extended,row.freight,row.tax,row.value,row.quarantineValue,row.quarantineFreight,row.quarantineTax,row.expiresOn ?? ''))
    if (row.part && row.quantity > row.quarantine) statements.push(receiptStockMove(env, actor.id,
      { id: lineId, receipt_id: id, part_id: row.part, unit_price_cents: row.unitPrice, bin: row.bin, lot: row.lot, serial: row.serial },
      'receive', row.quantity-row.quarantine, row.value-row.quarantineValue, row.freight-row.quarantineFreight, row.tax-row.quarantineTax))
  }
  if (file && evidence) statements.push(stmt(env, 'INSERT INTO gk_receipt_evidence(id,receipt_id,filename,media_type,size,sha256,bytes,added_by,added_at) VALUES (?,?,?,?,?,?,?,?,?)', newId(),id,evidence.filename,evidence.mediaType,evidence.size,evidence.sha256,file.bytes,actor.id,now()))
  try { await commit(env, statements, { actor: actor.id, action: 'purchase.receive', subject: orderId, detail: { receipt: id, revisionId, externalId, fingerprint, evidence } }) }
  catch (error) {
    const concurrent = await one(env, 'SELECT * FROM gk_receipts WHERE supplier_id=? AND external_id=?', facts.supplier.id, externalId)
    if (concurrent) return replay(concurrent, fingerprint)
    throw error
  }
  return { id: orderId, receipt: id, replayed: false }
}

export async function inspectReceipt(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const line = await one(env, `${RECEIPT_BALANCE} WHERE l.id=? GROUP BY l.id`, input.text('receiptLine'))
  insist(line, 'receipt_line_not_found', 404)
  const kind = input.text('kind'), source = input.text('source'), quantity = toMilli(input.text('quantity', { max: 20 })), reason = input.text('reason', { max: 2000 })
  insist(kind === 'release' || kind === 'return', 'invalid_inspection_kind')
  insist(source === 'quarantine' || source === 'usable', 'invalid_inspection_source')
  insist(kind !== 'release' || source === 'quarantine', 'release_requires_quarantine')
  insist(!line.serial || quantity === 1000, 'serial_requires_one_unit')
  const quarantine = source === 'quarantine', held = quarantine ? line.held_quarantine_milli : line.usable_milli
  insist(quantity <= held, 'receipt_quantity_unavailable', 409)
  const value = quarantine ? portion(line.held_quarantine_value, quantity, held) : 0
  const freight = quarantine ? portion(line.held_quarantine_freight, quantity, held) : 0, tax = quarantine ? portion(line.held_quarantine_tax, quantity, held) : 0
  const id = newId(), receipt = await one(env, 'SELECT order_id FROM gk_receipts WHERE id=?', line.receipt_id)
  const statements = [authorized(env, actor), guard(env, 'stale', '(SELECT COUNT(*) FROM gk_receipt_events WHERE receipt_line_id=?)=?', line.id, line.event_count)]
  let stockValue = kind === 'release' ? value : 0
  if (!quarantine && line.part_id) {
    statements.push(guard(env, 'receipt_quantity_unavailable', `${SOURCE_BALANCE} >= ?`, line.id, line.id, quantity))
    const stock = await one(env, `SELECT COALESCE(SUM(quantity_milli),0) AS quantity,COALESCE(SUM(value_cents),0) AS value,COALESCE(MAX(seq),0) AS seen FROM gk_stock_moves WHERE part_id=?`, line.part_id)
    insist(stock.quantity >= quantity, 'insufficient_stock', 409)
    stockValue = -portion(stock.value, quantity, stock.quantity)
    statements.push(guard(env, 'stale', '(SELECT COALESCE(MAX(seq),0) FROM gk_stock_moves WHERE part_id=?)=?', line.part_id, stock.seen),
      guard(env, 'insufficient_stock', `(SELECT COALESCE(SUM(quantity_milli),0) FROM gk_stock_moves WHERE part_id=?)-(SELECT ${RESERVED} FROM gk_parts p WHERE p.id=?)>=?`, line.part_id, line.part_id, quantity))
  }
  statements.push(stmt(env, `INSERT INTO gk_receipt_events(id,receipt_line_id,kind,source,quantity_milli,usable_delta,quarantine_delta,usable_value_cents,quarantine_value_cents,quarantine_freight_cents,quarantine_tax_cents,reason,actor,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,line.id,kind,source,quantity,kind === 'release' ? quantity : quarantine ? 0 : -quantity,quarantine ? -quantity : 0,stockValue,quarantine ? -value : 0,quarantine ? -freight : 0,quarantine ? -tax : 0,reason,actor.id,now()))
  if (line.part_id && (kind === 'release' || !quarantine)) statements.push(receiptStockMove(env, actor.id, line, kind === 'release' ? 'release' : 'supplier_return', kind === 'release' ? quantity : -quantity, stockValue, kind === 'release' ? freight : 0, kind === 'release' ? tax : 0))
  await commit(env, statements, { actor: actor.id, action: `purchase.receipt.${kind}`, subject: receipt.order_id, detail: { event: id, receipt: line.receipt_id, receiptLine: line.id, source, quantity: fromMilli(quantity), valueCents: quarantine ? value : -stockValue, reason } })
  return { id: receipt.order_id, receipt: line.receipt_id, event: id }
}

function quantities(row: Row) {
  return { ...row, quantity: fromMilli(row.quantity_milli), usable: fromMilli(row.usable_milli), quarantine: fromMilli(row.held_quarantine_milli), returned: fromMilli(row.returned_milli) }
}

export async function receiptDetail(env: Bindings, _actor: Actor, id: string) {
  const receipt = await one(env, `SELECT r.*,v.revision,v.snapshot,m.name AS created_by_name FROM gk_receipts r JOIN gk_purchase_revisions v ON v.id=r.revision_id JOIN gk_members m ON m.id=r.created_by WHERE r.id=?`, id)
  insist(receipt, 'receipt_not_found', 404)
  const lines = await all(env, `${RECEIPT_BALANCE} WHERE l.receipt_id=? GROUP BY l.id ORDER BY l.line_index,l.seq`, id)
  for (const line of lines) line.expires_on = (await one(env, 'SELECT expires_on FROM gk_receipt_lines WHERE id=?', line.id))!.expires_on
  const events = await all(env, `SELECT e.*,m.name AS actor_name FROM gk_receipt_events e JOIN gk_receipt_lines l ON l.id=e.receipt_line_id JOIN gk_members m ON m.id=e.actor WHERE l.receipt_id=? ORDER BY e.seq`, id)
  const evidence = await all(env, 'SELECT id,filename,media_type,size,sha256,added_by,added_at FROM gk_receipt_evidence WHERE receipt_id=? ORDER BY id', id)
  return { ...receipt, snapshot: JSON.parse(receipt.snapshot), lines: lines.map(line => ({ ...quantities(line), events: events.filter(event => event.receipt_line_id === line.id).map(event => ({ ...event, quantity: fromMilli(event.quantity_milli) })) })), evidence }
}

export async function receiptList(env: Bindings, actor: Actor, orderId?: string) {
  const receipts = await all(env, `SELECT id FROM gk_receipts ${orderId ? 'WHERE order_id=?' : ''} ORDER BY seq DESC`, ...(orderId ? [orderId] : []))
  return await Promise.all(receipts.map(row => receiptDetail(env, actor, row.id)))
}

export async function purchaseReceiving(env: Bindings, actor: Actor, orderId: string) {
  const order = await purchaseOrderDetail(env, actor, orderId), receipts = await receiptList(env, actor, orderId)
  const revisions = order.revisions.map((revision: Row) => ({ id: revision.id, revision: revision.revision, approved: Boolean(revision.approval),
    receivable: Boolean(revision.approval && (revision.send && ['accepted','development','uncertain','unconfirmed'].includes(revision.send.state) || revision.id === order.current.id && order.route.complete && !order.route.blocked)),
    lines: revision.snapshot.lines.map((line: Row, index: number) => {
      const rows = receipts.filter(receipt => receipt.revision_id === revision.id).flatMap(receipt => receipt.lines.filter((row: Row) => row.line_index === index))
      const sum = (key: string) => rows.reduce((total,row) => total + row[key], 0), received = sum('quantity_milli'), returned = sum('returned_milli'), outstanding = line.quantityMilli-received+returned
      return { ...line, line: index, ordered: fromMilli(line.quantityMilli), received: fromMilli(received), usable: fromMilli(sum('usable_milli')), quarantine: fromMilli(sum('held_quarantine_milli')), returned: fromMilli(returned), outstanding: fromMilli(outstanding), backorder: fromMilli(outstanding) }
    }) }))
  return { orderId, revisions, receipts }
}

export async function receiptEvidence(env: Bindings, _actor: Actor, id: string) {
  const file = await one(env, 'SELECT filename,media_type,bytes FROM gk_receipt_evidence WHERE id=?', id)
  insist(file, 'receipt_evidence_not_found', 404)
  return new Response(new Uint8Array(file.bytes), { headers: { 'content-type': file.media_type, 'content-disposition': `attachment; filename="${file.filename.replace(/["\\]/g, '_')}"`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } })
}
