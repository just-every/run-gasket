// PART-005: keep actual replenishment policies, approvals, receipts and notices.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { harness } from './harness.mjs'
import { installation } from './installation.mjs'

export async function replenishmentArchive(h,cookie) {
  const read=async(h,cookie)=>{
    const orders=await h.api('purchase-orders',cookie.owner)
    const receiving=await Promise.all(orders.map(order=>h.api(`purchase-orders/${order.id}/receipts`,cookie.owner)))
    const files=[]
    for(const evidence of receiving.flatMap(data=>data.receipts.flatMap(receipt=>receipt.evidence))) {
      const response=await h.raw(`/app/receipt-evidence/${evidence.id}`,{cookie:cookie.lead})
      assert.equal(response.status,200)
      const sha=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')
      assert.equal(sha,evidence.sha256)
      files.push({id:evidence.id,sha})
    }
    return {orders,receiving,files,replenishment:await h.api('replenishment',cookie.owner),ledger:await h.api('automation/jobs',cookie.owner),notices:await h.api('notices',cookie.lead),parts:await h.api('parts',cookie.owner)}
  }
  const before=await read(h,cookie)
  assert.ok(before.replenishment.open.length&&before.files.length&&before.notices.some(row=>row.kind==='replenishment'))
  await h.stop()
  const archive=join(h.installation.root,'exports','replenishment.rer')
  await h.installation.rer('export','--output',archive)
  const empty=await installation()
  try {
    await empty.rer('import','--input',archive,'--yes')
    const restored=await harness({vars:h.vars,installation:empty})
    try {
      const signed={owner:await restored.signIn(h.vars.OWNER_EMAIL),lead:await restored.signIn('lead@example.test')}
      assert.equal((await restored.raw('/setup',{cookie:signed.owner,form:new URLSearchParams({confirm:'yes'})})).status,303)
      assert.deepEqual(await read(restored,signed),before,'PART-005 state and original evidence survive public export/import')
    }finally{await restored.close()}
  }finally{await empty.remove()}
}
