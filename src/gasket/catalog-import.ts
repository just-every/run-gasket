// Reviewed catalog source, atomic application, exact replay and dependency-aware undo.
import type { Bindings } from '../auth.server'
import { capabilitySql, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt } from './core'
import { Input } from './input'
import { columns, readCsv } from './movein/csv'
import { toMilli } from './quantity'
import { buyer, supplierDetail } from './suppliers'
import { cents } from './valuation'
import { ITEM_COLUMNS, PART_COLUMNS, snapshotSql, snapshot, scopeParams, type Scope } from './catalog-snapshot'

const canonical = (id: string) => `COALESCE((SELECT canonical_id FROM gk_part_canonical WHERE part_id=${id}),${id})`
const HEADERS = ['number','name','unit','manufacturer','manufacturerNumber','vendorNumber','packUnit','packQuantity','price']
const authority = (env: Bindings, actor: Actor, capability: 'site.manage'|'register.manage') => {
  const check = capabilitySql(actor.sessionId, capability)
  return guard(env, 'stale', check.sql, ...check.params)
}

async function catalogPlan(env: Bindings, actor: Actor, input: Input) {
  buyer(actor)
  const supplier = await supplierDetail(env, input.text('supplier'))
  insist(supplier.active, 'supplier_inactive', 409)
  const file = (await input.file('file', { maxBytes: 1_500_000 }))!
  const csv = readCsv(file.bytes), header = csv.rows[0] ?? [], fields = columns(header)
  insist(HEADERS.every(name => fields.has(name)) && new Set(header.map(name => name.trim().toLowerCase())).size === header.length, 'invalid_catalog_headers')
  insist(csv.rows.length > 1 && csv.rows.length <= 1001, 'invalid_catalog_rows')
  const rows = csv.rows.slice(1).map((cells, index) => {
    insist(cells.length === header.length, 'invalid_catalog_row', 400, { row: index+2 })
    const value = Input.of(Object.fromEntries(HEADERS.map(name => [name, fields.get(cells, name)])))
    const price = cents(value, 'price'); insist(price !== null, 'missing_price')
    return { number: value.text('number', { max: 60 }), name: value.text('name', { max: 160 }), unit: value.text('unit', { max: 20 }),
      manufacturer: value.text('manufacturer', { max: 160, optional: true }), manufacturerNumber: value.text('manufacturerNumber', { max: 100, optional: true }),
      sku: value.text('vendorNumber', { max: 100 }), packUnit: value.text('packUnit', { max: 40 }), pack: toMilli(value.text('packQuantity'), 'packQuantity'), price }
  })
  insist(new Set(rows.map(row => row.sku)).size === rows.length, 'catalog_vendor_number_repeated')
  const [parts, items] = await Promise.all([all(env, `SELECT p.*,${canonical('p.id')} AS canonical_id FROM gk_parts p`), all(env, `SELECT i.*,${canonical('i.part_id')} AS canonical_id FROM gk_supplier_items i`)])
  const mapped = rows.map(row => {
    const previous = items.find(item => item.supplier_id === supplier.id && item.sku === row.sku)
    const part = previous?.part_id ? parts.find(part => part.id === previous.part_id) : parts.find(part => part.number === row.number)
    if (part) insist(part.unit === row.unit && part.number === row.number, 'catalog_identity_changed', 409, { vendorNumber: row.sku })
    return { ...row, partId: part?.id ?? null, canonicalId: part?.canonical_id ?? null, itemId: previous?.id ?? null, operation: previous ? 'update' : 'create' }
  })
  // Conflicting rows for one new part cannot let the first row choose its unit silently.
  for (const row of mapped) insist(mapped.every(other => other.number !== row.number || other.unit === row.unit && other.name === row.name), 'catalog_identity_changed', 409)
  const canonicalIds = new Set(mapped.map(row => row.canonicalId).filter(Boolean))
  const scope: Scope = { supplier: supplier.id, parts: parts.filter(part => canonicalIds.has(part.canonical_id)).map(part => part.id), items: mapped.map(row => row.itemId).filter((id): id is string => Boolean(id)), created: [] }
  const before = await snapshot(env,scope), digest = await sha256Hex(file.bytes)
  const observed = JSON.parse(before)
  const equalRows = (left: unknown[][], right: unknown[][]) => JSON.stringify([...left].sort((a,b) => String(a[0]).localeCompare(String(b[0])))) === JSON.stringify([...right].sort((a,b) => String(a[0]).localeCompare(String(b[0]))))
  insist(equalRows(observed.parts,parts.filter(part => scope.parts.includes(part.id)).map(part => PART_COLUMNS.split(',').map(column => part[column]))) &&
    equalRows(observed.items,items.filter(item => scope.parts.includes(item.part_id) || scope.items.includes(item.id)).map(item => ITEM_COLUMNS.split(',').map(column => item[column]))) &&
    observed.canonical.every((entry: string[]) => scope.parts.includes(entry[0])) &&
    mapped.every(row => !row.partId || (observed.canonical.find((entry: string[]) => entry[0] === row.partId)?.[1] ?? row.partId) === row.canonicalId),
    'catalog_preview_changed',409)
  const fingerprint = await sha256Hex(JSON.stringify({ digest, supplier: supplier.id, revision: supplier.revision, rows: mapped, before }))
  return { supplier, file, rows: mapped, items, scope, before, digest, fingerprint }
}

