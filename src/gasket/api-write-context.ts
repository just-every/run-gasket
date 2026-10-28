// Trusted request-local retry identity; no raw key or request body is retained.
import { AsyncLocalStorage } from 'node:async_hooks'

interface Claim { principal: string; keyHash: string }
const context = new AsyncLocalStorage<Claim>()
export const apiWriteClaim = () => context.getStore()
export const withApiWriteClaim = <T>(claim: Claim, run: () => Promise<T>) => context.run(claim, run)
