import { ArrowDown, ArrowRight, Drum } from '../icons'
import { Section } from '../parts'
import type { ReactNode } from 'react'

function Doc({ n, kind, children }: { n: number; kind: string; children: ReactNode }) {
  return (
    <li className={`card doc doc-${kind}`}>
      <span className="doc-n" aria-hidden="true">{n}</span>
      {children}
      {n < 5 ? <span className="doc-next" aria-hidden="true"><ArrowRight /><ArrowDown /></span> : null}
    </li>
  )
}

/** 09 · The hydraulic oil chain as its documents: low stock, PO 1187, the receipt, the matched invoice and the QuickBooks Online bill. */
export function Stores() {
  return (
    <Section id="stores" eyebrow="Stores · Tue Oct 20 – Thu Oct 22" title="Bought before the oil ran out." lead="Low stock drafts its own purchase order. The oil arrives Thursday, and the bill goes to QuickBooks once it matches the delivery.">
      <ol className="chain">
        <Doc n={1} kind="stock">
          <p className="doc-icon"><Drum /></p>
          <p className="doc-title">AW-46 hydraulic oil</p>
          <p className="doc-big">3.750 drums</p>
          <p className="doc-sub">minimum 4.000 · bin OIL-2</p>
          <p className="pill pill-solid-red">below minimum</p>
          <p className="doc-foot">Tue 6:46 am · after 0.250 drum to 4480</p>
        </Doc>
        <Doc n={2} kind="po">
          <p className="doc-kicker">Purchase order</p>
          <p className="doc-title">PO 1187</p>
          <p className="doc-sub">Wolf Creek Lubricants</p>
          <p className="doc-line">AW-46 hydraulic oil, 55 gal<span>4 drums × $689.00 = <b>$2,756.00</b></span></p>
          <p className="doc-sub">deliver Thu Oct 22</p>
          <ul className="doc-status">
            <li>Submitted by Sam Okafor 8:30 am</li>
            <li>Approved by Ellen Brandt 8:50 am</li>
            <li>Sent 9:12 am</li>
            <li>Acknowledged 10:30 am</li>
          </ul>
        </Doc>
        <Doc n={3} kind="slip">
          <p className="doc-kicker">Packing slip</p>
          <p className="doc-title">Received Thu Oct 22, 1:40 pm</p>
          <p className="doc-sub">Brenda Walsh · 4 of 4 · bin OIL-2</p>
          <ul className="doc-ticks">
            {[1, 2, 3, 4].map(n => <li key={n}><span className="tickbox" aria-hidden="true">✓</span>AW-46 drum {n} of 4</li>)}
          </ul>
          <p className="doc-big doc-big-sm">On hand 7.750</p>
        </Doc>
        <Doc n={4} kind="invoice">
          <p className="doc-kicker">Invoice</p>
          <p className="doc-title">Wolf Creek invoice</p>
          <table className="doc-lines">
            <tbody>
              <tr><td>AW-46 × 4 @ $689.00</td><td>$2,756.00 <span className="ok">✓</span></td></tr>
              <tr className="doc-total"><td>Total</td><td>$2,756.00 <span className="ok">✓</span></td></tr>
            </tbody>
          </table>
          <p className="doc-sub">read by the agent · lines matched <span className="ok">✓</span></p>
          <p className="doc-sub">approved by Sam Okafor 1:58 pm</p>
        </Doc>
        <Doc n={5} kind="bill">
          <p className="doc-kicker">QuickBooks Online</p>
          <p className="doc-title">Bill synced 2:05 pm</p>
          <p className="doc-billrow"><span>Wolf Creek Lubricants</span><b>$2,756.00</b></p>
          <p className="pill pill-gray">Open</p>
          <p className="doc-sub">due Sat Nov 21 (net 30)</p>
        </Doc>
      </ol>
      <p className="match">PO $2,756.00 = Receipt $2,756.00 = Bill $2,756.00 <span aria-hidden="true">✓</span></p>
    </Section>
  )
}
