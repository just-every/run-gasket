// AGENT-005: agent queries and promised dates through the built Worker's public doors.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { harness } from './harness.mjs'
import { offset, zone } from './clock.mjs'

export async function agentFollowUpJourney() {
  const initial = await harness()
  let h = initial
  try {
    const cookie = { owner: await h.owner() }, ids = {}
    await h.api('site.configure', cookie.owner, { name: 'Great Lakes Compressor Works', timezone: zone })
    for (const [key, role] of [['lead','lead'],['max','maintainer'],['mo','maintainer'],['sam','supervisor'],['agent','agent']]) {
      ids[key] = (await h.api('access.give', cookie.owner, { name: `${key} Great Lakes`, email: `${key}@example.test`, role })).id
      cookie[key] = await h.signIn(`${key}@example.test`)
    }
    const today = (await h.api('me',cookie.owner)).today
    const days = n => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10) }
    const asset = (await h.api('asset.create',cookie.lead,{tag:'CMP-204',name:'Assembly line compressor with remote intake and access platform',location:'West production hall'})).id
    const checklist = (await h.api('checklist.create',cookie.lead,{name:'Compressor noise inspection',items:['Listen for bearing noise']})).id
    const schedule = (await h.api('schedule.create',cookie.lead,{asset,checklist,title:'Inspect compressor bearing and guards before production restarts',everyDays:30,firstDue:days(-3),assignee:ids.max})).id
    const generated = await h.api('workorders.generate',cookie.lead,{})
    const pm = generated.created.find(w=>w.schedule===schedule).id
    await h.api('workorder.submit',cookie.max,{workOrder:pm,version:(await h.api(`work/${pm}`,cookie.max)).version},409)
    await h.api('agent.closure',cookie.agent,{workOrder:pm,reasoning:'No inspection evidence yet'},409)
    await h.api('workorder.results',cookie.max,{workOrder:pm,item:['0'],outcome:['fail'],note:['Bearing rattles at startup']})
    await h.api('finding.record',cookie.max,{workOrder:pm,item:0,severity:'high',text:'Replace the noisy bearing',followUp:true})
    let work = await h.api(`work/${pm}`,cookie.owner)
    const finding = work.findings[0], repair = finding.follow_up_id
    assert.ok(repair)
    await h.api('workorder.assign',cookie.lead,{workOrder:repair,assignee:ids.mo})
    await h.api('workorder.acknowledge',cookie.mo,{workOrder:repair})
    await h.api('finding.record',cookie.mo,{workOrder:repair,severity:'low',text:'Bearing replaced, guards refitted and startup check completed'})
    await h.api('workorder.submit',cookie.mo,{workOrder:repair,version:(await h.api(`work/${repair}`,cookie.mo)).version})
    await h.api('blocker.raise',cookie.max,{workOrder:pm,kind:'parts',nextAction:'Collect the approved bearing from stores and arrange platform access',promisedOn:today})
    await h.api('blocker.raise',cookie.max,{workOrder:pm,kind:'access',nextAction:'Obtain production access to the compressor platform',promisedOn:today})
    await h.api('chase.rule',cookie.lead,{remindBeforeDays:1,responseWithinDays:1,leadAfterDays:90,supervisorAfterDays:180})
    const state = await h.api(`agent-follow-up/${pm}`,cookie.agent)
    assert.equal(state.acknowledgedAt,null); assert.equal(state.findings[0].id,finding.id)
    assert.deepEqual(state.blockers.map(b=>b.kind).sort(),['access','parts'])
    assert.equal(state.linked[0].status,'submitted');assert.equal(state.closureReady,false)
    assert.equal(state.escalationDue,false,'lead policy holds escalation before its interval or a missed promise')
    await h.api('agent.escalate',cookie.agent,{workOrder:pm},409)
    await h.api(`agent-follow-up/${pm}`,cookie.max,undefined,403)
    assert.equal((await h.raw(`/api/gasket/agent-follow-up/${pm}`)).status,401)
    await h.api('agent.query',cookie.max,{workOrder:pm,version:state.version,question:'What happens next?'},403)
    await h.api('agent.query',cookie.agent,{workOrder:pm,version:state.version-1,question:'What happens next?'},409)
    await h.api('agent.query',cookie.agent,{workOrder:pm,version:state.version,recipient:ids.mo,question:'What happens next?'},409)
    const question = {workOrder:pm,version:state.version,question:'When will the bearing and production access be ready, and what is the next action?'}
    const query = (await h.api('agent.query',cookie.agent,question)).id
    assert.equal((await h.api('agent.query',cookie.agent,question)).id,query,'retry keeps one question')
    assert.equal((await h.api('notices',cookie.max)).filter(n=>n.kind==='agent_query').length,1)
    await h.api('agent.answer',cookie.mo,{query,nextAction:'Invented answer',promisedOn:today},403)
    await h.api('agent.answer',cookie.max,{query,nextAction:'Collect bearing',promisedOn:days(-1)},400)
    if(process.env.AGENT_SCREENSHOTS) {
      const { agentFollowUpBrowser } = await import('./agent-follow-up-browser.mjs')
      await agentFollowUpBrowser({h,cookie,pm,query,today})
    } else {
      const answered = await h.submit('agent.answer',cookie.max,{query,nextAction:'Collect bearing and confirm production access with the shift lead',promisedOn:today},`/app/work/${pm}`)
      assert.ok(answered.searchParams.has('notice'))
    }
    await h.api('agent.answer',cookie.max,{query,nextAction:'Another answer',promisedOn:today},409)
    const reviewQuery = (await h.api('agent.query',cookie.agent,{workOrder:repair,version:(await h.api(`work/${repair}`,cookie.agent)).version,question:'Please review the repair evidence and confirm the next action.'})).id
    assert.equal((await h.api(`agent-follow-up/${repair}`,cookie.agent)).queries.find(q=>q.id===reviewQuery).recipient_id,ids.sam)
    assert.equal((await h.api(`agent-follow-up/${repair}`,cookie.agent)).unanswered.length,0,'question is within its approved response interval')
    const promisedToday=await h.api(`agent-follow-up/${pm}`,cookie.agent)
    assert.equal(promisedToday.missed.length,0,'today remains within the promised site-local day')
    assert.equal(promisedToday.escalationDue,false,'answered query and today promises do not bypass lead policy')
    // The existing installation reopens two days later. No product clock/test endpoint is added.
    await h.stop()
    h = await harness({installation:initial.installation,vars:initial.vars,clockOffset:offset+2*86_400_000})
    cookie.owner = await h.signIn(initial.vars.OWNER_EMAIL)
    for(const key of ['lead','max','mo','sam','agent']) cookie[key]=await h.signIn(`${key}@example.test`)
    const later = await h.api(`agent-follow-up/${pm}`,cookie.agent)
    assert.equal(later.missed[0].id,query);assert.equal(later.missed[0].promised_on,today)
    assert.equal(later.missedBlockers.length,2);assert.equal(later.escalationDue,true)
    const escalated = await h.api('agent.escalate',cookie.agent,{workOrder:pm})
    assert.ok(escalated.recipients.includes(ids.lead))
    for(const source of ['parts','access',today,'Collect bearing','submitted']) {
      if(source==='submitted') assert.equal(later.linked[0].status,source)
      else assert.ok(escalated.text.includes(source),`context includes ${source}`)
    }
    await h.api('agent.escalate',cookie.agent,{workOrder:pm})
    assert.equal((await h.api('notices',cookie.lead)).filter(n=>n.kind==='agent_escalation').length,1,'retry sends one contextual escalation')
    assert.equal((await h.api(`agent-follow-up/${repair}`,cookie.agent)).unanswered[0].id,reviewQuery)
    const proposal = {kind:'reassign',payload:{workOrder:pm,assignee:ids.mo,note:'Missed bearing and access promise; Mo can coordinate the next shift'},reasoning:`PM ${pm}, query ${query}, parts/access promises ${today}; independent lead decision required.`}
    const prepared = await h.api('proposal.prepare',cookie.agent,proposal)
    assert.equal((await h.api(`work/${pm}`,cookie.owner)).assignee_id,ids.max,'proposal changes no assignment')
    await h.api('proposal.decide',cookie.agent,{proposal:prepared.id,decision:'approve',hash:prepared.hash},403)
    await h.api('workorder.assign',cookie.agent,{workOrder:pm,assignee:ids.mo},403)
    const basis = (await h.api('proposals',cookie.lead)).find(p=>p.id===prepared.id).basis
    assert.equal(basis.queries[0].id,query);assert.equal(basis.blockers.length,2)
    await h.api('blocker.resolve',cookie.max,{blocker:later.blockers[0].id,resolution:'Stores supplied the bearing'})
    await h.api('proposal.decide',cookie.lead,{proposal:prepared.id,decision:'approve',hash:prepared.hash},409)
    const fresh = await h.api('proposal.prepare',cookie.agent,proposal)
    if(process.env.AGENT_SCREENSHOTS) {
      const { proposalBrowser } = await import('./agent-follow-up-browser.mjs')
      await proposalBrowser({h,cookie,id:fresh.id})
    } else await h.api('proposal.decide',cookie.lead,{proposal:fresh.id,decision:'approve',hash:fresh.hash})
    assert.equal((await h.api(`work/${pm}`,cookie.owner)).assignee_id,ids.mo)
    assert.equal((await h.api(`work/${pm}`,cookie.owner)).acknowledged_at,null)
    assert.equal((await h.api('proposals',cookie.owner)).find(p=>p.id===fresh.id).status,'approved')
    // Agent recommendations never bypass technician submission or independent review.
    for(const id of [pm,repair]) {
      await h.api('agent.closure',cookie.agent,{workOrder:id,reasoning:'Close it now'},409)
      await h.api('workorder.submit',cookie.agent,{workOrder:id,version:1},403)
      await h.api('workorder.review',cookie.agent,{workOrder:id,version:1,decision:'approve'},403)
    }
    await h.api('workorder.review',cookie.mo,{workOrder:repair,version:(await h.api(`work/${repair}`,cookie.mo)).version,decision:'approve'},403)
    await h.api('workorder.review',cookie.sam,{workOrder:repair,version:(await h.api(`work/${repair}`,cookie.sam)).version,decision:'approve'})
    await h.api('blocker.resolve',cookie.mo,{blocker:later.blockers[1].id,resolution:'Production access confirmed by shift lead'})
    work = await h.api(`work/${pm}`,cookie.mo)
    await h.api('workorder.submit',cookie.mo,{workOrder:pm,version:work.version})
    await h.api('agent.closure',cookie.agent,{workOrder:pm,reasoning:'Still awaiting supervisor'},409)
    await h.api('workorder.review',cookie.sam,{workOrder:pm,version:(await h.api(`work/${pm}`,cookie.sam)).version,decision:'approve'})
    const verified=await h.api(`agent-follow-up/${pm}`,cookie.agent)
    assert.equal(verified.closureReady,true);assert.equal(verified.linked[0].status,'closed')
    const before=await h.api(`work/${pm}`,cookie.owner)
    assert.deepEqual(await h.api('agent.closure',cookie.agent,{workOrder:pm,reasoning:'Reviewed inspection and linked bearing repair both independently approved.'}),{id:pm,recommendation:'verified_closed',changedWork:false})
    assert.deepEqual(await h.api(`work/${pm}`,cookie.owner),before,'recommendation rewrites no work or finding')
    const audit=await h.api('audit?action=agent.closure',cookie.owner)
    assert.ok(audit.rows.some(row=>row.subject===pm&&row.actor===ids.agent))
    await h.api('workorder.reopen',cookie.lead,{workOrder:repair,reason:'Bearing rattles again'})
    assert.equal((await h.api(`agent-follow-up/${pm}`,cookie.agent)).closureReady,false,'reopened linked corrective outcome invalidates closure recommendation')
    await h.api('agent.closure',cookie.agent,{workOrder:pm,reasoning:'Earlier approval is insufficient'},409)
    console.log('AGENT-005 queries, missed promises, contextual escalation, human reassignment and verified linked closure passed')
  } finally { if(h!==initial) await h.close(); await initial.close() }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) await agentFollowUpJourney()
