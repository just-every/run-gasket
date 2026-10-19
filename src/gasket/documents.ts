// ASSET-003: an asset's manuals, diagrams, warranties and authorizations, and
// its supplier and service contacts. A lead adds a document with its first
// file and adds later revisions; adding a revision is the lead's approval of
// it, and a revision never changes or goes away. Each revision keeps the
// publisher and reference it came from and who added it, and carries both into
// the job pack. Work pins the revision a lead links to it: a later revision of
// the master shows on the work as newer, but the work keeps showing and packing
// the one it was given. A document that expires names an owner, who gets an
// in-app notice (email and push wait for PM-005) once it is within its reminder
// days and again once it has expired; a new expiry date asks again.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from './core'
import { addDays, isDate } from './dates'
import type { Input } from './input'
import { OPEN, workOrder } from './work'
import { zip } from './zip'

export const KINDS = ['manual', 'diagram', 'warranty', 'authorization', 'other'] as const
export const CONTACT_ROLES = ['supplier', 'manufacturer', 'service', 'other'] as const
export const DOCUMENT_BYTES = 1_500_000
const TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain' }

const liveAsset = async (env: Bindings, id: string) => {
  const row = await one(env, 'SELECT id, tag, name, retired_at FROM gk_assets WHERE id = ?', id)
  insist(row, 'asset_not_found', 404)
  insist(!row.retired_at, 'asset_retired', 409)
  return row
}

const documentRow = async (env: Bindings, id: string) => {
  const row = await one(env, 'SELECT * FROM gk_documents WHERE id = ?', id)
  insist(row, 'document_not_found', 404)
  return row
}

/** The uploaded file of a revision, refused unless it is a PDF, image or plain text within the size limit. */
async function upload(input: Input) {
  const file = (await input.file('file', { maxBytes: DOCUMENT_BYTES }))!
  const mediaType = TYPES[file.filename.split('.').pop()?.toLowerCase() ?? '']
  insist(mediaType, 'unsupported_file_type')
  return { ...file, mediaType, sha256: await sha256Hex(file.bytes), source: input.text('source', { max: 200 }), note: input.text('note', { optional: true, max: 500 }) || null }
}

const revisionInsert = (env: Bindings, actor: Actor, documentId: string, revision: number, file: Awaited<ReturnType<typeof upload>>, id = newId()) =>
  stmt(env, 'INSERT INTO gk_document_revisions (id, document_id, revision, filename, media_type, size, sha256, bytes, source, note, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, documentId, revision, file.filename, file.mediaType, file.bytes.length, file.sha256, file.bytes, file.source, file.note, actor.id, now())

/** Expiry, owner and reminder days from the input; an expiring document needs an active member as its owner. */
async function expiry(env: Bindings, input: Input) {
  const expiresOn = input.text('expiresOn', { optional: true, max: 10 }) || null
  if (!expiresOn) return { expiresOn: null, owner: null, remindDays: 30 }
  insist(isDate(expiresOn), 'invalid_expiresOn')
  const owner = input.text('owner', { optional: true, max: 100 })
  insist(owner, 'missing_owner')
  insist(await one(env, "SELECT 1 FROM gk_members WHERE id = ? AND status = 'active'", owner), 'invalid_owner')
  return { expiresOn, owner, remindDays: input.integer('remindDays', { optional: true, min: 0, max: 365 }) ?? 30 }
}

/** A lead adds a document to an asset with its first revision, optionally with an expiry and its owner. */
export async function addDocument(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const asset = await liveAsset(env, input.text('asset', { max: 100 }))
  const kind = input.text('kind', { max: 20 }) as typeof KINDS[number]
  insist(KINDS.includes(kind), 'invalid_kind')
  const title = input.text('title', { max: 160 }), when = await expiry(env, input), file = await upload(input)
  const id = newId(), revision = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_documents (id, asset_id, kind, title, expires_on, owner_id, remind_days, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, asset.id, kind, title, when.expiresOn, when.owner, when.remindDays, actor.id, now()),
    revisionInsert(env, actor, id, 1, file, revision)],
  { actor: actor.id, action: 'document.add', subject: asset.id, detail: { document: id, kind, title, revision: 1, filename: file.filename, sha256: file.sha256, source: file.source, ...(when.expiresOn ? when : {}) } })
  return { id: asset.id, document: id, revision: 1, revisionId: revision }
}

