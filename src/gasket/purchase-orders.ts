// BUY-002: every approval and email refers to one immutable, numbered revision.
import type { Bindings } from '../auth.server'
import { localDevelopment, operatorMail } from '../mail.server.mjs'
import { can, capabilitySql, requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { purchaseFacts, purchaseFiles, purchaseLinks } from './quotes'
import { approvalRoute, approvalStepStatements, completionStatements, routeGuardStatements } from './purchase-authority'
import { buyer, supplierDetail } from './suppliers'

export async function purchaseOrders(env: Bindings, actor: Actor) {
  const rows = (await all(env, `SELECT p.*,r.id AS revision_id,r.snapshot,m.name AS initiator,
    a.approved_by,a.approved_at,s.state AS send_state FROM gk_purchase_orders p
    JOIN gk_purchase_revisions r ON r.order_id=p.id AND r.revision=p.current_revision
    JOIN gk_members m ON m.id=p.created_by LEFT JOIN gk_purchase_approvals a ON a.revision_id=r.id
    LEFT JOIN gk_purchase_sends s ON s.revision_id=r.id ORDER BY p.number DESC`)).map(row => ({ ...row, snapshot: JSON.parse(row.snapshot) }))
  return await Promise.all(rows.map(async row => { const detail=await purchaseOrderDetail(env,actor,row.id); return {...row, routeComplete:detail.route.complete, routeBlocked:detail.route.blocked, authorityLabel:detail.route.authorityLabel} }))
}

export async function purchaseOrderDetail(env: Bindings, actor: Actor, id: string) {
  const order = await one(env, 'SELECT p.*,m.name AS initiator FROM gk_purchase_orders p JOIN gk_members m ON m.id=p.created_by WHERE p.id=?', id)
  insist(order, 'purchase_order_not_found', 404)
  const revisions = await all(env, `SELECT r.*,m.name AS author FROM gk_purchase_revisions r JOIN gk_members m ON m.id=r.created_by WHERE r.order_id=? ORDER BY r.revision`, id)
  const history = await Promise.all(revisions.map(async row => ({ ...row, snapshot: JSON.parse(row.snapshot),
    approval: await one(env, 'SELECT a.*,m.name AS approver FROM gk_purchase_approvals a JOIN gk_members m ON m.id=a.approved_by WHERE a.revision_id=?', row.id),
    send: await one(env, 'SELECT s.*,m.name AS sender FROM gk_purchase_sends s JOIN gk_members m ON m.id=s.claimed_by WHERE s.revision_id=?', row.id),
    stepApprovals: await all(env, `SELECT a.id,a.step_id,a.principal_id,a.effective_id,a.delegation_revision_id,a.approved_by,a.approved_at,a.note,m.name AS approver,p.name AS principal FROM gk_purchase_step_approvals a JOIN gk_members m ON m.id=a.approved_by JOIN gk_members p ON p.id=a.principal_id WHERE a.revision_id=? ORDER BY a.approved_at,a.id`, row.id),
    emergencies: await all(env, 'SELECT e.id,e.reason,e.approved_by,e.confirmed_at,m.name AS approver FROM gk_purchase_emergency_overrides e JOIN gk_members m ON m.id=e.approved_by WHERE e.revision_id=? ORDER BY e.confirmed_at,e.id', row.id),
    release: await one(env, 'SELECT id,reason,released_by,released_at FROM gk_purchase_commitment_releases WHERE revision_id=?', row.id),
    acknowledgments: await all(env, `SELECT a.*,m.name AS recorder FROM gk_purchase_acknowledgments a JOIN gk_purchase_sends s ON s.id=a.send_id
      JOIN gk_members m ON m.id=a.recorded_by WHERE s.revision_id=? ORDER BY a.recorded_at,a.id`, row.id) })))
  const current = history.find(row => row.revision === order.current_revision)!
  const approver = await one(env, "SELECT id FROM gk_members WHERE status='active' AND role IN ('owner','supervisor') AND id NOT IN (?,?) LIMIT 1", order.created_by, current.created_by)
  const raw = await approvalRoute(env, actor, { ...order, current })
  const route = can(actor,'work.review') ? raw : {
    revisionId: raw.revisionId, legacy: raw.legacy, complete: raw.complete, blocked: raw.blocked, blockedReasons: raw.blockedReasons, authorityLabel: raw.authorityLabel,
    required: raw.required.map(step => ({id:step.id,principal:step.principal,effective:step.effective,principalId:step.principalId,effectiveId:step.effectiveId,eligible:step.eligible,
      approval:step.approval?{approved_by:step.approval.approved_by,approved_at:step.approval.approved_at,note:step.approval.note}:null,
      delegation:step.delegation?{from_on:step.delegation.from_on,to_on:step.delegation.to_on,reason:step.delegation.reason}:null})),
    emergency:raw.emergency?{approved_by:raw.emergency.approved_by,confirmed_at:raw.emergency.confirmed_at,reason:raw.emergency.reason}:null,
    release:raw.release?{reason:raw.release.reason,released_by:raw.release.released_by,released_at:raw.release.released_at}:null,
  }
  return { ...order, revisions: history, current, route, approvalAvailable: raw.legacy ? Boolean(approver) : raw.required.every(step=>step.eligible) }
}

export async function savePurchaseOrder(env: Bindings, actor: Actor, input: Input) {
  buyer(actor)
  const existingId = input.text('order', { optional: true }), id = existingId || newId()
  const existing = existingId ? await purchaseOrderDetail(env, actor, id) : null
  const seen = existing ? input.integer('revision', { min: 1 })! : 0
  insist(!existing || seen === existing.current_revision, 'stale', 409)
  const supplier = await supplierDetail(env, input.text('supplier')); insist(supplier.active, 'supplier_inactive', 409)
  const files = await purchaseFiles(env, actor, input, { order: id })
  const quotes = input.list('quote'), selected = input.text('selectedQuote', { optional: true })
  insist(quotes.length <= 20 && new Set(quotes).size === quotes.length && (!selected || quotes.includes(selected)), 'invalid_quotes')
  const compared = await Promise.all(quotes.map(async quoteId => {
    const row = await one(env, 'SELECT id,snapshot FROM gk_quotes WHERE id=?', quoteId); insist(row, 'quote_not_found', 404)
    return { id: row.id, ...JSON.parse(row.snapshot) }
  }))
  insist(!selected || compared.find(quote => quote.id === selected)?.supplier.id === supplier.id, 'quote_supplier_mismatch')
  const snapshot = { supplier, ...purchaseFacts(input), ...await purchaseLinks(env, input),
    reason: input.text('reason', { max: 2000 }), comparisonNote: input.text('comparisonNote', { optional: true, max: 2000 }),
    quotes: compared, selectedQuote: selected || null, attachments: [...(existing?.current.snapshot.attachments ?? []), ...files.metadata] }
  insist(snapshot.attachments.length <= 20, 'too_many_attachments')
  const revisionId = newId(), revision = seen + 1, authority = capabilitySql(actor.sessionId, 'site.manage')
  await commit(env, [guard(env, 'stale', authority.sql, ...authority.params),
    guard(env, 'supplier_inactive', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id=? AND active=1 AND revision=?)', supplier.id, supplier.revision),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_cost_centers WHERE id=? AND active=1)', snapshot.costCenter.id),
    ...(existing ? [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_purchase_orders WHERE id=? AND current_revision=?)', id, seen),
      stmt(env, 'UPDATE gk_purchase_orders SET current_revision=? WHERE id=?', revision, id)] :
      [stmt(env, 'INSERT INTO gk_purchase_orders(id,number,current_revision,created_by,created_at) VALUES (?,(SELECT COALESCE(MAX(number),0)+1 FROM gk_purchase_orders),1,?,?)', id, actor.id, now())]),
    stmt(env, 'INSERT INTO gk_purchase_revisions(id,order_id,revision,snapshot,created_by,created_at) VALUES (?,?,?,?,?,?)', revisionId, id, revision, JSON.stringify(snapshot), actor.id, now()), ...files.statements],
  { actor: actor.id, action: 'purchase.revise', subject: id, detail: { revision, revisionId, totalCents: snapshot.totalCents, quoteIds: quotes } })
  return { id, revision, revisionId }
}

