import { Moon, Refresh } from '../icons'
import { Avatar, Section } from '../parts'

const rows: { wo: string; task: string; kind: 'calendar' | 'meter' | 'route'; source?: string; due?: string; late?: boolean }[] = [
  { wo: '4457', task: 'Press 2 · monthly clutch and brake inspection', kind: 'calendar', due: 'Mon' },
  { wo: '4462', task: 'Press 4 · die-set check at 1,500,000 strokes', kind: 'meter' },
  { wo: '4463', task: 'Compressor room · weekly round (AC-01, AC-02, DR-01, RT-01)', kind: 'route', due: 'Tue' },
  { wo: '4466', task: 'Press 1 · weekly lube and air check', kind: 'calendar', due: 'Wed 10:00 am', late: true },
  { wo: '4468', task: 'FL-07 forklift · 250-hr service', kind: 'meter', source: 'Samsara 4,012 engine hrs (last at 3,762)' },
  { wo: '4464', task: 'FL-12 (Mesa) · 250-hr service', kind: 'meter', source: 'Samsara' },
]

/** 07 · The overnight generation run (14 work orders, no duplicates after a restart) and PM 4466 chased to done. */
export function Pm() {
  return (
    <Section id="pm" tone="pale" layout="copy-right" eyebrow="PM · Mon Oct 19, 12:05 am – Wed Oct 21, 2:15 pm" title="Fourteen PMs by morning. One chased to done." lead="Calendar, meter and route schedules make their own work overnight. When one runs late, it gets chased until it’s done.">
      <div className="pm-cards">
        <article className="card pm-list" aria-labelledby="pm-run">
          <header className="pm-head">
            <h3 id="pm-run">Generated Mon Oct 19, 12:05 am · 14 work orders · 0 duplicates</h3>
            <p className="pm-restart"><Refresh />Scheduler restarted 12:07 am · resumed</p>
            <ul className="chips chips-tight">
              <li className="chip-blue">Calendar <b>9</b></li><li className="chip-blue">Meter <b>3</b></li><li className="chip-blue">Route <b>2</b></li>
              <li>Dayton <b>9</b></li><li>Mesa <b>5</b></li>
            </ul>
          </header>
          <table className="pm-table">
            <colgroup><col className="pm-col-wo" /><col /><col className="pm-col-kind" /><col className="pm-col-due" /></colgroup>
            <thead className="sr-only"><tr><th>Work order</th><th>Task</th><th>Trigger</th><th>Due</th></tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.wo} className={row.late ? 'pm-late' : undefined}>
                  <td className="pm-wo">{row.wo}</td>
                  <td className="pm-task">{row.task}</td>
                  <td className="pm-kind" colSpan={row.due ? 1 : 2}><span className={`tag tag-${row.kind}`}>{row.kind}{row.source ? ` · ${row.source}` : ''}</span></td>
                  {row.due ? <td className="pm-due">{row.due}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pm-more">+ 8 more</p>
          <p className="pm-quiet"><Moon />Notices held for quiet hours · sent 6:00 am</p>
        </article>
        <article className="card chase" aria-labelledby="chase-title">
          <h3 id="chase-title" className="chase-title"><Avatar initials="DH" />PM 4466 · Devon Harris</h3>
          <ol className="chase-steps">
            <li className="chase-gray"><p><b>9:30 am</b> · push ‘due 10:00’ · no acknowledgement</p></li>
            <li className="chase-blue"><p><b>12:00 pm</b> · agent asks the blocker · ‘Press 2 die change, free at 2’</p></li>
            <li className="chase-copper"><p><b>2:00 pm</b> · 4 hrs overdue · escalated to Ray Kowalski, blocker attached</p></li>
            <li className="chase-green"><p><b>2:15 pm</b> · done ✓ · Late 4 h 15 m · kept on the record</p></li>
          </ol>
        </article>
      </div>
    </Section>
  )
}
