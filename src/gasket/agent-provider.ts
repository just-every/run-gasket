// AGENT-009: the one model provider door. It adapts Base's ai.provider.v1 client
// (src/modules/ai): one attempt per run, a hard deadline, no retry, no fallback
// to another provider, and fixed error codes that never carry upstream text.
import type { Bindings } from '../auth.server'
import { AiError, aiDiagnostics, createAiClient } from '../modules/ai/index.mjs'

/** The provider settings of this installation (deploy.json declares them); Base's Bindings stays untouched. */
type ModelEnv = Bindings & { AI_ENABLED?: string; AI_API_KEY?: string; AI_BASE_URL?: string; AI_DEADLINE_MS?: string }

const FEATURE = 'agent-run'
const DEADLINE_MS = 45_000
const MAX_BODY = 200_000

const configOf = (bindings: Bindings) => {
  const env = bindings as ModelEnv
  return {
    enabled: env.AI_ENABLED === 'true',
    direct: { baseUrl: env.AI_BASE_URL || 'https://api.openai.com/v1', apiKey: env.AI_API_KEY },
    features: { [FEATURE]: 'direct' as const },
  }
}

/** Which provider a grant can name now: its host only, never a key. */
export function providerState(env: Bindings): { configured: true; name: string } | { configured: false; reason: string } {
  const config = configOf(env)
  if (!config.enabled) return { configured: false, reason: 'ai_disabled' }
  if (aiDiagnostics(config).length) return { configured: false, reason: 'ai_misconfigured' }
  return { configured: true, name: new URL(config.direct.baseUrl).host }
}

export interface ModelAnswer { text: string; promptTokens: number | null; completionTokens: number | null }

/** One chat completion. Throws an AiError with a fixed code; an aborted or dropped call is upstream_uncertain. */
export async function askModel(env: Bindings, body: Record<string, unknown>): Promise<ModelAnswer> {
  const configured = Number((env as ModelEnv).AI_DEADLINE_MS), deadlineMs = Number.isInteger(configured) && configured >= 1 && configured <= 110_000 ? configured : DEADLINE_MS
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), deadlineMs)
  try {
    const response = await createAiClient(configOf(env)).chat(body, { feature: FEATURE, signal: abort.signal })
    const text = await response.text()
    if (text.length > MAX_BODY) throw new AiError('response_too_large')
    let parsed: any
    try { parsed = JSON.parse(text) } catch { throw new AiError('ai_invalid_response') }
    const content = parsed?.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new AiError('ai_invalid_response')
    const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null
    return { text: content, promptTokens: count(parsed.usage?.prompt_tokens), completionTokens: count(parsed.usage?.completion_tokens) }
  } catch (error) {
    if (error instanceof AiError) throw error
    throw new AiError('upstream_uncertain', 504)
  } finally { clearTimeout(timer) }
}
