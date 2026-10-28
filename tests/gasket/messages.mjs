// One public-door journey: retained direct text, live participant authority and personal read state.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { harness } from './harness.mjs'

const address = name => [name, 'example.test'].join(String.fromCharCode(64))
const send = (conversation, body, submissionKey = randomUUID()) => ({ conversation, body, submissionKey })

export async function messagesJourney() {
  let h = await harness()
  const installation = h.installation, vars = h.vars
  try {
    const owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Synthetic maintenance site', timezone: 'UTC' })
    const people = {}, cookies = {}
    for (const [key, name, role] of [['tech','Toni Technician','maintainer'],['lead','Lee Lead','lead'],['other','Sid Supervisor','supervisor'],['agent','Synthetic agent','agent']]) {
      people[key] = (await h.api('access.give', owner, { name, email: address(`synthetic-gasket-${key}`), role })).id
      cookies[key] = await h.signIn(address(`synthetic-gasket-${key}`))
    }
    const ownerId = (await h.api('me', owner)).id
    const directory = await h.api('message-people', cookies.tech)
    assert.ok(directory.some(person => person.id === people.lead))
    assert.ok(directory.some(person => person.id === ownerId))
    assert.ok(!JSON.stringify(directory).includes('email'), 'the conversation picker reveals no contacts')
    assert.ok(!directory.some(person => [people.agent,people.tech].includes(person.id)))
    await h.api('conversation.start', cookies.tech, { member: people.agent }, 409)
    await h.api('conversation.start', cookies.tech, { member: people.tech }, 400)
    const id = (await h.api('conversation.start', cookies.tech, { member: people.lead })).id
    assert.equal((await h.api('conversation.start', cookies.lead, { member: people.tech })).id, id, 'the fixed pair is retry-safe from either participant')
    assert.equal((await h.api('conversations', cookies.tech)).length, 1)
    const first = send(id, 'synthetic-gasket-original: Pump isolated.\nPlease inspect before restart.')
    const accepted = await h.api('message.send', cookies.tech, first)
    assert.equal(accepted.replayed, false)
    assert.deepEqual([accepted.message.author_id,accepted.message.author,accepted.message.body], [people.tech,'Toni Technician',first.body])
    assert.ok(Number.isSafeInteger(accepted.message.created_at))
    const replayed = await h.api('message.send', cookies.tech, first)
    assert.equal(replayed.replayed, true)
    assert.deepEqual(replayed.message, accepted.message, 'losing the response never duplicates or retimes the message')
    await h.api('message.send', cookies.tech, { ...first, body: 'synthetic-gasket-changed' }, 409)
    await h.api('message.send', cookies.tech, { ...first, author: people.lead }, 400)
    const alternate = (await h.api('conversation.start', cookies.tech, { member: people.other })).id
    await h.api('message.send', cookies.tech, { ...first, conversation: alternate }, 409)
    const duplicate = send(id,'synthetic-gasket-concurrent-retry')
    const concurrent = await Promise.all([h.api('message.send',cookies.tech,duplicate),h.api('message.send',cookies.tech,duplicate)])
    assert.equal(new Set(concurrent.map(result=>result.message.id)).size,1)
    assert.deepEqual(concurrent.map(result=>result.replayed).sort(),[false,true])
    assert.deepEqual((await h.api('conversations', cookies.lead)).map(row=>row.unread),[2])
    assert.equal((await h.api(`conversations/${id}`, cookies.tech)).unread,0)
    await h.submit('conversation.read', cookies.lead, { conversation: id, through: accepted.message.seq }, `/app/messages/${id}`)
    assert.equal((await h.api(`conversations/${id}`, cookies.lead)).unread,1,'a read marker covers only the messages the reader saw')
    const latest = (await h.api(`conversations/${id}`, cookies.lead)).messages.at(-1).seq
    await h.api('conversation.read', cookies.lead, { conversation: id, through: latest })
    await h.api('conversation.read', cookies.lead, { conversation: id, through: accepted.message.seq })
    assert.equal((await h.api(`conversations/${id}`, cookies.lead)).unread,0,'old read retries never move the marker backwards')
    await h.api('conversation.read', cookies.lead, { conversation: id, through: latest + 1000 },409)
    const formReply = await h.submit('message.send', cookies.lead, send(id,'synthetic-gasket-reply: Inspection complete.'), `/app/messages/${id}`)
    assert.equal(formReply.searchParams.get('notice'),'Saved.')
    assert.equal((await h.api(`conversations/${id}`, cookies.tech)).unread,1,'read state is independent for each participant')
    assert.equal((await h.api(`conversations/${id}`, cookies.lead)).unread,0)

    const protectedSnapshot = await h.api(`conversations/${id}`, cookies.tech)
    const assertNoContent = async response => {
      assert.ok([401,403,404].includes(response.status),`refused with ${response.status}`)
      const text = await response.text()
      assert.ok(!text.includes(first.body) && !text.includes('Inspection complete.'))
    }
    for (const who of [owner,cookies.other,cookies.agent,undefined]) {
      await assertNoContent(await h.raw(`/api/gasket/conversations/${id}`,{cookie:who}))
      const page = await h.raw(`/app/messages/${id}`,{cookie:who})
      if (!who) assert.equal(page.status,303)
      else await assertNoContent(page)
      await assertNoContent(await h.raw('/api/gasket/message.send',{cookie:who,body:send(id,'synthetic-gasket-forbidden')}))
      await assertNoContent(await h.raw('/api/gasket/conversation.read',{cookie:who,body:{conversation:id,through:latest}}))
      const denied = await h.raw('/app/do/message.send',{cookie:who,form:new URLSearchParams({...send(id,'synthetic-gasket-forbidden-form'),returnTo:`/app/messages/${id}`})})
      if(who) {assert.equal(denied.status,303);assert.ok(new URL(denied.headers.get('location'),h.origin).searchParams.has('error'))}
      else assert.equal(denied.status,401)
    }
    assert.deepEqual(await h.api('conversations',owner),[],'an owner has no conversation-reading bypass')
    assert.deepEqual((await h.api('conversations',cookies.other)).map(row=>row.id),[alternate],'only the other conversation is visible')
    assert.ok(!(await h.api('conversations',cookies.other)).some(row=>row.id===id))
    const service = await h.api('service.create',owner,{name:'Synthetic service',scopes:['assets:read'],expiresAt:Date.now()+86400000,consent:true})
    for(const path of ['/api/gasket/conversations','/api/gasket/message-people',`/api/gasket/conversations/${id}`,'/app/messages',`/app/messages/${id}`])
      await assertNoContent(await h.raw(path,{headers:{authorization:`Bearer ${service.token}`}}))
    for(const action of ['message.send','conversation.read','conversation.start'])
      await assertNoContent(await h.raw(`/api/gasket/${action}`,{headers:{authorization:`Bearer ${service.token}`},body:send(id,'synthetic-gasket-service')}))
    const planned = (await h.api('site.create',owner,{name:'Planned site',timezone:'UTC'})).id
    await h.api('site.membership',owner,{site:planned,member:people.tech,status:'active',manager:false,revision:0})
    for(const path of ['/api/gasket/conversations','/api/gasket/message-people',`/api/gasket/conversations/${id}`,'/app/messages',`/app/messages/${id}`]) {
      const response=await h.raw(path,{cookie:cookies.tech,headers:{'x-gasket-site':planned}})
      assert.equal(response.status,409)
      assert.ok(!(await response.text()).includes(first.body))
    }
    assert.equal((await h.raw('/api/gasket/message.send',{cookie:cookies.tech,headers:{'x-gasket-site':planned},body:first})).status,409)
    assert.equal((await h.raw('/app/do/conversation.read',{cookie:cookies.tech,headers:{'x-gasket-site':planned},form:new URLSearchParams({conversation:id,through:String(latest)})})).status,409)
    const audit=(await h.api('audit?action=message.send',owner)).rows
    assert.equal(audit.length,3,'each accepted message has one audit event; retries and refusals add none')
    assert.ok(audit.every(row=>row.subject===id && JSON.parse(row.detail).siteId==='primary'))
    assert.ok(!JSON.stringify(await h.api('audit',owner)).includes('synthetic-gasket-original'),'audit never contains the text')
    const csv=await (await h.raw('/app/audit.csv',{cookie:owner})).text()
    assert.ok(csv.includes('message.send') && !csv.includes('Pump isolated.') && !csv.includes('Inspection complete.'))
    assert.deepEqual(await h.api(`conversations/${id}`,cookies.tech),protectedSnapshot,'all refused doors leave the conversation unchanged')
    await messagesBrowser(h,cookies,id)

    // A process restart retains original messages, timestamps and each read marker.
    const beforeRestart=await h.api(`conversations/${id}`,cookies.lead)
    await h.stop()
    h=await harness({installation,vars})
    cookies.tech=await h.signIn(address('synthetic-gasket-tech'))
    cookies.lead=await h.signIn(address('synthetic-gasket-lead'))
    const ownerAgain=await h.signIn(vars.OWNER_EMAIL)
    assert.deepEqual(await h.api(`conversations/${id}`,cookies.lead),beforeRestart)
    assert.deepEqual((await h.api('message.send',cookies.tech,first)).message,accepted.message,'replay remains stable after restart')
    // A current role change, sign-out and explicit revocation fence old sessions.
    await h.api('access.role',ownerAgain,{member:people.tech,role:'agent'})
    await assertNoContent(await h.raw(`/api/gasket/conversations/${id}`,{cookie:cookies.tech}))
    await h.api('message.send',cookies.tech,first,403)
    await h.api('access.role',ownerAgain,{member:people.tech,role:'maintainer'})
    const signedOut=cookies.tech
    assert.equal((await h.raw('/auth/signout',{cookie:signedOut,body:{}})).status,204)
    await assertNoContent(await h.raw(`/api/gasket/conversations/${id}`,{cookie:signedOut}))
    cookies.tech=await h.signIn(address('synthetic-gasket-tech'))
    const session=await (await h.raw('/auth/session',{cookie:cookies.tech})).json()
    assert.equal((await h.raw('/auth/session/revoke',{cookie:ownerAgain,body:{sessionId:session.id}})).status,204)
    await assertNoContent(await h.raw(`/api/gasket/conversations/${id}`,{cookie:cookies.tech}))
    await h.api('message.send',cookies.tech,first,401)
    await h.api('access.end',ownerAgain,{member:people.lead})
    await assertNoContent(await h.raw(`/api/gasket/conversations/${id}`,{cookie:cookies.lead}))
    cookies.tech=await h.signIn(address('synthetic-gasket-tech'))
    assert.equal((await h.api(`conversations/${id}`,cookies.tech)).canSend,false)
    await h.api('message.send',cookies.tech,first,409)
    const preview=await h.api(`record-erasure-preview?kind=user&id=${people.lead}`,ownerAgain)
    assert.equal(preview.eligible,false)
    assert.ok(preview.dependencies.gk_conversations>0 && preview.dependencies.gk_messages>0)
    await h.api('record.erase',ownerAgain,{kind:'user',id:people.lead,token:preview.token,confirm:true},409)
    const retained=await h.api(`conversations/${id}`,cookies.tech)
    const originals = messages => messages.map(({unread,...message})=>message)
    assert.deepEqual(originals(retained.messages),originals(beforeRestart.messages))
    assert.equal(retained.unread,0)
    console.log('Direct messaging: durable retries, independent reads, participant privacy, access loss and retained identity passed')
  } finally { await h.stop(); await installation.remove() }
}

