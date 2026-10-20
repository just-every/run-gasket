// AGENT-006: duplicate merge proposals use the built Worker's public doors.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { harness } from './harness.mjs'
import { installation } from './installation.mjs'

// Upgrade an existing installation with immutable outcome rows referencing proposals.
// This exercises the same Wrangler migration command an owner runs, not a schema mock.
async function migrationProof() {
  const old = await installation()
  const migration = 'migrations/core/0070_merge_proposals.sql'
  const run = promisify(execFile)
  const sql = async command => JSON.parse((await run(join(old.root,'node_modules/.bin/wrangler'),
    ['d1','execute','foundation','--local','--persist-to','.wrangler/state','--config','wrangler.jsonc','--json','--command',command],
    {cwd:old.root,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'},maxBuffer:4*1024*1024})).stdout)
  try {
    await rm(join(old.root,migration))
    await old.migrate()
    await sql(`INSERT INTO gk_members(id,email,name,role,created_at) VALUES ('migration-owner','migration@example.test','Migration owner','owner',1);
      INSERT INTO gk_proposals(id,kind,payload_json,payload_hash,basis_json,reasoning,prepared_by,prepared_at,status,decided_by,result_id) VALUES ('migration-proposal','interval','{}','legacy-hash','{}','Retained approved interval','migration-owner',1,'approved','migration-owner','legacy-schedule');
      INSERT INTO gk_outcome_windows(id,proposal_id,baseline_from,baseline_to,post_from,post_to,peers_json,source_revision,source_approved_at,recorded_by,recorded_at) VALUES ('migration-window','migration-proposal','2026-01-01','2026-01-02','2026-01-03','2026-01-04','[]',1,1,'migration-owner',1);
      INSERT INTO gk_outcome_assessments(id,proposal_id,source_hash,report_json,recorded_by,recorded_at) VALUES ('migration-assessment','migration-proposal','retained-source','{"status":"unproven","marker":"retained"}','migration-owner',1);`)
    const read = 'SELECT * FROM gk_proposals; SELECT * FROM gk_outcome_windows; SELECT * FROM gk_outcome_assessments;'
    const before = (await sql(read)).map(result=>result.results)
    await copyFile(new URL('../../'+migration,import.meta.url),join(old.root,migration))
    await old.migrate()
    assert.deepEqual((await sql(read)).map(result=>result.results),before,'AGENT-006 migration preserves proposals and both AGENT-004 foreign-key children')
    assert.deepEqual((await sql('PRAGMA foreign_key_check;'))[0].results,[])
    await assert.rejects(()=>sql("UPDATE gk_proposals SET status='pending' WHERE id='migration-proposal'"),/gasket_immutable/,'AGENT-006 upgrade keeps terminal decisions immutable')
    await sql(`INSERT INTO gk_merge_proposals(id,kind,payload_json,payload_hash,basis_json,reasoning,prepared_by,prepared_at) VALUES ('migration-merge','merge','{}','merge-hash','{}','Retained duplicate proposal','migration-owner',2);`)
    assert.deepEqual((await sql('SELECT kind FROM gk_all_proposals ORDER BY kind'))[0].results,[{kind:'interval'},{kind:'merge'}],'AGENT-006 combined read door includes both proposal stores')
    await sql("UPDATE gk_merge_proposals SET status='rejected' WHERE id='migration-merge'")
    await assert.rejects(()=>sql("UPDATE gk_merge_proposals SET status='pending' WHERE id='migration-merge'"),/gasket_immutable/,'AGENT-006 new merge decisions are immutable too')
    console.log('AGENT-006 populated proposal/outcome migration passed')
  } finally { await old.remove() }
}

export async function agentStockJourney() {
  await migrationProof()
  const h=await harness()
  try {
    const cookie={owner:await h.owner()},ids={}
    await h.api('site.configure',cookie.owner,{name:'Lake Erie Bearing Maintenance',timezone:'America/New_York'})
    for(const [key,role] of [['lead','lead'],['max','maintainer'],['sam','supervisor'],['agent','agent']]) {
      ids[key]=(await h.api('access.give',cookie.owner,{name:`${key} Lake Erie`,email:`${key}@example.test`,role})).id
      cookie[key]=await h.signIn(`${key}@example.test`)
    }
    const today=(await h.api('me',cookie.lead)).today
    const part=async(number,name,unit='each')=>(await h.api('part.create',cookie.lead,{number,name,unit,location:'Bearing shelf A3'})).id
    const source=await part('6205-OLD','6205 sealed drive bearing, former supplier number')
    const canonical=await part('6205-CANON','6205 sealed drive bearing, approved canonical stock number')
    const incompatible=await part('GREASE','Bearing grease','kg')
    const asset=(await h.api('asset.create',cookie.lead,{tag:'CONV-AGENT',name:'Assembly conveyor drive',location:'Hall 2'})).id
    const work=(await h.api('workorder.create',cookie.lead,{asset,title:'Conveyor bearing replacement',due:today,assignee:ids.max})).id
    await h.api('part.receive',cookie.lead,{part:source,quantity:'5',unitPrice:'10'})
    await h.api('part.receive',cookie.lead,{part:canonical,quantity:'6',unitPrice:'8'})
    await h.api('workorder.issue',cookie.max,{workOrder:work,part:source,quantity:'2'})
    await h.api('workorder.reserve',cookie.lead,{workOrder:work,part:canonical,quantity:'1'})
    const prepare=(who,payload={source,canonical,reason:'Confirmed identical 6205 manufacturer and stocking unit; keep both source histories'})=>h.api('proposal.prepare',cookie[who],{kind:'merge',payload,reasoning:'Duplicate bearing numbers split stock visibility. Consolidate identity without inferring any physical delivery.'})
    const decide=(proposal,who='lead',decision='approve',status=200)=>h.api('proposal.decide',cookie[who],{proposal:proposal.id,hash:proposal.hash,decision,note:decision==='reject'?'Keep separate until physically checked':undefined},status)
    assert.equal((await h.raw('/api/gasket/proposal.prepare',{body:{kind:'merge',payload:{source,canonical,reason:'No session'},reasoning:'No session'}})).status,401)
    await h.api('proposal.prepare',cookie.max,{kind:'merge',payload:{source,canonical,reason:'No grant'},reasoning:'No grant'},403)
    await h.api('proposal.prepare',cookie.agent,{kind:'merge',payload:{source,canonical:incompatible,reason:'Different units'},reasoning:'Cannot add each and kilograms'},409)
    const prepared=await prepare('agent')
    let retained=(await h.api('proposals',cookie.agent)).find(p=>p.id===prepared.id)
    assert.deepEqual(retained.basis.balances.map(b=>[b.number,b.quantity,b.valueCents]).sort(),[['6205-CANON','6',4800],['6205-OLD','3',3000]])
    assert.deepEqual(retained.basis.combined,{quantity:'9',unit:'each',valueCents:7800})
    assert.deepEqual([retained.basis.quantityDelta,retained.basis.valueDeltaCents],['0',0])
    assert.equal(retained.basis.movements.length,3)
    assert.ok(retained.basis.movements.some(m=>m.kind==='issue'&&m.workOrder===work&&m.quantity==='-2'&&m.valueCents===-2000),'AGENT-006 cites actual work consumption and retained value')
    assert.equal(retained.basis.references.gk_reservations,1)
    assert.ok(!JSON.stringify(retained.basis).includes('gk_replenishment_envelopes'),'AGENT-006 proposal does not expose restricted envelope records')
    assert.equal((await h.api(`parts/${source}`,cookie.agent)).id,source,'AGENT-006 preparation changes no part identity')
    await decide(prepared,'agent','approve',403)
    await h.api('part.merge.approve',cookie.agent,{source,canonical,fingerprint:retained.basis.fingerprint,reason:'Agent cannot merge directly'},403)
    await h.api('part.receive',cookie.agent,{part:source,quantity:'100',unitPrice:'10'},403)
    await h.api('proposal.prepare',cookie.agent,{kind:'receive',payload:{part:source,quantity:'100'},reasoning:'An inferred receipt is unsupported'},400)
    // Staff physically count the shelf after the proposal. Changed evidence must refuse it.
    const observed=await h.api(`parts/${source}`,cookie.lead)
    await h.api('part.count',cookie.lead,{part:source,counted:'2',seen:observed.seen,revision:observed.revision,note:'Physical shelf count: one missing bearing after issue'})
    const auditBefore=(await h.api('audit',cookie.owner)).rows.length
    assert.equal((await decide(prepared,'lead','approve',409)).error,'proposal_stale')
    assert.equal((await h.api('audit',cookie.owner)).rows.length,auditBefore,'AGENT-006 failed decision has no business or audit write')
    assert.equal((await h.api('proposals',cookie.lead)).find(p=>p.id===prepared.id).status,'pending')
    await decide(prepared,'lead','reject')
    // A preparer cannot approve their own proposal, even with the ordinary lead grant.
    const own=await prepare('lead')
    assert.equal((await decide(own,'lead','approve',403)).error,'own_proposal')
    await decide(own,'owner','reject')
    const fresh=await prepare('agent')
    const sourceBefore=await h.api(`parts/${source}`,cookie.lead),canonicalBefore=await h.api(`parts/${canonical}`,cookie.lead)
    retained=(await h.api('proposals',cookie.lead)).find(p=>p.id===fresh.id)
    assert.deepEqual(retained.basis.combined,{quantity:'8',unit:'each',valueCents:6800})
    const oldMoves=[...sourceBefore.moves,...canonicalBefore.moves].map(m=>[m.id,m.quantity_milli,m.value_cents,m.at,m.source_part_id]).sort()
    if(process.env.STOCK_SCREENSHOTS) {
      const { agentStockBrowser }=await import('./agent-stock-browser.mjs')
      await agentStockBrowser({h,cookie,proposal:fresh,source,canonical})
    } else await decide(fresh)
    const merged=await h.api(`parts/${source}`,cookie.agent)
    assert.deepEqual([merged.id,merged.onHand,merged.reserved,merged.available,merged.valueCents],[canonical,'8','1','7',6800],'AGENT-006 approved merge conserves quantities, reservations and USD value')
    assert.deepEqual(merged.moves.map(m=>[m.id,m.quantity_milli,m.value_cents,m.at,m.source_part_id]).sort(),oldMoves,'AGENT-006 merge writes no inferred movement or replacement history')
    const final=(await h.api('proposals',cookie.lead)).find(p=>p.id===fresh.id)
    assert.equal(final.status,'approved');assert.equal(final.decided_by,ids.lead);assert.equal(final.result_id,canonical)
    assert.deepEqual(final.basis,retained.basis,'AGENT-006 retained evidence stays immutable after approval')
    assert.equal(merged.merges[0].approved_by,ids.lead)
    const audit=await h.api('audit?action=proposal.approve',cookie.owner)
    assert.ok(audit.rows.some(row=>row.subject===fresh.id&&row.actor===ids.lead))
    await decide(fresh,'owner','approve',409)
    const freshAudit=await h.api('audit?action=part.merge',cookie.owner)
    assert.equal(freshAudit.rows.filter(row=>row.subject===canonical).length,1,'AGENT-006 retry never repeats a merge')
    await h.api('workorder.return',cookie.max,{workOrder:work,part:canonical,quantity:'1'})
    assert.deepEqual((await h.api(`parts/${canonical}`,cookie.lead)).moves.filter(m=>m.kind==='return').map(m=>m.value_cents),[1000],'AGENT-006 old issues retain their original return value')
    console.log('AGENT-006 cited duplicate proposals, physical count staleness, independent approval and conserved history passed')
  } finally {await h.close()}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) await agentStockJourney()
