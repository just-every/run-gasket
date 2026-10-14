import { Callout, Drawing, Leaders, Machine } from './Drawing'
import { INCLUDED } from './icons'

// The sections after the hero: heading, one or two lines, one drawing, sides alternating.

export function Free() {
  return (
    <section className="landing-section landing-free" aria-labelledby="free-title">
      <div className="landing-text">
        <h2 id="free-title" className="landing-h2-big">100% free.</h2>
        <p>Gasket is MIT licensed. Run it, change it, and keep every record.</p>
      </div>
      <Drawing name="free" label="The MIT License card on a leader to a twin fryer.">
        <Machine src="/brand/assets/fryer.svg" className="free-machine" />
        <Leaders width={760} height={540} dots={[[466, 117]]} paths={['M200 160C200 205 330 200 466 117']} />
        <Callout className="free-licence">
          <p className="callout-title">MIT License</p>
          <p className="callout-rule">Permission is hereby granted, free of charge</p>
        </Callout>
      </Drawing>
    </section>
  )
}

export function Story() {
  const rows = [['15 Oct 2026', 'WO-0001', 'Approved', 'Sam Lee'], ['15 Oct 2026', 'WO-0001', 'Submitted for review', 'Max Ortiz'], ['14 Oct 2026', 'WO-0001', 'Downtime 31 minutes', 'Max Ortiz']]
  return (
    <section className="landing-section landing-story" aria-labelledby="story-title">
      <figure className="story-card" role="img" aria-label="An asset's history: HK-001, the walk-in cooler compressor, in service, with who approved, submitted and recorded downtime on WO-0001, and a CSV download.">
        <div className="story-asset">
          <img src="/brand/assets/compressor.svg" alt="" width={128} height={120} />
          <div>
            <p className="story-tag">HK-001 · Refrigeration</p>
            <p>Walk-in cooler compressor</p>
            <span className="chip">In service</span>
          </div>
        </div>
        <table>
          <thead><tr><th>When</th><th>Work order</th><th>What</th><th>Who</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.join()}>{row.map(cell => <td key={cell}>{cell}</td>)}</tr>)}</tbody>
        </table>
        <span className="story-download">Download history (CSV)</span>
      </figure>
      <div className="landing-text">
        <h2 id="story-title">Every asset keeps its story.</h2>
        <p>Work orders, readings, parts, downtime and findings, with who did what and when. Download it as CSV.</p>
      </div>
    </section>
  )
}

export function Board() {
  const tiles: [string, string][] = [['1', 'Overdue'], ['0', 'Waiting for review'], ['1', 'Open follow-ups'], ['0', 'Down now'], ['1', 'Parts below minimum']]
  return (
    <section className="landing-section landing-board" aria-labelledby="board-title">
      <div className="landing-text">
        <h2 id="board-title">See what’s late and what’s down.</h2>
        <p>Overdue work, work waiting for review, assets down now and parts below minimum, on one board.</p>
      </div>
      <Drawing name="board" label="The board's five tiles over a twin fryer: 1 overdue, 0 waiting for review, 1 open follow-up, 0 down now and 1 part below minimum; the overdue tile's leader runs to the fryer.">
        <Machine src="/brand/assets/fryer.svg" className="board-machine" />
        <Leaders width={760} height={600} dots={[[409, 264]]} paths={['M68 132C68 212 200 264 409 264']} />
        <ul className="board-tiles">
          {tiles.map(([n, label], index) => <li key={label} className={index === 0 ? 'board-tile-late' : undefined}><span>{n}</span>{label}</li>)}
        </ul>
      </Drawing>
    </section>
  )
}

export function Parts() {
  return (
    <section className="landing-section landing-parts" aria-labelledby="parts-title">
      <Drawing name="parts" label="A shelf bin of filter driers beside the part card: Filter drier FD-164, on hand 3 each, minimum 4 each, below minimum.">
        <Machine src="/brand/assets/shelf-bin.svg" className="parts-machine" />
        <Leaders width={780} height={433} dots={[[222, 181]]} paths={['M222 181C330 150 400 113 485 113']} />
        <Callout className="parts-card">
          <img src="/brand/assets/filter-drier.svg" alt="" />
          <div>
            <p className="callout-title">Filter drier</p>
            <p className="callout-rule">FD-164</p>
            <p>On hand 3 each<br />Minimum 4 each</p>
            <span className="chip chip-outline">Below minimum</span>
          </div>
        </Callout>
      </Drawing>
      <div className="landing-text">
        <h2 id="parts-title">Parts that match the shelf.</h2>
        <p>Issue parts to a job, return what's left, and record a physical count.</p>
      </div>
    </section>
  )
}

export function MoveIn() {
  const tiles: [string, string][] = [['12', 'Assets'], ['18', 'Meters'], ['240', 'Readings'], ['9', 'Parts']]
  return (
    <section className="landing-section landing-movein" aria-labelledby="movein-title">
      <div className="landing-text">
        <h2 id="movein-title">Move in from MaintainX.</h2>
        <p>Bring your assets, parts and meter readings across, and see the dry run before anything is written.</p>
      </div>
      <Drawing name="movein" label="A centrifugal pump with the move-in dry run: nothing has been written; 12 assets, 18 meters, 240 readings and 9 parts, ready to apply.">
        <Machine src="/brand/assets/pump.svg" className="movein-machine" />
        <Leaders width={900} height={540} dots={[[452, 197]]} paths={['M452 197 520 98H548']} />
        <Callout className="movein-card">
          <p className="callout-title">Dry run: nothing has been written</p>
          <ul className="movein-tiles">{tiles.map(([n, label]) => <li key={label}><span>{n}</span>{label}</li>)}</ul>
          <span className="callout-button">Apply this move-in</span>
        </Callout>
      </Drawing>
    </section>
  )
}

export function Included() {
  const items: [keyof typeof INCLUDED, string, string][] = [['schedules', 'Calendar or', 'meter schedules'], ['revisions', 'Checklist', 'revisions'], ['downtime', 'Downtime', 'in minutes'], ['photos', 'Photos as', 'evidence'], ['roles', 'One role', 'per person'], ['agents', 'Agents prepare,', 'a lead approves']]
  return (
    <section className="landing-included" aria-labelledby="included-title">
      <h2 id="included-title">Also included.</h2>
      <ul>{items.map(([icon, first, second]) => <li key={icon}>{INCLUDED[icon]}<span>{first} {second}</span></li>)}</ul>
    </section>
  )
}
