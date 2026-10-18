import { AlertDisc, Battery, Bars, CheckDisc, Clipboard, Clock, Cloud, Cube, Hose, QrCode, SignalOff, Wifi } from '../icons'
import { Avatar, Section } from '../parts'
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

/** Luis's photo of the leak: the left die clamp on Press 3 with oil at its supply fitting. */
const ClampPhoto = () => (
  <svg className="photo" viewBox="0 0 320 190" role="img" aria-label="Photo: the left die clamp on Press 3, oil dripping from its supply fitting">
    <rect width="320" height="190" fill="#c9d0db" />
    <path d="M0 132h320v58H0z" fill="#9aa3b2" /><path d="M0 132h320" stroke="#5d6576" strokeWidth="2" />
    {[24, 88, 152, 216, 280].map(xx => <rect key={xx} x={xx} y="146" width="40" height="30" rx="3" fill="#7d8697" stroke="#5d6576" strokeWidth="1.5" />)}
    <rect x="18" y="20" width="56" height="112" fill="#aab2c0" stroke="#5d6576" strokeWidth="2" /><rect x="246" y="20" width="56" height="112" fill="#aab2c0" stroke="#5d6576" strokeWidth="2" />
    <rect x="112" y="34" width="118" height="80" rx="6" fill="#d9632c" stroke="#7a3412" strokeWidth="2.5" />
    <rect x="128" y="18" width="86" height="22" rx="4" fill="#e07a45" stroke="#7a3412" strokeWidth="2.5" />
    <circle cx="198" cy="74" r="13" fill="#b9501f" stroke="#7a3412" strokeWidth="2.5" /><circle cx="198" cy="74" r="5" fill="#4a5060" />
    <path d="M0 64h86M0 94h86" stroke="#2c3140" strokeWidth="13" strokeLinecap="round" />
    <rect x="80" y="54" width="34" height="20" rx="3" fill="#d6a12f" stroke="#7a5a10" strokeWidth="2" /><rect x="80" y="84" width="34" height="20" rx="3" fill="#d6a12f" stroke="#7a5a10" strokeWidth="2" />
    <path d="M100 105c0 6-4 11-4 15a4 4 0 0 0 8 0c0-4-4-9-4-15z" fill="#e8a317" stroke="#8a5b06" strokeWidth="1.5" />
    <path d="M97 132c4 4 12 4 16 0" stroke="#e8a317" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>
)
const CompressorPhoto = () => (
  <svg className="thumb" viewBox="0 0 120 120" role="img" aria-label="Photo: AC-02">
    <rect width="120" height="120" fill="#d4dae4" /><path d="M0 92h120v28H0z" fill="#aab2c0" />
    <rect x="14" y="40" width="58" height="50" rx="6" fill="#7f95b3" stroke="#3d4a60" strokeWidth="2" /><path d="M24 40V28h20v12" fill="none" stroke="#3d4a60" strokeWidth="3" />
    <rect x="70" y="52" width="36" height="34" rx="5" fill="#c8693a" stroke="#6e3215" strokeWidth="2" />{[58, 64, 70, 76].map(yy => <path key={yy} d={`M74 ${yy}h28`} stroke="#6e3215" strokeWidth="1.5" />)}
    <path d="M10 92h100" stroke="#3d4a60" strokeWidth="3" />
  </svg>
)
const GaugePhoto = () => (
  <svg className="thumb" viewBox="0 0 120 120" role="img" aria-label="Photo: the discharge gauge at 125 psi">
    <rect width="120" height="120" fill="#cfd6e1" /><rect x="52" y="96" width="16" height="24" fill="#c99a2e" stroke="#6f5410" strokeWidth="2" />
    <circle cx="60" cy="56" r="44" fill="#eef1f6" stroke="#3d4a60" strokeWidth="5" />
    {Array.from({ length: 21 }, (_, i) => { const a = (-225 + i * 13.5) * Math.PI / 180, r1 = i % 5 ? 33 : 29; return <line key={i} x1={60 + Math.cos(a) * r1} y1={56 + Math.sin(a) * r1} x2={60 + Math.cos(a) * 37} y2={56 + Math.sin(a) * 37} stroke="#3d4a60" strokeWidth={i % 5 ? 1.2 : 2.4} /> })}
    <path d="M60 56 75.5 32.8" stroke="#d9561f" strokeWidth="3.4" strokeLinecap="round" /><circle cx="60" cy="56" r="5" fill="#3d4a60" />
  </svg>
)
const MotorPhoto = () => (
  <svg className="thumb" viewBox="0 0 120 120" role="img" aria-label="Photo: the motor's outboard end">
    <rect width="120" height="120" fill="#d4dae4" /><path d="M0 94h120v26H0z" fill="#aab2c0" />
    <rect x="22" y="34" width="62" height="56" rx="10" fill="#c8693a" stroke="#6e3215" strokeWidth="2.5" />{[44, 52, 60, 68, 76].map(yy => <path key={yy} d={`M26 ${yy}h54`} stroke="#8f421b" strokeWidth="2" />)}
    <rect x="84" y="50" width="20" height="24" rx="4" fill="#7f95b3" stroke="#3d4a60" strokeWidth="2" /><path d="M104 62h12" stroke="#3d4a60" strokeWidth="5" />
    <path d="M18 90h72" stroke="#3d4a60" strokeWidth="3" />
  </svg>
)
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
