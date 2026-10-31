// One public-door planning journey, with real persisted work and review decisions.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { harness, file } from './harness.mjs'
import { png } from './fixtures.mjs'
const address = name => [name,'example.test'].join(String.fromCharCode(64))
const sha = value => createHash('sha256').update(value).digest('hex')

export async function dependencyFixture(h, owner, assignee, asset) {
  const today=(await h.api('me',owner)).today
  const make=async title=>(await h.api('workorder.create',owner,{asset,title,due:today,assignee})).id
  const predecessor=await make('Synthetic predecessor retained for recovery'), work=await make('Synthetic dependent retained for recovery')
  const payload={workOrder:work,version:1,predecessor,predecessorVersion:1,revision:0,active:true,reason:'Original predecessor commitment'}
  await h.api('workorder.dependency',owner,payload)
  await h.api('workorder.dependency',owner,{...payload,version:2,revision:1,active:false,reason:'Corrected predecessor commitment'})
  await h.api('workorder.dependency',owner,{...payload,version:3,revision:2,reason:'Restored predecessor commitment'})
  return {work,predecessor,payload,dependencies:(await h.api(`work/${work}`,owner)).dependencies}
}

export async function workDependenciesJourney() {
  const h=await harness({dependencyGate:true,clockInstant:Date.parse('2026-10-15T12:00:00Z')})
  let browser
  try {
    const owner=await h.owner()
    await h.api('site.configure',owner,{name:'Synthetic dependency plant',timezone:'UTC'})
    const ids={}, cookies={owner}
    for(const [name,role] of [['lead','lead'],['tech','maintainer'],['reviewer','supervisor'],['agent','agent'],['revoked','lead'],['changing','lead']]) {
      ids[name]=(await h.api('access.give',owner,{name:`Synthetic ${name}`,email:address(`synthetic-gasket-dependency-${name}`),role})).id
      cookies[name]=await h.signIn(address(`synthetic-gasket-dependency-${name}`))
    }
    const asset=(await h.api('asset.create',owner,{tag:'synthetic-gasket-dependencies',name:'Synthetic planning pump',location:'Plant'})).id
    const today=(await h.api('me',owner)).today
    const read=id=>h.api(`work/${id}`,owner)
    const make=async title=>(await h.api('workorder.create',cookies.lead,{asset,title,due:today,assignee:ids.tech,description:'Keep entered maintenance evidence'})).id
    const sourceUrl=await h.submit('workorder.create',cookies.lead,{asset,title:'Synthetic predecessor',due:today,assignee:ids.tech},'/app/work/{id}')
    const predecessor=sourceUrl.pathname.split('/').at(-1), dependent=await make('Synthetic dependent')
    const photo=(await h.api('workorder.evidence',cookies.tech,{workOrder:dependent,version:1,file:file('synthetic-gasket-dependency.png',png,'image/png')})).evidence
    const original=(await read(dependent)).evidence
    const evidence=async()=>{
      const row=await read(dependent),response=await h.raw(`/app/evidence/${photo}`,{cookie:cookies.tech})
      assert.equal(response.status,200);assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(png))
      assert.deepEqual(row.evidence,original);assert.equal(row.description,'Keep entered maintenance evidence')
    }
    const linkPayload=async(work,source,active=true)=>{
      const row=await read(work),p=await read(source),prior=row.dependencies.links.find(d=>d.predecessor_id===source)
      return {workOrder:work,version:row.version,predecessor:source,predecessorVersion:p.version,revision:prior?.revision??0,active,reason:'Synthetic predecessor change'}
    }
    const action=payload=>h.api('workorder.dependency',cookies.lead,payload)
    const snapshot=async id=>({work:await read(id),audit:(await h.api('audit?action=workorder.dependency',owner)).rows})
    const refuse=async(payload,who=cookies.lead,status=409)=>{
      const before=await snapshot(payload.workOrder)
      const result=await h.api('workorder.dependency',who,payload,status)
      assert.deepEqual(await snapshot(payload.workOrder),before,'refused link changes neither work nor attributed history')
      await evidence();return result
    }
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
    await context.addCookies(cookies.lead.split('; ').map(pair=>{const at=pair.indexOf('=');return{name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
    const page=await context.newPage()
    await page.goto(`${h.origin}/app/work/${dependent}`)
    await page.getByLabel('Find predecessor by work number').fill(String((await read(predecessor)).number))
    await page.getByRole('button',{name:'Find predecessor',exact:true}).click()
    const add=page.locator('form[action="/app/do/workorder.dependency"]')
    await add.getByLabel('Reason for link change').fill('Wait for independently reviewed predecessor')
    await add.getByRole('button',{name:'Add predecessor',exact:true}).click()
    await page.getByRole('button',{name:'Remove predecessor',exact:true}).waitFor()
    await page.locator('#dependencies').getByText('Blocked',{exact:true}).waitFor()
    assert.equal((await read(dependent)).dependencies.ready,false)
    const capture=async state=>{
      if(process.env.DEPENDENCY_SCREENSHOTS)await mkdir(process.env.DEPENDENCY_SCREENSHOTS,{recursive:true})
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:1000});await page.reload();await page.locator('#dependencies').waitFor()
        if(width===1440)assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
        if(process.env.DEPENDENCY_SCREENSHOTS)await page.screenshot({path:`${process.env.DEPENDENCY_SCREENSHOTS}/${state}-${width}.png`,fullPage:true})
      }
      await page.setViewportSize({width:1440,height:1000})
    }
    await capture('blocked')
    const sourceBeforePreview=await read(predecessor)
    const consequences=await h.api('workorders.bulk',cookies.lead,{workOrder:[predecessor],version:[String(sourceBeforePreview.version)],action:'cancel',reason:'Inspect dependency consequences',preview:true})
    assert.ok(consequences.rows[0].notes.includes(`Dependent WO-${String((await read(dependent)).number).padStart(4,'0')} requires this work to remain independently approved`))
    assert.deepEqual(await read(predecessor),sourceBeforePreview,'dependency consequence preview is read-only')
    let row=await read(dependent),before=await read(dependent)
    const blocked=await h.api('workorder.submit',cookies.tech,{workOrder:dependent,version:row.version},409)
    assert.equal(blocked.error,'not_ready_for_review');assert.ok(blocked.detail.missing.some(s=>s.includes('predecessor WO-')))
    assert.deepEqual(await read(dependent),before);await evidence()
    console.log('PROBE PLAN-005 blocked submission: public form links real work; JSON submit -> refused until predecessor independent approval, entered evidence unchanged')
    const firstLink=await linkPayload(dependent,predecessor)
    await refuse({...firstLink,version:row.version-1})
    await refuse({...firstLink,active:false,revision:0})
    await refuse({...firstLink,predecessor:dependent,predecessorVersion:row.version})
    assert.equal((await refuse(await linkPayload(predecessor,dependent))).error,'dependency_cycle')
    await refuse({...firstLink,active:false},cookies.tech,403)
    await refuse({...firstLink,active:false},cookies.reviewer,403)
    await refuse({...firstLink,active:false},cookies.agent,403)
    await refuse({...firstLink,active:false},null,401)
    const planned=(await h.api('site.create',owner,{name:'Synthetic planned dependency site',timezone:'UTC'})).id
    before=await snapshot(dependent)
    assert.equal((await h.raw('/api/gasket/workorder.dependency',{cookie:owner,body:{...firstLink,active:false},headers:{'x-gasket-site':planned}})).status,409)
    assert.deepEqual(await snapshot(dependent),before)
    await h.api('access.end',owner,{member:ids.revoked})
    before=await snapshot(dependent)
    const ended=await h.raw('/api/gasket/workorder.dependency',{cookie:cookies.revoked,body:{...firstLink,active:false}})
    assert.ok([401,403].includes(ended.status));assert.deepEqual(await snapshot(dependent),before)
    const credential=await h.api('service.create',owner,{name:'Synthetic dependency service',scopes:['work:read'],expiresAt:Date.parse('2026-10-16T12:00:00Z'),consent:true})
    assert.equal((await h.raw('/api/gasket/workorder.dependency',{headers:{authorization:`Bearer ${credential.token}`},body:{...firstLink,active:false}})).status,403)
    assert.deepEqual(await snapshot(dependent),before)
    // Removing and re-adding retains one link identity and all three attributed revisions.
    await page.locator('form[action="/app/do/workorder.dependency"]').getByLabel('Reason for link change').fill('Remove a predecessor through the human form')
    const removalResponse=page.waitForResponse(response=>response.url().endsWith('/app/do/workorder.dependency')&&response.request().method()==='POST')
    await page.getByRole('button',{name:'Remove predecessor',exact:true}).click()
    const removed=await removalResponse
    assert.equal(removed.status(),200)
    await page.getByRole('button',{name:'Remove predecessor',exact:true}).waitFor({state:'detached'})
    assert.equal((await read(dependent)).dependencies.links[0].active,0)
    await action(await linkPayload(dependent,predecessor))
    row=await read(dependent)
    assert.deepEqual(row.dependencies.history.map(d=>[d.revision,d.active,d.by]),[[1,1,'Synthetic lead'],[2,0,'Synthetic lead'],[3,1,'Synthetic lead']])
    const replay=await linkPayload(dependent,predecessor,false)
    await action(replay);assert.equal((await refuse(replay)).error,'stale');await action(await linkPayload(dependent,predecessor))
    // Cancelled or merged work is never completion evidence.
    const cancelled=await make('Synthetic cancelled predecessor'),merged=await make('Synthetic merged predecessor'),into=await make('Synthetic merge destination')
    await h.api('workorder.cancel',cookies.lead,{workOrder:cancelled,reason:'Cancelled without work'})
    await h.api('workorder.merge',cookies.lead,{workOrder:merged,into,reason:'Duplicate work'})
    for(const source of [cancelled,merged]) {
      const blockedWork=await make('Synthetic blocked dependency state');await action(await linkPayload(blockedWork,source))
      const current=await read(blockedWork)
      assert.equal(current.dependencies.ready,false)
      assert.equal((await h.api('workorder.submit',cookies.tech,{workOrder:blockedWork,version:current.version},409)).error,'not_ready_for_review')
      assert.deepEqual(await read(blockedWork),current)
    }
    const complete=async work=>{
      await h.api('workorder.submit',cookies.tech,{workOrder:work,version:(await read(work)).version})
      await h.api('workorder.review',cookies.reviewer,{workOrder:work,version:(await read(work)).version,decision:'approve'})
    }
    // A real source change after application reads is fenced by the in-batch source revision.
    const race=await make('Synthetic source race'),racePayload=await linkPayload(race,predecessor)
    const unchanged=await read(race),auditBefore=(await h.api('audit?action=workorder.dependency',owner)).rows
    h.setDependencyHook(()=>h.api('workorder.evidence',cookies.tech,{workOrder:predecessor,version:1,file:file('synthetic-gasket-source.png',png,'image/png')}))
    assert.equal((await h.api('workorder.dependency',cookies.lead,racePayload,409)).error,'stale')
    assert.deepEqual(await read(race),unchanged);assert.deepEqual((await h.api('audit?action=workorder.dependency',owner)).rows,auditBefore)
    // Revocation after the handler reads must still prevent its write batch.
    const authorityRace=await make('Synthetic authority race'),authorityPayload=await linkPayload(authorityRace,predecessor)
    const authorityBefore=await read(authorityRace),authorityAudit=(await h.api('audit?action=workorder.dependency',owner)).rows
    h.setDependencyHook(()=>h.api('access.end',owner,{member:ids.changing}))
    await h.api('workorder.dependency',cookies.changing,authorityPayload,409)
    const authorityAfter=await read(authorityRace)
    assert.deepEqual([authorityAfter.version,authorityAfter.status,authorityAfter.dependencies,authorityAfter.evidence],[authorityBefore.version,authorityBefore.status,authorityBefore.dependencies,authorityBefore.evidence])
    assert.deepEqual((await h.api('audit?action=workorder.dependency',owner)).rows,authorityAudit)
    // A submitted predecessor has no approval yet, and self-review cannot supply it.
    const ownerId=(await h.api('me',owner)).id
    const independent=(await h.api('workorder.create',owner,{asset,title:'Synthetic independent predecessor',due:today,assignee:ownerId})).id
    const protectedWork=await make('Synthetic independently gated dependent')
    await action(await linkPayload(protectedWork,independent))
    await h.api('workorder.submit',owner,{workOrder:independent,version:1})
    let pending=await read(independent)
    assert.equal((await h.api('workorder.review',owner,{workOrder:independent,version:pending.version,decision:'approve'},403)).error,'own_work')
    assert.deepEqual(await read(independent),pending)
    assert.equal((await read(protectedWork)).dependencies.ready,false)
    await h.api('workorder.review',cookies.reviewer,{workOrder:independent,version:pending.version,decision:'approve'})
    assert.equal((await read(protectedWork)).dependencies.ready,true)
    // A satisfied predecessor never supplies the required physical safety attestation.
    const checklist=(await h.api('checklist.create',owner,{name:'Synthetic isolation checklist',items:['Confirm maintenance task']})).id
    await h.api('safety.publish',owner,{checklist,hazard:'Stored energy',isolation:'Follow the approved site isolation procedure',qualification:'Synthetic isolation training',siteApproved:true})
    const template=(await h.api('template.save',owner,{name:'Synthetic isolation work',title:'Synthetic isolated repair',checklist})).id
    const isolated=(await h.api('workorder.create',owner,{asset,template,due:today,assignee:ids.tech})).id
    await action(await linkPayload(isolated,independent))
    await h.api('workorder.results',cookies.tech,{workOrder:isolated,outcome:['pass'],note:['Maintenance task recorded']})
    const isolationBefore=await read(isolated)
    assert.equal(isolationBefore.dependencies.ready,true)
    assert.equal((await h.api('workorder.submit',cookies.tech,{workOrder:isolated,version:isolationBefore.version},409)).error,'safety_evidence_required')
    assert.deepEqual(await read(isolated),isolationBefore)
    assert.deepEqual((await h.api(`work/${isolated}/safety`,cookies.tech)).attestations,[])
    console.log('PROBE PLAN-005 safety and authority: source approval grants no isolation attestation; self-review and authority revoked before persistence -> refused with unchanged work and link history')
    await complete(predecessor)
    row=await read(dependent);assert.equal(row.dependencies.ready,true)
    await capture('ready')
    // Reopen immediately before the submission batch, after its ready read.
    before=await read(dependent)
    h.setDependencyHook(()=>h.api('workorder.reopen',cookies.lead,{workOrder:predecessor,reason:'Fault returned during submission'}))
    assert.equal((await h.api('workorder.submit',cookies.tech,{workOrder:dependent,version:before.version},409)).error,'dependencies_blocked')
    row=await read(dependent);assert.equal(row.status,before.status);assert.equal(row.version,before.version);assert.equal(row.dependencies.ready,false);await evidence()
    await complete(predecessor)
    await h.api('workorder.submit',cookies.tech,{workOrder:dependent,version:row.version})
    before=await read(dependent)
    await h.api('workorder.reopen',cookies.lead,{workOrder:predecessor,reason:'Reopened after dependent submission'})
    assert.equal((await h.api('workorder.review',cookies.reviewer,{workOrder:dependent,version:before.version,decision:'approve'},409)).error,'dependencies_blocked')
    row=await read(dependent);assert.equal(row.status,'submitted');assert.equal(row.version,before.version);assert.deepEqual(row.reviews,before.reviews);await evidence()
    await complete(predecessor)
    // The same transaction check protects approval from a concurrent reopening.
    h.setDependencyHook(()=>h.api('workorder.reopen',cookies.lead,{workOrder:predecessor,reason:'Fault returned during approval'}))
    assert.equal((await h.api('workorder.review',cookies.reviewer,{workOrder:dependent,version:row.version,decision:'approve'},409)).error,'dependencies_blocked')
    assert.deepEqual((await read(dependent)).reviews,before.reviews);await evidence()
    await complete(predecessor)
    await h.api('workorder.review',cookies.reviewer,{workOrder:dependent,version:row.version,decision:'approve'})
    row=await read(dependent);assert.equal(row.status,'closed');assert.equal(row.reviews.at(-1).reviewer,'Synthetic reviewer');await evidence()
    assert.equal((await h.api('workorder.review',cookies.reviewer,{workOrder:dependent,version:row.version,decision:'approve'},409)).error,'not_submitted')
    assert.deepEqual(await read(dependent),row)
    await context.close()
    console.log('PROBE PLAN-005 revision and authority: public human form and JSON -> attributed link revisions; self, cycle, stale, replay, signed-out, forbidden, service, revoked and planned-site writes refused without effects')
    console.log('PROBE PLAN-005 readiness: independent predecessor closure -> ready; reopening after submission and inside submission or approval -> refusal without lost evidence; fresh independent review closes successfully')
  } finally {await browser?.close();await h.close()}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await workDependenciesJourney()
