import { CheckDisc } from '../icons'
import { Avatar, Section } from '../parts'

// Saturday's window on a linear time axis, 6:00 to 11:30 am.
const top = (hours: number) => `${((hours - 6) / 5.5) * 100}%`
const span = (from: number, to: number) => ({ top: top(from), height: `${((to - from) / 5.5) * 100}%` })

/** The Sat Oct 24 lanes: Marcus's 4471 with its restart after Keisha's 4472, and the lane screen 10 fills with 4481. */
export function SaturdayLanes() {
  return (
    <div className="lanes" role="img" aria-label="Saturday Oct 24, 6:00 to 11:30 am: 4471 Marcus 6:00 to 9:00 and restart 10:20 to 10:50; 4472 Keisha 6:00 to 10:15; one open lane.">
      <div className="lanes-axis" aria-hidden="true">{[6, 7, 8, 9, 10, 11].map(h => <span key={h} style={{ top: top(h) }}>{h}</span>)}<span className="lanes-end" style={{ top: top(11.5) }}>11:30</span></div>
      <div className="lanes-track">
        <span className="lane-block lane-blue" style={{ ...span(6, 9), left: '0%' }}><b>4471</b>Marcus</span>
        <span className="lane-block lane-blue lane-short" style={{ ...span(10 + 20 / 60, 10 + 50 / 60), left: '0%' }}>restart</span>
        <span className="lane-block lane-copper" style={{ ...span(6, 10.25), left: '34%' }}><b>4472</b>Keisha</span>
        <span className="lane-block lane-open" style={{ ...span(6, 11.5), left: '68%' }}>open</span>
      </div>
    </div>
  )
}

/** 04 · The printed work pack the agent staged into the planned shutdown, with Saturday's slot and Ellen's approval. */
export function Stage() {
  return (
    <Section id="stage" eyebrow="Stage · Fri Oct 16 – Mon Oct 19" title="Staged around Saturday’s shutdown." lead="The agent fits the repair into production’s planned shutdown, with parts, person, procedure and tool, and folds in the service due anyway.">
      <div className="stage-grid">
        <article className="card pack" aria-labelledby="pack-title">
          <h3 id="pack-title" className="pack-title">Staged plan · AC-02 motor bearings</h3>
          <dl className="pack-rows">
            <div><dt>Window</dt><dd>Dayton production calendar (Outlook) · Sat Oct 24 · planned shutdown 6:00–11:30 am · published Fri Oct 16, 3:30 pm</dd></div>
            <div><dt>Person</dt><dd className="pack-person"><Avatar initials="MB" /><span><strong>Marcus Bell</strong> · millwright · bearing and laser-alignment qualified <span className="ok">✓</span> · 6:00–9:00 am, restart 10:20 am after 4472 (3.5 hrs)</span></dd></div>
            <div><dt>Parts · BOM rev C</dt><dd>
              <ul className="pack-parts">
                <li><span>6316-C3 bearing × 2</span><span className="pill pill-red">Dayton 0 · Mesa 3</span></li>
                <li><span>Polyrex EM grease × 2</span><span className="pill pill-green">Dayton 9 ✓</span></li>
                <li><span>Coupling insert × 1</span><span className="pill pill-green">Dayton 2 ✓</span></li>
              </ul>
            </dd></div>
            <div><dt>Procedure</dt><dd>AC-02 bearing replacement rev 3 + lockout LOTO-AC-02 rev 4 · OEM manual §7.4 attached</dd></div>
            <div><dt>Tool</dt><dd>Laser alignment kit reserved Sat 6:00–10:00 am</dd></div>
            <div className="pack-forward"><dt>Pull forward</dt><dd>2,000-hour service · due at 18,000 hrs · meter 17,842 hrs → same window, Keisha Johnson, 4.25 hrs · one stop instead of two</dd></div>
          </dl>
        </article>
        <div className="stage-side">
          <article className="card slot" aria-labelledby="slot-title">
            <h3 id="slot-title" className="slot-title">Sat Oct 24 · 6:00–11:30 am</h3>
            <SaturdayLanes />
          </article>
          <p className="card approved"><CheckDisc /><span><strong>Approved by Ellen Brandt</strong> · Mon Oct 19, 7:10 am<span className="approved-sub">→ work 4471 and 4472 created · transfer requested</span></span></p>
        </div>
      </div>
    </Section>
  )
}
