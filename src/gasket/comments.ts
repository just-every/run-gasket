// PLAN-006: comments, mentions and shift handoff on a work order or an asset.
// Every member reads a record's thread; the people roles (owner, lead,
// maintainer, supervisor) post to it; the native agent role does not. The MCP
// adapter acts for an authorized human sponsor under current company policy.
// A comment is plain
// text with up to four photos, may be marked a shift handoff summary, and
// mentions active people chosen when it is posted: each gets one in-app notice
// on the Notices page linking to the comment. Only its author edits it, and
// every version stays as a revision; nothing deletes a comment, so closing,
// cancelling or merging the record keeps its conversation, which can go on.
// Every comment is an internal note: no requester or contractor identity
// exists yet (ADMIN-004, REQ-004 inherit keeping these threads from them).
// Unread: a comment someone else wrote is unread for a person until they open
// the record's page or mark its thread read; their read marker is the highest
// comment sequence on that record they have seen, so edits never re-open it.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, insist, newId, now, one, sha256Hex, stmt, type Row } from './core'
import type { Input } from './input'
import { woDigits } from './quantity'
import { EVIDENCE_BYTES } from './work'

export const COMMENT_PHOTOS = 4
const PHOTO_TYPES: Record<string, string> = Object.assign(Object.create(null), { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic' })
type Kind = 'work' | 'asset'
const COLUMN: Record<Kind, string> = { work: 'work_order_id', asset: 'asset_id' }

/** A comment's text; a form's CRLF line breaks are kept as plain newlines. */
const said = (input: Input) => input.text('body', { max: 2000 }).replace(/\r\n?/g, '\n')

async function subject(env: Bindings, input: Input): Promise<{ kind: Kind; id: string; label: string }> {
  const work = input.text('workOrder', { optional: true, max: 100 }), asset = input.text('asset', { optional: true, max: 100 })
  insist(Boolean(work) !== Boolean(asset), 'invalid_subject')
  if (work) {
    const row = await one(env, 'SELECT id, number, title FROM gk_work_orders WHERE id = ?', work)
    insist(row, 'work_order_not_found', 404)
    return { kind: 'work', id: row.id, label: `WO-${woDigits(row.number)} ${row.title}` }
  }
  const row = await one(env, 'SELECT id, tag, name FROM gk_assets WHERE id = ?', asset)
  insist(row, 'asset_not_found', 404)
  return { kind: 'asset', id: row.id, label: `${row.tag} ${row.name}` }
}

/** A person posts a comment or shift handoff summary, with photos and mentions, to a work order or an asset. */
export async function postComment(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'comment.write')
  const on = await subject(env, input)
  const body = said(input), kind = input.flag('handoff') ? 'handoff' : 'comment'
  const mentions = [...new Set(input.has('mention') ? input.list('mention') : [])].filter(id => id !== actor.id)
  for (const id of mentions) insist(await one(env, "SELECT 1 FROM gk_members WHERE id = ? AND status = 'active' AND role != 'agent'", id), 'mention_not_member', 409)
  const photos = []
  for (const file of await input.files('photo', { max: COMMENT_PHOTOS, maxBytes: EVIDENCE_BYTES })) {
    const mediaType = PHOTO_TYPES[file.filename.split('.').pop()?.toLowerCase() ?? '']
    insist(mediaType, 'unsupported_file_type')
    photos.push({ ...file, mediaType, sha256: await sha256Hex(file.bytes) })
  }
  const id = newId(), at = now()
  const text = `${actor.name} mentioned you ${kind === 'handoff' ? 'in a shift handoff ' : ''}on ${on.label}.`
  await commit(env, [
    stmt(env, `INSERT INTO gk_comments (id, seq, ${COLUMN[on.kind]}, kind, body, author_id, created_at) VALUES (?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM gk_comments), ?, ?, ?, ?, ?)`, id, on.id, kind, body, actor.id, at),
    stmt(env, 'INSERT INTO gk_comment_revisions (comment_id, number, body, edited_by, edited_at) VALUES (?, 1, ?, ?, ?)', id, body, actor.id, at),
    ...mentions.map(member => stmt(env, 'INSERT INTO gk_comment_mentions (comment_id, member_id) VALUES (?, ?)', id, member)),
    ...photos.map((photo, position) => stmt(env, 'INSERT INTO gk_comment_photos (id, comment_id, position, filename, media_type, size, sha256, bytes, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), id, position, photo.filename, photo.mediaType, photo.bytes.length, photo.sha256, photo.bytes, at)),
    ...mentions.map(member => stmt(env, `INSERT INTO gk_notices (id, recipient_id, ${COLUMN[on.kind]}, comment_id, kind, occasion, text, created_at) VALUES (?, ?, ?, ?, 'mention', ?, ?, ?)`, newId(), member, on.id, id, `comment:${id}`, text, at)),
  ], { actor: actor.id, action: 'comment.post', subject: on.id, detail: { comment: id, kind, mentions, photos: photos.map(photo => ({ filename: photo.filename, sha256: photo.sha256 })) } })
  return { id: on.id, comment: id }
}

/** The author changes a comment's text; the earlier text stays as a revision. */
export async function editComment(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'comment.write')
  const comment = await one(env, 'SELECT * FROM gk_comments WHERE id = ?', input.text('comment', { max: 100 }))
  insist(comment, 'comment_not_found', 404)
  insist(comment.author_id === actor.id, 'not_your_comment', 403)
  const body = said(input)
  insist(body !== comment.body, 'unchanged', 409)
  const at = now(), on = comment.work_order_id ?? comment.asset_id
  await commit(env, [
    stmt(env, 'INSERT INTO gk_comment_revisions (comment_id, number, body, edited_by, edited_at) VALUES (?, (SELECT MAX(number) + 1 FROM gk_comment_revisions WHERE comment_id = ?), ?, ?, ?)', comment.id, comment.id, body, actor.id, at),
    stmt(env, 'UPDATE gk_comments SET body = ?, edited_at = ? WHERE id = ?', body, at, comment.id),
  ], { actor: actor.id, action: 'comment.edit', subject: on, detail: { comment: comment.id } })
  return { id: on, comment: comment.id }
}

/** Moves the person's read marker on a record to its latest comment. */
export async function readThread(env: Bindings, actor: Actor, kind: Kind, id: string) {
  await env.DB.batch([stmt(env, `INSERT INTO gk_comment_reads (member_id, subject_kind, subject_id, read_seq, read_at) SELECT ?, ?, ?, MAX(seq), ? FROM gk_comments WHERE ${COLUMN[kind]} = ? HAVING MAX(seq) IS NOT NULL
    ON CONFLICT (member_id, subject_kind, subject_id) DO UPDATE SET read_seq = MAX(read_seq, excluded.read_seq), read_at = excluded.read_at`, actor.id, kind, id, now(), id)])
}

/** The JSON door's explicit read: `workOrder` or `asset`. */
export async function markRead(env: Bindings, actor: Actor, input: Input) {
  const on = await subject(env, input)
  await readThread(env, actor, on.kind, on.id)
  return { id: on.id }
}

/** One record's thread, oldest first, with each comment's unread state for this person, mentions, photos and revisions. */
export async function thread(env: Bindings, actor: Actor, kind: Kind, id: string) {
  const marker = (await one(env, 'SELECT read_seq FROM gk_comment_reads WHERE member_id = ? AND subject_kind = ? AND subject_id = ?', actor.id, kind, id))?.read_seq ?? 0
  const where = `comment_id IN (SELECT id FROM gk_comments WHERE ${COLUMN[kind]} = ?)`
  const [rows, mentions, photos, revisions] = await Promise.all([
    all(env, `SELECT c.id, c.seq, c.kind, c.body, c.author_id,
      COALESCE((SELECT json_extract(a.detail,'$.preparedBy.label') FROM gk_audit a WHERE a.action='comment.post' AND a.subject=COALESCE(c.work_order_id,c.asset_id) AND json_extract(a.detail,'$.comment')=c.id ORDER BY a.seq LIMIT 1),m.name) AS author,
      c.created_at, c.edited_at FROM gk_comments c LEFT JOIN gk_members m ON m.id = c.author_id WHERE c.${COLUMN[kind]} = ? ORDER BY c.seq`, id),
    all(env, `SELECT x.comment_id, m.id, m.name FROM gk_comment_mentions x JOIN gk_members m ON m.id = x.member_id WHERE x.${where} ORDER BY m.name, m.id`, id),
    all(env, `SELECT id, comment_id, filename, media_type, size, sha256 FROM gk_comment_photos WHERE ${where} ORDER BY position`, id),
    // The unique post audit binds revision 1 even when its timestamp was captured later.
    all(env, `SELECT r.comment_id, r.number, r.body,
      COALESCE((SELECT json_extract(a.detail,'$.preparedBy.label') FROM gk_audit a WHERE a.action=CASE WHEN r.number=1 THEN 'comment.post' ELSE 'comment.edit' END AND json_extract(a.detail,'$.comment')=r.comment_id AND (r.number=1 OR a.at=r.edited_at) ORDER BY a.seq LIMIT 1),m.name) AS by,
      r.edited_at FROM gk_comment_revisions r LEFT JOIN gk_members m ON m.id = r.edited_by WHERE r.${where} ORDER BY r.number`, id),
  ])
  const of = (list: Row[], comment: string) => list.filter(row => row.comment_id === comment).map(({ comment_id: _comment, ...row }) => row)
  const comments = rows.map(row => ({ ...row, unread: row.author_id !== actor.id && row.seq > marker, mentions: of(mentions, row.id), photos: of(photos, row.id), revisions: of(revisions, row.id) }))
  return { unread: comments.filter(row => row.unread).length, comments }
}

/** The people a comment can mention: active members other than agents and the writer. */
export const mentionable = (env: Bindings, actor: Actor) => all<{ id: string; name: string }>(env, "SELECT id, name FROM gk_members WHERE status = 'active' AND role != 'agent' AND id != ? ORDER BY name, id", actor.id)

/** A comment photo, served to signed-in members only, never as active content. */
export async function commentPhoto(env: Bindings, _actor: Actor, id: string) {
  const row = await one<{ filename: string; media_type: string; bytes: ArrayBuffer }>(env, 'SELECT filename, media_type, bytes FROM gk_comment_photos WHERE id = ?', id)
  insist(row, 'photo_not_found', 404)
  return new Response(new Uint8Array(row.bytes), { headers: { 'content-type': row.media_type, 'content-disposition': `inline; filename="${row.filename.replace(/["\\]/g, '_')}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" } })
}

/** Where a notice takes its reader: the comment it is about, or the work order. */
export const noticeLink = (row: Row) => row.comment_id ? `/app/${row.work_order_id ? `work/${row.work_order_id}` : `assets/${row.asset_id}`}#comment-${row.comment_id}` : row.work_order_id ? `/app/work/${row.work_order_id}` : `/app/assets/${row.asset_id}#documents`

/** Whether a mention notice's comment is still unread by its recipient (SQL over gk_notices n). */
export const NOTICE_UNREAD = `CASE WHEN n.comment_id IS NULL THEN 0 ELSE (SELECT c.seq > COALESCE((SELECT r.read_seq FROM gk_comment_reads r WHERE r.member_id = n.recipient_id
  AND r.subject_kind = CASE WHEN c.work_order_id IS NULL THEN 'asset' ELSE 'work' END AND r.subject_id = COALESCE(c.work_order_id, c.asset_id)), 0) FROM gk_comments c WHERE c.id = n.comment_id) END`