/** A lead adds the next revision from the current one they read; it becomes the master. Earlier revisions stay. */
export async function reviseDocument(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const document = await documentRow(env, input.text('document', { max: 100 }))
  await liveAsset(env, document.asset_id)
  insist(input.integer('revision', { min: 1, max: 100_000 }) === document.current_revision, 'stale', 409, { current: document.current_revision })
  const file = await upload(input), next = document.current_revision + 1, id = newId()
  await commit(env, [guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_documents WHERE id = ? AND current_revision = ?)', document.id, document.current_revision),
    revisionInsert(env, actor, document.id, next, file, id), stmt(env, 'UPDATE gk_documents SET current_revision = ? WHERE id = ?', next, document.id)],
  { actor: actor.id, action: 'document.revise', subject: document.asset_id, detail: { document: document.id, revision: next, filename: file.filename, sha256: file.sha256, source: file.source, ...(file.note ? { note: file.note } : {}) } })
  return { id: document.asset_id, document: document.id, revision: next, revisionId: id }
}

/** A lead sets or clears a document's expiry, its owner and how many days ahead the owner is reminded. */
export async function setExpiry(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const document = await documentRow(env, input.text('document', { max: 100 }))
  const when = await expiry(env, input)
  await commit(env, [stmt(env, 'UPDATE gk_documents SET expires_on = ?, owner_id = ?, remind_days = ? WHERE id = ?', when.expiresOn, when.owner, when.remindDays, document.id)],
    { actor: actor.id, action: 'document.expiry', subject: document.asset_id, detail: { document: document.id, ...when } })
  return { id: document.asset_id, document: document.id }
}

/** A lead links a document to open work on its asset, pinning a revision (the current one unless named); linking again re-pins. */
export async function linkDocument(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const order = await workOrder(env, input.text('workOrder', { max: 100 }))
  insist(['open', 'in_progress', 'returned'].includes(order.status), 'work_order_not_open', 409)
  const document = await documentRow(env, input.text('document', { max: 100 }))
  insist(document.asset_id === order.asset_id, 'document_not_for_this_asset', 409)
  const number = input.integer('revision', { optional: true, min: 1, max: 100_000 }) ?? document.current_revision
  const revision = await one(env, 'SELECT id, revision FROM gk_document_revisions WHERE document_id = ? AND revision = ?', document.id, number)
  insist(revision, 'revision_not_found', 404)
  await commit(env, [guard(env, 'work_order_not_open', `EXISTS(SELECT 1 FROM gk_work_orders WHERE id = ? AND status IN ${OPEN})`, order.id),
    stmt(env, 'INSERT INTO gk_work_documents (work_order_id, document_id, revision_id, linked_by, linked_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(work_order_id, document_id) DO UPDATE SET revision_id = excluded.revision_id, linked_by = excluded.linked_by, linked_at = excluded.linked_at', order.id, document.id, revision.id, actor.id, now())],
  { actor: actor.id, action: 'document.link', subject: order.id, detail: { document: document.id, revision: revision.revision } })
  return { id: order.id, document: document.id, revision: revision.revision }
}

