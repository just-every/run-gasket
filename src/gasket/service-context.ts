import { AsyncLocalStorage } from 'node:async_hooks'
const context = new AsyncLocalStorage<string | undefined>()
export const serviceAuthority = () => context.getStore()
// An absent credential explicitly clears inherited request authority for a standing grant.
export const withServiceAuthority = <T>(id: string | undefined, run: () => Promise<T>) => context.run(id, run)
