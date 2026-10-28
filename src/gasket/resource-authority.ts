import type { Bindings } from '../auth.server'
import { capabilitySql, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'

// Both membership revision and operator generation are bound at grant time.
// Ending and later reinstating either authority cannot silently revive a grant.
const LIVE = `g.active=1 AND g.site_id='primary'
 AND (g.kind='tool' OR EXISTS(SELECT 1 FROM gk_members t JOIN gk_site_memberships tm ON tm.member_id=t.id WHERE t.id=g.target_id AND t.status='active' AND tm.site_id=g.site_id AND tm.status='active'))
 AND EXISTS(SELECT 1 FROM gk_sites s WHERE s.id=g.site_id AND s.state='active')
 AND EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id
  JOIN gk_site_memberships sm ON sm.member_id=m.id AND sm.site_id=g.site_id
  WHERE m.id=g.grantee_id AND m.status='active' AND m.role IN ('lead','maintainer','supervisor')
  AND o.status='active' AND o.version=g.grantee_version AND sm.status='active' AND sm.revision=g.membership_revision)
 AND EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id
  WHERE m.id=g.granted_by AND m.status='active' AND o.status='active' AND o.role='owner' AND o.version=g.issuer_version)`

export async function resourceGrants(env: Bindings, actor: Actor) {
  insist(!actor.service,'forbidden',403)
  return all(env,`SELECT g.*,m.name AS steward,t.name AS person,${LIVE} AS effective FROM gk_resource_grants g
    JOIN gk_members m ON m.id=g.grantee_id LEFT JOIN gk_members t ON t.id=g.target_id
    WHERE (? OR g.grantee_id=?) ORDER BY g.changed_at,g.id`,actor.role==='owner'?1:0,actor.id)
}

export function resourceAuthoritySql(actor: Actor, kind: string, target: string, name: string) {
  const owner=capabilitySql(actor.sessionId,'site.manage')
  return {sql:`(${owner.sql}) OR EXISTS(SELECT 1 FROM gk_resource_grants g
    JOIN gk_members m ON m.id=g.grantee_id JOIN oa_sessions s ON s.operator_id=m.operator_id
    JOIN oa_operators o ON o.id=m.operator_id
    WHERE g.grantee_id=? AND g.kind=? AND g.target_id=? AND g.name=? COLLATE NOCASE AND ${LIVE}
    AND s.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.operator_version=o.version)`,
    params:[...owner.params,actor.id,kind,target,name,actor.sessionId,now()]}
}

export async function resourceAuthority(env: Bindings, actor: Actor, kind: string, target: string, name: string) {
  insist(!actor.service,'forbidden',403)
  const authority=resourceAuthoritySql(actor,kind,target,name)
  insist(await one(env,`SELECT 1 WHERE ${authority.sql}`,...authority.params),'forbidden',403)
  return guard(env,'resource_authority_ended',authority.sql,...authority.params)
}

export async function saveResourceGrant(env: Bindings, actor: Actor, input: Input) {
  insist(actor.role==='owner'&&!actor.service,'forbidden',403)
  const id=input.text('id',{optional:true})||newId(), reason=input.text('reason',{max:500})
  const seen=input.integer('revision',{min:0})!, enabled=input.flag('enabled')
  const previous=await one(env,'SELECT * FROM gk_resource_grants WHERE id=?',id)
  const authority=capabilitySql(actor.sessionId,'site.manage')
  if(previous) {
    insist(seen===previous.revision,'stale',409)
    // A revoked grant stays revoked. Restoring stewardship uses a fresh explicit grant.
    insist(!enabled,'new_grant_required',409)
    await commit(env,[guard(env,'forbidden',authority.sql,...authority.params),
      guard(env,'stale','EXISTS(SELECT 1 FROM gk_resource_grants WHERE id=? AND revision=?)',id,seen),
      stmt(env,'UPDATE gk_resource_grants SET active=0,revision=revision+1,changed_at=?,reason=? WHERE id=?',now(),reason,id)],
      {actor:actor.id,action:'resource.grant.revoke',subject:id,detail:{revision:seen,reason}})
    return {id}
  }
  insist(seen===0&&enabled&&input.flag('consent'),'grant_consent_required')
  const grantee=input.text('grantee'), site=input.text('site'), kind=input.text('kind'), target=input.text('target',{optional:true}), name=input.text('name',{max:120})
  insist(site==='primary'&&await one(env,"SELECT 1 FROM gk_sites WHERE id='primary' AND state='active'"),'site_not_operational',409)
  insist(kind==='qualification'||kind==='tool','invalid_resource_kind')
  insist(kind==='tool'?target==='':Boolean(target),'invalid_resource_scope')
  insist(kind!=='qualification'||name.length<=80,'too_long_name')
  const duplicate="SELECT 1 FROM gk_resource_grants WHERE grantee_id=? AND site_id=? AND kind=? AND target_id=? AND name=? COLLATE NOCASE AND active=1"
  const scope=[grantee,site,kind,target,name]
  insist(!await one(env,duplicate,...scope),'resource_grant_exists',409)
  const member=await one(env,`SELECT o.version,sm.revision FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id
    JOIN gk_site_memberships sm ON sm.member_id=m.id AND sm.site_id=?
    WHERE m.id=? AND m.status='active' AND m.role IN ('lead','maintainer','supervisor') AND o.status='active' AND sm.status='active'`,site,grantee)
  insist(member,'steward_not_active',409)
  if(kind==='qualification') insist(await one(env,"SELECT 1 FROM gk_members m JOIN gk_site_memberships sm ON sm.member_id=m.id WHERE m.id=? AND m.status='active' AND m.role IN ('owner','lead','maintainer') AND sm.site_id=? AND sm.status='active'",target,site),'member_not_assignable',409)
  const issuer=await one(env,'SELECT o.version FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=?',actor.id)
  await commit(env,[guard(env,'forbidden',authority.sql,...authority.params),
    guard(env,'resource_grant_exists',`NOT EXISTS(${duplicate})`,...scope),
    guard(env,'steward_not_active',`EXISTS(SELECT 1 FROM gk_members m JOIN oa_operators o ON o.id=m.operator_id JOIN gk_site_memberships sm ON sm.member_id=m.id WHERE m.id=? AND m.status='active' AND m.role IN ('lead','maintainer','supervisor') AND o.status='active' AND o.version=? AND sm.site_id=? AND sm.status='active' AND sm.revision=?)`,grantee,member.version,site,member.revision),
    stmt(env,'INSERT INTO gk_resource_grants VALUES(?,?,?,?,?,?,1,1,?,?,?,?,?,?)',id,grantee,site,kind,target,name,member.version,member.revision,actor.id,issuer.version,now(),reason)],
    {actor:actor.id,action:'resource.grant',subject:id,detail:{grantee,site,kind,target,name,reason,consent:true}})
  return {id}
}
