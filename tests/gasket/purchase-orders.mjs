// BUY-002: quote comparison, immutable PO revisions and an actual provider door.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { harness, file } from './harness.mjs'

export async function purchaseOrdersJourney(h, cookie, ids, onReady) {
  const supplier = { name: 'Lakefront Bearing Supply', contact: 'Dina Orders', email: 'orders@lakefront.example.test', phone: '+1 216 555 0164', street: '4100 Lakeside Avenue', city: 'Cleveland', state: 'OH', zip: '44114', taxTreatment: 'sales_tax', taxNote: 'Recorded quote tax', paymentTerms: 'Net 30', leadDays: 6, active: true }
  const vendor = (await h.api('supplier.save', cookie.owner, supplier)).id
  const alternative = (await h.api('supplier.save', cookie.owner, { ...supplier, name: 'Mesa Industrial', email: 'orders@mesa.example.test' })).id
  const center = (await h.api('costcenter.save', cookie.owner, { code: 'BUY-002', name: 'Maintenance purchasing', active: true })).id
  const today = (await h.api('me', cookie.owner)).today
  const facts = { supplier: vendor, asset: ids.asset, workOrder: ids.work, costCenter: center, deliveryOn: today, taxTreatment: 'sales_tax', taxNote: 'Quoted destination sales tax', kind: ['part', 'service'], description: ['Sealed bearings', 'Contractor installation'], quantity: ['10', '1.5'], unit: ['each', 'hour'], unitPrice: ['18.75', '95.00'], freight: '12.00', salesTax: '26.40', useTax: '0' }
  const quoteFile = file('supplier-quote.txt', 'Vendor quote Q-110, bearings and labor', 'text/plain')
  for (const role of ['lead', 'max', 'sam', 'agent']) await h.api('quote.save', cookie[role], { ...facts, reference: 'Forbidden' }, 403)
  const firstQuote = (await h.api('quote.save', cookie.owner, { ...facts, reference: 'Q-110', attachments: [quoteFile] })).id
  const secondQuote = (await h.api('quote.save', cookie.owner, { ...facts, supplier: alternative, reference: 'M-810', unitPrice: ['21.00', '110.00'], freight: '20.00' })).id
  const quotes = await h.api('quotes', cookie.max)
  assert.equal(quotes.find(row => row.id === firstQuote).snapshot.totalCents, 36840)
  const comparison = await (await h.raw('/app/purchase-orders', { cookie: cookie.owner })).text()
  for (const text of ['Q-110', 'M-810', 'Lakefront Bearing Supply', 'Mesa Industrial', 'Sealed bearings', 'Contractor installation']) assert.ok(comparison.includes(text), text)
  const quoteAttachment = quotes.find(row => row.id === firstQuote).snapshot.attachments[0]
  assert.equal(await (await h.raw(`/app/purchase-files/${quoteAttachment.id}`, { cookie: cookie.max })).text(), 'Vendor quote Q-110, bearings and labor')

  const draft = { ...facts, quote: [firstQuote, secondQuote], selectedQuote: firstQuote, comparisonNote: 'Lakefront has lower total and the required delivery date', reason: 'Repair the motor at the planned stop' }
  for (const role of ['lead', 'max', 'sam', 'agent']) await h.api('purchase.save', cookie[role], draft, 403)
  await h.api('purchase.save', cookie.owner, { ...draft, quantity: ['1.0001', '1'] }, 400)
  await h.api('purchase.save', cookie.owner, { ...draft, unitPrice: ['18.755', '95'] }, 400)
  await h.api('purchase.save', cookie.owner, { ...draft, deliveryOn: '2026-02-30' }, 400)
  await h.api('purchase.save', cookie.owner, { ...draft, asset: 'missing' }, 400)
  await h.api('purchase.save', cookie.owner, { ...draft, selectedQuote: secondQuote }, 400)
  const attachment = new File(['Packing and access instructions, revision one'], 'access.txt', { type: 'text/plain' })
  const created = await h.submit('purchase.save', cookie.owner, { ...draft, attachments: attachment }, '/app/purchase-orders/{id}')
  assert.equal(created.searchParams.get('notice'), 'Saved.')
  const order = created.pathname.split('/').pop(), detail = () => h.api(`purchase-orders/${order}`, cookie.owner)
  let read = await detail()
  const original = read.current.snapshot
  assert.equal(original.currency, 'USD'); assert.equal(original.totalCents, 36840)
  assert.deepEqual([original.subtotalCents, original.freightCents, original.salesTaxCents, original.useTaxCents], [33000, 1200, 2640, 0])
  assert.equal(original.asset.id, ids.asset); assert.equal(original.work.id, ids.work); assert.equal(original.costCenter.id, center)
  assert.equal(original.supplier.shipTo.zip, '44114'); assert.equal(original.supplier.payment_terms, 'Net 30')
  assert.deepEqual(original.quotes.map(quote => quote.id), [firstQuote, secondQuote])
  assert.equal(await (await h.raw(`/app/purchase-files/${original.attachments[0].id}`, { cookie: cookie.max })).text(), 'Packing and access instructions, revision one')
  const second = (await h.api('purchase.save', cookie.owner, { ...draft, taxTreatment: 'use_tax', salesTax: '0', useTax: '25' })).id
  const secondRead = await h.api(`purchase-orders/${second}`, cookie.owner)
  assert.equal(secondRead.number, read.number + 1, 'sequential order numbers')
  assert.equal(secondRead.current.snapshot.totalCents, 34200); assert.equal(secondRead.current.snapshot.commitmentCents, 36700)
  await h.api('purchase.send', cookie.owner, { order, revision: 1 }, 409)
  await h.api('purchase.approve', cookie.owner, { order, revision: 1 }, 403)
  await h.api('purchase.approve', cookie.lead, { order, revision: 1 }, 403)
  const approved = await h.submit('purchase.approve', cookie.sam, { order, revision: '1', note: 'Quotes and scope reviewed' }, `/app/purchase-orders/${order}`)
  assert.equal(approved.searchParams.get('notice'), 'Saved.')
  read = await detail(); assert.equal(read.current.approval.approved_by, ids.sam)
  const sent = await h.api('purchase.send', cookie.owner, { order, revision: 1 })
  assert.equal(sent.state, 'accepted')
  const replay = await h.api('purchase.send', cookie.owner, { order, revision: 1 })
  assert.equal(replay.send, sent.send); assert.equal(replay.replay, true)
  // Root integration exposes the existing network-edge capture as h.mails.
  const emails = h.mails.filter(mail => mail.subject === `PO-${read.number} revision 1`)
  assert.equal(emails.length, 1, 'replay sends no second provider request')
  assert.deepEqual(emails[0].to, [supplier.email]); assert.ok(emails[0].text.includes('10 each'))
  assert.ok(emails[0].text.includes('$368.40')); assert.ok(emails[0].text.includes('Net 30'))
  assert.equal(emails[0].attachments[0].filename, 'access.txt')
  assert.equal(Buffer.from(emails[0].attachments[0].content, 'base64').toString(), 'Packing and access instructions, revision one')
  assert.equal((await detail()).current.acknowledgments.length, 0, 'provider acceptance does not acknowledge the order')
  await h.api('purchase.acknowledge', cookie.max, { send: sent.send, contact: 'Dina', reference: 'ACK-110', note: 'Confirmed delivery' }, 403)
  await h.submit('purchase.acknowledge', cookie.owner, { send: sent.send, contact: 'Dina Orders', reference: 'ACK-110', note: 'Vendor confirmed the promised delivery date by phone' }, `/app/purchase-orders/${order}`)
  assert.equal((await detail()).current.acknowledgments[0].reference, 'ACK-110')
  await h.api('purchase.save', cookie.owner, { ...draft, order, revision: 1, quantity: ['12', '1.5'] })
  read = await detail(); assert.equal(read.current_revision, 2)
  assert.equal(read.current.approval, null); assert.equal(read.current.send, null)
  assert.deepEqual(read.revisions[0].snapshot, original, 'old revision remains exactly as approved and sent')
  assert.equal(read.revisions[0].send.approval_id, read.revisions[0].approval.id)
  assert.equal(read.revisions[0].acknowledgments[0].reference, 'ACK-110')
  assert.equal(read.current.snapshot.lines[0].quantity, '12'); assert.equal(read.current.snapshot.totalCents, 40590)
  assert.deepEqual(read.current.snapshot.attachments, original.attachments)
  await h.api('purchase.send', cookie.owner, { order, revision: 2 }, 409)
  await h.api('purchase.approve', cookie.sam, { order, revision: 1 }, 409)
  await h.api('purchase.save', cookie.owner, { ...draft, order, revision: 1 }, 409)
  await h.api('purchase.approve', cookie.sam, { order, revision: 2 })
  await h.api('supplier.save', cookie.owner, { ...supplier, supplier: vendor, revision: (await h.api(`suppliers/${vendor}`, cookie.owner)).revision, active: false })
  await h.api('purchase.send', cookie.owner, { order, revision: 2 }, 409)
  await h.api('purchase.save', cookie.owner, draft, 409)
  assert.equal((await detail()).current.send, null, 'inactive supplier never claims an email')
  for (const outcome of ['rejected', 'uncertain']) {
    const attempted = (await h.api('purchase.save', cookie.owner, { ...facts, supplier: alternative, reason: `Provider ${outcome} outcome` })).id
    await h.api('purchase.approve', cookie.sam, { order: attempted, revision: 1 })
    h.setMailOutcome(outcome)
    const beforeMails = h.mails.length
    assert.equal((await h.api('purchase.send', cookie.owner, { order: attempted, revision: 1 })).state, outcome)
    assert.equal(h.mails.length, beforeMails + 1)
    assert.equal((await h.api('purchase.send', cookie.owner, { order: attempted, revision: 1 })).replay, true)
    assert.equal(h.mails.length, beforeMails + 1, 'an uncertain or refused provider result is never resent')
    assert.equal((await h.api(`purchase-orders/${attempted}`, cookie.owner)).current.acknowledgments.length, 0)
    h.setMailOutcome('accepted')
  }
  const page = await (await h.raw(`/app/purchase-orders/${order}`, { cookie: cookie.max })).text()
  for (const text of ['Revision 1', 'Revision 2', 'ACK-110', 'Provider accepted', `/app/assets/${ids.asset}`, `/app/work/${ids.work}`, 'access.txt']) assert.ok(page.includes(text), text)
  for (const path of ['quotes', 'purchase-orders', `purchase-orders/${order}`]) assert.equal((await h.raw(`/api/gasket/${path}`)).status, 401)
  for (const path of ['/app/purchase-orders', `/app/purchase-orders/${order}`, `/app/purchase-files/${original.attachments[0].id}`]) assert.equal((await h.raw(path)).status, 303)
  const audit = await h.api('audit?action=purchase.approve', cookie.owner)
  assert.ok(audit.rows.some(row => row.subject === order && row.actor === ids.sam))
  await onReady?.({ h, cookie, paths: ['/app/purchasing', '/app/purchase-orders', `/app/purchase-orders/${order}`, `/app/purchase-orders/${second}`] })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const h = await harness()
  try {
    const cookie = { owner: await h.owner() }, ids = {}
    await h.api('site.configure', cookie.owner, { name: 'Great Lakes Plant', timezone: 'America/New_York' })
    for (const [key, role] of [['lead', 'lead'], ['max', 'maintainer'], ['sam', 'supervisor'], ['agent', 'agent']]) {
      ids[key] = (await h.api('access.give', cookie.owner, { name: key, email: `${key}@example.test`, role })).id
      cookie[key] = await h.signIn(`${key}@example.test`)
    }
    ids.asset = (await h.api('asset.create', cookie.lead, { tag: 'MTR-BUY002', name: 'Purchasing motor', location: 'Assembly' })).id
    ids.work = (await h.api('workorder.create', cookie.lead, { asset: ids.asset, title: 'Repair motor', due: (await h.api('me', cookie.owner)).today })).id
    await purchaseOrdersJourney(h, cookie, ids)
    console.log('BUY-002 quotes and numbered purchase orders passed')
  } finally { await h.close() }
}
