// Test-only D1 barriers surround real committed PM writes. No row or result is
// invented. Disposing Miniflare at a barrier terminates the emitted Worker.
export const pmAttemptGate = `
function pmDatabase(db) {
  const originals = new WeakMap(), queries = new WeakMap(), values = new WeakMap()
  const wrap = (statement, query, args = []) => {
    const wrapped = {
      bind(...args) { return wrap(statement.bind(...args), query, args) },
      first: (...args) => statement.first(...args),
      all: (...args) => statement.all(...args),
      run: (...args) => statement.run(...args),
      raw: (...args) => statement.raw(...args),
    }
    originals.set(wrapped, statement); queries.set(wrapped, query); values.set(wrapped, args)
    return wrapped
  }
  const barrier = phase => fetch('https://synthetic-gasket.invalid/pm-attempt?phase=' + phase)
  return { prepare: query => wrap(db.prepare(query), query), async batch(statements) {
    const start = statements.some(s => queries.get(s)?.startsWith('INSERT INTO gk_automation_jobs') && values.get(s)?.[1] === 'pm' && values.get(s)?.[6] === 'running')
    const occurrence = statements.some(s => queries.get(s)?.startsWith('INSERT INTO gk_work_orders')) && statements.some(s => queries.get(s)?.includes('j.lease_expires_at'))
    if (occurrence) await barrier('before_occurrence')
    const result = await db.batch(statements.map(s => originals.get(s) ?? s))
    if (start) await barrier('started')
    if (occurrence) await barrier('occurrence')
    return result
  }, exec: query => db.exec(query) }
}
export default { ...worker,
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/cdn-cgi/gasket-test-clock') {
      globalThis.__gasketInstant = Number(new URL(request.url).searchParams.get('instant'))
      return new Response(null, { status: 204 })
    }
    return worker.fetch(request, { ...env, DB: pmDatabase(env.DB) }, ctx)
  },
  scheduled(controller, env, ctx) { return worker.scheduled(controller, { ...env, DB: pmDatabase(env.DB) }, ctx) },
}
`