async function messagesBrowser(h,cookies,id) {
  const { chromium }=await import('@playwright/test')
  const browser=await chromium.launch({headless:true,...(process.env.GASKET_CHROMIUM?{executablePath:process.env.GASKET_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
  try {
    const directory=process.env.MESSAGE_SCREENSHOTS
    if(directory)await mkdir(directory,{recursive:true})
    for(const width of [1440,390]) {
      const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}})
      await context.addCookies(cookies.tech.split('; ').map(pair=>{const at=pair.indexOf('=');return{name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
      const page=await context.newPage()
      await page.goto(h.origin+'/app/messages')
      await page.getByRole('heading',{name:'Messages',exact:true,level:1}).waitFor()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      if(directory)await page.screenshot({path:`${directory}/messages-list-${width}.png`,fullPage:true})
      await page.getByRole('link',{name:'Lee Lead',exact:true}).click()
      await page.getByRole('heading',{name:'Lee Lead',exact:true,level:1}).waitFor()
      if(width===1440) {
        assert.match(await page.locator('main').innerText(),/Pump isolated\./)
        assert.match(await page.locator('main').innerText(),/Toni Technician/)
        await page.getByRole('button',{name:'Mark read',exact:true}).click()
        await page.getByRole('status').filter({hasText:'All messages read.'}).waitFor()
        await page.getByLabel('Message',{exact:true}).fill('synthetic-gasket-browser: Ready for handoff.')
        await page.getByRole('button',{name:'Send message',exact:true}).click()
        await page.getByText('synthetic-gasket-browser: Ready for handoff.',{exact:true}).waitFor()
        const thread=await h.api(`conversations/${id}`,cookies.tech)
        assert.equal(thread.unread,0)
        assert.equal(thread.messages.at(-1).body,'synthetic-gasket-browser: Ready for handoff.')
        assert.equal((await h.api(`conversations/${id}`,cookies.lead)).unread,1)
      }
      await page.evaluate(async()=>{await document.fonts.ready})
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`conversation fits ${width}`)
      const small=await page.locator('main').evaluate(el=>[...el.querySelectorAll('p,label,button,textarea,time')].some(node=>parseFloat(getComputedStyle(node).fontSize)<13))
      assert.equal(small,false,'conversation text is readable')
      if(directory)await page.screenshot({path:`${directory}/messages-thread-${width}.png`,fullPage:true})
      await context.close()
    }
  } finally {await browser.close()}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await messagesJourney()