/** A lead records a supplier, manufacturer or service contact on an asset. */
export async function addContact(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const asset = await liveAsset(env, input.text('asset', { max: 100 }))
  const role = input.text('role', { max: 20 }) as typeof CONTACT_ROLES[number]
  insist(CONTACT_ROLES.includes(role), 'invalid_role')
  const name = input.text('name', { max: 120 }), company = input.text('company', { optional: true, max: 160 }) || null
  const phone = input.text('phone', { optional: true, max: 40 }) || null, email = input.text('email', { optional: true, max: 200 }) || null
  insist(phone || email, 'missing_phone_or_email')
  if (email) insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'invalid_email')
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO gk_asset_contacts (id, asset_id, role, name, company, phone, email, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, asset.id, role, name, company, phone, email, actor.id, now())],
    { actor: actor.id, action: 'asset.contact', subject: asset.id, detail: { contact: id, role, name, company, phone, email } })
  return { id: asset.id, contact: id }
}

const REVISION_COLUMNS = 'r.id, r.document_id, r.revision, r.filename, r.media_type, r.size, r.sha256, r.source, r.note, m.name AS added_by, r.added_at'

/** Expiry state on the site's day: expired on or after the date, due within the reminder days before it. */
const expiryState = (row: Row, today: string) => !row.expires_on ? null : today >= row.expires_on ? 'expired' : today >= addDays(row.expires_on, -row.remind_days) ? 'due' : 'valid'

/** An asset's documents with every revision (newest first) and its contacts. */
export async function documentsOf(env: Bindings, actor: Actor, assetId: string) {
  const documents = await all(env, 'SELECT d.id, d.kind, d.title, d.current_revision, d.expires_on, d.owner_id, o.name AS owner, d.remind_days FROM gk_documents d LEFT JOIN gk_members o ON o.id = d.owner_id WHERE d.asset_id = ? ORDER BY d.kind, d.title', assetId)
  const revisions = await all(env, `SELECT ${REVISION_COLUMNS} FROM gk_document_revisions r JOIN gk_documents d ON d.id = r.document_id LEFT JOIN gk_members m ON m.id = r.added_by WHERE d.asset_id = ? ORDER BY r.revision DESC`, assetId)
  const contacts = await all(env, 'SELECT c.id, c.role, c.name, c.company, c.phone, c.email, m.name AS recorded_by, c.recorded_at FROM gk_asset_contacts c LEFT JOIN gk_members m ON m.id = c.recorded_by WHERE c.asset_id = ? ORDER BY c.role, c.name', assetId)
  return {
    documents: documents.map(row => ({ ...row, expiry: expiryState(row, actor.today), revisions: revisions.filter(revision => revision.document_id === row.id).map(({ document_id: _, ...revision }) => revision) })),
    contacts,
  }
}

/** The revisions pinned on a work order, each with the master's current revision. */
export const workDocuments = async (env: Bindings, workOrderId: string) => (await all(env, `SELECT d.id AS document_id, d.kind, d.title, d.current_revision, ${REVISION_COLUMNS}, l.name AS linked_by, w.linked_at
  FROM gk_work_documents w JOIN gk_documents d ON d.id = w.document_id JOIN gk_document_revisions r ON r.id = w.revision_id LEFT JOIN gk_members m ON m.id = r.added_by LEFT JOIN gk_members l ON l.id = w.linked_by WHERE w.work_order_id = ? ORDER BY d.kind, d.title`, workOrderId))
  .map(row => ({ ...row, newer: row.current_revision > row.revision }))

