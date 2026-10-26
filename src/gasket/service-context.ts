import { AsyncLocalStorage } from 'node:async_hooks'
const context = new AsyncLocalStorage<string>()
export const serviceAuthority = () => context.getStore()
export const withServiceAuthority = <T>(id: string | undefined, run: () => Promise<T>) => id ? context.run(id, run) : run()