export async function approvePurchaseOrder(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.review')
  const order = await purchaseOrderDetail(env, actor, input.text('order')), current = order.current
  insist(order.created_by !== actor.id && current.created_by !== actor.id, 'independent_approval_required', 403)
  const route = await approvalRoute(env, actor, order)
  insist(!(route.legacy && current.approval), 'approval_authority_changed_revise_order', 409)
  insist(input.integer('revision', { min: 1 }) === order.current_revision && !route.complete, 'stale', 409)
  const authority = capabilitySql(actor.sessionId, 'work.review'), id = newId(), note = input.text('note', { optional: true, max: 1000 })
  const base = [guard(env, 'stale', authority.sql, ...authority.params),
    guard(env, 'supplier_inactive', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id=? AND active=1)', current.snapshot.supplier.id)]
  const marker = () => stmt(env, 'INSERT INTO gk_purchase_approvals(id,revision_id,approved_by,approved_at,note) VALUES (?,?,?,?,?)', id, current.id, actor.id, now(), note)
  let selected: string | null = null
  if (route.legacy) {
    base.push(guard(env, 'stale', `NOT EXISTS(SELECT 1 FROM gk_purchase_approvals WHERE revision_id=?)`, current.id), marker(),
      ...await completionStatements(env, actor, order, route))
  } else {
    selected = input.text('step', { optional: true }) || route.required.find(step => !step.approval && step.effectiveId === actor.id)?.id || null
    insist(selected, 'approval_step_required', 403)
    base.push(...await approvalStepStatements(env, actor, order, route, selected, note))
    if (route.required.filter(step => !step.approval).length === 1) {
      base.push(...await completionStatements(env, actor, order, route))
      if (!current.approval) base.push(marker())
    }
  }
  await commit(env, base, { actor: actor.id, action: 'purchase.approve', subject: order.id,
    detail: { revision: order.current_revision, revisionId: current.id, step: selected, totalCents: current.snapshot.totalCents, note } })
  return { id: order.id, approval: id, step: selected }
}

const dollars = (value: number) => `$${(value / 100).toFixed(2)}`
function orderMessage(number: number, revision: number, facts: any) {
  const address = facts.supplier.shipTo
  return [`PO-${number} revision ${revision} · USD`, `Supplier: ${facts.supplier.name}`, `Ship to: ${address.street}, ${address.city}, ${address.state} ${address.zip}, US`,
    `Delivery promised: ${facts.deliveryOn}`, `Payment terms: ${facts.supplier.payment_terms}`, `Cost center: ${facts.costCenter.code}`,
    ...(facts.work ? [`Work: WO-${facts.work.number} ${facts.work.title}`] : []), ...(facts.asset ? [`Asset: ${facts.asset.tag} ${facts.asset.name}`] : []),
    ...facts.lines.map((line: any) => `${line.kind}: ${line.description} · ${line.quantity} ${line.unit} × ${dollars(line.unitPriceCents)} = ${dollars(line.extendedCents)}`),
    `Subtotal ${dollars(facts.subtotalCents)}`, `Freight ${dollars(facts.freightCents)}`, `Sales tax ${dollars(facts.salesTaxCents)}`, `Total payable ${dollars(facts.totalCents)}`,
    `Buyer use tax ${dollars(facts.useTaxCents)} (accounted for by buyer; excluded from vendor payable)`, `Tax treatment: ${facts.taxTreatment} ${facts.taxNote}`, `Reason: ${facts.reason}`].join('\n')
}

export async function sendPurchaseOrder(env: Bindings, actor: Actor, input: Input) {
  buyer(actor)
  const order = await purchaseOrderDetail(env, actor, input.text('order')), current = order.current
  insist(input.integer('revision', { min: 1 }) === order.current_revision, 'stale', 409)
  if (current.send) return { id: order.id, send: current.send.id, state: current.send.state, replay: true }
  const route = await approvalRoute(env, actor, order)
  insist(route.complete, 'approval_required', 409)
  const automatic = !current.approval && !route.legacy && !route.required.length
  insist(current.approval || automatic, 'approval_required', 409)
  const approvalId = current.approval?.id ?? newId()
  const sender = operatorMail(env); insist(sender, 'mail_not_configured', 409)
  const from = env.MAIL_FROM || (localDevelopment(env) || env.RER_DEMO === '1' ? 'Gasket <local@example.test>' : '')
  insist(from, 'mail_not_configured', 409)
  const recipient = current.snapshot.supplier.email, id = newId(), authority = capabilitySql(actor.sessionId, 'site.manage')
  const attachments = await Promise.all(current.snapshot.attachments.map(async (file: any) => {
    const row = await one(env, 'SELECT bytes FROM gk_purchase_files WHERE id=? AND order_id=?', file.id, order.id)
    insist(row, 'attachment_not_found', 404)
    return { filename: file.filename, contentType: file.mediaType, content: new Uint8Array(row.bytes) }
  }))
  await commit(env, [guard(env, 'stale', authority.sql, ...authority.params),
    guard(env, 'stale', `EXISTS(SELECT 1 FROM gk_purchase_orders WHERE id=? AND current_revision=?) AND NOT EXISTS(SELECT 1 FROM gk_purchase_sends WHERE revision_id=?)`, order.id, order.current_revision, current.id),
    guard(env, 'supplier_inactive', 'EXISTS(SELECT 1 FROM gk_suppliers WHERE id=? AND active=1)', current.snapshot.supplier.id),
    ...await routeGuardStatements(env, order, route),
    ...await completionStatements(env, actor, order, route),
    ...(automatic ? [stmt(env, `INSERT INTO gk_purchase_approvals(id,revision_id,approved_by,approved_at,note,authority_kind) VALUES (?,?,?,?,?,'threshold')`, approvalId, current.id, actor.id, now(), 'Policy threshold authorization; no manual approval')] : []),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_purchase_approvals WHERE id=? AND revision_id=?)', approvalId, current.id),
    stmt(env, "INSERT INTO gk_purchase_sends(id,revision_id,approval_id,recipient,state,claimed_by,claimed_at) VALUES (?,?,?,?,'unconfirmed',?,?)", id, current.id, approvalId, recipient, actor.id, now())],
  { actor: actor.id, action: 'purchase.send.claim', subject: order.id, detail: { send: id, revision: order.current_revision, approval: approvalId, recipient } })
  // Claim first. A crash, uncertain result or replay never sends a second email.
  let state: string, provider: string | null = null, providerId: string | null = null, error: string | null = null
  try {
    const text = orderMessage(order.number, order.current_revision, current.snapshot)
    const escaped = text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))
    const message = { deliveryId: id, from, to: [recipient], subject: `PO-${order.number} revision ${order.current_revision}`, text, html: `<pre>${escaped}</pre>`, headers: {}, attachments }
    const result = await sender.send(message)
    state = result.status; provider = result.provider; providerId = result.providerMessageId; error = result.code ?? null
  } catch { state = 'uncertain'; error = 'mail_submission_unconfirmed' }
  await commit(env, [stmt(env, 'UPDATE gk_purchase_sends SET state=?,provider=?,provider_message_id=?,error=?,finished_at=? WHERE id=?', state, provider, providerId, error, now(), id)],
  { actor: actor.id, action: 'purchase.send.result', subject: order.id, detail: { send: id, revision: order.current_revision, state, provider, providerMessageId: providerId, error } })
  return { id: order.id, send: id, state }
}

export async function acknowledgePurchaseOrder(env: Bindings, actor: Actor, input: Input) {
  buyer(actor)
  const send = await one(env, 'SELECT s.*,r.order_id FROM gk_purchase_sends s JOIN gk_purchase_revisions r ON r.id=s.revision_id WHERE s.id=?', input.text('send'))
  insist(send, 'send_not_found', 404)
  insist(['accepted', 'uncertain', 'unconfirmed'].includes(send.state), 'order_not_sent', 409)
  const id = newId(), contact = input.text('contact'), reference = input.text('reference'), note = input.text('note', { max: 2000 })
  await commit(env, [stmt(env, 'INSERT INTO gk_purchase_acknowledgments(id,send_id,contact,reference,note,recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?)', id, send.id, contact, reference, note, actor.id, now())],
  { actor: actor.id, action: 'purchase.acknowledge', subject: send.order_id, detail: { send: send.id, contact, reference, note, provenance: 'buyer_recorded_vendor_acknowledgment' } })
  return { id: send.order_id, acknowledgment: id }
}
