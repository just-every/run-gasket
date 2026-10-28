import { displayLocale, intakeLanguage, intakeError, intakeCompleteness, languageCookie, type IntakeLanguage } from './languages'
import { recordErasurePage } from './ui/record-erasure'
import { authorizeOperationalSite } from './site-access'
import { withSiteAuthority } from './site-context'
import { describeError } from './ui/html'
import { reportSchedulesPage } from './ui/report-schedules'
import { previewReportPack } from './report-schedules'
import { packCsv, packPdf } from './report-packs'
import { withServiceAuthority } from './service-context'
import { authorizeService } from './service-auth'
import { apiEstate, keyedWrite } from './api-contract'
import { compliancePack } from './compliance-pack'
import { planningPage } from './ui/planning'
import { rulesPage } from './ui/rules'
import { agentRunsPage } from './ui/agent-runs'
import { agentRunsCsv } from './agent-run-views'
import { customFieldsPage, locationPage } from './ui/custom-fields'
import { customRegisterCsv } from './custom-export'
import { requestReportPage } from './ui/request-report'
import { requestReportCsv } from './request-report'
import { workPdf, workPdfZip } from './work-pdf'
import { costingPage } from './ui/costing'
import { costingCsv } from './costing'
import { labelsPage, scanPage } from './ui/labels'
import { submitRequest, requestFile } from './requests'
import { responseSettingsPage, requestPortalPage, requestReceiptPage, requestSettingsPage, requestsPage, requestPage } from './ui/requests'
import { catalogPreviewPage } from './ui/catalog-preview'
import { partMergePage } from './ui/part-merge'
import { partPhoto } from './part-photos'
import { replenishmentPage } from './ui/replenishment'
import { receiptEvidence } from './receiving'
import { vendorFollowUpPage } from './ui/vendor-follow-up'
// Gasket's public doors: /app pages, /app/do/ACTION form posts, /api/gasket
// JSON and evidence downloads. Every request resolves the signed-in member
// first; private pages/API/downloads refuse signed-out requests. Only opted-in
// scoped intake, number-only receipt capabilities and public scan states bypass
// that private boundary.
import { spendPolicyPage } from './ui/spend-policy'
import { metricsPage } from './ui/metrics'
import { purchaseAttachment } from './quotes'
import { purchaseOrderPage, purchaseOrdersPage } from './ui/purchase-orders'
import { nestedPage } from './ui/nested'
import { runtimeBindings, type Bindings } from '../auth.server'
import { AuthError, safeReturnTo } from '../modules/operator-auth/index.mjs'
import { actions } from './actions'
import { can, currentActor, type Actor } from './actor'
import { GasketError, newId } from './core'
import { beginSave, finishSave, readSave, saveBindings, saveId, saveMessage } from './form-saves'
import { failedForm, retainedForm } from './ui/failed-form'
import { PAGE_DOORS, match } from './doors'
import { auditCsv } from './audit'
import { assetHistoryCsv } from './history'
import { ledgerCsv } from './lifecycle'
import { reconciliationCsv } from './valuation'
import { Input } from './input'
import { site } from './site'
import { evidenceFile } from './work'
import { signatureMark } from './signatures'
import { commentPhoto } from './comments'
import { documentFile, jobPack } from './documents'
import { workOrderDetail } from './work'
import { route } from './views'
import { assetPage, assetsPage } from './ui/assets'
import { boardPage } from './ui/board'
import { h } from './ui/html'
import { page } from './ui/shell'
import { moveInPage, previewPage } from './ui/movein'
import { genericPreviewPage, reconciliationPage } from './ui/generic-movein'
import { HEADERS, type SheetKind } from './movein/generic-mapping'
import { spreadsheetTemplate } from './movein/spreadsheet'
import { partPage, partsPage } from './ui/parts'
import { countPage } from './ui/counts'
import { automationPage } from './ui/automation'
import { purchasingPage, supplierPage, requisitionPage } from './ui/purchasing'
import { storesPage } from './ui/stores'
import { storesMovementsCsv } from './stores'
import { proposalsPage } from './ui/proposals'
import { checklistPage, schedulesPage } from './ui/schedules'
import { codesPage } from './ui/codes'
import { noticesPage } from './ui/chasing'
import { teamsPage } from './ui/crew'
import { performancePage } from './ui/performance'
import { reliabilityPage } from './ui/reliability'
import { availabilityPage } from './ui/availability'
import { badActorsPage } from './ui/bad-actors'
import { badActorsCsv } from './bad-actors'
import { templatesPage } from './ui/templates'
import { accessPage, auditPage, morePage, sitePage, languagePage } from './ui/settings'
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
  const scan=url.pathname.match(/^\/scan(?:\/([\w-]+))?$/)
  const publicRequest=url.pathname.match(/^\/request\/([\w-]+)(?:\/received\/([\w-]+))?$/)
  const api = url.pathname.startsWith('/api/gasket/')
  if (!scan && !publicRequest && !api && url.pathname !== '/app' && !url.pathname.startsWith('/app/')) return null
  if (request.method === 'POST' && request.headers.get('origin') !== env.AUTH_ORIGIN) return api ? json({ error: 'invalid_origin' }, 403) : new Response('Forbidden', { status: 403 })
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) return new Response(null, { status: 405, headers: { allow: 'GET, HEAD, POST' } })
  let actor: Actor | null = null
  let language: IntakeLanguage | undefined
  try {
    actor = await currentActor(env, request)
    if (publicRequest) language = await intakeLanguage(env,await displayLocale(env,actor,request))
    if (actor?.service && !api) throw new GasketError('service_scope_forbidden', 403)
    const directoryDoor = /^\/api\/gasket\/(?:v1\/)?(?:sites(?:\/[\w-]+)?|site\.(?:create|update|membership))$/.test(url.pathname) || /^\/app\/do\/site\.(?:create|update|membership)$/.test(url.pathname)
    if (actor && !directoryDoor) await authorizeOperationalSite(env, actor, request)
    if(scan) {
      if(request.method==='POST') throw new GasketError('not_found',404)
      const code=scan[1] || url.searchParams.get('code') || ''
      try {return await scanPage(env,actor,url,code || undefined)} catch(error) {if(error instanceof GasketError && error.code==='label_unknown') return page(env,'Unknown label',actor,h`<h1>Unknown label</h1><p>This code does not identify a published Gasket label.</p><p><a href="/scan">Scan another label</a></p>`,{url,status:404});throw error}
    }
    if(publicRequest) {
      const [,id,key]=publicRequest
      if(request.method==='POST') {
        if(key) throw new GasketError('not_found',404)
        const input = await requestIntakeInput(request)
        try {
          const result=await submitRequest(env,actor,id,input,request)
          if(request.headers.get('accept')?.includes(['application', 'json'].join('/'))) return json(result)
          return new Response(null,{status:303,headers:{location:result.receipt,'cache-control':'no-store'}})
        } catch (error) {
          const { code, status } = failure(error)
          // Intake's single atomic insert either returns its existing keyed receipt or refuses.
          if(request.headers.get('accept')?.includes(['application', 'json'].join('/'))) return json({error:code,message:intakeError(language!,code),persistence:status < 500 ? 'none' : 'unconfirmed'},status)
          const source = new URL(url); source.searchParams.set('target',input.text('target',{optional:true,max:100}))
          const original = await requestPortalPage(env,actor,source,id,request)
          const receipt = `/request/${id}/received/${encodeURIComponent(input.text('submissionKey',{optional:true,max:100}))}`
          const message = language!.text('failed',{detail:intakeError(language!,code)}) + ' ' + language!.text(status < 500 ? 'nothingSaved' : 'unconfirmed')
          const recovered = await failedForm(original,url.pathname,input,message,receipt,status < 500,status,language)
          if (recovered) return recovered
          throw error
        }
      }
      return key ? await requestReceiptPage(env,url,id,key,request,actor) : await requestPortalPage(env,actor,url,id,request)
    }
    if (!actor) {
      if (api) return json({ error: 'authentication_required' }, 401)
      if (request.method === 'POST') {
        const input = await Input.from(request)
        return page(env, 'Sign in to save', null, h`<h1>Sign in to save</h1>${await retainedForm(url.pathname, input, 'Your session ended. Nothing was saved by this request.')}`, { status: 401 })
      }
      return new Response(null, { status: 303, headers: { location: `/signin?returnTo=${encodeURIComponent(url.pathname)}`, 'cache-control': 'no-store' } })
    }
    if (api) return await withSiteAuthority(actor, () => withServiceAuthority(actor!.service?.id, () => apiResponse(env, actor!, request, url)))
    return await withSiteAuthority(actor, () => pageResponse(env, actor!, request, url))
  } catch (error) {
    const { code, status, detail } = failure(error)
    if (publicRequest) {
      language ??= await intakeLanguage(env,await displayLocale(env,null,request))
      if (request.headers.get('accept')?.includes(['application','json'].join('/'))) return json({error:code,message:intakeError(language,code)},status)
      const t=language.text
      return languageCookie(await page(env,t('error_title'),null,h`<h1>${t('error_title')}</h1><p role="alert">${intakeError(language,code)}</p><p><a href="/request/${publicRequest[1]}">${t('back')}</a></p>`,{url,status,language}),request,actor)
    }
    if (api) return json({ error: code, ...(detail === undefined ? {} : { detail }) }, status)
    if (code === 'site_not_found' || code === 'site_not_operational') return new Response('Site access unavailable', { status, headers: { 'content-type': ['text', 'plain'].join('/') + '; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
    if (status === 404) return page(env, 'Not found', actor, h`<h1>Not found</h1><p>There is nothing here you can open.</p><p><a class="gk-button gk-secondary" href="/app">Back to work</a></p>`, { status: 404 })
    return page(env, 'That did not work', actor, h`<h1>That did not work</h1><p>${code.replace(/_/g, ' ')}.</p><p><a class="gk-button gk-secondary" href="/app">Back to work</a></p>`, { status })
  }
}

// Bound streamed bodies before multipart/JSON parsing, including chunked uploads.
async function requestIntakeInput(request:Request) {
  const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0
  if(reader) while(true) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8_000_000){await reader.cancel();throw new GasketError('request_too_large',413)}chunks.push(value)}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
  return Input.from(new Request(request.url,{method:request.method,headers:request.headers,body:bytes}))
}

