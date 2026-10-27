// Installation-owned attribution around native account mutations. The temporary
// context and affected credentials share one D1 batch, including trigger audit.
import { AsyncLocalStorage } from 'node:async_hooks'

interface Authority { actor: string; action: string; at: number }
const authority = new AsyncLocalStorage<Authority>()

export function authorityStatements(db: D1Database, event: Authority) {
  return [
    db.prepare("INSERT INTO gk_authority_actor(singleton,actor,action,at,role) VALUES(1,?,?,?,(SELECT CASE WHEN o.role='owner' THEN 'owner' ELSE m.role END FROM gk_members m LEFT JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=?))").bind(event.actor, event.action, event.at, event.actor),
    db.prepare('DELETE FROM gk_authority_actor'),
  ]
}

export function attributedDatabase(db: D1Database): D1Database {
  const batch = async <T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> => {
    const event = authority.getStore()
    if (!event) return db.batch<T>(statements)
    const [before, after] = authorityStatements(db, event)
    return (await db.batch<T>([before, ...statements, after])).slice(1, -1)
  }
  const prepared = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, {
    get(target, key) {
      if (key === 'bind') return (...args: unknown[]) => prepared(target.bind(...args))
      if (key === 'run') return async () => (await batch([target]))[0]
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return new Proxy(db, {
    get(target, key) {
      if (key === 'prepare') return (sql: string) => prepared(target.prepare(sql))
      if (key === 'batch') return batch
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

export async function withAccountAuthority<T>(db: D1Database, operator: string, action: string, run: () => Promise<T>) {
  let member = await db.prepare('SELECT id FROM gk_members WHERE operator_id=?').bind(operator).first<{ id: string }>()
  if (!member) {
    // Native account administration can precede the owner's first workspace read.
    // Use the same automatic owner membership as the ordinary Gasket session.
    await db.prepare("INSERT INTO gk_members(id,operator_id,email,name,role,created_at) SELECT ?,id,lower(email),COALESCE(NULLIF(display_name,''),email),'owner',? FROM oa_operators WHERE id=? AND role='owner' AND status='active' ON CONFLICT DO NOTHING").bind(crypto.randomUUID(), Date.now(), operator).run()
    member = await db.prepare('SELECT id FROM gk_members WHERE operator_id=?').bind(operator).first<{ id: string }>()
  }
  return authority.run({ actor: member?.id ?? operator, action, at: Date.now() }, run)
}
