// Extends the existing retention and recovery journeys through public doors.
import assert from 'node:assert/strict'
import { file } from './harness.mjs'
import { png } from './fixtures.mjs'
const imageType=['image','png'].join('/')

export async function erasureFixture(h, owner, asset) {
  const accessBody={name:'synthetic-gasket-erased-person',email:'synthetic-gasket-erased@example.test',role:'maintainer'},accessHeaders={'idempotency-key':'synthetic-gasket-erasure-access-'+asset}
  const access=await h.raw('/api/gasket/v1/access.give',{cookie:owner,body:accessBody,headers:accessHeaders})
  assert.equal(access.status,200)
  const person=await access.json()
  const cookie = await h.signIn('synthetic-gasket-erased@example.test')
  const createBody={asset,title:'synthetic-gasket-erased-work',description:'synthetic-gasket-erased-description',due:(await h.api('me',owner)).today,assignee:(await h.api('me',owner)).id}
  const createHeaders={'idempotency-key':'synthetic-gasket-erasure-create-'+asset}
  const created=await h.raw('/api/gasket/v1/workorder.create',{cookie:owner,body:createBody,headers:createHeaders})
  assert.equal(created.status,200)
  const work=(await created.json()).id
  const field=(await h.api('workfield.save',owner,{label:'Synthetic receipt field '+asset,kind:'text'})).id
  const fieldBody={workOrder:work,field,value:'synthetic-gasket-erased-retry-value'},fieldHeaders={'idempotency-key':'synthetic-gasket-erasure-field-'+asset}
  const captured=await h.raw('/api/gasket/v1/workorder.field',{cookie:owner,body:fieldBody,headers:fieldHeaders})
  assert.equal(captured.status,200)
  assert.equal((await captured.json()).value,fieldBody.value)
  const photo = (await h.api('workorder.evidence',owner,{workOrder:work,version:(await h.api(`work/${work}`,owner)).version,file:file('synthetic-gasket-erased-original.png',png,imageType)})).evidence
  await h.api('comment.post',owner,{workOrder:work,body:'synthetic-gasket-erased-comment',mention:[person.id]})
  return {person:person.id,cookie,work,photo,retries:{createBody,createHeaders,fieldBody,fieldHeaders,accessBody,accessHeaders}}
}
const preview = (h,owner,kind,id) => h.api(`record-erasure-preview?kind=${kind}&id=${id}`,owner)
export async function eraseFixture(h,owner,fixture,{screens=false}={}) {
  const {person,cookie,work,photo}=fixture
  await h.api(`record-erasure-preview?kind=work&id=${work}`,cookie,undefined,403)
  await h.api('record.erase',cookie,{kind:'work',id:work,confirm:true,token:'synthetic-gasket-1'},403)
  assert.equal((await h.raw(`/app/settings/erasure?kind=work&id=${work}`,{cookie})).status,403)
  const active=await preview(h,owner,'user',person)
  assert.equal(active.eligible,false)
  assert.ok(active.blockers.includes('End non-owner access first'))
  await h.api('record.erase',owner,{kind:'user',id:person,token:active.token,confirm:true},409)
  const own=await preview(h,owner,'user',(await h.api('me',owner)).id)
  assert.equal(own.eligible,false,'owner identity is retained')
  const hold=await h.api('retention.hold',owner,{kind:'work',id:work,held:true,revision:0,reason:'synthetic-gasket-hold'})
  const held=await preview(h,owner,'work',work)
  if(screens) await erasureScreens(h,owner,work,'held')
  assert.equal(held.eligible,false);assert.ok(held.blockers.includes('Legal hold'))
  await h.api('record.erase',owner,{kind:'work',id:work,token:held.token,confirm:true},409)
  assert.deepEqual(Buffer.from(await (await h.raw(`/app/evidence/${photo}`,{cookie:owner})).arrayBuffer()),png,'held original bytes survive refusal')
  await h.api('retention.hold',owner,{kind:'work',id:work,held:false,revision:hold.revision,reason:'synthetic-gasket-release'})
  const minimum=await h.api('retention.policy',owner,{kind:'maintenance_records',minimumDays:1,revision:0,reason:'synthetic-gasket-minimum'})
  const retained=await preview(h,owner,'work',work)
  assert.equal(retained.eligible,false);assert.ok(retained.blockers.includes('Minimum retention age'))
  await h.api('record.erase',owner,{kind:'work',id:work,token:retained.token,confirm:true},409)
  await h.api('retention.policy',owner,{kind:'maintenance_records',minimumDays:0,revision:minimum.revision,reason:'synthetic-gasket-release'})
  const before=await preview(h,owner,'work',work)
  assert.equal(before.eligible,true,JSON.stringify(before.blockers))
  assert.ok(before.receiptResults>=2,'preview discloses the copied API results that will be redacted')
  assert.equal(before.dependencies.gk_evidence,1);assert.equal(before.dependencies.gk_comments,1)
  await h.api('record.erase',owner,{kind:'work',id:work,token:before.token},400)
  await h.api('workorder.evidence',owner,{workOrder:work,version:(await h.api(`work/${work}`,owner)).version,file:file('synthetic-gasket-erased-second.png',png,imageType)})
  await h.api('record.erase',owner,{kind:'work',id:work,token:before.token,confirm:true},409)
  const ready=await preview(h,owner,'work',work)
  if(screens) await erasureScreens(h,owner,work,'eligible')
  const applied=await h.submit('record.erase',owner,{kind:'work',id:work,token:ready.token,confirm:'yes'},`/app/settings/erasure?kind=work&id=${work}`)
  assert.equal(applied.searchParams.get('error'),null)
  const result=(await preview(h,owner,'work',work)).result
  assert.ok(result.redacted.apiReceiptResults>=2)
  assert.deepEqual(result.removed,{...ready.dependencies,gk_work_orders:1})
  assert.deepEqual(result.retained,{audit:true,identityMarker:false})
  assert.deepEqual((await h.api('record.erase',owner,{kind:'work',id:work,confirm:true})).result,result)
  await h.api(`work/${work}`,owner,undefined,404)
  const createReplay=await h.raw('/api/gasket/v1/workorder.create',{cookie:owner,body:fixture.retries.createBody,headers:fixture.retries.createHeaders})
  assert.equal(createReplay.status,409)
  assert.equal((await createReplay.json()).error,'idempotency_failed','erasure retains the claim so a retry cannot recreate the work')
  const fieldReplay=await h.raw('/api/gasket/v1/workorder.field',{cookie:owner,body:fixture.retries.fieldBody,headers:fixture.retries.fieldHeaders})
  assert.equal(fieldReplay.status,404)
  assert.ok(!(await fieldReplay.text()).includes(fixture.retries.fieldBody.value),'a retry cannot expose an erased copied field value')
  assert.equal((await h.raw(`/app/evidence/${photo}`,{cookie:owner})).status,404)
  const audit=(await h.api('audit?action=workorder',owner)).rows.filter(row=>row.subject===work)
  assert.ok(audit.length>=3)
  assert.ok(audit.every(row=>row.detail==='{}'),'erasure redacts retained work audit payloads')
  await h.api('access.end',owner,{member:person})
  const userHold=await h.api('retention.hold',owner,{kind:'user',id:person,held:true,revision:0,reason:'synthetic-gasket-hold'})
  const heldUser=await preview(h,owner,'user',person)
  assert.equal(heldUser.eligible,false);assert.ok(heldUser.blockers.includes('Legal hold'))
  await h.api('record.erase',owner,{kind:'user',id:person,token:heldUser.token,confirm:true},409)
  await h.api('retention.hold',owner,{kind:'user',id:person,held:false,revision:userHold.revision,reason:'synthetic-gasket-release'})
  const userPolicy=await h.api('retention.policy',owner,{kind:'users',minimumDays:1,revision:0,reason:'synthetic-gasket-user-minimum'})
  const youngUser=await preview(h,owner,'user',person)
  assert.equal(youngUser.eligible,false);assert.ok(youngUser.blockers.includes('Minimum retention age'))
  await h.api('record.erase',owner,{kind:'user',id:person,token:youngUser.token,confirm:true},409)
  await h.api('retention.policy',owner,{kind:'users',minimumDays:0,revision:userPolicy.revision,reason:'synthetic-gasket-release'})
  const user=await preview(h,owner,'user',person)
  assert.equal(user.eligible,true,JSON.stringify(user.blockers))
  const roster=(await h.api('sites/primary',owner)).members
  assert.ok(roster.some(row=>row.member_id===person && row.status==='ended'))
  assert.equal(user.dependencies.gk_site_memberships,1)
  if(screens) await erasureScreens(h,owner,person,'eligible-user','user')
  const erased=await h.api('record.erase',owner,{kind:'user',id:person,token:user.token,confirm:true})
  assert.ok(erased.result.redacted.apiReceiptResults>=1)
  const accessReplay=await h.raw('/api/gasket/v1/access.give',{cookie:owner,body:fixture.retries.accessBody,headers:fixture.retries.accessHeaders})
  assert.equal(accessReplay.status,409)
  assert.equal((await accessReplay.json()).error,'idempotency_failed','an erased identity cannot be invited again by replaying its old grant')
  assert.deepEqual(erased.result.anonymized,{members:1,operators:1})
  assert.equal(erased.result.removed.gk_site_memberships,1)
  assert.deepEqual((await h.api('sites/primary',owner)).members,roster.filter(row=>row.member_id!==person),'erasure removes only this person’s site access records')
  assert.deepEqual((await h.api('record.erase',owner,{kind:'user',id:person,confirm:true})).result,erased.result)
  const tombstone=(await h.api('members',owner)).find(row=>row.id===person)
  assert.equal(tombstone.name,'Erased user');assert.equal(tombstone.status,'ended');assert.ok(!tombstone.email.includes('synthetic-gasket-erased@'))
  assert.ok([401,403].includes((await h.raw('/api/gasket/me',{cookie})).status))
  if(screens) {await erasureScreens(h,owner,work,'erased');await erasureScreens(h,owner,person,'erased-user','user')}
}

