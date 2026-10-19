// Every state change in Gasket, by name. The same handler serves the HTML form
// door (/app/do/NAME) and the JSON door (/api/gasket/NAME) agents use. Each
// handler checks the actor's role itself.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { collaborate, createTeam, decline, teamMember } from './crew'
import { editComment, markRead, postComment } from './comments'
import { moveAsset } from './hierarchy'
import { addAgreement, setLifecycle } from './lifecycle'
import { addMeter, createAsset, recordSighting, retireAsset, updateAsset } from './assets'
import { createChecklist, reviseChecklist } from './checklists'
import { bulk, merge, reopen } from './control'
import { addClosure, removeClosure } from './calendar'
import { raiseBlocker, resolveBlocker, respond, setChaseRule } from './chasing'
import { decideException, editSchedule, requestDeferral, requestSkip } from './exceptions'
import { acknowledge, setRule } from './corrections'
import type { Input } from './input'
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
import { countPart, createPart, receivePart } from './parts'
import { decide, prepare } from './proposals'
import { exceptStep, review, submit } from './review'
import { createSchedule, evaluateMeter, generateDue } from './schedules'
import { configureSite, endAccess, giveAccess, setRole, setTechnicianWork } from './site'
import { retireField, saveField, saveStatus, setFieldValue, setWaiting } from './work-fields'
import { addEvidence, assign, cancel, createCorrective, decidePlan, downtimeEnd, downtimeStart, giveBack, issue, doorOf, recordFinding, recordReadings, recordResults } from './work'

type Handler = (env: Bindings, actor: Actor, input: Input, request: Request) => Promise<unknown>

export const actions: Record<string, Handler> = {
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
  'part.receive': (env, actor, input) => receivePart(env, actor, input),
  'part.count': (env, actor, input) => countPart(env, actor, input),
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
  'workorder.evidence': (env, actor, input) => addEvidence(env, actor, input),
  'comment.post': (env, actor, input) => postComment(env, actor, input),
  'comment.edit': (env, actor, input) => editComment(env, actor, input),
  'comment.read': (env, actor, input) => markRead(env, actor, input),
  'workorder.readings': async (env, actor, input) => { const kept = await recordReadings(env, actor, input); const created = []; for (const meter of kept.meters) created.push(...await evaluateMeter(env, actor, meter)); return { id: kept.id, created } },
  'workorder.issue': (env, actor, input) => issue(env, actor, input),
  'workorder.return': (env, actor, input) => giveBack(env, actor, input),
  'downtime.start': (env, actor, input) => downtimeStart(env, actor, input),
  'downtime.end': (env, actor, input) => downtimeEnd(env, actor, input),
  'downtime.classify': (env, actor, input) => classifyStop(env, actor, input),
  'production.hours.add': (env, actor, input) => addProductionHours(env, actor, input),
  'production.hours.remove': (env, actor, input) => removeProductionHours(env, actor, input),
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
  'proposal.prepare': (env, actor, input) => prepare(env, actor, input),
  'proposal.decide': (env, actor, input) => decide(env, actor, input),
  'import.preview': (env, actor, input) => previewImport(env, actor, input),
  'import.apply': (env, actor, input) => applyImport(env, actor, input),
  'import.job': (env, actor, input) => importAction(env, actor, input),
}
