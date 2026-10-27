// Fault at the real database boundary after commit: the business write is never faked.
export const formSaveGate = `
function saveDatabase(db) {
  const originals = new WeakMap(), queries = new WeakMap()
  const wrap = (statement, query) => {const wrapped = {
    bind(...args) { return wrap(statement.bind(...args), query) },
    first: (...args) => statement.first(...args),
    all: (...args) => statement.all(...args),
    run: (...args) => statement.run(...args),
    raw: (...args) => statement.raw(...args),
  }; originals.set(wrapped,statement);queries.set(wrapped,query);return wrapped }
  return { prepare: query => wrap(db.prepare(query), query), async batch(statements) {
    const result = await db.batch(statements.map(s=>originals.get(s)??s))
    if (statements.some(s=>queries.get(s)?.startsWith('UPDATE gk_form_saves SET batches=batches+1'))) {
      const reply = await fetch('https://synthetic-gasket.invalid/form-save')
      if (!reply.ok) throw new Error('synthetic-gasket failure after durable commit')
    }
    return result
  }, exec: query => db.exec(query) }
}
export default { ...worker, fetch(request, env, ctx) { return worker.fetch(request, { ...env, DB: saveDatabase(env.DB) }, ctx) } }
`
