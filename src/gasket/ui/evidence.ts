// FIELD-005 on the work page: before/after photos with their annotations drawn
// over them, the annotation form, and the work's signatures bound to versions.
import { can, type Actor } from '../actor'
import type { Row } from '../core'
import { showInstant, showLocal } from '../dates'
import { card, field, fileField, h, select, tag, type Html } from './html'

type Post = (action: string, fields: unknown, submit: string, options?: { multipart?: boolean; secondary?: boolean }) => Html
const PHASE: Record<string, string> = { before: 'Before', after: 'After' }
const ROLE: Record<string, string> = { technician: 'technician', customer: 'customer', supervisor: 'supervisor' }
const STATE: Record<string, string> = { current: 'Current', stale: 'Stale', superseded: 'Superseded' }

/** The shapes in the photo's own pixel space; numbered to match the list below it. */
function overlay(file: Row) {
  const W = file.width, H = file.height, stroke = Math.max(W, H) / 150
  const x = (value: number) => (value / 100) * W, y = (value: number) => (value / 100) * H
  const shapes = file.annotations.map((note: Row, index: number) => {
    const [x1, y1, x2, y2] = [x(note.x1), y(note.y1), x(note.x2), y(note.y2)]
    const label = h`<text x="${x1}" y="${Math.max(y1 - stroke, stroke * 6)}" font-size="${stroke * 6}" fill="#d42020">${index + 1}</text>`
    if (note.shape === 'box') return h`<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="none" stroke="#d42020" stroke-width="${stroke}"/>${label}`
    if (note.shape === 'ellipse') return h`<ellipse cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" rx="${(x2 - x1) / 2}" ry="${(y2 - y1) / 2}" fill="none" stroke="#d42020" stroke-width="${stroke}"/>${label}`
    const angle = Math.atan2(y2 - y1, x2 - x1), head = stroke * 5
    const wing = (turn: number) => `${x2 - head * Math.cos(angle + turn)},${y2 - head * Math.sin(angle + turn)}`
    return h`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d42020" stroke-width="${stroke}"/><polygon points="${x2},${y2} ${wing(0.5)} ${wing(-0.5)}" fill="#d42020"/>${label}`
  })
  return h`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${file.filename} with ${file.annotations.length} annotation${file.annotations.length === 1 ? '' : 's'}"><image href="/app/evidence/${file.id}" width="${W}" height="${H}"/>${shapes}</svg>`
}

/** One evidence file's phase, capture time, door and annotations. */
export function evidenceExtras(file: Row, zone: string) {
  const notes = file.annotations ?? []
  return h`${file.phase ? h` ${tag(PHASE[file.phase])}` : ''}<span class="gk-sub">${file.taken_on ? `Taken ${showLocal(file.taken_on)} · ` : ''}Uploaded ${showInstant(file.uploaded_at, zone)} through ${file.door ?? 'web'}</span>
    ${notes.length && file.width && file.height ? overlay(file) : ''}${notes.length ? h`<ol class="gk-plain-list">${notes.map((note: Row) => h`<li>${note.note}<span class="gk-sub">${note.shape} · ${note.created_by}</span></li>`)}</ol>` : ''}`
}

export const evidenceFields = (actor: Actor) => h`${select('Before or after the work', 'phase', [{ value: 'before', label: 'Before' }, { value: 'after', label: 'After' }], '', { required: false, blank: 'Neither' })}${field('Taken at', 'takenOn', { type: 'datetime-local', required: false, hint: 'When the photo was taken, if not just now.', attrs: `max="${actor.today}T23:59"` })}`

export function annotateForm(w: Row, post: Post) {
  const photos = w.evidence.filter((file: Row) => String(file.media_type).startsWith('image/'))
  if (!photos.length) return ''
  return post('workorder.annotate', h`${select('Photo', 'evidence', photos.map((file: Row) => ({ value: file.id, label: `${file.filename}${file.phase ? ` (${file.phase})` : ''}` })), photos[0].id)}${select('Mark', 'shape', [{ value: 'box', label: 'Box' }, { value: 'ellipse', label: 'Ellipse' }, { value: 'arrow', label: 'Arrow (from the first point to the second)' }], 'box')}
    <div class="gk-grid">${['x1', 'y1', 'x2', 'y2'].map(name => field(`${name.startsWith('x') ? 'Across' : 'Down'} ${name.endsWith('1') ? 'from' : 'to'} (%)`, name, { attrs: 'inputmode="decimal"' }))}</div>${field('What it shows', 'note')}`, 'Annotate photo', { secondary: true })
}

export function signaturesCard(w: Row, actor: Actor, post: Post, recording: boolean) {
  const list = w.signatures.length ? h`<ul class="gk-plain-list">${w.signatures.map((row: Row) => h`<li>Signed by ${row.signer_name} (${ROLE[row.role]}) ${tag(STATE[row.state])}<span class="gk-sub">Version ${row.version} · ${showInstant(row.recorded_at, actor.zone)} · recorded by ${row.recorded_by} through ${row.door}${row.role === 'customer' ? ' · name as given, not verified' : ''}</span>${row.mark_sha256 ? h`<span class="gk-sub"><a href="/app/signatures/${row.id}">Drawn mark</a></span>` : ''}</li>`)}</ul>` : h`<p class="gk-muted">No signatures.</p>`
  const review = w.status === 'submitted' && can(actor, 'work.review') && !w.mine
  return card('Signatures', h`<p class="gk-sub">A signature confirms this work record at version ${w.version}. It is not an equipment certification, and any change to the work asks for it again.</p>${list}
    ${recording ? h`${post('workorder.sign', h`<input type="hidden" name="role" value="technician">`, `Sign as ${actor.name}`, { secondary: true })}${post('workorder.sign', h`<input type="hidden" name="role" value="customer">${field('Customer name', 'name')}${fileField('Drawn mark (optional)', 'mark', { accept: '.png,.jpg,.jpeg' })}`, 'Record customer signature', { multipart: true, secondary: true })}` : ''}
    ${review ? post('workorder.sign', h`<input type="hidden" name="role" value="supervisor">`, `Sign as supervisor ${actor.name}`, { secondary: true }) : ''}`, { id: 'signatures' })
}

