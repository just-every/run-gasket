// PM-009: an explicit, revision-pinned equivalence can replace an untouched
// lower occurrence only with independently approved, fully evidenced work.
import type { Bindings } from '../auth.server'
import { requireCapability, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { releaseWithWork } from './reservations'
import { advanceStatements } from './schedules'
import { applies, kindOf, type Answer, type ChecklistItem } from './steps'

async function currentProcedure(env: Bindings, schedule: string) {
  const row = await one(env, `SELECT s.*, r.id AS procedure, r.items_json FROM gk_schedules s JOIN gk_checklist_revisions r ON r.checklist_id=s.checklist_id
    WHERE s.id=? ORDER BY r.number DESC LIMIT 1`, schedule)
  insist(row, 'schedule_not_found', 404)
  return { ...row, steps: JSON.parse(row.items_json) as ChecklistItem[] }
}
const shape = (s: ChecklistItem) => JSON.stringify([kindOf(s), s.unit ?? null, s.min ?? null, s.max ?? null, s.options ?? null, s.failOn ?? null])

export async function saveEquivalence(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'register.manage')
  const higher = await currentProcedure(env, input.text('higher')), lower = await currentProcedure(env, input.text('lower'))
  insist(higher.id !== lower.id, 'nested_cycle', 409)
  insist(!await one(env, `WITH RECURSIVE descendants(id) AS (SELECT lower FROM gk_nested_maps WHERE higher=? UNION SELECT m.lower FROM gk_nested_maps m JOIN descendants d ON m.higher=d.id) SELECT 1 FROM descendants WHERE id=?`, lower.id, higher.id), 'nested_cycle', 409)
  const taskText = input.list('tasks').flatMap(line => line.split(/\r?\n/)).filter(Boolean)
  const tasks = taskText.map(text => { const pair = text.match(/^(\d+)\s*=\s*(\d+)$/); insist(pair, 'invalid_tasks'); return { lower: Number(pair[1]) - 1, higher: Number(pair[2]) - 1 } })
  insist(tasks.length === lower.steps.length && new Set(tasks.map(t => t.lower)).size === lower.steps.length, 'map_every_lower_task')
  for (const task of tasks) insist(lower.steps[task.lower] && higher.steps[task.higher] && shape(lower.steps[task.lower]) === shape(higher.steps[task.higher]), 'incompatible_tasks')
  const previous = await one(env, 'SELECT MAX(revision) AS revision FROM gk_nested_maps WHERE higher=? AND lower=?', higher.id, lower.id)
  const revision = (previous?.revision ?? 0) + 1, id = newId(), reason = input.text('reason', { max: 1000 })
  await commit(env, [
    guard(env, 'stale', `NOT EXISTS(WITH RECURSIVE descendants(id) AS (SELECT lower FROM gk_nested_maps WHERE higher=? UNION SELECT m.lower FROM gk_nested_maps m JOIN descendants d ON m.higher=d.id) SELECT 1 FROM descendants WHERE id=?)`, lower.id, higher.id),
    guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM gk_nested_maps WHERE higher=? AND lower=? AND revision>=?)', higher.id, lower.id, revision),
    guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM gk_checklist_revisions WHERE checklist_id=? AND number>(SELECT number FROM gk_checklist_revisions WHERE id=?)) AND NOT EXISTS(SELECT 1 FROM gk_checklist_revisions WHERE checklist_id=? AND number>(SELECT number FROM gk_checklist_revisions WHERE id=?))', higher.checklist_id, higher.procedure, lower.checklist_id, lower.procedure),
    stmt(env, 'INSERT INTO gk_nested_maps (id,higher,lower,revision,higher_revision,lower_revision,tasks,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, higher.id, lower.id, revision, higher.procedure, lower.procedure, JSON.stringify(tasks), reason, actor.id, now()),
  ], { actor: actor.id, action: 'nested.map', subject: id, detail: { higher: higher.id, lower: lower.id, revision, tasks, reason } })
  return { id, revision }
}

export async function nestedPrograms(env: Bindings) {
  const mappings = await all(env, `SELECT m.*, h.title AS higher_title, l.title AS lower_title FROM gk_nested_maps m JOIN gk_schedules h ON h.id=m.higher JOIN gk_schedules l ON l.id=m.lower ORDER BY m.created_at,m.rowid`)
  const satisfied = await all(env, `SELECT n.*, h.number AS higher_number,l.number AS lower_number FROM gk_nested_satisfaction n JOIN gk_work_orders h ON h.id=n.higher_work JOIN gk_work_orders l ON l.id=n.lower_work ORDER BY n.created_at,n.rowid`)
  return { mappings: mappings.map(row => ({ ...row, tasks: JSON.parse(row.tasks) })), satisfied: satisfied.map(row => ({ ...row, evidence: JSON.parse(row.evidence) })) }
}

