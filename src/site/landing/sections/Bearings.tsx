import { Cross, Package } from '../icons'
import { Section } from '../parts'
import type { ReactNode } from 'react'

const steps: { when: ReactNode; what: ReactNode }[] = [
  { when: '7:12 am EDT', what: 'Agent requests the transfer' },
  { when: <>11:20 am MST <span className="nowrap">(2:20 pm EDT)</span></>, what: 'Angela Ruiz dispatches · Mesa left with 1' },
  { when: '3:05 pm EDT', what: 'PO 1186 · Salt River Bearing Co. · 2 × $151.20 = $302.40 to restock Mesa · drafted by the agent, submitted by Sam Okafor, approved by Ellen Brandt' },
  { when: '3:20 pm EDT', what: 'Dayton minimum 0 → 2 · approved by Ray Kowalski' },
  { when: 'Wed Oct 21, 10:05 am', what: <>Brenda Walsh receives 2 of 2 into bin D-07 · reserved to 4471 <span className="ok">✓</span></> },
]

/** 05 · The page's one dark band: Dayton has none, Mesa has three, the transfer between them and the five-step recovery. */
export function Bearings() {
  return (
    <Section id="parts" tone="band" eyebrow="Parts · Mon Oct 19 – Wed Oct 21" title={<>No bearings in Dayton.<br />Two from Mesa by Wednesday.</>} lead="The supplier couldn’t make Saturday. Mesa had three on the shelf.">
      <div className="sites">
        <article className="card site-card site-short" aria-label="Dayton storeroom">
          <p className="site-where">Dayton, OH · EDT</p>
          <p className="site-bin">Bin D-07 · 6316-C3</p>
          <p className="site-count site-count-red">0 on hand</p>
          <p className="site-note">last 2 issued to AC-01, work 4317, Thu Aug 27 · minimum was 0 (imported)</p>
          <p className="site-quote"><Cross /><span><strong>Stillwater Bearing &amp; Transmission</strong> · 12 days → Sat Oct 31 · misses the window</span></p>
        </article>
        <p className="transit"><span className="transit-line" aria-hidden="true" /><span className="transit-pill"><Package /><span>Transfer T-0318 · 2 × 6316-C3 · 2-day air · in transit</span></span></p>
        <article className="card site-card site-stock" aria-label="Mesa storeroom">
          <p className="site-where">Mesa, AZ · MST</p>
          <p className="site-bin">Bin B-14 · 6316-C3</p>
          <p className="site-count site-count-green">3 on hand</p>
          <p className="site-note site-note-lg">0 reserved</p>
          <p className="site-after">After T-0318: 1 on hand · PO 1186 restocks Mesa</p>
        </article>
      </div>
      <div className="recovery">
        <ol className="recovery-steps">
          {steps.map((step, index) => (
            <li key={index} className="card"><p className="recovery-when">{step.when}</p><p className="recovery-what">{step.what}</p></li>
          ))}
        </ol>
        <p className="recovery-done">Saturday’s plan unchanged <span aria-hidden="true">✓</span></p>
      </div>
    </Section>
  )
}
