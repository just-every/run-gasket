import { Bearing, CheckDisc } from '../icons'
import { Avatar, Section } from '../parts'
import { Signature } from './Floor'

const top = (hours: number) => `${((hours - 6) / 5.5) * 100}%`
const span = (from: number, to: number) => ({ top: top(from), height: `${((to - from) / 5.5) * 100}%` })

/** 10 · Saturday's three jobs, the completed 4471 with its costs, and the board first shift walks in to. */
export function Shutdown() {
  return (
    <Section id="shutdown" align="center" eyebrow="Shutdown · Sat Oct 24, 6:00 am – Mon Oct 26, 6:40 am" title="Changed Saturday. Ready Monday." lead="Three jobs in one planned window. Signed Saturday, reviewed before first shift.">
      <div className="shutdown">
        <article className="card wo4471" aria-labelledby="wo4471-title">
          <header className="wo4471-head">
            <h3 id="wo4471-title">Work order 4471</h3><span className="pill pill-copper">high priority</span>
            <p className="wo4471-sub">AC-02 · corrective, from the agent’s proposal</p>
          </header>
          <h4 className="wo4471-proc">Procedure rev 3</h4>
          <ul className="steps-done">
            <li><CheckDisc />Lockout applied · Marcus Bell · 6:02 am ✓</li>
            <li><CheckDisc />Both bearings replaced · 6316-C3 × 2</li>
            <li><CheckDisc />Alignment 0.002 in ✓</li>
            <li><CheckDisc />Restart 10:20 am, after 4472</li>
            <li><CheckDisc />Vibration 0.08 in/s at 10:45 am ✓</li>
          </ul>
          <dl className="costs">
            <div><dt><b>Parts</b> 2 × $151.20 + 2 × $14.90 + $80.40 =</dt><dd>$412.60</dd></div>
            <div><dt><b>Labor</b> 3.5 hrs × $48.00 =</dt><dd>$168.00</dd></div>
            <div className="costs-total"><dt>Total</dt><dd>$580.60 · charged to AC-02</dd></div>
          </dl>
          <p className="evidence">
            <span className="evidence-photo"><Bearing /><span>old bearing · digest ✓</span></span>
            <span className="evidence-photo"><Bearing /><span>new bearing · digest ✓</span></span>
          </p>
          <p className="signed"><span><b>Signed by Marcus Bell</b> · Sat Oct 24, 10:50 am</span><Signature className="signature signature-sm" /></p>
          <p className="signed"><span><b>Approved by Dana Ortiz</b> · Mon Oct 26, 6:40 am</span><CheckDisc /></p>
        </article>
        <article className="card board" aria-labelledby="board-title">
          <h3 id="board-title">Mon Oct 26 · 6:00 am</h3>
          <ul className="board-list">
            <li><CheckDisc />Presses 1–4 running</li>
            <li><CheckDisc />AC-01, AC-02 available (0.08 in/s)</li>
            <li><CheckDisc />Cure oven 392 °F</li>
            <li><CheckDisc />0 assets down</li>
          </ul>
          <p className="board-line">3 awaiting review → 0 at 6:40 am</p>
          <p className="board-line">Backlog 412 hrs (was 486)</p>
        </article>
        <article className="card saturday" aria-labelledby="saturday-title">
          <h3 id="saturday-title">Sat Oct 24 · 6:00–11:30</h3>
          <div className="sat-people" aria-hidden="true"><span /><Avatar initials="MB" tone="solid-blue" /><Avatar initials="KJ" tone="solid-copper" /><Avatar initials="DH" tone="solid-slate" /></div>
          <div className="sat-chart" role="img" aria-label="4471 Marcus 6:00 to 9:00 and 10:20 to 10:50 restart and check; 4472 Keisha 6:00 to 10:15, the 2,000-hour service at 17,958 hours, signed 11:05; 4481 Devon 6:00 to 7:40, Press 3 hose.">
            <div className="lanes-axis" aria-hidden="true">{[6, 7, 8, 9, 10, 11].map(h => <span key={h} style={{ top: top(h) }}>{h}</span>)}<span className="lanes-end" style={{ top: top(11.5) }}>11:30</span></div>
            <div className="sat-lanes">
              <div className="sat-lane sat-blue"><span className="sat-bar" style={span(6, 9)} /><span className="sat-bar" style={span(10 + 20 / 60, 10 + 50 / 60)} />
                <p className="sat-note" style={{ top: top(6.1) }}><b>4471</b><span>Marcus</span><span>6:00–9:00</span></p>
                <p className="sat-note sat-note-across" style={{ top: top(10.3) }}><span className="nowrap">10:20–10:50</span> <span className="nowrap">restart and check</span></p></div>
              <div className="sat-lane sat-copper"><span className="sat-bar" style={span(6, 10.25)} />
                <p className="sat-note" style={{ top: top(6.1) }}><b>4472</b><span>Keisha</span><span>6:00–10:15</span></p></div>
              <div className="sat-lane sat-slate"><span className="sat-bar" style={span(6, 7 + 40 / 60)} />
                <p className="sat-note" style={{ top: top(6.1) }}><b>4481</b><span>Devon</span><span>6:00–7:40</span></p></div>
            </div>
          </div>
          <ul className="sat-key">
            <li className="sat-copper"><span><b>4472</b> 2,000-hr service at 17,958 hrs · <span className="nowrap">signed 11:05</span></span></li>
            <li className="sat-slate"><span><b>4481</b> Press 3 hose</span></li>
          </ul>
          <p className="sat-closed"><CheckDisc />Window closed 11:30 am, on time</p>
        </article>
      </div>
    </Section>
  )
}
