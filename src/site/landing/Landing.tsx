import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { Closing } from './Closing'
import { Hero } from './Hero'
import { Board, Free, Included, MoveIn, Parts, Story } from './Sections'
import '../style'

/** Gasket's homepage on its run site (run-gasket.com). */
export function Landing() {
  return (
    <div className="site">
      <SiteHeader />
      <main id="main" className="landing">
        <Hero />
        <Free />
        <Story />
        <Board />
        <Parts />
        <MoveIn />
        <Included />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  )
}
