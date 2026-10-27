// BUY-001: real supplier, catalog and maintenance requisition doors.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness, exerciseKeyedActions, assertDocumented } from './harness.mjs'

export async function purchasingJourney(h, cookie, ids) {
  exerciseKeyedActions(h,cookie.owner,['supplier.save','supplier.catalog','costcenter.save','requisition.request'])
  const owner = (await h.api('me', cookie.owner)).id
  const supplier = { name: 'Great Lakes Bearings & Service', contact: 'Dina Morris', email: 'orders@greatlakes.example.test', phone: '+1 216 555 0164', street: '4100 Lakeside Avenue', city: 'Cleveland', state: 'OH', zip: '44114-1234', taxTreatment: 'sales_tax', taxNote: 'Ohio destination sales tax', paymentTerms: 'Net 30', leadDays: 6, active: true }
  for (const role of ['lead', 'max', 'sam', 'agent']) await h.api('supplier.save', cookie[role], supplier, 403)
  const made = await h.submit('supplier.save', cookie.owner, { ...supplier, active: 'yes' }, '/app/suppliers/{id}')
  assert.equal(made.searchParams.get('notice'), 'Saved.')
  const vendor = made.pathname.split('/').pop()
  let detail = await h.api(`suppliers/${vendor}`, cookie.max)
  assertDocumented('SupplierDetail',detail)
  assert.equal(detail.contact, supplier.contact); assert.equal(detail.email, supplier.email); assert.equal(detail.phone, supplier.phone)
  assert.deepEqual(detail.shipTo, { street: supplier.street, city: supplier.city, state: supplier.state, zip: supplier.zip, country: 'US' })
  assert.equal(detail.tax_treatment, 'sales_tax'); assert.equal(detail.payment_terms, 'Net 30'); assert.equal(detail.lead_days, 6)
  await h.api('supplier.catalog', cookie.owner, { supplier: vendor, revision: detail.revision, sku: 'BRG-6205', description: '6205 sealed bearing', kind: 'part', unit: 'each', price: '18.75' })
  detail = await h.api(`suppliers/${vendor}`, cookie.lead)
  assertDocumented('SupplierDetail',detail)
  assert.deepEqual(detail.items.map(row => [row.sku, row.kind, row.price_cents]), [['BRG-6205', 'part', 1875]])
  await h.api('supplier.catalog', cookie.owner, { supplier: vendor, revision: detail.revision, sku: 'LABOR', description: 'Contractor bearing replacement', kind: 'service', unit: 'hour', price: '95' })
  detail = await h.api(`suppliers/${vendor}`, cookie.owner)
  await h.api('supplier.catalog', cookie.owner, { supplier: vendor, revision: detail.revision, sku: 'BRG-6205', description: '6205 sealed bearing', kind: 'part', unit: 'each', price: '19' })
  assert.equal((await h.api(`suppliers/${vendor}`, cookie.owner)).items.find(row => row.sku === 'BRG-6205').price_cents, 1900)
  const center = (await h.api('costcenter.save', cookie.owner, { code: 'MAINT-OH', name: 'Ohio plant maintenance', active: true })).id
  const requisition = { supplier: vendor, asset: ids.asset, workOrder: ids.work, costCenter: center, purchaser: owner, reason: 'Replace the noisy bearing during the planned stop', kind: ['part', 'service', 'repair'], description: ['6205 sealed bearings', 'Contractor installation labor', 'Rebuild spare motor'], quantity: ['2', '1.5', '1'], unit: ['each', 'hour', 'job'] }
  await h.api('requisition.request', cookie.agent, requisition, 403)
  await h.api('requisition.request', cookie.sam, requisition, 403)
  await h.api('requisition.request', cookie.max, { ...requisition, purchaser: ids.max }, 409)
  await h.api('requisition.request', cookie.max, { ...requisition, quantity: ['0.0001', '1', '1'] }, 400)
  await h.api('requisition.request', cookie.max, { ...requisition, asset: 'missing' }, 400)
  const created = await h.submit('requisition.request', cookie.max, requisition, '/app/requisitions/{id}')
  assert.equal(created.searchParams.get('notice'), 'Saved.')
  const request = created.pathname.split('/').pop(), read = await h.api(`requisitions/${request}`, cookie.owner)
  assertDocumented('Requisition',read)
  assert.equal(read.asset_id, ids.asset); assert.equal(read.work_order_id, ids.work); assert.equal(read.cost_center_id, center)
  assert.equal(read.purchaser_id, owner); assert.equal(read.requested_by, ids.max); assert.equal(read.status, 'pending')
  assert.deepEqual(read.lines.map(row => [row.kind, row.description, row.quantity, row.unit]), [['part', '6205 sealed bearings', '2', 'each'], ['service', 'Contractor installation labor', '1.5', 'hour'], ['repair', 'Rebuild spare motor', '1', 'job']])
  assert.equal((await h.api('purchasing', cookie.owner)).requests.find(row => row.id === request).purchaser, (await h.api('me', cookie.owner)).name)
  // Planners use the JSON door too; neither request is spend authorization.
  await h.api('requisition.request', cookie.lead, { ...requisition, workOrder: '', description: ['Replacement pump'], kind: ['part'], quantity: ['1'], unit: ['each'] })
  detail = await h.api(`suppliers/${vendor}`, cookie.owner)
  await h.api('supplier.save', cookie.owner, { ...supplier, supplier: vendor, revision: detail.revision - 1 }, 409)
  await h.api('supplier.save', cookie.owner, { ...supplier, supplier: vendor, revision: detail.revision, taxTreatment: 'exempt', taxNote: '' }, 400)
  await h.api('supplier.save', cookie.owner, { ...supplier, supplier: vendor, revision: detail.revision, paymentTerms: 'Net 45', leadDays: 10, taxTreatment: 'use_tax', active: false })
  const updated = await h.api(`suppliers/${vendor}`, cookie.max)
  assert.equal(updated.active, 0); assert.equal(updated.payment_terms, 'Net 45'); assert.equal(updated.lead_days, 10); assert.equal(updated.tax_treatment, 'use_tax')
  assert.equal((await h.api(`requisitions/${request}`, cookie.max)).supplierSnapshot.payment_terms, 'Net 30', 'a supplier edit keeps the facts this request used')
  const before = (await h.api('purchasing', cookie.owner)).requests.length
  await h.api('requisition.request', cookie.max, requisition, 409)
  assert.equal((await h.submit('requisition.request', cookie.lead, requisition, '/app/purchasing')).searchParams.get('error'), 'supplier_inactive')
  assert.equal((await h.api('purchasing', cookie.owner)).requests.length, before)
  const queue = await (await h.raw('/app/purchasing', { cookie: cookie.owner })).text()
  assert.ok(queue.includes('Great Lakes Bearings')); assert.ok(queue.includes('Pending approval')); assert.ok(queue.includes('MAINT-OH'))
  const page = await (await h.raw(`/app/requisitions/${request}`, { cookie: cookie.max })).text()
  for (const text of ['6205 sealed bearings', 'Contractor installation labor', 'Rebuild spare motor', 'No spend has been authorized']) assert.ok(page.includes(text), text)
  const vendorPage = await (await h.raw(`/app/suppliers/${vendor}`, { cookie: cookie.owner })).text()
  assert.ok(vendorPage.includes('Net 45')); assert.ok(vendorPage.includes('BRG-6205'))
  for (const path of ['purchasing', `suppliers/${vendor}`, `requisitions/${request}`]) assert.equal((await h.raw(`/api/gasket/${path}`)).status, 401)
  for (const path of ['/app/purchasing', `/app/suppliers/${vendor}`, `/app/requisitions/${request}`]) assert.equal((await h.raw(path)).status, 303)
  const audit = await h.api('audit?action=requisition.request', cookie.owner)
  assert.ok(audit.rows.some(row => row.subject === request && row.actor === ids.max))
  const auditPage = await (await h.raw('/app/audit?action=requisition.request', { cookie: cookie.owner })).text()
  assert.ok(auditPage.includes(`/app/requisitions/${request}`))
  assert.ok(auditPage.includes('Requested a maintenance purchase'))
  if(process.env.PURCHASING_SCREENSHOTS) {
    await mkdir(process.env.PURCHASING_SCREENSHOTS,{recursive:true})
    const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']})
    try {
      const context=await browser.newContext({ignoreHTTPSErrors:true})
      await context.addCookies(cookie.owner.split('; ').map(pair=>{const at=pair.indexOf('=');return{name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
      const page=await context.newPage()
      for(const [name,path] of [['purchasing','/app/purchasing'],['supplier',`/app/suppliers/${vendor}`],['requisition',`/app/requisitions/${request}`]])for(const width of [1440,390]) {
        await page.setViewportSize({width,height:1000})
        const response=await page.goto(h.origin+path)
        await page.getByText(supplier.name,{exact:true}).first().waitFor()
        if(width===1440) {
          assert.equal(response.status(),200)
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
          for(const button of await page.locator('button:visible').all())assert.ok((await button.textContent()).trim()||await button.getAttribute('data-tooltip'))
        }
        await page.screenshot({path:`${process.env.PURCHASING_SCREENSHOTS}/${name}-${width}.png`,fullPage:true})
      }
      await context.close()
    } finally {await browser.close()}
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const h = await harness()
  try {
    const cookie = { owner: await h.owner() }, ids = {}
    await h.api('site.configure', cookie.owner, { name: 'Great Lakes Plant', timezone: 'America/New_York' })
    for (const [key, role] of [['lead', 'lead'], ['max', 'maintainer'], ['sam', 'supervisor'], ['agent', 'agent']]) {
      ids[key] = (await h.api('access.give', cookie.owner, { name: key === 'max' ? 'Max Purchasing' : key, email: `${key}@example.test`, role })).id
      cookie[key] = await h.signIn(`${key}@example.test`)
    }
    ids.asset = (await h.api('asset.create', cookie.lead, { tag: 'MTR-104', name: 'Line 2 motor', location: 'Assembly' })).id
    ids.work = (await h.api('workorder.create', cookie.lead, { asset: ids.asset, title: 'Replace noisy bearing', due: (await h.api('me', cookie.owner)).today })).id
    await purchasingJourney(h, cookie, ids)
    console.log('BUY-001 vendor records and maintenance requisitions passed')
  } finally { await h.close() }
}
