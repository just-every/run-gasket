// PLAN-006: the comments card on a work order and an asset: the thread with
// unread marks, photos, mentions and earlier versions, the author's edit and
// the post form (comment or shift handoff summary, photos, people to mention).
import { can, type Actor } from '../actor'
import { COMMENT_PHOTOS, type thread } from '../comments'
import { showInstant } from '../dates'
import { area, card, checkbox, details, fileField, form, h, hidden, raw, tag } from './html'

type Thread = Awaited<ReturnType<typeof thread>>

const text = (body: string) => h`${body.split('\n').map((line, index) => h`${index ? raw('<br>') : ''}${line}`)}`

export function commentsCard(talk: Thread, actor: Actor, on: { field: 'workOrder' | 'asset'; id: string }, back: string, people: { id: string; name: string }[]) {
  const writing = can(actor, 'comment.write')
  const list = talk.comments.length ? h`<ol class="gk-plain-list">${talk.comments.map(row => h`<li id="comment-${row.id}">
    <p>${row.kind === 'handoff' ? h`${tag('Shift handoff')} ` : ''}${row.unread ? h`${tag('Unread')} ` : ''}<strong>${row.author ?? '—'}</strong><span class="gk-sub">${showInstant(row.created_at, actor.zone)}${row.edited_at ? ` · edited ${showInstant(row.edited_at, actor.zone)}` : ''}${row.mentions.length ? ` · mentions ${row.mentions.map((person: { name: string }) => person.name).join(', ')}` : ''}</span></p>
    <p>${text(row.body)}</p>
    ${row.photos.length ? h`<ul class="gk-files">${row.photos.map((photo: { id: string; filename: string; size: number }) => h`<li><a href="/app/comment-photos/${photo.id}">${photo.filename}</a><span class="gk-sub">Photo · ${Math.ceil(photo.size / 1024)} KB</span></li>`)}</ul>` : ''}
    ${row.revisions.length > 1 ? details(row.revisions.map((revision: { number: number; body: string; by: string | null; edited_at: number }) => [`Version ${revision.number} · ${revision.by ?? '—'} · ${showInstant(revision.edited_at, actor.zone)}`, revision.body])) : ''}
    ${writing && row.author_id === actor.id ? form('comment.edit', back, h`${hidden('comment', row.id)}${area('Edit your comment', 'body', { value: row.body, hint: 'The earlier text stays as a version anyone can read.' })}`, 'Save edit', { secondary: true }) : ''}
  </li>`)}</ol>` : h`<p class="gk-muted">No comments yet.</p>`
  const post = writing ? form('comment.post', back, h`${hidden(on.field, on.id)}${area('Comment', 'body', { hint: 'An internal note: only people with access to Gasket read it, never requesters or contractors.' })}${checkbox('This is a shift handoff summary', 'handoff')}
    ${fileField('Photos', 'photo', { multiple: true, accept: '.png,.jpg,.jpeg,.webp,.heic', hint: `Up to ${COMMENT_PHOTOS} photos: PNG, JPEG, WebP or HEIC, up to 1.5 MB each.` })}
    ${people.length ? h`<fieldset class="gk-item"><legend>Mention</legend>${people.map(person => h`<label class="gk-check"><input type="checkbox" name="mention" value="${person.id}"> ${person.name}</label>`)}</fieldset>` : ''}`, 'Post comment', { multipart: true, secondary: true }) : ''
  return card('Comments', h`${list}${post}`, { id: 'comments', extra: talk.unread ? h`<span class="gk-count">${talk.unread} unread</span>` : '' })
}
