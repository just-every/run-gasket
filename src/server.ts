import { agentDocumentation } from './gasket/agent-door/docs'
import { gasketAgentDoor } from './gasket/agent-door'
import { gasketBusiness } from './gasket/agent-door/business'
import { withDemo } from './modules/demo/index.mjs'
import { seedDemo } from './demo'
import start from '@tanstack/react-start/server-entry'
import { Hono } from 'hono'
import { dispatch } from './base/dispatch'
import { staticAssetResponse } from './base/static-assets'
import { deploymentHealth } from './base/deployment-health'
import { lobbyResponse } from './base/lobby'
import { setupStateResponse } from './base/setup-state'
import { authResponse, runtimeBindings, type Bindings } from './auth.server'
import { identity } from './identity'
import { withIconsResponse } from './icon-head'
import { gasketResponse } from './gasket/http'
import { runScheduler } from './gasket/scheduler'

const api = new Hono<{ Bindings: Bindings }>()
api.get('/health', (context) => context.json({ status: 'ok', ...deploymentHealth(context.env) }))

// Start documents keep their own cache policy and add no-transform, so no proxy
// rewrites the HTML React hydrates (Cloudflare's email address obfuscation
// honours it; src/base/hydration/README.md).
function noTransform(response: Response): Response {
  const headers = new Headers(response.headers), policy = headers.get('cache-control')
  headers.set('cache-control', policy ? `${policy}, no-transform` : 'no-transform')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export default withDemo({
  async fetch(request, env, execution) {
    const asset = await staticAssetResponse(request, env)
    if (asset) return asset
    const runtime = runtimeBindings(env)
    const documentation = agentDocumentation(request, runtime)
    if (documentation) return documentation
    const path = new URL(request.url).pathname
    const business = ['/api/rer/business-settings','/rer-business-logo','/rer-business.css'].includes(path) ? await gasketBusiness(runtime).handle(request) : null
    if (business) return business
    const agent = path === '/api/rer/agent-policy' || path === '/mcp' || path === '/agents' || path.startsWith('/agents/') || path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp'
      ? await gasketAgentDoor(runtime).handle(request) : null
    if (agent) return agent
    const auth = await authResponse(request, env)
    if (auth) return auth
    // The installed variant: the Lobby at / and the public claim state it reads.
    // Local dev serves the saved origin's data at its own port (RER_DEV_ORIGIN).
    const state = await setupStateResponse(request, runtimeBindings(env))
    if (state) return state
    const lobby = await lobbyResponse(request, runtimeBindings(env), identity)
    if (lobby) return await withIconsResponse(lobby)
    const gasket = await gasketResponse(request, env)
    if (gasket) return gasket
    return dispatch(request, () => api.fetch(request, env, execution), async () => noTransform(await start.fetch(request)))
  },
  // PM-001: the Cron Trigger declared in wrangler.jsonc and deploy.json.
  async scheduled(controller, env) {
    await runScheduler(runtimeBindings(env), controller.scheduledTime, controller.cron)
  },
} satisfies ExportedHandler<Bindings>, { seed: seedDemo })
