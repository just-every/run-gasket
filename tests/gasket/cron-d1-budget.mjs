// D1 read cost of what runs on its own: the 15-minute scheduler and the Today page. A small company runs this on
// Workers Free, where every tool on the account shares 5,000,000 rows read a day, so what one run reads must not
// grow with the history behind it. The history is written straight into a local D1 (30 days of runs at the
// defaults, as an installation would hold them); the Worker is the built one, its D1 reads metered by D1 itself.
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

const cron = '*/15 * * * *', quarter = 15 * 60_000, day = 86_400_000
const start = Date.UTC(2026, 10, 3, 12)
const rules = ['pm', 'routes', 'chase', 'expiry', 'replenishment', 'vendor', 'connectors']
// Generous: a run with no history reads about 200 rows today, and 23,000 once the old 30-day history had built up.
const runCeiling = 1_500, appCeiling = 1_000, ledgerCeiling = 500

const total = entries => entries.reduce((sum, entry) => sum + entry.read, 0)
const history = (installation, days, before, { audit = false } = {}) => {
  const runs = days * 96, from = before - runs * quarter
  const series = `WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<${runs - 1})`
  return [
    `${series} INSERT INTO gk_scheduler_runs(id,cron,ran_at,created,gap_minutes,finished_at,state) SELECT 'h${before}-'||i,'${cron}',${from}+i*${quarter},0,NULL,${from}+i*${quarter},'completed' FROM n`,
    `${series} INSERT INTO gk_automation_jobs(id,rule_id,rule_revision,source,started_at,finished_at,state,input,output,idle) SELECT 'h${before}-'||i||'-'||r.rule,r.rule,1,'cron',${from}+i*${quarter},${from}+i*${quarter},'completed','{"day":"2026-10-01","idle":true}','{"created":[],"runs":[],"notices":[]}',1 FROM n, (${`WITH RECURSIVE k(k) AS (SELECT 0 UNION ALL SELECT k+1 FROM k WHERE k<${rules.length - 1}) SELECT CASE k ${rules.map((rule, index) => `WHEN ${index} THEN '${rule}'`).join(' ')} END AS rule FROM k`}) r`,
    ...(audit ? [`WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<${days * 200 - 1}) INSERT INTO gk_audit(at,actor,action,subject,detail) SELECT ${before - days * day}+i*${Math.floor(day / 200)},'history','history.entry','h'||i,'{}' FROM n`] : []),
  ]
}

export async function cronBudgetJourney() {
  const h = await harness({ clockInstant: start, meter: true })
  const { installation, vars } = h
  let current = h
  try {
    const owner = await h.owner()
    await h.api('site.configure', owner, { name: 'Budget plant', timezone: 'UTC' })
    const maintainer = (await h.api('access.give', owner, { name: 'max', email: 'max@example.test', role: 'maintainer' })).id
    const today = (await h.api('me', owner)).today
    const checklist = (await h.api('checklist.create', owner, { name: 'Check', items: ['Look'] })).id
    for (let i = 0; i < 8; i++) {
      const asset = (await h.api('asset.create', owner, { tag: `A-${i}`, name: `Asset ${i}`, location: 'Plant' })).id
      await h.api('schedule.create', owner, { asset, checklist, title: `PM ${i}`, everyDays: i % 2 ? 7 : 30, firstDue: today, assignee: maintainer })
    }
    await h.scheduled(cron, start); await h.scheduled(cron, start + quarter)
    await h.reads()
    await h.scheduled(cron, start + 2 * quarter)
    const emptyRun = total(await h.reads())
    await h.raw('/app', { cookie: owner }); await h.reads()
    await h.raw('/app', { cookie: owner })
    const emptyApp = total(await h.reads())
    await h.stop()

    // Thirty days of history behind it, and three older days that retention has not yet removed.
    for (const command of [...history(installation, 3, start - 30 * day), ...history(installation, 30, start, { audit: true })]) await installation.sql(command)
    current = await harness({ vars, installation, clockInstant: start, meter: true })
    const cookie = await current.signIn(vars.OWNER_EMAIL)

    await current.scheduled(cron, start + 3 * quarter)
    const run = total(await current.reads())
    assert.ok(run <= runCeiling, `a scheduler run reads ${run} rows with 30 days behind it, over ${runCeiling}`)
    assert.ok(run <= emptyRun + 100, `a scheduler run reads ${run} rows with 30 days behind it and ${emptyRun} with none: its cost grows with history`)

    await current.raw('/app', { cookie }); const app = total(await current.reads())
    assert.ok(app <= appCeiling && app <= emptyApp + 50, `Today reads ${app} rows with a long audit trail and ${emptyApp} without`)

    const page = await current.api('automation/jobs', cookie), ledger = total(await current.reads())
    console.log(`D1 rows read: scheduler run ${emptyRun} -> ${run} with 30 days of history, Today ${emptyApp} -> ${app}, ledger page ${ledger}`)
    assert.equal(page.jobs.length, 50, 'the ledger returns one page')
    assert.ok(page.next && ledger <= ledgerCeiling, `the ledger page reads ${ledger} rows`)
    const older = await current.api(`automation/jobs?before=${page.next}&limit=5`, cookie)
    assert.equal(older.jobs.length, 5)
    assert.ok(older.jobs.every(job => job.started_at <= page.jobs.at(-1).started_at && job.id !== page.jobs.at(-1).id))

    // The first run of a new UTC day removes idle runs past retention, and nothing newer.
    await current.reads()
    await current.scheduled(cron, start + day)
    await current.stop(); current = null
    const [{ results: [{ old, kept }] }] = await installation.sql(`SELECT SUM(started_at<${start + day - 30 * day}) AS old, SUM(started_at>=${start + day - 30 * day}) AS kept FROM gk_automation_jobs WHERE idle=1`)
    assert.equal(old, 0, 'idle runs older than 30 days are removed')
    assert.ok(kept >= 28 * 96 * rules.length, 'idle runs inside the 30 days are kept')
  } finally {
    if (current && current !== h) await current.close()
    await h.close()
  }
}
