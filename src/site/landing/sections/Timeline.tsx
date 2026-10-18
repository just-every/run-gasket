import { AlertDisc } from '../icons'
import { Section } from '../parts'
import type { ReactNode } from 'react'

type Tone = 'copper' | 'red' | 'blue' | 'green'
const stops: { tone: Tone; next?: Tone; when: string; verb: string; record: ReactNode }[] = [
  { tone: 'copper', next: 'copper', when: 'Tue Oct 13 · 2:40 am', verb: 'Flagged', record: 'AC-02 outboard bearing 0.31 in/s, rising 9 days' },
  { tone: 'copper', next: 'copper', when: 'Fri Oct 16 · 4:05 pm', verb: 'Staged', record: 'Sat Oct 24 shutdown, 6:00–11:30 am · Marcus Bell · 3.5 hrs' },
  { tone: 'red', next: 'blue', when: 'Mon Oct 19 · 7:10 am', verb: 'Approved', record: <>Work order 4471<span className="tl-alert"><AlertDisc />Dayton has 0 bearings</span></> },
  { tone: 'blue', next: 'blue', when: 'Mon Oct 19 · 2:20 pm', verb: 'Shipped', record: 'Transfer T-0318 · 2 × 6316-C3 from Mesa' },
  { tone: 'blue', next: 'blue', when: 'Tue Oct 20 · 7:41 am', verb: 'Confirmed', record: 'Keisha Johnson’s handheld reading 0.37 in/s, still rising' },
  { tone: 'blue', next: 'blue', when: 'Wed Oct 21 · 10:05 am', verb: 'Received', record: 'bin D-07 · reserved to 4471 ✓' },
  { tone: 'blue', next: 'green', when: 'Sat Oct 24 · 6:00–10:50 am', verb: 'Changed', record: '0.08 in/s after restart' },
  { tone: 'green', when: 'Mon Oct 26 · 6:00 am', verb: 'First shift', record: 'Presses 1–4 running · approved 6:40 am by Dana Ortiz' },
]

/** 02 · One wide card: the bearing's eight stops from the agent's flag to first shift, labels alternating above and below the line. */
export function Timeline() {
  return (
    <Section id="timeline" eyebrow="AC-02 · Oct 13 – 26" title="From first warning to first shift." lead="Two weeks, one failing bearing, no breakdown. Every stop below is a record you can open.">
      <div className="card tl-card">
        <ol className="tl">
          {stops.map((stop, index) => (
            <li key={stop.verb} className={`tl-stop tl-${stop.tone} ${index % 2 ? 'tl-below' : 'tl-above'}`} style={{ ['--i' as string]: index + 1 }}>
              <span className={`tl-node${stop.next ? ` tl-to-${stop.next}` : ''}`}>
                <span className="tl-dot">{stop.tone === 'green' ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.4 3.6 3.5L17.5 8.5" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" /></svg> : index + 1}</span>
              </span>
              <div className="tl-label">
                <p className="tl-when">{stop.when}</p>
                <p className="tl-verb">{stop.verb}</p>
                <p className="tl-record">{stop.record}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="tl-foot">
          <p><span>Unplanned downtime on <span className="nowrap">AC-02:</span></span> <strong>0 min</strong></p>
          <p><span>Charged to <span className="nowrap">AC-02:</span></span> <strong>$580.60 <span className="ok">✓</span></strong></p>
        </div>
      </div>
    </Section>
  )
}
