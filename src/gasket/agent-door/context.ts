import { AsyncLocalStorage } from 'node:async_hooks'
import type { ToolContext } from '../../modules/agent-door/index.ts'

export interface NativePolicyFence { envelope: string | null; local_document: string | null; local_revision: number }
const context = new AsyncLocalStorage<{ ctx: ToolContext; policy: NativePolicyFence }>()
export const agentContext = () => context.getStore()?.ctx
export const agentPolicyFence = () => context.getStore()?.policy
export const withAgentContext = <T>(ctx: ToolContext, policy: NativePolicyFence, run: () => Promise<T>) => context.run({ ctx, policy }, run)
