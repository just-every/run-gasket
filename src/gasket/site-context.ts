import { AsyncLocalStorage } from 'node:async_hooks'
import type { Actor } from './actor'
const authority = new AsyncLocalStorage<{ member: string; owner: boolean }>()
export const siteAuthority = () => authority.getStore()
export const withSiteAuthority = <T>(actor: Actor, run: () => Promise<T>) => authority.run({ member: actor.id, owner: actor.role === 'owner' }, run)
