// Gasket's public doors: /app pages, /app/do/ACTION form posts, /api/gasket
// JSON and evidence downloads. Every request resolves the signed-in member
// first; nothing is served to a signed-out request.
import { runtimeBindings, type Bindings } from '../auth.server'
import { AuthError, safeReturnTo } from '../modules/operator-auth/index.mjs'
import { actions } from './actions'
import { can, currentActor, type Actor } from './actor'
import { GasketError } from './core'
import { PAGE_DOORS, match } from './doors'
import { auditCsv } from './audit'
import { assetHistoryCsv } from './history'
import { Input } from './input'
import { site } from './site'
import { evidenceFile } from './work'
import { route } from './views'
import { assetPage, assetsPage } from './ui/assets'
import { boardPage } from './ui/board'
import { h } from './ui/html'
import { page } from './ui/shell'
import { moveInPage, previewPage } from './ui/movein'
import { partPage, partsPage } from './ui/parts'
import { proposalsPage } from './ui/proposals'
import { checklistPage, schedulesPage } from './ui/schedules'
import { accessPage, auditPage, morePage, sitePage } from './ui/settings'
import { workOrderPage, workPage } from './ui/work'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })

function failure(error: unknown): { code: string; status: number; detail?: unknown } {
  if (error instanceof GasketError) return { code: error.code, status: error.status, detail: error.detail }
  if (error instanceof AuthError) return { code: error.code, status: error.status }
  const code = error instanceof Error ? error.message : ''
  if (/^(IMPORT_|PROVENANCE_|TARGET_|NATIVE_EDIT_CONFLICT|REVERSAL_|UNDO_|CREDENTIAL_IN_DURABLE_DATA|SOURCE_|DUPLICATE_)/.test(code)) return { code: code.split(/[:\s]/)[0].toLowerCase(), status: 409 }
  console.error('gasket_internal_error', error)
  return { code: 'internal_error', status: 500 }
}

export async function gasketResponse(request: Request, original: Bindings): Promise<Response | null> {
  const env = runtimeBindings(original)
  const url = new URL(request.url)
  const api = url.pathname.startsWith('/api/gasket/')
  if (!api && url.pathname !== '/app' && !url.pathname.startsWith('/app/')) return null
  if (request.method === 'POST' && request.headers.get('origin') !== env.AUTH_ORIGIN) return api ? json({ error: 'invalid_origin' }, 403) : new Response('Forbidden', { status: 403 })
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) return new Response(null, { status: 405, headers: { allow: 'GET, HEAD, POST' } })
  let actor: Actor | null = null
  try {
    actor = await currentActor(env, request)
    if (!actor) return api ? json({ error: 'authentication_required' }, 401) : new Response(null, { status: 303, headers: { location: `/signin?returnTo=${encodeURIComponent(url.pathname)}`, 'cache-control': 'no-store' } })
    if (api) return await apiResponse(env, actor, request, url)
    return await pageResponse(env, actor, request, url)
  } catch (error) {
    const { code, status, detail } = failure(error)
    if (api) return json({ error: code, ...(detail === undefined ? {} : { detail }) }, status)
    if (status === 404) return page(env, 'Not found', actor, h`<h1>Not found</h1><p>There is nothing here you can open.</p><p><a class="gk-button gk-secondary" href="/app">Back to work</a></p>`, { status: 404 })
    return page(env, 'That did not work', actor, h`<h1>That did not work</h1><p>${code.replace(/_/g, ' ')}.</p><p><a class="gk-button gk-secondary" href="/app">Back to work</a></p>`, { status })
  }
}

async function apiResponse(env: Bindings, actor: Actor, request: Request, url: URL) {
  const path = url.pathname.slice('/api/gasket/'.length)
  if (request.method === 'POST') {
    const action = actions[path]
    if (!action) throw new GasketError('not_found', 404)
    return json(await action(env, actor, await Input.from(request), request))
  }
  const { view, id } = route(path)
  return json(await view(env, actor, id, url))
}

