import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { Hero } from './Hero'
import { Bearings } from './sections/Bearings'
import { Closing } from './sections/Closing'
import { Detect } from './sections/Detect'
import { Floor } from './sections/Floor'
import { Interlude } from './sections/Interlude'
import { MoveIn } from './sections/MoveIn'
import { Pm } from './sections/Pm'
import { Report } from './sections/Report'
import { Shutdown } from './sections/Shutdown'
import { Stage } from './sections/Stage'
import { Stores } from './sections/Stores'
import { Timeline } from './sections/Timeline'
import '../style'

/** Gasket's homepage on its run site (run-gasket.com): one failing bearing at Hollis's Dayton plant, first warning to first shift. */
export function Landing() {
  return (
    <div className="site">
      <SiteHeader />
      <main id="main" className="landing">
        <Hero />
        <Timeline />
        <Detect />
        <Stage />
        <Bearings />
        <Interlude />
        <Pm />
        <Floor />
        <Stores />
        <Shutdown />
        <Report />
        <MoveIn />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  )
}

/** Keisha's phone reconnects a moment after it scrolls into view: the banner, status bar and queue switch to synced and the toast rises. */
export const landingScript = "(()=>{const p=document.querySelector('.phone-keisha');if(!p||!('IntersectionObserver' in window))return;const quick=matchMedia('(prefers-reduced-motion: reduce)').matches;const o=new IntersectionObserver(e=>{if(e.some(x=>x.isIntersecting)){o.disconnect();setTimeout(()=>p.classList.add('is-synced'),quick?0:2200)}},{threshold:.5});o.observe(p)})()"
