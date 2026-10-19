// A local installation as `rer` sees one: a scratch copy of this checkout's tracked
// files (sharing its node_modules) whose .wrangler/state holds the D1 that the
// emitted Worker runs on. GAS-11 exports one with `rer export` and restores the
// archive into an empty one with `rer import`.
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const checkout = fileURLToPath(new URL('../../', import.meta.url))
const exec = promisify(execFile)
const run = async (command, args, cwd) => {
  try { return (await exec(command, args, { cwd, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } })).stdout }
  catch (error) { throw new Error(`${[command, ...args].join(' ')} failed:\n${error.stdout}\n${error.stderr}`) }
}

/** An empty installation; `migrate()` gives it the schema the way `rer` does, `rer(...)` runs a rer command in it. */
export async function installation() {
  const root = await mkdtemp(join(tmpdir(), 'gasket-installation-'))
  for (const file of (await run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], checkout)).split('\0').filter(Boolean)) {
    await mkdir(dirname(join(root, file)), { recursive: true })
    await copyFile(join(checkout, file), join(root, file)).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
  await symlink(join(checkout, 'node_modules'), join(root, 'node_modules'))
  return {
    root,
    migrate: () => run(join(checkout, 'node_modules/.bin/wrangler'), ['d1', 'migrations', 'apply', 'foundation', '--local', '--persist-to', '.wrangler/state', '--config', 'wrangler.jsonc'], root),
    rer: (...args) => run(join(checkout, 'node_modules/.bin/rer'), [...args, '--cwd', root, '--non-interactive'], root),
    remove: () => rm(root, { recursive: true, force: true }),
  }
}
