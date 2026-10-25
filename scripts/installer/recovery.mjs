// Record only an archive operation that the pinned adapter completed successfully.
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { parseJsonc } from '@runeditrun/rer/jsonc'
import { fileRecords } from '@runeditrun/rer/modules/portability/files'

export function recoveryPortability(portability) {
  async function run(context, verb) {
    const result = await portability[verb](context)
    let manifest
    for await (const record of fileRecords(context.path)) {
      if (record.kind === 'manifest') manifest = record
    }
    const { getPlatformProxy } = createRequire(join(context.root, 'package.json'))('wrangler')
    // Use only data bindings, just as the pinned archive adapter does.
    const original = parseJsonc(await readFile(join(context.root, 'wrangler.jsonc'), 'utf8'))
    const path = join(context.root, '.wrangler', `gasket-recovery-${randomUUID()}.json`)
    await mkdir(join(context.root, '.wrangler'), { recursive: true })
    let proxy
    try {
      await writeFile(path, JSON.stringify(Object.fromEntries(['name','compatibility_date','compatibility_flags','d1_databases','r2_buckets'].filter(key => original[key] !== undefined).map(key => [key, original[key]]))), { mode: 0o600 })
      proxy = await getPlatformProxy({ configPath: path, persist: { path: join(context.root, '.wrangler/state/v3') }, remoteBindings: false })
      await proxy.env.DB.prepare('INSERT INTO gk_recovery_receipts(id,kind,recorded_at,recovery_point,content_hash,archive_hash,tables_json) VALUES(?,?,?,?,?,?,?)')
        .bind(randomUUID(), verb === 'export' ? 'backup' : 'restore', Date.now(), manifest.exportedAt, result.contentHash, result.archiveHash, JSON.stringify(result.tables)).run()
    } finally { await proxy?.dispose(); await rm(path, { force: true }) }
    return result
  }
  return { ...portability, export: context => run(context, 'export'), import: context => run(context, 'import') }
}
