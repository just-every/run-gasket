// Test-only barrier before the real native handoff batch. All reads, decisions,
// concurrent changes and transaction results still use the emitted Worker.
export const reassignmentGate = `
function reassignmentDatabase(db) {
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
    if (statements.some(s => queries.get(s)?.startsWith('INSERT INTO gk_handoffs')) &&
        statements.some(s => queries.get(s)?.startsWith('UPDATE gk_proposals SET status'))) {
      await fetch('https://synthetic-gasket.invalid/reassignment')
    }
    return db.batch(statements.map(s => originals.get(s) ?? s))
  }, exec: query => db.exec(query) }
}
export default { ...worker, fetch(request, env, ctx) {
  return worker.fetch(request, { ...env, DB: reassignmentDatabase(env.DB) }, ctx)
} }
`
