// PM-008: automatic mutations retain their job and are bounded by its current grant.
import { AsyncLocalStorage } from 'node:async_hooks'
export interface AutomationAuthority { job: string; rule: string; revision: number }
const context = new AsyncLocalStorage<AutomationAuthority>()
export const automationAuthority = () => context.getStore()
export const withAutomation = <T>(authority: AutomationAuthority, work: () => Promise<T>) => context.run(authority, work)
