import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { newId } from '../core'
import { showInstant } from '../dates'
import { conversation, conversations, messagePeople } from '../messages'
import { backLink, card, form, h, hidden, select, table, tag } from './html'
import { page } from './shell'

export async function messagesPage(env: Bindings, actor: Actor, url: URL) {
  const rows = await conversations(env, actor), people = await messagePeople(env, actor)
  const list = rows.length ? table(['Person', 'Messages', 'Unread', 'Last message'], rows.map(row => [
    h`<a href="/app/messages/${row.id}">${row.person}</a>`, row.messages, row.unread ? tag(`${row.unread} unread`) : 'All read',
    row.last_at ? showInstant(row.last_at, actor.zone) : 'No messages yet',
  ]), 'My direct conversations', { wrap: [0] }) : h`<p>No conversations yet. Choose a person to start one.</p>`
  const start = people.length ? form('conversation.start', '/app/messages/{id}', select('Person', 'member', people.map(person => ({ value: person.id, label: person.name })), '', { blank: 'Choose a person' }), 'Open conversation') : h`<p>No other active people are available.</p>`
  return page(env, 'Messages', actor, h`<h1>Messages</h1><p class="gk-lede">Direct text conversations with people at your site. Only the two participants can open them.</p>
    <div class="gk-columns"><div class="gk-col-main">${card('My conversations', list)}</div><div class="gk-col-side">${card('Start a conversation', start)}</div></div>`, { url })
}

export async function conversationPage(env: Bindings, actor: Actor, url: URL, id: string) {
  const thread = await conversation(env, actor, id), back = `/app/messages/${id}`
  const messages = thread.messages.length ? h`<ol class="gk-message-thread" aria-label="Conversation messages">${thread.messages.map(message => h`<li id="message-${message.id}"><p><strong>${message.author}</strong> <time datetime="${new Date(message.created_at).toISOString()}">${showInstant(message.created_at, actor.zone)}</time> ${message.unread ? tag('Unread') : ''}</p><p class="gk-message-body">${message.body}</p></li>`)}</ol>` : h`<p>No messages yet.</p>`
  const read = thread.unread ? form('conversation.read', back, h`${hidden('conversation', id)}${hidden('through', thread.messages.at(-1)!.seq)}`, 'Mark read', { secondary: true }) : h`<p role="status">All messages read.</p>`
  const compose = thread.canSend ? form('message.send', back, h`${hidden('conversation', id)}${hidden('submissionKey', newId())}<div class="gk-field"><label for="direct-message-body">Message</label><textarea id="direct-message-body" name="body" maxlength="2000" required></textarea></div>`, 'Send message') : h`<p>This person is no longer available for new messages. Your conversation is retained.</p>`
  return page(env, `Messages with ${thread.person}`, actor, h`${backLink('/app/messages', 'Messages')}<h1>${thread.person}</h1><p class="gk-lede">Direct conversation · ${thread.unread} unread</p>${card('Conversation', h`${messages}${read}`)}${card('Send a message', compose)}`, { url })
}
