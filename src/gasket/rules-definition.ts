// Documented finite vocabulary. No expression evaluator or arbitrary action door.
import { insist, type Row } from './core'
import type { Input } from './input'
export const RULE_TRIGGERS = {
 'request.submitted': 'Request submitted', 'work.created': 'Work created', 'work.status_changed': 'Work status changed',
 'asset.status_changed': 'Asset status changed', 'meter.recorded': 'Meter reading recorded',
 'part.below_minimum': 'Part below minimum', 'checklist.failed': 'Checklist result failed', 'work.overdue': 'Work overdue',
} as const
export type RuleTrigger = keyof typeof RULE_TRIGGERS
export interface RuleEvent { trigger: RuleTrigger; entityType: 'request'|'work'|'asset'|'reading'|'part'|'result'; entityId: string; sourceId?: string; at?: number; source?: 'event'|'cron'|'catch-up' }
export type Condition = { field: string; op: 'eq'|'ne'|'contains'|'gte'|'lte'|'between'; value: string; until?: string }
export type RuleAction = { type: string; value?: string; team?: string; person?: string; people?: string[]; text?: string; title?: string; days?: number }
export interface Definition { name: string; trigger: RuleTrigger; priority: number; conditions: Condition[]; actions: RuleAction[] }
export const RULE_ACTIONS = { assign: 'Route or assign', priority: 'Set priority', status: 'Set status', due: 'Set due date', procedure: 'Attach procedure', notify: 'Notify in app', follow_up: 'Create follow-up work', request_approval: 'Request work approval' }
export const CONDITION_FIELDS = ['asset','location','category','priority','team','status','time']
const text = (v: unknown, max=200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
const clock = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
export function definitionOf(input: Input): Definition {
 const conditions: unknown = input.has('conditions') ? input.json('conditions') : [0,1,2,3].flatMap(i => {
  const field=input.text(`conditionField${i}`,{optional:true}),value=input.text(`conditionValue${i}`,{optional:true})
  return field ? [{field,op:input.text(`conditionOp${i}`),value,until:input.text(`conditionUntil${i}`,{optional:true})}] : []
 })
 const actions: unknown = input.has('actions') ? input.json('actions') : [0,1,2,3].flatMap(i => {
  const type=input.text(`actionType${i}`,{optional:true}); if(!type)return []
  const value=input.text(`actionValue${i}`,{optional:true,max:500})
  return [{type,value,team:input.text(`actionTeam${i}`,{optional:true}),person:input.text(`actionPerson${i}`,{optional:true}),
   people:input.list(`actionPeople${i}`),text:value,title:value,days:['due','follow_up'].includes(type)?Number(value):undefined}]
 })
 const d={name:input.text('name',{max:100}),trigger:input.text('trigger') as RuleTrigger,priority:input.integer('priority',{min:0,max:10000})!,conditions,actions}
 insist(Object.hasOwn(RULE_TRIGGERS,d.trigger),'invalid_rule_trigger')
 insist(Array.isArray(conditions) && conditions.length<=12,'invalid_rule_conditions')
 for(const c of conditions) {
  insist(c && typeof c==='object' && text(c.field) && (CONDITION_FIELDS.includes(c.field) || /^custom:[\w-]+$/.test(c.field)),'invalid_rule_condition')
  insist(['eq','ne','contains','gte','lte','between'].includes(c.op) && typeof c.value==='string' && c.value.length<=500,'invalid_rule_condition')
  if(c.field==='time')insist(c.op==='between' && clock(c.value) && clock(c.until),'invalid_rule_time')
  else insist(c.op!=='between','invalid_rule_operator')
  if(['gte','lte'].includes(c.op))insist(c.value.trim()!=='' && Number.isFinite(Number(c.value)),'invalid_rule_number')
 }
 insist(Array.isArray(actions) && actions.length>=1 && actions.length<=8,'invalid_rule_actions')
 const fields=new Set<string>()
 for(const a of actions) {
  insist(a && Object.hasOwn(RULE_ACTIONS,a.type),'rule_action_prohibited')
  if(['assign','priority','status','due','procedure','request_approval'].includes(a.type)) { insist(!fields.has(a.type),'duplicate_rule_action'); fields.add(a.type) }
  if(a.type==='assign')insist(text(a.team)||text(a.person),'rule_assignment_required')
  if(a.type==='priority')insist(['low','normal','high','emergency'].includes(a.value),'invalid_priority')
  if(a.type==='status')insist(['open','in_progress','new','needs_details'].includes(a.value),'rule_action_prohibited')
  if(['due','follow_up'].includes(a.type))insist(Number.isInteger(a.days) && a.days>=0 && a.days<=365,'invalid_rule_days')
  if(a.type==='procedure')insist(text(a.value),'invalid_rule_procedure')
  if(a.type==='follow_up')insist(text(a.title,160),'invalid_rule_title')
  if(a.type==='notify')insist(text(a.text,500) && ((Array.isArray(a.people) && a.people.length>0 && a.people.length<=30 && a.people.every((p:unknown)=>text(p))) || text(a.team)),'invalid_rule_recipients')
  if(d.trigger==='request.submitted' && a.type==='priority')insist(a.value!=='low','invalid_request_priority')
 }
 return d as Definition
}
export function matches(d: Definition, facts: Row): boolean {
 return d.conditions.every(c => {
  const value=c.field.startsWith('custom:') ? facts.custom[c.field.slice(7)] : facts[c.field]
  if(c.field==='time')return c.value<=c.until! ? value>=c.value && value<c.until! : value>=c.value || value<c.until!
  if(value===null || value===undefined)return false
  if(c.op==='eq')return String(value)===c.value || (Array.isArray(value) && value.includes(c.value))
  if(c.op==='ne')return Array.isArray(value) ? !value.includes(c.value) : String(value)!==c.value
  if(c.op==='contains')return Array.isArray(value) ? value.includes(c.value) : String(value).toLowerCase().includes(c.value.toLowerCase())
  if(!Number.isFinite(Number(value)))return false
  return c.op==='gte' ? Number(value)>=Number(c.value) : Number(value)<=Number(c.value)
 })
}
export const conflictKey = (a:RuleAction) => ['assign','priority','status','due','procedure','request_approval'].includes(a.type) ? a.type==='request_approval'?'status':a.type : null
