import { AlertDisc, Battery, Bars, CheckDisc, Clipboard, Clock, Cloud, Cube, Hose, QrCode, SignalOff, Wifi } from '../icons'
import { Avatar, Section } from '../parts'
import { ClampPhoto, CompressorPhoto, GaugePhoto, MotorPhoto } from '../photos'
import type { ReactNode } from 'react'

function Phone({ time, status, className, label, children }: { time: string; status: ReactNode; className: string; label: string; children: ReactNode }) {
  return (
    <figure className={`phone ${className}`} aria-label={label}>
      <div className="phone-screen">
        <p className="phone-status"><span>{time}</span><span className="phone-island" aria-hidden="true" /><span className="phone-glyphs">{status}</span></p>
        {children}
      </div>
    </figure>
  )
}

const Signature = ({ className }: { className?: string }) => (
  <svg className={className ?? 'signature'} viewBox="0 0 220 56" aria-hidden="true"><path d="M8 44c10-6 22-26 30-30 6-3-4 22 0 24 6 2 14-22 20-22 5 0-2 18 4 18 8 0 14-12 22-12 7 0 2 10 10 9 20-2 60-12 118-24" fill="none" stroke="#0e1630" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
export { Signature }

/** 08 · The operator's QR fault on Press 3 and Keisha's offline round: the page's only phone screens, with work 4480 between them. */
export function Floor() {
  return (
    <Section id="floor" align="center" eyebrow="Floor · Tue Oct 20, 6:12 – 7:41 am" title="A scan at the press. A round with no signal." lead="Luis scans Press 3’s tag to report a leak, and Devon has it running 47 minutes later. Keisha’s round saves in a dead zone and syncs when she walks out.">
      <div className="floor">
        <Phone className="phone-luis" time="6:59" label="Luis Ramirez's request on his phone at 6:59 am" status={<><Bars /><Wifi /><Battery /></>}>
          <p className="lang" role="group" aria-label="Language"><span className="lang-on">English</span><span>Español</span></p>
          <p className="ph-card ph-asset"><QrCode /><b>Press 3 · 400-ton · Line A</b></p>
          <div className="ph-card ph-question">
            <p className="ph-q">Is the line stopped?</p>
            <p className="ph-choice"><span>No</span><span className="ph-yes">Yes</span></p>
          </div>
          <ClampPhoto />
          <p className="ph-card ph-text">Die clamp leaking, left side</p>
          <p className="ph-meta">Submitted 6:12 am · R-2291</p>
          <ol className="ph-track">
            <li><CheckDisc tone="blue" /><span><b>Acknowledged</b>6:16</span></li>
            <li><CheckDisc /><span><b>Resolved</b><em>6:59 am ✓</em></span></li>
          </ol>
        </Phone>
        <article className="card wo4480" aria-labelledby="wo4480-title">
          <h3 id="wo4480-title" className="wo-title"><AlertDisc />Work 4480 · urgent</h3>
          <ol className="wo-people">
            <li><Avatar initials="RK" /><p><b>6:16</b> · <b>Ray Kowalski</b> converts R-2291 to urgent work 4480 for Devon Harris</p></li>
            <li><Avatar initials="DH" /><p><b>6:17</b> · <b>Devon Harris</b> acknowledges</p></li>
          </ol>
          <p className="wo-down"><Clock />Downtime 6:12–6:59 = 47 min</p>
          <p className="wo-row"><Clipboard />Fitting seal replaced · 0.250 drum AW-46 issued to 4480</p>
          <p className="wo-finding"><Hose /><span><b>Finding:</b> clamp supply hose chafed at bolster → follow-up work 4481 · Sat Oct 24</span></p>
        </article>
        <Phone className="phone-keisha" time="7:41" label="Keisha Johnson's round on her phone at 7:41 am" status={<><span className="when-offline"><SignalOff /></span><span className="when-synced"><Bars /><Wifi /></span><Battery /></>}>
          <p className="ph-banner"><span className="when-offline"><SignalOff />No signal · saved on this phone</span><span className="when-synced"><Wifi />Back in signal · synced</span></p>
          <div className="ph-card ph-round">
            <p className="ph-round-title"><b>PM 4463 · compressor room round</b><span>4 of 4 stops</span></p>
            <dl className="ph-readings">
              <div><dt>Discharge</dt><dd>125 psi</dd></div>
              <div><dt>Oil temp</dt><dd>188 °F</dd></div>
              <div><dt>Outboard vibration (handheld)</dt><dd>0.37 in/s</dd></div>
            </dl>
          </div>
          <p className="ph-thumbs"><CompressorPhoto /><GaugePhoto /><MotorPhoto /></p>
          <p className="ph-card ph-sign"><Signature /></p>
          <p className="ph-line"><Cloud /><span className="when-offline">27 waiting to sync</span><span className="when-synced">27 of 27 synced</span></p>
          <p className="ph-line"><Cube />Parts as of 6:58 am (snapshot)</p>
          <p className="ph-toast" role="status"><CheckDisc /><span><b>Synced 7:41 am · 27 of 27</b> · 0 conflicts ✓ · reading added to 4471</span></p>
        </Phone>
      </div>
    </Section>
  )
}