export async function satisfyNested(env: Bindings, actor: Actor, input: Input) {
  requireCapability(actor, 'work.assign')
  const higher = await one(env, 'SELECT * FROM gk_work_orders WHERE id=?', input.text('higherWork'))
  const lower = await one(env, 'SELECT * FROM gk_work_orders WHERE id=?', input.text('lowerWork'))
  insist(higher && lower && higher.schedule_id && lower.schedule_id, 'scheduled_work_required', 409)
  const mapping = await one(env, 'SELECT * FROM gk_nested_maps WHERE higher=? AND lower=? ORDER BY revision DESC LIMIT 1', higher.schedule_id, lower.schedule_id)
  insist(mapping, 'equivalence_missing', 409)
  insist(higher.checklist_revision_id === mapping.higher_revision && lower.checklist_revision_id === mapping.lower_revision, 'procedure_revision_changed', 409)
  const review = await one(env, "SELECT * FROM gk_reviews WHERE work_order_id=? AND decision='approved' ORDER BY at DESC LIMIT 1", higher.id)
  insist(higher.status === 'closed' && review && review.version === higher.version - 1, 'approved_equivalent_required', 409)
  insist(lower.status === 'open' && lower.due_date === higher.due_date, 'same_open_occurrence_required', 409)
  const results = await all(env, 'SELECT * FROM gk_results WHERE work_order_id=?', higher.id)
  const photos = await all(env, "SELECT id,item,sha256 FROM gk_evidence WHERE work_order_id=? AND media_type LIKE 'image/%'", higher.id)
  const exceptions = await all(env, 'SELECT item FROM gk_step_exceptions WHERE work_order_id=?', higher.id)
  const steps = JSON.parse((await one(env, 'SELECT items_json FROM gk_checklist_revisions WHERE id=?', higher.checklist_revision_id))!.items_json) as ChecklistItem[]
  const tasks = JSON.parse(mapping.tasks) as { lower: number; higher: number }[]
  const evidence = tasks.map(task => ({ ...task, result: results.find(row => row.item === task.higher) ?? null, photos: photos.filter(row => row.item === task.higher), exception: exceptions.some(row => row.item === task.higher) }))
  const answers = new Map<number, Answer>(results.map(row => [row.item, { outcome: row.outcome, value: row.value }]))
  const missing = evidence.filter(item => !applies(steps, item.higher, answers) || item.exception || (kindOf(steps[item.higher]) === 'photo' ? !item.photos.length : item.result?.outcome !== 'pass')).map(item => item.lower + 1)
  const records = ['gk_results', 'gk_evidence', 'gk_findings', 'gk_downtime', 'gk_part_moves', 'gk_step_exceptions', 'gk_readings', 'gk_work_tools', 'gk_signatures', 'gk_work_costs']
  const untouchedSql = records.map(table => `NOT EXISTS(SELECT 1 FROM ${table} WHERE work_order_id=?)`).join(' AND ')
  const untouched = (await one(env, `SELECT ${untouchedSql} AS untouched`, ...records.map(() => lower.id)))!.untouched
  insist(untouched, 'lower_work_started', 409)
  const preview = input.flag('preview')
  if (!preview) insist(!missing.length, 'mapped_tasks_missing', 409, { missing })
  if (preview) return { preview, eligible: !missing.length, missing, mapping: mapping.id, higher: higher.id, lower: lower.id, evidence }
  const schedule = await one(env, 'SELECT * FROM gk_schedules WHERE id=?', lower.schedule_id)
  insist(schedule && (!schedule.next_due_date || schedule.next_due_date === lower.due_date), 'occurrence_changed', 409)
  const id = newId()
  await commit(env, [
    guard(env, 'stale', untouchedSql, ...records.map(() => lower.id)),
    guard(env, 'stale', "EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=? AND status='open') AND EXISTS(SELECT 1 FROM gk_work_orders WHERE id=? AND version=? AND status='closed')", lower.id, lower.version, higher.id, higher.version),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM gk_schedules WHERE id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM gk_nested_maps WHERE higher=? AND lower=? AND revision>?)', schedule.id, schedule.revision, mapping.higher, mapping.lower, mapping.revision),
    stmt(env, 'INSERT INTO gk_nested_satisfaction VALUES (?,?,?,?,?,?,?,?,?,?)', id, mapping.id, higher.id, lower.id, higher.version, lower.version, lower.occurrence ?? `${lower.schedule_id}@${lower.due_date}`, JSON.stringify({ review: review.id, higherProcedure: mapping.higher_revision, lowerProcedure: mapping.lower_revision, tasks: evidence }), actor.id, now()),
    stmt(env, "UPDATE gk_work_orders SET status='cancelled',closed_at=?,closed_by=?,version=version+1 WHERE id=?", now(), actor.id, lower.id),
    releaseWithWork(env, actor, lower.id, 'Satisfied by approved equivalent work'),
    ...await advanceStatements(env, lower.schedule_id, actor.today),
  ], { actor: actor.id, action: 'nested.satisfy', subject: lower.id, detail: { id, mapping: mapping.id, higher: higher.id, review: review.id, occurrence: lower.occurrence, evidence } })
  return { id, eligible: true, higher: higher.id, lower: lower.id }
}
