// Test-only entry module: wraps the Worker's D1 binding and records each statement's rows read and written
// (D1's own `meta`, the numbers Cloudflare bills against the daily allowance). Nothing is invented or altered.
// `/__reads` returns the statements since the last reset; `?reset=1` clears them.
export const d1MeterEntry = inner => `
import inner from './${inner}'
const log = [], real = new WeakMap()
const note = (sql, r) => log.push({ sql, read: r.meta?.rows_read ?? 0, written: r.meta?.rows_written ?? 0 })
function wrap(sql, statement) {
  const wrapped = new Proxy(statement, { get(target, key) {
    if (key === 'bind') return (...args) => wrap(sql, target.bind(...args))
    if (key === 'all' || key === 'run') return async (...args) => { const r = await target[key](...args); note(sql, r); return r }
    if (key === 'first') return async column => { const r = await target.all(); note(sql, r); const row = r.results[0] ?? null; return column && row ? row[column] : row }
    if (key === 'raw') return async () => { const r = await target.all(); note(sql, r); return r.results.map(row => Object.values(row)) }
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value
  } })
  real.set(wrapped, { sql, statement }); return wrapped
}
function metered(db) { return new Proxy(db, { get(target, key) {
  if (key === 'prepare') return sql => wrap(sql, target.prepare(sql))
  if (key === 'batch') return async statements => { const results = await target.batch(statements.map(s => real.get(s)?.statement ?? s)); results.forEach((r, i) => note(real.get(statements[i])?.sql ?? '?', r)); return results }
  if (key === 'withSession') return (...args) => metered(target.withSession(...args))
  const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value
} }) }
export default { ...inner,
  fetch: (request, env, ctx) => {
    const url = new URL(request.url)
    if (url.pathname === '/__reads') { const out = JSON.stringify(log); if (url.searchParams.get('reset')) log.length = 0; return new Response(out) }
    return inner.fetch(request, { ...env, DB: metered(env.DB) }, ctx)
  },
  scheduled: (event, env, ctx) => inner.scheduled(event, { ...env, DB: metered(env.DB) }, ctx) }
`
