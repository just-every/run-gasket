import { eraseRecord } from './record-erasure'
import { createSite, updateSite, setSiteMembership } from './site-access'
import { eraseQualification } from './qualification-erasure'
import { saveReportSchedule } from './report-schedules'
import { createServiceCredential, revokeServiceCredential } from './service-auth'
import { publishSafety, attestSafety } from './safety'
import { saveQualification, savePlanningTool, retirePlanningResource, savePlanningWindow, removePlanningWindow, saveRequirements, planSlot } from './planning'
import { saveRule, controlRule, previewRule } from './rules'
import { saveCustomField, retireCustomField, setCustomValues, setPartCategory } from './custom-fields'
import { eraseAttachment } from './attachment-erasure'
import { confirmRecoveryDrill } from './recovery'
import { copyStrategy, adaptStrategy, approveStrategy, previewStrategy, rolloutStrategy } from './pm-strategies'
import { responsePolicy, changeRequestClock } from './request-response'
import { holdRecord, setRetentionPolicy } from './retention'
import { saveSearch, deleteSearch } from './search'
import { eraseRequest } from './request-erasure'
import { recordCostComparison, setWorkCostCenter } from './costing'
import { recordLabor, recordContractorInvoice } from './labor'
import { setLaborRate, reviewLabor } from './labor-policy'
import { laborTimer } from './labor-timers'
import { triageRequest, replyToRequest, convertRequest } from './triage'
import { createLabelWork } from './labels'
import { savePortal, saveTarget, addRequestField } from './requests'
import { subscribeWebhook, controlWebhook, rotateWebhook, resumeWebhook, retryWebhook } from './webhooks'
import { assessOutcome } from './outcomes'
import { revokeGrant, saveGrant } from './agent-grants'
import { startRun } from './agent-runs'
import { planOutcome, outcomeFollowUp } from './outcomes-plan'
import { setIntervalLimit } from './intervals'
import { catalogPreview, importCatalog, undoCatalog, receiveCatalogPack, preferCatalogItem } from './catalogs'
import { mergePreview, approveMerge } from './part-merge'
import { addPartPhoto } from './part-photos'
import { askFollowUp, answerFollowUp, escalateFollowUp, recommendClosure } from './agent-follow-up'
import { saveReplenishmentPolicy, saveReplenishmentEnvelope, approveReplenishmentEnvelope, revokeReplenishmentEnvelope } from './replenishment'
// Every state change in Gasket, by name. The same handler serves the HTML form
// door (/app/do/NAME) and the JSON door (/api/gasket/NAME) agents use. Each
// handler checks the actor's role itself.
import { receivePurchaseOrder, inspectReceipt } from './receiving'
import { saveSpendPolicy, saveDelegation } from './purchase-policy'
import { saveEmergencyOverride, releaseCommitment } from './purchase-authority'
import { saveQuote } from './quotes'
import { setFollowRule } from './vendor-follow-up'
import { savePurchaseOrder, approvePurchaseOrder, sendPurchaseOrder, acknowledgePurchaseOrder } from './purchase-orders'
import { saveEquivalence, satisfyNested } from './nested'
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { collaborate, createTeam, decline, teamMember } from './crew'
import { editComment, markRead, postComment } from './comments'
import { moveAsset } from './hierarchy'
import { addAgreement, setLifecycle } from './lifecycle'
import { addContact, addDocument, linkDocument, reviseDocument, setExpiry } from './documents'
import { addMeter, createAsset, recordSighting, retireAsset, updateAsset } from './assets'
import { createChecklist, reviseChecklist } from './checklists'
import { bulk, merge, reopen } from './control'
import { addClosure, removeClosure } from './calendar'
import { raiseBlocker, resolveBlocker, respond, setChaseRule } from './chasing'
import { decideException, editSchedule, requestDeferral, requestSkip } from './exceptions'
import { acknowledge, setRule } from './corrections'
import { Input } from './input'
import { adjustMeter, feedReading, setFeedWindow } from './meters'
import { moveCode, retireCode, setCode } from './codes'
import { declareState } from './states'
import { classifyStop } from './reliability'
import { addProductionHours, removeProductionHours } from './availability'
import { documentLossRate, recordWorkCost } from './bad-actors'
import { retireTemplate, saveTemplate, setPriority } from './templates'
import { workFromTemplate } from './template-work'
import { approveSubstitute, createKit, release, reserve } from './reservations'
import { reviseBom } from './bom'
import { applyImport, importAction, previewImport } from './movein/maintainx'
import { countPart, createPart, disposeWorkQuarantine, receivePart } from './parts'
import { setVendorPrice } from './valuation'
import { decideCountLine, planCount, setCountApproval, submitCount } from './counts'
import { decide, prepare } from './proposals'
import { exceptStep, review, submit } from './review'
import { createRoute, issueRoute, missStop, signRun } from './routes'
import { saveSupplier, saveCatalogItem, saveCostCenter } from './suppliers'
import { controlAutomation, controlSchedule, catchUp } from './automation'
import { requestPurchase } from './requisitions'
import { createCalibration } from './calibration'
import { recordTool } from './tools'
import { annotate } from './annotations'
import { sign } from './signatures'
import { createSchedule, evaluateMeter, generateDue } from './schedules'
import { configureSite, endAccess, giveAccess, setRole, setTechnicianWork } from './site'
import { previewGeneric, applyGeneric, genericAction } from './movein/generic'
import { retireField, saveField, saveStatus, setFieldValue, setWaiting } from './work-fields'
import { addEvidence, assign, cancel, createCorrective, decidePlan, downtimeEnd, downtimeStart, giveBack, issue, doorOf, recordFinding, recordReadings, recordResults, recordTime } from './work'

