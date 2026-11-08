import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { issuePrivateManualLink } from '../private-file-links'
import { page } from './shell'
// ASSET-003 on the pages: the asset's documents with every revision, expiry
// and owner, and its contacts, with the lead's forms; on a work order, the
// revisions it was given, a note when the master has moved on, the lead's link
// form and the job pack download.
import type { Row } from '../core'
import { CONTACT_ROLES, KINDS } from '../documents'
import { showDate, showInstant } from '../dates'
import { card, field, fileField, form, h, hidden, select, table, tag } from './html'

const KIND: Record<string, string> = { manual: 'Manual', diagram: 'Diagram', warranty: 'Warranty', authorization: 'Authorization', other: 'Document' }
const EXPIRY: Record<string, string> = { valid: 'Valid', due: 'Due', expired: 'Expired' }
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt'
const kb = (size: number) => `${Math.ceil(size / 1024)} KB`

const revisionLine = (row: Row, zone: string, privateManual = false) => h`<a href="/app/documents/${row.id}">Revision ${row.revision}: ${row.filename}</a>${privateManual ? h` · <a href="/app/manual-links/${row.id}">Get private revision link</a>` : ''}<span class="gk-sub">From ${row.source} · added by ${row.added_by} ${showInstant(row.added_at, zone)} · ${kb(row.size)}${row.note ? ` · ${row.note}` : ''}</span>`

export function documentsCard(asset: Row, zone: string, manage: boolean, back: string, people: { id: string; name: string }[]) {
  const { documents, contacts } = asset.documents
  const expiryFields = (row?: Row) => h`<div class="gk-grid">${field('Expires on', 'expiresOn', { type: 'date', value: row?.expires_on ?? '', required: false })}${select('Owner to remind', 'owner', people.map(person => ({ value: person.id, label: person.name })), row?.owner_id ?? '', { required: false, blank: 'Nobody' })}${field('Remind days ahead', 'remindDays', { value: row?.remind_days ?? 30, required: false, attrs: 'inputmode="numeric"' })}</div>`
  const list = documents.length ? h`<ul class="gk-files">${documents.map((row: Row) => h`<li>${tag(KIND[row.kind])} <strong>${row.title}</strong>${row.expiry ? h` ${tag(EXPIRY[row.expiry])}` : ''}
    ${row.expires_on ? h`<span class="gk-sub">Expires ${showDate(row.expires_on)} · ${row.owner} is reminded ${row.remind_days} days ahead</span>` : ''}
    <span class="gk-sub">${revisionLine(row.revisions[0], zone, row.kind === 'manual')}</span>
    ${row.revisions.length > 1 ? h`<details class="gk-details"><summary>Earlier revisions</summary><ul class="gk-plain-list">${row.revisions.slice(1).map((revision: Row) => h`<li>${revisionLine(revision, zone, row.kind === 'manual')}</li>`)}</ul></details>` : ''}
    ${manage ? h`<details class="gk-details"><summary>Add revision ${row.current_revision + 1}</summary>${form('document.revise', back, h`${hidden('document', row.id)}${hidden('revision', row.current_revision)}${fileField('File', 'file', { required: true, accept: ACCEPT })}${field('Source (publisher and reference)', 'source', { value: row.revisions[0].source })}${field('What changed', 'note', { required: false })}`, 'Add revision', { multipart: true, secondary: true })}</details>
      <details class="gk-details"><summary>Expiry and reminder</summary>${form('document.expiry', back, h`${hidden('document', row.id)}${expiryFields(row)}`, 'Save expiry', { secondary: true })}</details>` : ''}</li>`)}</ul>` : h`<p class="gk-muted">No manuals, diagrams, warranties or authorizations yet.</p>`
  const people_ = contacts.length ? table(['Contact', 'Role', 'Phone', 'Email'], contacts.map((row: Row) => [h`${row.name}${row.company ? h`<span class="gk-sub">${row.company}</span>` : ''}`, row.role[0].toUpperCase() + row.role.slice(1), row.phone ?? '—', row.email ? h`<a href="mailto:${row.email}">${row.email}</a>` : '—']), 'Contacts', { wrap: [0] }) : h`<p class="gk-muted">No supplier or service contacts.</p>`
  const forms = manage ? h`<details class="gk-details"><summary>Add a document</summary>${form('document.add', back, h`${hidden('asset', asset.id)}<div class="gk-grid">${select('Kind', 'kind', KINDS.map(value => ({ value, label: KIND[value] })), 'manual')}${field('Title', 'title')}</div>${fileField('File', 'file', { required: true, accept: ACCEPT, hint: 'PDF, image or plain text, up to 1.5 MB. Adding it approves it for work.' })}${field('Source (publisher and reference)', 'source', { hint: 'For example: Copeland, AE4-1418 rev 3.' })}${field('Note', 'note', { required: false })}${expiryFields()}`, 'Add document', { multipart: true, secondary: true })}</details>
    <details class="gk-details"><summary>Add a contact</summary>${form('asset.contact', back, h`${hidden('asset', asset.id)}<div class="gk-grid">${select('Role', 'role', CONTACT_ROLES.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })), 'supplier')}${field('Name', 'name')}${field('Company', 'company', { required: false })}${field('Phone', 'phone', { type: 'tel', required: false })}${field('Email', 'email', { type: 'email', required: false })}</div>`, 'Add contact', { secondary: true })}</details>` : ''
  return card('Documents and contacts', h`${list}<h3>Contacts</h3>${people_}${forms}`, { id: 'documents' })
}

