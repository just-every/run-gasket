import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all } from '../core'
import { nestedPrograms, satisfyNested } from '../nested'
import { Input } from '../input'
import { area, backLink, card, details, field, form, h, hidden, select, tag } from './html'
import { page } from './shell'

export async function nestedPage(env: Bindings, actor: Actor, url: URL) {
  const { mappings, satisfied } = await nestedPrograms(env)
  const schedules = await all(env, 'SELECT id,title FROM gk_schedules ORDER BY title')
  const work = await all(env, "SELECT id,number,title,status,due_date FROM gk_work_orders WHERE schedule_id IS NOT NULL AND status IN ('closed','open') ORDER BY number DESC")
  const choices = (status: string) => work.filter(row => row.status === status).map(row => ({ value: row.id, label: `WO-${row.number}: ${row.title} · ${row.due_date}` }))
  let preview: Awaited<ReturnType<typeof satisfyNested>> | null = null
  if (can(actor, 'work.assign') && url.searchParams.has('higherWork') && url.searchParams.has('lowerWork')) preview = await satisfyNested(env, actor, Input.of({ higherWork: url.searchParams.get('higherWork'), lowerWork: url.searchParams.get('lowerWork'), preview: true }))
  return page(env, 'Nested preventive programs', actor, h`<div class="gk-cell">${backLink('/app/schedules', 'Schedules')}<h1>Nested preventive programs</h1><p class="gk-lede">Coordinate services across linked equipment. Only an approved equivalent with every mapped task evidenced can replace another occurrence on the same due day.</p>
    ${card('Task equivalences', h`${mappings.length ? mappings.map(row => h`<h3>${row.higher_title} → ${row.lower_title}</h3><p>Mapping revision ${row.revision}: ${row.tasks.map((task: any) => `lower task ${task.lower + 1} = higher task ${task.higher + 1}`).join('; ')}</p><p class="gk-sub">${row.reason}</p>${details([['Higher procedure revision', row.higher_revision], ['Lower procedure revision', row.lower_revision]])}`) : h`<p>No equivalences defined.</p>`}
    ${can(actor, 'register.manage') && schedules.length > 1 ? form('nested.map', '/app/programs', h`${select('Higher service', 'higher', schedules.map(row => ({ value: row.id, label: row.title })))}${select('Lower service', 'lower', schedules.map(row => ({ value: row.id, label: row.title })))}${area('Task mapping', 'tasks', { hint: 'One lower = higher task number per line, for example 1 = 2. Map every lower task. Types, units, limits and choices must match; labels may differ. Both procedure revisions are kept.' })}${field('Reason and equipment coordination', 'reason', { hint: 'Explain why these tasks are equivalent, including any linked assets.' })}`, 'Publish equivalence') : ''}`)}
    ${can(actor, 'work.assign') ? card('Preview an occurrence', h`<form method="get" action="/app/programs" class="gk-form">${select('Approved higher work', 'higherWork', choices('closed'), url.searchParams.get('higherWork') ?? '')}${select('Untouched lower work', 'lowerWork', choices('open'), url.searchParams.get('lowerWork') ?? '')}<button type="submit">Preview equivalent work</button></form>
      ${preview ? h`<p>${tag(preview.eligible ? 'Eligible' : 'Tasks still due')}</p><p>${preview.eligible ? 'All mapped tasks have passing results or photo evidence. The lower work is retained as cancelled with an explicit satisfaction link; it is never recorded as performed.' : `Missing, failed or excepted lower tasks: ${preview.missing?.join(', ')}. The obligation stays open.`}</p>${preview.eligible ? form('nested.satisfy', '/app/programs', h`${hidden('higherWork', preview.higher)}${hidden('lowerWork', preview.lower)}`, 'Apply approved equivalent') : ''}` : ''}`) : ''}
    ${card('Satisfied occurrences', h`${satisfied.length ? satisfied.map(row => h`<p><a href="/app/work/${row.lower_work}">WO-${row.lower_number}</a> satisfied by <a href="/app/work/${row.higher_work}">WO-${row.higher_number}</a> · ${row.occurrence.split('@').at(-1)}</p>${details([['Occurrence', row.occurrence], ['Higher work version', row.higher_version], ['Lower work version', row.lower_version], ['Mapping revision', row.mapping], ['Independent review', row.evidence.review]])}`) : h`<p>No occurrences satisfied by equivalent work.</p>`}`)}</div>`, { url })
}
