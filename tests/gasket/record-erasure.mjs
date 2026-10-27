// Extends the existing retention and recovery journeys through public doors.
import assert from 'node:assert/strict'
import { file } from './harness.mjs'
import { png } from './fixtures.mjs'
const imageType=['image','png'].join('/')

export async function erasureFixture(h, owner, asset) {
  const person = await h.api('access.give',owner,{name:'synthetic-gasket-erased-person',email:'synthetic-gasket-erased@example.test',role:'maintainer'})
  const cookie = await h.signIn('synthetic-gasket-erased@example.test')
  const work = (await h.api('workorder.create',owner,{asset,title:'synthetic-gasket-erased-work',description:'synthetic-gasket-erased-description',due:(await h.api('me',owner)).today,assignee:(await h.api('me',owner)).id})).id
  const photo = (await h.api('workorder.evidence',owner,{workOrder:work,version:1,file:file('synthetic-gasket-erased-original.png',png,imageType)})).evidence
  await h.api('comment.post',owner,{workOrder:work,body:'synthetic-gasket-erased-comment'})
  return {person:person.id,cookie,work,photo}
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
  assert.equal(before.dependencies.gk_evidence,1);assert.equal(before.dependencies.gk_comments,1)
  await h.api('record.erase',owner,{kind:'work',id:work,token:before.token},400)
  await h.api('workorder.evidence',owner,{workOrder:work,version:(await h.api(`work/${work}`,owner)).version,file:file('synthetic-gasket-erased-second.png',png,imageType)})
  await h.api('record.erase',owner,{kind:'work',id:work,token:before.token,confirm:true},409)
  const ready=await preview(h,owner,'work',work)
  if(screens) await erasureScreens(h,owner,work,'eligible')
  const applied=await h.submit('record.erase',owner,{kind:'work',id:work,token:ready.token,confirm:'yes'},`/app/settings/erasure?kind=work&id=${work}`)
  assert.equal(applied.searchParams.get('error'),null)
  const result=(await preview(h,owner,'work',work)).result
  assert.deepEqual(result.removed,{...ready.dependencies,gk_work_orders:1})
  assert.deepEqual(result.retained,{audit:true,identityMarker:false})
  assert.deepEqual((await h.api('record.erase',owner,{kind:'work',id:work,confirm:true})).result,result)
  await h.api(`work/${work}`,owner,undefined,404)
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
  if(screens) await erasureScreens(h,owner,person,'eligible-user','user')
  const erased=await h.api('record.erase',owner,{kind:'user',id:person,token:user.token,confirm:true})
  assert.deepEqual(erased.result.anonymized,{members:1,operators:1})
  assert.deepEqual((await h.api('record.erase',owner,{kind:'user',id:person,confirm:true})).result,erased.result)
  const tombstone=(await h.api('members',owner)).find(row=>row.id===person)
  assert.equal(tombstone.name,'Erased user');assert.equal(tombstone.status,'ended');assert.ok(!tombstone.email.includes('synthetic-gasket-erased@'))
  assert.ok([401,403].includes((await h.raw('/api/gasket/me',{cookie})).status))
  if(screens) {await erasureScreens(h,owner,work,'erased');await erasureScreens(h,owner,person,'erased-user','user')}
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
