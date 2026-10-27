// Additional record states share the workspace journey's real save boundaries.
import assert from 'node:assert/strict'

export async function conditionalSaves({h,cookie,page,use,open,submit,proof,day,technician,longName,part}) {
  const asset=(await h.api('asset.create',cookie.lead,{tag:'ACCESS-STATES',name:longName,location:'West maintenance workshop'})).id
  const job=(await h.api('workorder.create',cookie.lead,{asset,title:'Inspect guard with the maintenance crew',assignee:technician})).id
  const work=`work/${job}`, record=`assets/${asset}`
  const form=action=>page.locator(`form[action="/app/do/${action}"]`)
  async function save(action,fields,view,which) {
    const target=which || form(action)
    for (const detail of await target.locator('xpath=ancestor::details').all()) {
      if (!await detail.evaluate(el=>el.open)) await detail.locator(':scope > summary').click()
    }
    for (const [label,value] of Object.entries(fields)) {
      const control=target.getByLabel(label,{exact:true})
      if (await control.evaluate(el=>el.tagName)==='SELECT') await control.selectOption(value)
      else await control.fill(value)
    }
    await submit(target,/Saved/,view)
  }
  await use('owner')
  await open('/app/settings/resources','resource-availability')
  await save('planning.window',{'Person':technician,'Window':'available','Starts':`${day}T06:00`,'Ends':`${day}T18:00`,'Reason':'Explicit workshop shift'},'planning')
  assert.ok((await h.api('planning',cookie.owner)).windows.some(row=>row.member_id===technician&&row.reason==='Explicit workshop shift'))
  const remove=form('planning.window.remove').filter({has:page.locator('input[name=id]')}).last()
  await save('planning.window.remove',{'Removal reason':'Replaced by the confirmed production shift'},'planning',remove)
  assert.equal((await h.api('planning',cookie.owner)).windows.some(row=>row.reason==='Explicit workshop shift'),false)
  await open('/app/settings/resources','qualification-entry')
  await save('planning.qualification',{'Person':technician,'Qualification':'Guard inspection reference','Valid through':'2099-12-31','Evidence reference':'Owner-entered workshop reference'},'planning')
  assert.equal((await h.api('planning',cookie.owner)).qualifications.find(row=>row.name==='Guard inspection reference').reference,'Owner-entered workshop reference')
  await save('planning.requirements',{'Work order':job,'Qualifications, separated by commas':'Guard inspection reference'},'planning')
  assert.deepEqual((await h.api('planning',cookie.owner)).work.find(row=>row.id===job).qualifications,['Guard inspection reference'])
  await save('planning.tool',{'Tool name':'Guard alignment gauge','Serial or asset number':'synthetic-gasket-40','Calibration valid through':'2099-12-31'},'planning',form('planning.tool').filter({has:page.locator('input[name=name]:not([type=hidden])')}))
  assert.equal((await h.api('planning',cookie.owner)).tools.find(row=>row.name==='Guard alignment gauge').identifier,'synthetic-gasket-40')
  await open('/app/settings/resources','populated-resources')
  const retire=form('planning.retire').filter({has:page.locator('input[name=kind][value=tool]')}).last()
  await save('planning.retire',{'Retirement reason':'Gauge withdrawn after inspection'},'planning',retire)
  assert.ok((await h.api('planning',cookie.owner)).retired.some(row=>row.reason==='Gauge withdrawn after inspection'))
  await open('/app/settings/resources','retired-resource-history')

  await use('lead')
  await open('/app/teams','team-creation')
  await save('team.create',{'Team name':'Guard maintenance crew','Trade':'Mechanical'},'teams')
  const team=(await h.api('teams',cookie.lead)).find(row=>row.name==='Guard maintenance crew')
  assert.equal(team.trade,'Mechanical')
  await save('team.member',{'Add a person':technician},'teams',page.locator(`#team-${team.id}`).locator('form[action="/app/do/team.member"]').first())
  assert.deepEqual((await h.api('teams',cookie.lead)).find(row=>row.id===team.id).members.map(row=>row.id),[technician])
  await open(`/app/work/${job}`,'crew-assignment')
  await save('workorder.assign',{'Assign to':technician,'Team':team.id,'Shift':'Day','Handoff note':'Guard work belongs to the workshop crew'},work)
  assert.equal((await h.api(work,cookie.lead)).crew.team.id,team.id)
  const collaborator=(await h.api('me',cookie.lead)).id
  await save('workorder.collaborate',{'Add a collaborator':collaborator},work,form('workorder.collaborate').first())
  assert.deepEqual((await h.api(work,cookie.lead)).crew.collaborators.map(row=>row.id),[collaborator])
  await open(`/app/work/${job}`,'collaborator-removal')
  await save('workorder.collaborate',{'Remove a collaborator':collaborator},work,form('workorder.collaborate').last())
  assert.deepEqual((await h.api(work,cookie.lead)).crew.collaborators,[])
  await save('workorder.priority',{'Priority':'high','Reason':'Production guard needs prompt inspection'},work)
  assert.equal((await h.api(work,cookie.lead)).priority,'high')
  await save('workorder.reserve',{'Part':part,'Quantity':'1'},work,form('workorder.reserve').filter({has:page.locator('select[name=part]')}))
  assert.equal((await h.api(work,cookie.lead)).reservations.find(row=>row.part.id===part).state,'open')
  await open(`/app/work/${job}`,'reservation-release')
  await save('reservation.release',{'Reservation':(await h.api(work,cookie.lead)).reservations.find(row=>row.state==='open').id,'Reason':'Inspection uses the already issued fastener kit'},work)
  assert.equal((await h.api(work,cookie.lead)).reservations.find(row=>row.part.id===part).state,'released')
  await use('max')
  await open(`/app/work/${job}`,'crew-acknowledgment')
  await save('workorder.acknowledge',{},work)
  assert.ok((await h.api(work,cookie.max)).acknowledged_at)
  await save('comment.post',{'Comment':'Guard alignment inspected before the shift handoff'},work)
  assert.equal((await h.api(work,cookie.max)).comments.comments[0].body,'Guard alignment inspected before the shift handoff')
  await open(`/app/work/${job}`,'comment-correction')
  await save('comment.edit',{'Edit your comment':'Guard alignment inspected; isolate before further adjustment'},work,form('comment.edit').last())
  assert.equal((await h.api(work,cookie.max)).comments.comments[0].revisions.length,2)
  await open(`/app/work/${job}`,'corrected-comment-history')

  await use('lead')
  await open(`/app/assets/${asset}`,'asset-state-declaration')
  await save('asset.state',{'State':'degraded','Effective from':`${day}T07:00`,'Reason':'Guard resonance requires inspection'},record)
  assert.equal((await h.api(record,cookie.lead)).status,'degraded')
  await save('asset.sighting',{'What you found':'elsewhere','Where it was (if elsewhere)':'North maintenance bay','Note':'Moved for guard inspection'},record)
  assert.equal((await h.api(record,cookie.lead)).sightings[0].seen_location,'North maintenance bay')
  await save('meter.create',{'Meter name':'Guard inspection hours','Unit':'h'},record)
  const meter=(await h.api(record,cookie.lead)).meters[0].id
  await save('meter.window',{'Meter':meter,'Feed readings stale after (hours)':'36'},record)
  assert.equal((await h.api(record,cookie.lead)).meters[0].feed_window_hours,36)
  await open(`/app/assets/${asset}`,'populated-asset-history')

  await open(`/app/parts/${part}`,'vendor-price')
  await save('part.price',{'Price per unit (USD)':'4.25'},`parts/${part}`)
  assert.equal((await h.api(`parts/${part}`,cookie.lead)).price_cents,425)
  const alternate=(await h.api('part.create',cookie.lead,{number:'ACCESS-ALTERNATE',name:'Alternate guard fastener with extended manufacturer description',unit:'each'})).id
  await open(`/app/parts/${part}`,'substitute-approval')
  await save('part.substitute',{'Substitute part':alternate,'Reason':'Approved by maintenance for this guard'},`parts/${part}`)
  assert.equal((await h.api(`parts/${part}`,cookie.lead)).substitutes.length,1)
  await open('/app/parts','repair-kit-creation')
  const kit=form('kit.create')
  await kit.getByLabel('Part',{exact:true}).first().selectOption(part)
  await kit.getByLabel('Quantity',{exact:true}).first().fill('1')
  await save('kit.create',{'Kit name':'Guard inspection fastener kit'},'kits',kit)
  assert.deepEqual((await h.api('kits',cookie.lead)).kits.find(row=>row.name==='Guard inspection fastener kit').lines.map(row=>[row.id,row.quantity]),[[part,'1']])
  await open('/app/parts','populated-repair-kits')
  await proof('conditional-saves-complete')
}
