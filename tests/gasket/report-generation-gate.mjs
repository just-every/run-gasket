// The scheduled Worker's D1 edge forwards every real query and its result.
// After the report's source-revision read, a network barrier lets a public HTTP
// authority change finish before rendering resumes. No business data is faked.
export const reportGenerationGate = `
function reportDatabase(db) {
  const originals = new WeakMap()
  const wrap = (statement, query) => {const wrapped = {
    bind(...args) { return wrap(statement.bind(...args), query) },
    async first(...args) {
      const result = await statement.first(...args)
      if (query.startsWith('SELECT COALESCE(MAX(seq),0) AS revision,MAX(at) AS latestAt FROM gk_audit')) {
        await fetch('https://synthetic-gasket.invalid/report-generation')
      }
      return result
    },
    all: (...args) => statement.all(...args),
    run: (...args) => statement.run(...args),
    raw: (...args) => statement.raw(...args),
  }; originals.set(wrapped,statement);return wrapped }
  return { prepare: query => wrap(db.prepare(query), query), batch: statements => db.batch(statements.map(s=>originals.get(s)??s)), exec: query => db.exec(query) }
}
export default { ...worker, scheduled(controller, env, ctx) { return worker.scheduled(controller, { ...env, DB: reportDatabase(env.DB) }, ctx) } }
`