/** No write, audit or import job occurs until this exact review is approved. */
export async function catalogPreview(env: Bindings, actor: Actor, input: Input) {
  const plan = await catalogPlan(env,actor,input)
  return { supplier: { id: plan.supplier.id, name: plan.supplier.name, revision: plan.supplier.revision }, filename: plan.file.filename, digest: plan.digest,
    fingerprint: plan.fingerprint, rows: plan.rows, creates: new Set(plan.rows.filter(row => !row.partId).map(row => row.number)).size }
}

/** Apply exactly the reviewed source; an exact replay returns the retained result. */
export async function importCatalog(env: Bindings, actor: Actor, input: Input) {
  buyer(actor)
  const fingerprint = input.text('fingerprint', { max: 64 }), supplierId = input.text('supplier')
  const file = (await input.file('file', { maxBytes: 1_500_000 }))!, digest = await sha256Hex(file.bytes)
  const previousJob = await one(env,'SELECT * FROM gk_catalog_imports WHERE supplier_id=? AND digest=? AND fingerprint=?',supplierId,digest,fingerprint)
  if (previousJob) {
    insist(previousJob.undone_at === null,'catalog_import_undone',409)
    return { ...JSON.parse(previousJob.result_json), replayed: true }
  }
  const plan = await catalogPlan(env,actor,input)
  insist(plan.fingerprint === fingerprint,'catalog_preview_changed',409)
  const scope: Scope = { ...plan.scope, parts: [...plan.scope.parts], items: [...plan.scope.items], created: [] }
  const statements = [authority(env,actor,'site.manage'), guard(env,'catalog_preview_changed',`(SELECT snapshot FROM (${snapshotSql}))=?`,...scopeParams(plan.scope),plan.before)]
  const newParts = new Map<string,string>()
  const preferred = new Set(plan.items.filter(item => item.preferred).map(item => item.canonical_id))
  const touchedItems: string[] = []
  for (const row of plan.rows) {
    let partId = row.partId ?? newParts.get(row.number)
    if (!partId) {
      partId = newId(); newParts.set(row.number,partId); scope.parts.push(partId); scope.created.push(partId)
      statements.push(stmt(env,'INSERT INTO gk_parts(id,number,name,unit,created_at) VALUES (?,?,?,?,?)',partId,row.number,row.name,row.unit,now()))
    }
    const itemId = row.itemId ?? newId(), canonicalId = row.canonicalId ?? partId
    touchedItems.push(itemId)
    if (!scope.items.includes(itemId)) scope.items.push(itemId)
    const old = plan.items.find(item => item.id === itemId)
    const isPreferred = Boolean(old?.preferred) || partId === canonicalId && !preferred.has(canonicalId)
    if (isPreferred) preferred.add(canonicalId)
    statements.push(stmt(env,`INSERT INTO gk_supplier_items(${ITEM_COLUMNS}) VALUES (?,?,?,?,'part',?,?,?,?,?,?,?)
      ON CONFLICT(supplier_id,sku) DO UPDATE SET description=excluded.description,kind='part',unit=excluded.unit,price_cents=excluded.price_cents,
      part_id=excluded.part_id,manufacturer=excluded.manufacturer,manufacturer_number=excluded.manufacturer_number,pack_milli=excluded.pack_milli,preferred=excluded.preferred`,
      itemId,plan.supplier.id,row.sku,row.name,row.packUnit,row.price,partId,row.manufacturer,row.manufacturerNumber,row.pack,Number(isPreferred)))
    for (const [kind,number,supplier] of [['part',row.number,null],['manufacturer',row.manufacturerNumber,null],['vendor',row.sku,plan.supplier.id]]) {
      if (number) statements.push(stmt(env,'INSERT OR IGNORE INTO gk_part_aliases(part_id,kind,number,supplier_id) VALUES (?,?,?,?)',partId,kind,number,supplier))
    }
  }
  // The before image must use the final scope (new IDs are absent before apply).
  const before = await snapshot(env,scope), job = newId()
  scope.job = job
  const result = { id: plan.supplier.id, job, imported: plan.rows.length, created: scope.created.length }
  statements.push(stmt(env,'UPDATE gk_suppliers SET revision=revision+1,updated_by=?,updated_at=? WHERE id=?',actor.id,now(),plan.supplier.id),
    stmt(env,`INSERT INTO gk_catalog_imports(id,supplier_id,digest,fingerprint,filename,source_bytes,scope_json,before_snapshot,after_snapshot,result_json,applied_by,applied_at)
      SELECT ?,?,?,?,?,?,?,?,snapshot,?,?,? FROM (${snapshotSql})`,job,plan.supplier.id,plan.digest,fingerprint,plan.file.filename,plan.file.bytes,JSON.stringify({ ...scope, touchedItems }),before,JSON.stringify(result),actor.id,now(),...scopeParams(scope)))
  try { await commit(env,statements,{ actor: actor.id,action: 'catalog.import',subject: plan.supplier.id,detail: { digest: plan.digest,fingerprint,...result } }) }
  catch (error) {
    const concurrent = await one(env,'SELECT result_json,undone_at FROM gk_catalog_imports WHERE supplier_id=? AND digest=? AND fingerprint=?',supplierId,digest,fingerprint)
    if (concurrent && concurrent.undone_at === null) return { ...JSON.parse(concurrent.result_json), replayed: true }
    throw error
  }
  return { ...result, replayed: false }
}

