// Owner-confirmed erasure refuses retained or unclassified dependencies.
import { redactionStatements, invalidateTransfersStatements } from '@runeditrun/rer/modules/portability/journal'
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import type { Input } from './input'
import { all, commit, guard, insist, now, one, sha256Hex, stmt } from './core'

const workChildren: Record<string, string> = {
  gk_annotations: 'work_order_id=?',
  gk_comment_photos: 'comment_id IN (SELECT id FROM gk_comments WHERE work_order_id=?)',
  gk_comment_mentions: 'comment_id IN (SELECT id FROM gk_comments WHERE work_order_id=?)',
  gk_comment_revisions: 'comment_id IN (SELECT id FROM gk_comments WHERE work_order_id=?)',
  gk_notices: 'work_order_id=?',
  gk_comments: 'work_order_id=?', gk_results: 'work_order_id=?', gk_result_log: 'work_order_id=?',
  gk_evidence: 'work_order_id=?', gk_chase_responses: 'work_order_id=?', gk_blockers: 'work_order_id=?',
  gk_collaborators: 'work_order_id=?', gk_handoffs: 'work_order_id=?', gk_reservations: 'work_order_id=?',
  gk_work_field_values: 'work_order_id=?', gk_step_exceptions: 'work_order_id=?',
  gk_work_tools: 'work_order_id=?', gk_work_documents: 'work_order_id=?',
  gk_planning_bookings: 'work_order_id=?', gk_planning_slots: 'work_order_id=?',
  gk_work_requirements: 'work_order_id=?', gk_time_entries: 'work_order_id=?',
}
const userChildren: Record<string, string> = {
  gk_site_memberships: 'member_id IN (SELECT id FROM gk_members WHERE operator_id=?)',
  oa_provider_session_pins: 'session_id IN (SELECT id FROM oa_sessions WHERE operator_id=?)',
  oa_provider_sessions: 'session_id IN (SELECT id FROM oa_sessions WHERE operator_id=?)',
  oa_sessions: 'operator_id=?', oa_step_up_challenges: 'operator_id=?', oa_credentials: 'operator_id=?',
  oa_external_identities: 'operator_id=?',
  oa_tokens: 'operator_id=?',
}
const joinText = (parts: string[]): string => parts.length===1?parts[0]:`(${joinText(parts.slice(0,Math.floor(parts.length/2)))} || char(0) || ${joinText(parts.slice(Math.floor(parts.length/2)))})`
const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"'
const ownerOnly = (actor: Actor) => insist(actor.role === 'owner' && !actor.service, 'forbidden', 403)

// Keep the hashed claim as a fence against replay, while erasing copied results.
// Receipts contain no request bodies; retain only their opaque authority and hashes.
function receiptScope(kind: string, id: string, record: Record<string, any>) {
  const needles = kind === 'work' ? [id] : [id, record.operator_id, record.email, record.name].filter(Boolean)
  return {
    where: `result_json IS NOT NULL AND (${kind === 'user' ? "actor_id=? OR substr(actor_id,1,length(?)+1)=?||':' OR " : ''}EXISTS(SELECT 1 FROM json_tree(result_json) j WHERE j.type='text' AND (${needles.map(() => "instr(lower(j.atom),lower(?))>0").join(' OR ')})))`,
    args: [...(kind === 'user' ? [id,id,id] : []), ...needles],
  }
}

