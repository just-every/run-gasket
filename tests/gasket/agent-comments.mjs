import assert from 'node:assert/strict'
import { randomUUID, webcrypto } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { accessToken, autonomousPolicy, heldPolicy, policyEnvelope, seconds, signJws } from '../../src/modules/agent-door/conformance/crypto.mjs'
import { harness } from './harness.mjs'

/** One public-door journey covers policy, native effects, replay and current authority. */
export async function agentCommentsJourney() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const kid = randomUUID(), installationId = randomUUID(), issuer = 'https://synthetic-gasket.invalid'
  const email = ['synthetic-gasket-1', 'example.test'].join('@')
  const keys = { [kid]: { ...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid, alg: 'ES256', use: 'sig' } }
  let h = await harness({ clockOffset: 0, vars: {
    OWNER_EMAIL: email, SESSION_SECRET: randomUUID(), SETUP_TOKEN: randomUUID(),
    RER_OWNER_CLAIM_ISSUER: issuer, RER_OWNER_CLAIM_INSTALLATION_ID: installationId, RER_OWNER_CLAIM_PUBLIC_KEYS: JSON.stringify(keys),
    RER_BUSINESS_TRUST: JSON.stringify({ v: 1, issuer, audience: 'self-host', subject: installationId, email, keys }),
  } })
  const installation = h.installation, vars = h.vars
  let browser
  try {
    let owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Synthetic Gasket workshop', timezone: 'UTC' })
    const sponsor = await h.api('me', owner)
    const memberEmail = ['synthetic-gasket-2', 'example.test'].join('@')
    const nativeAgentEmail = ['synthetic-gasket-3', 'example.test'].join('@')
    const business = 'synthetic-gasket-business', sub = 'synthetic-gasket-owner', memberSub = 'synthetic-gasket-member', agentSub = 'synthetic-gasket-native-agent'
    const iat = seconds()
    const settings = await signJws(pair.privateKey, kid, 'rer-business-settings+jwt', {
      v: 1, iss: issuer, aud: 'self-host', sub: installationId, business, email, owner_id: sub,
      jti: randomUUID(), iat, exp: iat + 300, rev: 1, values: {}, logo: null,
      team: [{ id: memberSub, email: memberEmail, name: 'Synthetic Gasket maintainer', role: 'member', invite: 1 }, { id: agentSub, email: nativeAgentEmail, name: 'Synthetic Gasket native agent', role: 'member', invite: 1 }],
    })
    assert.equal((await h.raw('/api/rer/business-settings', { body: { settings } })).status, 200)
    const memberCookie = await h.signIn(memberEmail), member = await h.api('me', memberCookie)
    const nativeAgentCookie = await h.signIn(nativeAgentEmail), nativeAgent = await h.api('me', nativeAgentCookie)
    await h.api('access.role', owner, { member: nativeAgent.id, role: 'agent' })
    const ctx = { signer: { privateKey: pair.privateKey, kid, issuer, installationId }, origin: h.origin, person: { sub, email }, business,
      agentId: 'synthetic-gasket-comment-agent', consent: 'synthetic-gasket-comment-consent', seq: 0, revision: 0,
      surface: { specialist: 'maintenance coordinator', tools: [{ scope: 'comment.post' }] } }
    const adopt = async (document, options) => {
      const signed = await policyEnvelope(ctx, document, options)
      const response = await h.raw('/api/rer/agent-policy', { body: { policy: signed.policy } })
      assert.equal(response.status, 200, 'signed company policy is adopted')
      ctx.seq = signed.payload.seq; ctx.revision = signed.payload.revision
    }
    const person = async (path, body, cookie = owner) => {
      const response = await h.raw(path, { cookie, body })
      assert.equal(response.status, 200, path)
      return response.json()
    }
    const mcp = async (args, overrides = {}, token) => {
      const credential = token === undefined ? await accessToken(ctx, overrides) : token
      const response = await h.raw('/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'gasket.comments.post', arguments: args } },
        headers: { ...(credential ? { Authorization: `Bearer ${credential}` } : {}), 'MCP-Protocol-Version': '2025-11-25', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'gasket.comments.post' } })
      const body = await response.json()
      return { status: response.status, ...body, decision: body.result?._meta?.['com.runeditrun/decision'], code: body.result?._meta?.['com.runeditrun/error']?.code ?? body.error?.data?.code }
    }
    const work = await h.api('workorder.create', owner, { title: 'Synthetic Gasket inspect bearing', location: 'Workshop', due: '2030-01-10', assignee: sponsor.id })
    const thread = () => h.api(`work/${work.id}/comments`, owner)
    const effects = async () => (await h.api('audit', owner)).rows.filter(row => row.action === 'comment.post' && row.subject === work.id)
    const snapshot = async () => ({ thread: await thread(), effects: await effects(), reviews: (await person('/agents/api/reviews')).reviews })
    const original = '\n  Synthetic Gasket observation: inspect <bearing> & retain original text.\n    No physical maintenance is asserted.  \n'
    const args = { workOrder: work.id, body: original, idempotency_key: randomUUID() }
    await adopt(autonomousPolicy())
    const posted = await mcp(args)
    assert.equal(posted.status, 200)
    assert.equal(posted.result?.isError, false)
    assert.equal(posted.decision.disposition, 'autonomous')
    assert.deepEqual(posted.decision.classes.map(({ class: kind, facts }) => ({ class: kind, facts })), [{ class: 'standard', facts: { measure: 1 } }])
    assert.equal(posted.result.structuredContent.id, work.id)
    const first = (await thread()).comments[0]
    assert.equal(first.id, posted.result.structuredContent.comment)
    assert.equal(first.author_id, sponsor.id)
    assert.equal(first.author, 'Agent door conformance for Olive Owner')
    assert.equal(first.body, original)
    assert.deepEqual(first.revisions.map(row => [row.number, row.body, row.by]), [[1, original, first.author]])
    assert.deepEqual([first.kind, first.mentions, first.photos], ['comment', [], []])
    assert.deepEqual((await person('/agents/api/reviews')).reviews, [], 'autonomous comments invent no review')
    assert.equal((await effects()).length, 1)
    const nativeAudit = (await effects())[0], detail = JSON.parse(nativeAudit.detail)
    assert.equal(detail.preparedBy.agent.id, ctx.agentId)
    assert.equal(detail.preparedBy.for.id, sponsor.id)
    assert.equal(detail.preparedBy.label, first.author)
    assert.deepEqual(detail.approvers, [], 'no fabricated human approval')
    const saved = await snapshot()
    const replay = await mcp(args)
    assert.deepEqual(replay.result.structuredContent, posted.result.structuredContent)
    assert.deepEqual(await snapshot(), saved, 'replay retains exactly one comment, original revision and native audit effect')
    assert.equal((await mcp({ ...args, body: 'Changed text on the same key' })).code, 'idempotency_conflict')
    assert.deepEqual(await snapshot(), saved)
    const audit = await person(`/agents/api/audit?agent=${encodeURIComponent(ctx.agentId)}`)
    const decision = audit.rows.find(row => row.id === posted.decision.id)
    assert.deepEqual(decision.resource, { kind: 'work', id: work.id })
    console.log('PROBE PLAN-006 policy and replay: public MCP -> standard autonomous comment, stored native target, retained text and exactly one original revision and native audit effect')

    await adopt(heldPolicy())
    const heldArgs = { ...args, body: 'Synthetic Gasket held-policy observation', idempotency_key: randomUUID() }
    const held = await mcp(heldArgs)
    assert.equal(held.decision.disposition, 'review')
    assert.equal(held.result?.isError, false)
    assert.equal(held.result.structuredContent.id, work.id)
    assert.equal(held.result?._meta?.['com.runeditrun/approval'], undefined, 'standard review executes without inventing prior approval')
    const reviews = (await person('/agents/api/reviews')).reviews
    assert.equal(reviews.length, 1)
    assert.deepEqual([reviews[0].state, reviews[0].tool, reviews[0].decision_id, reviews[0].marked_by], ['open', 'gasket.comments.post', held.decision.id, null])
    assert.deepEqual(reviews[0].summary.nativeTarget, { kind: 'work', id: work.id })
    assert.equal(reviews[0].prepared_by.for, 'Olive Owner')
    assert.equal((await thread()).comments[1].body, heldArgs.body)
    const marked = await person(`/agents/api/reviews/${reviews[0].id}/reviewed`, {})
    assert.deepEqual([marked.review.state, marked.review.marked_by], ['reviewed', sponsor.id])
    const heldSaved = await snapshot()
    assert.deepEqual((await mcp(heldArgs)).result.structuredContent, held.result.structuredContent)
    assert.deepEqual(await snapshot(), heldSaved)
    assert.equal((await person('/agents/api/reviews')).reviews.length, 1)
    const newlyHeld = await mcp(args)
    assert.equal(newlyHeld.code, 'review_required', 'current held policy cannot reuse an autonomous receipt as a review')
    assert.equal(newlyHeld.result?.structuredContent, undefined)
    assert.deepEqual(await snapshot(), heldSaved, 'a newly required review is not fabricated by replay')
    console.log('PROBE PLAN-006 held policy: public MCP -> review disposition, native comment and one genuine human-marked review; replay creates no duplicate and an old autonomous receipt cannot satisfy a newly required review')

    await adopt(autonomousPolicy())
    // A retry must not overwrite a later human correction or lose its attribution.
    const correction = '\n  Synthetic Gasket human correction: bearing checked, original observation retained.  \n'
    const editedAt = await h.submit('comment.edit', owner, { comment: first.id, body: correction.replaceAll('\n', '\r\n') }, `/app/work/${work.id}`)
    assert.equal(editedAt.pathname, `/app/work/${work.id}`)
    assert.equal(editedAt.searchParams.has('error'), false)
    const edited = (await thread()).comments[0]
    assert.equal(edited.body, correction)
    assert.deepEqual(edited.revisions.map(row => [row.number, row.body, row.by]), [[1, original, first.author], [2, correction, sponsor.name]])
    const correctedSaved = await snapshot()
    assert.deepEqual((await mcp(args)).result.structuredContent, posted.result.structuredContent)
    assert.deepEqual(await snapshot(), correctedSaved, 'completed replay cannot overwrite a human correction')
    // Restart the emitted Worker against the same durable installation, then retry both policy outcomes.
    const retainedReviews = (await person('/agents/api/reviews')).reviews
    await h.stop()
    h = await harness({ installation, vars, clockOffset: 0 })
    ctx.origin = h.origin
    owner = await h.signIn(email)
    assert.deepEqual((await mcp(args)).result.structuredContent, posted.result.structuredContent)
    assert.deepEqual((await mcp(heldArgs)).result.structuredContent, held.result.structuredContent)
    assert.deepEqual(await snapshot(), correctedSaved, 'restart and replay keep comments, revisions and native audit effects unchanged')
    assert.deepEqual((await person('/agents/api/reviews')).reviews, retainedReviews, 'restart retains the genuine review and creates no new review')
    console.log('PROBE PLAN-006 durable replay: human correction then emitted Worker restart and MCP retries -> retained original and corrected revisions, one native effect per comment and unchanged human-marked review')

    const refused = async (label, run, check) => {
      const before = await snapshot(), result = await run()
      check(result)
      assert.deepEqual(await snapshot(), before, `${label} changes no native comment, revision or audit effect`)
      console.log(`PROBE PLAN-006 ${label}: public MCP or native comment door -> refused without native effects`)
    }
    await refused('other sponsor edit', () => h.api('comment.edit', memberCookie, { comment: first.id, body: 'Synthetic Gasket unauthorized correction' }, 403), answer => assert.equal(answer.error, 'not_your_comment'))
    const fresh = () => ({ ...args, idempotency_key: randomUUID() })
    await refused('blank authored text', () => mcp({ ...fresh(), body: ' \n\t ' }), answer => assert.equal(answer.code, 'missing_body'))
    await refused('oversized authored text', () => mcp({ ...fresh(), body: 'x'.repeat(2001) }), answer => assert.equal(answer.code, 'invalid_arguments'))
    const blocked = autonomousPolicy()
    blocked.rules = [{ id: 'all', class: '*', do: 'blocked' }]
    await adopt(blocked)
    for (const [label, input] of [['company policy', fresh()], ['company policy replay', args]]) {
      await refused(label, () => mcp(input), answer => {
        assert.equal(answer.code, 'policy_blocked')
        assert.equal(answer.result?.structuredContent, undefined, 'blocked policy exposes no cached native result')
      })
    }
    await adopt(autonomousPolicy())
    await person('/agents/api/pause', { paused: true })
    try {
      for (const [label, input] of [['local Pause', fresh()], ['local Pause replay', args]]) {
        await refused(label, () => mcp(input), answer => {
          assert.equal(answer.code, 'agents_paused')
          assert.equal(answer.result?.structuredContent, undefined, 'local Pause exposes no cached native result')
        })
      }
    } finally { await person('/agents/api/pause', { paused: false }) }
    await refused('signed-out', () => mcp(fresh(), {}, null), answer => assert.equal(answer.status, 401))
    await refused('insufficient scope', () => mcp(fresh(), { scope: 'work:read' }), answer => assert.equal(answer.code, 'insufficient_scope'))
    await refused('insufficient scope replay', () => mcp(args, { scope: 'work:read' }), answer => {
      assert.equal(answer.code, 'insufficient_scope')
      assert.equal(answer.result?.structuredContent, undefined)
    })
    const service = await h.api('service.create', owner, { name: 'Synthetic Gasket reader', scopes: ['work:read'], expiresAt: Date.now() + 3600000, consent: true })
    await refused('service scope boundary', () => mcp(fresh(), {}, service.token), answer => assert.equal(answer.code, 'insufficient_scope'))
    assert.equal((await h.api('service.create', owner, { name: 'Synthetic Gasket refused scope', scopes: ['comment.post'], expiresAt: Date.now() + 3600000, consent: true }, 400)).error, 'invalid_service_scope')
    await refused('forbidden native agent', () => h.api('comment.post', nativeAgentCookie, { workOrder: work.id, body: original }, 403), answer => assert.equal(answer.error, 'forbidden'))
    await refused('forbidden sponsor', () => mcp(fresh(), { sub: agentSub, email: nativeAgentEmail, act: { sub: 'synthetic-gasket-forbidden', name: 'Synthetic Gasket agent' } }), answer => assert.ok([401, 403].includes(answer.status)))
    await refused('missing native record', () => mcp({ ...fresh(), workOrder: randomUUID() }), answer => assert.equal(answer.code, 'work_order_not_found'))
    const injected = await mcp({ ...fresh(), mention: [member.id], handoff: true, photo: [{ filename: 'synthetic-gasket-1.png', base64: 'eA==' }] })
    assert.equal(injected.result?.isError, false)
    const plain = (await thread()).comments.find(row => row.id === injected.result.structuredContent.comment)
    assert.deepEqual([plain.kind, plain.body, plain.mentions, plain.photos], ['comment', original, [], []], 'undeclared arguments cannot add mentions, photos or a handoff')
    assert.deepEqual(await h.api('notices', memberCookie), [], 'ignored mentions create no notification')
    console.log('PROBE PLAN-006 operation boundary: injected options at MCP -> only the declared plain-text comment, no photo, mention, handoff or notification')
    await adopt(autonomousPolicy(), { paused: true })
    await refused('Pause', () => mcp(fresh()), answer => assert.equal(answer.code, 'agents_paused'))
    await refused('Pause replay', () => mcp(args), answer => assert.equal(answer.code, 'agents_paused'))
    await adopt(autonomousPolicy(), { revoked: { agents: [], consents: [ctx.consent] } })
    await refused('consent revoked', () => mcp(fresh()), answer => assert.equal(answer.status, 401))
    await refused('consent revoked replay', () => mcp(args), answer => assert.equal(answer.status, 401))
    await adopt(autonomousPolicy())
    const memberClaims = { sub: memberSub, email: memberEmail, act: { sub: 'synthetic-gasket-member-agent', name: 'Synthetic Gasket member agent' } }
    const memberArgs = { ...fresh(), body: 'Synthetic Gasket member observation' }
    const beforeMember = await snapshot()
    const competing = await Promise.all([mcp(memberArgs, memberClaims), mcp(memberArgs, memberClaims)])
    assert.ok(competing.some(answer => answer.result?.isError === false), 'one simultaneous comment submission completes')
    for (const answer of competing) if (answer.result?.isError !== false) assert.ok(['decision_busy', 'call_in_progress'].includes(answer.code), `concurrent retry: ${answer.code}`)
    const byMember = competing.find(answer => answer.result?.isError === false)
    const memberSaved = await snapshot()
    assert.equal(memberSaved.thread.comments.length, beforeMember.thread.comments.length + 1)
    assert.equal(memberSaved.effects.length, beforeMember.effects.length + 1)
    assert.deepEqual(memberSaved.reviews, beforeMember.reviews, 'concurrent autonomous comments invent no review')
    for (const answer of competing) if (answer.result?.isError === false) assert.deepEqual(answer.result.structuredContent, byMember.result.structuredContent)
    assert.deepEqual((await mcp(memberArgs, memberClaims)).result.structuredContent, byMember.result.structuredContent)
    assert.deepEqual(await snapshot(), memberSaved, 'simultaneous submissions and their retry retain one comment, original revision and native audit effect')
    console.log('PROBE PLAN-006 concurrent replay: simultaneous public MCP submissions with one identity -> one comment and original revision, one native audit effect and the same result on retry')
    const memberNote = (await thread()).comments.at(-1)
    assert.equal(memberNote.author_id, member.id)
    assert.deepEqual(memberNote.revisions.map(row => [row.number, row.body, row.by]), [[1, memberArgs.body, memberNote.author]])
    assert.equal(memberNote.unread, true, 'another sponsor sees the new member comment as unread')
    const memberCorrection = '  Synthetic Gasket corrected member observation  \n'
    await h.api('comment.edit', memberCookie, { comment: memberNote.id, body: memberCorrection })
    const corrected = (await thread()).comments.at(-1)
    assert.equal(corrected.author, 'Synthetic Gasket member agent for Synthetic Gasket maintainer')
    assert.equal(corrected.body, memberCorrection)
    assert.deepEqual(corrected.revisions.map(row => [row.number, row.body, row.by]), [[1, 'Synthetic Gasket member observation', corrected.author], [2, memberCorrection, 'Synthetic Gasket maintainer']])
    await h.api('comment.read', owner, { workOrder: work.id })
    assert.equal((await thread()).unread, 0)
    await h.api('access.role', owner, { member: member.id, role: 'agent' })
    await refused('removed human role', () => mcp(fresh(), memberClaims), answer => assert.ok([401, 403].includes(answer.status)))
    await refused('removed human role replay', () => mcp(memberArgs, memberClaims), answer => assert.ok([401, 403].includes(answer.status)))
    await h.api('access.role', owner, { member: member.id, role: 'maintainer' })
    console.log('PROBE PLAN-006 native history: human edit and read doors -> original agent attribution, separate human correction and cleared unread state')
    await h.api('access.end', owner, { member: member.id })
    await refused('ended member', () => mcp(fresh(), memberClaims), answer => assert.ok([401, 403].includes(answer.status)))
    await refused('ended member replay', () => mcp(memberArgs, memberClaims), answer => assert.ok([401, 403].includes(answer.status)))
    await refused('ended native session', async () => { const response = await h.raw('/api/gasket/comment.post', { cookie: memberCookie, body: { workOrder: work.id, body: original } }); return { status: response.status, text: await response.text() } }, answer => { assert.ok([401, 403].includes(answer.status)); assert.ok(!answer.text.includes(original)) })
    await person(`/agents/api/agents/${encodeURIComponent(ctx.agentId)}/revoke`, {})
    await refused('agent revoked', () => mcp(fresh()), answer => assert.equal(answer.status, 401))
    await refused('agent revoked replay', () => mcp(args), answer => assert.equal(answer.status, 401))
    await h.api('service.revoke', owner, { credential: service.id })
    await refused('credential revoked', () => mcp(fresh(), {}, service.token), answer => assert.equal(answer.status, 401))

    browser = await chromium.launch({ headless: true, ...(process.env.GASKET_CHROMIUM ? { executablePath: process.env.GASKET_CHROMIUM } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(owner.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: h.origin } }))
    const page = await context.newPage()
    const directory = process.env.COMMENT_SCREENSHOTS ?? `/tmp/gasket-comments-${process.pid}`
    await mkdir(directory, { recursive: true })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 })
      const response = await page.goto(`${h.origin}/app/work/${work.id}`)
      const note = page.locator(`#comment-${first.id}`)
      await note.locator('summary').click()
      if (width === 1440) {
        assert.equal(response.status(), 200)
        assert.ok((await note.innerText()).includes(first.author))
        assert.ok((await note.innerText()).includes(correction.trim()))
        assert.equal(await note.locator('textarea[name="body"]').inputValue(), correction, 'the native edit form retains authored spacing')
        assert.ok((await note.innerText()).replace(/\s+/g, ' ').includes(original.replace(/\s+/g, ' ').trim()), 'the original agent observation remains in visible history')
        assert.equal(await note.locator('bearing').count(), 0, 'authored markup remains plain text')
      }
      if (width === 390) {
        const layout = await note.locator('dl').evaluate(history => ({
          bodyWidth: history.querySelector('dd').getBoundingClientRect().width,
          historyWidth: history.getBoundingClientRect().width,
          pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
        }))
        assert.ok(layout.pageWidth <= layout.viewport && layout.bodyWidth > layout.historyWidth / 2, 'phone comment history keeps attributed revisions readable without horizontal overflow')
      }
      await page.screenshot({ fullPage: true, path: join(directory, `native-thread-${width}.png`) })
    }
    console.log('PROBE PLAN-006 native thread: built work page -> attributed plain text at 1440 and 390; photos, mentions and handoff adapter operations remain omitted')
  } finally {
    await browser?.close()
    await h.close()
    await installation.remove()
  }
}
