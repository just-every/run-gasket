import { Avatar, Section } from '../parts'
import { Bearing, Calendar, Doc } from '../icons'

// AC-02's outboard bearing velocity, in/s: the 2:40 am reading each day from Sun Oct 4 to Tue Oct 13 (the agent's flag),
// on a linear axis from Oct 4 midnight. The gateway restart left no data on Fri Oct 9 from 1:00 to 4:00 am (coverage
// 216 - 3 of 216 hrs = 98.6%), so the line breaks there and the gap is never drawn as a reading.
const READ = 8 / 3 / 24, SPAN = 9 + READ, MAX = 0.6
const readings: [number, number][] = [[0, 0.12], [1, 0.122], [2, 0.126], [3, 0.133], [4, 0.146], [6, 0.19], [7, 0.222], [8, 0.262], [9, 0.31]].map(([d, v]) => [d + READ, v])
const gapFrom = 5 + 1 / 24, gapTo = 5 + 4 / 24
const between = (t: number) => { const [a, b] = [readings[4], readings[5]]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]) }
const x = (t: number) => (t / SPAN) * 1000
const y = (value: number) => 300 - (value / MAX) * 300
const path = (points: [number, number][]) => points.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join('')
const before = path([...readings.slice(0, 5), [gapFrom, between(gapFrom)]])
const after = path([[gapTo, between(gapTo)], ...readings.slice(5)])
const ticks: [string, number][] = [['Oct 4', 0], ['Oct 7', 3], ['Oct 9', 5], ['Oct 11', 7], ['Oct 13', 9]]
const pct = (t: number) => `${(t / SPAN) * 100}%`
const vpct = (value: number) => `${(1 - value / MAX) * 100}%`

/** 03 · The reliability agent's evidence: the velocity rise on a linear daily axis with the gateway gap, then its finding. */
export function Detect() {
  return (
    <Section id="detect" tone="pale" layout="copy-left" eyebrow="Detect · Tue Oct 13, 2:40 am" title="Flagged two weeks before the alarm." lead="The reliability agent reads AC-02’s live vibration beside its repair history and says why it thinks the bearing is going.">
      <div className="detect-cards">
        <figure className="card chart-card">
          <figcaption>
            <p className="card-title">AC-02 · outboard bearing velocity</p>
            <p className="card-sub">Oct 4 – Oct 13</p>
          </figcaption>
          <div className="chart">
            <div className="chart-y" aria-hidden="true">{[0.6, 0.4, 0.2, 0].map(v => <span key={v} style={{ top: vpct(v) }}>{v}</span>)}</div>
            <div className="chart-plot">
              <svg viewBox="0 0 1000 300" preserveAspectRatio="none" role="img" aria-label="Velocity rises from 0.12 in/s on Oct 4 to 0.31 in/s on Oct 13, under the 0.45 in/s alarm, with no data during the gateway restart on Oct 9 from 1:00 to 4:00 am.">
                {[0.2, 0.4, 0.6].map(v => <line key={v} x1="0" x2="1000" y1={y(v)} y2={y(v)} className="chart-grid" />)}
                {ticks.map(([t, d]) => <line key={t} x1={x(d)} x2={x(d)} y1="0" y2="300" className="chart-grid" />)}
                <defs><pattern id="gap-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#eef1f7" /><line x1="0" y1="0" x2="0" y2="6" stroke="#b9c1d3" strokeWidth="2" /></pattern></defs>
                <rect x={x(gapFrom)} y="0" width={x(gapTo) - x(gapFrom)} height="300" fill="url(#gap-hatch)" />
                <line x1="0" x2="1000" y1={y(0.45)} y2={y(0.45)} className="chart-alarm" />
                <path d={before} className="chart-line" />
                <path d={after} className="chart-line" />
                <line x1="0" x2="1000" y1="300" y2="300" className="chart-axis" />
              </svg>
              <span className="chart-dot" style={{ left: pct(READ), top: vpct(0.12) }} />
              <span className="chart-dot" style={{ left: '100%', top: vpct(0.31) }} />
              <span className="chart-note chart-start" style={{ left: pct(READ), top: vpct(0.12) }}>0.12 in/s</span>
              <span className="chart-note chart-end" style={{ top: vpct(0.31) }}>0.31 in/s</span>
              <span className="chart-rise" style={{ top: vpct(0.31) }}>+158%</span>
              <span className="chart-alarm-label" style={{ top: vpct(0.45) }}>Alarm 0.45 in/s</span>
              <span className="chart-gap-label" style={{ left: pct((gapFrom + gapTo) / 2) }}>No data · gateway restart</span>
            </div>
            <div className="chart-x" aria-hidden="true">{ticks.map(([t, d]) => <span key={t} style={{ left: pct(d) }}>{t}</span>)}</div>
          </div>
          <ul className="chips">
            <li>Coverage 98.6%</li>
            <li>Bearing temp 168 °F, up 14 °F</li>
            <li>Source: OPC UA gateway · read-only</li>
          </ul>
        </figure>
        <article className="card finding-card" aria-label="The agent's finding">
          <header className="finding-head">
            <span className="tile tile-copper"><Bearing /></span>
            <div>
              <p className="finding-title">Developing bearing wear</p>
              <p className="card-sub">AC-02 · 75 hp rotary screw</p>
            </div>
          </header>
          <p className="finding-label">From the imported history</p>
          <ul className="finding-history">
            <li><span className="dot-red" />AC-02 · Mon Mar 18, 2024 · seized at 0.52 in/s, 23 days after the rise · 31 hrs down · $9,840.00</li>
            <li><span className="dot-red" />AC-03 (Mesa) · Tue Jun 10, 2025 · failed at 0.49 in/s, 26 days in</li>
          </ul>
          <p className="finding-row"><Calendar />Likely to cross 0.45 in/s between Tue Oct 27 and Fri Oct 30</p>
          <p className="finding-row finding-muted"><svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v16M6 20h12M4 8h16M4 8l-2.5 6a3 3 0 0 0 5 0zM20 8l-2.5 6a3 3 0 0 0 5 0z" /></svg>Other cause: loose base or misalignment, less likely · 1× running-speed level unchanged</p>
          <p className="finding-proposal"><Doc />Proposal: replace both motor bearings at the next planned stop</p>
          <p className="finding-lead"><Avatar initials="RK" />Accountable lead: Ray Kowalski</p>
        </article>
      </div>
    </Section>
  )
}