export async function recordErasurePreview(env: Bindings, actor: Actor, kind: string, id: string) {
  ownerOnly(actor)
  insist(['work','user'].includes(kind), 'invalid_erasure_kind')
  const saved = await one(env, 'SELECT result_json FROM gk_record_erasure_results WHERE kind=? AND record_id=?', kind, id)
  if (saved) return { kind, id, erased: true, eligible: false, result: JSON.parse(saved.result_json), dependencies: {}, receiptResults: 0, blockers: [], token: '' }
  const record = await one(env, `SELECT * FROM ${kind === 'work' ? 'gk_work_orders' : 'gk_members'} WHERE id=?`, id)
  insist(record, 'record_not_found', 404)
  const children = kind === 'work' ? workChildren : userChildren
  const key = kind === 'work' ? id : record.operator_id
  const dependencies: Record<string, number> = {}, blockers: string[] = []
  const checks: { sql: string; args: unknown[]; count: number }[] = []
  const count = async (sql: string, args: unknown[]) => {
    const n = (await one(env, `SELECT COUNT(*) AS n FROM ${sql}`, ...args)).n
    checks.push({ sql, args, count: n }); return n as number
  }
  for (const [table, where] of Object.entries(children)) dependencies[table] = await count(`${quote(table)} WHERE ${where}`, [key])
  const receipts = receiptScope(kind,id,record)
  const receiptResults = await count(`gk_api_writes WHERE ${receipts.where}`, receipts.args)
  const credentialMetadata = kind === 'user' ? await count('gk_api_credentials WHERE member_id=?', [id]) : 0
  if (kind === 'user' && await count('gk_api_credentials WHERE member_id=? AND revoked_at IS NULL', [id])) blockers.push('Revoke service credentials first')
  const holdKind = kind === 'work' ? 'gk_retention_holds' : 'gk_retention_scope_holds'
  if (await count(`${holdKind} WHERE kind=? AND record_id=? AND held=1`, [kind,id])) blockers.push('Legal hold')
  const minimum = (await one(env, 'SELECT minimum_days FROM gk_retention_policies WHERE kind=?', kind === 'work' ? 'maintenance_records' : 'users'))?.minimum_days ?? 0
  if (record.created_at > now()-minimum*86400000) blockers.push('Minimum retention age')
  if (kind === 'work') {
    if (record.submitted_version !== null || !['open','in_progress','returned','cancelled'].includes(record.status) || record.requires_evidence) blockers.push('Submitted, completed or required evidence')
    const evidence = await count(`gk_evidence WHERE work_order_id=? AND (certificate=1 OR item IS NOT NULL OR uploaded_at>?-COALESCE((SELECT minimum_days FROM gk_retention_policies WHERE kind='attachments'),0)*86400000)`, [id,now()])
    const commentFiles=await count(`gk_comment_photos WHERE comment_id IN (SELECT id FROM gk_comments WHERE work_order_id=?) AND uploaded_at>?-COALESCE((SELECT minimum_days FROM gk_retention_policies WHERE kind='attachments'),0)*86400000`,[id,now()])
    if (evidence || commentFiles) blockers.push('Required, certificate or retained original')
    const holds = await count(`gk_retention_scope_holds h WHERE h.held=1 AND ((h.kind='attachment' AND h.record_id IN (SELECT id FROM gk_evidence WHERE work_order_id=?)) OR (h.kind='user' AND h.record_id IN (SELECT uploaded_by FROM gk_evidence WHERE work_order_id=?)))`, [id,id])
    const contributorHolds=await count("gk_retention_scope_holds WHERE kind='user' AND held=1 AND (record_id IN (SELECT created_by FROM gk_work_orders WHERE id=?) OR record_id IN (SELECT assignee_id FROM gk_work_orders WHERE id=?) OR record_id IN (SELECT author_id FROM gk_comments WHERE work_order_id=?))",[id,id,id])
    let heldChildren=0
    for (const [table,where] of Object.entries(workChildren)) {
      const columns=await all(env, `PRAGMA table_info(${quote(table)})`)
      const text=joinText(columns.filter(c=>/TEXT/i.test(c.type)).map(c=>`COALESCE(CAST(${quote(table)}.${quote(c.name)} AS TEXT),'')`))
      heldChildren+=await count(`${quote(table)} WHERE ${where} AND EXISTS(SELECT 1 FROM gk_retention_scope_holds h WHERE h.kind='user' AND h.held=1 AND instr(${text},h.record_id)>0)`,[id])
    }
    if (holds || contributorHolds || heldChildren) blockers.push('Original or contributor hold')
  } else {
    const operator=await one(env,'SELECT status,role,version FROM oa_operators WHERE id=?',record.operator_id)
    if (record.role === 'owner' || record.status !== 'ended' || !operator || operator.status !== 'inactive' || operator.role === 'owner') blockers.push('End non-owner access first')
  }
  // Examine every current table for references, including JSON snapshots. Unknown
  // dependencies are refused rather than silently orphaned or partially erased.
  const ignored = new Set([...Object.keys(children), 'gk_api_writes', 'gk_audit','gk_record_erasure_results', kind === 'work' ? 'gk_work_orders' : 'gk_members', ...(kind === 'work' ? ['gk_connector_events'] : ['oa_operators','oa_auth_audit','oa_invitation_cancellations','gk_api_credentials'])])
  const needles = kind === 'work' ? [id] : [id,record.operator_id,record.email,record.name].filter(Boolean)
  for (const { name: table } of await all(env, "SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'gk_*' OR name GLOB 'oa_*' OR name GLOB 'oc_*' OR name GLOB 'ik_*' OR name GLOB 'rer_*') ORDER BY name")) {
    if (ignored.has(table) || table === 'gk_guard') continue
    const columns = await all(env, `PRAGMA table_info(${quote(table)})`)
    const expressions = columns.filter(c => /TEXT|BLOB/i.test(c.type)).map(c => `COALESCE(CAST(${quote(c.name)} AS TEXT),'')`)
    if (!expressions.length) continue
    const text = joinText(expressions)
    const holdTable=['gk_retention_holds','gk_retention_scope_holds'].includes(table)
    const n = await count(`${quote(table)} WHERE ${holdTable?'NOT(kind=? AND record_id=?) AND ':''}(${needles.map(() => `instr(lower(${text}),lower(?))>0`).join(' OR ')})`, [...(holdTable?[kind,id]:[]),...needles])
    if (n) { dependencies[table] = n; blockers.push(`Retained dependency: ${table}`) }
  }
  if (kind === 'work') {
    const related = await count('gk_work_orders WHERE id<>? AND (follow_up_of=? OR merged_into=?)', [id,id,id])
    if (related) blockers.push('Related work')
  }
  const lifecycle = kind === 'user' ? " AND NOT(action IN ('service.create','service.revoke','service.invalidate') AND subject IN (SELECT id FROM gk_api_credentials WHERE member_id=?))" : ''
  const otherAudit=await count('gk_audit WHERE subject<>? AND (actor=? OR instr(detail,?)>0)'+lifecycle,[id,id,id,...(kind==='user'?[id]:[])])
  if(otherAudit) blockers.push('Retained audit for another record')
  if(kind==='user') {
    const unclassifiedAudit=await count("gk_audit WHERE actor<>? AND subject<>? AND instr(detail,?)=0 AND (instr(lower(detail),lower(?))>0 OR instr(lower(detail),lower(?))>0)",[id,id,id,record.email,record.name])
    if(unclassifiedAudit) blockers.push('Other records contain identity details in retained audit')
  }
  const auditSequence = (await one(env,'SELECT COALESCE(MAX(seq),0) AS n FROM gk_audit')).n
  const token = await sha256Hex(JSON.stringify({ kind,id,record,dependencies,receiptResults,credentialMetadata,blockers,minimum,auditSequence }))
  return { kind,id,erased:false,eligible:blockers.length===0,dependencies,receiptResults,credentialMetadata,blockers,token,result:null,checks,record,auditSequence,
    obligations: ['Retained evidence is never erased. Unknown dependencies prevent erasure.', 'Anonymized audit and opaque identity markers remain. Prior downloads are outside local erasure.', 'Supply the later archive as the erasure journal to fence older restores.'] }
}

