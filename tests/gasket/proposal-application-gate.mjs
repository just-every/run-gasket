// Pause the real D1 application batch after native evidence checks and before
// persistence. Every source change still goes through the emitted Worker's public doors.
export const proposalApplicationGate = `
function proposalDatabase(db) {
  const originals = new WeakMap(), queries = new WeakMap()
  const wrap = (statement, query) => {
    const wrapped = {
      bind(...args) { return wrap(statement.bind(...args), query) },
      first: (...args) => statement.first(...args),
      all: (...args) => statement.all(...args),
      run: (...args) => statement.run(...args),
      raw: (...args) => statement.raw(...args),
    }
    originals.set(wrapped, statement); queries.set(wrapped, query)
    return wrapped
  }
  return { prepare: query => wrap(db.prepare(query), query), async batch(statements) {
    if (statements.some(s => queries.get(s)?.startsWith('INSERT INTO gk_work_orders') || queries.get(s)?.startsWith('INSERT INTO gk_interval_changes'))
        && statements.some(s => queries.get(s)?.startsWith('UPDATE gk_proposals SET'))) {
      await fetch('https://synthetic-gasket.invalid/proposal-application')
    }
    return db.batch(statements.map(s => originals.get(s) ?? s))
  }, exec: query => db.exec(query) }
}
export default { ...worker, fetch(request, env, ctx) {
  return worker.fetch(request, { ...env, DB: proposalDatabase(env.DB) }, ctx)
} }
`