/** The revisions this work was given; a lead links more while it is open. */
export function workDocumentsCard(w: Row, available: Row[] | null, back: string) {
  const list = w.documents.length ? h`<ul class="gk-files">${w.documents.map((row: Row) => h`<li>${tag(KIND[row.kind])} <a href="/app/documents/${row.id}">${row.title}, revision ${row.revision}</a>${row.newer ? h` ${tag('Newer revision')}` : ''}
    <span class="gk-sub">${row.newer ? `Revision ${row.current_revision} is now current; this work keeps revision ${row.revision}. ` : ''}From ${row.source} · added by ${row.added_by} · linked by ${row.linked_by}</span></li>`)}</ul>` : h`<p class="gk-muted">No documents linked to this work.</p>`
  const link = available?.length ? form('document.link', back, h`${hidden('workOrder', w.id)}${select('Document', 'document', available.map(row => ({ value: row.id, label: `${row.title} (revision ${row.current_revision})` })), '', { blank: 'Choose a document' })}${field('Revision', 'revision', { required: false, hint: 'Leave empty for the current revision.', attrs: 'inputmode="numeric"' })}`, 'Link document', { secondary: true }) : ''
  return card('Documents', h`${list}${link}<p><a class="gk-button gk-secondary" href="/app/work/${w.id}/pack.zip">Download job pack (ZIP)</a></p>`, { id: 'documents' })
}

/** A short-lived link for this browser session, with its boundary visible before use. */
export async function privateManualLinkPage(env: Bindings, actor: Actor, url: URL, id: string) {
  const link = await issuePrivateManualLink(env, actor, id)
  const response = await page(env, 'Private manual link', actor, h`<h1>Private manual link</h1>${card('Revision link', h`<p>${link.filename} · revision ${link.revision}</p><p>This link expires at ${showInstant(link.expiresAt, actor.zone)}. It works only in this signed-in session and does not give anyone else access. Current record permissions are checked again when it opens.</p><p><a class="gk-button" href="${link.href}" rel="noreferrer">Download this revision</a></p><p><a href="/app/assets/${link.asset}#documents">Back to asset documents</a></p>`)}`, { url })
  response.headers.set('referrer-policy', 'no-referrer')
  return response
}
