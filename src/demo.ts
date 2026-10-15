import type { Bindings } from './auth.server'
import { addDays, localNow } from './gasket/dates'
import { demoAssets, demoChecks, demoParts, demoPeople, demoWork } from './gasket/demo-data'
import { demoActivity } from './gasket/demo-activity'

/** Fixed identities make this safe to repeat; every row belongs to this copy. No networking. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
  const at = now.getTime(), day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now), ago = at - 28 * 86400000
  const id = (value: string) => `demo-${value}`
  const rows: D1PreparedStatement[] = []
  const put = (table: string, columns: string, ...values: (string | number | null)[]) => rows.push(env.DB.prepare(
    `INSERT INTO ${table} (${columns}) VALUES (${values.map(() => '?').join(',')}) ON CONFLICT DO NOTHING`,
  ).bind(...values))
  put('gk_site', 'singleton,name,timezone,created_at,updated_at', 1, 'Harbour Kitchen Co', 'Australia/Brisbane', ago, at)
  put('gk_members', 'id,email,name,role,created_at', id('owner'), ownerEmail, 'Dana Reyes', 'owner', ago)
  for (const [key, name, role] of demoPeople) put('gk_members', 'id,email,name,role,created_at', id(key), `${key}@demo.invalid`, name, role, ago)
  for (const [key, tag, name, serial, location, category, criticality] of demoAssets) {
    put('gk_assets', 'id,tag,name,serial,location,custodian,category,criticality,notes,created_at,updated_at', id(key), tag, name, serial, location, 'Dana Reyes', category, criticality, 'Service records kept by Harbour Kitchen maintenance.', ago, ago)
    put('gk_sightings', 'id,asset_id,outcome,seen_location,recorded_by,recorded_at', id(`sighting-${key}`), id(key), 'found', location, id('lead'), at - 3 * 86400000)
  }
  for (const [key, number, name, unit, minimum, opening, location] of demoParts) {
    put('gk_parts', 'id,number,name,unit,minimum_milli,location,created_at', id(`part-${key}`), number, name, unit, minimum * 1000, location, ago)
    put('gk_part_moves', 'id,part_id,kind,quantity_milli,note,actor,at', id(`opening-${key}`), id(`part-${key}`), 'opening', opening * 1000, 'Monthly stores count', id('lead'), ago)
  }
  for (const [key, name, items] of demoChecks) {
    put('gk_checklists', 'id,name,created_by,created_at', id(`check-${key}`), name, id('lead'), ago)
    put('gk_checklist_revisions', 'id,checklist_id,number,items_json,note,published_by,published_at', id(`revision-${key}`), id(`check-${key}`), 1, JSON.stringify(items.map(text => ({ text }))), 'Kitchen maintenance procedure', id('lead'), ago)
  }
  for (const [key, asset, check, days, due] of [['cold', 'chiller', 'cold', 7, -2], ['oven', 'oven', 'oven', 30, 0], ['wash', 'dishwasher', 'wash', 1, 1], ['fan', 'fan', 'fan', 30, 3]] as const) {
    put('gk_schedules', 'id,asset_id,checklist_id,title,every_days,next_due_date,assignee_id,created_by,created_at', id(`schedule-${key}`), id(asset), id(`check-${check}`), demoChecks.find(row => row[0] === check)![1], days, addDays(day, due), id(key === 'cold' ? 'owner' : 'max'), id('lead'), ago)
  }
  for (const [index, [key, asset, title, due, assignee, status, check]] of demoWork.entries()) {
    const work = id(`work-${key}`), closed = status === 'closed', submitted = status === 'submitted'
    const completedAt = closed ? at + (due + 1) * 86400000 : null
    put('gk_work_orders', 'id,number,asset_id,kind,schedule_id,title,description,checklist_revision_id,due_date,assignee_id,status,created_by,created_at,submitted_at,closed_at,closed_by', work, 412 + index, id(asset), check ? 'preventive' : 'corrective', check && ['cold','oven','fan'].includes(key) ? id(`schedule-${key}`) : null, title, check ? null : 'Inspect the fault, complete the repair and record what was done.', check ? id(`revision-${check}`) : null, addDays(day, due), id(assignee), status, id('lead'), at - (closed ? 14 : 4) * 86400000, closed ? at + due * 86400000 : submitted ? at - 86400000 : null, completedAt, closed ? id('lead') : null)
    if (submitted && check) for (const [item] of demoChecks.find(row => row[0] === check)![2].entries()) {
      put('gk_results', 'work_order_id,item,outcome,note,recorded_by,recorded_at', work, item, 'pass', 'Checked and cleaned; operating normally.', id(assignee), at - 86400000)
    }
    put('gk_audit', 'seq,at,actor,action,subject,detail', index + 1, at - (closed ? 14 : 4) * 86400000, id('lead'), 'workorder.create', work, JSON.stringify({ title }))
    if (closed) put('gk_reviews', 'id,work_order_id,version,decision,reason,reviewer,at', id(`review-${key}`), work, 1, 'approved', 'Repair checked on the next shift.', id('lead'), completedAt)
  }
  for (const [key, asset, name, unit, kind, value] of [['hours','chiller','Compressor run hours','h','counter','8655'], ['temperature','chiller','Cabinet temperature','°C','gauge','-18.5'], ['cooler-temp','cooler','Cabinet temperature','°C','gauge','3.2']] as const) {
    put('gk_meters', 'id,asset_id,name,unit,kind,created_at', id(`meter-${key}`), id(asset), name, unit, kind, ago)
    for (const offset of [7, 1]) put('gk_readings', 'id,meter_id,asset_id,value,taken_on,entered_by,entered_at', id(`reading-${key}-${offset}`), id(`meter-${key}`), id(asset), key === 'hours' && offset === 7 ? '8510' : value, `${addDays(day,-offset)}T08:15`, id('max'), at - offset * 86400000)
  }
  put('gk_downtime', 'id,asset_id,work_order_id,started_on,reason,recorded_by,recorded_at', id('downtime-wash'), id('dishwasher'), id('work-wash'), localNow('Australia/Brisbane', at - 90 * 60000), 'Rinse hose leaking; isolated pending replacement.', id('mo'), at)
  put('gk_downtime', 'id,asset_id,work_order_id,started_on,ended_on,minutes,reason,recorded_by,recorded_at', id('downtime-mixer'), id('mixer'), id('work-mixer'), `${addDays(day,-8)}T09:00`, `${addDays(day,-8)}T10:30`, 90, 'Worn drive belt replaced.', id('max'), at - 8 * 86400000)
  rows.push(env.DB.prepare('INSERT INTO oa_first_run (singleton,completed_by,completed_at) SELECT 1,id,? FROM oa_operators WHERE email=? AND role=\'owner\' ON CONFLICT DO NOTHING').bind(at, ownerEmail))
  await env.DB.batch(rows)
  await demoActivity(env, day)
}
