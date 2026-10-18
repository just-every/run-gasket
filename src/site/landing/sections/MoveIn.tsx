import { CheckDisc, People } from '../icons'
import { Section } from '../parts'
import type { ReactNode } from 'react'

const Row = ({ figure, label, note }: { figure: string; label: string; note?: ReactNode }) => (
  <li><p><b>{figure}</b> {label}{note ? <span className="import-note">{note}</span> : null}</p><CheckDisc /></li>
)

const moveInLead = 'Every asset, PM and work order since 2019 comes across, which is where the agent found AC-02’s 2024 failure. Also from UpKeep, Fiix, Limble or a spreadsheet.'
// The one-line start, as on /run: the command and one plain-words comment, nothing it prints.
const terminal = (
  <div className="terminal" role="group" aria-label="Start Gasket on your computer">
    <p className="terminal-dots" aria-hidden="true"><span /><span /><span /></p>
    <pre><code><span className="terminal-prompt" aria-hidden="true">$ </span>npx -y @runeditrun/rer dev just-every/run-gasket{'\n'}<span className="terminal-comment"># clones, installs and starts Gasket on your computer</span></code></pre>
  </div>
)

/** 12 · The MaintainX history moved in over a weekend, the shadow compare before cutover, and the one line that starts Gasket. */
export function MoveIn() {
  return (
    <Section id="move-in" layout="copy-left" eyebrow="Moving in · Fri Sep 11 – Mon Sep 14" title="Seven years of MaintainX, moved in a weekend." lead={moveInLead} after={terminal}>
      <div className="import-cards">
        <article className="card import" aria-labelledby="import-title">
          <h3 id="import-title">MaintainX import</h3>
          <p className="card-sub">Reviewed Fri Sep 11 · applied Sat Sep 12</p>
          <div className="import-grid">
            <ul>
              <Row figure="2" label="sites" />
              <Row figure="1,214" label="assets" />
              <Row figure="2,316" label="parts · $187,420.55" note="on hand" />
              <Row figure="147" label="vendors" />
            </ul>
            <ul>
              <Row figure="1,032" label="POs" />
              <Row figure="412" label="PM schedules ·" note="paused until cutover" />
              <Row figure="38,906" label="work orders ·" note="since 2019, with procedures and comments" />
              <Row figure="61,240" label="attachments ·" note="digests matched" />
            </ul>
          </div>
          <p className="import-foot"><span><People />86 people · 11 phone-only, invited by text</span><span className="pill pill-copper-line">3 duplicate asset tags merged</span></p>
        </article>
        <article className="card shadow" aria-labelledby="shadow-title">
          <h4 id="shadow-title" className="shadow-title">Shadow compare</h4>
          <p className="shadow-row"><CheckDisc />PM next dates 412 of 412 ✓</p>
          <p className="shadow-row"><CheckDisc />Stock value $187,420.55 = $187,420.55 ✓</p>
          <p className="cutover">Cutover Mon Sep 14, 6:00 am</p>
        </article>
      </div>
    </Section>
  )
}