/** One revision's file. */
export async function documentFile(env: Bindings, _actor: Actor, id: string) {
  const row = await one<{ filename: string; media_type: string; bytes: ArrayBuffer }>(env, 'SELECT filename, media_type, bytes FROM gk_document_revisions WHERE id = ?', id)
  insist(row, 'document_not_found', 404)
  return new Response(new Uint8Array(row.bytes), { headers: { 'content-type': row.media_type, 'content-disposition': `inline; filename="${row.filename.replace(/["\\]/g, '_')}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" } })
}

const safeName = (text: string) => text.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file'

/**
 * The job pack: the work order's summary, each pinned revision's original file and a manifest naming, for each, the
 * document, its revision, the publisher and reference it came from, its SHA-256 and who added it when. One ZIP.
 */
export async function jobPack(env: Bindings, actor: Actor, workOrderId: string, detail: Row) {
  const pinned = await workDocuments(env, workOrderId)
  const files = await all<{ id: string; bytes: ArrayBuffer }>(env, `SELECT r.id, r.bytes FROM gk_work_documents w JOIN gk_document_revisions r ON r.id = w.revision_id WHERE w.work_order_id = ?`, workOrderId)
  const bytes = new Map(files.map(row => [row.id, new Uint8Array(row.bytes)]))
  const number = `WO-${String(detail.number).padStart(4, '0')}`
  const entries = pinned.map(row => ({ ...row, path: `documents/${safeName(row.title)}-rev${row.revision}-${safeName(row.filename)}` }))
  const csv = (cells: unknown[]) => cells.map(value => { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text }).join(',')
  const manifest = [csv(['File', 'Document', 'Kind', 'Revision', 'Current revision', 'Original file name', 'Source', 'SHA-256', 'Added by', 'Added at (UTC)', 'Linked by']),
    ...entries.map(row => csv([row.path, row.title, row.kind, row.revision, row.current_revision, row.filename, row.source, row.sha256, row.added_by, new Date(row.added_at).toISOString(), row.linked_by]))].join('\r\n') + '\r\n'
  const summary = [`${number} ${detail.title}`, `Asset: ${detail.asset_tag ? `${detail.asset_tag} ` : ''}${detail.asset_name}`, `Location: ${detail.asset_location ?? ''}`, `Due: ${detail.due_date}`, `Status: ${detail.status}`, `Assigned to: ${detail.assignee_name ?? 'nobody'}`,
    ...(detail.items?.length ? ['', 'Checklist:', ...detail.items.map((item: Row) => `${item.index + 1}. ${item.text}`)] : []),
    '', 'Documents (the revisions this work was given):', ...(entries.length ? entries.map(row => `- ${row.title}, revision ${row.revision}${row.newer ? ` (revision ${row.current_revision} is now current)` : ''}: ${row.path}`) : ['- none']),
    '', `Packed for ${actor.name} at ${new Date(now()).toISOString()}.`].join('\r\n') + '\r\n'
  const encoder = new TextEncoder()
  const archive = zip([{ path: 'work-order.txt', bytes: encoder.encode(summary) }, { path: 'MANIFEST.csv', bytes: encoder.encode(manifest) }, ...entries.map(row => ({ path: row.path, bytes: bytes.get(row.id)! }))])
  return new Response(archive, { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${number}-job-pack.zip"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })
}

/** The scheduler's daily pass: each expiring document's owner is told once when it is due and once when it has expired. */
export async function remindExpiring(env: Bindings, today: string) {
  const rows = await all(env, `SELECT d.id, d.kind, d.title, d.expires_on, d.remind_days, d.owner_id, d.asset_id, a.tag, a.name AS asset_name FROM gk_documents d JOIN gk_assets a ON a.id = d.asset_id JOIN gk_members o ON o.id = d.owner_id
    WHERE d.expires_on IS NOT NULL AND o.status = 'active' AND a.retired_at IS NULL`)
  const statements = rows.flatMap(row => {
    const state = expiryState(row, today)
    if (state !== 'due' && state !== 'expired') return []
    const text = `${row.title} (${row.kind}) for ${row.tag} ${row.asset_name} ${state === 'expired' ? 'expired on' : 'expires on'} ${row.expires_on}.`
    return [stmt(env, "INSERT OR IGNORE INTO gk_notices (id, recipient_id, asset_id, kind, occasion, text, created_at) VALUES (?, ?, ?, 'expiry', ?, ?, ?)", newId(), row.owner_id, row.asset_id, `document:${row.id}:${row.expires_on}:${state}`, text, now())]
  })
  if (statements.length) await env.DB.batch(statements)
}