export async function eraseRecord(env: Bindings, actor: Actor, input: Input) {
  ownerOnly(actor)
  insist(input.flag('confirm'), 'erasure_confirmation_required')
  const kind=input.text('kind'), id=input.text('id')
  const preview=await recordErasurePreview(env,actor,kind,id)
  if (preview.erased) return { id, result:preview.result }
  insist(input.text('token')===preview.token,'stale',409)
  insist(preview.eligible,'record_retained',409,{ blockers:preview.blockers })
  const {record,checks,auditSequence}=preview
  const children=kind==='work'?workChildren:userChildren, key=kind==='work'?id:record.operator_id
  const receipts=receiptScope(kind,id,record)
  const result={removed:{...preview.dependencies,...(kind==='work'?{gk_work_orders:1}:{})},redacted:{apiReceiptResults:preview.receiptResults,...(preview.credentialMetadata?{credentialMetadata:preview.credentialMetadata}:{})},anonymized:kind==='user'?{members:1,operators:1}:{},retained:{audit:true,identityMarker:kind==='user'},priorDownloads:'Outside local erasure'}
  await commit(env,[
    guard(env,'stale',"EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN gk_members m ON m.operator_id=o.id WHERE s.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.operator_version=o.version AND o.status='active' AND o.role='owner' AND m.id=? AND m.status='active')",actor.sessionId,Date.now(),actor.id),
    guard(env,'stale','(SELECT COALESCE(MAX(seq),0) FROM gk_audit)=?',auditSequence),
    ...(kind==='work'?[guard(env,'stale','EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=?)',id,record.version)]:[guard(env,'stale',"EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=? AND m.status='ended' AND m.role<>'owner' AND o.status='inactive' AND o.role<>'owner')",id)]),
    ...checks!.map(check=>guard(env,'stale',`(SELECT COUNT(*) FROM ${check.sql})=?`,...check.args,check.count)),
    ...await redactionStatements(env.DB),...await invalidateTransfersStatements(env.DB),
    stmt(env,"INSERT INTO gk_guard(code,ok) VALUES('record_erasure',1)"),
    ...Object.entries(children).map(([table,where])=>stmt(env,`DELETE FROM ${quote(table)} WHERE ${where}`,key)),
    stmt(env,`UPDATE gk_api_writes SET state='failed',result_json=NULL WHERE ${receipts.where}`,...receipts.args),
    stmt(env,"UPDATE gk_audit SET detail='{}' WHERE subject=?",id),
    ...(kind==='work'?[stmt(env,'DELETE FROM gk_work_orders WHERE id=?',id)]:[
      stmt(env, "UPDATE gk_audit SET detail='{}' WHERE action IN ('service.create','service.revoke','service.invalidate') AND subject IN (SELECT id FROM gk_api_credentials WHERE member_id=?)", id),
      // Opaque credential identities retain attribution; no former bearer or
      // entered client metadata can survive eligible identity erasure.
      stmt(env, "UPDATE gk_api_credentials SET name='Erased service client',token_hash='inactive-'||id,scopes_json='[]',expires_at=0,revoked_at=COALESCE(revoked_at,?) WHERE member_id=?", now(), id),
      stmt(env,"UPDATE oa_auth_audit SET value='{}' WHERE actor_id=? OR instr(value,?)>0 OR instr(lower(value),lower(?))>0 OR instr(lower(value),lower(?))>0",record.operator_id,record.operator_id,record.email,record.name),
      stmt(env,"UPDATE gk_retention_scope_holds SET reason='Erased identity' WHERE kind='user' AND record_id=? AND held=0",id),
      stmt(env,"UPDATE oa_operators SET email=?,display_name='Erased user',version=version+1 WHERE id=?",`erased-${id}@example.invalid`,record.operator_id),
      stmt(env,"UPDATE gk_members SET name='Erased user',email=?,status='ended' WHERE id=?",`erased-${id}@example.invalid`,id),
    ]),
    stmt(env,'INSERT INTO gk_record_erasure_results(kind,record_id,result_json,erased_at) VALUES(?,?,?,?)',kind,id,JSON.stringify(result),now()),
  ],{actor:actor.id,action:`${kind}.erase`,subject:id,detail:result})
  return { id,result }
}

export async function publicRecordErasurePreview(env: Bindings, actor: Actor, url: URL) {
  const {checks,record,auditSequence,...preview}=await recordErasurePreview(env,actor,url.searchParams.get('kind')??'',url.searchParams.get('id')??'')
  return preview
}
