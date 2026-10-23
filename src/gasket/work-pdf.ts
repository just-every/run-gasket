// Work reports use the existing membership boundary and a separate financial grant.
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fontData from '../../public/fonts/inter/inter-report.ttf?inline'
import type { Bindings } from '../auth.server'
import { can, requireCapability, type Actor } from './actor'
import { all, insist, one, sha256Hex, type Row } from './core'
import { showInstant } from './dates'
import { workOrderDetail } from './work'
import { zip } from './zip'

const mime = (type: string, subtype: string) => [type, subtype].join('/')
const number = (n: number) => `WO-${String(n).padStart(4, '0')}`
const bytesOf = (value: ArrayBuffer | number[]) => new Uint8Array(value as ArrayBuffer)
const money = (cents: number | null) => cents === null ? 'unknown' : `USD ${(cents / 100).toFixed(2)}`
const financial = (actor: Actor) => can(actor, 'work.assign') || can(actor, 'work.review')
const headers = (type: string, name: string) => ({ 'content-type': type, 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' })

export async function workPdfBytes(env: Bindings, actor: Actor, id: string) {
  // Agents cannot export internal work to another audience.
  insist(actor.role !== 'agent', 'forbidden', 403)
  const w = await workOrderDetail(env, actor, id), costs = financial(actor)
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const encoded = fontData.slice(fontData.indexOf(',') + 1)
  const font = await pdf.embedFont(Uint8Array.from(atob(encoded), character => character.charCodeAt(0)), { subset: false })
  const glyphs = new Set(font.getCharacterSet())
  let page = pdf.addPage([595.28, 841.89]), y = 795
  const newPage = () => { page = pdf.addPage([595.28, 841.89]); y = 795 }
  const line = (value: unknown, size = 10) => {
    const source = String(value ?? '').replace(/\r\n?/g, '\n')
    // Never silently discard authored characters the bundled font cannot draw.
    insist([...source].every(character => character === '\n' || character === '\t' || glyphs.has(character.codePointAt(0)!)), 'pdf_character_not_supported', 422)
    for (const paragraph of source.split('\n')) {
      let text = ''
      const draw = () => { if (y < 48) newPage(); page.drawText(text, { x: 42, y, size, font, color: rgb(.12, .13, .15) }); y -= size + 5; text = '' }
      for (const character of paragraph.replace(/\t/g, '    ')) {
        if (text && font.widthOfTextAtSize(text + character, size) > 505) draw()
        text += character
      }
      draw()
    }
  }
  const heading = (text: string) => { if (y < 90) newPage(); y -= 10; line(text, 13) }
  const stamp = (at: number | null) => at ? showInstant(at, actor.zone) : 'Not recorded'
  pdf.setTitle(`${number(w.number)} ${w.title}`)
  pdf.setLanguage('en-US')
  line(`${number(w.number)} - ${w.title}`, 17)
  for (const text of [
    `Status: ${w.status}; work revision ${w.version}`,
    `Asset: ${w.asset_tag ?? ''} ${w.asset_name ?? ''}`,
    `Location: ${w.asset_location ?? ''}`,
    `Type: ${w.kind}; priority: ${w.priority}; due: ${w.due_date}`,
    `Created: ${stamp(w.created_at)} by ${w.created_by_name ?? 'Former member'}`,
    `Closed: ${stamp(w.closed_at)}`,
    `Assignee: ${w.assignee_name ?? 'Unassigned'}`,
    `Contributors: ${w.crew.contributors.map((person: Row) => person.name).join(', ') || 'None recorded'}`,
    `Work period: ${w.work_started_on ?? 'Not recorded'} to ${w.work_ended_on ?? 'Not recorded'}`,
    w.description ?? '',
    costs ? 'Financial entries included for this viewer.' : 'Financial entries withheld for this viewer.',
  ]) line(text)
  heading(`Procedure: ${w.checklist_name ?? 'None'}; revision ${w.checklist_revision ?? 'none'}`)
  for (const item of w.items) {
    line(`${item.index + 1}. ${item.text}`)
    line(item.summary)
    line(`Applies: ${item.applies ? 'yes' : 'no'}; result: ${item.result?.outcome ?? 'Not recorded'}; value: ${item.result?.value ?? ''}`)
    if (item.result) line(`Note: ${item.result.note ?? ''}; by ${item.result.recorded_by ?? 'Former member'} at ${stamp(item.result.recorded_at)}`)
    if (item.exception) line(`Exception: ${item.exception.reason}; by ${item.exception.granted_by} at ${stamp(item.exception.granted_at)}`)
  }
  heading('Readings')
  for (const r of w.readings) line(`${r.meter}: ${r.value} ${r.unit}; taken ${r.taken_on}; by ${r.entered_by}`)
  heading('Parts issued and returned')
  for (const p of w.parts) line(`${p.number} ${p.name}: issued ${p.issued}, returned ${p.returned}, used ${p.used} ${p.unit}${costs ? `; cost ${money(p.usedCents)}` : ''}`)
  heading('Time entries')
  for (const t of w.timeEntries) line(`${t.worked_on}: ${t.minutes} minutes; ${t.recorded_by}; ${t.note}; recorded ${stamp(t.recorded_at)}`)
  heading('Comments and notes')
  for (const c of w.comments.comments) { line(`${c.author ?? 'Former member'} at ${stamp(c.created_at)} (${c.kind})`); line(c.body) }
  for (const f of w.findings) line(`Finding: ${f.text}; severity ${f.severity}; step ${f.item === null ? 'whole work' : f.item + 1}`)
  heading('Signatures - work record confirmation, not equipment certification')
  for (const s of w.signatures) line(`${s.signer_name}; ${s.role}${s.role === 'customer' ? ' (name as given, not verified)' : ''}; ${stamp(s.recorded_at)}; revision ${s.version}; ${s.state.toUpperCase()}${s.mark_sha256 ? `; mark SHA-256 ${s.mark_sha256}` : ''}`)
  heading('Review decisions')
  for (const r of w.reviews) line(`${r.decision}; revision ${r.version}; ${r.reviewer}; ${stamp(r.at)}; ${r.reason ?? ''}`)
  if (costs) {
    heading('Recorded costs')
    for (const c of w.costs.entries) line(`${c.category}: ${money(c.cents)}; ${c.note}; ${c.by}; ${stamp(c.recorded_at)}`)
    line(`Total manual entries: ${money(w.costs.totalCents)}`)
  }
  heading('Audit trail')
  const audit = await all(env, 'SELECT a.seq, a.at, a.action, a.detail, m.name AS name FROM gk_audit a LEFT JOIN gk_members m ON m.id = a.actor WHERE a.subject = ? ORDER BY a.seq', id)
  for (const a of audit) {
    line(`Entry ${a.seq}; ${stamp(a.at)}; ${a.name ?? 'Former member'}; ${a.action}`)
    // Free-form financial notes can contain rates too. Omit audit payloads for restricted viewers.
    if (costs) line(a.detail)
  }
  heading('Original evidence and comment photos')
  const files = await all(env, `SELECT id, filename, media_type, sha256, bytes FROM gk_evidence WHERE work_order_id = ?
    UNION ALL SELECT p.id, p.filename, p.media_type, p.sha256, p.bytes FROM gk_comment_photos p JOIN gk_comments c ON c.id = p.comment_id WHERE c.work_order_id = ?`, id, id)
  for (const file of files) {
    const bytes = bytesOf(file.bytes)
    insist(await sha256Hex(bytes) === file.sha256, 'evidence_digest_mismatch', 409)
    line(file.filename); line(`SHA-256: ${file.sha256}`)
    // Keep the exact original even when the format has no PDF image decoder.
    await pdf.attach(bytes, `${file.id}-${file.filename}`, { mimeType: file.media_type, description: `Original evidence; SHA-256 ${file.sha256}` })
    if ([mime('image', 'png'), mime('image', 'jpeg')].includes(file.media_type)) {
      let image
      try { image = file.media_type === mime('image', 'png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes) }
      catch { insist(false, 'pdf_image_invalid', 422) }
      const scale = Math.min(505 / image.width, 260 / image.height, 1), width = image.width * scale, height = image.height * scale
      if (y - height < 48) newPage()
      page.drawImage(image, { x: 42, y: y - height, width, height }); y -= height + 14
    } else line('Original file attached to this PDF; preview unavailable for this format.')
  }
  insist((await one(env, 'SELECT version FROM gk_work_orders WHERE id = ?', id))?.version === w.version, 'stale', 409)
  const pages = pdf.getPages()
  pages.forEach((p, index) => p.drawText(`${number(w.number)} - ${index + 1} of ${pages.length}`, { x: 42, y: 24, size: 8, font }))
  const saved = await pdf.save({ objectsPerTick: Infinity })
  return { number: number(w.number), bytes: saved }
}

export async function workPdf(env: Bindings, actor: Actor, id: string) {
  const report = await workPdfBytes(env, actor, id)
  return new Response(new Uint8Array(report.bytes), { headers: headers(mime('application', 'pdf'), `${report.number}.pdf`) })
}

export async function workPdfZip(env: Bindings, actor: Actor, url: URL) {
  requireCapability(actor, 'work.assign')
  const selected = url.searchParams.getAll('work')
  const numbers = url.searchParams.get('numbers')
  if (numbers) {
    insist(numbers.length <= 300 && /^\d+(?:\s*,\s*\d+)*$/.test(numbers.trim()), 'use_comma_separated_work_numbers')
    const list = numbers.split(',').map(value => Number(value.trim()))
    insist(list.length <= 20, 'select_one_to_twenty_work_orders')
    for (const n of list) {
      const row = await one(env, 'SELECT id FROM gk_work_orders WHERE number = ?', n)
      insist(row, 'work_order_not_found', 404)
      selected.push(row.id)
    }
  }
  const ids = [...new Set(selected)]
  insist(ids.length > 0 && ids.length <= 20, 'select_one_to_twenty_work_orders')
  const entries = []; let size = 0
  for (const id of ids) {
    const report = await workPdfBytes(env, actor, id)
    size += report.bytes.length
    insist(size <= 30_000_000, 'pdf_bundle_too_large_select_fewer', 413)
    entries.push({ path: `${report.number}.pdf`, bytes: report.bytes })
  }
  return new Response(zip(entries), { headers: headers(mime('application', 'zip'), 'work-orders.zip') })
}
