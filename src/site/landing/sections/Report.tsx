import { Calendar, CheckDisc, Report as ReportIcon } from '../icons'
import { Section } from '../parts'

// October's unplanned downtime at Dayton, minutes and events; 618 min over 14 events.
const pareto: [string, number, number][] = [['Press 3', 212, 4], ['Cure oven conveyor', 148, 2], ['Press 1', 96, 2], ['FL-07', 84, 1], ['Others', 78, 5]]
const total = pareto.reduce((sum, [, minutes]) => sum + minutes, 0)
const cumulative = pareto.map((_, i) => Math.round(pareto.slice(0, i + 1).reduce((sum, [, minutes]) => sum + minutes, 0) / total * 100))

// AC-02's outboard velocity after the repair, Sat Oct 24 – Sun Nov 1 (0.08–0.09 in/s), drawn against 0–0.12 in/s.
const after = [0.08, 0.082, 0.085, 0.081, 0.084, 0.088, 0.083, 0.086, 0.082, 0.087, 0.084, 0.081, 0.085, 0.089, 0.083, 0.086, 0.084, 0.082]
const spark = after.map((v, i) => `${i ? 'L' : 'M'}${(i / (after.length - 1) * 400).toFixed(1)} ${(60 - v / 0.12 * 60).toFixed(1)}`).join('')

/** 11 · October's report for both plants, with the agent's interval change and its check that the fix held. */
export function Report() {
  return (
    <Section id="report" tone="pale" eyebrow="Report · Mon Nov 2, 6:00 am" title="Where October’s downtime went." lead="The monthly pack lands in Ellen’s inbox. Each number links to its work, and the agent says what to change next.">
      <div className="report-grid">
        <article className="card report" aria-labelledby="report-title">
          <header className="report-head">
            <div><h3 id="report-title">Hollis Stamping &amp; Coating · October 2026</h3><p className="card-sub">Dayton and Mesa</p></div>
            <p className="report-files"><span>PDF</span><span>CSV</span></p>
          </header>
          <div className="stats">
            <div className="stat"><p className="stat-label">PM on time</p><p className="stat-value">96%</p><p className="stat-note">420 of 437 · Dayton 291/302 · Mesa 129/135 · late and skipped counted</p></div>
            <div className="stat"><p className="stat-label">Unplanned downtime</p><p className="stat-value">618 min</p><p className="stat-note">Dayton · 14 events · MTTR 44 min</p></div>
            <div className="stat"><p className="stat-label">Press 3 MTBF</p><p className="stat-value">118 run hrs</p><p className="stat-note">472 ÷ 4</p></div>
          </div>
          <h4 className="pareto-title">Downtime Pareto</h4>
          <table className="pareto">
            <thead><tr><th>Asset</th><th className="sr-only">Minutes</th><th>Cumulative</th></tr></thead>
            <tbody>
              {pareto.map(([asset, minutes, events], i) => (
                <tr key={asset}>
                  <th scope="row">{asset} · {minutes} min · {events}{i === 0 ? ' events' : ''}</th>
                  <td className="pareto-bar"><span style={{ width: `${(minutes / pareto[0][1]) * 100}%` }} /></td>
                  <td className="pareto-cum"><b>{cumulative[i]}%</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="report-ok"><CheckDisc /><span><b>AC-02</b> · 0 min unplanned · $1,468.60 (4471 $580.60 + 4472 $888.00) · Mar 2024 failure: 31 hrs, $9,840.00</span></p>
          <p className="report-requests"><ReportIcon />Requests: 3 awaiting triage</p>
        </article>
        <div className="report-side">
          <article className="card agent-card" aria-labelledby="interval-title">
            <p className="agent-kicker">Interval change</p>
            <h3 id="interval-title">Regrease AC-01, AC-02, AC-03 every 1,000 hrs, not 2,000.</h3>
            <p className="agent-body">Two failures at 1,880 and 1,960 hrs after regrease · OEM limit 2,000 hrs kept as a hard limit</p>
            <p className="agent-ok"><CheckDisc /><span>Approved by Ray Kowalski · Tue Oct 27 · rollback: previous revision kept</span></p>
          </article>
          <article className="card agent-card" aria-labelledby="since-title">
            <p className="agent-kicker">Since the repair</p>
            <h3 id="since-title">Sat Oct 24 – Sun Nov 1</h3>
            <svg className="spark" viewBox="0 0 400 60" preserveAspectRatio="none" role="img" aria-label="AC-02 holds between 0.08 and 0.09 in/s"><path d="M0 59.5H400" className="spark-axis" /><path d={spark} className="spark-line" /></svg>
            <p className="agent-body"><b>AC-02</b> 0.08–0.09 in/s · 0 unplanned stops · coverage 99.2%</p>
            <p className="agent-review"><Calendar />30-day review Mon Nov 23</p>
          </article>
        </div>
      </div>
    </Section>
  )
}
