import { Actions } from '../shell/Actions'
import { Calendar, CheckDisc, Forklift, Package, QrCode, Thermometer } from './icons'
import type { ReactNode } from 'react'

/** One of the six records pinned to its place on the plant map (the leader dots are in the painting). */
function Pin({ place, icon, title, children }: { place: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className={`pin pin-${place}`}>
      <span className="pin-icon">{icon}</span>
      <div>
        <p className="pin-title">{title}</p>
        <p className="pin-body">{children}</p>
      </div>
    </li>
  )
}

/**
 * The hero: the Dayton plant from above on a first-shift morning (the approved
 * painting, its copy and cards rebuilt here as HTML at their painted places).
 * Under 1200px the copy comes first, then a crop of the presses, then the six
 * records as a list.
 */
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-map">
        <picture className="hero-art">
          <source media="(max-width: 599px)" type="image/avif" srcSet="/site/hero-phone-840.avif" width={840} height={560} />
          <source media="(max-width: 599px)" type="image/webp" srcSet="/site/hero-phone-840.webp" width={840} height={560} />
          <source media="(max-width: 1199px)" type="image/avif" srcSet="/site/hero-wide-1020.avif" width={1020} height={310} />
          <source media="(max-width: 1199px)" type="image/webp" srcSet="/site/hero-wide-1020.webp" width={1020} height={310} />
          <source type="image/avif" srcSet="/site/hero-768.avif 768w, /site/hero-1152.avif 1152w, /site/hero-1536.avif 1536w" sizes="100vw" />
          <source type="image/webp" srcSet="/site/hero-768.webp 768w, /site/hero-1152.webp 1152w, /site/hero-1536.webp 1536w" sizes="100vw" />
          <img src="/site/hero-1536.webp" width={1536} height={965} alt="The Dayton plant from above at the start of first shift: the compressor room, the storeroom, four copper stamping presses with QR tags, the powder-coat cure oven, the loading dock with a forklift and the time-clock entrance, joined by blue aisle routes." fetchPriority="high" decoding="async" />
        </picture>
        <div className="hero-panel">
          <h1 id="hero-title">Ready for first shift.</h1>
          <p className="hero-sub">Gasket turns operator requests, PM schedules and sensor readings into work with parts and people, keeps technicians working offline, and spots failing machines before breakdown.</p>
          <p className="hero-alt">100% free, open source alternative to <strong>MaintainX</strong>, <strong>UpKeep</strong> and <strong>Fiix</strong></p>
          <Actions />
        </div>
        <ul className="pins" aria-label="This morning at the Dayton plant">
          <Pin place="press" icon={<QrCode />} title="Press 3 · 400-ton · QR fault">from Luis Ramirez 6:12 am · die clamp leaking → work 4480</Pin>
          <Pin place="compressor" icon={<CheckDisc tone="blue" />} title="Compressor room">no signal → Keisha Johnson's checklist saved offline, synced 7:41 am ✓</Pin>
          <Pin place="oven" icon={<Thermometer />} title="Cure oven">392 °F from OPC UA · within limits</Pin>
          <Pin place="forklift" icon={<Forklift />} title="Forklift FL-07">Samsara 4,012 engine hrs → 250-hr PM generated</Pin>
          <Pin place="storeroom" icon={<Package />} title="Storeroom">AW-46 hydraulic oil below 4 drums → PO 1187 drafted, $2,756.00</Pin>
          <Pin place="october" icon={<Calendar />} title="October">PM on time 96% · 3 requests awaiting triage</Pin>
        </ul>
      </div>
    </section>
  )
}