async function pageResponse(env: Bindings, actor: Actor, request: Request, url: URL): Promise<Response> {
  const path = url.pathname
  if (request.method === 'POST') {
    if (path === '/app/move-in/preview') return await previewPage(env, actor, await Input.from(request), url)
    const name = path.match(/^\/app\/do\/([\w.]+)$/)?.[1]
    const action = name ? actions[name] : undefined
    if (!action) throw new GasketError('not_found', 404)
    const input = await Input.from(request)
    const returnTo = safeReturnTo(input.text('returnTo', { optional: true, max: 300 }) || '/app', '/app')
    try {
      const result = await action(env, actor, input, request) as { id?: string; job?: string } | null
      return redirect(returnTo.replace('{id}', encodeURIComponent(result?.id ?? '')), 'notice', name === 'workorders.generate' ? created(result) : 'Saved.')
    } catch (error) {
      const { code, status } = failure(error)
      if (status >= 500) throw error
      return redirect(returnTo.replace('/{id}', ''), 'error', code)
    }
  }
  // The owner names the site before anything else.
  if (!await site(env)) {
    if (actor.role === 'owner') return path === '/app/site' ? await sitePage(env, actor, url, { first: true }) : redirect('/app/site')
    return page(env, 'Not ready', actor, h`<div class="gk-first"><h1>Gasket is not set up yet</h1><p>The owner needs to name the site first.</p></div>`)
  }
  const found = match(PAGE_DOORS, path)
  if (!found) throw new GasketError('not_found', 404)
  return await pages[found.name](env, actor, url, found.id)
}

const created = (result: unknown) => { const count = (result as { created?: unknown[] })?.created?.length ?? 0; return count ? `Created ${count} due work order${count === 1 ? '' : 's'}.` : 'No schedules are due yet.' }

type Page = (env: Bindings, actor: Actor, url: URL, id: string) => Promise<Response>
const guarded = (allowed: (actor: Actor) => boolean, render: Page): Page => async (env, actor, url, id) => {
  if (!allowed(actor)) throw new GasketError('forbidden', 403)
  return await render(env, actor, url, id)
}

const pages: Record<string, Page> = {
  work: (env, actor, url) => workPage(env, actor, url),
  workOrder: (env, actor, url, id) => workOrderPage(env, actor, id, url),
  evidence: (env, actor, _url, id) => evidenceFile(env, actor, id),
  assets: (env, actor, url) => assetsPage(env, actor, url),
  asset: (env, actor, url, id) => assetPage(env, actor, id, url),
  historyCsv: async (env, actor, _url, id) => new Response(await assetHistoryCsv(env, actor, id), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="asset-history-${id.slice(0, 8)}.csv"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }),
  schedules: (env, actor, url) => schedulesPage(env, actor, url),
  checklist: (env, actor, url, id) => checklistPage(env, actor, id, url),
  parts: (env, actor, url) => partsPage(env, actor, url),
  part: (env, actor, url, id) => partPage(env, actor, id, url),
  board: guarded(actor => can(actor, 'board.read'), (env, actor, url) => boardPage(env, actor, url)),
  proposals: (env, actor, url) => proposalsPage(env, actor, url),
  moveIn: guarded(actor => can(actor, 'import.run'), (env, actor, url) => moveInPage(env, actor, url)),
  site: guarded(actor => can(actor, 'site.manage'), (env, actor, url) => sitePage(env, actor, url)),
  access: guarded(actor => can(actor, 'site.manage'), (env, actor, url) => accessPage(env, actor, url)),
  audit: guarded(actor => can(actor, 'audit.read'), (env, actor, url) => auditPage(env, actor, url)),
  auditCsv: async (env, actor, url) => new Response(await auditCsv(env, actor, url), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="audit.csv"', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }),
  more: (env, actor, url) => morePage(env, actor, url),
}

function redirect(target: string, key?: 'notice' | 'error', value?: string) {
  const location = new URL(target, 'http://gasket.invalid')
  if (key && value) location.searchParams.set(key, value)
  return new Response(null, { status: 303, headers: { location: location.pathname + location.search, 'cache-control': 'no-store' } })
}
