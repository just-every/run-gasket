import assert from 'node:assert/strict'
import { randomBytes, randomUUID, webcrypto } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './harness.mjs'
import { autonomousPolicy, heldPolicy, policyEnvelope, signJws } from '../../src/modules/agent-door/conformance/crypto.mjs'

const instant = Date.parse('2026-10-30T12:00:00Z')
const email = name => `${name}@${'example.test'}`
const code = answer => answer.result?._meta?.['com.runeditrun/error']?.code ?? answer.error?.data?.code
const decision = answer => answer.result?._meta?.['com.runeditrun/decision']
const content = answer => {
  assert.equal(answer.result?.isError, false, `specialist completed: ${code(answer)}`)
  assert.ok(answer.result?.structuredContent, 'the specialist returns its accepted native result')
  return answer.result.structuredContent
}

/** Native sponsor continuity, through emitted Worker and person doors only. */
export default async function specialistContinuity() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const kid = randomUUID(), issuer = 'https://synthetic-gasket-company.invalid', installationId = randomUUID()
  const publicKeys = { [kid]: await webcrypto.subtle.exportKey('jwk', pair.publicKey) }
  const ownerSubject = 'synthetic-gasket-owner', leadSubject = 'synthetic-gasket-lead', techSubject = 'synthetic-gasket-maintainer'
  const vars = { OWNER_EMAIL: email('synthetic-gasket-owner'), SETUP_TOKEN: randomBytes(32).toString('hex'), SESSION_SECRET: randomBytes(32).toString('hex'),
    RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId, RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(publicKeys),
    RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience: 'self-host', subject: installationId, email: email('synthetic-gasket-owner'), keys: publicKeys }) }
  const h = await harness({ vars, clockInstant: instant })
  let browser
  try {
    const owner = await h.owner()
    const ownerPerson = await h.api('me', owner)
    await h.api('site.configure', owner, { name: 'Synthetic maintenance workshop', timezone: 'UTC' })
    const team = [
      { id: leadSubject, email: email('synthetic-gasket-lead'), name: 'Synthetic maintenance lead', role: 'admin', invite: 1 },
      { id: techSubject, email: email('synthetic-gasket-maintainer'), name: 'Synthetic assigned maintainer', role: 'member', invite: 1 },
    ]
    let rosterRevision = 0
    async function roster(members) {
      const iat = instant / 1000
      const settings = await signJws(pair.privateKey, kid, 'rer-business-settings+jwt', { v: 1, iss: issuer, aud: 'self-host', sub: installationId,
        business: 'synthetic-gasket-company', email: vars.OWNER_EMAIL, owner_id: ownerSubject, jti: randomUUID(), iat, exp: iat + 3600,
        rev: ++rosterRevision, values: {}, logo: null, team: members })
      const response = await h.raw('/api/rer/business-settings', { body: { settings } })
      assert.equal(response.status, 200, 'the company team is applied by its public signed door')
      return response.json()
    }
    const invited = await roster(team)
    assert.deepEqual(invited.team.map(row => row.state), ['invited', 'invited'])
    for (const member of team) assert.ok(h.mails.some(mail => [mail.to].flat().some(to => to.includes(member.email))), 'native invitations reach the captured mail edge')
    const lead = await h.signIn(team[0].email), technician = await h.signIn(team[1].email)
    const leadPerson = await h.api('me', lead), techPerson = await h.api('me', technician)
    assert.equal(leadPerson.role, 'lead'); assert.equal(techPerson.role, 'maintainer')
    assert.notEqual(ownerPerson.id, leadPerson.id)
    const forbiddenIssuance = await h.api('service.create', lead, { name: 'Synthetic refused issuance', scopes: ['assets:read'], expiresAt: instant + 3600000, consent: true }, 403)
    assert.equal(forbiddenIssuance.error, 'forbidden', 'lead receives no service credential issuance authority')

    const surface = JSON.parse(await readFile(new URL('../../agent-surface.json', import.meta.url), 'utf8'))
    const scopes = [...new Set(surface.tools.map(tool => tool.scope))].join(' ')
    const specialists = [
      { sub: ownerSubject, person: ownerPerson, email: vars.OWNER_EMAIL, agent: randomUUID(), name: 'Synthetic owner specialist', cookie: owner },
      { sub: leadSubject, person: leadPerson, email: team[0].email, agent: randomUUID(), name: 'Synthetic lead specialist', cookie: lead },
    ]
    async function token(sponsor) {
      const iat = instant / 1000
      return signJws(pair.privateKey, kid, 'at+jwt', { iss: issuer, aud: `${h.origin}/mcp`, sub: sponsor.sub, email: sponsor.email,
        act: { sub: sponsor.agent, name: sponsor.name, specialist: surface.specialist }, client_id: 'synthetic-gasket-specialist', scope: scopes,
        business: 'synthetic-gasket-company', consent: `synthetic-gasket-${sponsor.sub}`, jti: randomUUID(), iat, exp: iat + 300 })
    }
    let rpcId = 0
    async function mcp(sponsor, method, params = {}, signedOut = false) {
      const name = method === 'tools/call' ? params.name : undefined
      const response = await h.raw('/mcp', { headers: { ...(signedOut ? {} : { Authorization: `Bearer ${await token(sponsor)}` }),
        'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': method, ...(name ? { 'Mcp-Name': name } : {}) },
        body: { jsonrpc: '2.0', id: ++rpcId, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': { elicitation: { url: {} } } } } } })
      return { status: response.status, ...await response.json() }
    }
    const tool = (sponsor, name, args, requestState) => mcp(sponsor, 'tools/call', { name, arguments: args, ...(requestState ? { requestState } : {}) })
    async function person(path, cookie = owner, body) {
      const response = await h.raw(path, { cookie, body })
      const result = await response.json()
      assert.equal(response.status, 200, `native person door ${path}: ${JSON.stringify(result)}`)
      return result
    }
    const context = { origin: h.origin, signer: { privateKey: pair.privateKey, kid, issuer, installationId }, business: 'synthetic-gasket-company', now: instant, seq: 0, revision: 0 }
    async function policy(document, options) {
      const signed = await policyEnvelope(context, document, options)
      const response = await h.raw('/api/rer/agent-policy', { body: { policy: signed.policy } })
      assert.equal(response.status, 200, 'company answers enter through the ordinary policy door')
      context.seq = signed.payload.seq; context.revision = signed.payload.revision
    }
    const maintenance = async () => ({ assets: await h.api('assets', owner), work: await h.api('work', owner), procedures: await h.api('checklists', owner), audit: await h.api('audit', owner) })
    const assetArgs = specialists.map((_, i) => ({ tag: `synthetic-gasket-${i}`, name: `Synthetic specialist pump ${i}`, location: 'Workshop', idempotency_key: randomUUID() }))
    const beforeSetup = await maintenance()
    for (const [i, sponsor] of specialists.entries()) {
      assert.equal(code(await tool(sponsor, 'gasket.assets.create', assetArgs[i])), 'policy_unset')
      assert.deepEqual(await maintenance(), beforeSetup, 'an unanswered company policy changes no maintenance facts or native audit')
    }
    console.log('PROBE SURFACE-007 setup: MCP create before company answers -> policy_unset and no maintenance effects; identical request keys retained')
    await policy(autonomousPolicy())
    for (const sponsor of specialists) {
      const docs = await h.raw('/docs/agents')
      assert.equal(docs.status, 200)
      const documentation = await docs.text()
      const discovered = await mcp(sponsor, 'server/discover')
      assert.equal(discovered.status, 200); assert.ok(discovered.result.instructions.includes(surface.specialist))
      const listed = await mcp(sponsor, 'tools/list')
      for (const job of ['gasket.assets.create', 'gasket.assets.update', 'gasket.work.create', 'gasket.procedures.publish']) {
        assert.ok(listed.result.tools.some(tool => tool.name === job), 'the specialist discovers the jobs it executes')
        assert.ok(documentation.includes(job), 'public documentation describes each executed job')
      }
      const resources = await mcp(sponsor, 'resources/templates/list'), prompts = await mcp(sponsor, 'prompts/list')
      assert.ok(Array.isArray(resources.result.resourceTemplates)); assert.ok(Array.isArray(prompts.result.prompts))
    }
    const inventory = (await person('/agents/api/agents')).agents
    for (const sponsor of specialists) assert.equal(inventory.find(agent => agent.id === sponsor.agent).sponsor.id, sponsor.person.id)
    console.log('PROBE SURFACE-007 discovery: public docs and MCP discovery -> two distinct current native sponsors; declared resources and prompts inspected')

    // An ordinary human job remains independent of specialist preparation.
    const techAsset = (await h.api('asset.create', lead, { tag: 'synthetic-gasket-technician', name: 'Synthetic working pump', location: 'Workshop' })).id
    const checklist = (await h.api('checklist.create', lead, { name: 'Synthetic technician inspection', items: ['Inspect the casing condition'] })).id
    await h.api('schedule.create', lead, { asset: techAsset, checklist, title: 'Synthetic technician inspection', everyDays: 7, firstDue: '2026-10-30', assignee: techPerson.id })
    const techWork = (await h.api('workorders.generate', lead, {})).created[0].id
    browser = await chromium.launch({ headless: true, executablePath: process.env.GASKET_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
    const browserContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 } })
    await browserContext.addCookies(technician.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
    const page = await browserContext.newPage()
    const directory = process.env.GASKET_SPECIALIST_SCREENSHOTS || `/tmp/gasket-specialist-${process.pid}`
    await mkdir(directory, { recursive: true })
    const results = [], completed = []
    for (const held of [false, true]) {
      const document = held ? heldPolicy() : autonomousPolicy()
      if (held) { document.rules[0].approver = [`person:${ownerSubject}`]; document.reviewers = [`person:${ownerSubject}`] }
      if (held) await policy(document)
      for (const [i, sponsor] of specialists.entries()) {
        const phase = held ? 'held' : 'autonomous'
        const args = held ? { ...assetArgs[i], tag: `${assetArgs[i].tag}-held`, idempotency_key: randomUUID() } : assetArgs[i]
        const assetAnswer = await tool(sponsor, 'gasket.assets.create', args)
        assert.equal(decision(assetAnswer).disposition, held ? 'review' : 'autonomous')
        const asset = content(assetAnswer).id
        assert.ok((await h.api(`assets/${asset}`, lead)).name.includes('Synthetic specialist pump'))
        const procedureArgs = { name: `Synthetic ${phase} ${i} preparation`, items: ['Retain the existing physical observation; no safety attestation is made'], idempotency_key: randomUUID() }
        let procedureAnswer = await tool(sponsor, 'gasket.procedures.publish', procedureArgs)
        assert.equal(decision(procedureAnswer).disposition, held ? 'approval' : 'autonomous')
        if (held) {
          assert.equal(procedureAnswer.result.resultType, 'input_required')
          const pending = procedureAnswer.result._meta['com.runeditrun/approval']
          const path = `/agents/api/approvals/${pending.id}`
          const approval = (await person(path)).approval
          assert.equal(approval.prepared_by.for.id, sponsor.person.id)
          assert.deepEqual(approval.approvers, [`person:${ownerSubject}`])
          assert.equal(approval.revision, context.revision)
          const unchanged = await maintenance()
          const foreign = await h.raw(`${path}/approve`, { cookie: lead, body: { revision: approval.revision, summary_sha256: approval.summary_sha256 } })
          assert.equal(foreign.status, 403, 'a lead cannot substitute for the named owner approver')
          assert.deepEqual(await maintenance(), unchanged, 'the wrong approver has no maintenance effect')
          assert.ok(!(await h.api('checklists', owner)).some(row => row.name === procedureArgs.name), 'commitment is not published before approval')
          const accepted = (await person(`${path}/approve`, owner, { revision: approval.revision, summary_sha256: approval.summary_sha256 })).approval
          assert.equal(accepted.state, 'executed')
          assert.deepEqual(accepted.approvals.map(mark => mark.person), [ownerPerson.id])
          procedureAnswer = await tool(sponsor, 'gasket.procedures.publish', procedureArgs, procedureAnswer.result.requestState)
        }
        const procedure = content(procedureAnswer).id
        const published = await h.api(`checklists/${procedure}`, lead)
        assert.equal(published.revisions.length, 1)
        assert.equal(published.revisions[0].publishedBy, `${sponsor.name} for ${sponsor.person.name}`)
        const workArgs = { asset, title: `Synthetic ${phase} ${i} preparation work`, description: 'Follow the retained observation; physical completion remains with the assigned maintainer', due: '2026-10-30', assignee: techPerson.id, idempotency_key: randomUUID() }
        if (held && i === 1) {
          assert.equal((await page.goto(`${h.origin}/app/work/${techWork}`)).status(), 200)
          const form = page.locator('form[action="/app/do/workorder.results"]')
          await form.locator('[name=outcome-0][value=pass]').check()
          await form.getByLabel('Note', { exact: true }).fill('Synthetic technician result entered before Pause')
          const beforePause = await maintenance()
          await person('/agents/api/pause', owner, { paused: true })
          for (const specialist of specialists) {
            assert.equal(code(await tool(specialist, 'gasket.work.create', workArgs)), 'agents_paused')
            assert.deepEqual(await maintenance(), beforePause, 'paused specialists change no work or native audit')
          }
          assert.equal(await form.getByLabel('Note', { exact: true }).inputValue(), 'Synthetic technician result entered before Pause')
          await Promise.all([page.waitForURL(url => url.searchParams.has('notice')), form.getByRole('button', { name: 'Save results' }).click()])
          assert.equal(new URL(page.url()).searchParams.has('error'), false)
          const saved = await h.api(`work/${techWork}`, owner)
          assert.equal(saved.items[0].result.note, 'Synthetic technician result entered before Pause')
          assert.equal(saved.items[0].result.outcome, 'pass')
          assert.equal(saved.items[0].result.recorded_by, techPerson.name)
          for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 1100 })
            await page.screenshot({ path: `${directory}/technician-paused-${width}.png`, fullPage: true })
          }
          await page.setViewportSize({ width: 1440, height: 1100 })
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
          const icons = await page.locator('button,a[href]').evaluateAll(elements => elements.filter(el => el.getClientRects().length && el.querySelector('svg') && !el.textContent.trim()).map(el => ({ title: el.getAttribute('title'), tooltip: el.getAttribute('aria-describedby') })))
          assert.ok(icons.every(icon => icon.title || icon.tooltip), 'icon-only controls expose their tooltip')
          const afterSave = await maintenance()
          for (const specialist of specialists) {
            assert.equal(code(await tool(specialist, 'gasket.work.create', workArgs)), 'agents_paused')
            const pausedRead = await tool(specialist, 'gasket.work.read', { id: techWork })
            assert.equal(code(pausedRead), 'agents_paused')
            assert.equal(pausedRead.result?.structuredContent, undefined, 'Pause withholds technician evidence from specialists')
            assert.deepEqual(await h.api(`work/${techWork}`, owner), saved, 'later paused calls preserve the accepted browser result')
            assert.deepEqual(await maintenance(), afterSave, 'specialist calls remain without effects after the human save')
          }
          await person('/agents/api/pause', owner, { paused: false })
          results.push(saved)
          console.log('PROBE SURFACE-007 pause: both specialists refused while the assigned maintainer saves a pre-entered browser result -> attributed result retained at 1440 and 390')
        }
        const workAnswer = await tool(sponsor, 'gasket.work.create', workArgs)
        assert.equal(decision(workAnswer).disposition, held ? 'review' : 'autonomous')
        const work = content(workAnswer).id
        const order = await h.api(`work/${work}`, lead)
        assert.equal(order.asset_id, asset); assert.equal(order.assignee_id, techPerson.id)
        assert.equal(order.title, workArgs.title); assert.equal(order.description, workArgs.description)
        assert.equal(order.created_by_name, `${sponsor.name} for ${sponsor.person.name}`)
        const state = await maintenance()
        assert.equal(content(await tool(sponsor, 'gasket.work.create', workArgs)).id, work)
        assert.equal(content(await tool(sponsor, 'gasket.assets.create', args)).id, asset)
        assert.equal(content(await tool(sponsor, 'gasket.procedures.publish', procedureArgs)).id, procedure)
        assert.deepEqual(await maintenance(), state, 'completed retries add no maintenance records, revisions or native audit effects')
        if (results.length) assert.deepEqual(await h.api(`work/${techWork}`, owner), results[0], 'resuming specialists never overwrites accepted technician work')
        completed.push({ sponsor, phase, asset, procedure, work, keys: [args.idempotency_key, procedureArgs.idempotency_key, workArgs.idempotency_key] })
      }
      console.log(`PROBE SURFACE-007 ${held ? 'held' : 'allowing'}: owner and lead sponsor MCP preparation -> two assets, procedures and assigned orders; ${held ? 'genuine standard reviews and named owner commitment approvals' : 'autonomous completion without a person decision'}`)
    }
    const reviews = (await person('/agents/api/reviews')).reviews
    const auditPage = await person('/agents/api/audit')
    assert.equal(auditPage.differs_from_policy, 0, 'every retained decision matches its company policy')
    const audits = auditPage.rows
    const nativeAudits = (await h.api('audit', owner)).rows
    for (const item of completed) {
      for (const [subject, action] of [[item.asset, 'asset.create'], [item.procedure, 'checklist.create'], [item.work, 'workorder.create']]) {
        const nativeRows = nativeAudits.filter(row => row.subject === subject && row.action === action)
        assert.equal(nativeRows.length, 1, 'one independent native audit effect per accepted step')
        const attribution = JSON.parse(nativeRows[0].detail).preparedBy
        assert.equal(attribution.for.id, item.sponsor.person.id)
        assert.equal(attribution.agent.id, item.sponsor.agent)
      }
      const rows = audits.filter(row => row.agent.id === item.sponsor.agent && item.keys.includes(row.idempotency_key) && row.outcome === 'done')
      assert.equal(rows.length, 3, 'one successful audit per accepted preparation step')
      for (const row of rows) {
        assert.equal(row.sponsor.id, item.sponsor.person.id)
        assert.equal(row.label, `${item.sponsor.name} for ${item.sponsor.person.name}`)
        if (item.phase === 'held' && row.classes.some(fact => fact.class === 'standard')) {
          const review = reviews.find(review => review.id === row.review?.id)
          assert.ok(review, 'held standard execution retains its genuine review')
          assert.equal(review.decision_id, row.id)
          assert.equal(review.prepared_by.for, item.sponsor.person.name)
          await person(`/agents/api/reviews/${review.id}/reviewed`, owner, {})
        } else if (item.phase === 'held') assert.deepEqual(row.approval.by, [ownerPerson.id])
        else { assert.equal(row.decision, 'autonomous'); assert.equal(row.approval, null); assert.equal(row.review, null) }
      }
    }
    const unchanged = await maintenance()
    const refusedArgs = { tag: 'synthetic-gasket-refused', name: 'Refused specialist change', location: 'Workshop', idempotency_key: randomUUID() }
    assert.equal((await mcp(specialists[0], 'tools/call', { name: 'gasket.assets.create', arguments: refusedArgs }, true)).status, 401)
    const techSponsor = { sub: techSubject, person: techPerson, email: team[1].email, agent: randomUUID(), name: 'Synthetic forbidden specialist' }
    assert.equal(code(await tool(techSponsor, 'gasket.assets.create', refusedArgs)), 'forbidden')
    assert.deepEqual(await maintenance(), unchanged, 'signed-out and forbidden sponsors have no maintenance effects')
    await roster([team[1]])
    const afterEnding = await maintenance()
    assert.equal((await tool(specialists[1], 'gasket.assets.create', refusedArgs)).status, 401)
    const endedRead = await tool(specialists[1], 'gasket.work.read', { id: completed[0].work })
    assert.equal(endedRead.status, 401); assert.equal(endedRead.result?.structuredContent, undefined)
    assert.deepEqual(await maintenance(), afterEnding, 'ended sponsor cannot create or restore maintenance data')
    await person(`/agents/api/agents/${specialists[0].agent}/revoke`, owner, {})
    assert.equal((await tool(specialists[0], 'gasket.assets.create', refusedArgs)).status, 401)
    const revokedRead = await tool(specialists[0], 'gasket.work.read', { id: completed[0].work })
    assert.equal(revokedRead.status, 401); assert.equal(revokedRead.result?.structuredContent, undefined)
    assert.deepEqual(await maintenance(), afterEnding, 'a revoked specialist cannot create or restore maintenance data')
    console.log('PROBE SURFACE-007 authority: signed-out, forbidden, ended and revoked MCP attempts -> refusal, no maintenance effects; completed replay retains technician result')
    console.log('Native specialist continuity passed: distinct sponsors, both policies, approvals, reviews, Pause, browser save and replay')
  } finally { await browser?.close(); await h.close() }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await specialistContinuity()