// These refusals protect retained contributions and history through the same door.
export async function erasureGuards(h, owner, asset, cases=['contributor','audit','mention']) {
  const today=(await h.api('me',owner)).today, ownerId=(await h.api('me',owner)).id
  const create=async title=>(await h.api('workorder.create',owner,{asset,title,due:today,assignee:ownerId})).id
  if(cases.includes('contributor')) {
    const member=(await h.api('access.give',owner,{name:'synthetic-gasket-held-contributor',email:'synthetic-gasket-held-contributor@example.test',role:'maintainer'})).id
    const cookie=await h.signIn('synthetic-gasket-held-contributor@example.test')
    const work=await create('synthetic-gasket-held-time')
    await h.api('workorder.collaborate',owner,{workOrder:work,member})
    await h.api('workorder.time',cookie,{workOrder:work,version:(await h.api(`work/${work}`,owner)).version,workedOn:today,minutes:25,note:'synthetic-gasket-retained-minutes'})
    await h.api('workorder.collaborate',owner,{workOrder:work,member,remove:true})
    const before=await h.api(`work/${work}`,owner)
    assert.equal(before.timeEntries.length,1);assert.equal(before.timeEntries[0].minutes,25)
    const hold=await h.api('retention.hold',owner,{kind:'user',id:member,held:true,revision:0,reason:'synthetic-gasket-contributor-hold'})
    const held=await preview(h,owner,'work',work)
    assert.equal(held.eligible,false,'a held former contributor retains their time entry and work')
    await h.api('record.erase',owner,{kind:'work',id:work,token:held.token,confirm:true},409)
    assert.deepEqual(await h.api(`work/${work}`,owner),before,'refusal leaves all 25 minutes and the work unchanged')
    await h.api('retention.hold',owner,{kind:'user',id:member,held:false,revision:hold.revision,reason:'synthetic-gasket-contributor-release'})
    const ready=await preview(h,owner,'work',work)
    assert.equal(ready.eligible,true,JSON.stringify(ready.blockers))
    const erased=await h.api('record.erase',owner,{kind:'work',id:work,token:ready.token,confirm:true})
    assert.equal(erased.result.removed.gk_time_entries,1)
    await h.api(`work/${work}`,owner,undefined,404)
  }
  if(cases.includes('audit')) {
    const member=(await h.api('access.give',owner,{name:'synthetic-gasket-ended-lead',email:'synthetic-gasket-ended-lead@example.test',role:'lead'})).id
    const cookie=await h.signIn('synthetic-gasket-ended-lead@example.test')
    const work=await create('synthetic-gasket-held-reschedule'), due='2027-01-02'
    const changed=await h.api('workorders.bulk',cookie,{workOrder:[work],version:[String((await h.api(`work/${work}`,owner)).version)],action:'reschedule',due})
    assert.equal(changed.rows[0].outcome,'changed')
    await h.api('retention.hold',owner,{kind:'work',id:work,held:true,revision:0,reason:'synthetic-gasket-audit-hold'})
    await h.api('access.end',owner,{member})
    const audit=async ()=>(await h.api('audit?action=workorder.reschedule',owner)).rows.filter(row=>row.subject===work)
    const before=await audit(), record=await h.api(`work/${work}`,owner)
    assert.equal(before.length,1)
    const detail=JSON.parse(before[0].detail)
    assert.deepEqual(detail,{from:today,to:due,bulk:changed.batch})
    const held=await preview(h,owner,'user',member)
    assert.equal(held.eligible,false,'an ended lead cannot erase another retained record audit')
    await h.api('record.erase',owner,{kind:'user',id:member,token:held.token,confirm:true},409)
    assert.deepEqual(await audit(),before,'old and new due dates and audit attribution survive refused erasure')
    assert.deepEqual(await h.api(`work/${work}`,owner),record)
  }
  if(cases.includes('mention')) {
    const member=(await h.api('access.give',owner,{name:'synthetic-gasket-mentioned',email:'synthetic-gasket-mentioned@example.test',role:'maintainer'})).id
    const cookie=await h.signIn('synthetic-gasket-mentioned@example.test'),work=await create('synthetic-gasket-mention-erasure')
    await h.api('comment.post',owner,{workOrder:work,body:'synthetic-gasket-mentioned-comment',mention:[member]})
    const ready=await preview(h,owner,'work',work)
    assert.equal(ready.eligible,true,JSON.stringify(ready.blockers))
    assert.equal(ready.dependencies.gk_comments,1);assert.equal(ready.dependencies.gk_notices,1)
    const erased=await h.api('record.erase',owner,{kind:'work',id:work,token:ready.token,confirm:true})
    assert.equal(erased.result.removed.gk_comments,1);assert.equal(erased.result.removed.gk_notices,1)
    await h.api(`work/${work}`,owner,undefined,404)
    assert.equal((await h.raw('/app/notices',{cookie})).status,200)
  }
}

