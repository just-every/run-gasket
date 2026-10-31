// Pause only the real target write batch; all reads and changes use native doors.
export const dependencyGate = `
function dependencyDatabase(db) {
  const originals=new WeakMap(), queries=new WeakMap()
  const wrap=(statement,query)=>{const wrapped={
    bind(...args){return wrap(statement.bind(...args),query)},
    first:(...args)=>statement.first(...args), all:(...args)=>statement.all(...args),
    run:(...args)=>statement.run(...args), raw:(...args)=>statement.raw(...args),
  };originals.set(wrapped,statement);queries.set(wrapped,query);return wrapped}
  return {prepare:query=>wrap(db.prepare(query),query),exec:query=>db.exec(query),async batch(statements){
    if(statements.some(s=>/^(INSERT INTO gk_work_dependencies|UPDATE gk_work_orders SET status = '(submitted|closed)')/.test(queries.get(s)??'')))
      await fetch('https://synthetic-gasket.invalid/dependency-write')
    return db.batch(statements.map(s=>originals.get(s)??s))
  }}
}
export default {...worker,fetch(request,env,ctx){return worker.fetch(request,{...env,DB:dependencyDatabase(env.DB)},ctx)}}
`
