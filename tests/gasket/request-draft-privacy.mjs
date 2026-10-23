import assert from 'node:assert/strict'
import { png } from './fixtures.mjs'

async function records(page) {
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('gasket-request-drafts',1)
    open.onsuccess=()=>{const db=open.result,tx=db.transaction('drafts'),read=tx.objectStore('drafts').getAll();read.onsuccess=()=>resolve(read.result);tx.oncomplete=()=>db.close();tx.onerror=()=>reject(tx.error)}
    open.onerror=()=>reject(open.error)
  }))
}
export async function draftPrivacy(f,context,page,scanned,capture) {
  const {h,cookie,portal}=f
  const retained=(await records(page)).filter(r=>r && typeof r==='object')
  assert.equal(retained.length,1);assert.ok(retained[0].receipt)
  assert.ok(!retained[0].entries,'confirmed storage retains only receipt metadata')
  assert.equal(await page.locator('[name=photo]').evaluate(n=>n.files.length),0)
  const second=(await h.api('request.target',cookie.owner,{portal,kind:'location',name:'Wash station',publishConsent:true})).id
  const other=await context.newPage();await other.goto(`${h.origin}/request/${portal}?target=${second}`)
  async function save(p,label) {
    await p.locator('[name=description]').fill(`Shared device fault ${label}`)
    await p.locator('[name=contact]').fill('synthetic-gasket-3')
    await p.locator('[name=photo]').setInputFiles({name:'private.png',mimeType:'image/png',buffer:png})
    await p.getByRole('button',{name:'Save draft',exact:true}).click()
    assert.ok(!(await records(p)).some(r=>r?.entries),'without consent no private record is stored')
    await p.getByLabel('Save this draft and photos on this private device').check()
    await p.getByRole('button',{name:'Save draft',exact:true}).click()
    await p.getByRole('status').filter({hasText:'Draft saved'}).waitFor()
  }
  await save(page,'one')
  // Removing consent deletes the stored private record.
  await page.getByLabel('Save this draft and photos on this private device').uncheck()
  await page.getByRole('button',{name:'Save draft',exact:true}).click()
  assert.ok(!(await records(page)).some(r=>r?.entries))
  await page.getByLabel('Save this draft and photos on this private device').check()
  await page.getByRole('button',{name:'Save draft',exact:true}).click()
  await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor()
  // A second independent scope is saved on the same device.
  await other.locator('[name=description]').fill('Second private fault')
  await other.locator('[name=contact]').fill('synthetic-gasket-4')
  await other.locator('[name=photo]').setInputFiles({name:'private.png',mimeType:'image/png',buffer:png})
  await other.getByLabel('Save this draft and photos on this private device').check()
  await other.getByRole('button',{name:'Save draft',exact:true}).click()
  await other.getByRole('status').filter({hasText:'Draft saved'}).waitFor()
  assert.equal((await records(page)).filter(r=>r?.entries).length,2)
  await context.addCookies(cookie.tech.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:h.origin}}))
  const signout=await context.newPage();await signout.goto(`${h.origin}/signin`)
  await Promise.all([signout.waitForURL('**/signin'),signout.evaluate(()=>{const form=document.createElement('form');form.method='POST';form.action='/auth/signout';document.body.append(form);form.submit()})])
  for(const p of [page,other]) {
    await p.getByRole('status').filter({hasText:'Draft cleared'}).waitFor()
    assert.equal(await p.locator('[name=contact]').inputValue(),'')
    assert.equal(await p.locator('[name=description]').inputValue(),'')
    assert.equal(await p.locator('[name=photo]').evaluate(n=>n.files.length),0)
    assert.equal(await p.getByLabel('Save this draft and photos on this private device').isChecked(),false)
    await p.getByRole('button',{name:'Save draft',exact:true}).click()
  }
  assert.ok(!(await records(signout)).some(r=>r?.entries),'stale tabs cannot resurrect private drafts')
  await other.close();await signout.close();await page.goto(scanned)
  assert.equal(await page.locator('[name=contact]').inputValue(),'')
  assert.equal(await page.locator('[name=photo]').evaluate(n=>n.files.length),0)
  if(capture)await capture(page,h,new URL(page.url()).pathname,'signed-out-draft-cleared')
  // API clients retain the native 204 contract and receive the storage fence.
  await save(page,'after signout')
  assert.equal(await page.evaluate(async()=>{const r=await fetch('/auth/signout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});return r.status}),204)
  await page.reload()
  assert.equal(await page.locator('[name=contact]').inputValue(),'')
  assert.ok(!(await records(page)).some(r=>r?.entries))
}
