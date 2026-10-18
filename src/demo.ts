import type { Bindings } from './auth.server'
import { addDays, today } from './gasket/dates'
import { CORRECTIVE, demoAssets, demoChecks, demoMeters, demoOwner, demoParts, demoPeople, demoSchedules, demoSite, demoWork } from './gasket/demo-data'
import { demoActivity } from './gasket/demo-activity'

/** Fixed identities make this safe to repeat; every row belongs to this copy. No networking. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
  const at = now.getTime(), zone = demoSite.timezone, day = today(zone, at), ago = at - 28 * 86400000
  // The coming Saturday (a week out when launched on a Saturday) is the planned shutdown.
  const saturday = addDays(day, 6 - new Date(`${day}T12:00:00Z`).getUTCDay() || 7)
  const due = (offset: number | 'sat') => offset === 'sat' ? saturday : addDays(day, offset)
  const id = (value: string) => `demo-${value}`
  const rows: D1PreparedStatement[] = []
  const put = (table: string, columns: string, ...values: (string | number | null)[]) => rows.push(env.DB.prepare(
    `INSERT INTO ${table} (${columns}) VALUES (${values.map(() => '?').join(',')}) ON CONFLICT DO NOTHING`,
  ).bind(...values))
  let seq = 0
  const audit = (when: number, actor: string, action: string, subject: string, detail: unknown = {}) => put('gk_audit', 'seq,at,actor,action,subject,detail', ++seq, when, id(actor), action, subject, JSON.stringify(detail))

  put('gk_site', 'singleton,name,timezone,created_at,updated_at', 1, demoSite.name, zone, ago, at)
  put('gk_members', 'id,email,name,role,created_at', id('owner'), ownerEmail, demoOwner, 'owner', ago)
  for (const [key, name, role] of demoPeople) put('gk_members', 'id,email,name,role,created_at', id(key), `${key}@demo.invalid`, name, role, ago)
  for (const [key, tag, name, serial, location, category, criticality] of demoAssets) {
    put('gk_assets', 'id,tag,name,serial,location,custodian,category,criticality,notes,created_at,updated_at', id(key), tag, name, serial, location, 'Ray Kowalski', category, criticality, 'Moved in from MaintainX with seven years of history.', ago, ago)
    put('gk_sightings', 'id,asset_id,outcome,seen_location,recorded_by,recorded_at', id(`sighting-${key}`), id(key), 'found', location, id('ray'), at - 3 * 86400000)
  }
  for (const [key, number, name, unit, minimum, opening, location] of demoParts) {
    put('gk_parts', 'id,number,name,unit,minimum_milli,location,created_at', id(`part-${key}`), number, name, unit, minimum * 1000, location, ago)
    put('gk_part_moves', 'id,part_id,kind,quantity_milli,note,actor,at', id(`opening-${key}`), id(`part-${key}`), 'opening', opening * 1000, 'Storeroom count', id('brenda'), ago)
  }
  for (const [key, name, items] of demoChecks) {
    put('gk_checklists', 'id,name,created_by,created_at', id(`check-${key}`), name, id('ray'), ago)
    put('gk_checklist_revisions', 'id,checklist_id,number,items_json,note,published_by,published_at', id(`revision-${key}`), id(`check-${key}`), 1, JSON.stringify(items.map(text => ({ text }))), 'Dayton maintenance procedure', id('ray'), ago)
  }
  for (const [key, asset, check, days, next, assignee] of demoSchedules) {
    put('gk_schedules', 'id,asset_id,checklist_id,title,every_days,next_due_date,assignee_id,created_by,created_at', id(`schedule-${key}`), id(asset), id(`check-${check}`), demoChecks.find(row => row[0] === check)![1], days, due(next), id(assignee), id('ray'), ago)
  }
  const scheduled = new Set<string>(demoSchedules.map(row => row[0]))
  for (const [key, number, asset, title, dueOn, assignee, status, check, minutesAgo] of [...demoWork].sort((a, b) => a[1] - b[1])) {
    const work = id(`work-${key}`), done = minutesAgo === null ? null : at - minutesAgo * 60000, closed = status === 'closed'
    const created = done ? done - 3 * 86400000 : at - 4 * 86400000
    put('gk_work_orders', 'id,number,asset_id,kind,schedule_id,title,description,checklist_revision_id,due_date,assignee_id,status,created_by,created_at,submitted_at,closed_at,closed_by', work, number, id(asset), check ? 'preventive' : 'corrective', check && scheduled.has(key) ? id(`schedule-${key}`) : null, title, CORRECTIVE[key] ?? null, check ? id(`revision-${check}`) : null, due(dueOn), id(assignee), status, id('ray'), created, done, closed ? done : null, closed ? id('dana') : null)
    audit(created, 'ray', 'workorder.create', work, { title })
    if (done && check) for (const [item] of demoChecks.find(row => row[0] === check)![2].entries()) {
      put('gk_results', 'work_order_id,item,outcome,note,recorded_by,recorded_at', work, item, 'pass', 'Checked; within limits.', id(assignee), done - 20 * 60000)
    }
    if (done) audit(done, assignee, 'workorder.submit', work)
    if (closed && done) {
      put('gk_reviews', 'id,work_order_id,version,decision,reason,reviewer,at', id(`review-${key}`), work, 1, 'approved', 'Checked on the next shift.', id('dana'), done + 3600000)
      audit(done + 3600000, 'dana', 'workorder.approve', work)
    }
  }
  for (const [key, asset, name, unit, kind, before, latest] of demoMeters) {
    put('gk_meters', 'id,asset_id,name,unit,kind,created_at', id(`meter-${key}`), id(asset), name, unit, kind, ago)
    for (const [offset, value] of [[7, before], [1, latest]] as const) put('gk_readings', 'id,meter_id,asset_id,value,taken_on,entered_by,entered_at', id(`reading-${key}-${offset}`), id(`meter-${key}`), id(asset), value, `${addDays(day, -offset)}T07:41`, id(key === 'oven-temp' ? 'brenda' : 'keisha'), at - offset * 86400000)
  }
  // Press 3's die clamp fitting: the QR fault yesterday, 47 minutes down.
  put('gk_downtime', 'id,asset_id,work_order_id,started_on,ended_on,minutes,reason,recorded_by,recorded_at', id('downtime-press3'), id('press3'), id('work-clamp'), `${addDays(day, -1)}T06:12`, `${addDays(day, -1)}T06:59`, 47, 'Die clamp fitting leaking; press stopped by the operator.', id('keisha'), at - 86400000)
  // The two bearings for Saturday came from Mesa this morning.
  const received = at - 119 * 60000
  put('gk_part_moves', 'id,part_id,kind,quantity_milli,note,actor,at', id('receive-bearing'), id('part-bearing'), 'receive', 2000, 'Transfer T-0318 from Mesa (Angela Ruiz); reserved to 4471', id('brenda'), received)
  audit(received, 'brenda', 'part.receive', id('part-bearing'), { quantity: '2' })
  audit(at - 185 * 60000, 'ray', 'workorder.assign', id('work-diechange'), { to: id('devon') })
  rows.push(env.DB.prepare('INSERT INTO oa_first_run (singleton,completed_by,completed_at) SELECT 1,id,? FROM oa_operators WHERE email=? AND role=\'owner\' ON CONFLICT DO NOTHING').bind(at, ownerEmail))
  await env.DB.batch(rows)
  await demoActivity(env, day, saturday)
}
