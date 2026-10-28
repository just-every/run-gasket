// Online direct text only. Participants are fixed; retained content has no edit or delete door.
import type { Bindings } from '../auth.server'
import { HUMAN_ROLES, humanMemberSql, humanSessionSql, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'

export interface Message { id: string; seq: number; author_id: string; author: string; body: string; created_at: number }
interface ConversationHead { id: string; created_at: number; person_id: string; person: string; canSend: number; read_seq: number }
interface ConversationSummary { id: string; created_at: number; person: string; person_id: string; messages: number; unread: number; last_at: number | null }

async function admit(env: Bindings, actor: Actor) {
  insist(!actor.service && HUMAN_ROLES.includes(actor.role), 'forbidden', 403)
  const authority = humanSessionSql(actor)
  insist(await one(env, `SELECT 1 WHERE ${authority.sql}`, ...authority.params), 'access_ended', 403)
  return authority
}
const participant = "c.site_id='primary' AND (c.member_low=? OR c.member_high=?)"
const other = 'CASE WHEN c.member_low=? THEN c.member_high ELSE c.member_low END'

export async function messagePeople(env: Bindings, actor: Actor) {
  const authority = await admit(env, actor)
  return all<{ id: string; name: string; role: string }>(env, `SELECT m.id,m.name,m.role FROM gk_members m WHERE m.id<>? AND ${humanMemberSql('m')} AND ${authority.sql} ORDER BY m.name,m.id`, actor.id, ...authority.params)
}

export async function conversations(env: Bindings, actor: Actor) {
  const authority = await admit(env, actor)
  return all<ConversationSummary>(env, `SELECT c.id,c.created_at,m.name AS person,m.id AS person_id,
    (SELECT COUNT(*) FROM gk_messages x WHERE x.conversation_id=c.id) AS messages,
    (SELECT COUNT(*) FROM gk_messages x WHERE x.conversation_id=c.id AND x.author_id<>? AND x.seq>COALESCE(r.read_seq,0)) AS unread,
    (SELECT MAX(x.created_at) FROM gk_messages x WHERE x.conversation_id=c.id) AS last_at
    FROM gk_conversations c JOIN gk_members m ON m.id=${other}
    LEFT JOIN gk_message_reads r ON r.conversation_id=c.id AND r.member_id=?
    WHERE ${participant} AND ${authority.sql} ORDER BY COALESCE(last_at,c.created_at) DESC,c.id`, actor.id, actor.id, actor.id, actor.id, actor.id, ...authority.params)
}

export async function conversation(env: Bindings, actor: Actor, id: string) {
  const authority = await admit(env, actor)
  const row = await one<ConversationHead>(env, `SELECT c.id,c.created_at,m.id AS person_id,m.name AS person,CASE WHEN ${humanMemberSql('m')} THEN 1 ELSE 0 END AS canSend,
    COALESCE(r.read_seq,0) AS read_seq FROM gk_conversations c JOIN gk_members m ON m.id=${other}
    LEFT JOIN gk_message_reads r ON r.conversation_id=c.id AND r.member_id=?
    WHERE c.id=? AND ${participant} AND ${authority.sql}`, actor.id, actor.id, id, actor.id, actor.id, ...authority.params)
  insist(row, 'conversation_not_found', 404)
  const messages = await all<Message>(env, `SELECT x.id,x.seq,x.author_id,x.author_name AS author,x.body,x.created_at
    FROM gk_messages x JOIN gk_conversations c ON c.id=x.conversation_id WHERE c.id=? AND ${participant} AND ${authority.sql} ORDER BY x.seq`, id, actor.id, actor.id, ...authority.params)
  return { ...row, canSend: Boolean(row.canSend), messages: messages.map(message => ({ ...message, unread: message.author_id !== actor.id && message.seq > row.read_seq })), unread: messages.filter(message => message.author_id !== actor.id && message.seq > row.read_seq).length }
}

export async function startConversation(env: Bindings, actor: Actor, input: Input) {
  const authority = await admit(env, actor)
  input.only(['member', 'returnTo'])
  const member = input.text('member', { max: 100 })
  insist(member !== actor.id, 'choose_another_person')
  insist(await one(env, `SELECT 1 FROM gk_members m WHERE m.id=? AND ${humanMemberSql('m')}`, member), 'person_unavailable', 409)
  const [low, high] = [actor.id, member].sort(), id = newId(), at = now()
  await commit(env, [
    guard(env, 'access_ended', authority.sql, ...authority.params),
    guard(env, 'person_unavailable', `EXISTS(SELECT 1 FROM gk_members m WHERE m.id=? AND ${humanMemberSql('m')})`, member),
    stmt(env, `INSERT INTO gk_conversations(id,site_id,member_low,member_high,created_by,created_at) VALUES(?,'primary',?,?,?,?) ON CONFLICT(site_id,member_low,member_high) DO NOTHING`, id, low, high, actor.id, at),
    stmt(env, `INSERT INTO gk_audit(at,actor,role,action,subject,detail) SELECT ?,?,m.role,'conversation.start',c.id,? FROM gk_conversations c JOIN gk_members m ON m.id=? WHERE c.id=?`, at, actor.id, JSON.stringify({ siteId: 'primary' }), actor.id, id),
  ], [])
  return { id: (await one(env, 'SELECT id FROM gk_conversations WHERE member_low=? AND member_high=?', low, high)).id }
}

export async function sendMessage(env: Bindings, actor: Actor, input: Input) {
  const authority = await admit(env, actor)
  input.only(['conversation', 'submissionKey', 'body', 'returnTo'])
  const id = input.text('conversation', { max: 100 }), key = input.text('submissionKey', { max: 100 })
  insist(/^[a-zA-Z0-9-]{16,100}$/.test(key), 'invalid_submission_key')
  const body = input.text('body', { max: 2000 }).replace(/\r\n?/g, '\n')
  const current = await conversation(env, actor, id)
  insist(current.canSend, 'person_unavailable', 409)
  const message = newId(), at = now()
  await commit(env, [
    guard(env, 'access_ended', authority.sql, ...authority.params),
    guard(env, 'conversation_unavailable', `EXISTS(SELECT 1 FROM gk_conversations c JOIN gk_members m ON m.id=${other} WHERE c.id=? AND ${participant} AND ${humanMemberSql('m')})`, actor.id, id, actor.id, actor.id),
    guard(env, 'submission_changed', 'NOT EXISTS(SELECT 1 FROM gk_messages WHERE author_id=? AND submission_key=? AND (conversation_id<>? OR body<>?))', actor.id, key, id, body),
    stmt(env, `INSERT INTO gk_messages(id,conversation_id,author_id,author_name,submission_key,body,created_at)
      SELECT ?,?,?,m.name,?,?,? FROM gk_members m WHERE m.id=? ON CONFLICT(author_id,submission_key) DO NOTHING`, message, id, actor.id, key, body, at, actor.id),
    stmt(env, `INSERT INTO gk_audit(at,actor,role,action,subject,detail) SELECT ?,?,m.role,'message.send',x.conversation_id,? FROM gk_messages x JOIN gk_members m ON m.id=x.author_id WHERE x.id=?`, at, actor.id, JSON.stringify({ siteId: 'primary', message }), message),
  ], [])
  const sent = await one<Message>(env, 'SELECT id,seq,author_id,author_name AS author,body,created_at FROM gk_messages WHERE author_id=? AND submission_key=?', actor.id, key)
  insist(sent, 'message_not_found', 409)
  return { id, message: sent, replayed: sent.id !== message }
}

export async function readConversation(env: Bindings, actor: Actor, input: Input) {
  const authority = await admit(env, actor)
  input.only(['conversation', 'through', 'returnTo'])
  const id = input.text('conversation', { max: 100 }), through = input.integer('through', { max: Number.MAX_SAFE_INTEGER })!
  await conversation(env, actor, id)
  await commit(env, [
    guard(env, 'access_ended', authority.sql, ...authority.params),
    guard(env, 'conversation_unavailable', `EXISTS(SELECT 1 FROM gk_conversations c WHERE c.id=? AND ${participant})`, id, actor.id, actor.id),
    guard(env, 'invalid_read_marker', '?=0 OR EXISTS(SELECT 1 FROM gk_messages WHERE conversation_id=? AND seq=?)', through, id, through),
    stmt(env, `INSERT INTO gk_message_reads(conversation_id,member_id,read_seq,read_at) VALUES(?,?,?,?)
      ON CONFLICT(conversation_id,member_id) DO UPDATE SET read_seq=MAX(read_seq,excluded.read_seq),read_at=excluded.read_at`, id, actor.id, through, now()),
  ], { actor: actor.id, action: 'conversation.read', subject: id, detail: { siteId: 'primary', through } })
  return { id }
}