async function apiResponse(env: Bindings, actor: Actor, request: Request, url: URL) {
  const suffix = url.pathname.slice('/api/gasket/'.length)
  const versioned = suffix.startsWith('v1/')
  const path = versioned ? suffix.slice(3) : suffix
  authorizeService(actor, request, path)
  if (/^v[0-9]+(?:\/|$)/.test(path)) throw new GasketError('unsupported_api_version', 404)
  if (request.method === 'POST') {
    const action = Object.hasOwn(actions, path) ? actions[path] : undefined
    if (!action) throw new GasketError('not_found', 404)
    if (request.headers.has('idempotency-key')) {
      const kept = await keyedWrite(env, actor, request, path, input => action(env, actor, input, request))
      const response = json(kept.result)
      response.headers.set('idempotency-replayed', String(kept.replayed))
      return response
    }
    return json(await action(env, actor, await Input.from(request), request))
  }
  if (versioned && ['assets', 'work', 'parts'].includes(path)) return json(await apiEstate(env, actor, path, url))
  const { view, id } = route(path)
  return json(await view(env, actor, id, url))
}

async function pageResponse(env: Bindings, actor: Actor, request: Request, url: URL): Promise<Response> {
  const path = url.pathname
  const receiptId = path.match(/^\/app\/save-receipts\/([a-f0-9-]{36})$/i)?.[1]
  if (receiptId && request.method === 'GET') {
    const receipt = await readSave(env, actor, receiptId)
    if (request.headers.get('accept') === ['application', 'json'].join('/')) return json({ ...receipt, message: saveMessage(receipt) })
    return page(env, 'Save receipt', actor, h`<h1>Save receipt</h1><p role="status">${saveMessage(receipt)}</p><p>Action: ${receipt.action}</p><p><a href="${receipt.destination || '/app'}">Inspect saved records</a></p>`, { url })
  }
  if (request.method === 'POST') {
    const previews: Record<string, { name: string; run: (bindings: Bindings, member: Actor, input: Input) => Promise<Response> }> = {
      '/app/parts/catalog-preview': { name: 'catalog.review', run: (bindings,member,input) => catalogPreviewPage(bindings,member,input,url) },
      '/app/move-in/preview': { name: 'movein.review', run: (bindings,member,input) => previewPage(bindings,member,input,url) },
      '/app/move-in/spreadsheet-preview': { name: 'spreadsheet.review', run: (bindings,member,input) => genericPreviewPage(bindings,member,input,url) },
    }
    const preview = Object.hasOwn(previews, path) ? previews[path] : undefined
    const name = preview?.name || path.match(/^\/app\/do\/([\w.]+)$/)?.[1]
    const action: typeof actions[string] | undefined = preview ? (bindings, member, input) => preview.run(bindings, member, input) : name && Object.hasOwn(actions, name) ? actions[name] : undefined
    if (!action) throw new GasketError('not_found', 404)
    const enhanced = request.headers.get('accept') === ['application', 'json'].join('/')
    const input = await Input.from(request)
    const returnTo = safeReturnTo(input.text('returnTo', { optional: true, max: 300 }) || '/app', '/app')
    const id = saveId(input.text('__gk_save', { optional: true, max: 100 }))
    const receipt = `/app/save-receipts/${id}`
    const claimed = await beginSave(env, actor, id, name!)
    try {
      if (!claimed) throw new GasketError('save_already_attempted', 409)
      const result = await action(saveBindings(env, id), actor, input, request) as { id?: string; job?: string } | Response | null
      if (result instanceof Response) { await finishSave(env, id, 'saved'); return result }
      const destination = returnTo.replace('{id}', encodeURIComponent(result?.id ?? ''))
      const notice = name === 'automation.catchup' ? 'Catch-up execution recorded. Check its outcome below.' : name === 'workorders.generate' ? created(result) : name === 'workorders.fromTemplate' ? raised(result) : 'Saved.'
      await finishSave(env, id, 'saved', destination)
      if (enhanced) return json({ saved: true, destination, notice, receipt })
      return redirect(destination, 'notice', notice)
    } catch (error) {
      const { code, status } = failure(error)
      if (claimed) await finishSave(env, id, 'failed')
      const outcome = await readSave(env, actor, id)
      const message = `Save failed: ${describeError(code)} ${saveMessage(outcome)}`
      const retry = outcome.state === 'failed' && outcome.batches === 0
      if (enhanced) return json({ saved: false, error: message, receipt, retry, nextSaveId: retry ? newId() : null }, status)
      if (!input.has('__gk_save') && !request.headers.has('referer') && status < 500) return redirect(returnTo.replace('/{id}', ''), 'error', code)
      const referer = new URL(input.text('__gk_source', { optional: true, max: 8000 }) || request.headers.get('referer') || returnTo.replace('/{id}', ''), url.origin)
      const source = referer.origin === url.origin && (referer.pathname === '/app' || referer.pathname.startsWith('/app/')) ? referer : new URL('/app', url.origin)
      try {
        const original = await pageResponse(env, actor, new Request(source), source)
        const recovered = await failedForm(original, path, input, message, receipt, retry, status)
        if (recovered) return recovered
      } catch { /* A changed permission must not render a now-forbidden source page. */ }
      return page(env, 'Save failed', actor, h`<h1>Save failed</h1>${await retainedForm(path,input,message,receipt,retry)}`, { status })
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

/** PLAN-001: every asset's outcome of raising work from a template, in one line. */
const raised = (result: unknown) => (result as { preview: boolean; rows: { tag: string | null; asset: string; outcome: string; number: number | null }[] }).rows
  .map(row => `${row.tag ?? row.asset}: ${row.outcome === 'created' ? `raised WO-${String(row.number).padStart(4, '0')}` : row.outcome === 'would_create' ? 'would be raised' : row.outcome.replace(/_/g, ' ')}`).join('; ') + '.'
const created = (result: unknown) => { const count = (result as { created?: unknown[] })?.created?.length ?? 0; return count ? `Created ${count} due work order${count === 1 ? '' : 's'}.` : 'No schedules are due yet.' }

type Page = (env: Bindings, actor: Actor, url: URL, id: string) => Promise<Response>
const guarded = (allowed: (actor: Actor) => boolean, render: Page): Page => async (env, actor, url, id) => {
  if (!allowed(actor)) throw new GasketError('forbidden', 403)
  return await render(env, actor, url, id)
}

const pages: Record<string, Page> = {
  language:languagePage,
  languageCatalog:async(env,actor)=>new Response(JSON.stringify(await intakeCompleteness(env,actor),null,2),{headers:{'content-type':['application','json'].join('/'),'cache-control':'private, no-store','content-disposition':'attachment; filename=intake-catalog-completeness.json','x-content-type-options':'nosniff'}}),
  spreadsheetReconciliation: reconciliationPage,
  spreadsheetTemplate: guarded(actor=>can(actor,'import.run'),async(_env,_actor,_url,id)=>{
    const [kind,format]=id.split('.') as [SheetKind,'csv'|'xls'|'xlsx']
    if (!Object.hasOwn(HEADERS, kind)) throw new GasketError('not_found', 404)
    const bytes=await spreadsheetTemplate(format,kind,[...HEADERS[kind]])
    const type=format==='csv'?['text','csv'].join('/'):format==='xls'?['application','vnd.ms-excel'].join('/'):['application','vnd.openxmlformats-officedocument.spreadsheetml.sheet'].join('/')
    return new Response(bytes as BodyInit,{headers:{'content-type':type,'cache-control':'private, no-store','content-disposition':`attachment; filename="${id}"`}})
  }),
  recordErasure: (env,actor,url)=>recordErasurePage(env,actor,url),
  reportSchedules: (env,actor,url)=>reportSchedulesPage(env,actor,url),
  reportPackPdf: async(env,actor,_url,id)=>new Response(await packPdf(await previewReportPack(env,actor,id)) as BodyInit,{headers:{'content-type':['application','pdf'].join('/'),'cache-control':'private, no-store','content-disposition':'attachment; filename=report.pdf'}}),
  reportPackCsv: async(env,actor,_url,id)=>new Response(packCsv(await previewReportPack(env,actor,id)),{headers:{'content-type':['text','csv'].join('/'),'cache-control':'private, no-store','content-disposition':'attachment; filename=dataset.csv'}}),
  compliancePack: (env,actor,_url,id)=>compliancePack(env,actor,id),
  agentRuns: guarded(actor => can(actor, 'agent.run'), (env, actor, url) => agentRunsPage(env, actor, url)),
  agentRunsCsv: async (env, actor) => new Response(await agentRunsCsv(env, actor), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="agent-runs.csv"', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }),
  rules: (env,actor,url)=>rulesPage(env,actor,url),
  customFields: (env,actor,url)=>customFieldsPage(env,actor,url),
  locationFields: (env,actor,url,id)=>locationPage(env,actor,id,url),
  ...Object.fromEntries(['asset','part','location'].map(type => [type+'sCsv', async (env:Bindings,actor:Actor,url:URL) => new Response(await customRegisterCsv(env,actor,type,url), {headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="${type}s.csv"`,'cache-control':'private, no-store'}})])),
  requestResponse: (env,actor,url)=>responseSettingsPage(env,actor,url),
  workPdf: (env, actor, _url, id) => workPdf(env, actor, id),
  workPdfZip: (env, actor, url) => workPdfZip(env, actor, url),
  costing: (env,actor,url) => costingPage(env,actor,url),
  costingCsv: async (env,actor,url) => new Response(await costingCsv(env,actor,url), {headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="maintenance-costs.csv"','cache-control':'private, no-store','x-content-type-options':'nosniff'}}),
  labels:(env,actor,url)=>labelsPage(env,actor,url),
  requestReport:(env,actor,url)=>requestReportPage(env,actor,url),
  requestReportCsv:async (env,actor,url)=>new Response(await requestReportCsv(env,actor,url),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="requests.csv"','cache-control':'private, no-store','x-content-type-options':'nosniff'}}),
  requestPortals:(env,actor,url)=>requestSettingsPage(env,actor,url), requests:(env,actor,url)=>requestsPage(env,actor,url), request:(env,actor,url,id)=>requestPage(env,actor,url,id), requestFile:(env,actor,_url,id)=>requestFile(env,actor,id),
  partMerge:(env,actor,url)=>partMergePage(env,actor,url),
  partPhoto:(env,actor,_url,id)=>partPhoto(env,actor,id),
  vendorFollowUp: (env,actor,url) => vendorFollowUpPage(env,actor,url),
  replenishment: (env,actor,url) => replenishmentPage(env,actor,url),
  receiptEvidence: (env,actor,_url,id) => receiptEvidence(env,actor,id),
  metrics: (env,actor,url) => metricsPage(env,actor,url),
  spendPolicy: (env,actor,url) => spendPolicyPage(env,actor,url),
  purchaseOrders: (env, actor, url) => purchaseOrdersPage(env, actor, url),
  purchaseOrder: (env, actor, url, id) => purchaseOrderPage(env, actor, id, url),
  purchaseFile: (env, actor, _url, id) => purchaseAttachment(env, actor, id),
  nested: (env, actor, url) => nestedPage(env, actor, url),
  automation: (env, actor, url) => automationPage(env, actor, url),
  purchasing: (env, actor, url) => purchasingPage(env, actor, url),
  supplier: (env, actor, url, id) => supplierPage(env, actor, id, url),
  requisition: (env, actor, url, id) => requisitionPage(env, actor, id, url),
  work: (env, actor, url) => workPage(env, actor, url),
  workOrder: (env, actor, url, id) => workOrderPage(env, actor, id, url),
  evidence: (env, actor, _url, id) => evidenceFile(env, actor, id),
  signatureMark: (env, actor, _url, id) => signatureMark(env, actor, id),
  commentPhoto: (env, actor, _url, id) => commentPhoto(env, actor, id),
  documentFile: (env, actor, _url, id) => documentFile(env, actor, id),
  jobPack: async (env, actor, _url, id) => jobPack(env, actor, id, await workOrderDetail(env, actor, id)),
  assets: (env, actor, url) => assetsPage(env, actor, url),
  asset: (env, actor, url, id) => assetPage(env, actor, id, url),
  historyCsv: async (env, actor, _url, id) => new Response(await assetHistoryCsv(env, actor, id), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="asset-history-${id.slice(0, 8)}.csv"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }),
  ledgerCsv: async (env, actor, _url, id) => new Response(await ledgerCsv(env, actor, id), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="asset-ledger-${id.slice(0, 8)}.csv"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }),
  schedules: (env, actor, url) => schedulesPage(env, actor, url),
  checklist: (env, actor, url, id) => checklistPage(env, actor, id, url),
  parts: (env, actor, url) => partsPage(env, actor, url),
  part: (env, actor, url, id) => partPage(env, actor, id, url),
  count: (env, actor, url, id) => countPage(env, actor, id, url),
  stores: guarded(actor => can(actor, 'board.read'), (env, actor, url) => storesPage(env, actor, url)),
  storesCsv: async (env, actor, url) => new Response(await storesMovementsCsv(env, actor, url), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="stores-movements.csv"', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }),
  valuationCsv: async (env, actor, url) => new Response(await reconciliationCsv(env, actor, url), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="parts-valuation.csv"', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }),
  board: guarded(actor => can(actor, 'board.read'), (env, actor, url) => boardPage(env, actor, url)),
  proposals: (env, actor, url) => proposalsPage(env, actor, url),
  moveIn: guarded(actor => can(actor, 'import.run'), (env, actor, url) => moveInPage(env, actor, url)),
  site: guarded(actor => can(actor, 'site.manage'), (env, actor, url) => sitePage(env, actor, url)),
  access: guarded(actor => can(actor, 'site.manage'), (env, actor, url) => accessPage(env, actor, url)),
  audit: guarded(actor => can(actor, 'audit.read'), (env, actor, url) => auditPage(env, actor, url)),
  auditCsv: async (env, actor, url) => new Response(await auditCsv(env, actor, url), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="audit.csv"', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }),
  codes: (env, actor, url) => codesPage(env, actor, url),
  notices: (env, actor, url) => noticesPage(env, actor, url),
  planning:(env,actor,url)=>planningPage(env,actor,url), resources:(env,actor,url)=>planningPage(env,actor,url,true),
  teams: (env, actor, url) => teamsPage(env, actor, url),
  performance: guarded(actor => can(actor, 'board.read'), (env, actor, url) => performancePage(env, actor, url)),
  reliability: guarded(actor => can(actor, 'board.read'), (env, actor, url) => reliabilityPage(env, actor, url)),
  availability: guarded(actor => can(actor, 'board.read'), (env, actor, url) => availabilityPage(env, actor, url)),
  badActors: guarded(actor => can(actor, 'board.read'), (env, actor, url) => badActorsPage(env, actor, url)),
  badActorsCsv: async (env, actor, url) => new Response(await badActorsCsv(env, actor, url), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="downtime-pareto.csv"', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }),
  templates: (env, actor, url) => templatesPage(env, actor, url),
  more: (env, actor, url) => morePage(env, actor, url),
}

function redirect(target: string, key?: 'notice' | 'error', value?: string) {
  const location = new URL(target, 'http://gasket.invalid')
  if (key && value) location.searchParams.set(key, value)
  return new Response(null, { status: 303, headers: { location: location.pathname + location.search, 'cache-control': 'no-store' } })
}