type Handler = (env: Bindings, actor: Actor, input: Input, request: Request) => Promise<unknown>

export const actions: Record<string, Handler> = {
  'report.schedule': saveReportSchedule,
  'service.create': createServiceCredential, 'service.revoke': revokeServiceCredential,
  'safety.publish': (env,actor,input) => publishSafety(env,actor,input),
  'safety.attest': (env,actor,input) => attestSafety(env,actor,input),
  'planning.qualification':saveQualification, 'planning.tool':savePlanningTool, 'planning.retire':retirePlanningResource, 'planning.window':savePlanningWindow, 'planning.window.remove':removePlanningWindow, 'planning.requirements':saveRequirements, 'planning.slot':planSlot,
  'rules.save': saveRule, 'rules.control': controlRule, 'rules.preview': previewRule,
  'part.category': setPartCategory, 'customfield.save': saveCustomField, 'customfield.retire': retireCustomField, 'customvalue.set': setCustomValues,
  'record.erase': (env, actor, input) => eraseRecord(env, actor, input),
  'qualification.erase': eraseQualification,
  'attachment.erase': (env, actor, input) => eraseAttachment(env, actor, input),
  'recovery.drill': (env, actor, input) => confirmRecoveryDrill(env, actor, input),
  'retention.policy': (env, actor, input) => setRetentionPolicy(env, actor, input),
  'retention.hold': (env, actor, input) => holdRecord(env, actor, input),
  'search.save': (env, actor, input) => saveSearch(env, actor, input),
  'search.delete': (env, actor, input) => deleteSearch(env, actor, input),
  'pm.copy':copyStrategy, 'pm.adapt':adaptStrategy, 'pm.approve':approveStrategy, 'pm.preview':previewStrategy, 'pm.rollout':rolloutStrategy,
  'request.responsePolicy':responsePolicy, 'request.clock':changeRequestClock, 'request.erase':eraseRequest, 'request.triage':triageRequest, 'request.reply':replyToRequest, 'request.convert':convertRequest, 'label.work':createLabelWork, 'request.portal':savePortal, 'request.target':saveTarget, 'request.field':addRequestField,
  'webhook.subscribe': subscribeWebhook, 'webhook.control': controlWebhook, 'webhook.rotate': rotateWebhook, 'webhook.resume': resumeWebhook, 'webhook.retry': retryWebhook,
  'catalog.preview':catalogPreview, 'catalog.undo':undoCatalog,
  'catalog.apply':(env,actor,input)=>importCatalog(env,actor,Input.of({supplier:input.text('supplier'),fingerprint:input.text('fingerprint'),file:{filename:input.text('filename'),base64:input.text('base64',{max:2_000_000}),type:input.text('mediaType',{optional:true})}})),
  'catalog.prefer':preferCatalogItem, 'catalog.import':importCatalog, 'catalog.receive':receiveCatalogPack, 'part.merge.preview':mergePreview, 'part.merge.approve':(env,actor,input)=>approveMerge(env,actor,input), 'part.photo':addPartPhoto,
  'agentrun.grant': saveGrant, 'agentrun.revoke': revokeGrant, 'agentrun.start': startRun,
  'agent.query': askFollowUp, 'agent.answer': answerFollowUp, 'agent.escalate': escalateFollowUp, 'agent.closure': recommendClosure,
  'replenishment.policy': saveReplenishmentPolicy, 'replenishment.envelope': saveReplenishmentEnvelope,
  'replenishment.envelope.approve': approveReplenishmentEnvelope, 'replenishment.envelope.revoke': revokeReplenishmentEnvelope,
  'vendor.rule': setFollowRule,
  'receipt.receive': receivePurchaseOrder, 'receipt.inspect': inspectReceipt,
  'spend.policy': saveSpendPolicy, 'spend.delegate': saveDelegation, 'purchase.emergency': saveEmergencyOverride, 'purchase.release': releaseCommitment,
  'quote.save': (env, actor, input) => saveQuote(env, actor, input),
  'purchase.save': (env, actor, input) => savePurchaseOrder(env, actor, input),
  'purchase.approve': (env, actor, input) => approvePurchaseOrder(env, actor, input),
  'purchase.send': (env, actor, input) => sendPurchaseOrder(env, actor, input),
  'purchase.acknowledge': (env, actor, input) => acknowledgePurchaseOrder(env, actor, input),
  'nested.map': (env, actor, input) => saveEquivalence(env, actor, input),
  'nested.satisfy': (env, actor, input) => satisfyNested(env, actor, input),
  'automation.control': (env, actor, input) => controlAutomation(env, actor, input),
  'automation.schedule': (env, actor, input) => controlSchedule(env, actor, input),
  'automation.catchup': (env, actor, input) => catchUp(env, actor, input),
  'supplier.save': (env, actor, input) => saveSupplier(env, actor, input),
  'supplier.catalog': (env, actor, input) => saveCatalogItem(env, actor, input),
  'costcenter.save': (env, actor, input) => saveCostCenter(env, actor, input),
  'requisition.request': (env, actor, input) => requestPurchase(env, actor, input),
  'site.create': createSite,
  'site.update': updateSite,
  'site.membership': setSiteMembership,
  'site.configure': (env, actor, input) => configureSite(env, actor, input),
  'site.technicianWork': (env, actor, input) => setTechnicianWork(env, actor, input),
  'access.give': (env, actor, input, request) => giveAccess(env, actor, input, request),
  'access.role': (env, actor, input) => setRole(env, actor, input),
  'access.end': (env, actor, input, request) => endAccess(env, actor, input, request),
  'asset.create': (env, actor, input) => createAsset(env, actor, input),
  'asset.update': (env, actor, input) => updateAsset(env, actor, input),
  'asset.retire': (env, actor, input) => retireAsset(env, actor, input),
  'asset.move': (env, actor, input) => moveAsset(env, actor, input),
  'asset.lifecycle': (env, actor, input) => setLifecycle(env, actor, input),
  'asset.agreement': (env, actor, input) => addAgreement(env, actor, input),
  'asset.contact': (env, actor, input) => addContact(env, actor, input),
  'document.add': (env, actor, input) => addDocument(env, actor, input),
  'document.revise': (env, actor, input) => reviseDocument(env, actor, input),
  'document.expiry': (env, actor, input) => setExpiry(env, actor, input),
  'document.link': (env, actor, input) => linkDocument(env, actor, input),
  'asset.sighting': (env, actor, input) => recordSighting(env, actor, input),
  'asset.state': (env, actor, input) => declareState(env, actor, input),
  'meter.create': (env, actor, input) => addMeter(env, actor, input),
  // PM-002: a kept reading evaluates its meter's schedules at once.
  'meter.feed': async (env, actor, input) => { const kept = await feedReading(env, actor, input); return { ...kept, created: await evaluateMeter(env, actor, kept.meter) } },
  'meter.adjust': (env, actor, input) => adjustMeter(env, actor, input),
  'meter.window': (env, actor, input) => setFeedWindow(env, actor, input),
  'code.set': (env, actor, input) => setCode(env, actor, input),
  'code.move': (env, actor, input) => moveCode(env, actor, input),
  'code.retire': (env, actor, input) => retireCode(env, actor, input),
  'part.create': (env, actor, input) => createPart(env, actor, input),
  'part.quarantine.dispose': disposeWorkQuarantine,
  'part.receive': (env, actor, input) => receivePart(env, actor, input),
  'part.count': (env, actor, input) => countPart(env, actor, input),
  'part.price': (env, actor, input) => setVendorPrice(env, actor, input),
  'count.plan': (env, actor, input) => planCount(env, actor, input),
  'count.submit': (env, actor, input) => submitCount(env, actor, input),
  'count.decide': (env, actor, input) => decideCountLine(env, actor, input),
  'site.countApproval': (env, actor, input) => setCountApproval(env, actor, input),
  'part.substitute': (env, actor, input) => approveSubstitute(env, actor, input),
  'kit.create': (env, actor, input) => createKit(env, actor, input),
  'bom.revise': (env, actor, input) => reviseBom(env, actor, input),
  'workorder.reserve': (env, actor, input) => reserve(env, actor, input),
  'reservation.release': (env, actor, input) => release(env, actor, input),
  'checklist.create': (env, actor, input) => createChecklist(env, actor, input),
  'checklist.revise': (env, actor, input) => reviseChecklist(env, actor, input),
  'rule.set': (env, actor, input) => setRule(env, actor, input),
  'workorder.acknowledge': (env, actor, input) => acknowledge(env, actor, input),
  'workorder.decline': (env, actor, input) => decline(env, actor, input),
  'workorder.collaborate': (env, actor, input) => collaborate(env, actor, input),
  'team.create': (env, actor, input) => createTeam(env, actor, input),
  'team.member': (env, actor, input) => teamMember(env, actor, input),
  'schedule.create': (env, actor, input) => createSchedule(env, actor, input),
  'workorders.generate': (env, actor) => generateDue(env, actor),
  'workorders.bulk': (env, actor, input) => bulk(env, actor, input),
  'schedule.skip': (env, actor, input) => requestSkip(env, actor, input),
  'schedule.defer': (env, actor, input) => requestDeferral(env, actor, input),
  'schedule.exception': (env, actor, input) => decideException(env, actor, input),
  'schedule.edit': (env, actor, input) => editSchedule(env, actor, input),
  'closure.add': (env, actor, input) => addClosure(env, actor, input),
  'chase.rule': (env, actor, input) => setChaseRule(env, actor, input),
  'workorder.respond': (env, actor, input) => respond(env, actor, input),
  'blocker.raise': (env, actor, input) => raiseBlocker(env, actor, input),
  'blocker.resolve': (env, actor, input) => resolveBlocker(env, actor, input),
  'closure.remove': (env, actor, input) => removeClosure(env, actor, input),
  'workorder.create': (env, actor, input, request) => createCorrective(env, actor, input, { door: doorOf(request) }),
  'workorder.assign': (env, actor, input) => assign(env, actor, input),
  'workorder.plan': (env, actor, input) => decidePlan(env, actor, input),
  'workorder.cancel': (env, actor, input) => cancel(env, actor, input),
  'workorder.reopen': (env, actor, input) => reopen(env, actor, input),
  'workorder.merge': (env, actor, input) => merge(env, actor, input),
  'workorder.results': (env, actor, input) => recordResults(env, actor, input),
  'workorder.evidence': (env, actor, input, request) => addEvidence(env, actor, input, doorOf(request)),
  'workorder.annotate': (env, actor, input) => annotate(env, actor, input),
  'workorder.sign': (env, actor, input, request) => sign(env, actor, input, doorOf(request)),
  'comment.post': (env, actor, input) => postComment(env, actor, input),
  'comment.edit': (env, actor, input) => editComment(env, actor, input),
  'comment.read': (env, actor, input) => markRead(env, actor, input),
  'workorder.time': recordTime,
  'workorder.readings': async (env, actor, input) => { const kept = await recordReadings(env, actor, input); const created = []; for (const meter of kept.meters) created.push(...await evaluateMeter(env, actor, meter)); return { id: kept.id, created } },
  'workorder.issue': (env, actor, input) => issue(env, actor, input),
  'workorder.return': (env, actor, input) => giveBack(env, actor, input),
  'downtime.start': (env, actor, input) => downtimeStart(env, actor, input),
  'downtime.end': (env, actor, input) => downtimeEnd(env, actor, input),
  'downtime.classify': (env, actor, input) => classifyStop(env, actor, input),
  'production.hours.add': (env, actor, input) => addProductionHours(env, actor, input),
  'production.hours.remove': (env, actor, input) => removeProductionHours(env, actor, input),
  'labor.timer': (env,actor,input) => laborTimer(env,actor,input),
  'labor.entry': (env,actor,input) => recordLabor(env,actor,input),
  'labor.rate': (env,actor,input) => setLaborRate(env,actor,input),
  'labor.review': (env,actor,input) => reviewLabor(env,actor,input),
  'labor.invoice': (env,actor,input) => recordContractorInvoice(env,actor,input),
  'work.cost_comparison': (env,actor,input) => recordCostComparison(env,actor,input),
  'work.cost_center': (env,actor,input) => setWorkCostCenter(env,actor,input),
  'work.cost': (env, actor, input) => recordWorkCost(env, actor, input),
  'loss.rate': (env, actor, input) => documentLossRate(env, actor, input),
  'template.save': (env, actor, input) => saveTemplate(env, actor, input),
  'template.retire': (env, actor, input) => retireTemplate(env, actor, input),
  'workfield.save': (env, actor, input) => saveField(env, actor, input),
  'workfield.retire': (env, actor, input) => retireField(env, actor, input),
  'workorder.field': (env, actor, input) => setFieldValue(env, actor, input),
  'workstatus.save': (env, actor, input) => saveStatus(env, actor, input),
  'workorder.waiting': (env, actor, input) => setWaiting(env, actor, input),
  'workorder.priority': (env, actor, input) => setPriority(env, actor, input),
  'workorders.fromTemplate': (env, actor, input) => workFromTemplate(env, actor, input),
  'finding.record': (env, actor, input) => recordFinding(env, actor, input),
  'workorder.submit': (env, actor, input) => submit(env, actor, input),
  'workorder.review': (env, actor, input) => review(env, actor, input),
  'step.except': (env, actor, input) => exceptStep(env, actor, input),
  'route.create': (env, actor, input) => createRoute(env, actor, input),
  'route.issue': (env, actor, input) => issueRoute(env, actor, input),
  'route.miss': (env, actor, input) => missStop(env, actor, input),
  'route.sign': (env, actor, input) => signRun(env, actor, input),
  'calibration.create': (env, actor, input) => createCalibration(env, actor, input),
  'workorder.tool': (env, actor, input) => recordTool(env, actor, input),
  'outcome.window': (env, actor, input) => planOutcome(env, actor, input),
  'outcome.assess': (env, actor, input) => assessOutcome(env, actor, input),
  'outcome.reversal': (env, actor, input) => outcomeFollowUp(env, actor, input, true),
  'outcome.investigate': (env, actor, input) => outcomeFollowUp(env, actor, input, false),
  'interval.limit': (env, actor, input) => setIntervalLimit(env, actor, input),
  'proposal.prepare': (env, actor, input) => prepare(env, actor, input),
  'proposal.decide': (env, actor, input) => decide(env, actor, input),
  'import.preview': (env, actor, input) => previewImport(env, actor, input),
  'import.apply': (env, actor, input) => applyImport(env, actor, input),
  'import.job': (env, actor, input) => importAction(env, actor, input),
  'spreadsheet.preview': (env, actor, input) => previewGeneric(env, actor, input),
  'spreadsheet.apply': (env, actor, input) => applyGeneric(env, actor, input),
  'spreadsheet.job': (env, actor, input) => genericAction(env, actor, input),
}