/** Undo only this import, while all reviewed identities and dependent evidence stay unchanged. */
export async function undoCatalog(env: Bindings, actor: Actor, input: Input) {
  buyer(actor)
  const job = await one(env,'SELECT * FROM gk_catalog_imports WHERE id=?',input.text('job'))
  insist(job,'catalog_import_not_found',404)
  if (job.undone_at !== null) return { id: job.supplier_id,job: job.id,undone: true,replayed: true }
  const scope = JSON.parse(job.scope_json) as Scope & { touchedItems: string[] }
  const current = await snapshot(env,scope)
  insist(current === job.after_snapshot,'catalog_undo_blocked',409,{ reason: 'Catalog identities, supplier revision or dependent records changed after import.' })
  const before = JSON.parse(job.before_snapshot)
  const statements = [authority(env,actor,'site.manage'),guard(env,'catalog_undo_blocked',`(SELECT snapshot FROM (${snapshotSql}))=?`,...scopeParams(scope),job.after_snapshot),
    guard(env,'catalog_undo_blocked','EXISTS(SELECT 1 FROM gk_catalog_imports WHERE id=? AND undone_at IS NULL)',job.id),
    stmt(env,'DELETE FROM gk_part_aliases WHERE part_id IN (SELECT value FROM json_each(?))',JSON.stringify(scope.parts)),
    stmt(env,'UPDATE gk_supplier_items SET preferred=0 WHERE id IN (SELECT value FROM json_each(?))',JSON.stringify(scope.touchedItems))]
  const originalItemIds = new Set((before.items as unknown[][]).map(values => String(values[0])))
  for (const id of scope.touchedItems) if (!originalItemIds.has(id)) statements.push(stmt(env,'DELETE FROM gk_supplier_items WHERE id=?',id))
  for (const values of before.items as unknown[][]) {
    if (scope.touchedItems.includes(String(values[0]))) statements.push(stmt(env,`UPDATE gk_supplier_items SET ${ITEM_COLUMNS.split(',').slice(1).map(column => `${column}=?`).join(',')} WHERE id=?`,...values.slice(1),values[0]))
  }
  for (const values of before.aliases as unknown[][]) statements.push(stmt(env,'INSERT INTO gk_part_aliases(part_id,kind,number,supplier_id) VALUES (?,?,?,?)',...values))
  for (const id of scope.created) statements.push(stmt(env,'DELETE FROM gk_parts WHERE id=?',id))
  statements.push(stmt(env,'UPDATE gk_suppliers SET revision=revision+1,updated_by=?,updated_at=? WHERE id=?',actor.id,now(),job.supplier_id),
    stmt(env,'UPDATE gk_catalog_imports SET undone_by=?,undone_at=? WHERE id=?',actor.id,now(),job.id))
  await commit(env,statements,{ actor: actor.id,action: 'catalog.undo',subject: job.supplier_id,detail: { job: job.id } })
  return { id: job.supplier_id,job: job.id,undone: true,replayed: false }
}

