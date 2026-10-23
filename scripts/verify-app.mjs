// Full local verification includes every suite. CI runs the foundation under
// rer verify (retaining hosted-output and hydration checks), with the product
// flows, requests and stock suites in required parallel jobs of the same workflow.
import { spawnSync } from 'node:child_process'

const suites = {
  all: ['verify:foundation', 'test:flows', 'test:requests', 'test:agent-stock'],
  foundation: ['verify:foundation'],
}
const selected = process.env.GASKET_VERIFY_SHARD ?? 'all'
if (!Object.hasOwn(suites, selected)) throw new Error(`Unknown verification suite: ${selected}`)
for (const script of suites[selected]) {
  const result = spawnSync('pnpm', ['run', script], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