export async function erasureScreens(h,owner,work,label,kind='work') {
  const {chromium}=await import('@playwright/test'),{mkdir}=await import('node:fs/promises')
  const directory=process.env.RETENTION_SCREENSHOTS??'/tmp/gasket-record-erasure'
  await mkdir(directory,{recursive:true})
  const browser=await chromium.launch({headless:true,...(process.env.GASKET_CHROMIUM?{executablePath:process.env.GASKET_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
  try {
    for(const width of [1440,390]) {
      const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}})
      await context.addCookies(owner.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
      const page=await context.newPage()
      assert.equal((await page.goto(h.origin+`/app/settings/erasure?kind=${kind}&id=${work}`)).status(),200)
      await page.getByRole('heading',{name:'Erasure preview',exact:true}).waitFor()
      if(width===1440) assert.match(await page.locator('main').innerText(),label==='held'?/Retained: erasure refused/:label.startsWith('eligible')?/Eligible for owner-confirmed erasure/:/Already erased/)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      assert.deepEqual(await page.locator('button,a,[role=button]').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&!n.querySelector('img[alt]')&&!n.getAttribute('data-tooltip')).map(n=>n.outerHTML)),[])
      await page.screenshot({path:`${directory}/erasure-${label}-${width}.png`,fullPage:true})
      await context.close()
    }
  } finally {await browser.close()}
}
